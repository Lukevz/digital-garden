/**
 * front-door.js — Chat Front Door interactivity
 *
 * State: { mode, topic, session[], sessionNoteShown }
 * All state is volatile. Nothing is persisted or transmitted.
 */

(function () {
  'use strict';

  /* ── Data ─────────────────────────────────────────────────────────── */

  const dataEl = document.getElementById('fdData');
  const DATA   = JSON.parse(dataEl ? dataEl.textContent : '{}');
  const CHIP_MAP = DATA.chipMap || {};

  /* ── State ─────────────────────────────────────────────────────────── */

  const state = {
    mode: 'life',
    topic: 'about',
    histories: new Map(),
    notesShown: new Set(),
    streaming: false,
  };

  /* ── DOM refs ──────────────────────────────────────────────────────── */

  const win       = document.getElementById('fdWindow');
  const modeBtns  = document.querySelectorAll('.fd-mode-btn');
  const modeTrack = document.getElementById('fdModeTrack');
  const convos    = document.querySelectorAll('.fd-convos .fd-convo');
  const channels  = document.querySelectorAll('.fd-channels .fd-ch');
  const feeds     = document.querySelectorAll('.fd-feed');
  const feedTitle = document.getElementById('fdFeedTitle');
  const feedSub   = document.getElementById('fdFeedSub');
  const chipsWrap = document.getElementById('fdChipsWrap');
  const form      = document.getElementById('fdComposer');
  const input     = document.getElementById('fdInput');
  const sendBtn   = document.getElementById('fdSend');
  const pane      = document.querySelector('.fd-pane');
  const detail    = document.getElementById('fdDetail');
  const detailBack = document.getElementById('fdDetailBack');
  const detailKicker = document.getElementById('fdDetailKicker');
  const detailTitle = document.getElementById('fdDetailTitle');
  const detailContent = document.getElementById('fdDetailContent');

  /* ── Routing helpers ──────────────────────────────────────────────── */

  function parseRoute() {
    const path = location.pathname
      .replace(/^\/front-door\/?/, '/')
      .replace(/^\/$/, '');
    const parts = path.split('/').filter(Boolean);

    if (parts[0] === 'life' || parts[0] === 'work') {
      return { mode: parts[0], topic: parts[1] || defaultTopic(parts[0]) };
    }
    const hash = location.hash.replace(/^#/, '');
    const hp   = hash.split('/').filter(Boolean);
    if (hp[0] === 'life' || hp[0] === 'work') {
      return { mode: hp[0], topic: hp[1] || defaultTopic(hp[0]) };
    }
    return { mode: 'life', topic: 'about' };
  }

  function defaultTopic(mode) {
    const modeData = DATA[mode];
    if (!modeData?.topics) return mode === 'work' ? 'case-studies' : 'about';
    const def = modeData.topics.find(t => t.default);
    return def ? def.id : (modeData.topics[0]?.id || 'about');
  }

  function pushRoute(mode, topic) {
    const url = `/${mode}/${topic}`;
    history.pushState({ mode, topic }, '', url);
    updatePageMeta(mode, topic);
  }

  function updatePageMeta(mode, topic) {
    const modeData  = DATA[mode];
    const topicData = modeData?.topics?.find(t => t.id === topic);
    const label = topicData?.label || topic;
    const sub   = topicData?.sub   || '';
    const title = mode === 'work' ? `Luke · #${label}` : `Luke · ${label}`;
    document.title = title;
    const desc = sub || 'Software designer, design systems specialist, and compulsive note-taker.';
    setMeta('name',     'description',  desc);
    setMeta('property', 'og:title',     title);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', `https://lukevz.com/${mode}/${topic}`);
  }

  function setMeta(attr, name, content) {
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
    el.setAttribute('content', content);
  }

  /* ── Mode pill animation ───────────────────────────────────────────── */

  function positionModeTrack() {
    const activeBtn = document.querySelector('.fd-mode-btn[aria-pressed="true"]');
    if (!activeBtn || !modeTrack) return;
    const parent = activeBtn.parentElement;
    const pRect  = parent.getBoundingClientRect();
    const bRect  = activeBtn.getBoundingClientRect();
    modeTrack.style.width     = bRect.width + 'px';
    modeTrack.style.transform = `translateX(${bRect.left - pRect.left - 3}px)`;
  }

  /* ── Render chips ─────────────────────────────────────────────────── */

  function renderChips(mode, topic) {
    if (!chipsWrap) return;
    const modeData  = DATA[mode];
    const topicData = modeData?.topics?.find(t => t.id === topic);
    const chips = topicData?.chips || [];
    chipsWrap.innerHTML = '';
    chips.forEach(chip => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fd-chip';
      btn.textContent = chip;
      btn.setAttribute('aria-label', chip);
      btn.addEventListener('click', () => handleChip(chip));
      chipsWrap.appendChild(btn);
    });
  }

  /* ── Topic switching ──────────────────────────────────────────────── */

  function switchTopic(mode, topic, pushUrl = true) {
    closeDetail(false);
    state.mode  = mode;
    state.topic = topic;

    win.setAttribute('data-fd-mode', mode);
    document.documentElement.setAttribute('data-fd-mode', mode);

    modeBtns.forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
    positionModeTrack();

    convos.forEach(el => {
      const sel = el.dataset.topic === topic && mode === 'life';
      el.setAttribute('aria-selected', String(sel));
    });
    channels.forEach(el => {
      const sel = el.dataset.topic === topic && mode === 'work';
      el.setAttribute('aria-selected', String(sel));
    });

    const feedKey = `${mode}/${topic}`;
    feeds.forEach(f => f.classList.toggle('fd-feed--active', f.dataset.feed === feedKey));

    const modeData  = DATA[mode];
    const topicData = modeData?.topics?.find(t => t.id === topic);
    if (feedTitle) feedTitle.textContent = mode === 'work' ? topic : (topicData?.label || topic);
    if (feedSub)   feedSub.textContent   = topicData?.sub || '';

    renderChips(mode, topic);
    if (pushUrl) pushRoute(mode, topic);
    scrollFeedToBottom();
  }

  /* ── Session messages ─────────────────────────────────────────────── */

  function currentFeedKey() {
    return `${state.mode}/${state.topic}`;
  }

  function getHistory(feedKey) {
    if (!state.histories.has(feedKey)) state.histories.set(feedKey, []);
    return state.histories.get(feedKey);
  }

  function appendOutgoing(text, feedEl) {
    if (!feedEl) return;
    if (state.mode === 'life') {
      const msg = document.createElement('article');
      msg.className = 'fd-msg fd-msg--session fd-msg--out';
      msg.setAttribute('aria-label', `You: ${text}`);
      msg.innerHTML = `<div class="fd-bubble">${escapeHtml(text)}</div>`;
      feedEl.appendChild(msg);
    } else {
      const msg = document.createElement('div');
      msg.className = 'fd-work-msg fd-work-msg--out';
      msg.setAttribute('aria-label', `You: ${text}`);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      msg.innerHTML = `
        <div class="fd-work-avatar" style="--av-color:var(--link)" aria-hidden="true">You</div>
        <div class="fd-work-body">
          <div class="fd-work-meta">
            <span class="fd-work-sender fd-work-sender--you">You</span>
            <time class="fd-work-time">${escapeHtml(timeStr)}</time>
          </div>
          <div class="fd-work-text">${escapeHtml(text)}</div>
        </div>`;
      feedEl.appendChild(msg);
    }
    const feedKey = feedEl.dataset.feed || currentFeedKey();
    if (!state.notesShown.has(feedKey)) {
      const note = document.createElement('p');
      note.className = 'fd-session-note';
      note.setAttribute('aria-live', 'polite');
      note.textContent = 'Session only — not saved or transmitted';
      feedEl.appendChild(note);
      state.notesShown.add(feedKey);
    }
    scrollFeedToBottom();
  }

  function appendAssistantMessage(feedEl) {
    if (!feedEl) return;
    if (state.mode === 'life') {
      const msg = document.createElement('article');
      msg.className = 'fd-msg fd-msg--in fd-msg--assistant';
      msg.setAttribute('aria-label', 'Luke response');
      msg.innerHTML = '<div class="fd-bubble fd-bubble--stream">Luke is typing…</div>';
      feedEl.appendChild(msg);
      scrollFeedToBottom();
      return msg.querySelector('.fd-bubble');
    } else {
      const msg = document.createElement('div');
      msg.className = 'fd-work-msg fd-work-msg--assistant';
      msg.setAttribute('aria-label', 'Luke response');
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      msg.innerHTML = `
        <div class="fd-work-avatar" style="--av-color:#4a7ab5" aria-hidden="true">L</div>
        <div class="fd-work-body">
          <div class="fd-work-meta">
            <span class="fd-work-sender">Luke</span>
            <time class="fd-work-time">${escapeHtml(timeStr)}</time>
          </div>
          <div class="fd-work-text fd-bubble--stream">Luke is typing…</div>
        </div>`;
      feedEl.appendChild(msg);
      scrollFeedToBottom();
      return msg.querySelector('.fd-work-text');
    }
  }

  function scrollFeedToBottom() {
    const fc = document.getElementById('fd-feeds');
    if (fc) requestAnimationFrame(() => { fc.scrollTop = fc.scrollHeight; });
  }

  /* ── Keyword-based topic routing ──────────────────────────────────── */

  const TOPIC_ROUTES = [
    // Work — checked first so "resume/career" doesn't match life accidentally
    { rx: /\bresume\b|cv\b|download.*pdf/i,                               mode: 'work', topic: 'resume',             reply: "Resume is in #resume — PDF linked there. LinkedIn too if that's easier." },
    { rx: /\bcase stud|what.ve you built|portfolio|projects?\b|work you.ve done/i, mode: 'work', topic: 'case-studies', reply: "Four published case studies in #case-studies. Start with the AI automation one — 30% time savings is the headline." },
    { rx: /\bdesign system|axon\b|component|figma\b|tokens\b/i,          mode: 'work', topic: 'axon-design-system',  reply: "Axon is Instinct's design system. Overview is in #axon-design-system — NDA means no screenshots, but context is there." },
    { rx: /\bvet(erinar)?|instinct\b|clinical|medical\b|vetguide/i,       mode: 'work', topic: 'vetguide',            reply: "VetGuide is Instinct's clinical reference tool — I'm leading the redesign. See #vetguide for context." },
    { rx: /\bcareer|experience|background|pwc\b|history\b|timeline|worked|job/i, mode: 'work', topic: 'career', reply: "Full timeline in #career — YouTube channel → freelance → PwC (5 yrs) → Instinct." },
    // Life
    { rx: /\bphoto|camera|fuji|shoot|picture|film\b|frame/i,             mode: 'life', topic: 'photos',   reply: "Shooting on Fujifilm X-S20. Frames from Atlanta in the Photos feed." },
    { rx: /\bwrit|essay|book|reading|note|article/i,                     mode: 'life', topic: 'writing',  reply: "Notes in Writing — book takeaways plus a digital garden essay. Atomic Habits and BASB are the strongest." },
    { rx: /\byoutube|video|channel|watch/i,                              mode: 'life', topic: 'videos',   reply: "Two YouTube channels — one personal, one UX-focused. Both linked in Videos." },
    { rx: /\blab|side project|hack|52\b|app\b/i,                         mode: 'life', topic: 'labs',     reply: "Labs is coming — 52 (work-week note-taking) is what I'm building. That feed will fill in." },
    { rx: /\bcontact|reach|hire|email|dm\b|linkedin|work with|available/i, mode: 'life', topic: 'about',  reply: "Best path: LinkedIn DM → linkedin.com/in/lukevz/ — or drop me a message here." },
  ];

  function routeFromText(text) {
    for (const rule of TOPIC_ROUTES) {
      if (rule.rx.test(text)) {
    return { mode: rule.mode, topic: rule.topic };
      }
    }
    return null;
  }

  function topicInstruction(mode, topic) {
    const topicData = DATA[mode]?.topics?.find(t => t.id === topic);
    const label = mode === 'work' ? `#${topic}` : (topicData?.label || topic);
    return [
      `Context: the visitor is currently in the ${mode} section, topic "${label}".`,
      'Answer normally in Luke\'s voice, but keep the answer scoped to this topic when that makes sense.',
      'If the question belongs somewhere else, briefly answer and mention the better topic.',
      'Visitor message:',
    ].join('\n');
  }

  function messagesForApi(feedKey, userText) {
    const [mode, topic] = feedKey.split('/');
    const history = getHistory(feedKey).slice(-12);
    return [
      ...history,
      { role: 'user', content: `${topicInstruction(mode, topic)}\n${userText}` }
    ];
  }

  async function streamChat(messages, onToken) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok || !res.body) {
      let detail = '';
      try {
        const data = await res.json();
        detail = data?.error || data?.detail || '';
      } catch (_) {}
      throw new Error(detail || `Chat failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const token = json?.choices?.[0]?.delta?.content || '';
          if (token) onToken(token);
        } catch (_) {
          // Ignore partial/non-JSON event lines.
        }
      }
    }
  }

  function setComposerBusy(isBusy) {
    state.streaming = isBusy;
    if (input) {
      input.disabled = isBusy;
      input.placeholder = isBusy ? 'Luke is typing…' : 'Ask me anything…';
    }
    if (sendBtn) {
      sendBtn.disabled = isBusy || !(input?.value || '').trim();
      sendBtn.classList.toggle('fd-send--ready', !sendBtn.disabled);
    }
  }

  /* ── In-pane detail takeover ──────────────────────────────────────── */

  function closeDetail(restoreFocus = true) {
    if (!pane || !detail) return;
    pane.classList.remove('fd-pane--detail');
    detail.setAttribute('aria-hidden', 'true');
    if (restoreFocus) {
      const activeRail = state.mode === 'work'
        ? document.querySelector(`.fd-ch[data-topic="${state.topic}"]`)
        : document.querySelector(`.fd-convo[data-topic="${state.topic}"]`);
      activeRail?.focus?.();
    }
  }

  function showDetail({ title, kicker, html }) {
    if (!pane || !detail || !detailContent) return;
    if (detailTitle) detailTitle.textContent = title || 'Detail';
    if (detailKicker) detailKicker.textContent = kicker || 'Back to thread';
    detailContent.innerHTML = html || '<p>Nothing to show yet.</p>';
    pane.classList.add('fd-pane--detail');
    detail.setAttribute('aria-hidden', 'false');
    detail.querySelector('.fd-detail-body')?.scrollTo({ top: 0 });
    detailBack?.focus?.();
  }

  async function openDetail(trigger) {
    const kind = trigger.dataset.detailKind || 'inline';
    const title = trigger.dataset.detailTitle || trigger.textContent.trim() || 'Detail';
    const kicker = trigger.dataset.detailKicker || (state.mode === 'work' ? `#${state.topic}` : state.topic);

    showDetail({ title, kicker, html: '<p>Loading…</p>' });

    if (kind === 'markdown') {
      try {
        const src = trigger.dataset.detailSrc || trigger.getAttribute('href');
        const res = await fetch(src);
        if (!res.ok) throw new Error(`content ${res.status}`);
        const raw = await res.text();
        const rendered = renderMarkdownDetail(raw, src, title);
        showDetail({ title: rendered.title || title, kicker, html: rendered.html });
      } catch (err) {
        console.warn('[front-door] detail failed:', err);
        showDetail({
          title,
          kicker,
          html: '<p>Could not load this content. Try again in a second.</p>',
        });
      }
      return;
    }

    if (kind === 'image') {
      const src = trigger.dataset.detailSrc || trigger.querySelector('img')?.getAttribute('src') || '';
      const body = trigger.dataset.detailBody || trigger.querySelector('.fd-photo-recipe')?.textContent || '';
      showDetail({
        title,
        kicker,
        html: `<img src="${escapeAttr(src)}" alt="${escapeAttr(title)}" loading="lazy">${body ? `<p>${escapeHtml(body)}</p>` : ''}`,
      });
      return;
    }

    const body = trigger.dataset.detailBody || 'More detail coming soon.';
    const url = trigger.dataset.detailUrl || trigger.getAttribute('href');
    const cta = url && !url.startsWith('#')
      ? `<p><a class="fd-detail-external" href="${escapeAttr(url)}" target="_blank" rel="noopener">Open original ↗</a></p>`
      : '';
    showDetail({
      title,
      kicker,
      html: `<p>${escapeHtml(body)}</p>${cta}`,
    });
  }

  function parseFrontmatter(md) {
    const match = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!match) return { meta: {}, body: md };
    const meta = {};
    match[1].split('\n').forEach(line => {
      const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
    return { meta, body: md.slice(match[0].length) };
  }

  function renderMarkdownDetail(raw, src, fallbackTitle) {
    const { meta, body } = parseFrontmatter(raw);
    const title = meta.title || firstMarkdownTitle(body) || fallbackTitle;
    const basePath = src.split('/').slice(0, -1).join('/');
    const metaHtml = ['company', 'job', 'timeline', 'tag', 'date']
      .filter(key => meta[key])
      .map(key => `<span class="fd-detail-pill">${escapeHtml(meta[key])}</span>`)
      .join('');
    const headline = meta.headline ? `<p><strong>${escapeHtml(meta.headline)}</strong></p>` : '';
    const html = `${metaHtml ? `<div class="fd-detail-meta">${metaHtml}</div>` : ''}${headline}${markdownToHtml(body, basePath)}`;
    return { title, html };
  }

  function firstMarkdownTitle(md) {
    const line = md.split('\n').find(l => /^#\s+/.test(l));
    return line ? line.replace(/^#\s+/, '').trim() : '';
  }

  function markdownToHtml(md, basePath) {
    const lines = md
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter(line => !/^#(?:[A-Za-z0-9_/-]+|\s*output\/|\s*commonplace\/)/.test(line.trim()));

    let html = '';
    let paragraph = [];
    let listType = null;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html += `<p>${renderInline(paragraph.join(' '), basePath)}</p>`;
      paragraph = [];
    };
    const closeList = () => {
      if (!listType) return;
      html += `</${listType}>`;
      listType = null;
    };
    const openList = type => {
      if (listType === type) return;
      closeList();
      listType = type;
      html += `<${type}>`;
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line === '---' || line === '- ---') {
        flushParagraph();
        closeList();
        continue;
      }

      const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (img) {
        flushParagraph();
        closeList();
        html += `<img src="${escapeAttr(resolveAssetUrl(img[2], basePath))}" alt="${escapeAttr(img[1])}" loading="lazy">`;
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = Math.min(heading[1].length, 3);
        html += `<h${level}>${renderInline(heading[2], basePath)}</h${level}>`;
        continue;
      }

      const ordered = line.match(/^\d+\.\s+(.+)$/);
      if (ordered) {
        flushParagraph();
        openList('ol');
        html += `<li>${renderInline(ordered[1], basePath)}</li>`;
        continue;
      }

      const unordered = line.match(/^[-*]\s+(.+)$/);
      if (unordered) {
        flushParagraph();
        openList('ul');
        html += `<li>${renderInline(unordered[1], basePath)}</li>`;
        continue;
      }

      closeList();
      paragraph.push(line);
    }

    flushParagraph();
    closeList();
    return html;
  }

  function renderInline(text, basePath) {
    return escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
        const href = resolveAssetUrl(url, basePath);
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener">${label}</a>`;
      })
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, (_m, prefix, url) => {
        return `${prefix}<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
      });
  }

  function resolveAssetUrl(url, basePath) {
    const clean = String(url || '').trim();
    if (/^(https?:)?\/\//.test(clean) || clean.startsWith('/') || clean.startsWith('#')) return clean;
    return `${basePath}/${clean}`;
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/`/g, '&#96;');
  }

  /* ── Chip handler ─────────────────────────────────────────────────── */

  function handleChip(chipText) {
    const mapping = CHIP_MAP[chipText];
    if (!mapping) {
      sendMessage(chipText);
      return;
    }
    const [targetMode, targetTopic] = mapping.goto.split('/');
    switchTopic(targetMode, targetTopic);
    if (input) {
      input.value = chipText.replace(/\s*→\s*$/, '');
      input.dispatchEvent(new Event('input'));
      input.focus();
    }
  }

  /* ── Submit handler ───────────────────────────────────────────────── */

  async function handleSubmit(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const route = routeFromText(trimmed);
    const targetMode = route?.mode || state.mode;
    const targetTopic = route?.topic || state.topic;
    const feedKey = `${targetMode}/${targetTopic}`;

    if (route && (route.mode !== state.mode || route.topic !== state.topic)) {
      switchTopic(route.mode, route.topic);
    }

    const feedEl = document.querySelector(`.fd-feed[data-feed="${feedKey}"]`);
    appendOutgoing(trimmed, feedEl);
    const history = getHistory(feedKey);
    const apiMessages = messagesForApi(feedKey, trimmed);
    history.push({ role: 'user', content: trimmed });

    const assistantEl = appendAssistantMessage(feedEl);
    if (!assistantEl) return;

    let answer = '';
    setComposerBusy(true);
    try {
      await streamChat(apiMessages, token => {
        answer += token;
        assistantEl.textContent = answer;
        scrollFeedToBottom();
      });
      const finalAnswer = answer.trim() || "I don't have a good answer for that yet.";
      assistantEl.textContent = finalAnswer;
      history.push({ role: 'assistant', content: finalAnswer });
    } catch (err) {
      const fallback = 'Something broke on my end. Try that again in a second.';
      assistantEl.textContent = fallback;
      console.warn('[front-door] chat failed:', err);
    } finally {
      setComposerBusy(false);
    }
  }

  function sendMessage(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || state.streaming) return;
    handleSubmit(trimmed);
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }
  }

  /* ── Utility ──────────────────────────────────────────────────────── */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ── Event listeners ──────────────────────────────────────────────── */

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      switchTopic(mode, defaultTopic(mode));
    });
  });

  convos.forEach(el => {
    function activate() { const t = el.dataset.topic; if (t) switchTopic('life', t); }
    el.addEventListener('click', activate);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
  });

  channels.forEach(el => {
    function activate() { const t = el.dataset.topic; if (t) switchTopic('work', t); }
    el.addEventListener('click', activate);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
  });

  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-detail-kind]');
    if (!trigger) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openDetail(trigger);
  });

  document.addEventListener('keydown', e => {
    const trigger = e.target.closest('[data-detail-kind]');
    if (!trigger) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openDetail(trigger);
  });

  if (detailBack) {
    detailBack.addEventListener('click', () => closeDetail());
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pane?.classList.contains('fd-pane--detail')) {
      closeDetail();
    }
  });

  if (input && sendBtn) {
    input.addEventListener('input', () => {
      const hasText = input.value.trim().length > 0;
      sendBtn.disabled = state.streaming || !hasText;
      sendBtn.classList.toggle('fd-send--ready', !sendBtn.disabled);
      sendBtn.setAttribute('aria-disabled', String(sendBtn.disabled));
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input.value); }
    });
  }

  // Single submit path — form submit only (send button is type="button", fires click only)
  if (sendBtn) {
    sendBtn.addEventListener('click', () => sendMessage(input?.value || ''));
  }
  if (form) {
    form.addEventListener('submit', e => { e.preventDefault(); });
  }

  window.addEventListener('popstate', e => {
    const r = (e.state?.mode) ? e.state : parseRoute();
    switchTopic(r.mode, r.topic, false);
  });

  function setupRovingFocus(items) {
    items.forEach((item, i) => {
      item.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); items[i + 1]?.focus(); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); items[i - 1]?.focus(); }
      });
    });
  }
  setupRovingFocus(Array.from(convos));
  setupRovingFocus(Array.from(channels));

  /* ── Init ─────────────────────────────────────────────────────────── */

  function init() {
    const route = parseRoute();
    history.replaceState({ mode: route.mode, topic: route.topic }, '');
    switchTopic(route.mode, route.topic, false);
    requestAnimationFrame(positionModeTrack);
    window.addEventListener('resize', positionModeTrack, { passive: true });
  }

  init();

})();
