# Luke van Zyl — lukevz.com

The third version of the site: one sheet of generated paper, set in a single
hand-drawn face, that opens into Writing, Photos, Career and Resources, with
Bookshelf, Gear, App stack and Places under the dog-eared corner. Static HTML,
CSS and three deferred scripts; no framework, no build step. `CLAUDE.md` is the
full description of how it works.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000 — static server + the api/ routes the site uses
```

Optional keys go in `.env.local` (gitignored): `GEMINI_API_KEY` for the chat
backend and the vault index, `MAPBOX_PUBLIC_TOKEN` and `GOOGLE_MY_MAPS_ID` for
Places. The site renders without them.

## Where things are

- `index.html`, `styles.css`, `intro.css`, `photos.css`, `more.css`, `career.css`
- `js/paper.js` (sections and routing), `js/photos.js`, `js/more.js`
- `content/` — writing, photos, the folio's JSON, and the second-brain vault
- `api/` — Vercel functions: content listing, Mapbox token, Places, chat
- `build/` — the dev server, the vault indexer (`npm run index`), the KB-gap
  check (`npm run gaps`), and one-off asset scripts (covers, collections,
  resource images)

## Deploy

Vercel project `lukevz`, served from the repo root with no build command.

## Earlier versions

Each is its own repo and Vercel project, archived but runnable:

- **v1** — the Lumos / Bear-notes garden: [`Lukevz/digital-garden-v1`](https://github.com/Lukevz/digital-garden-v1),
  https://v1.lukevz.com (`/v1` here redirects to it). Tag `v1-final` in this repo
  is the last commit that still had it under `v1/`.
- **v2** — the starfield / worlds site with the chat dock: [`Lukevz/digital-garden-v2`](https://github.com/Lukevz/digital-garden-v2),
  https://v2.lukevz.com. Tag `v2-final` (`8bda88c`) is its last commit here.
