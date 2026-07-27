/**
 * Chat module — handles message send/receive/render for the Chat tab.
 * Posts to /api/chat with the full message history, streams SSE response back,
 * renders tokens into the transcript.
 *
 * Exposes window.chat = { init, focus } for main.js to call.
 */
(function () {
  const messages = [];
  let inflight = false;
  let initialized = false;

  // --- Mock mode -------------------------------------------------------------
  // Test the chat UI (bubbles, streaming, markdown, links, error states)
  // without hitting /api/chat, so styling/UX work burns zero Gemini tokens.
  // Enable with ?chatmock=1 in the URL (this page load only), or persistently
  // from the console with chat.mock(true) / off with chat.mock(false).
  // In mock mode, message keywords pick a fixture: help, short, long, links,
  // md, empty, error, 429, netfail. Anything else cycles canned replies.
  const MOCK_KEY = 'chatMockMode';
  let mockMode = false;
  try {
    mockMode = localStorage.getItem(MOCK_KEY) === '1' || /[?&]chatmock=1/.test(location.search);
  } catch (e) { /* storage unavailable — URL param only */ }

  const MOCK_REPLIES = [
    "Honestly, the one I'm keeping is the BenQ. The thing is, once you stop chasing specs and just live with a monitor for 30 hours a week, the answer gets obvious fast.",
    "I work from home, so it's coffee, breakfast, a voice journal to clear my head, then a pretty solid 9 to 5. After that I'm at the gym or on a walk with my wife.",
    "Haven't really thought about that, honestly. Ask me about design systems or my note-taking setup though — I can talk about those all day.",
  ];
  let mockReplyIndex = 0;

  const MOCK_FIXTURES = {
    help: "Mock commands: **short**, **long**, **links**, **md**, **empty**, **error**, **429**, **netfail**. Anything else cycles a few canned replies. Toggle with `chat.mock(false)`.",
    short: "Cats, and I don't even have to think about it.",
    long: "Honestly it was a long, winding road. I started a Mac tutorial channel on YouTube as a teenager and taught myself design, video, and code from scratch, then did years of freelance and agency work before landing in UX properly.\n\nAnd so by the time I got the official title, I'd already been doing the work for a decade. The thing is, that path taught me more about shipping real things than any bootcamp could have — I was debugging my own site at 2am because nobody else was going to.\n\nAt the end of the day, I think the winding road was the point. You pick up taste from making a thousand small judgment calls, not from following a curriculum. That works for me.",
    links: "You can find me on linkedin.com/in/lukevz or check out [my work](https://lukevz.com/work) — the side project lives at https://github.com/lukevz too. And so if you want the full story, /work has it. I wrote the whole thing up [right here](/#writing/the-search-for-the-best-todo-app), and there's a bunch more at /#photos and /bookshelf.",
    md: "The **big thing** is keeping it *plain text* — my whole setup runs on markdown and a folder called `posts`. **Bold**, *italic*, and `inline code` all show up in real answers, which means the styling has to hold up.",
  };

  function sseChunk(text) {
    return 'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n';
  }

  function mockFetch(history) {
    const lastUser = [...history].reverse().find(m => m.role === 'user');
    const cmd = (lastUser?.content || '').trim().toLowerCase();

    if (cmd === 'netfail') return Promise.reject(new TypeError('mock network failure'));
    if (cmd === 'error') return Promise.resolve(new Response('mock upstream error', { status: 500 }));
    if (cmd === '429') return Promise.resolve(new Response('mock rate limit', { status: 429 }));

    let reply;
    if (cmd === 'empty') reply = '';
    else if (MOCK_FIXTURES[cmd]) reply = MOCK_FIXTURES[cmd];
    else reply = MOCK_REPLIES[mockReplyIndex++ % MOCK_REPLIES.length];

    const encoder = new TextEncoder();
    const words = reply.match(/\S+\s*/g) || [];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const stream = new ReadableStream({
      async start(controller) {
        await sleep(500); // fake first-token latency so the typing indicator shows
        for (const w of words) {
          controller.enqueue(encoder.encode(sseChunk(w)));
          await sleep(24);
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
    return Promise.resolve(new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    }));
  }

  // --- Turnstile bot gate ----------------------------------------------------
  // The API requires a Cloudflare Turnstile token on the first message of a
  // session (it answers 403 turnstile_required otherwise), then a cookie covers
  // the rest. The widget is interaction-only: invisible unless Cloudflare
  // decides this visitor needs a visible challenge.
  const TURNSTILE_SITE_KEY = '0x4AAAAAAD4EHF7zNz6Hs47_';
  let turnstileScriptPromise = null;

  function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    if (!turnstileScriptPromise) {
      turnstileScriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => { turnstileScriptPromise = null; reject(new Error('turnstile script failed')); };
        document.head.appendChild(s);
      });
    }
    return turnstileScriptPromise;
  }

  function getTurnstileToken() {
    return loadTurnstileScript().then(() => new Promise((resolve) => {
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:10000;';
      document.body.appendChild(holder);
      let widgetId;
      const finish = (token) => {
        try { if (widgetId !== undefined) window.turnstile.remove(widgetId); } catch (e) { /* already gone */ }
        holder.remove();
        resolve(token);
      };
      try {
        widgetId = window.turnstile.render(holder, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          callback: (token) => finish(token),
          'error-callback': () => finish(null),
          'unsupported-callback': () => finish(null)
        });
        if (widgetId === undefined) finish(null);
      } catch (e) {
        finish(null);
      }
    })).catch(() => null);
  }

  // Single fetch entry point for both the transcript and the headless hero
  // path — mock mode swaps the transport, everything downstream is identical.
  async function chatFetch(history, turnstileToken) {
    if (mockMode) return mockFetch(history);
    const body = { messages: history };
    if (turnstileToken) body.turnstileToken = turnstileToken;
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    // First message of a session: solve the (usually invisible) Turnstile
    // challenge and retry once with the token.
    if (res.status === 403 && !turnstileToken) {
      let tag = null;
      try { tag = (await res.clone().json()).error; } catch (e) { /* not JSON */ }
      if (tag === 'turnstile_required') {
        const token = await getTurnstileToken();
        if (token) return chatFetch(history, token);
      }
    }
    return res;
  }

  function updateMockBadge() {
    let badge = document.getElementById('chatMockBadge');
    if (!mockMode) {
      if (badge) badge.remove();
      return;
    }
    if (badge) return;
    badge = document.createElement('button');
    badge.id = 'chatMockBadge';
    badge.className = 'chat-mock-badge';
    badge.type = 'button';
    badge.textContent = 'chat test mode — no tokens';
    badge.title = 'Click to turn off (or chat.mock(false) in the console)';
    badge.addEventListener('click', () => setMockMode(false));
    document.body.appendChild(badge);
  }

  function setMockMode(on) {
    mockMode = on !== false;
    try {
      if (mockMode) localStorage.setItem(MOCK_KEY, '1');
      else localStorage.removeItem(MOCK_KEY);
    } catch (e) { /* storage unavailable — session-only toggle */ }
    updateMockBadge();
    console.info('[chat] mock mode ' + (mockMode ? 'ON — type "help" in the chat for fixtures' : 'OFF'));
    return mockMode;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateMockBadge);
  } else {
    updateMockBadge();
  }
  // --- end mock mode ----------------------------------------------------------

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  function addBubble(role, transcript) {
    const row = el('div', `chat-row chat-row--${role}`);
    const bubble = el('div', `chat-bubble chat-bubble--${role}`);
    row.appendChild(bubble);
    transcript.appendChild(row);
    return bubble;
  }

  function addTypingIndicator(transcript) {
    const row = el('div', 'chat-row chat-row--assistant chat-row--typing');
    const bubble = el('div', 'chat-bubble chat-bubble--assistant');
    bubble.innerHTML = '<span class="chat-dot"></span><span class="chat-dot"></span><span class="chat-dot"></span>';
    row.appendChild(bubble);
    transcript.appendChild(row);
    return row;
  }

  function scrollToBottom(transcript) {
    transcript.scrollTop = transcript.scrollHeight;
  }

  // Internal site paths → mode names
  // Mode pages, which live on a query string rather than a hash route.
  const SITE_PATHS = {
    '/bookshelf': { mode: 'bookshelf', href: '/?bookshelf' },
    '/work':      { mode: 'work',      href: '/?projects' },
    '/life':      { mode: 'life',      href: '/' },
    '/chat':      { mode: 'chat',      href: '/?chat' },
    '/gear':      { mode: 'gear',      href: '/?gear' },
    '/places':    { mode: 'places',    href: '/?places' },
  };

  const SECTION_LABELS = {
    writing: 'Writing', videos: 'Videos', photos: 'Photos', career: 'Career',
    'case-studies': 'Case Studies', resume: 'Resume', portfolio: 'Portfolio',
    labs: 'Labs', now: 'Now', logbook: 'Logbook',
  };

  // A bare route has to read as English mid-sentence, so a section on its own
  // uses its display name and an item uses its de-slugged title. A markdown
  // link's own label always wins over this.
  function routeLabel(route) {
    const [section, ...rest] = route.split('/');
    const item = rest.join('/');
    if (item) return item.replace(/-+/g, ' ').trim();
    return SECTION_LABELS[section] || section;
  }

  // Links the SPA can follow in place instead of opening a tab: a router hash
  // route (#writing/slug), a mode path (/gear), or either written out as a full
  // lukevz.com URL. Returns null for anything genuinely external.
  function internalTarget(url) {
    const rest = url.replace(/^https?:\/\/(?:www\.)?lukevz\.com/i, '');
    if (rest === url && !/^[/#]/.test(url)) return null;
    const hash = rest.replace(/^\/(?=#)/, '');
    if (hash.startsWith('#')) {
      // An empty route ("/#") means the site as a whole. Nothing generates that
      // deliberately, but resolving it to home keeps a stray one in the app
      // rather than opening a new tab onto the page we're already on.
      const route = hash.slice(1).toLowerCase();
      return { kind: 'hash', route, href: route ? `/#${route}` : '/' };
    }
    const path = SITE_PATHS[rest.toLowerCase()];
    return path ? { kind: 'mode', mode: path.mode, href: path.href } : null;
  }

  function internalLink(target, label) {
    const a = document.createElement('a');
    a.href = target.href;
    a.textContent = label;
    a.addEventListener('click', e => {
      e.preventDefault();
      if (target.kind === 'hash') {
        if (window.gotoSite) window.gotoSite(target.route);
      } else if (window.setMode) {
        window.setMode(target.mode);
      }
    });
    return a;
  }

  const SOCIAL_LABELS = {
    'linkedin.com': 'LinkedIn',
    'x.com': 'X',
    'twitter.com': 'X',
    'instagram.com': 'Instagram',
    'youtube.com': 'YouTube',
    'github.com': 'GitHub',
    'threads.net': 'Threads',
    'bsky.app': 'Bluesky',
  };

  function socialLabel(domain) {
    const host = domain.replace(/^www\./, '').split('/')[0];
    return SOCIAL_LABELS[host] || null;
  }

  function splitTrailingPunct(url) {
    const m = url.match(/[.,;:!?)\]}>\"']+$/);
    if (!m) return [url, ''];
    return [url.slice(0, -m[0].length), m[0]];
  }

  // Parse inline markdown (bold, italic, code, links, bare URLs, internal paths)
  // Returns a DocumentFragment. Safe — no innerHTML.
  function renderInline(text) {
    const frag = document.createDocumentFragment();
    // Token regex: **bold**, *italic*, `code`, [label](url), http(s) URL, bare
    // domain URL, /#hash-route, /site-path. A markdown link's target may be
    // internal, so it accepts a leading "/" or "#" as well as a scheme.
    const re = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(((?:https?:\/\/|[/#])[^\s)]+)\)|(https?:\/\/[^\s<>"']+)|([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|net|org|io|co|vet|dev|app|ai|me)(?:\/[^\s<>"'()]*[^\s<>"'().,;:!?])?(?=[^a-zA-Z0-9]|$))|(\/#[A-Za-z][A-Za-z0-9-]*(?:\/[A-Za-z0-9-]+)*)|(\/(?:bookshelf|work|life|chat|gear|places))(?=[^a-zA-Z0-9_-]|$)/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1] !== undefined) {
        const s = document.createElement('strong');
        s.textContent = m[1];
        frag.appendChild(s);
      } else if (m[2] !== undefined) {
        const em = document.createElement('em');
        em.textContent = m[2];
        frag.appendChild(em);
      } else if (m[3] !== undefined) {
        const code = document.createElement('code');
        code.textContent = m[3];
        frag.appendChild(code);
      } else if (m[5] !== undefined) {
        // markdown link [label](url) — target may be internal or external
        const internal = internalTarget(m[5]);
        if (internal) {
          frag.appendChild(internalLink(internal, m[4]));
        } else {
          const a = document.createElement('a');
          a.href = m[5]; a.textContent = m[4]; a.target = '_blank'; a.rel = 'noopener noreferrer';
          frag.appendChild(a);
        }
      } else if (m[6] !== undefined) {
        // bare https:// URL
        let [href, trailing] = splitTrailingPunct(m[6]);
        const internal = internalTarget(href);
        if (internal) {
          frag.appendChild(internalLink(internal, internal.kind === 'hash' ? routeLabel(internal.route) : internal.href));
        } else {
          const a = document.createElement('a');
          a.href = href;
          a.textContent = socialLabel(href.replace(/^https?:\/\//, '')) || href;
          a.target = '_blank'; a.rel = 'noopener noreferrer';
          frag.appendChild(a);
        }
        if (trailing) frag.appendChild(document.createTextNode(trailing));
      } else if (m[7] !== undefined) {
        // bare domain URL e.g. linkedin.com/in/lukevz
        let [domain, trailing] = splitTrailingPunct(m[7]);
        const internal = internalTarget('https://' + domain);
        if (internal) {
          frag.appendChild(internalLink(internal, internal.kind === 'hash' ? routeLabel(internal.route) : internal.href));
        } else {
          const a = document.createElement('a');
          a.href = 'https://' + domain;
          a.textContent = socialLabel(domain) || domain;
          a.target = '_blank'; a.rel = 'noopener noreferrer';
          frag.appendChild(a);
        }
        if (trailing) frag.appendChild(document.createTextNode(trailing));
      } else if (m[8] !== undefined) {
        // bare hash route e.g. /#writing/how-to-use-bear-as-a-cms
        const internal = internalTarget(m[8]);
        if (internal) frag.appendChild(internalLink(internal, routeLabel(internal.route)));
        else frag.appendChild(document.createTextNode(m[8]));
      } else if (m[9] !== undefined) {
        // internal mode path e.g. /bookshelf
        const internal = internalTarget(m[9]);
        if (internal) frag.appendChild(internalLink(internal, m[9]));
        else frag.appendChild(document.createTextNode(m[9]));
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  // Split text into paragraphs and render each with inline formatting.
  function renderMarkdown(bubble, text) {
    bubble.replaceChildren();
    const paras = text.split(/\n{2,}/);
    paras.forEach((para, i) => {
      const p = document.createElement('p');
      p.appendChild(renderInline(para.trim()));
      bubble.appendChild(p);
    });
  }

  function renderAssistantText(bubble, text) {
    renderMarkdown(bubble, text);
  }

  function parseSSE(text, onDelta) {
    // OpenAI-style SSE: lines beginning with "data: " carrying JSON.
    // [DONE] is the terminator.
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      if (payload === '[DONE]') return true;
      try {
        const data = JSON.parse(payload);
        const delta = data?.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch (e) { /* partial chunk — ignore */ }
    }
    return false;
  }

  async function streamChat(userText, transcript, send) {
    if (inflight) return;
    inflight = true;
    send.disabled = true;

    messages.push({ role: 'user', content: userText });
    const userBubble = addBubble('user', transcript);
    userBubble.textContent = userText;
    scrollToBottom(transcript);

    const typingRow = addTypingIndicator(transcript);
    scrollToBottom(transcript);

    let assistantBubble = null;
    let assistantText = '';
    let renderScheduled = false;

    function ensureBubble() {
      if (!assistantBubble) {
        typingRow.remove();
        assistantBubble = addBubble('assistant', transcript);
      }
    }

    // Deltas can arrive many times a second; re-parsing + rebuilding the whole
    // bubble on every single one gets slower as the reply grows (it re-does the
    // full markdown pass every time) and starts to visibly lag behind the
    // stream. Batch to one render per animation frame instead — the text still
    // accumulates immediately, only the (expensive) DOM rebuild is throttled.
    function scheduleRender() {
      if (renderScheduled) return;
      renderScheduled = true;
      requestAnimationFrame(() => {
        renderScheduled = false;
        if (assistantBubble) renderAssistantText(assistantBubble, assistantText);
        scrollToBottom(transcript);
      });
    }

    try {
      const res = await chatFetch(messages);

      if (!res.ok || !res.body) {
        ensureBubble();
        if (res.status === 429) {
          assistantBubble.textContent = "I'm getting more questions than I can handle right now — give me a few seconds and try again.";
        } else {
          assistantBubble.textContent = "Hmm — something broke on my end. Try again in a moment, or DM me directly.";
        }
        const errText = await res.text().catch(() => '');
        console.error('[chat] upstream error', res.status, errText);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lastNl = buffer.lastIndexOf('\n\n');
        if (lastNl >= 0) {
          const ready = buffer.slice(0, lastNl);
          buffer = buffer.slice(lastNl + 2);
          done = parseSSE(ready, (delta) => {
            ensureBubble();
            assistantText += delta;
            scheduleRender();
          });
        }
      }
      if (buffer) {
        parseSSE(buffer, (delta) => {
          ensureBubble();
          assistantText += delta;
          scheduleRender();
        });
      }

      // Flush any pending text immediately rather than waiting for the next
      // frame — the stream is done, nothing left to batch against.
      if (assistantBubble) {
        renderAssistantText(assistantBubble, assistantText);
        scrollToBottom(transcript);
      }

      if (assistantText) {
        messages.push({ role: 'assistant', content: assistantText });
      } else {
        ensureBubble();
        assistantBubble.textContent = "Got nothing back. Try rephrasing?";
      }
    } catch (e) {
      ensureBubble();
      assistantBubble.textContent = "Connection hiccup. Try again?";
      console.error('[chat] stream error', e);
    } finally {
      if (typingRow.parentNode) typingRow.remove();
      inflight = false;
      send.disabled = false;
      scrollToBottom(transcript);
    }
  }

  function showWelcome(transcript) {
    if (transcript.dataset.welcomed === '1') return;
    transcript.dataset.welcomed = '1';
    const msg = el('div', 'chat-welcome');
    msg.textContent = "Hey 👋 this is Luke's digital brain. Ask me anything you'd ask the real one. If it's outside what I've shared here, I'll point you to him directly.";
    transcript.appendChild(msg);
  }

  function init() {
    if (initialized) return;
    const transcript = document.getElementById('chatTranscript');
    const input = document.getElementById('chatInput');
    const send = document.getElementById('chatSend');
    if (!transcript || !input || !send) return;
    initialized = true;

    showWelcome(transcript);

    function submit() {
      const text = input.value.trim();
      if (!text || inflight) return;
      input.value = '';
      streamChat(text, transcript, send);
    }

    send.addEventListener('click', submit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
  }

  function focus() {
    const input = document.getElementById('chatInput');
    if (input) setTimeout(() => input.focus(), 50);
  }

  // Programmatic send — used by the floating dock to hand off the first
  // message (typed before the overlay/transcript existed) once it opens.
  function sendMessage(text) {
    text = (text || '').trim();
    const transcript = document.getElementById('chatTranscript');
    const send = document.getElementById('chatSend');
    if (!text || !transcript || !send || inflight) return;
    showWelcome(transcript);
    streamChat(text, transcript, send);
  }

  // Headless streaming — same API/history as the transcript, but hands the
  // accumulating text back through callbacks instead of owning any DOM. Used by
  // the home hero, which streams the answer straight into the intro copy.
  //   handlers: { onDelta(fullText), onDone(fullText), onError(message) }
  async function ask(userText, handlers) {
    userText = (userText || '').trim();
    handlers = handlers || {};
    if (!userText || inflight) return;
    inflight = true;

    messages.push({ role: 'user', content: userText });

    let assistantText = '';
    let renderScheduled = false;

    // Batch onDelta to one call per frame — the raw text accumulates
    // immediately, only the (caller-side) DOM rebuild is throttled.
    function flush() {
      if (renderScheduled) return;
      renderScheduled = true;
      requestAnimationFrame(() => {
        renderScheduled = false;
        if (handlers.onDelta) handlers.onDelta(assistantText);
      });
    }

    try {
      const res = await chatFetch(messages);

      if (!res.ok || !res.body) {
        const msg = res.status === 429
          ? "I'm getting more questions than I can handle right now — give me a few seconds and try again."
          : "Hmm — something broke on my end. Try again in a moment, or DM me directly.";
        const errText = await res.text().catch(() => '');
        console.error('[chat] upstream error', res.status, errText);
        if (handlers.onError) handlers.onError(msg);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;
      const onDelta = (delta) => { assistantText += delta; flush(); };

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lastNl = buffer.lastIndexOf('\n\n');
        if (lastNl >= 0) {
          done = parseSSE(buffer.slice(0, lastNl), onDelta);
          buffer = buffer.slice(lastNl + 2);
        }
      }
      if (buffer) parseSSE(buffer, onDelta);

      if (assistantText) {
        messages.push({ role: 'assistant', content: assistantText });
        if (handlers.onDelta) handlers.onDelta(assistantText); // final flush
        if (handlers.onDone) handlers.onDone(assistantText);
      } else if (handlers.onError) {
        handlers.onError("Got nothing back. Try rephrasing?");
      }
    } catch (e) {
      console.error('[chat] ask error', e);
      if (handlers.onError) handlers.onError("Connection hiccup. Try again?");
    } finally {
      inflight = false;
    }
  }

  // Render accumulated markdown into an arbitrary element (used by the hero).
  function renderInto(el, text) {
    if (el) renderMarkdown(el, text);
  }

  // Drop the conversation history — the hero calls this when the visitor
  // dismisses an answer and returns to the intro.
  function reset() {
    messages.length = 0;
  }

  window.chat = { init, focus, sendMessage, ask, renderInto, reset, mock: setMockMode, busy: () => inflight };
})();
