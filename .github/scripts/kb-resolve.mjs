/**
 * KB gaps resolve — runs in GitHub Actions (see kb-gaps-resolve.yml) when a PR
 * merges. Parses `Resolves-KB-Gap: <key>` lines from the PR title/body and tells
 * /api/chat-insights to remove those gaps from the to-do list.
 *
 * Env: CHAT_INSIGHTS_KEY, CHAT_INSIGHTS_URL?, PR_BODY, PR_TITLE
 */

const BASE_URL = (process.env.CHAT_INSIGHTS_URL || 'https://lukevz.com').replace(/\/$/, '');
const KEY = process.env.CHAT_INSIGHTS_KEY;
const text = `${process.env.PR_TITLE || ''}\n${process.env.PR_BODY || ''}`;

if (!KEY) { console.error('CHAT_INSIGHTS_KEY missing'); process.exit(1); }

// Trailer lines only — line-anchored so prose mentioning the trailer (e.g. PR
// descriptions documenting this very format) don't match. Optional leading list
// markers / blockquote are tolerated. The `<key>` placeholder is skipped.
const keys = [...text.matchAll(/^[ \t>*-]*Resolves-KB-Gap:[ \t]*(.+?)[ \t]*$/gim)]
  .map(m => m[1].trim().replace(/[`"']/g, ''))
  .filter(k => k && !k.startsWith('<'));

if (!keys.length) {
  console.log('No Resolves-KB-Gap trailers found. Nothing to clear.');
  process.exit(0);
}

console.log('Clearing gaps:', keys);

const res = await fetch(`${BASE_URL}/api/chat-insights?key=${encodeURIComponent(KEY)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ resolve: keys })
});

const out = await res.text();
if (!res.ok) {
  console.error('resolve failed:', res.status, out);
  process.exit(1);
}
console.log('Resolve response:', out);
