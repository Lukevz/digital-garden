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
    session: [],
    sessionNoteShown: false,
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
    if (mode !== state.mode || topic !== state.topic) {
      clearSessionMessages();
    }
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

  function clearSessionMessages() {
    state.session = [];
    state.sessionNoteShown = false;
    document.querySelectorAll('.fd-msg--session, .fd-session-note, .fd-work-msg--out, .fd-work-msg--concierge').forEach(el => el.remove());
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
    if (!state.sessionNoteShown) {
      const note = document.createElement('p');
      note.className = 'fd-session-note';
      note.setAttribute('aria-live', 'polite');
      note.textContent = 'Session only — not saved or transmitted';
      feedEl.appendChild(note);
      state.sessionNoteShown = true;
    }
    state.session.push({ role: 'user', text });
    scrollFeedToBottom();
  }

  function appendConcierge(text, feedEl) {
    if (!feedEl) return;
    if (state.mode === 'life') {
      const msg = document.createElement('article');
      msg.className = 'fd-msg fd-msg--in fd-msg--session';
      msg.setAttribute('aria-label', `Luke: ${text}`);
      msg.innerHTML = `<div class="fd-bubble">${escapeHtml(text)}</div>`;
      feedEl.appendChild(msg);
    } else {
      const msg = document.createElement('div');
      msg.className = 'fd-work-msg fd-work-msg--concierge';
      msg.setAttribute('aria-label', `Luke: ${text}`);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      msg.innerHTML = `
        <div class="fd-work-avatar" style="--av-color:#4a7ab5" aria-hidden="true">L</div>
        <div class="fd-work-body">
          <div class="fd-work-meta">
            <span class="fd-work-sender">Luke</span>
            <time class="fd-work-time">${escapeHtml(timeStr)}</time>
          </div>
          <div class="fd-work-text">${escapeHtml(text)}</div>
        </div>`;
      feedEl.appendChild(msg);
    }
    state.session.push({ role: 'concierge', text });
    scrollFeedToBottom();
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
        return { mode: rule.mode, topic: rule.topic, reply: rule.reply };
      }
    }
    return null;
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
    setTimeout(() => {
      const feedEl = document.querySelector(`.fd-feed[data-feed="${mapping.goto}"]`);
      if (!feedEl) return;
      appendOutgoing(chipText, feedEl);
      if (mapping.reply) {
        setTimeout(() => appendConcierge(mapping.reply, feedEl), 400);
      }
    }, 50);
  }

  /* ── Submit handler ───────────────────────────────────────────────── */

  function handleSubmit(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const route = routeFromText(trimmed);

    if (route) {
      // Navigate to matched topic, then append message + reply there
      switchTopic(route.mode, route.topic);
      setTimeout(() => {
        const feedEl = document.querySelector(`.fd-feed[data-feed="${route.mode}/${route.topic}"]`);
        appendOutgoing(trimmed, feedEl);
        if (route.reply) setTimeout(() => appendConcierge(route.reply, feedEl), 400);
      }, 50);
    } else {
      // No topic match — stay in current feed, show outgoing + generic reply
      const feedKey = `${state.mode}/${state.topic}`;
      const feedEl  = document.querySelector(`.fd-feed[data-feed="${feedKey}"]`);
      appendOutgoing(trimmed, feedEl);
      setTimeout(() => {
        const generic = "I'm a lightweight concierge — I work best with topic-specific questions. Try a chip below, or ask about photos, writing, case studies, or how to reach Luke.";
        appendConcierge(generic, feedEl);
      }, 400);
    }
  }

  function sendMessage(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
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

  if (input && sendBtn) {
    input.addEventListener('input', () => {
      const hasText = input.value.trim().length > 0;
      sendBtn.disabled = !hasText;
      sendBtn.classList.toggle('fd-send--ready', hasText);
      sendBtn.setAttribute('aria-disabled', String(!hasText));
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
