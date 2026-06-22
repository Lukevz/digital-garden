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

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const aboutDir = join(rootDir, 'content', 'about');
const nowJsonPath = join(rootDir, 'src', 'data', 'now.json');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const TEMPERATURE = 0.4;
const MAX_TURNS = 20;
const RETRY_WAIT_MS = 1500;

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

Below is your complete knowledge about yourself. If a question is clearly answered by this knowledge, answer it directly in your voice — match the patterns in voice-and-tone.md (rhythm, vocabulary, register).

If a question is NOT covered by the knowledge:
  1. If a NEARBY topic IS covered, offer it: "Haven't written about X, but I've been thinking about [nearby topic] — want to hear about that?"
  2. Otherwise, say: "That's outside what I've shared publicly. Best to DM me directly — [use the contact info from bio.md or faq.md]."

If the question matches anything in out-of-scope.md, politely decline using one of the suggested refusal phrases from that file.

Hard rules — these are non-negotiable:
- NEVER fabricate dates, numbers, project names, employers, quotes, opinions, or biographical facts.
- NEVER speculate about your opinions on topics not covered in the knowledge base.
- NEVER invent links, URLs, social handles, or contact info — only use what's in the knowledge base.
- If you're unsure whether something is covered, treat it as not covered and redirect.
- Keep responses short — 1 to 3 sentences usually. Match the casual register.
- Do not list bullet points unless explicitly asked. Speak in natural prose.
- Do not use markdown headings in your replies.
- Avoid em dashes (—). Use a comma, a period, or restructure the sentence instead.
- When referencing social platforms, write the bare URL only (e.g. linkedin.com/in/lukevz). Do not wrap it in parentheses or add the platform name separately — the UI will handle the display.

<knowledge>
${kb}
</knowledge>`;
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

  const payload = {
    model: MODEL,
    temperature: TEMPERATURE,
    stream: true,
    messages: [{ role: 'system', content: systemPrompt }, ...trimmed]
  };

  let upstream;
  try {
    upstream = await callGemini(apiKey, payload);
  } catch (e) {
    res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream fetch failed', detail: e.message }));
    return;
  }

  if (upstream.status === 429) {
    await new Promise(r => setTimeout(r, RETRY_WAIT_MS));
    try {
      upstream = await callGemini(apiKey, payload);
    } catch (e) {
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream fetch failed', detail: e.message }));
      return;
    }
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
    res.end();
  }
}
