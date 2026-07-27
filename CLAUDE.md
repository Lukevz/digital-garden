# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal digital garden / portfolio website that simulates the Bear notes app interface. It features:
- An interactive black hole particle simulation background
- Bear-style 3-pane note browser with tag navigation
- OS-style window management system (draggable, resizable windows)
- Music player with YouTube integration
- Tasks/goals viewer
- Static site - no build process required for core functionality

## Development Commands

**Start development server:**
```bash
node build/dev.js
```
This starts a local server at http://localhost:3000, watches the `/posts`, `/sounds`, `/labs`, and `/thought-train` folders for changes, and auto-regenerates their corresponding manifest files when content is added/modified.

**CRITICAL - Dev Server API Endpoints:**
The dev server (`build/dev.js`) provides API proxy endpoints for the music player:
- `/api/youtube/playlist?id=PLAYLIST_ID` - Fetches YouTube playlist tracks (query parameter format)
- Requires `music-config.js` with YouTube API key configuration
- Returns playlist items in format expected by `fetchPlaylistWithCache()` in js/app.js

**Build manifests:**
```bash
node build/build.js
```
Scans folders and generates manifest files:
- `posts.js` - Markdown files from `/posts` folder
- `sounds.js` - Audio files from `/sounds` folder
- `labs.js` - Lab projects from `/labs` folder
- `thought-trains.js` - Thought trains from `/thought-train` folder

**Running the site:**
Simply open `index.html` in a browser, or use any static file server. No build step required for core functionality. However, for the music player to fetch YouTube playlists in development, you must use `node build/dev.js` which provides the API proxy.

## Architecture

### File Structure
```
/
├── index.html              - Main entry point, contains all views
├── styles.css              - All styles (window system, Bear UI, Zen player)
├── background.js           - Black hole particle simulation
├── cursor-trail.js         - Mouse cursor trail effect
├── /js/                    - Modular JavaScript (ES6 modules)
│   ├── app.js              - Main application orchestration
│   ├── /config/            - Configuration modules
│   │   ├── icons.js        - SVG icon definitions (tags, music folders, weather)
│   │   ├── constants.js    - App constants (folders, hidden tags, keys)
│   │   └── state.js        - Centralized state initialization
│   ├── /utils/             - Utility functions
│   │   ├── dom.js          - DOM utilities (formatDate, filenameToSlug)
│   │   ├── storage.js      - LocalStorage helpers
│   │   ├── yaml.js         - Shared YAML frontmatter parser
│   │   └── markdown.js     - Markdown to HTML parser (12KB)
│   ├── /parsers/           - Content parsers
│   │   ├── post-parser.js  - Bear-style post parsing
│   │   ├── train-parser.js - Thought train parsing
│   │   └── lab-parser.js   - Lab project parsing
│   └── /build/             - Build utilities
│       └── manifest-builder.js - Shared manifest generation
├── /build/                 - Build scripts
│   ├── build.js            - Generate all manifests
│   └── dev.js              - Dev server with file watching & API proxy
├── /posts/                 - Markdown notes
├── /thought-train/         - Thought train markdown files
├── /labs/                  - Lab project markdown files
├── /sounds/                - Local audio files
└── /api/                   - Vercel serverless functions (production)
```

**Auto-generated manifests:**
- `posts.js` - Markdown files from `/posts` folder
- `sounds.js` - Audio files from `/sounds` folder
- `labs.js` - Lab projects from `/labs` folder
- `thought-trains.js` - Thought trains from `/thought-train` folder

**Configuration files:**
- `music.md` - YouTube videos, playlists, and channels
- `music-config.js` - YouTube API key configuration (gitignored, required for dev)
- `goals.md` - Task list with checkboxes

### Key Systems

**Modular Architecture:**
The codebase uses ES6 modules for clean separation of concerns:
- **Configuration** (`/js/config/`) - Icons, constants, and state initialization
- **Utilities** (`/js/utils/`) - Shared helper functions (DOM, storage, YAML, markdown parsing)
- **Parsers** (`/js/parsers/`) - Content parsing logic (posts, thought trains, labs)
- **Build** (`/js/build/`) - Manifest generation utilities
- **Main App** (`js/app.js`) - Application orchestration and UI logic

**Bear-Style Note Browser:**
- Uses `parsePost()` from `js/parsers/post-parser.js` to extract frontmatter, hashtags, and content from markdown
- Supports nested tags (e.g., `#business/career`)
- Tag hierarchy rendered as collapsible tree
- Posts manifest at `posts.js` includes creation dates from filesystem
- URL routing: `#note/slug` for deep linking to notes

**Black Hole Simulation (background.js)**
- Canvas-based particle physics with gravitational attraction
- 400 particles orbiting the black hole
- Mouse interaction creates repulsion effects
- Celestial bodies (moons/planets) orbit at different speeds
- Frame-limited to 30 FPS for performance

**Music Player (app.js:2814-3355)**
- **CRITICAL**: Zen Mosaic-style music player with embedded playback for YouTube videos and local audio
- **Folder Order**: Music, Podcasts, Ambience, Sounds (defined in `defaultMusicFolders` at app.js:308)
- **Auto-play**: Tracks automatically start playing when clicked from playlist
- **Dual Playback Support**:
  - YouTube videos: Embedded via YouTube IFrame API (`ensureYouTubePlayer()` at app.js:3351)
  - Local audio: HTML5 audio player (`ensureAudioPlayer()` at app.js:3344) for files in `/sounds` directory
- **Track Sources**:
  - `music.md`: YouTube videos, playlists, and channels
  - `sounds.js`: Auto-generated manifest of local audio files (built by `node build.js`)
- **Data Flow**:
  1. `loadMusic()` (app.js:2915) loads tracks from music.md and sounds.js
  2. `parseMusicMd()` (app.js:3010) parses markdown to extract videos, playlists, channels
  3. YouTube playlists expand via API (`fetchPlaylistWithCache()` at app.js:2874)
  4. `loadSounds()` (app.js:2814) imports sounds.js manifest
  5. All tracks combined in `musicState.allTracks`
  6. `applyFolderFilter()` (app.js:3210) filters tracks by active folder
  7. `renderPlaylist()` (app.js:3251) displays filtered tracks
  8. `playTrack()` (app.js:3315) handles playback for both YouTube and local audio
- **NO THUMBNAILS for Sounds folder** (app.js:3287-3294) - thumbnails hidden to keep UI clean
- **Styling**: `.zen-device` has NO box-shadow (styles.css:2441) per design requirements

### Data Format

**posts.js format:**
```javascript
export default [
  {
    "file": "My Note.md",
    "created": "2025-01-19"
  }
]
```

**Markdown frontmatter (optional):**
```markdown
---
title: Note Title
date: 2025-01-19
tags: [tag1, tag2]
---
```

**Bear-style hashtags:**
Tags can be placed anywhere in content using `#tagname` or `#parent/child` for nested tags.

**music.md format:**
```markdown
## Music
- [Title](https://youtube.com/watch?v=...)
- https://youtube.com/watch?v=...

## Podcasts
- [Channel Name](https://youtube.com/@handle)
```

Links can be in markdown format `[Title](url)` or just bare URLs. Folders are defined by `##` headings.

**goals.md format:**
```markdown
# Section Name
- [x] Completed task
- [ ] Pending task
- Regular list item (shows as active)
```

**sounds.js format (auto-generated):**
```javascript
export default [
  {
    "file": "Sound Name.m4a",
    "created": "2025-12-27"
  }
]
```
Supported audio formats: `.m4a`, `.mp3`, `.wav`, `.ogg`, `.aac`, `.flac`, `.webm`, `.qta`

## Important Implementation Details

**Music Player - CRITICAL Implementation Rules:**

⚠️ **DO NOT modify these without careful consideration - this system has been debugged extensively**

1. **Track Data Structure:**
   - All tracks stored in `musicState.allTracks` (combined from all sources)
   - Filtered tracks stored in `musicState.tracks` (current folder only)
   - Track object must have: `title`, `artist`, `folder`
   - YouTube tracks: also have `videoId`, `thumbnail`, `url`
   - Local audio: also have `audioUrl`, `isLocalAudio: true`
   - Channels: also have `isChannel: true` (opens in new tab, not playable)

2. **Playlist API Format:**
   - Frontend calls: `/api/youtube/playlist?id=PLAYLIST_ID` (query parameter)
   - Returns: `{ items: [...], pageInfo: {...} }` format
   - Each item has: `snippet` and `contentDetails` matching YouTube API v3 structure
   - Dev server (dev.js:241-305) must handle this endpoint
   - Production uses Vercel serverless function (api/youtube/playlist.js)

3. **Playback Rules:**
   - `playTrack(index)` (app.js:3315) is the ONLY entry point for playing tracks
   - YouTube: calls `ensureYouTubePlayer(videoId)` which auto-plays
   - Local audio: calls `ensureAudioPlayer(audioUrl)` with `autoplay` attribute
   - Channels: don't call playTrack, they're `<a>` tags that open in new tab

4. **Sounds Folder Special Rules:**
   - NO thumbnails displayed (app.js:3287-3294 checks `track.folder !== 'Sounds'`)
   - Files loaded from `sounds.js` manifest (auto-generated by build.js)
   - Display: filename without extension as title, creation date as artist
   - Sorted by creation date (newest first)

5. **Folder Management:**
   - Default order defined ONCE at app.js:308: `['Music', 'Podcasts', 'Ambience', 'Sounds']`
   - `mergeFolders()` (app.js:3195) combines default folders with folders from music.md
   - `applyFolderFilter()` (app.js:3210) filters `allTracks` to current folder
   - `switchFolder()` (app.js:3214) changes active folder and re-renders

6. **Rendering Pipeline:**
   ```
   loadMusic() → parseMusicMd() + loadSounds() → combine into allTracks
      ↓
   applyFolderFilter() → filters to musicState.tracks
      ↓
   renderPlaylist() → displays playlist items
      ↓
   User clicks track → playTrack() → ensureYouTubePlayer() OR ensureAudioPlayer()
   ```

7. **DO NOT:**
   - Add fallback tracks for failed playlist fetches (silently skip instead)
   - Show thumbnails for Sounds folder tracks
   - Add box-shadow to `.zen-device` class
   - Change folder order without updating `defaultMusicFolders`
   - Use path-based playlist API (`/api/youtube/playlist/ID`) - must use query param format

**Tag System:**
- Hidden tags (defined in `hiddenTags` array) are excluded from sidebar
- Currently: `status` tag is hidden
- Nested tags use `/` separator and render as collapsible tree
- Tag icons defined in `tagIcons` object using Lucide SVG paths

**Particle Simulation:**
- Uses vis-viva equation for orbital mechanics (background.js:86)
- Particles stabilized with tangential velocity correction (background.js:350-359)
- Event horizon fading and accretion disk swirl effects
- Edge fade system prevents harsh cutoff at viewport boundaries

**Window Dragging:**
- Only draggable by titlebar, not by interactive elements
- Position stored as `left`/`top` CSS properties, not transforms
- Z-index managed via `state.windows.highestZIndex`

**Note URL Routing:**
- Format: `#note/slug` where slug is filename converted to URL-safe format
- `filenameToSlug()` converts spaces and special chars to hyphens
- `getNoteFromUrl()` parses hash and finds matching post
- History API used for navigation without page reloads

**Section pages vs. the section modal (js/main.js):**

The top-bar tabs are Career / Writing / Videos / Photos. **Career is the home view** — `navModeFromState()` returns `'career'` for life mode with no section route, so its tab is active from first paint.

The other three are *pages*, not modals (`SECTION_PAGES` in js/main.js). On `#writing` / `#videos` / `#photos`, `openSectionPage()` adds `body.section-mode`, which drops the home lockup + feed, shrinks the fixed hero to ~52vh with a left-aligned title + description (`#sectionHero`), and shows `#sectionBelow` as the page body. Every other section (Career, Case Studies, Labs, Portfolio, …) still opens in `#sModal`, unchanged.

⚠️ The section renderers (`renderIndex`, `renderItem`, `renderPhotosGrid`, …) are **shared between the two surfaces** and paint wherever `sModalBody` points. It's a `let`, not a `const`: `openSectionPage()` repoints it at `#sectionPageBody` and `closeSectionPage()` puts it back. Don't turn it back into a `const` or capture it in a closure.

Item views work the same on both surfaces: renderers signal "this view has a parent" by setting `sModalBack.style.display = 'flex'`, and a MutationObserver on the page body mirrors that onto the hero via `syncSectionHero()`. That's what makes the photo detail — which is opened by a click, not a hash — get a working back control for free.

On an item the hero switches to a **detail lockup** (`body.section-detail`): back button on top, icon and blurb hidden, the item's own title at a smaller size in place of the section name, and the header narrowed to the same reading column the body uses so both share one left edge. That title is **hoisted out of the rendered body** (`.cs-body h1`) rather than threaded through every renderer, and the original gets `.is-hoisted` so it isn't shown twice.

Header and body cross-fade together on the way in (`fadeHeroCopy()` + `.section-page .sm-fade`, both 280ms). ⚠️ The header fade is gated on the header being **settled** — every render syncs twice, once on its `Loading…` placeholder and again on the real content, and fading on the placeholder starts the transition under the *old* title and swaps it mid-fade. Only one animation runs at a time (the previous is cancelled), or overlapping runs can strand the header dimmed.

**A single photo stays a modal.** It's the one item view that doesn't become a page: the modal is what carries the blurred-photo backdrop (`#sModalBg` + `.sm-photo`), which tints the whole panel to that photo. `openPhotoDetail()` repoints `sModalBody` back to the modal and opens it over the still-live grid, so closing it is the entire way back — no in-modal back step. `closeSModal()` checks `activeSectionPage` and hands the URL and the render target back to the page underneath instead of clearing the hash.

**Video slugs:** `#videos/<title-slug>`, not the raw YouTube id. `videoSlugBase()` slugifies the title (90-char cap, truncated on a word boundary); `videoSlugMap(videos)` then assigns slugs **across the whole set** so same-title clips — Videos merges two channels, which do overlap — get `-2`, `-3` suffixes instead of colliding. The map is ordered by `videoId`, *not* display order, because the index and the item view build it independently and must agree. `renderVideoItem()` resolves a title slug first and falls back to a raw id, so `/#videos/<id>` links shared before the change still work. Since a slug's shape no longer distinguishes a clip from a markdown post in `content/videos/`, it asks the channel feed first and falls back to `renderMarkdownItem()`.

**Video descriptions:** the detail view renders the description **in full** — no clamp. `api/youtube/channel-videos.js` reads it from `playlistItems.snippet`, which returns the whole thing (`search.list` is the endpoint that truncates), so there's nothing extra to fetch. It's plain text, not markdown: `.video-desc` uses `white-space: pre-wrap` to keep the author's line breaks and chapter lists, and `linkifyText()` turns bare URLs into links. ⚠️ That helper matches against the **raw** text and escapes each segment on the way out — escaping first and linkifying the result looks equivalent but breaks quoted URLs (the closing `"` has become `&quot;`, so `&quot` gets swallowed into the href).

**Per-page starfield skies (js/grid.js):**

`SCENES` holds one sky per view. `home` is the authored full-viewport sky (grey moon top-left, twin suns lower-right). Writing / Videos / Photos each declare `compact: true` plus their own bodies, palette, star `density` and `seed`:
- **compact** skies size their field by **measuring the hero**, so they track its responsive height instead of assuming a fraction, and stop exactly at the seam where the page body covers them.
- compact skies **don't do the theme half-turn swing** (`computeFrameBodies`). The section hero's copy is left-aligned and fills the left half, so a 180° swing sweeps the bodies straight through the title. They sit in the right margin, opposite the copy, in both themes.
- Bodies are generic: `kind: 'sun'` (with `core`/`edge` colours) or `kind: 'moon'`. `launchpad: true` marks the body ships peel off — only home has one.

⚠️ **js/main.js loads before js/grid.js.** On a page that comes up straight at a section route, `window.grid` doesn't exist yet, so main.js records the sky on `body[data-sky]` (`setSky()`) and grid.js reads that attribute when it initialises. Push the scene through `setSky()`, never `window.grid.scene()` directly.

## Development Workflow

1. Add new markdown files to `/posts` folder
2. Run `node dev.js` to auto-rebuild `posts.js` on changes
3. Use Bear-style hashtags for organization: `#business/ideas`, `#writing`, etc.
4. First H1 in markdown becomes the note title (if no frontmatter)
5. Hashtags are automatically stripped from displayed content

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

**Daily automation (GitHub Actions):**
- `.github/workflows/kb-gaps-digest.yml` (daily cron + manual `workflow_dispatch`) runs `.github/scripts/kb-gaps.mjs`, which fetches the gap list and upserts ONE GitHub issue labeled `kb-gaps` with a checklist. When no gaps remain, the issue is closed. Answer the gaps from Claude Code mobile: open the repo, say "answer these KB gaps", Claude branches → writes answers as notes in the `content/second-brain/` vault (per its `AGENTS.md`) → re-runs `npm run index` to regenerate the committed `src/data/brain-index.json` → opens a PR.
- `.github/workflows/kb-gaps-resolve.yml` (on PR merge) runs `.github/scripts/kb-resolve.mjs`, which reads `Resolves-KB-Gap: <key>` lines from the merged PR's title/body and POSTs them to the resolve endpoint, so answered gaps drop off the list. The secret lives only in GitHub Actions, never in a chat session.
- Required GitHub repo secret: `CHAT_INSIGHTS_KEY` (Settings → Secrets and variables → Actions). Optional repo variable: `CHAT_INSIGHTS_URL` (defaults to `https://lukevz.com`).

**Mock/test mode (js/chat.js):** For styling/UX work on the chat UI without spending Gemini tokens. Enable with `?chatmock=1` in the URL (that page load only) or persistently via `chat.mock(true)` in the console (`chat.mock(false)` to turn off; stored in localStorage under `chatMockMode`). An orange "chat test mode" badge shows while it's on (click it to disable). Mock mode swaps only the transport (`chatFetch()` → `mockFetch()`), faking the SSE stream with a `ReadableStream`, so the real streaming/markdown/error code paths all run, including the headless hero `ask()` path. Message keywords select fixtures: `help`, `short`, `long`, `links`, `md`, `empty`, `error` (500), `429`, `netfail`; anything else cycles canned in-voice replies.

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

- Weather: Open-Meteo API (free, no key required) for Atlanta, GA
- Music metadata: YouTube oEmbed API
- Background image: `images/bg.jpg` (customizable via CSS variable `--bg-image`)
