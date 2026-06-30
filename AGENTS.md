# AGENTS.md

## Cursor Cloud specific instructions

This is a static personal portfolio / digital garden site. There is no build toolchain, linter, test suite, or CI pipeline.

### Services

| Service | Command | Notes |
|---|---|---|
| Dev server | `HOST=0.0.0.0 node build/dev.js` | Serves static files on port 3000, watches content folders, provides API proxies. Use `HOST=0.0.0.0` in Cloud VMs so the browser can reach it. |

### Key commands

- **Dev server:** `npm run dev` (or `HOST=0.0.0.0 node build/dev.js` in Cloud VMs)
- **Build manifests:** `npm run build` (generates `posts.js`, `sounds.js`, `labs.js`, `thought-trains.js`, `gallery.js`, `covers.js`, `flights.js`)
- **No lint/test/CI:** The project has no ESLint, Prettier, test framework, or CI configuration.

### Routes

- `http://localhost:3000` — V2 Flight Board (default homepage)
- `http://localhost:3000/v1/` — V1 Lumos Digital Garden (Bear-style notes app)

### Gotchas

- The dev server serves the root `_index.html` (not `index.html`) for the `/` route — this is intentional per the `vercel.json` rewrite configuration.
- Gallery thumbnail generation will warn on build if `sharp` is not installed — these warnings are non-critical; the gallery still works with original images.
- YouTube/Spotify/Books API features require optional config files (`v1/music-config.js`, `v1/books-config.js`) or environment variables (`YOUTUBE_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `GOOGLE_BOOKS_API_KEY`). The site works fully without them; only playlist expansion and book covers are affected.
- The guestbook uses in-memory storage in dev mode (no persistence between server restarts).
