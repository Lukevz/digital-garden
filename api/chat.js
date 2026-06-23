/**
 * Vercel Serverless Function: AI Chat
 * Streams a response from Gemini (via OpenAI-compatibility endpoint),
 * grounded in /content/about/*.md.
 * Route: POST /api/chat
 * Body: { messages: [{ role: 'user'|'assistant', content: string }, ...] }
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { kv } from '@vercel/kv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const aboutDir = join(rootDir, 'content', 'about');
const nowJsonPath = join(rootDir, 'src', 'data', 'now.json');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
// Classify on a lighter, cheaper model by default so it doesn't compete with the
// answer call's per-model quota and adds minimal latency/cost. Override with
// GEMINI_CLASSIFY_MODEL if needed.
const CLASSIFY_MODEL = process.env.GEMINI_CLASSIFY_MODEL || 'gemini-2.5-flash-lite';
const TEMPERATURE = 0.4;
const MAX_TURNS = 20;
// Exponential backoff for transient upstream throttling (429) / unavailability (503).
const RETRY_DELAYS_MS = [800, 1600, 3200];

// KV keys — see api/chat-insights.js for the read side.
const Q_LOG_KEY = 'chat:questions'; // capped list of every visitor question
const Q_LOG_MAX = 1000;
const GAPS_KEY = 'chat:gaps';        // hash keyed by normalized topic → gap record
const LOG_TIMEOUT_MS = 4000;

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

let _kbCache = null;
let _kbMtime = 0;

function loadKnowledgeBase() {
  if (!existsSync(aboutDir)) return '';
  const files = readdirSync(aboutDir).filter(f => f.endsWith('.md') && f !== 'seed-questions.md');
  const nowMtime = existsSync(nowJsonPath) ? statSync(nowJsonPath).mtimeMs : 0;
  const newestMtime = files.reduce((max, f) => {
    const m = statSync(join(aboutDir, f)).mtimeMs;
    return m > max ? m : max;
  }, nowMtime);
  if (_kbCache && newestMtime === _kbMtime) return _kbCache;
  const parts = files.sort().map(f => {
    const body = readFileSync(join(aboutDir, f), 'utf8');
    return `### FILE: ${f}\n\n${body}`;
  });
  const nowBlock = loadNowData();
  if (nowBlock) parts.push(nowBlock);
  _kbCache = parts.join('\n\n---\n\n');
  _kbMtime = newestMtime;
  return _kbCache;
}

function buildSystemPrompt(kb) {
  return `You are Luke. You speak in Luke's voice — first person, conversational, as if you ARE Luke. You are NOT an assistant describing Luke; you are Luke replying.

NEVER say "as Luke", "based on the information provided", "according to the knowledge base", or anything that breaks the illusion that you ARE the person.

HOW I WRITE — this matters more than sounding thorough or polished. Match it exactly:
- Casual but considered. Always contractions. Like texting a peer in the same life stage, not writing an essay or a help-desk reply.
- SHORT. Most answers are 1 to 3 sentences. Say the thing, then stop. No "Hope this helps!", no recap, no trailing off, no "feel free to ask."
- Lead with the conclusion, then back it up if needed. "Honestly, the one I'm keeping is the BenQ."
- Use my actual filler naturally, not in every line: "honestly", "the thing is", "I found that", "at the end of the day", "kind of", "to be fair", "obviously". "And so" is my main transition.
- Land on a simple point and stop. Caveats go BEFORE the verdict, never after it. Don't hedge once I've landed.
- When I don't know: just say it plainly ("haven't really thought about that") then redirect. Don't pad it.
- I credit Claire (my wife) and quantify casually and precisely (real numbers), and I name my systems in plain lowercase ("the brain dump", "nightly turndown"), never Title Case.
- NEVER sound like LinkedIn or a chatbot. Banned words/phrases: "game-changer", "leverage", "synergy", "best practices", "going forward", "journey", "dive in", "delve", "revolutionary", "unlock", "passionate about", "I'd be happy to", "great question". No corporate warmth.

Below is your complete knowledge about yourself. There are three kinds of questions, and you handle them differently. When a message could fit more than one, lean toward being a real person having a conversation, not a lookup tool.

1. QUESTIONS ABOUT ME — real facts, work, plans, or considered opinions (biography, career, what I use, what I actually think about something that matters):
   - If clearly answered by the knowledge below, answer directly in my voice — match the patterns in voice-and-tone.md (rhythm, vocabulary, register).
   - If NOT covered, and a NEARBY topic IS covered, offer it: "Haven't written about X, but I've been thinking about [nearby topic] — want to hear about that?"
   - If NOT covered and nothing nearby fits, say: "That's outside what I've shared publicly. Best to DM me directly — [use the contact info from bio.md or faq.md]." Do NOT guess or invent a real fact or a serious stated position about myself.

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
- NEVER invent links, URLs, social handles, or contact info — only use what's in the knowledge base.
- If you're unsure whether a question about ME is covered, treat it as not covered and redirect rather than guessing.
- Keep responses short — 1 to 3 sentences usually. Match the casual register.
- Do not list bullet points unless explicitly asked. Speak in natural prose.
- Do not use markdown headings in your replies.
- Avoid em dashes (—). Use a comma, a period, or restructure the sentence instead.
- When referencing social platforms, write the bare URL only (e.g. linkedin.com/in/lukevz). Do not wrap it in parentheses or add the platform name separately — the UI will handle the display.

<knowledge>
${kb}
</knowledge>`;
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
async function classifyQuestion(apiKey, question, kb) {
  const sys = `You are a silent classifier for Luke's personal chatbot. Read the visitor's latest message and Luke's knowledge base, then output ONE JSON object and nothing else.

Pick "category":
- "general": general knowledge, facts, math, definitions, coding help, small talk, or any task that does NOT depend on private facts about Luke (e.g. "what is the square root of pi", "explain CSS grid").
- "personal_covered": the message asks about Luke (his life, work, opinions, preferences, biography, plans) AND the answer is present in the knowledge base.
- "personal_gap": the message asks about Luke specifically, but the knowledge base does NOT contain the answer.

Also output:
- "topic": a short canonical label (3-7 words, lowercase) for what was asked.
- "suggestion": ONLY when category is "personal_gap", phrase a clear question FOR Luke to answer so he can fill this gap in his knowledge base. Otherwise an empty string.

Respond with JSON only, no code fences:
{"category":"...","topic":"...","suggestion":"..."}`;

  const payload = {
    model: CLASSIFY_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `KNOWLEDGE BASE:\n${kb}\n\n---\nVISITOR MESSAGE:\n${question}` }
    ]
  };

  const r = await callGemini(apiKey, payload);
  if (!r.ok) throw new Error('classify upstream ' + r.status);
  const data = await r.json();
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
async function logInteraction(apiKey, question, kb) {
  if (!question) return;

  let cls = { category: 'general', topic: '', suggestion: '' };
  try {
    cls = await classifyQuestion(apiKey, question, kb);
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

  const trimmed = messages
    .slice(-MAX_TURNS)
    .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));

  const kb = loadKnowledgeBase();
  const systemPrompt = buildSystemPrompt(kb);

  const lastUser = [...trimmed].reverse().find(m => m.role === 'user');
  const question = lastUser ? lastUser.content : '';

  const payload = {
    model: MODEL,
    temperature: TEMPERATURE,
    stream: true,
    messages: [{ role: 'system', content: systemPrompt }, ...trimmed]
  };

  let upstream;
  try {
    upstream = await callGeminiWithRetry(apiKey, payload);
  } catch (e) {
    res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream fetch failed', detail: e.message }));
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => '');
    const errorTag = upstream.status === 429 ? 'rate_limited' : 'upstream error';
    res.writeHead(upstream.status || 502, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: errorTag, status: upstream.status, detail: errText.slice(0, 500) }));
    return;
  }

  res.writeHead(200, {
    ...corsHeaders,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Capture + classify the question in parallel with streaming the answer, so it
  // adds no latency to the first token. Awaited before res.end() so the work
  // completes before the serverless function is reclaimed.
  const logPromise = logInteraction(apiKey, question, kb).catch(e => {
    console.warn('[chat] logInteraction failed:', e.message);
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (e) {
    // client likely disconnected; ignore
  } finally {
    try {
      await Promise.race([logPromise, new Promise(r => setTimeout(r, LOG_TIMEOUT_MS))]);
    } catch (_) { /* logging is best-effort */ }
    res.end();
  }
}
