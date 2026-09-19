# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this branch is

`paperlike` is a **reset**. The v2 site — the fixed starfield hero, the world-descent
director, the Bear-style feed, the section pages, the chat dock island — is gone from
the working tree. In its place is one file's worth of site: a single, non-scrollable,
text-only landing page.

⚠️ **Nothing was lost, and nothing here should be reconstructed from memory.** The whole
v2 front-end plus ~40KB of notes describing it (worlds, passages, the genie drain, the
starfield warp, per-scene ink, section pages vs. the section modal) lives on `main`.
`git show main:CLAUDE.md` and `git show main:js/worlds.js` are the references. If a task
needs any of that back, take it from `main` rather than rewriting it.

**Removed here:** `_index.html`, `styles.css` (the old 280KB one), `js/`, `about.html`,
`now.html`, `work.html`, `flipboard.*`, `fonts/chillax/`, `src/img/`, most of `images/`,
and `api/home.js` (it existed only to serve the v2 shell with a theme-aware OG image).

**Kept and still working:** `content/` (the writing, photos, and the second-brain vault),
`api/` minus `home.js`, `build/`, `src/data/`, and `v1/` — the original v1 site, still
served at `/v1`, and still what `build/build.js` generates manifests for.

## Development Commands

```bash
npm run dev      # static server + watchers on :3000; serves index.html at /
npm run build    # v1 manifests — this is Vercel's buildCommand
npm run index    # rebuild the committed chat index from the vault
npm run gaps     # re-check the KB gap list against the committed index
```

## The landing page

Two files: `index.html` and `styles.css`. No build step, no JavaScript, no framework.

**Two surfaces, and the distinction is the whole design.** `<body>` is a flat,
untextured **frame** in a single solid colour (white in light mode, near-black in dark).
`.sheet` is the **paper**: `position: fixed`, `inset: var(--frame-w)`, rounded by
`--sheet-radius`, carrying the texture. The frame being the only untextured colour on
the page is what makes the grey field read as a sheet laid down on something rather
than as a page background.

- `--frame-w` (20px) and `--sheet-radius` (36px) are the two dials, halved on the
  `max-width: 640px` breakpoint. The `inset` is written twice — the second uses
  `max(--frame-w, env(safe-area-inset-*))` so a notch can widen one side without the
  first declaration's uniform value being lost on browsers that don't support `env()`.
- `isolation: isolate` on `.sheet` is load-bearing: without it the grain's blend modes
  reach through to the frame and the "solid colour" stops being solid.

**The paper texture is generated, not an image.** Two `feTurbulence` tiles as data
URIs — `.sheet::before` is fine speckle (180px tile), `.sheet::after` is slow tonal
mottle (640px) — over a soft radial tone ramp. No asset to load, resolution-independent,
and re-tintable per theme, which a photographed paper scan is not.

⚠️ **Three things about that noise, each of which looked broken before it was fixed:**

1. **`feTurbulence` writes noise into the ALPHA channel too**, not just RGB, so half the
   speckle is erased by its own transparency and the grain comes out invisible. The
   `feColorMatrix` folds the red channel across RGB and pins alpha to 1 — opaque
   greyscale noise.
2. **It also emits *colour*.** Straight out of the filter the "paper" picks up faint
   yellow and olive blotches. Same `feColorMatrix` fixes it; a `type='saturate'`
   matrix alone does not, because it leaves the alpha noise in place.
3. **`fractalNoise` clusters tightly around 0.5**, so the untouched output is a smooth
   grey wash. The `feComponentTransfer` stretches it (`slope` ~2.4 for the fine grain)
   — that stretch is the difference between visible paper stock and a flat fill.

Because the noise is centred on mid-grey and opaque, it rides `mix-blend-mode: overlay`
with **no net shift in the sheet's tone** — the palette and the texture are independent.
Multiply would darken the paper as a side effect of graining it.

⚠️ **The mottle wants to be almost invisible** (`--mottle-opacity: 0.13` light, `0.08`
dark). At 0.5 it reads as marble, not paper. It is tonal unevenness you should only
notice when it's gone.

**Typeface.** One face, everywhere: TAY Wingman (`fonts/taywingman/`), a hand-drawn
1950s monoline caps face. woff2 + woff are what the page loads; the `.otf` is the
desktop original, kept for reference. The woff2 is `<link rel="preload">`ed because
*every* glyph on the page is set in it — a swap flash here reflows the whole layout,
not one heading.

- The page is set in **caps via `text-transform`**, not typed in caps, so screen readers
  and copy-paste get real sentence case.
- Letter-spacing adds a trailing gap after a line's last letter, which pushes a centred
  line half a space right. `.name` and `.bio` each carry a negative `margin-right` equal
  to their own tracking to take it back.
- The font has no em dash, en dash, or middle dot — its punctuation is `!&',-./:?@’`.
  Separators must come from that set, or they render as tofu.

**One screen, always.** `html, body { height: 100%; overflow: hidden }` and no scroll
container anywhere inside, so there is nothing for a stray overflow to start scrolling.
`.name` sizes off `vw` (`clamp(2.4rem, 8.5vw, 6.25rem)`), which is what keeps
"LUKE VAN ZYL" on one line at every width without a `nowrap` that could overflow.
⚠️ Don't put a `max-width` on `.lockup` — it was there once and broke the name across
three lines and overrode the bio's hand-set `<br>`s. The measure belongs on `.bio`.

**Theme is automatic** (`prefers-color-scheme`), with no toggle. This is not the v2
dark-lock coming back: that whole mechanism — `THEME_LOCK_DARK`, the pinned
`data-theme="dark"` attribute, the hidden `#themeToggle` — went with `js/main.js`.
Every colour here is a `:root` custom property redefined in one media query.

## The draughtsman's layer

`.spec` is a decorative overlay of rulers, registration crosses and dimension
notes, drawn over the paper the way a codex page carries its own measurements
around the figure. It is `aria-hidden` with `pointer-events: none`, and nothing
on it carries information the page needs — the numerals are notation, not live
values (there is no JS to compute any).

It is built from positioned boxes and repeating gradients, not an inline SVG:
the sheet is fully fluid, and an SVG with a fixed viewBox would have to stretch,
which puts the ticks on a different pitch top vs. side and tapers the hairlines.

⚠️ **Corners are concentric: `inner = outer − gap`.** `--spec-radius` derives
the frame line's corner from `--sheet-radius` rather than restating it, so the
two curves stay parallel instead of drifting apart at the diagonal — the one
place the eye checks — and so the relationship survives a retune of the sheet.
The `max(0px, …)` is load-bearing: once the gap exceeds the outer radius the
correct inner corner is **square**, not a clamped curve.

That rule is also why there is no radius-annotation arc, though one was drawn
first. A concentric arc inside a 24px corner has ~9px of curve to show, which is
smaller than the numeral labelling it; the only way to make it legible is to
draw it non-concentric, at which point it annotates nothing.

Three variants are in the stylesheet, selected by the class on `#spec`:
`spec--a` (rulers on all four edges), `spec--b` (sparse codex notes with
dimension lines and dashed construction axes), `spec--c` (inspection overlay
with corner badges). The whole layer is `display: none` under 640px — the marks
are margin furniture and a phone has no margin.

## Routing

`vercel.json` has no `/` rewrite any more, so `index.html` is served statically at the
root. `/v1` still rewrites to the v1 site. The `/work` and `/about` rewrites are gone
with their pages. `build/dev.js` resolves `/` to `index.html` — ⚠️ it used to resolve
to `_index.html`, and that one-line difference is the whole local-dev story.

## Backend (unchanged from `main`, and currently unused by the landing page)

The chat API, the vault index, the KB-gap pipeline, and the Instagram photo sync all
still run — they just have no front end on this branch. Left intact so the branch can
grow a UI back without re-deriving any of it.

## Chat Assistant (api/chat.js)

The chat tab answers in Luke's voice, streaming from Google Gemini via its OpenAI-compatibility endpoint. Knowledge comes from the **second-brain vault** (`/content/second-brain/`, an Obsidian-style vault — see its `AGENTS.md` for authoring conventions) through **agentic hybrid retrieval**, not prompt stuffing:

- **Indexing (build time, local):** `npm run index` (`build/index-vault.js`) walks the vault, chunks by `##` heading (whole notes under ~300 words stay one chunk), prepends title/tags/dates/status into chunk text, runs a synthesis pass (groups by MOC/tag/year, Gemini Flash-Lite writes first-person `type: synthesis` summaries, cached by group hash), embeds with `gemini-embedding-001` (1536 dims, cached by chunk hash), builds BM25 stats, and emits the committed `src/data/brain-index.json`. Needs `GEMINI_API_KEY` (in `.env.local`; `set -a && source .env.local && set +a` first). Deliberately NOT run in `build/build.js` — Vercel has no key and would null out the vectors. **Re-run `npm run index` after editing vault notes, and commit the regenerated index.**
- **Retrieval (request time):** `api/_lib/retrieve.js` brute-forces the index in memory — BM25 + vector cosine fused with reciprocal rank fusion, with tag/type/after_date filters. No vector DB.
- **Agentic loop:** `api/chat.js` exposes `search_notes` and `count_notes` tools; the model calls them up to `MAX_TOOL_ROUNDS` (5) before answering. The final answer is emitted to the client as OpenAI-style SSE deltas, so `js/chat.js` needed no changes. Only `bio.md`, `out-of-scope.md`, and `now.json` remain always-in-prompt (`loadCoreContext()`); the classifier is grounded in the vault's note-title outline, not the full corpus.
- **Cost guards:** per-IP rate limits (20/min, 300/day), a global daily token ceiling (`CHAT_DAILY_TOKEN_CEILING`, default 2M, tracked in KV) that returns a graceful in-voice message when exhausted, and a Cloudflare Turnstile gate: the first message of a session must carry a token (server answers `403 turnstile_required`, `js/chat.js` solves an interaction-only widget and retries), then a signed HttpOnly cookie (`chat_pass`, 2h) covers the conversation. `TURNSTILE_SECRET_KEY` unset = gate off (local dev / rollback lever). The public site key is inlined in `js/chat.js`.

**Three kinds of questions (handled in `buildSystemPrompt()`):**
- **Real questions about Luke** (life, work, plans, considered opinions, biography): answered only if covered by the knowledge base; otherwise it redirects to DM rather than guessing. Out-of-scope topics (`out-of-scope.md`) are politely declined.
- **Light / fun / playful** (silly hypotheticals, pop culture, banter — e.g. "do you like Darth Vader"): the bot plays along with a short, off-the-cuff in-voice riff instead of cold-redirecting. Throwaway opinions on trivial stuff may be improvised; anything non-trivial (real facts, numbers, serious positions) stays grounded in the KB.
- **Free-assistant abuse** (math, facts, definitions, coding help, "write me X" — e.g. "what is the square root of pi"): NOT answered, to avoid burning tokens acting as a free general-purpose chatbot. The bot deflects with one short, funny in-voice line and nudges back toward asking about Luke. Light small talk aimed at Luke ("how are you", "hey") always gets a brief natural reply.

The system prompt also leads with a distilled **"HOW I WRITE"** voice block (hoisted out of `voice-and-tone.md` so the model actually weights it): short 1-3 sentence replies, contractions, lead-with-the-conclusion, Luke's filler words, and banned LinkedIn/chatbot phrasing.

**Voice examples (`content/about/conversations.md`):** a fill-in worksheet of `Q:` / `A:` pairs in Luke's real words. `loadVoiceExamples()` parses it (only pairs with a non-empty answer are kept, so it works incrementally) and `buildSystemPrompt()` injects them as a prominent `<my-real-answers>` few-shot block — the strongest signal for matching Luke's voice. It's excluded from the main KB blob so it isn't buried. Empty file → block is omitted entirely. Harvest good answers from the gap pipeline into this file over time to keep tightening the voice.

**The dock island (`#chatDock.is-thread`) — where answers actually appear:**

Sending from the floating dock turns **the dock itself** into the conversation, on every page. `openDockThread()` (js/main.js) drops the pill's 32px of float so it sits flush on the bottom edge, squares off the two corners that leave the viewport, widens 290 → 560px, and unfurls `#chatDockThread` above the compose row — a notch, inverted. Both the visitor's message and the reply render as bubbles, focus stays in the field, and follow-ups stay in the island.

`#chatDockLabel` is a **menubar layered behind the panel** — "Luke's Second Brain", an *Experimental* tag (hover/focus tooltip explains what that means), and the close ×. Same width as the panel, rounded top corners, square bottom ones, and its lower `--dock-label-tuck` (16px) hidden underneath, so the panel's own 28px top curve reveals the card behind it. A flat black wash over the same glass puts it a layer back — *not* a different `color-mix` ratio, because `--glass-bg` is lighter than `--bg` in **both** themes, so shifting the ratio changes translucency more than lightness and the depth cue dies in light mode.

⚠️ Getting the menubar genuinely *behind* the panel took moving the dock's glass off `#chatDock` and onto `#chatDock::before`. An element's own background always paints below its negative-z-index children, so while the background lived on the element the label could never get under it. Now `::before` is the glass at `z-index: 0`, `#chatDockLabel` is `z-index: -1`, `#chatDockThread`/`#chatDockSuggest`/`#chatDockRow` are lifted to `z-index: 1`, and `isolation: isolate` on the dock keeps that `-1` from falling behind the whole page. The close button is deliberately *not* lifted — it rides the menubar.

**Suggested prompts.** `#chatDockSuggest` offers three prompt chips after `DOCK_IDLE_MS` (7s) of an open island with an empty input — a nudge instead of a blank field. The timer is armed on open and after each answer lands, cancelled by any keystroke and by sending, and re-arms itself rather than giving up if it fires mid-stream (the visitor is reading, not hesitating). The chip list rotates via `dockSuggestCursor` so a second pause doesn't offer the same three.

⚠️ **Two different ways out, and the difference matters.** Getting out of the way — click-away, Escape, switching mode, following a link out of an answer (`gotoSite()`) — calls `collapseDockThread()`, which only folds the island back into the pill. The transcript DOM and the chat history both survive, and the pill goes `is-resumable`: a `⌃` appears at the head of the compose row and the placeholder changes to "Keep chatting…". Clicking anywhere on the pill, focusing the input, or just sending the next message resumes it where it left off. Only the **×** calls `closeDockThread()`, which additionally empties the transcript and `chat.reset()`s the history — after the collapse animation, and not if `#chatOverlay` has picked the conversation up in the meantime.

The **top-nav Chat tab** still opens the full `#chatOverlay` modal; opening it closes the island. `js/chat.js` owns the history and the streaming and doesn't care which one is on screen — `sendMessage(text, { transcript, send, welcome })` takes its container as a parameter and everything downstream of `streamChat()` is container-agnostic.

⚠️ `#chatDock` is a **column** (`#chatDockRow` holds the old horizontal pill layout, so the thread can stack above it). Padding and gap live on the row, not the dock — `dock-enter` and `revealDock()` in js/hero-entrance.js both have to target the row for the entrance bloom to stay in sync with the width. `revealDock()` also has to fire when the hero copy is hidden (section pages `display:none` `.hero-lockup`), or the dock stays collapsed at opacity 0 and the site looks like it has no chat at all.

⚠️ `chat.reset()` bumps a `generation` counter, and a stream that started before the reset won't push its reply onto the fresh history. Without that, dismissing the island mid-answer leaves a dangling assistant turn with no question in front of it.

*Removed:* the hero answer — the dock used to stream its reply into the home intro copy, replacing "Hi, I'm Luke!…" (`askInHero()`, `.hero-answer`, the per-line recede). The island took its place, so that whole path and its CSS are gone; `window.chat.ask()` and `renderInto()` went with it.

**The chat pointing at the site itself (`mocs/Site MOC.md` + `internalTarget()` in js/chat.js):**

The chat can end an answer with a link into the site ("wrote the whole thing up [here](/#writing/the-search-for-the-best-todo-app)"). Three pieces have to agree for that to work:

1. **One note holds the map.** `content/second-brain/mocs/Site MOC.md` is the single continuously-updated note describing every section and the real route to it, with a `##` per section so each one is its own retrievable chunk ("do you have photos" hits the Photos chunk). **When content is added to a section, update that note and re-run `npm run index`** — it is the only place the routes live. Individual topic notes also carry the route of the post they came from, inline in prose, which is what makes a topical query ("todo apps") retrieve a chunk that already contains the link.
2. **The prompt allows it, narrowly.** A `MY SITE` block in `buildSystemPrompt()` tells the model to copy routes **verbatim** from search results, never to assemble a slug, to vary the link label, and to cap it at one link per reply. Slugs are derived from filenames (`filenameToSlug()`), so a guessed one is usually wrong: "2024 – Year in Review" is `2024--year-in-review`, with two hyphens from the en dash.
3. **The renderer navigates in place.** `internalTarget()` in js/chat.js recognizes a router hash route (`/#writing/slug`), a mode path (`/gear`), or either written out as a full `lukevz.com` URL, and routes it through `window.gotoSite()` (js/main.js) instead of opening a tab. `gotoSite()` closes the chat overlay, clears any hero answer, returns to life mode, then hands the hash to `handleHash()` — re-invoking it directly when the hash is unchanged, since hashchange wouldn't fire. Bare routes get a humanized label via `routeLabel()` (`/#photos` → "Photos", an item → its de-slugged title); a markdown link's own label always wins. Anything off-site still opens in a new tab.

⚠️ Renaming a writing post changes its route, which silently breaks whatever the vault says. Grep `content/second-brain/` for the old slug when renaming a file in `content/writing/`.

To test link rendering without spending tokens, use mock mode (`?chatmock=1`) — the `links` fixture in js/chat.js covers internal routes, mode paths, and external URLs.

**Question capture + gap tracking (KV-backed):**
- Every visitor question is classified by a second Gemini call (`classifyQuestion()`) as `general`, `personal_covered`, or `personal_gap`. This runs in parallel with the streamed answer and is awaited before the response ends, so it adds no latency to the first token and never blocks chat (all KV/classify calls are best-effort, wrapped in try/catch).
- Every question is appended to a capped Vercel KV list (`chat:questions`, last 1000).
- `personal_gap` questions are upserted into a deduped gap to-do list (`chat:gaps`, hashed by normalized topic) with a `suggestion` phrased for Luke to answer, plus a count and example questions.

**Reviewing captured data:** `GET /api/chat-insights?key=SECRET[&limit=N]` returns the recent questions and the gap to-do list as JSON. Requires env var `CHAT_INSIGHTS_KEY`; wrong/absent key returns 401/500. Uses the same Vercel KV database as the guestbook.

**Resolving gaps:** `POST /api/chat-insights?key=SECRET` with body `{ "resolve": ["<gap key>", ...] }` (or `{ "resolveAll": true }`) removes answered gaps from the to-do list. Same key auth.

**Gap auto-resolve after indexing (`build/check-gaps.js`):**

⚠️ `chat:gaps` is **append-only until something resolves it**. `api/chat.js` writes a gap the instant a question misses and nothing ever re-examines it, so a gap logged in June still shows up after you answer it in July. The auto-resolver is what closes that loop.

It runs as the tail of `npm run index`, and **only when the rebuild actually changed something** — `indexVault()` now returns `{ changed }`, computed from a signature over the sorted chunk hashes (`contentSignature()`). `generatedAt` moves every run and embeddings are a pure function of chunk text, so neither counts as a change. Unchanged vault → the whole check is skipped and no tokens are spent.

When it does run, for each open gap it calls `searchNotes()` from `api/_lib/retrieve.js` — **the same retrieval the live chat uses**, against the index just written, which is why a "covered" verdict here means the bot really can find the answer. Gemini Flash-Lite then judges the retrieved chunks into one of three verdicts, and `COVERED` + `OUT_OF_SCOPE` get POSTed to the resolve endpoint:

- `COVERED` — the notes now answer it. Also catches junk gaps (a question fragment, or the bot's own clarifying question echoed back as a "topic").
- `OUT_OF_SCOPE` — `content/about/out-of-scope.md` says never to engage. The answer path already declines these; the classifier in `api/chat.js` doesn't get the out-of-scope list, so it files them as to-dos anyway.
- `OPEN` — stays on the list. **The judge is deliberately strict and fails closed**: topically-adjacent doesn't count, and any error (retrieval, API, bad JSON) leaves the gap OPEN so a transient blip can't quietly empty the to-do list.

Commands: `npm run index` (rebuild + conditional re-check), `npm run gaps` (re-check now against the committed index, regardless of change), `npm run gaps -- --dry-run` (print verdicts, resolve nothing), `npm run index -- --no-gap-check` (rebuild only).

Skips with a one-line note (never an error) when `CHAT_INSIGHTS_KEY` or the Gemini key is missing, so it's safe on any machine or CI runner. **`CHAT_INSIGHTS_KEY` is not in `.env.local` by default** — add it (`vercel env pull`) if you want local `npm run index` to resolve gaps; otherwise the CI workflow below is what does it.

**Daily automation (GitHub Actions):**
- `.github/workflows/kb-gaps-digest.yml` (daily cron + manual `workflow_dispatch`) runs `.github/scripts/kb-gaps.mjs`, which fetches the gap list and upserts ONE GitHub issue labeled `kb-gaps` with a checklist. When no gaps remain, the issue is closed. Answer the gaps from Claude Code mobile: open the repo, say "answer these KB gaps", Claude branches → writes answers as notes in the `content/second-brain/` vault (per its `AGENTS.md`) → re-runs `npm run index` to regenerate the committed `src/data/brain-index.json` → opens a PR.
- `.github/workflows/kb-gaps-autoresolve.yml` (push to `main` touching `src/data/brain-index.json`, + manual `workflow_dispatch` with a `dry_run` input) runs `build/check-gaps.js`. **This is the reliable half of gap resolution** — it triggers on the committed index changing, so it doesn't matter who rebuilt it or whether they remembered a trailer. Verdicts land in the run's step summary.
- `.github/workflows/kb-gaps-resolve.yml` (on PR merge) runs `.github/scripts/kb-resolve.mjs`, which reads `Resolves-KB-Gap: <key>` lines from the merged PR's title/body and POSTs them to the resolve endpoint. Now mostly redundant with autoresolve, but kept because it clears gaps immediately on merge and handles the case where a gap was answered by editing `content/about/` rather than the vault (no index change → no autoresolve trigger).
- Required GitHub repo secrets: `CHAT_INSIGHTS_KEY` and `GEMINI_API_KEY` (Settings → Secrets and variables → Actions). Optional repo variable: `CHAT_INSIGHTS_URL` (defaults to `https://lukevz.com`).

**Mock/test mode (js/chat.js):** For styling/UX work on the chat UI without spending Gemini tokens. Enable with `?chatmock=1` in the URL (that page load only) or persistently via `chat.mock(true)` in the console (`chat.mock(false)` to turn off; stored in localStorage under `chatMockMode`). An orange "chat test mode" badge shows while it's on (click it to disable). Mock mode swaps only the transport (`chatFetch()` → `mockFetch()`), faking the SSE stream with a `ReadableStream`, so the real streaming/markdown/error code paths all run. Message keywords select fixtures: `help`, `short`, `long`, `links`, `md`, `empty`, `error` (500), `429`, `netfail`; anything else cycles canned in-voice replies.

**Env vars:** `GEMINI_API_KEY` (required — Google AI Studio key on a billed project), `GEMINI_MODEL` (answer + classify model, default `gemini-3.1-flash-lite`) / `GEMINI_CLASSIFY_MODEL` (optional override if classify should use a different model than the answer call), `CHAT_INSIGHTS_KEY` (required to read insights), and Vercel KV vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, auto-configured by Vercel) for capture/gap persistence. Without KV vars (e.g. local dev), chat still works and logging is silently skipped.

## Photos (Instagram sync)

The photos grid is served from `content/photos/` by `/api/content/list?category=photos` — a directory listing, **not** a live API call (unlike Videos, which hits the YouTube API on every load). New Instagram posts arrive via a daily sync that commits image files into the repo.

**Why sync-and-commit rather than a live fetch:** the grid keeps working if Instagram is down or the token lapses, images are self-hosted (Instagram CDN URLs are signed and expire), and photos can be curated.

- **`.github/workflows/instagram-sync.yml`** — daily cron (14:00 UTC) + manual `workflow_dispatch` (with `carousel_mode` and `max_posts` inputs). Runs the sync, and if anything new arrived, opens a PR so photos get a visual review before reaching the site.
- **`.github/scripts/instagram-sync.mjs`** — pulls `/me/media` from the Instagram Graph API, skips videos/reels, expands carousels (all slides by default), and writes each photo at the folder's conventions: **2048px long edge** in `content/photos/`, **800px** in `content/photos/thumbs/`, same filename in both. Requires `sharp` (installed by the workflow with `npm install --no-save`, deliberately NOT in `package.json` — it is a ~30MB native dep and Vercel installs devDependencies during the site build).

**Filenames encode ordering — this matters.** Files are named `YYYY-MM-DD HHMM <slug>.jpg` (slug derived from the caption, falling back to the shortcode). `api/content/list.js` sorts on that prefix, then mtime, then name. **Git does not preserve mtimes**, so on a fresh Vercel clone every file stats within the same second — a dated filename is the only ordering that survives a deploy. Undated legacy files fall back to mtime and sort below the dated ones. Renaming a photo is safe (the manifest keys on shortcode, not filename) as long as the date prefix is kept.

⚠️ `build/dev.js` contains a **duplicate copy** of this photos-listing logic for local dev. Keep the two sort implementations identical or the grid will reorder on deploy.

**EXIF in the photo detail.** Each listed photo carries an `exif` object (camera, lens, focal length + 35mm equivalent, aperture / shutter / ISO, date, pixel dimensions) that `renderPhotoDetail()` shows in a panel beside the image. `api/_lib/exif.js` parses it — a dependency-free JPEG APP1/TIFF reader, shared by `api/content/list.js` and `build/dev.js` so the two listings can't drift on this. It reads only the first 256KB of each file (the DSCF originals run 5MB+ and the grid asks about all 60-odd at once) and memoizes on path+mtime+size.

Every field is optional and the panel renders whatever survived: **Instagram strips EXIF**, so synced photos show only pixel dimensions plus the date recovered from the filename prefix (`list.js` fills that in). Dimensions come from the SOF frame header rather than EXIF, so they describe the file actually being served.

The detail row is `[ ‹ ][ photo ][ EXIF ][ › ]` — the chevrons are laid-out siblings pinned to the modal's edges, not overlays on the image, and `#sModal.sm-large #sModalBody > .photo-detail` opts out of the modal's 640px reading column so the row has room. Under 760px the panel wraps beneath the photo as a single strip of facts.

**`content/photos/instagram-sync.json`** records every post shortcode already handled (including video posts, so they aren't re-examined). A post is downloaded **once, ever** — which is what makes curation possible: **deleting a photo from the repo is permanent**, the sync will not re-add it. To deliberately re-pull a post, remove its entry. The file is ignored by the grid (the listing only matches image extensions). If a carousel only partially downloads, the whole post is rolled back off disk and retried next run, so half-imported albums never reach a PR.

**Env / secrets:**
- `INSTAGRAM_ACCESS_TOKEN` (required repo secret) — long-lived Instagram token. Needs a Creator or Business account; the old Basic Display API was shut down in December 2024, so this uses Instagram API with Instagram Login.
- `IG_PAT` (optional repo secret) — a PAT with `secrets: write`. Long-lived tokens expire after ~60 days; the sync refreshes on each run but a refreshed token is only useful if it replaces the stored secret, which `GITHUB_TOKEN` cannot do. Without `IG_PAT` the sync still works, but the token must be re-minted by hand before it lapses (the run summary reports days remaining).
- Opening PRs with `GITHUB_TOKEN` requires **Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"**.

## Content Sources

Weather (Open-Meteo), YouTube oEmbed music metadata, and the v2 background image were
all consumed by the deleted front end. They are documented on `main`; nothing on this
branch reads them.
