/**
 * Vercel Serverless Function: Chat Insights (private)
 * Read + maintenance side of the chat capture pipeline written by api/chat.js.
 *
 * GET  /api/chat-insights?key=SECRET[&limit=N]
 *   → recent visitor questions + the gap to-do list as JSON.
 *
 * POST /api/chat-insights?key=SECRET
 *   body { "resolve": ["<gap key>", ...] }  → remove those gaps from the to-do list
 *   body { "resolveAll": true }             → clear the entire gap list
 *   (used by the kb-gaps-resolve GitHub Action when a gap-answering PR merges)
 *
 * Auth: query param `key` must equal env var CHAT_INSIGHTS_KEY.
 * Storage: same Vercel KV database as the guestbook.
 */
import { kv } from '@vercel/kv';

const Q_LOG_KEY = 'chat:questions';
const GAPS_KEY = 'chat:gaps';

function parseMaybeJSON(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function getQueryParam(req, name) {
  if (req.query && req.query[name] != null) return req.query[name];
  try {
    return new URL(req.url, 'http://localhost').searchParams.get(name);
  } catch {
    return null;
  }
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj, null, 2));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    send(res, 405, { error: 'method not allowed' });
    return;
  }

  const secret = process.env.CHAT_INSIGHTS_KEY;
  if (!secret) {
    send(res, 500, { error: 'CHAT_INSIGHTS_KEY not configured' });
    return;
  }
  if (getQueryParam(req, 'key') !== secret) {
    send(res, 401, { error: 'unauthorized' });
    return;
  }

  // POST — resolve (clear) gaps that have been answered.
  if (req.method === 'POST') {
    let body = {};
    try {
      body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
    } catch { body = {}; }

    try {
      if (body.resolveAll === true) {
        await kv.del(GAPS_KEY);
        send(res, 200, { resolved: 'all', remaining: 0 });
        return;
      }
      const keys = Array.isArray(body.resolve)
        ? body.resolve.map(k => String(k).trim()).filter(Boolean).slice(0, 200)
        : [];
      if (!keys.length) {
        send(res, 400, { error: 'provide { resolve: [keys] } or { resolveAll: true }' });
        return;
      }
      const removed = await kv.hdel(GAPS_KEY, ...keys);
      const remaining = (await kv.hlen(GAPS_KEY)) || 0;
      send(res, 200, { requested: keys, removed, remaining });
    } catch (e) {
      send(res, 500, { error: 'failed to resolve gaps', detail: e.message });
    }
    return;
  }

  // GET — read questions + gap to-do list.
  try {
    const limitRaw = parseInt(getQueryParam(req, 'limit') || '200', 10);
    const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 200, 1000);

    const rawQs = (await kv.lrange(Q_LOG_KEY, 0, limit - 1)) || [];
    const questions = rawQs.map(parseMaybeJSON).filter(Boolean);

    const rawGaps = (await kv.hgetall(GAPS_KEY)) || {};
    const gaps = Object.entries(rawGaps)
      .map(([k, v]) => {
        const val = parseMaybeJSON(v);
        return val ? { key: k, ...val } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.count || 0) - (a.count || 0));

    send(res, 200, {
      generatedAt: new Date().toISOString(),
      totalGaps: gaps.length,
      gaps,
      questionCount: questions.length,
      questions
    });
  } catch (e) {
    send(res, 500, { error: 'failed to load insights', detail: e.message });
  }
}
