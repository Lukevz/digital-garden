/**
 * KB gaps digest — runs in GitHub Actions (see kb-gaps-digest.yml).
 *
 * Fetches the chat gap to-do list from /api/chat-insights and upserts ONE
 * GitHub issue (labeled `kb-gaps`) with a checklist of unanswered personal
 * questions. When there are no gaps left, the open issue is closed.
 *
 * Env: GH_TOKEN, GH_REPO (owner/repo), CHAT_INSIGHTS_KEY, CHAT_INSIGHTS_URL?
 */

const BASE_URL = (process.env.CHAT_INSIGHTS_URL || 'https://lukevz.com').replace(/\/$/, '');
const KEY = process.env.CHAT_INSIGHTS_KEY;
const REPO = process.env.GH_REPO; // owner/repo
const GH_TOKEN = process.env.GH_TOKEN;
const LABEL = 'kb-gaps';
const MARKER = '<!-- kb-gaps-issue -->';

if (!KEY) { console.error('CHAT_INSIGHTS_KEY missing'); process.exit(1); }
if (!REPO || !GH_TOKEN) { console.error('GH_REPO / GH_TOKEN missing'); process.exit(1); }

const gh = (path, opts = {}) => fetch(`https://api.github.com${path}`, {
  ...opts,
  headers: {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    ...(opts.headers || {})
  }
});

function escapeInline(s) {
  return String(s || '').replace(/\r?\n/g, ' ').trim();
}

function buildBody(gaps) {
  const lines = [
    MARKER,
    '',
    `**${gaps.length} unanswered question${gaps.length === 1 ? '' : 's'} about you.** These came up in chat but aren't covered by your knowledge base.`,
    '',
    '### How to answer (from Claude Code mobile)',
    '1. Open this repo in the code tab and say: *"Answer these KB gaps."*',
    '2. Claude creates a branch, writes your answers into the right `content/about/*.md` file(s), and opens a PR.',
    `3. For each gap it answers, Claude adds a \`Resolves-KB-Gap: <key>\` line to the PR description. When the PR merges, that gap is auto-cleared from the to-do list.`,
    '',
    '---',
    ''
  ];

  for (const g of gaps) {
    const q = escapeInline(g.suggestion || g.topic || g.key);
    lines.push(`- [ ] **${q}** _(asked ${g.count || 1}×)_`);
    lines.push(`  - \`Resolves-KB-Gap: ${g.key}\``);
    const examples = Array.isArray(g.examples) ? g.examples.slice(0, 3) : [];
    for (const ex of examples) {
      lines.push(`  - _e.g._ "${escapeInline(ex)}"`);
    }
  }

  lines.push('', '---', '_Auto-generated daily from `/api/chat-insights`. Edits will be overwritten on the next run._');
  return lines.join('\n');
}

async function findOpenIssue() {
  const res = await gh(`/repos/${REPO}/issues?state=open&labels=${LABEL}&per_page=10`);
  if (!res.ok) return null;
  const issues = await res.json();
  // Filter out PRs (the issues endpoint includes them) and match our marker.
  return issues.find(i => !i.pull_request && (i.body || '').includes(MARKER)) || null;
}

async function ensureLabel() {
  const res = await gh(`/repos/${REPO}/labels`, {
    method: 'POST',
    body: JSON.stringify({ name: LABEL, color: '8250df', description: 'Unanswered personal questions from chat' })
  });
  // 201 created, 422 already exists — both fine.
  if (!res.ok && res.status !== 422) {
    console.warn('label ensure warning:', res.status, await res.text().catch(() => ''));
  }
}

async function main() {
  const res = await fetch(`${BASE_URL}/api/chat-insights?key=${encodeURIComponent(KEY)}&limit=1`);
  if (!res.ok) {
    console.error('insights fetch failed:', res.status, await res.text().catch(() => ''));
    process.exit(1);
  }
  const data = await res.json();
  const gaps = Array.isArray(data.gaps) ? data.gaps : [];
  console.log(`Found ${gaps.length} gap(s).`);

  const existing = await findOpenIssue();

  if (gaps.length === 0) {
    if (existing) {
      await gh(`/repos/${REPO}/issues/${existing.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: '✅ All chat gaps are answered. Closing — a new issue will open if more come in.' })
      });
      await gh(`/repos/${REPO}/issues/${existing.number}`, {
        method: 'PATCH', body: JSON.stringify({ state: 'closed' })
      });
      console.log(`Closed issue #${existing.number} (no gaps left).`);
    } else {
      console.log('No gaps and no open issue. Nothing to do.');
    }
    return;
  }

  const title = `🧠 KB gaps to fill (${gaps.length})`;
  const body = buildBody(gaps);

  if (existing) {
    const r = await gh(`/repos/${REPO}/issues/${existing.number}`, {
      method: 'PATCH', body: JSON.stringify({ title, body })
    });
    if (!r.ok) { console.error('update failed:', r.status, await r.text()); process.exit(1); }
    console.log(`Updated issue #${existing.number}.`);
  } else {
    await ensureLabel();
    const r = await gh(`/repos/${REPO}/issues`, {
      method: 'POST', body: JSON.stringify({ title, body, labels: [LABEL] })
    });
    if (!r.ok) { console.error('create failed:', r.status, await r.text()); process.exit(1); }
    const created = await r.json();
    console.log(`Created issue #${created.number}.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
