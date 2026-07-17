/**
 * Hybrid retrieval over the committed vault index (src/data/brain-index.json).
 *
 * BM25 and vector search run over the same chunks and are fused with
 * reciprocal rank fusion. The notes are dense with proper nouns (Instinct,
 * Axon, PARA, Fujifilm) that embeddings blur and BM25 nails; broad "what do
 * you think about X" questions go the other way. Fusing both is the whole
 * point of this module.
 *
 * The index is brute-forced in memory: ~75 chunks x 1536 dims is well under
 * 10ms. No vector database.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, '..', '..', 'src', 'data', 'brain-index.json');

const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/embeddings';
const RRF_K = 60;

let _index = null;

export function loadIndex() {
  if (_index) return _index;
  if (!existsSync(indexPath)) return null;
  try {
    _index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (e) {
    console.warn('[retrieve] failed to load brain-index.json:', e.message);
    return null;
  }
  return _index;
}

function tokenize(text) {
  return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);
}

// ---------- scoring ----------

function bm25Score(index, chunk, terms) {
  const { N, avgdl, df } = index.bm25;
  const k1 = 1.2, b = 0.75;
  let score = 0;
  for (const t of terms) {
    const f = chunk.tf[t];
    if (!f) continue;
    const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
    score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * chunk.dl / avgdl));
  }
  return score;
}

// Query embedding via the same Gemini model/dims as the index. Vectors in the
// index are unit-normalized at build time, so cosine is a plain dot product.
async function embedQuery(apiKey, query, index) {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: index.embedModel, input: [query], dimensions: index.embedDims })
  });
  if (!res.ok) throw new Error(`embed query: ${res.status}`);
  const data = await res.json();
  const vec = data.data[0].embedding;
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ---------- filters ----------

function applyFilters(chunks, { tag, afterDate, type }) {
  let out = chunks;
  if (tag) {
    const t = String(tag).toLowerCase();
    out = out.filter(c => c.tags.some(x => x.toLowerCase() === t));
  }
  if (type) {
    const ty = String(type).toLowerCase();
    out = out.filter(c => c.type === ty);
  }
  if (afterDate && /^\d{4}(-\d{2}){0,2}$/.test(afterDate)) {
    out = out.filter(c => (c.updated || c.created || '') >= afterDate);
  }
  return out;
}

// ---------- public API ----------

/**
 * Hybrid search. Returns up to k chunks, RRF-fused across BM25 and vector
 * rankings, shaped for direct injection as tool results.
 * Vector search silently degrades to BM25-only if embeddings are missing or
 * the query embed fails — retrieval must never take the chat down.
 */
export async function searchNotes({ query, tag, afterDate, type, k = 6, apiKey }) {
  const index = loadIndex();
  if (!index) return { error: 'knowledge index unavailable' };

  const candidates = applyFilters(index.chunks, { tag, afterDate, type });
  if (!candidates.length) return { results: [], note: 'no notes match those filters' };

  const terms = tokenize(query || '');
  const bmRanked = terms.length
    ? candidates.map(c => [bm25Score(index, c, terms), c])
        .filter(([s]) => s > 0)
        .sort((a, b) => b[0] - a[0])
        .map(([, c]) => c)
    : [];

  let vecRanked = [];
  if (query && apiKey && candidates.some(c => Array.isArray(c.embedding))) {
    try {
      const qv = await embedQuery(apiKey, query, index);
      vecRanked = candidates
        .filter(c => Array.isArray(c.embedding))
        .map(c => [dot(qv, c.embedding), c])
        .sort((a, b) => b[0] - a[0])
        .map(([, c]) => c);
    } catch (e) {
      console.warn('[retrieve] query embed failed, BM25 only:', e.message);
    }
  }

  // Reciprocal rank fusion across both rankings.
  const fused = new Map();
  for (const ranked of [bmRanked, vecRanked]) {
    ranked.forEach((chunk, rank) => {
      fused.set(chunk.id, (fused.get(chunk.id) || 0) + 1 / (RRF_K + rank + 1));
    });
  }
  const top = [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id]) => index.chunks.find(c => c.id === id));

  return {
    results: top.map(c => ({
      title: c.title,
      heading: c.heading || undefined,
      type: c.type,
      status: c.status,
      created: c.created,
      updated: c.updated,
      tags: c.tags,
      text: c.text
    }))
  };
}

/**
 * Aggregate counting — the question shape top-k structurally cannot answer
 * ("how many times have you written about X"). Counts distinct NOTES (not
 * chunks), requiring every content-bearing query term to appear in the note
 * so partial-term noise doesn't inflate the count. Synthesis notes are
 * excluded: they summarize other notes and would double-count.
 */
export function countNotes({ query, tag }) {
  const index = loadIndex();
  if (!index) return { error: 'knowledge index unavailable' };

  let chunks = index.chunks.filter(c => c.type !== 'synthesis');
  if (tag) {
    const t = String(tag).toLowerCase();
    chunks = chunks.filter(c => c.tags.some(x => x.toLowerCase() === t));
  }

  const terms = tokenize(query || '');
  const files = new Map();
  for (const chunk of chunks) {
    if (terms.length && !terms.every(t => chunk.tf[t])) continue;
    if (!files.has(chunk.file)) files.set(chunk.file, chunk.title);
  }

  // Conjunctive matching over chunks can miss notes whose terms straddle a
  // chunk boundary; with whole-note chunks dominating this vault that's rare
  // enough to accept for a count.
  return { count: files.size, titles: [...files.values()] };
}
