/**
 * Vercel Serverless Function: Chat Insights (private)
 * Read side of the chat capture pipeline written by api/chat.js.
 * Returns the recent visitor questions and the gap to-do list (questions the
 * bot couldn't answer about Luke) so the knowledge base can be improved.
 *
 * Route: GET /api/chat-insights?key=SECRET[&limit=200]
 * Auth:  query param `key` must equal env var CHAT_INSIGHTS_KEY.
 *
 * Setup: set CHAT_INSIGHTS_KEY in the environment. Storage uses the same
 * Vercel KV database as the guestbook (env auto-configured by Vercel).
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  const secret = process.env.CHAT_INSIGHTS_KEY;
  if (!secret) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'CHAT_INSIGHTS_KEY not configured' }));
    return;
  }

  const key = getQueryParam(req, 'key');
  if (!key || key !== secret) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

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

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalGaps: gaps.length,
      gaps,
      questionCount: questions.length,
      questions
    }, null, 2));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'failed to load insights', detail: e.message }));
  }
}
