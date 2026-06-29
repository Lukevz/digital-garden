# Luke van Zyl - Portfolio & Digital Garden

A dual-theme personal site featuring:
- **V2 (Default)**: Flight Board - A minimal Solari-style airport board showing active projects, completed work, and cancelled experiments
- **V1**: Lumos Notes - A Bear-style digital garden with notes, music, labs, and thought trains

## Quick Start

### Run locally

```bash
node build/dev.js
```

Then visit:
- `http://localhost:3000` - Flight Board (V2)
- `http://localhost:3000/v1` - Lumos Digital Garden (V1)

### Build for production

```bash
node build/build.js
```

## Content Management

### Flight Board (V2)
Edit `flights.md` to manage your projects:

```markdown
## IN FLIGHT
- [Project Name](url) | Gate | Description

## ARRIVED
- [Completed Work](url) | Gate | Description

## CANCELLED
- [Abandoned Project](url) | Gate | Description
```

### Digital Garden (V1)
- Notes/posts: `posts/*.md` → `posts.js`
- Thought trains: `thought-train/*.md` → `thought-trains.js`
- Labs: `labs/*.md` → `labs.js`
- Tasks: `goals.md` (or `2026 Goals.md` for year-specific)

## Structure

### V2 - Flight Board (Root)
- `index.html` - Homepage with flipboard UI
- `work.html` - Archive of all flights
- `about.html` - Bio and social links
- `flipboard.css` - Solari board styling
- `flipboard.js` - Flight rendering logic
- `flights.md` - Content source
- `flights.js` - Auto-generated manifest

### V1 - Digital Garden (/v1/)
- `v1/index.html` - Main app
- `styles.css` - App styling
- `js/app.js` - App logic
- `background.js` - Particle simulation
- `cursor-trail.js` - Custom cursor

### Shared
- `build/build.js` - Build all manifests
- `build/dev.js` - Dev server with file watching
- `js/build/manifest-builder.js` - Manifest generation functions
- `vercel.json` - Deployment configuration

## Background Grid Pattern

The page background is a 28px dot/square/slash lattice drawn on the `#dotGrid`
canvas (`js/grid.js`). The pattern is cleared behind the on-screen content so
text and icons stay clean.

**The hole is binary and grid-snapped** — every cell is either fully drawn or
fully hidden, never faded. A cell is hidden when its 28px square overlaps a
content atom (plus a small breathing pad); otherwise it draws at full strength.
Because whole cells switch off, the cleared region always has hard edges that
run exactly along grid lines, and no drawn mark can overlap the body.

### Tuning

- **Grid spacing** — `SP` in `js/grid.js` (default `28`). The whole lattice and
  the hole both quantize to this.
- **Clearing margin** — `HOLE_PAD` in `js/grid.js` (default `6`). px of breathing
  room added around each content atom before the grid resumes. Higher = larger
  clearing; the result stays grid-quantized either way.
- **What the hole clears around** — the selectors in `js/grid.js`:
  - `TEXT_HOLE_SELECTORS` — traced per rendered text line (via `Range`) so the
    hole follows the text silhouette, not a bounding box. Currently `.intro-text`.
  - `BOX_HOLE_SELECTORS` — cleared by bounding box. Currently `.avatar-col`,
    `.app-icon`, `.study-card`.
  - **Add any new on-grid content here** or it won't get a clearing.

### Drop shadows

Body-section elements that sit on the grid — `.avatar`, `.app-icon`
(base/hover/active), and `.study-card` (base/hover) in `styles.css` — are flat:
cast drop-shadows are removed, keeping only the inset glass hairline borders and
highlights that define each edge. The wider glass chrome (top bar, modals,
now-strip, music player) keeps its shadows.

## Theme Switcher

Both themes include a bottom-right switcher to toggle between V1 and V2.

## Deploy

Vercel configuration is included. Both themes deploy together:
- Build command: `node build/build.js`
- Output directory: `.` (root)
- Rewrites configured for clean URLs (`/work`, `/about`, `/v1`)
