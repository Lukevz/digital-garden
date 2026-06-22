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
  const SITE_PATHS = {
    '/bookshelf': 'bookshelf',
    '/work': 'work',
    '/life': 'life',
    '/chat': 'chat',
    '/gear': 'gear',
    '/places': 'places',
  };

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
    // Token regex: **bold**, *italic*, `code`, [label](url), http(s) URL, bare domain URL, /site-path
    const re = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)|([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|net|org|io|co|vet|dev|app|ai|me)(?:\/[^\s<>"'()]*[^\s<>"'().,;:!?])?(?=[^a-zA-Z0-9]|$))|(\/(?:bookshelf|work|life|chat|gear|places))(?=[^a-zA-Z0-9_-]|$)/g;
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
        // markdown link [label](url)
        const a = document.createElement('a');
        a.href = m[5]; a.textContent = m[4]; a.target = '_blank'; a.rel = 'noopener noreferrer';
        frag.appendChild(a);
      } else if (m[6] !== undefined) {
        // bare https:// URL
        let [href, trailing] = splitTrailingPunct(m[6]);
        const a = document.createElement('a');
        a.href = href;
        a.textContent = socialLabel(href.replace(/^https?:\/\//, '')) || href;
        a.target = '_blank'; a.rel = 'noopener noreferrer';
        frag.appendChild(a);
        if (trailing) frag.appendChild(document.createTextNode(trailing));
      } else if (m[7] !== undefined) {
        // bare domain URL e.g. linkedin.com/in/lukevz
        let [domain, trailing] = splitTrailingPunct(m[7]);
        const a = document.createElement('a');
        a.href = 'https://' + domain;
        a.textContent = socialLabel(domain) || domain;
        a.target = '_blank'; a.rel = 'noopener noreferrer';
        frag.appendChild(a);
        if (trailing) frag.appendChild(document.createTextNode(trailing));
      } else if (m[8] !== undefined) {
        // internal site path e.g. /bookshelf
        const path = m[8];
        const mode = SITE_PATHS[path];
        const a = document.createElement('a');
        a.href = '#'; a.textContent = path;
        a.addEventListener('click', e => {
          e.preventDefault();
          if (window.setMode) window.setMode(mode);
        });
        frag.appendChild(a);
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

    function ensureBubble() {
      if (!assistantBubble) {
        typingRow.remove();
        assistantBubble = addBubble('assistant', transcript);
      }
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });

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
            renderAssistantText(assistantBubble, assistantText);
            scrollToBottom(transcript);
          });
        }
      }
      if (buffer) {
        parseSSE(buffer, (delta) => {
          ensureBubble();
          assistantText += delta;
          assistantBubble.textContent = assistantText;
          scrollToBottom(transcript);
        });
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

  window.chat = { init, focus };
})();
