/**
 * Vault indexer — builds the committed search index for the second-brain chat KB.
 *
 * Pipeline (all build time, request time never embeds or synthesizes):
 *   1. Walk content/second-brain, parse frontmatter, chunk by ## heading
 *      (whole note stays one chunk under ~300 words), prepend
 *      title/tags/dates/status into each chunk's text.
 *   2. Synthesis pass: group notes by MOC, by tag, and by year; Gemini
 *      Flash-Lite writes a first-person summary note per group, indexed as
 *      type: synthesis. Cached by group content hash — a rebuild only
 *      regenerates groups whose member notes changed.
 *   3. Embed every chunk with gemini-embedding-001 (cached by chunk hash).
 *   4. Build BM25 term stats over the same chunks in the same pass.
 *
 * Output: src/data/brain-index.json (committed).
 *
 * Without a Gemini key the index is still written (BM25 works; new/changed
 * chunks get embedding: null and changed synthesis groups are skipped) so the
 * script is safe to run anywhere, including CI.
 *
 * Key lookup order: GEMINI_API_KEY env var, then gemini-config.js at repo root
 * (gitignored, same pattern as music-config.js) exporting { apiKey }.
 * Tip: `set -a && source .env.local && set +a` before running locally.
 *
 * Usage: node build/index-vault.js   (or: npm run index)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const vaultDir = join(rootDir, 'content', 'second-brain');
const outPath = join(rootDir, 'src', 'data', 'brain-index.json');

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/embeddings';
// gemini-embedding-001 defaults to 3072 dims; 1536 (MRL-truncated) halves the
// index size with negligible quality loss. Truncated vectors are NOT unit-length,
// so we re-normalize below — cosine at query time is then a plain dot product.
const EMBED_DIMS = 1536;

const CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const SYNTH_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
// Part of every group's cache hash — bump to force full synthesis regeneration
// after changing the synthesis prompt.
const SYNTH_PROMPT_VERSION = 'v1';

const SINGLE_CHUNK_MAX_WORDS = 300;
const EXCLUDE_FILES = new Set(['AGENTS.md', 'CLAUDE.md']);

// ---------- vault walking ----------

function walkVault(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walkVault(full));
    else if (entry.endsWith('.md') && !EXCLUDE_FILES.has(entry)) files.push(full);
  }
  return files;
}

// ---------- parsing ----------

// Minimal YAML frontmatter parser: flat string values plus [a, b] inline lists.
// The vault schema (see content/second-brain/AGENTS.md) never nests deeper.
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, valueRaw] = kv;
    const value = valueRaw.replace(/\s+#.*$/, '').trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      meta[key] = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    } else {
      meta[key] = value;
    }
  }
  return { meta, body: raw.slice(match[0].length) };
}

// [[Target|display]] -> display, [[Target]] -> Target. Chunks are read by the
// retriever and the model as plain text; link syntax is noise to both.
function stripWikilinks(text) {
  return text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
             .replace(/\[\[([^\]]+)\]\]/g, '$1');
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function sha1(s) {
  return createHash('sha1').update(s).digest('hex');
}

// Load every note with its metadata, cleaned body, and outgoing wikilink
// targets (the link graph drives the MOC synthesis groups).
function loadNotes(files) {
  const notes = [];
  for (const file of files) {
    const rel = relative(vaultDir, file);
    const { meta, body } = parseFrontmatter(readFileSync(file, 'utf8'));
    const links = [...body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(m => m[1].trim());
    const clean = stripWikilinks(body).trim();
    if (!clean) continue;
    notes.push({
      rel,
      meta,
      clean,
      links,
      title: meta.title || rel.replace(/\.md$/, ''),
      tags: Array.isArray(meta.tags) ? meta.tags : []
    });
  }
  return notes;
}

// ---------- chunking ----------

// Split a note body into { heading, text } sections on ## headings.
function splitSections(body) {
  const lines = body.split('\n');
  const sections = [];
  let heading = '';
  let buf = [];
  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) sections.push({ heading, text });
    buf = [];
  };
  for (const line of lines) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) { flush(); heading = h[1].trim(); continue; }
    buf.push(line);
  }
  flush();
  return sections;
}

// The chunk header the model actually sees — dates and status ride inside the
// text so the model can reason about recency and trust, not just metadata.
function chunkHeader(meta) {
  const tags = Array.isArray(meta.tags) ? meta.tags.join(', ') : (meta.tags || '');
  return [
    `TITLE: ${meta.title || ''}`,
    `TAGS: ${tags}`,
    `TYPE: ${meta.type || ''} | STATUS: ${meta.status || ''}`,
    `CREATED: ${meta.created || ''} | UPDATED: ${meta.updated || ''}`
  ].join('\n');
}

function buildChunks(notes) {
  const chunks = [];
  for (const note of notes) {
    const whole = wordCount(note.clean) <= SINGLE_CHUNK_MAX_WORDS;
    const sections = whole ? [{ heading: '', text: note.clean }] : splitSections(note.clean);
    for (const section of sections) {
      const headingLine = section.heading ? `\n## ${section.heading}` : '';
      const text = `${chunkHeader(note.meta)}${headingLine}\n\n${section.text}`;
      chunks.push({
        id: sha1(`${note.rel}#${section.heading}`).slice(0, 12),
        file: note.rel,
        title: note.title,
        heading: section.heading || null,
        tags: note.tags,
        type: note.meta.type || 'evergreen',
        status: note.meta.status || 'seed',
        created: note.meta.created || null,
        updated: note.meta.updated || null,
        text,
        hash: sha1(text)
      });
    }
  }
  return chunks;
}

// ---------- synthesis pass ----------

// Most "understand me" questions aren't answered by any single note. These
// groups get a first-person summary written across their member notes.
function buildGroups(notes) {
  const byTitle = new Map(notes.map(n => [n.title, n]));
  const groups = [];
  const seenMemberSets = new Set();
  const memberKey = members => members.map(n => n.rel).sort().join('|');

  const push = (group) => {
    const key = memberKey(group.members);
    if (seenMemberSets.has(key)) return; // identical member set already grouped
    seenMemberSets.add(key);
    groups.push(group);
  };

  // By MOC: the MOC plus everything it links to plus everything linking to it.
  for (const moc of notes.filter(n => n.meta.type === 'moc')) {
    const members = new Set([moc]);
    for (const target of moc.links) {
      const linked = byTitle.get(target);
      if (linked) members.add(linked);
    }
    for (const note of notes) {
      if (note.links.includes(moc.title)) members.add(note);
    }
    if (members.size >= 3) {
      push({
        kind: 'moc',
        label: moc.title.replace(/\s*MOC$/i, ''),
        tags: moc.tags.filter(t => t !== 'mocs'),
        members: [...members]
      });
    }
  }

  // By tag: every tag carried by 3+ notes.
  const tagMap = new Map();
  for (const note of notes) {
    for (const tag of note.tags) {
      if (tag === 'mocs') continue;
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag).push(note);
    }
  }
  for (const [tag, members] of tagMap) {
    if (members.length >= 3) push({ kind: 'tag', label: tag, tags: [tag], members });
  }

  // By year created: what I was thinking about that year.
  const yearMap = new Map();
  for (const note of notes) {
    const year = String(note.meta.created || '').slice(0, 4);
    if (!/^\d{4}$/.test(year)) continue;
    if (!yearMap.has(year)) yearMap.set(year, []);
    yearMap.get(year).push(note);
  }
  for (const [year, members] of yearMap) {
    if (members.length >= 3) push({ kind: 'year', label: year, tags: [], members });
  }

  return groups;
}

function groupTitle(group) {
  if (group.kind === 'year') return `What I was thinking about in ${group.label}`;
  if (group.kind === 'tag') return `Across my notes on ${group.label}`;
  return `How I think about ${group.label}`;
}

// Reuse synthesis text from the previous index when the group's members are
// byte-identical — keyed by srcHash so any member edit regenerates the group.
function loadSynthCache() {
  if (!existsSync(outPath)) return new Map();
  try {
    const prev = JSON.parse(readFileSync(outPath, 'utf8'));
    return new Map((prev.chunks || [])
      .filter(c => c.type === 'synthesis' && c.srcHash && c.text)
      .map(c => [c.srcHash, c.text]));
  } catch (e) {
    return new Map();
  }
}

async function generateSynthesisBody(apiKey, group) {
  const label = group.kind === 'year'
    ? `what I was focused on and thinking about in ${group.label}`
    : group.kind === 'tag'
      ? `everything in my notes tagged "${group.label}"`
      : `${group.label}`;

  const system = `You are Luke, summarizing your own notes for your public knowledge base. Write ONE synthesis note in Luke's first person voice, drawing ONLY on the notes provided. Rules:
- 150 to 250 words, plain prose paragraphs. No markdown headings, no bullet lists.
- State positions plainly, the way the notes do. Keep Luke's contractions and directness.
- No em dashes anywhere. Use commas, periods, or colons instead.
- Never invent a fact, name, number, or date that is not in the notes.
- Spell out proper nouns so the note stands alone (say "Instinct, the veterinary software company", not "the company").
- Mention dates from the notes when they matter to how current a take is.
Return only the note text, nothing else.`;

  let corpus = group.members
    .map(n => `NOTE: ${n.title} (created ${n.meta.created || '?'}, updated ${n.meta.updated || '?'}, status ${n.meta.status || '?'})\n${n.clean}`)
    .join('\n\n---\n\n');
  if (corpus.length > 24000) corpus = corpus.slice(0, 24000);

  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: SYNTH_MODEL,
      temperature: 0.4,
      max_tokens: 600,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Topic: ${label}\n\nMy notes:\n\n${corpus}` }
      ]
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`synthesis API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('synthesis: empty completion');
  return text;
}

async function buildSynthesisChunks(notes) {
  const groups = buildGroups(notes);
  const cache = loadSynthCache();
  const chunks = [];
  let generated = 0, reused = 0, skipped = 0;
  let apiKey;

  for (const group of groups) {
    const dates = group.members.map(n => n.meta.created).filter(Boolean).sort();
    const updates = group.members.map(n => n.meta.updated).filter(Boolean).sort();
    const meta = {
      title: groupTitle(group),
      tags: [...group.tags, 'synthesis'],
      type: 'synthesis',
      status: 'settled',
      created: dates[0] || null,
      updated: updates[updates.length - 1] || null
    };
    const srcHash = sha1([
      SYNTH_PROMPT_VERSION,
      group.kind,
      group.label,
      ...group.members.map(n => sha1(n.clean)).sort()
    ].join('|'));

    let text = cache.get(srcHash);
    if (text) {
      reused++;
    } else {
      apiKey = apiKey !== undefined ? apiKey : await loadApiKey();
      if (!apiKey) { skipped++; continue; }
      const body = await generateSynthesisBody(apiKey, group);
      text = `${chunkHeader(meta)}\nSYNTHESIS across ${group.members.length} notes\n\n${body}`;
      generated++;
    }

    chunks.push({
      id: sha1(`synthesis:${group.kind}:${group.label}`).slice(0, 12),
      file: `synthesis/${group.kind}/${group.label}`,
      title: meta.title,
      heading: null,
      tags: meta.tags,
      type: 'synthesis',
      status: 'settled',
      created: meta.created,
      updated: meta.updated,
      text,
      hash: sha1(text),
      srcHash
    });
  }

  if (skipped) console.warn(`  ⚠ synthesis: ${skipped} group(s) skipped (no Gemini key and not cached)`);
  console.log(`  synthesis: ${chunks.length} notes (${generated} generated, ${reused} cached) from ${groups.length} groups`);
  return chunks;
}

// ---------- BM25 ----------

function tokenize(text) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);
}

function buildBm25(chunks) {
  const df = {};
  let totalLen = 0;
  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text);
    const tf = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
    for (const t of Object.keys(tf)) df[t] = (df[t] || 0) + 1;
    chunk.tf = tf;
    chunk.dl = tokens.length;
    totalLen += tokens.length;
  }
  return { N: chunks.length, avgdl: chunks.length ? totalLen / chunks.length : 0, df };
}

// ---------- embeddings ----------

async function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const configPath = join(rootDir, 'gemini-config.js');
  if (existsSync(configPath)) {
    try {
      const mod = await import(pathToFileURL(configPath).href);
      const config = mod.default || mod;
      return config.apiKey || config.GEMINI_API_KEY || null;
    } catch (e) {
      console.warn(`  ⚠ could not read gemini-config.js: ${e.message}`);
    }
  }
  return null;
}

function loadEmbeddingCache() {
  if (!existsSync(outPath)) return new Map();
  try {
    const prev = JSON.parse(readFileSync(outPath, 'utf8'));
    return new Map((prev.chunks || [])
      .filter(c => c.hash && Array.isArray(c.embedding))
      .map(c => [c.hash, c.embedding]));
  } catch (e) {
    return new Map();
  }
}

function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => Number((v / norm).toFixed(5)));
}

async function embedBatch(apiKey, texts) {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMS })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`embeddings API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.data
    .sort((a, b) => a.index - b.index)
    .map(d => normalize(d.embedding));
}

async function addEmbeddings(chunks) {
  const cache = loadEmbeddingCache();
  let reused = 0;
  const pending = [];
  for (const chunk of chunks) {
    const cached = cache.get(chunk.hash);
    if (cached) { chunk.embedding = cached; reused++; }
    else pending.push(chunk);
  }

  if (!pending.length) {
    console.log(`  embeddings: all ${reused} reused from cache`);
    return true;
  }

  const apiKey = await loadApiKey();
  if (!apiKey) {
    for (const chunk of pending) chunk.embedding = null;
    console.warn(`  ⚠ no Gemini key (env GEMINI_API_KEY or gemini-config.js) — ${pending.length} chunk(s) written without embeddings (${reused} reused). BM25 still works; re-run with a key to fill vectors.`);
    return false;
  }

  // The Gemini embeddings endpoint caps batches at 100 inputs per request.
  for (let i = 0; i < pending.length; i += 100) {
    const batch = pending.slice(i, i + 100);
    const vectors = await embedBatch(apiKey, batch.map(c => c.text));
    batch.forEach((chunk, j) => { chunk.embedding = vectors[j]; });
  }
  console.log(`  embeddings: ${pending.length} embedded, ${reused} reused`);
  return true;
}

// ---------- main ----------

export async function indexVault() {
  if (!existsSync(vaultDir)) {
    console.warn('  ⚠ vault not found at content/second-brain — skipping index');
    return;
  }
  const files = walkVault(vaultDir);
  const notes = loadNotes(files);
  const chunks = buildChunks(notes);
  chunks.push(...await buildSynthesisChunks(notes));
  const bm25 = buildBm25(chunks);
  const complete = await addEmbeddings(chunks);

  const index = {
    generatedAt: new Date().toISOString(),
    embedModel: EMBED_MODEL,
    embedDims: EMBED_DIMS,
    embeddingsComplete: complete,
    bm25,
    chunks
  };
  writeFileSync(outPath, JSON.stringify(index));
  const kb = Math.round(statSync(outPath).size / 1024);
  console.log(`✓ brain-index.json: ${notes.length} notes → ${chunks.length} chunks (${kb} KB)`);
}

// Run directly (not imported)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  indexVault().catch(e => { console.error('index-vault failed:', e); process.exit(1); });
}
