/**
 * KB gap auto-resolve — re-checks every open gap against the *current* vault
 * index and clears the ones that no longer belong on the list.
 *
 * Why this exists: `chat:gaps` is append-only-until-resolved. api/chat.js writes
 * a gap the moment a question misses, and nothing ever re-examines it. Answer the
 * question in the vault and the gap keeps sitting there; the only thing that used
 * to clear it was a `Resolves-KB-Gap:` trailer on a merged PR, which relies on
 * whoever wrote the note remembering to add one.
 *
 * So: after an index rebuild, ask the same retrieval the live chat uses whether
 * each open gap is now answerable, and resolve the ones that are.
 *
 * Pipeline:
 *   1. GET /api/chat-insights → the open gap list.
 *   2. For each gap, searchNotes() against the freshly written index — the exact
 *      retrieval path api/chat.js takes, so a "covered" verdict here means the
 *      chat really can find it.
 *   3. Gemini Flash-Lite judges each gap's retrieved chunks: COVERED (the notes
 *      answer it), OUT_OF_SCOPE (out-of-scope.md says never to engage), or OPEN.
 *   4. POST the COVERED + OUT_OF_SCOPE keys back to /api/chat-insights.
 *
 * The judge is deliberately strict — a wrongly-resolved gap is a question that
 * silently stops being tracked, which is worse than one that lingers a day.
 *
 * Skips cleanly (exit 0, no error) when CHAT_INSIGHTS_KEY or the Gemini key is
 * absent, so `npm run index` still works on a machine or CI runner without them.
 *
 * Usage:
 *   npm run index            → rebuild, then re-check gaps if the vault changed
 *   npm run gaps             → re-check now against the committed index
 *   npm run gaps -- --dry-run → report verdicts, resolve nothing
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { searchNotes } from '../api/_lib/retrieve.js';
import { loadApiKey } from './gemini-key.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outOfScopePath = join(rootDir, 'content', 'about', 'out-of-scope.md');

const CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const JUDGE_MODEL = process.env.GEMINI_CLASSIFY_MODEL || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const BASE_URL = (process.env.CHAT_INSIGHTS_URL || 'https://lukevz.com').replace(/\/$/, '');

// Chunks per gap handed to the judge. Matches the live chat's default k so the
// judge sees what the answering model would see.
const RETRIEVE_K = 6;
// Judge calls in flight. Gap lists run to single digits; this is politeness
// toward the rate limiter, not throughput tuning.
const CONCURRENCY = 4;

const VERDICTS = new Set(['COVERED', 'OUT_OF_SCOPE', 'OPEN']);

// ---------- insights API ----------

// limit=1 trims the question log out of the response — `gaps` is always returned
// in full (it's an hgetall, not a range), and we don't need the questions here.
async function fetchGaps(key) {
  const res = await fetch(`${BASE_URL}/api/chat-insights?key=${encodeURIComponent(key)}&limit=1`);
  if (!res.ok) throw new Error(`insights GET ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return Array.isArray(data.gaps) ? data.gaps : [];
}

async function postResolve(key, keys) {
  const res = await fetch(`${BASE_URL}/api/chat-insights?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolve: keys })
  });
  if (!res.ok) throw new Error(`insights POST ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ---------- judging ----------

function loadOutOfScope() {
  if (!existsSync(outOfScopePath)) return '';
  try {
    // Strip frontmatter and the HTML authoring comments; the rules are the lists.
    return readFileSync(outOfScopePath, 'utf8')
      .replace(/^---\n[\s\S]*?\n---\n?/, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim()
      .slice(0, 4000);
  } catch {
    return '';
  }
}

const JUDGE_SYSTEM = `You audit the to-do list for Luke's personal chatbot knowledge base.

A "gap" is a question a visitor asked that the chatbot could not answer at the time. Luke has since edited his notes. Your job: decide whether the gap should stay on the list.

You get the question and the notes his chatbot NOW retrieves for it. Output ONE JSON object, nothing else:
{"verdict":"COVERED|OUT_OF_SCOPE|OPEN","why":"one short sentence"}

- "COVERED": the retrieved notes contain enough for Luke's bot to give a real, substantive answer to this specific question.
- "OUT_OF_SCOPE": the question asks about something on the OUT OF SCOPE list. His bot is supposed to decline it, so it is not a gap to fill.
- "OPEN": anything else — no notes answer it, or the notes are only adjacent to the topic.

Be strict. Default to OPEN.
- Topically related is NOT covered. A question about his education is not answered by notes about his career.
- Partially covered is OPEN. "What university did you attend" needs the school, not "I worked at PwC".
- Malformed or nonsensical gaps (the question is a fragment, or is the bot's own clarifying question echoed back) are NOT real questions about Luke: answer COVERED with why "not a real question".
- Resolving a gap wrongly means Luke silently stops tracking a question people actually ask. When unsure, say OPEN.`;

async function judgeGap(apiKey, gap, results, outOfScope) {
  const notes = results.length
    ? results.map((r, i) => `[note ${i + 1}] ${r.title}${r.heading ? ` — ${r.heading}` : ''}\n${r.text}`).join('\n\n')
    : '(retrieval returned nothing)';

  const user = [
    outOfScope ? `OUT OF SCOPE LIST:\n${outOfScope}\n\n---\n` : '',
    `GAP QUESTION:\n${gap.suggestion || gap.topic}`,
    gap.examples?.length ? `\n\nHOW VISITORS ACTUALLY ASKED IT:\n${gap.examples.map(e => `- ${e}`).join('\n')}` : '',
    `\n\n---\nNOTES HIS BOT NOW RETRIEVES:\n\n${notes}`
  ].join('');

  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      max_tokens: 200,
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        { role: 'user', content: user }
      ]
    })
  });
  if (!res.ok) throw new Error(`judge API ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('judge: no json in response');
  const parsed = JSON.parse(match[0]);
  const verdict = VERDICTS.has(parsed.verdict) ? parsed.verdict : 'OPEN';
  return { verdict, why: String(parsed.why || '').slice(0, 200) };
}

// A judge that errors leaves the gap OPEN. Failing closed keeps a transient API
// blip from quietly emptying the to-do list.
async function checkGap(apiKey, gap, outOfScope) {
  const query = gap.suggestion || gap.topic || '';
  try {
    const found = await searchNotes({ query, k: RETRIEVE_K, apiKey });
    const results = found.results || [];
    const { verdict, why } = await judgeGap(apiKey, gap, results, outOfScope);
    return { gap, verdict, why, hits: results.length };
  } catch (e) {
    return { gap, verdict: 'OPEN', why: `check failed: ${e.message}`, hits: 0, failed: true };
  }
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

// ---------- main ----------

const ICON = { COVERED: '✓', OUT_OF_SCOPE: '⊘', OPEN: '·' };

/**
 * @param {object}  opts
 * @param {boolean} opts.indexChanged  false → skip entirely (nothing to re-check)
 * @param {boolean} opts.dryRun        true  → report verdicts, resolve nothing
 */
export async function resolveCoveredGaps({ indexChanged = true, dryRun = false } = {}) {
  if (!indexChanged) {
    console.log('  gap re-check: skipped (index content unchanged)');
    return { skipped: 'unchanged' };
  }

  const insightsKey = process.env.CHAT_INSIGHTS_KEY;
  if (!insightsKey) {
    console.log('  gap re-check: skipped (no CHAT_INSIGHTS_KEY — add it to .env.local to enable)');
    return { skipped: 'no-insights-key' };
  }

  const apiKey = await loadApiKey();
  if (!apiKey) {
    console.log('  gap re-check: skipped (no Gemini key)');
    return { skipped: 'no-gemini-key' };
  }

  let gaps;
  try {
    gaps = await fetchGaps(insightsKey);
  } catch (e) {
    console.warn(`  ⚠ gap re-check: could not read gap list — ${e.message}`);
    return { skipped: 'fetch-failed' };
  }

  if (!gaps.length) {
    console.log('  gap re-check: no open gaps');
    return { resolved: [], remaining: 0 };
  }

  console.log(`  gap re-check: ${gaps.length} open gap(s) against the new index…`);
  const outOfScope = loadOutOfScope();
  const checked = await mapLimited(gaps, CONCURRENCY, g => checkGap(apiKey, g, outOfScope));

  for (const { gap, verdict, why, hits } of checked) {
    console.log(`    ${ICON[verdict]} ${verdict.padEnd(12)} ${gap.key} (${hits} hits) — ${why}`);
  }

  const resolvable = checked.filter(c => c.verdict !== 'OPEN');
  if (!resolvable.length) {
    console.log('  gap re-check: nothing newly covered');
    return { resolved: [], remaining: gaps.length };
  }

  const keys = resolvable.map(c => c.gap.key);
  if (dryRun) {
    console.log(`  gap re-check: --dry-run, would resolve ${keys.length}: ${keys.join(', ')}`);
    return { resolved: [], wouldResolve: keys };
  }

  try {
    const out = await postResolve(insightsKey, keys);
    console.log(`  ✓ gap re-check: resolved ${keys.length}, ${out.remaining} still open`);
    return { resolved: keys, remaining: out.remaining };
  } catch (e) {
    console.warn(`  ⚠ gap re-check: resolve call failed — ${e.message}`);
    return { skipped: 'resolve-failed', wouldResolve: keys };
  }
}

// Run directly: always check, regardless of whether the index just changed.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  resolveCoveredGaps({ dryRun: process.argv.includes('--dry-run') })
    .catch(e => { console.error('check-gaps failed:', e); process.exit(1); });
}
