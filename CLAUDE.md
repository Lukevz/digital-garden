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

**Theme — dark-only for now:**

Light mode is switched off, not deleted. Three things pin it, and all three have to be undone together to bring it back:

1. `_index.html` carries `data-theme="dark"` on `<html>` (and `<meta name="color-scheme" content="dark">`), so the **first paint** is dark even on a light-preference system — no flash before JS runs.
2. `THEME_LOCK_DARK = true` in js/main.js makes `isDarkTheme()` and `systemPrefersDark()` always answer dark, redirects `applyThemeSystem()` to pin `data-theme="dark"` instead of clearing it, hides `#themeToggle` and never wires its click, and skips the `prefers-color-scheme` change listener. The toggle markup, the wipe animation, and the whole session-override path are left intact and unreachable.
3. `#themeToggle` has `hidden` in the markup, plus `#themeToggle[hidden] { display: none !important; }` in styles.css.

⚠️ Why the pinned attribute is what makes this safe: every light-keyed selector in styles.css is either `[data-theme="light"]` or `:root:not([data-theme])`, and **neither can match once the attribute is set** — so light styling is unreachable by construction rather than by overriding it. The counterpart is that `@media (prefers-color-scheme: dark) { html:not([data-theme="light"]) … }` blocks stop applying on a light-preference machine; each one already has a `[data-theme="dark"]` twin carrying the same declarations, so **any new dark rule must be written as that pair, not as the media query alone**.

`api/home.js` no longer sniffs `Sec-CH-Prefers-Color-Scheme` for the OG image — it always serves `og_dark.png`, and the response no longer varies by client hint.

**How the poster hero leaves (`heroParallax()` in js/main.js):**

Home is a **descent**. The page opens at scroll 0 on the poster, `.hero-spacer` — which must sit **above** `#belowFold` in the DOM — reserves a short runway (60vh) so the poster holds for a beat, and the feed then rises into frame at native scroll speed while the fixed world drifts *up* past the camera. The long runway that used to live in the spacer is now the `.world-void` immediately below, which does the same job and animates.

⚠️ `travel` is **`scrollY`**, and this function is the one place that's correct. `.hero` is `position: fixed`, so scroll offset *is* the camera's travel, and it is 0 on the first frame by construction. It used to be measured off the feed's own top edge (`vh - rect.top`), which is only equivalent while the spacer is about one screen tall — cutting the spacer to 60vh left the feed's edge already 40vh inside the viewport at scroll 0, so `travel` opened at 0.4 of a screen and **the poster lockup was a third of the way through its exit before the visitor touched the wheel** (HELLO off the top of the landing screen). `heroParallax()` owns only the hero's own exit and the world's depth drift; everything that happens to the *world* is `js/worlds.js`, keyed off the void's rect.

> *Formerly a reversed reveal* (loaded pinned to the document's end, scrolled up, feed descending as a curtain, sections flipped with `column-reverse`). That's gone — see "Worlds" below for why. If you find a comment or selector that still assumes it, it's stale.

The hero lockup **leaves through the top of the frame rather than fading**. The world rises past the camera and the copy goes with it at full opacity; `--intro-greeting-reveal` stays pinned at 1 on this layout.

- The distance is **measured, not assumed** (`sinkDistance()`): the lockup mixes clamped type with a vw-scaled avatar, so its share of the viewport moves with the window. It reads the lockup's rect and subtracts the offset it applied last frame to recover the resting position — which is why the read happens with the other rect reads at the top of `update()`, before the frame's first style write.
- ⚠️ `--hero-sink` is **negative** on this layout (`sinkApplied = -sinkDist * …`).
- Easing is `t^1.7`, not linear. Linear reads as a scrollbar dragging the text away; the acceleration is what sells the fall. `SINK_END` (0.78) sits *under* the scene's own 0.5→0.8 opacity ramp on purpose, so the copy exits while the planet is still there rather than leaving an empty sky.
- ⚠️ The transform rides **`.hero-lockup`** — the one element holding both the avatar and the copy. `.clock-hero-wrap` already owns a `translateY(-8.5vh)` that a second transform would replace, and shifting the two halves separately means two rules that have to stay in step forever.
- `.hero` is `overflow-y: auto`, and a descendant translated far enough extends its scrollable overflow — that popped a nested scrollbar during the old *downward* sink. Overflow above a box isn't scrollable, so `overflow: clip` (not `hidden`, which would make it a scroll container) is belt-and-braces now rather than load-bearing. Kept anyway; the overflow-menu pages (Bookshelf / Gear / App Stack / Places) scroll their own tall grids inside `.hero` and are excluded.
- ⚠️ Reduced motion takes the `navPinnedOpen()` early-out. That branch has to hold the reveal at 1 for the dust hero — a blanket 0 leaves reduced-motion visitors on a home page with a planet and no name on it, since `--intro-greeting-reveal` is the lockup's own opacity and nothing else's.
- ⚠️ `genieProgress()` in js/grid.js **returns 0 on `dust-hero`**. The per-cell "genie" collapse existed to hide the star field before the feed's opaque curtain covered it; the feed is transparent now and the field *is* the world's sky, so it stays lit all the way down and warps at world boundaries instead. Keyed off raw scroll it would finish at 50vh — a full viewport before any content arrives.

**Worlds — the home feed is a descent through biospheres (js/worlds.js):**

Home isn't one backdrop with content over it. It's a sequence of **worlds** separated by **voids**, and the direction never reverses — what changes is scale and context. Each void names its own transition with `data-passage`, and `js/worlds.js` dispatches on that: `storm` is the dust→ocean scale reveal, `genie` is the ocean→message collapse, and anything unnamed (`fade`) gets a plain cross-fade. Both named passages are documented below.

⚠️ **`applyLive()` mounts the active void's TWO worlds, not every layer on the page.** It used to mean "all of them", which was indistinguishable while there were two worlds and one passage; with four it puts the dust planet back on screen underneath the ocean draining away.

```
  space          ← intro pans DOWN onto the planet
  poster         ← HELLO, planet at the horizon
  ┌─ void: data-passage="storm" ───┐
  │ you fly INTO the planet        │
  │ storm rolls up over it         │
  │ …the shape shrinks, unseen…    │
  │ storm clears → the mirror pose │
  │ it keeps receding → JELLYFISH  │
  └────────────────────────────────┘
  ocean          ← Case Studies + Timeline, all of it underwater
  ┌─ void: data-passage="genie" ───┐
  │ the sea drains DOWNWARD        │
  │ …through a neck, into the      │
  │ question bubble below…         │
  │ → a blue dot → the bubble      │
  └────────────────────────────────┘
  chat           ← the testimonial thread, in a LIGHT room
  ┌─ void: data-passage="fade" ────┐
  └────────────────────────────────┘
  deep           ← Principles / Goals / Experiments, open field
```

⚠️ **Everything moves in one direction: down.** This is the constraint the whole model exists to protect, and it's easy to break one half of it without noticing the other:

1. **The intro descends.** `runDustIntro()` opens on empty space with the planet below the frame and brings the camera *down* onto it — `--pan-start` is **positive** (40vh, the scene pushed below) easing to 0. It used to be `-75vh`: camera buried in the storm, tilting *up*. That made the opening a rise and everything after it a fall, which is the same palindrome the reversed-reveal layout had.
2. **The planet doesn't leave.** `heroParallax()` no longer fades `#heroScene` out, and its drift is clamped to one screen. The dust planet is the world the Timeline is *read inside*, not a hero that gets out of the way. Recession is `--world-dim`'s job.
3. **You leave it by going through it.** See the passage below.

The storm beat (swirls, gusts, lightning) is **not in the intro** any more — it only worked because the camera started buried in the dust, and the dust is masked to below the horizon. It moved to the descent, where you're genuinely inside the weather. The elements stay in the markup and rest at opacity 0 **in the stylesheet**.

> ⚠️ `runDustIntro()` must **not** write inline `opacity: 0` on the veil, swirls, bolts or gusts to park them. Every one of those is lit by a `calc()` off a `--w-*` var, and an inline opacity outranks that calc — parking them there switched the entire storm off. It only *looked* fine because the intro's wrap-up clears inline styles ~6s in, which quietly made the bug depend on how fast the visitor scrolled. The gusts weren't in `sceneEls` at all, so theirs was never cleared and they were dead for the whole session.

**The passage — the scale reveal:**

The transition sits **immediately after the hero**, as the first child of the home feed (`.world-void[data-passage="storm"]`), and runs about two screens. Scrolling off the poster doesn't slide the planet away — **you fly at it**, the storm rolls up over you, and what comes back out is **the same shape at a completely different scale**: a jellyfish, underwater. Everything below reads in the ocean; the Timeline fades in already down there.

`js/worlds.js` derives everything from `enter` (0→1 as the reading line crosses the void). **Nothing in the passage is on a clock** — every value is a scroll position, so stopping stops the storm and scrolling back plays it in reverse:

| var | window | shape | drives |
|---|---|---|---|
| `--w-push` | .00–.30 ↗ .50–.72 ↘ | 0→1→0 | the camera dive at the limb (scale 2.15, origin on the horizon) and back out |
| `--w-storm` | .06–.30 ↗ .56–.74 ↘ | 0→1→0 | dust, `.hs-veil` |
| `--w-shrink` | .24–.50 | 0→1 | d0 → dm, **hidden** |
| `--w-morph` | .30–.52 | 0→1 | the *fill* cross-fading planet → bell, **hidden** |
| `--w-recede` | .56–.93 | 0→1 | dm → bell size, **in plain sight** |
| `--w-reveal` | .66–.88 | 0→1 | oral arms, water shimmer, the other jellies |
| `--w-hand` → `--world-handoff` | .86–.94 | 0→1→**1** | the ocean's standing copy of the jellyfish fades in underneath |
| `--w-exit` | .90–.99 | 0→1 | the dust scene fades out over it — nothing moves |
| `--w-churn` | = `enter` | 0→1 | swirl rotation, gust sweep |
| `--w-travel` | .06–.30 ↗ half, .56–.74 ↗ rest | 0→.5→1 | WHERE the veil sheet is: below the frame → centred over it → off the top |
| `--w-flash-a/-b` | pulses | spikes | lightning, each a `pulse()` centred on a scroll position |
| `--world-enter` | .20–.46 | 0→1 | the incoming world's opacity |
| `--world-settled` | | 0→reveal→**1** | the first chapter's fade-in |

⚠️ **The veil is a SHEET, not a wash.** `.hs-veil` is 300vh tall with feathered mask edges, and `--w-travel` slides it up across the frame (below → covering → off the top) while `--w-storm` owns opacity — that's what makes the storm something you scroll *through* instead of an overlay that fades in place. `--w-travel` is two half-ramps synced to the storm's rise and fall so the sheet is exactly centred (full cover) for the entire opacity plateau; key it to `enter` linearly and the feathered leading edge crosses the frame at full strength, leaving a see-through band at the top of the storm.

⚠️ **Ambient loops pause while crossing (`body.is-world-crossing`).** The passage transforms `.hero-scene__pan` every scroll frame; the compositor can move that cached subtree for free only while nothing inside it invalidates. js/worlds.js holds the class while any void owns the reading line, and styles.css pauses the limb shimmer, cloud/wisp/dust drifts and the ocean's shimmer/snow on it (and drops `.hs-grain`, which pausing can't help) — the same trick, for the same reason, as the intro's `dust-intro-pending` block. This is what fixed the mid-passage scroll jank and the missing-tile flashes. Related: `.hs-atmo-band`'s gradient interior is now **transparent** — it used to be solid teal to the centre (hidden behind the opaque planet), and any frame where the planet's tiles rasterized late showed raw teal rectangles through the gap; it also tinted the translucent bell from behind once `--w-morph` faded the planet to 6%.

⚠️ **Only `--w-morph` has to stay inside the storm's plateau.** The *size* is free to keep changing in the open — that reads as distance, and is exactly what `--w-recede` is for — but the moment the **fill** visibly changes identity you're watching a planet turn into a jellyfish, which is a cartoon. Hidden, you simply have to re-read what you were already looking at.

⚠️ **`--world-enter` is not raw `enter`.** It's shaped to arrive *under* the storm and be fully present before the dust lifts. Keyed off `enter` directly you watch the water fade up over the planet, which gives the whole thing away before the reveal.

⚠️ **`--world-settled` is monotonic and the phase windows are not.** They all fall back to 0 in a chapter, so keying content off them would hide the thing they just introduced. That's what `settled` exists for — 0 before the void, `reveal` inside it, 1 once past. ⚠️ It's keyed to the **storm** void by passage name, not to `vs[0]` — there are three voids now and only that one has a reveal to settle out of.

**⚠️ The bell is the planet's own circle, not a second picture.** `.hs-planet`, `.hs-atmo-band`, `.hs-atmo-bloom` and `.hs-bell` all sit on one shared geometry rule and share `--planet-d` and `--hs-top`. Only the *fill* cross-fades. The moment one of them gets its own `top` or `width` they stop being the same object and the reveal degrades into a dissolve.

- **Three stops, not two, and the middle one is the point.** A straight `d0 → d1` lerp is useless: `d0` is thousands of px and `d1` is a third of the viewport, so a linear parameter spends ~96% of its range still looking like a horizon-filling limb and then collapses at the very end. `--hs-planet-dm` (118vh) / `--hs-topm` (-46vh) is the **mirror of the hero** — the whole body in frame with its bottom limb curving across the lower screen at exactly `--horizon`, sky underneath. That's the pose the storm hands back to you, and the reason the shrink is legible at all. ⚠️ The middle weight is `shrink - recede`, valid only while the two windows don't overlap.
- **⚠️ The bell is TOP-LIT, like the planet.** `.hs-bell` (and `.os-jelly::after`) layer a crown highlight at `50% 26%` over the centred body ramp — a centre-lit bell reads as a glowing orb, not the same body the planet was. The highlight is its own gradient layer, never an off-centre body gradient: the centred layer owns the circular feathered silhouette, and moving its origin deforms the silhouette into a blob. The ocean jellies additionally carry a teal rim ring in the same `::after` (the jelly-scale echo of `.hs-atmo-band`); the dust scene's bell gets its rim from the real band instead.
- **⚠️ The bell is WARM, not blue** — the planet's own apricot/cream ramp, a couple of stops deeper. Counter-intuitive (a cool bell against blue water is the obvious jellyfish) but a colour change makes the reveal a cross-fade between two different objects, i.e. a dissolve. Golden jellies in blue water is also just what Jellyfish Lake looks like, so the reference and the trick want the same thing. **What changes across the passage is the ground, never the body.**
- `.hs-atmo-band` is a **top-limb band**, not a halo — the same circle offset *up* by `--hs-atmo-h`, so the only glow is the crescent poking out above. Correct for the hero and useless the moment the body shows its bottom. `.hs-atmo-bloom` (formerly `display: none`) is the concentric half: same circle, `scale(1.14)`, ring straddling the limb all the way round, faded in on `--w-shrink`. It doubles as the jellyfish's water halo.
- **Oral arms, not a curtain.** `.hs-tentacles` hangs from the bell's *lower* rim (the bell is translucent — arms rooted higher show through it as stripes) and is kept short and dense. A curtain at 1.15× the body's height is a full viewport long while the body is still 100vh across on the way out of the storm.
- **⚠️ The tan dust layers are what draw a hard line across the ocean if you get their timing wrong.** They're clipped by `.hs-dust-clip` to below `--horizon` — invisible in the dust world because the cut runs along the planet's limb, glaring the moment the ground behind it is open water. Two things keep it hidden: the *ambient* term fades on `--w-shrink` (done by .50, deep inside the storm's plateau), and the *storm* term is **squared** so the dust clears faster than the veil. Sharing one curve with `.hs-veil` looks right and isn't — half a veil over half the dust leaves the seam showing for the whole back half of the beat.

**The jellyfish stays. ⚠️ It is a second element (`.os-jelly--hero` in `#oceanScene`), not the one from the passage.**

The dust scene's jellyfish physically cannot outlive the void: every dimension it has is interpolated on a phase window, and those all fall back to 0 in a chapter, so the shared circle snaps back to planet size the instant you leave. So the ocean carries its own copy at exactly the resting pose. `--world-handoff` (monotonic, same shape as `--world-settled`) fades that copy in **underneath** the original, and `--w-exit` then fades the original out **over** it — in that order, always overlapping, so there's never a frame where neither is at full strength. Nothing moves during the swap; you can't see it. Because `#oceanScene` is a fixed, full-viewport layer, the copy then simply stays pinned above the Timeline for the whole chapter.

- ⚠️ `--jelly-top` / `--jelly-d` (on `:root`) are the **one** definition of the resting pose. `#heroScene`'s `--hs-top1` / `--hs-planet-d1` read them, and so does `.os-jelly--hero`. They must not drift apart. The copy also has to carry `--hero-drift`, which the dust scene applies as a transform on `.hero-scene__pan`.
- ⚠️ `.os-jelly::before` is the **arms** and `::after` is the **bell**, in that order, so the translucent bell paints over the roots — the same stacking the dust scene gets from `.hs-tentacles` sitting before `.hs-bell`. Both arm masks start *transparent* at the top for the same reason: at full strength where they meet a translucent bell they show through it as a comb laid across the body.
- `.os-jelly--hero` carries `filter: brightness(1 + --world-dim × 0.6)`. Inside a chapter the world takes a ~52% wash plus each section's scrim, which is right for water and wrong for the subject; it can't be lifted above `#worldDim` (it lives in `#worldLayers`, which the dimmer paints over by design), so it brightens by as much as the dimmer darkens.

**Background jellyfish are DOM, not canvas.** `SCENES.ocean` in js/grid.js does carry `jelly` bodies and they're load-bearing — home's moon travels into the biggest one, which is how the moon becomes a jelly for free during the warp. But the star canvas sits **under** `#worldLayers` and `.os-water` is an opaque gradient, so **nothing drawn on the canvas survives into the ocean chapter**. The canvas jellies are the warp; the `.os-jelly` field in the markup is what you actually read. If you ever make the water translucent enough to show the canvas through it, delete the DOM field rather than keeping both.

- The field is `mix-blend-mode: screen` and uses a **more saturated** amber than the hero. Screen lifts value but eats chroma, so the shared fill (tuned to match `.hs-bell` under normal compositing) comes out grey-blue — the exact wrong note, since the point is that these are the same creature. ⚠️ Scoped off `--hero`, which must keep the shared fill unchanged or the hand-off stops being invisible.
- They bloom in on `--world-settled` (monotonic) and stay.

The incoming world's layer gets `.is-entering` and fades up at `--world-enter`. ⚠️ For this passage it paints **beneath** the outgoing one — backwards from a cross-fade, and the whole reason the reveal lands: the water has to be the *backdrop* the shrinking body is seen against, while the dust scene goes on painting the body in front of it. That's `#heroScene { z-index: 2 }` — **only** the dust scene is lifted; giving `#oceanScene` a matching number would also apply where the ocean is the *outgoing* layer and would invert the passage below it.

**The genie passage — the ocean drains into the message (`data-passage="genie"`):**

Where the water ends. Instead of one world fading into the next, the sea is **sucked down into the question bubble** of the testimonial thread below it — the whole biosphere pours into a message, pinches to a blue dot, and unfolds into the bubble the replies arrive in. The room behind it is light, so the thread reads as the app it's imitating.

`genieState()` / `genieOutline()` in js/worlds.js own it. Progress is **monotonic across the whole page** (0 above the void, 1 below), not just inside it, because the bubble's paint state has to be answerable anywhere: unpainted for the whole ocean chapter above, painted for the whole chat chapter below.

| var | window | drives |
|---|---|---|
| — (`drain`) | 0 – .86 | the clip-path: viewport sheet → a circle the size of the bubble's height |
| — (`open`) | .86 – .95 | that circle → the bubble's own rounded-rect silhouette |
| `--genie-tint` | .58 – .86 | the sea taking the bubble's blue *before* it stops being a shape |
| `--genie-hand` | last 14% of `open` | the real bubble's gradient taking over from the clip |
| `--genie-text` | .95 – 1 | the copy fading up inside it |
| `--w-genie` | = progress | published for CSS; not currently consumed |

- **Rows are cosine-spaced, 72 of them.** Uniform rows read as a faceted polygon exactly where the eye checks for roundness — the crown, the circle's poles, the bubble's corner radii. `rowU()` concentrates samples at the shape's top and bottom, where all the curvature lives.
- **The curve exponents live in `GENIE`** (`bow`, `topHold`, `botLead`, `crownFrom`), tunable live like the rest. `crownFrom` gates the crown to the back half of the drain: doming the corners while the sheet is still near frame size reads as a window being resized, so they stay square until the sheet has genuinely left the edges.
- **It is one outline function, sampled at N rows, for both acts.** Every act's end state is the next one's start state *exactly*, because they're written against the same parameterisation (`u` = 0 at the shape's top, 1 at its bottom) rather than against absolute geometry. That's what makes the three beats chain without a seam.
- ⚠️ **The circle is parameterised by `u`, not by `y`.** Solving the circle at each row's actual `y` gives zero width for every row outside the circle's band, so mid-drain the sheet is a rectangle with two spikes instead of a funnel — and the neck never forms.
- ⚠️ **The neck is measured against the shape's own reach, not the viewport's.** For most of the drain the bubble is still below the fold, so against the viewport every row is equally far from it, the neck term cancels, and the sheet collapses as a rectangle.
- ⚠️ **Both axes are eased hard, and the two vertical edges differently.** A sheet that starts leaving the frame edges on the first pixel of scroll reads as a window being resized; the top edge is what the eye reads as "how much sea is left", so it holds and lets go late while the bottom leaves early.
- ⚠️ **`(1 - d)` is raised to a power.** Raw, the pinch falls off linearly and the sides come out dead straight — a paper cone. The exponent is the only thing separating this from a triangle.
- ⚠️ **The crown closes ahead of the rest** (the `cap` term). The shape's top row is a straight horizontal cut across its current width; once the sheet is small that flat edge *is* the silhouette — a blue lozenge with its top sliced off. Closing the top rows early leaves a drop instead.
- ⚠️ **`--genie-hand` is NOT the same curve as `open`, and that is the difference between a transform and an overlay.** The real bubble is always at its full final width; the clipped water is whatever width the unfold has reached. Cross-fade them across the whole unfold and you see **both** — a solid lozenge sitting inside a pale full-width pill. The hand-off waits until the clip has all but finished, then crosses between two shapes that are already the same shape.
- **The incoming layer sits `.is-beneath`, at full strength, and is revealed by the water being clipped off it** — a genie passage must never *also* cross-fade, or the room washes out the water draining into it. ⚠️ `#chatScene { z-index: -1 }` has to be negative: the ocean can't be lifted (it's outgoing here and incoming in the passage above, and a number applies to both), and `0` doesn't drop it, since 0 and `auto` share a level and `#chatScene` wins on DOM order.
- **Unarmed → plain cross-fade.** Reduced motion, or a bubble that can't be measured (the feed is `display:none` in some modes), and the whole thing degrades to the fade the other voids use, with `--genie-hand`/`--genie-text` forced back to 1 so the bubble paints itself.
- Tune live: `worlds.genie.drainEnd` / `.openEnd` / `.neck` / `.tintFrom`, then scroll.

**The light room (`data-world="chat"`) — the one chapter that reads dark-on-light:**

`#chatScene` is deliberately inert: no weather, no depth, no texture. Every other world is a place with something going on in it; this one is the inside of the message bubble at viewport scale, and the thread is what you're meant to be looking at.

- ⚠️ **This is not light mode coming back.** Light mode is off by construction (see the theme note above — every light-keyed selector is unreachable while `<html>` carries `data-theme="dark"`). The ink block is a local repaint of one section against one opaque layer, scoped to `[data-world="chat"]`, and written in **literal colours, not tokens** — the tokens are all theme-derived and every one resolves dark. Reaching for `--text-primary` here is exactly how the section ends up invisible.
- ⚠️ **The per-section scrim is switched off for it.** The scrim pools ~70% `--bg` (near black) and would hang a dark cloud behind the one chapter that needs the opposite. It buys nothing there anyway — the room is a flat fill with no sky to quiet down.
- ⚠️ **`--world-dim` is pinned to 0 across the chapter** for the same reason. It's already 0 through both of the chapter's voids, so pinning it is continuous, not a jump.
- ⚠️ **The exit fade is not the entrance's inverse.** `leaveOp` **holds** the room at full strength until the thread has left the frame and only then drops it (`.world-layer.is-leaving`). Light copy sitting over a half-faded room is unreadable in a way a symmetric cross-fade never is.
- The question bubble's row opts out of the thread's centre-line reveal (`js/testimonials.js` still marks it, harmlessly): the clip tracks its live rect, and a row sliding 18px sideways under a shape measured every frame reads as the water missing its mark.

**`SCENES.deep`** is what's left after the water goes: no bodies at all (the jellies were the ocean's, and `warpFrameBodies()` shrinks and fades any body the incoming scene has no partner for, so the drift simply thins out), theme-tracking ink, because this is open field rather than a biosphere. ⚠️ `SCENES.chat` is an **alias getter for the same object**, not a copy — the chat room is opaque and its sky is never once visible, so sharing the object makes `grid.scene()` early-return on that swap instead of warping a field nobody can see to an identical one.

**Background jellyfish.** `SCENES.ocean` carries several `jelly` bodies at different depths. ⚠️ Order matters: `warpFrameBodies()` pairs biggest-to-biggest, so the **largest** one is what home's single moon travels into and cross-fades kind against — the moon *becomes* a jellyfish for free. The rest have no counterpart and take the leftover-incoming path (grow from 60%, fade up on warp progress), blooming into the water behind it. Make one of the small ones the biggest and the moon swims to the wrong corner.

⚠️ `--hero-drift` (heroParallax's depth offset) is **composed into the pan's transform in CSS**, not written as a transform on `#heroScene`. `#heroScene` is the clipping box (`inset: 0; overflow: clip; contain: strict`) — translating it slides its own bottom edge up the viewport and leaves a bare strip underneath. That never showed while the scene faded out on scroll and appeared the instant it stopped.

⚠️ One writer per element. The pan's transform is owned by anime during the intro and by the stylesheet afterwards (anime strips its inline styles at the end); nothing else may set it.

- **Chapters are an attribute, not a wrapper.** `data-world` goes directly on each `.home-section`; consecutive siblings sharing a value are one chapter. ⚠️ Don't wrap them — `.below-fold-inner` is a flex column with `gap: 56px`, so a wrapper would put that gap between *chapters* instead of between sections and re-space the whole feed.
- **`.world-void[data-from][data-to][data-passage]`** is the one genuinely new element: an empty, aria-hidden spacer between two chapters. It gets a real element because a measured rect beats arithmetic on the space between two others, and because the transition needs authored length — the sky's ~950ms warp has to finish before the next chapter arrives. The base height (195vh) is the **storm** passage's, which has the most beats to fit; the `--mid` / `--short` modifiers shorten the others.
- The director resolves two things per frame: the **sky**, swapped at the void's *midpoint* (deepest in the gap, least on screen to notice), and **`--world-dim`** on `<html>` — 0 while a void owns the reading line, ramping to 1 inside a chapter. `#worldDim` turns that into an opacity wash over the world layers (not `filter: brightness()`, which would force a filter layer on two full-screen noise compositions).
- ⚠️ **Loads between js/main.js and js/grid.js.** It needs main.js's `window.setSky`, and grid.js reads `body[data-sky]` once at init — so the world resolved on the first frame is the sky grid.js *builds*, with no wrong-world flash on a restored scroll position deep in the page.
- ⚠️ **Push sky changes through `setSky()`, never `window.grid.scene()`** — `setSky` writes the attribute first and only then calls grid, which is the whole handshake.
- ⚠️ `closeSectionPage()` calls `setSky(window.worlds.currentSky())`, **not `setSky(null)`**. Null resolves to `home`, which would snap a visitor returning from Writing back to the dust sky when they left from the ocean chapter.
- ⚠️ **Reduced motion does not switch the director off** — only grid.js's warp is skipped (it hard-cuts). A dormant director would leave reduced-motion visitors reading ocean content under a dust planet.
- Chapters are measured **live, never cached**: `#homeCaseStudies` and `#homeEnergyBoard` ship `hidden` and are unhidden by JS once their content loads.
- Tune live: `worlds.tune.line` (reading-line position), `.fade` (how far out the world starts brightening toward a void), `.depth` (dim ceiling).

**The feed is transparent (this is what makes worlds visible):**

`#belowFold` used to be an opaque `var(--bg)` curtain that covered the fixed hero. On home it's now `background: transparent`, because a world you can't see through the content isn't a place you're standing in — it's an interstitial. Legibility is paid for three ways instead: a **static per-section scrim** (a `::before` gradient pooling ~70% `--bg` under each section and feathering to nothing at its own edges, so the void gaps stay clear), **`--world-dim`**, and grid.js's **content-hole system** (`.home-section-title` is in `TEXT_HOLE_SELECTORS`). ⚠️ Never take the scrim to 100% `--bg` — that's the curtain again. It works because the feed is mostly `--surface-raised` cards, which carry themselves against a sky; only bare type needs help. `#sectionBelow` (Writing / Videos / Photos) keeps its curtain — those pages cover a compact hero, not a world.

**Per-scene ink (js/grid.js):**

A scene can declare `ink: '#rrggbb'` and every star, streak, bloom and ship is drawn in it — that's what lets a sky be somewhere other than space (pale stars on black vs. cyan marine snow). `gridDotRgb` stays the *theme* colour and the source of `--grid-mark-rgb` (js/clock-hero.js depends on it); `inkRgb` is the resolved per-frame value, set once at the top of `drawGrid`. ⚠️ **Omit `ink` to stay theme-tracking** — `SCENES.home` deliberately has none, so the system is a no-op until you leave home. ⚠️ Ink lerps on the warp's **eased `e`, not raw `p`**: every spatial property of a star travels on `e`, and only opacity cross-fades use `p`. On `p` the colour arrives ahead of the stars and reads as a tint sliding across a field that hasn't moved.

**Body kinds are a table (`BODY_KINDS` in js/grid.js):** `sun` / `moon` / `jelly`, each `{ draw, fade }` with one shared signature `(c, body, part, fade, ts, bob, shim)`. It replaced a two-branch if/else whose `else` fell through to `drawSun`, so an unknown kind rendered as a sun with undefined colours and threw inside `hexA`. ⚠️ The per-kind `fade` multiplier lives with its draw function — moving one without the other changes the look.

⚠️ **`SCENES.ocean` has exactly ONE body on purpose.** `warpFrameBodies()` pairs bodies biggest-to-biggest, so home's single moon matches it 1:1 and *travels across the screen while cross-fading kind into the jellyfish* on one shared position — the planet→jelly morph, for free, with no transition code. Add a second body and that clean pairing becomes a pair plus an orphan.

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

**Warping between skies (Career ↔ Writing ↔ Videos ↔ Photos):**

`window.grid.scene()` doesn't cut from one sky to the next — the field *flies* there (`WARP` in js/grid.js, ~950ms). Every star in the outgoing sky is matched to its nearest star in the incoming one (greedy nearest-neighbour over a coarse spatial hash, each source claimable once so a star never visibly splits) and travels to it, stretching into a **streak scaled to how far it moves that frame**. The trip is eased with smootherstep, so the streaks bloom out at the midpoint and retract on their own — the hyperspace look falls out of the easing rather than being a separate sequenced state.

- **Unmatched stars never pop.** The section skies are thinner and half as tall as home, so hundreds are always left over: they streak *outward past the viewer* from the warp focus and fade, while the incoming sky's extra stars stream in along the same axis. Both directions point away from the focus, so the mismatch reads as flying forward instead of a cross-fade.
- **Planets travel too.** Bodies are paired biggest-to-biggest and interpolate position, radius and colour, so home's twin suns *become* Videos' lamp pair. A pair that changes `kind` (moon ↔ sun) cross-fades the two renderings over one shared travelling position — that's what `parts` on a frame-body entry is for, and `wmax` shrinks the star-clearing disc of a body that's only partly there.
- Three pieces of state make this work: `makeCells()` / `makeBodies()` build a scene's field **without installing it**, so the outgoing bundle stays alive alongside the incoming one; `snapshotCells()` freezes the field as it currently looks — *including mid-warp*, so clicking a third tab while the second is still flying picks up from where the stars actually are; and `drawList` is what the draw loop iterates (`cells`, plus the outgoing sky's partnerless stars while a warp runs).
- The content hole (`cl.hidden`) **ramps** during a warp instead of switching, so a star that ends up under the incoming page's copy fades out over the jump rather than vanishing the instant the new hole rects are measured.
- A warp forces the loop off its 30fps ambient cap (`fullRate`) — at 30fps the streaks strobe instead of trailing. Reduced-motion skips the warp entirely and swaps instantly.

Tune it live from the console: `grid.warp.dur = 1400`, `grid.warp.streak`, or `grid.warp.enabled = false` to compare against a hard cut.

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

- Weather: Open-Meteo API (free, no key required) for Atlanta, GA
- Music metadata: YouTube oEmbed API
- Background image: `images/bg.jpg` (customizable via CSS variable `--bg-image`)
