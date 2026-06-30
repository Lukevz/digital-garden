/**
 * front-door.js — Chat Front Door interactivity
 *
 * Handles: mode switching, topic routing, composer, chip concierge, URL state.
 *
 * State: { mode: 'life'|'work', topic: string, session: Message[], sessionNoteShown: bool }
 * All state is in-memory only. Nothing is persisted or transmitted.
 *
 * Future seam: replace `handleSubmit()` body with a real assistant endpoint
 * while keeping the same function signature and session append logic.
 */

(function () {
  'use strict';

  /* ── Data ─────────────────────────────────────────────────────────── */

  const dataEl = document.getElementById('fdData');
  const DATA = JSON.parse(dataEl ? dataEl.textContent : '{}');
  const CHIP_MAP = DATA.chipMap || {};

  /* ── State ─────────────────────────────────────────────────────────── */

  const state = {
    mode: 'life',
    topic: 'about',
    session: [],
    sessionNoteShown: false,
  };

  /* ── DOM refs ──────────────────────────────────────────────────────── */

  const win        = document.getElementById('fdWindow');
  const modeBtns   = document.querySelectorAll('.fd-mode-btn');
  const modeTrack  = document.getElementById('fdModeTrack');
  const convos     = document.querySelectorAll('.fd-convos .fd-convo');
  const channels   = document.querySelectorAll('.fd-channels .fd-ch');
  const feeds      = document.querySelectorAll('.fd-feed');
  const feedTitle  = document.getElementById('fdFeedTitle');
  const feedSub    = document.getElementById('fdFeedSub');
  const chipsWrap  = document.getElementById('fdChipsWrap');
  const form       = document.getElementById('fdComposer');
  const input      = document.getElementById('fdInput');
  const sendBtn    = document.getElementById('fdSend');

  /* ── Routing helpers ──────────────────────────────────────────────── */

  /** Parse current URL path or hash into { mode, topic }  */
  function parseRoute() {
    // Support path-based: /life/about, /work/case-studies
    const path = location.pathname.replace(/^\/front-door\/?/, '');
    const parts = path.split('/').filter(Boolean);

    if (parts[0] === 'life' || parts[0] === 'work') {
      return {
        mode: parts[0],
        topic: parts[1] || defaultTopic(parts[0]),
      };
    }

    // Fallback: hash-based #life/about
    const hash = location.hash.replace(/^#/, '');
    const hp = hash.split('/').filter(Boolean);
    if (hp[0] === 'life' || hp[0] === 'work') {
      return {
        mode: hp[0],
        topic: hp[1] || defaultTopic(hp[0]),
      };
    }

    return { mode: 'life', topic: 'about' };
  }

  function defaultTopic(mode) {
    const modeData = DATA[mode];
    if (!modeData || !modeData.topics) return mode === 'work' ? 'case-studies' : 'about';
    const def = modeData.topics.find(t => t.default);
    return def ? def.id : modeData.topics[0]?.id || 'about';
  }

  /** Push URL without reload */
  function pushRoute(mode, topic) {
    const url = `/front-door/${mode}/${topic}`;
    history.pushState({ mode, topic }, '', url);
    updatePageMeta(mode, topic);
  }

  /** Update <title> and OG meta per topic */
  function updatePageMeta(mode, topic) {
    const modeData = DATA[mode];
    const topicData = modeData?.topics?.find(t => t.id === topic);
    const label = topicData?.label || topic;
    const sub   = topicData?.sub   || '';
    const title = mode === 'work'
      ? `Luke · #${label}`
      : `Luke · ${label}`;
    document.title = title;
    const desc = sub || 'Software designer, design systems specialist, and compulsive note-taker.';
    setMeta('name', 'description', desc);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', `https://lukevz.com/front-door/${mode}/${topic}`);
  }

  function setMeta(attr, name, content) {
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  /* ── Mode pill animation ───────────────────────────────────────────── */

  function positionModeTrack() {
    const activeBtn = document.querySelector('.fd-mode-btn[aria-pressed="true"]');
    if (!activeBtn || !modeTrack) return;
    const parent = activeBtn.parentElement;
    const pRect  = parent.getBoundingClientRect();
    const bRect  = activeBtn.getBoundingClientRect();
    modeTrack.style.width  = bRect.width + 'px';
    modeTrack.style.transform = `translateX(${bRect.left - pRect.left - 3}px)`;
  }

  /* ── Render chips ─────────────────────────────────────────────────── */

  function renderChips(mode, topic) {
    if (!chipsWrap) return;
    const modeData = DATA[mode];
    const topicData = modeData?.topics?.find(t => t.id === topic);
    const chips = topicData?.chips || [];
    chipsWrap.innerHTML = '';
    chips.forEach(chip => {
      const btn = document.createElement('button');
      btn.className = 'fd-chip';
      btn.textContent = chip;
      btn.setAttribute('aria-label', chip);
      btn.addEventListener('click', () => handleChip(chip));
      chipsWrap.appendChild(btn);
    });
  }

  /* ── Topic switching ──────────────────────────────────────────────── */

  function switchTopic(mode, topic, pushUrl = true) {
    // Clear session on topic/mode change
    if (mode !== state.mode || topic !== state.topic) {
      clearSessionMessages();
    }

    state.mode  = mode;
    state.topic = topic;

    // Root element data attrs drive CSS skin
    win.setAttribute('data-fd-mode', mode);
    document.documentElement.setAttribute('data-fd-mode', mode);

    // Mode buttons
    modeBtns.forEach(btn => {
      const active = btn.dataset.mode === mode;
      btn.setAttribute('aria-pressed', String(active));
    });
    positionModeTrack();

    // Topic rail items
    convos.forEach(el => {
      const sel = el.dataset.topic === topic && mode === 'life';
      el.setAttribute('aria-selected', String(sel));
      el.classList.toggle('fd-convo--active', sel);
    });
    channels.forEach(el => {
      const sel = el.dataset.topic === topic && mode === 'work';
      el.setAttribute('aria-selected', String(sel));
    });

    // Show correct feed
    const feedKey = `${mode}/${topic}`;
    feeds.forEach(f => {
      const active = f.dataset.feed === feedKey;
      f.classList.toggle('fd-feed--active', active);
    });

    // Feed header
    const modeData = DATA[mode];
    const topicData = modeData?.topics?.find(t => t.id === topic);
    if (feedTitle) feedTitle.textContent = mode === 'work' ? topic : (topicData?.label || topic);
    if (feedSub)   feedSub.textContent   = topicData?.sub || '';

    // Chips
    renderChips(mode, topic);

    // URL
    if (pushUrl) pushRoute(mode, topic);

    // Scroll feed to bottom
    const activeFeed = document.querySelector(`.fd-feed[data-feed="${feedKey}"]`);
    const feedContainer = document.getElementById('fd-feeds');
    if (feedContainer && activeFeed) {
      // Small delay to let layout settle
      requestAnimationFrame(() => {
        feedContainer.scrollTop = feedContainer.scrollHeight;
      });
    }

    // Focus management — move focus to feed header when topic changes
    if (feedTitle) feedTitle.setAttribute('tabindex', '-1');
  }

  /* ── Session messages ─────────────────────────────────────────────── */

  function clearSessionMessages() {
    state.session = [];
    state.sessionNoteShown = false;
    // Remove session DOM nodes from all feeds
    document.querySelectorAll('.fd-msg--session, .fd-session-note, .fd-work-msg--out, .fd-work-msg--concierge').forEach(el => el.remove());
  }

  /** Append a visitor (outgoing) message */
  function appendOutgoing(text, feedEl) {
    if (!feedEl) return;

    if (state.mode === 'life') {
      const msg = document.createElement('article');
      msg.className = 'fd-msg fd-msg--session fd-msg--out';
      msg.setAttribute('aria-label', `You: ${text}`);
      msg.innerHTML = `<div class="fd-bubble">${escapeHtml(text)}</div>`;
      feedEl.appendChild(msg);

      if (!state.sessionNoteShown) {
        const note = document.createElement('p');
        note.className = 'fd-session-note';
        note.setAttribute('aria-live', 'polite');
        note.textContent = 'Session only — not saved or transmitted';
        feedEl.appendChild(note);
        state.sessionNoteShown = true;
      }
    } else {
      // Work skin: full message row
      const msg = document.createElement('div');
      msg.className = 'fd-work-msg fd-work-msg--out';
      msg.setAttribute('aria-label', `You: ${text}`);
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      msg.innerHTML = `
        <div class="fd-work-avatar" style="--av-color:var(--link)" aria-hidden="true">You</div>
        <div class="fd-work-body">
          <div class="fd-work-meta">
            <span class="fd-work-sender fd-work-sender--you">You</span>
            <time class="fd-work-time">${escapeHtml(timeStr)}</time>
          </div>
          <div class="fd-work-text">${escapeHtml(text)}</div>
          ${!state.sessionNoteShown ? '<p class="fd-session-note" style="margin-top:4px;padding:0">Session only — not saved or transmitted</p>' : ''}
        </div>`;
      feedEl.appendChild(msg);
      if (!state.sessionNoteShown) state.sessionNoteShown = true;
    }

    state.session.push({ role: 'user', text });
    scrollFeedToBottom();
  }

  /** Append a concierge (incoming scripted) reply */
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
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    const feedContainer = document.getElementById('fd-feeds');
    if (feedContainer) {
      feedContainer.scrollTop = feedContainer.scrollHeight;
    }
  }

  /* ── Chip handler ─────────────────────────────────────────────────── */

  function handleChip(chipText) {
    const mapping = CHIP_MAP[chipText];
    if (!mapping) {
      // Unknown chip: treat as free text
      sendMessage(chipText);
      return;
    }

    const [targetMode, targetTopic] = mapping.goto.split('/');

    // Navigate (may clear session if topic changes)
    switchTopic(targetMode, targetTopic);

    // Brief timeout to let the feed render before appending session messages
    setTimeout(() => {
      const feedEl = document.querySelector(`.fd-feed[data-feed="${mapping.goto}"]`);
      if (!feedEl) return;

      appendOutgoing(chipText, feedEl);

      if (mapping.reply) {
        appendConcierge(mapping.reply, feedEl);
      }
    }, 50);
  }

  /* ── Submit handler ───────────────────────────────────────────────── */

  /**
   * v1: ephemeral session behavior — outgoing bubble + one-time session note.
   *
   * Future seam: replace this function body to call a real assistant endpoint.
   * Keep the function signature and the appendOutgoing() call so the UX shell
   * remains intact regardless of what the back-end does.
   */
  function handleSubmit(text) {
    if (!text.trim()) return;

    const feedKey = `${state.mode}/${state.topic}`;
    const feedEl = document.querySelector(`.fd-feed[data-feed="${feedKey}"]`);
    appendOutgoing(text, feedEl);

    // v1: no assistant answer for free text
    // (chip answers are handled in handleChip)
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

  // Mode switch buttons
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      const topic = defaultTopic(mode);
      switchTopic(mode, topic);
    });
  });

  // Life conversations
  convos.forEach(el => {
    function activate() {
      const topic = el.dataset.topic;
      if (topic) switchTopic('life', topic);
    }
    el.addEventListener('click', activate);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });

  // Work channels
  channels.forEach(el => {
    function activate() {
      const topic = el.dataset.topic;
      if (topic) switchTopic('work', topic);
    }
    el.addEventListener('click', activate);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });

  // Composer input → enable/disable send button
  if (input && sendBtn) {
    input.addEventListener('input', () => {
      const hasText = input.value.trim().length > 0;
      sendBtn.disabled = !hasText;
      sendBtn.classList.toggle('fd-send--ready', hasText);
      sendBtn.setAttribute('aria-disabled', String(!hasText));
    });

    // Enter key submits (Shift+Enter does nothing — single-line input)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input.value);
      }
    });
  }

  // Form submit
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (input) sendMessage(input.value);
    });
  }

  // Send button click
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      if (input) sendMessage(input.value);
    });
  }

  // Browser back/forward
  window.addEventListener('popstate', e => {
    const r = (e.state && e.state.mode)
      ? e.state
      : parseRoute();
    switchTopic(r.mode, r.topic, false);
  });

  /* ── Keyboard: roving focus in rail ──────────────────────────────── */

  function setupRovingFocus(items) {
    items.forEach((item, i) => {
      item.addEventListener('keydown', e => {
        let next = null;
        if (e.key === 'ArrowDown') { e.preventDefault(); next = items[i + 1]; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); next = items[i - 1]; }
        if (next) {
          next.focus();
        }
      });
    });
  }

  setupRovingFocus(Array.from(convos));
  setupRovingFocus(Array.from(channels));

  /* ── Init ─────────────────────────────────────────────────────────── */

  function init() {
    const route = parseRoute();

    // Replace state so back button works from initial load
    history.replaceState({ mode: route.mode, topic: route.topic }, '');

    // Apply initial state without pushing a new history entry
    switchTopic(route.mode, route.topic, false);

    // Position the mode track pill
    // Wait for fonts/layout to settle
    requestAnimationFrame(() => {
      positionModeTrack();
    });

    // Re-position on resize (responsive layout changes button sizes)
    window.addEventListener('resize', positionModeTrack, { passive: true });
  }

  init();

})();
