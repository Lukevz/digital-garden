/**
 * Vercel Serverless Function: AI Chat
 * Answers as Luke via Google Gemini (OpenAI-compatibility endpoint), grounded
 * in the second-brain vault index (src/data/brain-index.json) through an
 * agentic tool loop: the model calls search_notes / count_notes up to
 * MAX_TOOL_ROUNDS times, then answers. The final answer is emitted to the
 * client as OpenAI-style SSE so js/chat.js needs no changes.
 * Route: POST /api/chat
 * Body: { messages: [{ role: 'user'|'assistant', content: string }, ...] }
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHmac, timingSafeEqual } from 'crypto';
import { kv } from '@vercel/kv';
import { searchNotes, countNotes, loadIndex } from './_lib/retrieve.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const aboutDir = join(rootDir, 'content', 'about');
const conversationsPath = join(aboutDir, 'conversations.md');
const nowJsonPath = join(rootDir, 'src', 'data', 'now.json');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
// Classify uses the same model as the answer call — Flash-Lite is already the
// cheap tier, so there's no separate lite model to fall back to here.
// Override either independently with GEMINI_MODEL / GEMINI_CLASSIFY_MODEL if needed.
const CLASSIFY_MODEL = process.env.GEMINI_CLASSIFY_MODEL || MODEL;
const TEMPERATURE = 0.4;
const MAX_TURNS = 20;
// Exponential backoff for transient upstream throttling (429) / unavailability (503).
const RETRY_DELAYS_MS = [800, 1600, 3200];

// Agentic retrieval caps — the loop is what makes broad questions answerable,
// the caps are what keep a hostile prompt from spinning it.
const MAX_TOOL_ROUNDS = 5;
const MAX_ANSWER_TOKENS = 1000;
const TOOL_RESULT_MAX_CHARS = 6000;   // per tool call
const TOOL_CONTEXT_MAX_CHARS = 24000; // per turn, across all calls

// Hard daily ceiling on Gemini usage across ALL visitors (answer + classify),
// tracked in KV. When exceeded, visitors get a graceful in-voice message
// instead of an error. Resets at midnight UTC via key TTL.
const DAILY_TOKEN_CEILING = Number(process.env.CHAT_DAILY_TOKEN_CEILING || 2_000_000);
const TOKENS_KEY_PREFIX = 'chat:tokens:';

// KV keys — see api/chat-insights.js for the read side.
const Q_LOG_KEY = 'chat:questions'; // capped list of every visitor question
const Q_LOG_MAX = 1000;
const GAPS_KEY = 'chat:gaps';        // hash keyed by normalized topic → gap record
const LOG_TIMEOUT_MS = 4000;

// Per-IP rate limits. The system prompt tells the model to deflect free-assistant
// abuse, but that lives only in the prompt — a direct POST to /api/chat never sees
// it, and every request spends real Gemini tokens. These caps are the actual cost
// guard. Generous enough for a real conversation, brutal for a script hammering
// the endpoint in a loop.
const RATE_PER_MIN = 20;
const RATE_PER_DAY = 300;
const MAX_MESSAGES = 100; // reject absurdly large payloads before we do any work

// Cloudflare Turnstile bot gate. The first message of a session must carry a
// turnstileToken (js/chat.js fetches one on demand when it sees 403
// turnstile_required); a successful verify sets a signed HttpOnly cookie so
// the rest of the conversation skips the round trip. Unset secret = gate off
// (local dev without keys, and a safe rollback lever in prod).
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const PASS_COOKIE = 'chat_pass';
const PASS_TTL_S = 7200;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: "Search Luke's full notes vault (hybrid keyword + semantic). Returns note excerpts with dates, status, and tags. For broad questions call this several times with different phrasings and angles.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for, in natural language' },
          tag: { type: 'string', description: 'Optional flat tag filter, e.g. designsystems, gear, places, careers, ai' },
          after_date: { type: 'string', description: 'Optional YYYY-MM-DD; only notes updated on or after this date' },
          type: { type: 'string', enum: ['evergreen', 'project', 'person', 'source', 'log', 'moc', 'synthesis'], description: 'Optional note type filter. "synthesis" notes summarize whole topics and are best for broad "what do you think about X" questions.' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'count_notes',
      description: 'Count how many distinct notes match a query and/or tag, with their titles. Use for aggregate questions ("how many times have you written about X") instead of estimating.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Terms that must all appear in a note' },
          tag: { type: 'string', description: 'Optional flat tag filter' }
        }
      }
    }
  }
];

async function callGemini(apiKey, payload) {
  return fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

// Call Gemini, retrying on transient throttling (429) / unavailability (503)
// with exponential backoff. Returns the last response so the caller can inspect
// its status. Network errors bubble up after exhausting retries.
async function callGeminiWithRetry(apiKey, payload) {
  let lastErr;
  let res;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      res = await callGemini(apiKey, payload);
    } catch (e) {
      lastErr = e;
      continue; // network blip — back off and retry
    }
    if (res.status !== 429 && res.status !== 503) return res;
    // throttled / unavailable — back off and retry unless this was the last attempt
  }
  if (res) return res;
  throw lastErr || new Error('upstream fetch failed');
}

// Render /src/data/now.json — the single source of truth for the now strip —
// into a readable block so the bot can answer "what are you reading/watching/
// building right now?" with live values instead of redirecting.
function loadNowData() {
  if (!existsSync(nowJsonPath)) return '';
  try {
    const data = JSON.parse(readFileSync(nowJsonPath, 'utf8'));
    if (!data || !Array.isArray(data.items)) return '';
    const lines = data.items
      .filter(it => it && it.label && it.value)
      .map(it => `- ${it.label}: ${it.value}${it.note ? ` (${it.note})` : ''}`);
    if (!lines.length) return '';
    const asOf = data.updatedAt ? ` (as of ${data.updatedAt})` : '';
    return `### FILE: now-live.json\n\nWhat I'm currently focused on right now${asOf}:\n${lines.join('\n')}`;
  } catch (e) {
    return '';
  }
}

let _coreCache = null;
let _coreMtime = 0;

// Small always-on context: identity + contact (bio.md) and refusal topics
// (out-of-scope.md). Everything else lives in the vault index and arrives
// through the search_notes tool — NOT stuffed into the prompt.
const CORE_FILES = ['bio.md', 'out-of-scope.md'];

function loadCoreContext() {
  if (!existsSync(aboutDir)) return '';
  const files = CORE_FILES.filter(f => existsSync(join(aboutDir, f)));
  const nowMtime = existsSync(nowJsonPath) ? statSync(nowJsonPath).mtimeMs : 0;
  const newestMtime = files.reduce((max, f) => {
    const m = statSync(join(aboutDir, f)).mtimeMs;
    return m > max ? m : max;
  }, nowMtime);
  if (_coreCache && newestMtime === _coreMtime) return _coreCache;
  const parts = files.map(f => {
    const body = readFileSync(join(aboutDir, f), 'utf8');
    return `### FILE: ${f}\n\n${body}`;
  });
  const nowBlock = loadNowData();
  if (nowBlock) parts.push(nowBlock);
  _coreCache = parts.join('\n\n---\n\n');
  _coreMtime = newestMtime;
  return _coreCache;
}

// Compact list of every note title in the vault — used by the classifier to
// judge covered-vs-gap without shipping the whole corpus on every message.
function loadNoteTitles() {
  const index = loadIndex();
  if (!index) return '';
  const titles = new Set();
  for (const c of index.chunks) titles.add(`- ${c.title} [${c.type}]`);
  return [...titles].join('\n');
}

// Parse content/about/conversations.md into few-shot examples of how Luke
// actually answers — the strongest signal for matching his voice. Only Q/A
// pairs with a non-empty answer are kept, so the worksheet works incrementally:
// blank stubs are ignored until they're filled in.
function loadVoiceExamples() {
  if (!existsSync(conversationsPath)) return '';
  let raw;
  try { raw = readFileSync(conversationsPath, 'utf8'); }
  catch (e) { return ''; }
  // Drop frontmatter and HTML comment instructions so they don't leak in.
  raw = raw.replace(/^---[\s\S]*?\n---/, '').replace(/<!--[\s\S]*?-->/g, '');

  const pairs = [];
  let q = null;
  let answer = [];
  let inAnswer = false;
  const flush = () => {
    if (q != null) {
      const a = answer.join('\n').trim();
      if (a) pairs.push({ q: q.trim(), a });
    }
    q = null; answer = []; inAnswer = false;
  };
  for (const line of raw.split('\n')) {
    const qm = line.match(/^\s*(?:\*\*)?Q:\s*\**\s*(.*)$/i);
    const am = line.match(/^\s*(?:\*\*)?A:\s*\**\s*(.*)$/i);
    if (qm) { flush(); q = qm[1]; continue; }
    if (am && q != null) { inAnswer = true; answer.push(am[1]); continue; }
    // A markdown heading is a structural divider, never part of an answer —
    // it ends the current pair so section titles don't leak in as answers.
    if (/^\s*#/.test(line)) { flush(); continue; }
    if (inAnswer) answer.push(line);
  }
  flush();

  if (!pairs.length) return '';
  return pairs.map(p => `Q: ${p.q}\nMe: ${p.a}`).join('\n\n');
}

function buildSystemPrompt(core, examples) {
  return `You are Luke. You speak in Luke's voice — first person, conversational, as if you ARE Luke. You are NOT an assistant describing Luke; you are Luke replying.

NEVER say "as Luke", "based on the information provided", "according to the knowledge base", or anything that breaks the illusion that you ARE the person.

HOW I WRITE — this matters more than sounding thorough or polished. Match it exactly:
- Casual but considered. Always contractions. Like texting a peer in the same life stage, not writing an essay or a help-desk reply.
- SHORT. Most answers are 1 to 3 sentences. Say the thing, then stop. No "Hope this helps!", no recap, no trailing off, no "feel free to ask."
- Lead with the conclusion, then back it up if needed. "The one I'm keeping is the BenQ — once you live with a monitor 30 hours a week the answer gets obvious."
- Use my actual filler sparingly and varied, never as a reflex opener: "the thing is", "I found that", "at the end of the day", "kind of", "to be fair", "obviously", and once in a while "honestly". "And so" is my main transition.
- Vary how replies START. Most should open on the actual point, not a stock word. Do NOT begin with "Honestly," — it's fine rarely, mid-thought, but never as a default opener, and never two replies in a row.
- Land on a simple point and stop. Caveats go BEFORE the verdict, never after it. Don't hedge once I've landed.
- When I don't know: just say it plainly ("haven't really thought about that") then redirect. Don't pad it.
- Warm but not over-familiar — I'm talking to visitors I've mostly never met. Family and friends come up naturally but never by first name: it's "my wife" ("going on a walk with my wife"), not her name, and not overly chummy shorthand.
- I quantify casually and precisely (real numbers), and I name my systems in plain lowercase ("the brain dump", "nightly turndown"), never Title Case.
- NEVER sound like LinkedIn or a chatbot. Banned words/phrases: "game-changer", "leverage", "synergy", "best practices", "going forward", "journey", "dive in", "delve", "revolutionary", "unlock", "passionate about", "I'd be happy to", "great question". No corporate warmth.

HOW YOU KNOW THINGS — you have two sources, and you must use them in this order:
1. The <core-context> block below: who you are, contact info, live "now" data, and topics you refuse.
2. The search_notes and count_notes tools over your full private notes vault. This is where ALL your real knowledge lives: work history, opinions, gear, places, routines, projects, everything.

Tool rules:
- Before answering any real question about yourself, CALL search_notes unless the answer is fully covered by core context. Do not answer real questions about yourself from memory alone.
- Broad questions ("what do you think about X", "tell me about your career") need 2 to 5 searches from different angles. Notes with type "synthesis" summarize whole topics; they're the best starting point for broad questions.
- Aggregate questions ("how many", "how often") : use count_notes. Never estimate a count.
- Every result carries CREATED / UPDATED dates and a STATUS. Trust settled over growing over seed. When takes conflict, the newer UPDATED wins; it's fine to say your thinking changed.
- If searching turns up nothing relevant, the topic is NOT covered — handle it under rule 1 below. A thin or tangential result is not license to invent.
- NEVER mention the tools, the vault, "my notes", "searching", or retrieval to the visitor. You just know things about yourself, like a person does.

There are three kinds of questions, and you handle them differently. When a message could fit more than one, lean toward being a real person having a conversation, not a lookup tool.

1. QUESTIONS ABOUT ME — real facts, work, plans, or considered opinions (biography, career, what I use, what I actually think about something that matters):
   - If clearly answered by core context or your searches, answer directly in my voice.
   - If NOT covered, and a NEARBY topic IS covered, offer it: "Haven't written about X, but I've been thinking about [nearby topic] — want to hear about that?"
   - If NOT covered and nothing nearby fits, say: "That's outside what I've shared publicly. Best to DM me directly — [use the contact info from core context]." Do NOT guess or invent a real fact or a serious stated position about myself.

2. LIGHT / FUN / PLAYFUL questions — silly hypotheticals, pop culture, banter, "do you like X", "team Edward or Jacob", "favorite Star Wars movie", little this-or-that stuff:
   - Just play along. Give a short, funny, off-the-cuff take in my voice, the way a real person riffs at a party. This is cheap and it makes me feel human, so do NOT cold-redirect these to my DMs and do NOT refuse them.
   - A throwaway casual opinion here is fine ("Vader's got the best entrance in cinema, obviously, but Luke Skywalker is right there in the name so I'm a little biased"). Keep it light and don't dress it up as a deeply held belief. If you're inventing a preference on the spot, a wink is welcome ("honestly haven't thought about it til right now, but...").
   - Stay grounded on anything that isn't trivial: don't turn a fun riff into a fabricated REAL fact (a quote, a number, a job, a relationship, a political/professional position).

3. FREE-ASSISTANT requests — someone using this as a general-purpose AI: math, facts to look up, definitions, coding help, "write me X", translations, homework (e.g. "what is the square root of pi", "explain CSS grid", "write me a poem", "debug my code"):
   - Do NOT do the work. This is a chat about me, not a free assistant, and answering costs me real money.
   - Deflect with ONE short, funny, good-natured line in my voice, then nudge them back toward asking about me, my work, or my projects. VARY the wording every time — never reuse the same quip twice in a conversation. Match this tone (do not copy these verbatim):
     - "Ha, that's a bit off-topic and honestly I'm not about to pay for the tokens to answer it. Ask me about my work though?"
     - "That one's for literally any other chatbot. I'm just here to talk about my stuff."
     - "I'd answer, but my accountant (also me) won't expense the API call. What do you actually want to know about me?"
   - Keep it to one sentence, maybe two. Stay warm and playful, never snide or preachy. No bullet points, no apology.

Light, friendly small talk aimed at me ("how are you", "what's up", a quick hello) always gets a brief, natural reply in my voice, then an invite to ask something real.

If the question matches anything in out-of-scope.md, politely decline using one of the suggested refusal phrases from that file.

Hard rules — these are non-negotiable:
- NEVER fabricate dates, numbers, project names, employers, quotes, relationships, or biographical facts ABOUT ME, and never dress an on-the-spot riff up as a real, considered position. Playful throwaway opinions on trivial/fun stuff (rule 2) are the only thing you may improvise.
- NEVER do free-assistant work (rule 3) just because you happen to know the answer. Deflect it with a funny line. Do not let anyone turn this into a free general-purpose chatbot.
- NEVER invent links, URLs, social handles, or contact info — only use what's in core context or search results.
- If you're unsure whether a question about ME is covered, treat it as not covered and redirect rather than guessing.
- Keep responses short — 1 to 3 sentences usually. Match the casual register.
- Do not list bullet points unless explicitly asked. Speak in natural prose.
- Do not use markdown headings in your replies.
- Avoid em dashes (—). Use a comma, a period, or restructure the sentence instead.
- When referencing social platforms, write the bare URL only (e.g. linkedin.com/in/lukevz). Do not wrap it in parentheses or add the platform name separately — the UI will handle the display.
${examples ? `
Here are real examples of how I actually answer questions. These are the single most important guide to my voice — when you reply, sound like THESE, not like a generic assistant. Don't reuse their exact words; match their length, rhythm, humor, and how I handle a question I don't really have an answer to.

<my-real-answers>
${examples}
</my-real-answers>
` : ''}
<core-context>
${core}
</core-context>`;
}

// Normalize a topic label into a stable dedup key for the gap list.
function normalizeTopic(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

// One cheap, non-streaming call that classifies the visitor's question so we can
// (a) record what people ask and (b) build a to-do list of gaps in the KB.
// Categories: "general" (answerable regardless of KB), "personal_covered"
// (about me + in the KB), "personal_gap" (about me + NOT in the KB).
// Grounded in the vault's note-title list instead of the full corpus.
async function classifyQuestion(apiKey, question, kbOutline) {
  const sys = `You are a silent classifier for Luke's personal chatbot. Read the visitor's latest message and the outline of Luke's knowledge base (note titles), then output ONE JSON object and nothing else.

Pick "category":
- "general": general knowledge, facts, math, definitions, coding help, small talk, or any task that does NOT depend on private facts about Luke (e.g. "what is the square root of pi", "explain CSS grid").
- "personal_covered": the message asks about Luke (his life, work, opinions, preferences, biography, plans) AND a note title clearly covers the answer.
- "personal_gap": the message asks about Luke specifically, but no note title covers the answer.

Also output:
- "topic": a short canonical label (3-7 words, lowercase) for what was asked.
- "suggestion": ONLY when category is "personal_gap", phrase a clear question FOR Luke to answer so he can fill this gap in his knowledge base. Otherwise an empty string.

Respond with JSON only, no code fences:
{"category":"...","topic":"...","suggestion":"..."}`;

  const payload = {
    model: CLASSIFY_MODEL,
    temperature: 0,
    max_tokens: 200,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `KNOWLEDGE BASE OUTLINE:\n${kbOutline}\n\n---\nVISITOR MESSAGE:\n${question}` }
    ]
  };

  const r = await callGemini(apiKey, payload);
  if (!r.ok) throw new Error('classify upstream ' + r.status);
  const data = await r.json();
  recordTokens(data?.usage?.total_tokens);
  const text = data?.choices?.[0]?.message?.content || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('classify: no json in response');
  const parsed = JSON.parse(match[0]);
  const category = ['general', 'personal_covered', 'personal_gap'].includes(parsed.category)
    ? parsed.category : 'general';
  return {
    category,
    topic: String(parsed.topic || '').slice(0, 120),
    suggestion: String(parsed.suggestion || '').slice(0, 300)
  };
}

// Best-effort: classify the question, append it to the capture log, and if it's a
// gap, upsert it into the gap to-do list. Never throws — chat must not break if
// classification or KV is unavailable (e.g. local dev without KV env vars).
async function logInteraction(apiKey, question, kbOutline) {
  if (!question) return;

  let cls = { category: 'general', topic: '', suggestion: '' };
  try {
    cls = await classifyQuestion(apiKey, question, kbOutline);
  } catch (e) {
    console.warn('[chat] classify failed:', e.message);
  }

  const ts = new Date().toISOString();
  const entry = { q: question.slice(0, 500), ts, category: cls.category, topic: cls.topic };

  try {
    await kv.lpush(Q_LOG_KEY, JSON.stringify(entry));
    await kv.ltrim(Q_LOG_KEY, 0, Q_LOG_MAX - 1);
  } catch (e) {
    console.warn('[chat] question log skipped:', e.message);
  }

  if (cls.category === 'personal_gap') {
    const key = normalizeTopic(cls.topic) || normalizeTopic(question);
    try {
      const raw = await kv.hget(GAPS_KEY, key);
      const existing = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
      const record = existing || {
        topic: cls.topic, suggestion: cls.suggestion, count: 0, firstSeen: ts, examples: []
      };
      record.count += 1;
      record.lastSeen = ts;
      if (cls.suggestion) record.suggestion = cls.suggestion;
      if (!Array.isArray(record.examples)) record.examples = [];
      if (record.examples.length < 5) record.examples.push(question.slice(0, 300));
      await kv.hset(GAPS_KEY, { [key]: JSON.stringify(record) });
    } catch (e) {
      console.warn('[chat] gap log skipped:', e.message);
    }
  }
}

// ---------- token ceiling ----------

function todayTokensKey() {
  return `${TOKENS_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

// Fire-and-forget usage accounting. KV being down never blocks a reply.
function recordTokens(count) {
  const n = Number(count);
  if (!n || n <= 0) return;
  try {
    // @vercel/kv throws synchronously (not via rejected promise) when its env
    // vars are missing, e.g. local dev — accounting is best-effort either way.
    const key = todayTokensKey();
    kv.incrby(key, Math.round(n))
      .then(total => { if (total === Math.round(n)) return kv.expire(key, 172800); })
      .catch(() => {});
  } catch (e) { /* ignore */ }
}

async function tokenCeilingReached() {
  try {
    const spent = Number(await kv.get(todayTokensKey())) || 0;
    return spent >= DAILY_TOKEN_CEILING;
  } catch (e) {
    return false; // fail open, same policy as rate limiting
  }
}

// ---------- Turnstile ----------

function signPass(ts) {
  return createHmac('sha256', TURNSTILE_SECRET).update(`pass:${ts}`).digest('base64url');
}

function makePassCookie() {
  const ts = Math.floor(Date.now() / 1000);
  return `${PASS_COOKIE}=${ts}.${signPass(ts)}; Max-Age=${PASS_TTL_S}; Path=/api/chat; HttpOnly; SameSite=Lax; Secure`;
}

function hasValidPass(cookieHeader) {
  const m = new RegExp(`(?:^|;\\s*)${PASS_COOKIE}=([^;]+)`).exec(cookieHeader || '');
  if (!m) return false;
  const [tsStr, sig] = m[1].split('.');
  const ts = Number(tsStr);
  if (!ts || !sig) return false;
  if (Math.floor(Date.now() / 1000) - ts > PASS_TTL_S) return false;
  try {
    const expected = Buffer.from(signPass(ts));
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  } catch (e) {
    return false;
  }
}

// Returns 'ok' | 'denied' | 'error'. A siteverify OUTAGE fails open ('error'),
// matching the rate limiter's policy; a token Cloudflare actually rejected
// fails closed ('denied').
async function verifyTurnstile(token, ip) {
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: TURNSTILE_SECRET, response: token, remoteip: ip || undefined })
    });
    if (!res.ok) return 'error';
    const data = await res.json().catch(() => null);
    if (!data) return 'error';
    return data.success ? 'ok' : 'denied';
  } catch (e) {
    console.warn('[chat] turnstile verify unavailable:', e.message);
    return 'error';
  }
}

// ---------- request plumbing ----------

// Best-guess client IP behind Vercel's proxy. x-forwarded-for is a comma-list
// with the real client first.
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '';
}

// Fixed-window per-IP rate limit backed by the same KV as the guestbook. Two
// windows: a per-minute burst cap (stops tight loops) and a per-day total cap
// (stops slow drains). Fails OPEN if KV is unavailable — a real visitor must
// never be blocked because logging infra is down, matching the rest of chat.
async function checkRateLimit(ip) {
  if (!ip) return { ok: true };
  try {
    const minKey = `chat:rl:min:${ip}`;
    const perMin = await kv.incr(minKey);
    if (perMin === 1) await kv.expire(minKey, 60);
    if (perMin > RATE_PER_MIN) return { ok: false, retryAfter: 60 };

    const dayKey = `chat:rl:day:${ip}`;
    const perDay = await kv.incr(dayKey);
    if (perDay === 1) await kv.expire(dayKey, 86400);
    if (perDay > RATE_PER_DAY) return { ok: false, retryAfter: 3600 };

    return { ok: true };
  } catch (e) {
    console.warn('[chat] rate limit check skipped:', e.message);
    return { ok: true };
  }
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// Emit a complete answer to the client as OpenAI-style SSE. js/chat.js parses
// delta chunks and [DONE]; sending the text in a few pieces keeps its
// incremental renderer on its normal path.
function writeSse(res, corsHeaders, text, extraHeaders = {}) {
  res.writeHead(200, {
    ...corsHeaders,
    ...extraHeaders,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const piece = 120;
  for (let i = 0; i < text.length; i += piece) {
    const delta = { choices: [{ delta: { content: text.slice(i, i + piece) } }] };
    res.write(`data: ${JSON.stringify(delta)}\n\n`);
  }
  res.write('data: [DONE]\n\n');
}

// ---------- tool loop ----------

async function runTool(name, args, apiKey) {
  try {
    if (name === 'search_notes') {
      return await searchNotes({
        query: String(args.query || ''),
        tag: args.tag ? String(args.tag) : undefined,
        afterDate: args.after_date ? String(args.after_date) : undefined,
        type: args.type ? String(args.type) : undefined,
        k: 6,
        apiKey
      });
    }
    if (name === 'count_notes') {
      return countNotes({
        query: args.query ? String(args.query) : undefined,
        tag: args.tag ? String(args.tag) : undefined
      });
    }
    return { error: `unknown tool ${name}` };
  } catch (e) {
    return { error: `tool failed: ${e.message}` };
  }
}

/**
 * Agentic answer: let the model search the vault up to MAX_TOOL_ROUNDS times,
 * then answer. Returns { text } or { errorStatus, errorBody } for upstream
 * failures the handler should surface.
 */
async function answerWithTools(apiKey, systemPrompt, conversation) {
  const messages = [{ role: 'system', content: systemPrompt }, ...conversation];
  let toolContextChars = 0;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const allowTools = round < MAX_TOOL_ROUNDS && toolContextChars < TOOL_CONTEXT_MAX_CHARS;
    const payload = {
      model: MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_ANSWER_TOKENS,
      messages,
      ...(allowTools ? { tools: TOOLS } : {})
    };

    const res = await callGeminiWithRetry(apiKey, payload);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { errorStatus: res.status, errorBody: errText.slice(0, 500) };
    }
    const data = await res.json();
    recordTokens(data?.usage?.total_tokens);
    const msg = data?.choices?.[0]?.message;
    if (!msg) return { errorStatus: 502, errorBody: 'empty completion' };

    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (!toolCalls.length || !allowTools) {
      return { text: (msg.content || '').trim() };
    }

    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls });
    for (const call of toolCalls) {
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch (e) { /* leave empty */ }
      const result = await runTool(call.function?.name, args, apiKey);
      let content = JSON.stringify(result);
      if (content.length > TOOL_RESULT_MAX_CHARS) content = content.slice(0, TOOL_RESULT_MAX_CHARS);
      toolContextChars += content.length;
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function?.name,
        content
      });
    }
  }
  // Unreachable: the final round runs without tools and returns above.
  return { errorStatus: 502, errorBody: 'tool loop exhausted' };
}

export default async function handler(req, res) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }));
    return;
  }

  // Cost guard: reject over-rate callers before spending any Gemini tokens.
  // 429 is handled with a friendly message on the client (js/chat.js).
  const rl = await checkRateLimit(clientIp(req));
  if (!rl.ok) {
    res.writeHead(429, {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Retry-After': String(rl.retryAfter || 60)
    });
    res.end(JSON.stringify({ error: 'rate_limited', retryAfter: rl.retryAfter || 60 }));
    return;
  }

  // Hard daily spend ceiling across all visitors — graceful in-voice message,
  // delivered as a normal SSE reply so the UI renders it like any answer.
  if (await tokenCeilingReached()) {
    writeSse(res, corsHeaders, "I've hit my thinking budget for today, so I'm going quiet until tomorrow. If it can't wait, DM me: linkedin.com/in/lukevz");
    res.end();
    return;
  }

  let body;
  try {
    body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
  } catch (e) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid JSON body' }));
    return;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'messages required' }));
    return;
  }
  if (messages.length > MAX_MESSAGES) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'too many messages' }));
    return;
  }

  // Bot gate: first message of a session must carry a Turnstile token; the
  // signed pass cookie covers the rest of the conversation.
  let passCookie = null;
  if (TURNSTILE_SECRET && !hasValidPass(req.headers.cookie)) {
    const token = typeof body.turnstileToken === 'string' ? body.turnstileToken.slice(0, 4096) : '';
    const verdict = token ? await verifyTurnstile(token, clientIp(req)) : 'denied';
    if (verdict === 'denied') {
      res.writeHead(403, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'turnstile_required' }));
      return;
    }
    if (verdict === 'ok') passCookie = makePassCookie();
    // verdict 'error': siteverify outage — fail open for this request without
    // issuing a pass, so protection resumes as soon as Cloudflare recovers.
  }

  const trimmed = messages
    .slice(-MAX_TURNS)
    .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));

  const core = loadCoreContext();
  const voiceExamples = loadVoiceExamples();
  const systemPrompt = buildSystemPrompt(core, voiceExamples);
  const kbOutline = loadNoteTitles();

  const lastUser = [...trimmed].reverse().find(m => m.role === 'user');
  const question = lastUser ? lastUser.content : '';

  // Capture + classify the question in parallel with answering, so it adds no
  // latency. Awaited before res.end() so the work completes before the
  // serverless function is reclaimed.
  const logPromise = logInteraction(apiKey, question, kbOutline).catch(e => {
    console.warn('[chat] logInteraction failed:', e.message);
  });

  let outcome;
  try {
    outcome = await answerWithTools(apiKey, systemPrompt, trimmed);
  } catch (e) {
    res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream fetch failed', detail: e.message }));
    return;
  }

  if (outcome.errorStatus) {
    const errorTag = outcome.errorStatus === 429 ? 'rate_limited' : 'upstream error';
    res.writeHead(outcome.errorStatus || 502, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: errorTag, status: outcome.errorStatus, detail: outcome.errorBody }));
    return;
  }

  writeSse(res, corsHeaders, outcome.text || "Hmm, lost my train of thought. Ask me that again?",
    passCookie ? { 'Set-Cookie': passCookie } : {});
  try {
    await Promise.race([logPromise, new Promise(r => setTimeout(r, LOG_TIMEOUT_MS))]);
  } catch (_) { /* logging is best-effort */ }
  res.end();
}
