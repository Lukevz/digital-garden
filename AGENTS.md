# AGENTS.md

See `CLAUDE.md` and `README.md` for full architecture and content-authoring details. This file holds operating notes for agents.

## Cursor Cloud specific instructions

This is a **static site served by a small Node dev server**: no framework, no build step, and no automated tests or lint configs (`package.json` defines `dev`, `index` and `gaps`).

### Running the site (dev)
- Start the dev server with `node build/dev.js` (a.k.a. `npm run dev`). It listens on `http://localhost:3000` by default (`HOST=127.0.0.1`, `PORT=3000`; both overridable via env vars).
- `/` serves `index.html`. Sections are hash routes (`#writing`, `#photos`, `#career`, `#resources`, `#bookshelf`, …) handled in the browser by `js/paper.js`.
- The dev server also runs the API routes the site uses (content listing, Mapbox token, Places, chat). They degrade gracefully when their keys are missing.
- On start it adds a `date:` frontmatter field to any `content/*/*.md` that lacks one, so a fresh checkout can produce small diffs there.

### Earlier versions
v1 and v2 are not in this repo any more: they are `Lukevz/digital-garden-v1` and `Lukevz/digital-garden-v2`, each its own Vercel project. Don't reconstruct either here.

### Optional API keys
Optional features need keys via env vars or gitignored files (`mapbox-config.js`, `gemini-config.js`). The dev server also loads `.env.local` (gitignored) if present. Relevant env vars include `GEMINI_API_KEY` (chat backend, `npm run index`), `MAPBOX_PUBLIC_TOKEN`, `GOOGLE_MY_MAPS_ID`, and Vercel KV vars. The site renders fully without any of these.
