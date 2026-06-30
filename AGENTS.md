# AGENTS.md

See `CLAUDE.md` and `README.md` for full architecture and content-authoring details. This file holds operating notes for agents.

## Cursor Cloud specific instructions

This is a **static site served by a small Node dev server** — there is no framework build step required for core functionality, and there are no automated tests or lint configs (`package.json` only defines `dev` and `build`).

### Running the site (dev)
- Start the dev server with `node build/dev.js` (a.k.a. `npm run dev`). It listens on `http://localhost:3000` by default (`HOST=127.0.0.1`, `PORT=3000`; both overridable via env vars).
- Routes: `/` serves the **V2 "Launchpad"** portfolio home (`_index.html`); `/v1` serves the **V1 "Galaxy" / Lumos digital garden** (`v1/index.html`). A bottom-right version switcher toggles between them in the browser.
- By default the dev server only builds and watches `flights.js`. To also rebuild + hot-watch all V1 content manifests (posts, thought-trains, labs, sounds, gallery, covers), start it with the `--v1` flag: `node build/dev.js --v1`.
- The dev server also provides API proxy endpoints (chat, YouTube, Spotify, books, mapbox/places, guestbook). These are optional and degrade gracefully when their keys are missing.

### Building manifests
- `node build/build.js` (`npm run build`) regenerates all manifest files. It **writes into tracked files** (`v1/posts.js`, `v1/labs.js`, `flights.js`, etc.) and tries to download book covers. On a fresh VM it commonly produces diffs (filesystem birthtimes differ) and prints non-fatal `Failed to generate thumbnail` warnings — those gallery thumbnails require an image toolchain that isn't critical. Treat the regenerated manifests as build artifacts and avoid committing them unless content actually changed.

### Optional API keys
Optional features need keys via gitignored config files (`music-config.js`, `books-config.js`, `mapbox-config.js`) or env vars. The dev server also loads `.env.local` (gitignored) if present. Relevant env vars include `GEMINI_API_KEY` (AI chat), `YOUTUBE_API_KEY`, `MAPBOX_PUBLIC_TOKEN`, `GOOGLE_MY_MAPS_ID`, and Vercel KV vars. The core site (both themes, notes, library, tasks, flight/launchpad board) renders fully without any of these.
