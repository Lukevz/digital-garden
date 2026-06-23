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

## Development Workflow

1. Add new markdown files to `/posts` folder
2. Run `node dev.js` to auto-rebuild `posts.js` on changes
3. Use Bear-style hashtags for organization: `#business/ideas`, `#writing`, etc.
4. First H1 in markdown becomes the note title (if no frontmatter)
5. Hashtags are automatically stripped from displayed content

## Chat Assistant (api/chat.js)

The chat tab answers in Luke's voice, grounded in `/content/about/*.md` (see `loadKnowledgeBase()`), streaming from Gemini.

**Two kinds of questions (handled in `buildSystemPrompt()`):**
- **About Luke** (life, work, opinions, biography): answered only if covered by the knowledge base; otherwise it redirects to DM rather than guessing. Out-of-scope topics (`out-of-scope.md`) are politely declined.
- **General questions** (math, facts, definitions, coding help, small talk — e.g. "what is the square root of pi"): answered normally like any assistant, still in Luke's voice. These do NOT require anything in the knowledge base.

**Question capture + gap tracking (KV-backed):**
- Every visitor question is classified by a cheap second Gemini call (`classifyQuestion()`) as `general`, `personal_covered`, or `personal_gap`. This runs in parallel with the streamed answer and is awaited before the response ends, so it adds no latency to the first token and never blocks chat (all KV/classify calls are best-effort, wrapped in try/catch).
- Every question is appended to a capped Vercel KV list (`chat:questions`, last 1000).
- `personal_gap` questions are upserted into a deduped gap to-do list (`chat:gaps`, hashed by normalized topic) with a `suggestion` phrased for Luke to answer, plus a count and example questions.

**Reviewing captured data:** `GET /api/chat-insights?key=SECRET[&limit=N]` returns the recent questions and the gap to-do list as JSON. Requires env var `CHAT_INSIGHTS_KEY`; wrong/absent key returns 401/500. Uses the same Vercel KV database as the guestbook.

**Resolving gaps:** `POST /api/chat-insights?key=SECRET` with body `{ "resolve": ["<gap key>", ...] }` (or `{ "resolveAll": true }`) removes answered gaps from the to-do list. Same key auth.

**Daily automation (GitHub Actions):**
- `.github/workflows/kb-gaps-digest.yml` (daily cron + manual `workflow_dispatch`) runs `.github/scripts/kb-gaps.mjs`, which fetches the gap list and upserts ONE GitHub issue labeled `kb-gaps` with a checklist. When no gaps remain, the issue is closed. Answer the gaps from Claude Code mobile: open the repo, say "answer these KB gaps", Claude branches → edits `content/about/*.md` → opens a PR.
- `.github/workflows/kb-gaps-resolve.yml` (on PR merge) runs `.github/scripts/kb-resolve.mjs`, which reads `Resolves-KB-Gap: <key>` lines from the merged PR's title/body and POSTs them to the resolve endpoint, so answered gaps drop off the list. The secret lives only in GitHub Actions, never in a chat session.
- Required GitHub repo secret: `CHAT_INSIGHTS_KEY` (Settings → Secrets and variables → Actions). Optional repo variable: `CHAT_INSIGHTS_URL` (defaults to `https://lukevz.com`).

**Env vars:** `GEMINI_API_KEY` (required), `GEMINI_MODEL` / `GEMINI_CLASSIFY_MODEL` (optional overrides), `CHAT_INSIGHTS_KEY` (required to read insights), and Vercel KV vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, auto-configured by Vercel) for capture/gap persistence. Without KV vars (e.g. local dev), chat still works and logging is silently skipped.

## Content Sources

- Weather: Open-Meteo API (free, no key required) for Atlanta, GA
- Music metadata: YouTube oEmbed API
- Background image: `images/bg.jpg` (customizable via CSS variable `--bg-image`)
