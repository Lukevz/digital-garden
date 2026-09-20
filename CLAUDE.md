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

`index.html` and `styles.css`, plus `intro.css` for the loading sequence. The
sections add `photos.css`, `js/paper.js` and `js/photos.js` — none of which the
landing page itself uses. No build step, no framework.

⚠️ **The landing page has one inline script, and it only picks a colour.** The two
`.js` files are deferred and do nothing until a section route is on the hash. The
inline `<head>` script in `index.html` picks the session's sheet colour (**The session
tint**, below). With scripting blocked, `/` renders as the plain grey it always did.
See **Sections** and **Photographs** below.

**Two surfaces, and the distinction is the whole design.** `<body>` is a flat,
untextured **frame** in a single solid colour (white in light mode, near-black in dark).
`.sheet` is the **paper**: `position: fixed`, `inset: var(--frame-w)`, rounded by
`--sheet-radius`, carrying the texture. The frame being the only untextured colour on
the page is what makes the grey field read as a sheet laid down on something rather
than as a page background.

**The session tint.** The landing page's sheet takes one of the seven colours off the
branding file (Figma, Personal branding, node 31:217: `#91c3d8 #d3aad0 #eb7d95 #f8c4ae
#94cecb #e0d6ab #aed8a6`, sampled from the blobs), picked at random per session. An
inline script in `<head>` picks it and holds it in `sessionStorage` (reload keeps it, a
new tab rolls again), writes `--sheet-tint` on `<html>` and adds `html.tinted`.

- ⚠️ **Inline, not in `paper.js`.** A deferred script runs after first paint, and the
  sheet would arrive grey and then change.
- `--tint-amt` (registered `@property <percentage>`, on `body`) is how much colour is in
  the paper: `--tint-max` (78% light, 24% dark) on the landing page, `0%` under
  `body.full`. **It must stay registered** or it flips instead of fading.
- ⚠️ **It rides `body.full`, not `body.reading`.** The paper drains to grey with the
  zoom, on `--zoom-dur`, rather than while the copy is still being rubbed out on it.
  `body.no-zoom` parks the transition, so a cold load on a section never shows colour.
- `.sheet` derives `--sheet-hi/mid/lo` from the `--paper-*` ramp and the tint; other
  surfaces keep using `--paper-*`, which is why every section is exactly the grey.
- The flap's `--curl-fold` / `--curl-tip` are mixes off `--sheet-mid` (white by
  `--curl-lift`, black by `--curl-sink`), so the folded corner is the sheet's colour.
- ⚠️ **This was built once and taken out** (it read as a tinted page background), and
  put back on request for the landing page only. Don't let it follow the reader into a
  section.
- Small type (`--ink-soft`) is ~3.3–3.9 : 1 on the tinted sheet (rose is worst), down
  from ~4.4 : 1 on the grey.

- `--frame-w` (20px) and `--sheet-radius` (36px) are the two dials, halved on the
  `max-width: 640px` breakpoint. The `inset` is written twice — the second uses
  `max(--frame-w, env(safe-area-inset-*))` so a notch can widen one side without the
  first declaration's uniform value being lost on browsers that don't support `env()`.
- `isolation: isolate` on `.sheet` is load-bearing: without it the grain's blend modes
  reach through to the frame and the "solid colour" stops being solid.
- **The frame is the landing page's, and only the landing page's.** `body.full`
  takes the inset to `0` and the corners to square, so a section zooms the paper
  up to the edges of the screen and gives the whole viewport to the reading. See
  **The zoom** under **Sections** for why that class is not `body.reading`.

**The paper texture is generated, not an image.** Two `feTurbulence` tiles as data
URIs — `.sheet::before` is fine speckle, `.sheet::after` is slow tonal mottle (640px)
— over a soft radial tone ramp. No asset to load, resolution-independent, and
re-tintable per theme, which a photographed paper scan is not.

**The register is a notebook, not a watercolour block.** The texture is something you
should only notice once it's gone: small, even, and everywhere. Depth comes from the
LIGHTING, not from marks on the stock — `.sheet`'s background is three washes over the
base ramp (one `--pool` up and to the right, two `--burn` corners at two different
sizes, none of them concentric with the sheet or each other), plus `--sheet-inner`, an
inset `box-shadow` giving the sheet its own thickness: a lit top edge and two unequal
pools of shade. Like `--curl-shadow` it is the **whole shadow value** in a variable,
because all its stops have to move together between themes.

⚠️ **Two things were built here and deliberately taken back out**, so they read as
options rather than oversights:

- **Torn-edged blooms** — an ellipse pushed through an `feDisplacementMap` and
  stretched over the sheet, which gave the page real depth and a feathered, dried-wash
  edge. They also read as *stains*: big soft shapes you look AT, on a page whose whole
  job is to be looked THROUGH.
- **Mid-scale detail** — a 320px "tooth" tile and a five-octave ridged blotch. Real
  stock has fibre at a pixel and tonal drift across inches with almost nothing in
  between; anything in the **4–16px band** stops reading as paper and starts reading
  as a badly compressed photograph of paper.

⚠️ **The grain is sized in DEVICE pixels** (`--grain-pitch`, 180px, dropping to 116px
under `min-resolution: 2dppx`). `feTurbulence` is generated in its tile's own user
space, so at a 180px pitch a grain is about a CSS pixel — which on a 2× display is a
two-device-pixel grain, and looks precisely like paper photographed at half
resolution. It is not a straight halving: at exactly half, every grain lands on one
device pixel and the field aliases into a shimmer.

⚠️ **Three things about that noise, each of which looked broken before it was fixed:**

1. **`feTurbulence` writes noise into the ALPHA channel too**, not just RGB, so half the
   speckle is erased by its own transparency and the grain comes out invisible. The
   `feColorMatrix` folds the red channel across RGB and pins alpha to 1 — opaque
   greyscale noise.
2. **It also emits *colour*.** Straight out of the filter the "paper" picks up faint
   yellow and olive blotches. Same `feColorMatrix` fixes it; a `type='saturate'`
   matrix alone does not, because it leaves the alpha noise in place.
3. **`fractalNoise` clusters tightly around 0.5**, so the untouched output is a smooth
   grey wash. The `feComponentTransfer` stretches it (`slope` 2.8 for the fine grain)
   — that stretch is the difference between visible paper stock and a flat fill.

Because the noise is centred on mid-grey and opaque, it rides `mix-blend-mode: overlay`
with **no net shift in the sheet's tone** — the palette and the texture are independent.
Multiply would darken the paper as a side effect of graining it.

⚠️ **The mottle wants to be almost invisible** (`--mottle-opacity: 0.12` light, `0.09`
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

The layer settles on rulers all round plus the two dimension notes; the
construction axes and the corner badges that were tried alongside them are gone
(the axes ran a hairline through the middle of the name). The whole layer is
`display: none` under 640px — the marks are margin furniture and a phone has no
margin.

## The intro (`intro.css`)

The draughtsman's marks are no longer decoration — they are the loading
sequence, and they do not survive it. The sheet arrives blank; the frame line
draws outward from a seam at the centre and closes down the two short sides;
the letterhead is printed under it; the graduations strike themselves
clockwise from the top-left; the copy settles; then every mark leaves. The
resting page is paper, copy and the dog-ear.

All CSS. The landing page has no script of its own, and `js/paper.js` never
touches `.spec`. Six timings at the top of the file drive everything —
`--t-frame`, `--t-mark`, `--t-tick`, `--t-name`, `--t-rest`, `--t-out` — and
every delay is derived from them, so moving one moves its whole phase.

**The copy arrives WITH the marks, not after them.** `--t-rest` is 1.05s: the bio,
the nav row and the dog-ear fade on (opacity only, no rise) while the frame line is
still drawing and the graduations are still striking. **One row at a time:** each of
the bio's three lines is a `.bio-line` span (`--i` = its row, 260ms apart), then the
nav row is the fourth. The spans are inline so the phone layout, which hides the
`<br>`s and lets the bio wrap, still works. Like the monogram, gated on
`:not(.intro-spent)` so a return from a section doesn't replay it. It used to wait for the sweep
to finish at 3.45s, which made the page a blank sheet with rulers for three seconds.

**The monogram is etched a letter at a time, and it is inline SVG now.** L, V, Z go on
in turn: the L (a soft shaded shape) under a soft-edged mask that sweeps down it, the
V and Z (straight strokes) drawn line by line via `pathLength="1"` + `stroke-dashoffset`,
staggered by each path's `--i`. ⚠️ It is inlined in `index.html` because an `<img>`'s
own animations can't be timed against the page's. (`images/lvz-monogram.svg` used to
be the masthead corner's mark and is now unused: the masthead shows this same element.)
⚠️ The etch rules are also gated on `:not(.intro-spent)`, which `enterReading()` sets
the first time a section opens, so the mark isn't etched in again halfway through the
flight home.

⚠️ **It is the home sheet's sequence, and only the home sheet's.** Every rule
in the file is scoped to `body:not(.no-intro)`, and `js/paper.js` sets that
class — synchronously, the moment the deferred script runs, which is before
the first mark is due at 250ms — when the URL it loaded on already names a
section. Landing straight on a piece, the marks would otherwise draw
themselves around an article that is already open and then wipe off again.
`no-intro` lands the page settled: the same page reduced motion gets, which
is why `.spec` is `display: none` in both cases.

⚠️ **The frame line draws in two phases, and it has to.** `spec-draw` opens
the horizontals from a centre seam; a clip with no vertical inset CANNOT draw
the two short sides — the moment its edge crosses them they appear at full
height at once. So phase one stops `--seam` (2px) short of the edges and
`spec-close` takes the four tips on down the sides to meet in the middle of
them, slower per pixel than phase one, closing the rect opposite the seam it
opened from. `spec-close` is a polygon, not an inset, because a bite out of
the middle of each side is not a rectangle; the two animations hand over at
identical geometry, and the last keyframe pulls the bite back out to the edge
so the resting shape is a plain rect rather than one with a zero-area sliver
retraced down each side.

⚠️ **It lives in its own file on purpose.** A second session is building the
reading spread in `styles.css` and `js/paper.js`. Keeping the intro out of
`styles.css` means the two can't overwrite each other; the only shared line is
the `<link>` in `index.html`.

⚠️ **Each side of the sweep is `linear`, and the ease-out is built from the
durations lengthening** as it goes round (480 → 570 → 690 → 840ms). Four
staggered ease-outs decelerate into every corner and read as four separate
strokes; one lengthening sequence reads as a single hand slowing down.

⚠️ **`.bio:not(.is-settling)` / `.links:not(.is-settling)` is load-bearing.**
These rules have to beat the `settle` in `styles.css`, which means matching its
specificity and winning on source order — and that would also beat
`.is-settling`, silently killing the return-home replay `js/paper.js` arms.
Excluding the class makes the rule stop matching the moment the replay is set
up, so the other rule applies cleanly. `.lockup` needs no such guard; the
replay is only ever put on the bio and the social row.

⚠️ **The typewriter is a stepped `clip-path`, not an animated width.** A
percentage width on an inline-block resolves against the containing block, not
the text, so it would sweep the whole column instead of the name.

⚠️ **The typewriter's hidden start state is a DECLARATION, and its fill is
`forwards`, never `both`.** A stepped animation is already at 1/n at progress
0, and engines disagree about whether the BEFORE phase clamps that back to 0:
Chrome does, WebKit shows the first step — so on a backwards fill the letter L
sits on screen for the whole delay before anything types. Declaring the start
state sidesteps the disagreement instead of betting on one engine.

⚠️ **The clip's vertical insets are negative** (`-0.3em`). The name's line box
is `line-height: 1`, which is shorter than the font's own ascent, so a plain
`inset(0 …)` shaves the tops off the caps.

⚠️ **The clip rides `.name-home`, not the `<h1>`.** `js/paper.js` FLIPs the
`<h1>` into the corner on a section open and measures its box to do it;
shrink-wrapping that box moves the target out from under the measurement. The
`:has()` fallback keeps the effect if the link is ever removed.

⚠️ **The phone timeline is collapsed.** `.spec` is `display: none` under 640px,
so the first three seconds would otherwise be a blank sheet with nothing
drawing on it.

**Reduced motion gets the settled page** — copy present, `.spec` hidden
outright. The marks are gone by the end of the sequence, so that is the honest
equivalent, not a static ruler nobody asked for.

## The dog-ear (`.curl`)

Hovering the right edge lifts the sheet's bottom-right corner, and the section
nav is underneath it. The page is the thing you pick up, not a surface a menu
slides over.

Two triangles sized to the same square at the corner, with the fold along its
diagonal:

```
  (0,0)────────(s,0)      .curl-flap = {(0,0) (s,0) (0,s)}  the folded corner
    │  flap  ╱   │        .curl-hole = {(0,s) (s,0) (s,s)}  what it stopped covering
    │      ╱     │        the fold   = the shared hypotenuse
  (0,s)────────(s,s)      the sheet's own corner is (s,s)
```

The corner that folds away is the lower-right triangle; reflected across the
fold it lands on the upper-left one, which is why the flap points back into the
page. The hole paints `--frame` — the same surface the sheet has been sitting on
all along — and the nav lives inside it, clipped, so it is genuinely revealed
rather than faded in over the top. Opening is a `width`/`height` transition on
the wrapper; both triangles are `inset: 0` and follow.

⚠️ **The wrapper cannot carry the clip.** A `clip-path` on `.curl` applies to its
children, so clipping it to the hole's triangle erases the flap, which occupies
the opposite half of the same box. Each triangle clips itself.

⚠️ **The flap needs its own tones** (`--curl-fold` / `--curl-tip`), not the
sheet's. Drawn in `--paper-*` the folded corner is the same value as the page it
is lying on, and the only thing reading as a fold is the drop shadow.

⚠️ **Those two are declared with the curl, below the theme block.** A media query
adds no specificity, so a `prefers-color-scheme` override written *above* them
never wins — it has to come after. `--curl-shadow` lives with them, and is the
**whole `filter` value**, not a colour: it is three `drop-shadow()` stops (a
tight contact edge for the sheet's thickness, a mid falloff, a wide dispersed
one for the air the lifted corner holds open), and all three alphas have to move
together between themes — plain CSS has no arithmetic on a colour's alpha.

⚠️ **The dark shadow can't just scale up to compensate.** Its widest layer
reaches up and left across the social row, and past roughly 0.2 alpha it stops
reading as depth and starts smothering the dimmest type on the page.

⚠️ **A small ear (`--curl-rest`) is always showing.** A pure hover-reveal with no
resting affordance is a corner nobody finds.

⚠️ **The fold is TALL, and `--curl-open` is its HEIGHT.** 1 : 2 (`--curl-open-w` is half),
not a square. A non-square fold's flap lands OFF the box, so `.curl-flap` is its own
bounding box (`inset: 0 0 0 -60%`) with the polygon and the gradient angle (297deg)
derived from the ratio; the derivation is at the rule, and changing the ratio changes
all three. The resting ear keeps the same 1 : 2 shape so it holds while the size
transition runs.

⚠️ **`.curl-zone` is small on purpose** — the ear plus a 16px halo. It used to be the
full height of the right edge and wider than the open fold, so the corner opened
whenever the pointer drifted near the right side. Once open the fold keeps itself open
via `.curl:hover`; the zone is only the approach. The old `body.reading .curl-zone`
cut-back is gone because the base zone is already small.

⚠️ **`:focus-within` is not a nicety.** The nav links are clipped out of sight at
rest but stay in the tab order, so tabbing to one has to be what opens the fold.
`@media (hover: none)` parks the corner open, since a touch device never fires
the hover.

**Under the fold are the SOCIAL ACCOUNTS, not the nav.** The two rows swapped: the
sections are what there is to reach for from the landing page, so they took the
centred row at the foot of the sheet, and the accounts — the kind of thing you go
looking for — moved into the corner as marks with no labels.

⚠️ **`.curl-links` is a COLUMN down the right edge, one mark per row.** It was a row
along the bottom while the fold was a square; now the fold is tall, the right edge has
the room and the marks are 24px. The hole's left edge at depth `y` is `w · y / h`, so
the TOPMOST mark is the one that can fall outside the paper:

```
--curl-open-w · (--curl-open − bottom − column height) / --curl-open  ≥  right + mark width
```

At the floor (160 × 320 fold, 24px marks, 16px gap): 59 against 42. Check the top mark
when retuning. ⚠️ The gap is a flat 16px, not a `vw` clamp: the triangle sizes off
`--curl-open`, and a viewport-sized gap stops agreeing with it at either end of its
clamp. Under 640px it is 120 × 240 with 20px marks and a 12px gap (40 against 34).
⚠️ The 120 × 240 phone size described here is superseded by the tap-to-open ear below.

**`#writing`, `#photos` and the four pages behind More are all live** (see
**Sections**, **Photographs** and **More**); the router sends anything it doesn't
recognise — `#more` included — back to the sheet. `More` is a toggle, not a link.

**Touch and narrow screens: the ear rests small and an "@" opens it.** Under 640px or
`hover: none` the corner used to be parked open (120 × 240), which covered the nav's
"More". It now rests as a 48 × 96 stub carrying an `@` (`.curl-toggle`, the face has the
glyph); tapping anywhere on `.curl` toggles `.is-open` (`js/paper.js`), which opens the
fold to 140 × 280 and shows the five accounts with the `@` as the bottom item of the
column, so tapping it again closes. Outside tap, Escape and any hash change also close it.
⚠️ The base `:hover` / `:focus-within` open rules still fire on touch (a tap leaves
`:hover` stuck), so that media block puts them back to the resting size and only
`.is-open` opens the fold. ⚠️ Closed links are `visibility: hidden` so they are out of the
tab order. The top-mark fit is 46 against 34 (see `.curl-links`).

**The dog-ear is the landing page's only.** In a section (`body.reading`) `.curl` /
`.curl-zone` are `visibility: hidden` and the accounts move to the RIGHT OF THE MASTHEAD
(`.mast-links`), copied in from `.curl-links` by `paper.js` so the list lives once (it
was a footer at the end of each scroller for a while; taken out on request). It fades
with the surface on the way home (`fadeOut([leaving, backLink, mastLinks])`). ⚠️ On a
phone the row is 16px marks with a 10px gap so it clears the centred monogram
(back 11–69 / monogram 172–221 / marks 257–377 at 393 wide). ⚠️ intro.css's finished
`intro-in` fill holds `.curl`'s opacity, so the corner disappears rather than fades.

**The index toggle is in the card, top-left** (`#expand`, inside `.page`, a Tabler
`layout-sidebar-left-collapse` / `-expand` pair swapped by `body.solo`), not in the
masthead. `.page-scroll` carries extra top padding on wide screens for its row; on narrow
screens the toggle is `display: none` and the padding goes back.

**Read next** (`#readNext`, `paintReadNext()` in `js/paper.js`): under a rule at the end
of each piece, the two posts that follow it in the index (older), wrapping round to the
newest so the last post still has somewhere to send you. Plain `#writing/<slug>` links,
filled once the piece has loaded and hidden while the next one is fetching.

## The marks (Tabler Icons)

Eight glyphs from **Tabler Icons** (MIT), inlined in `index.html` rather than loaded:
three in the navigation (`pencil`, `photo`, `dots`) and five brand marks under the fold
(`brand-linkedin`, `brand-x`, `brand-youtube`, `brand-instagram`, `brand-github`).

⚠️ **Tabler rather than Lucide, and the reason is specific.** Lucide has REMOVED its
brand icons — in the current release `github`, `linkedin`, `instagram`, `youtube` and
`twitter` all 404. Tabler still ships them, including a real `brand-x` rather than the
old bird, and draws on the same 24-grid stroke language, so one set covers the nav and
the accounts. Simple Icons was the other candidate and is out for the same class of
reason: it has dropped LinkedIn, and solid brand logos next to stroke UI glyphs are two
visual languages on one sheet.

⚠️ **Tabler draws at 2px on a 24 grid and this page is drawn in HAIRLINES.** Dropped
in at their own weight the icons are the boldest thing on the sheet by some distance.
`.ico` sets the weight ONCE, for both rows. And the stroke does not scale with the box:
`stroke-width` is in viewBox units, so a 24-unit mark rendered at 17px draws its 1.4 at
17/24 — about a pixel, which is the rest of the page. Resize the icon and the line
reweights with it, which is the intent.

⚠️ **Tabler's leading `<path stroke="none" d="M0 0h24v24H0z"/>` is dropped from all
eight.** It pads the bounding box in an icon FONT; inlined it is one invisible
rectangle per mark.

⚠️ **The erase had to learn about them.** `splitChars()` walks TEXT nodes and an
`<svg>` has none, so the nav's labels rubbed out on schedule and the glyphs beside them
stayed behind on a clean sheet. It now pushes every `.ico` in as a mark of its own.
They need no `.ch` wrapper — that class only exists to make an inline box
transformable, and an svg is replaced-inline already.

⚠️ **`.links` kept its class when its contents swapped.** `js/paper.js` rubs that
element out by name and `intro.css` settles it by name; it is a POSITION on the sheet,
not a description of what is standing in it, and renaming it drops the row out of both
silently.

## Sections (`js/paper.js`)

`#writing` doesn't navigate away from the sheet — it clears it. One script, no
dependencies, and none of it runs until a section route is on the hash.

⚠️ **There are now two SURFACES a section can open onto**, and paper.js is the only
file that knows the difference: `.spread` is writing's two-column reading layout and
`.plates` is photographs' single full-width scroller (**Photographs**, below).
Everything above them is shared — the erase, the masthead flight, the monogram, the
dog-ear — and none of it knows which section is coming up behind it. The registry is
five lines (`SURFACES` / `surfaceKey` / `surface()`); `showSurface`, `hideSurface`,
`measureAs` and `leaveReading` all act on whichever one is current, and `swapSurface()`
cross-fades when you go from one section straight into another without passing home.

**The zoom.** A section isn't a page the sheet navigates to — it is the same sheet,
opened, so the paper zooms up to the edges of the screen and the frame goes with it.
`body.full` (styles.css) takes `.sheet`'s inset to `0` and squares its corners; the
move is a plain `inset` / `border-radius` transition declared on `.sheet` itself, so
it carries both ways.

⚠️ **`full` is a different class from `reading`, and the split is load-bearing.**
Every flight here is a measured FLIP and `measureAs()` reads its target by applying
`reading` for the length of one task. Fold the geometry into that class and the name
and the monogram are measured against the sheet they will only occupy once the zoom
is over — a frame-width away from where they actually have to land, which is a 20px
pop at the handover. `setFull()` is called in the SAME task as the `reading` toggle,
at the end of the flight, so the whole choreography is measured and flown in one
geometry and the zoom is the beat behind it.

⚠️ **On the way home the un-zoom runs at the end too**, under the copy settling back
on. It can, because the lockup is centred in a grid row whose own centre doesn't move
as the sheet shrinks — the name lands and then sits still. The letterhead and the
social row DO ride the edges in, from exactly where they were measured, so nothing
pops there either.

⚠️ **A cold load straight onto a section gets `full` synchronously**, next to
`no-intro`, not from `setFull()` when the section finally opens: `route()` only
reaches `enterReading()` after the index fetch resolves, so the framed sheet would sit
on screen for the length of that request and then snap. `setFull(on, true)` parks
`body.no-zoom` around the toggle for the same reason — there was no framed sheet on
screen to zoom out of. If the section turns out not to be openable (`#photos` with
js/photos.js missing), `leaveReading()`'s early return takes the geometry back.

⚠️ **No safe-area `env()` on the full-bleed inset**, unlike the framed one. Full bleed
is full bleed; what keeps copy off a notch is the sheet's own padding, and giving that
padding an `env()` floor would break photos.css's full-bleed cover, which negates
`--sheet-pad` exactly.

**The erase.** The hero copy is RUBBED OUT. A rubber tip travels along each line of
type, left to right and then down to the next, and the letters it passes lift off:
pale, blurred, tipped a couple of degrees off the baseline, gone. Letters and tip are
driven off one polyline — a segment per line of text — so a letter goes exactly when
the tip reaches it rather than on a timer that merely looks synchronised.

⚠️ **The first version swept a soft-edged band down the whole sheet, and it read as a
scanner.** A full-bleed horizontal edge is a machine's gesture, and most of its travel
crossed blank paper that had nothing on it to remove. Keeping the erasure **on the
ink** — scoped to the lines of type — is the entire difference. Don't reintroduce a
sheet-wide sweep.

The `.rubber` tip has no `mix-blend-mode`: it has to lighten paper *and* lift dark ink
in light mode and do the reverse on a dark sheet, and one blend mode only goes one
way. It composites normally and the colour is themed, same pattern as `--curl-shadow`.

**The masthead: back link left, monogram centred.** In a section the row is `[‹ BACK]
… LVZ … [expand]`. The monogram does NOT go to a corner: the home letterhead, the
same element, shrinks to `--mark-h` (1.15 × `--mast-size`) and stays centred, and the
word "Back" behind a Tabler `chevron-left` (`#back`, `.back`) is the way home. The
back link shares `.links a`'s rules — same face, tracking, ink, icon weight, underline
hover. ⚠️ It says only "Back" and names no page: every section carries its own, bolder
title just under the rule, and a second copy of it in the corner was noise.
It fades in with `body.reading` (`back-in`) and out with the surface on the way home
(`fadeOut([leaving, backLink])`, so it doesn't blink off at the end of the flight).

⚠️ **The name is vestigial in a section.** `.lockup` is `position: absolute;
visibility: hidden` there, and `flyName()` still flies the invisible word: it is now only
the timing device `enterReading()`/`leaveReading()` wait on alongside the monogram. It
is NOT `display: none` because `measureAs()` still reads its rect and a zero width gives
an Infinity scale. The word is still measured, so `.name` keeps its 0.1em tracking.

**The monogram flies between two real layouts.** `flyLetterhead(from, to)` is a
measured FLIP whose `from` and `to` are the letterhead's OWN rect, read with and without
`body.reading` (`measureAs()` applies the class for one task, two forced layouts,
nothing painted). It is symmetrical, so it needs no direction flag; the class lands as
the flight ends and the animation is cancelled in the same task. There is no corner
pseudo-element, `markRect()` or `is-homing` any more.

⚠️ **`transform-origin: 0 0`, with the resting `translateX(-50%)` kept at the head of
the transform list.** The mark is centred by that translate, so the rect it is
measured at already includes it; scaling about the element's own top-left then makes
the extra translate exactly the distance it travels. Drop the -50% and it jumps half
its own width before it moves.

⚠️ **In a section the letterhead is positioned off the sheet's padding box, like at
home** (`top: calc(var(--sheet-pad) + (var(--bar-h) - var(--mark-h)) / 2)`, `left: 50%`).
`grid-area: 1 / 1` was tried and does not work: Chrome resolves the `left: 50%` of an
absolutely positioned grid item against a different box than it measures the offset from,
and the mark landed a padding-width right of centre. The row is `min-height: var(--bar-h)`
(30px, the expand control) with `align-items: center`, so all three items share a centre
line. The landscape-phone override now sets `--sheet-pad`, not `padding`, so this and
photos.css's full-bleed cover follow it.

⚠️ **The 20px the mark drops or rises during a flight is the zoom**, not an error: both
ends are measured in the geometry the flight runs in and the sheet then moves to/from
full bleed. Horizontally it lands exactly.

⚠️ **`.name`'s easing is not the curl's.** That curve is ~80% done in its first
quarter, which is right for a corner springing open and wrong for something crossing
the page; the flights use `EASE`.

**The spread.** Index of titles left, the open piece right, each scrolling its own
column. ⚠️ **Under 640px it is two full-width PANES instead** (`.spread.is-post` is which
is showing, set from the route by `setPostOpen()` in `js/paper.js`): bare `#writing` is
the list of titles, `#writing/<slug>` slides the piece over it from the right, and Back
steps out one level (piece → list → home; Escape does the same). The expand control is
hidden there. On a wide sheet bare `#writing` still opens the newest piece; widening past
the breakpoint from the bare list opens one via the `matchMedia` listener. `body.solo` collapses the index to a zero-width track (transitioned, not
hidden) so the piece is the only thing on the sheet; the preference persists.

⚠️ **Two scroll containers, which the landing page's "no scroll container anywhere"
rule forbids.** The rule exists so a stray overflow can't scroll the SHEET. These
scroll their own column and the sheet still can't move; `html, body { overflow:
hidden }` is untouched.

⚠️ **The reading measure is capped on `.page-scroll`, not on the header and the prose
separately.** They're set at different sizes, so a cap on each gave them two different
widths and, once centred, two different left edges. It's also a px clamp, not `ch` —
`ch` resolves against the element's own font, and capping the scroller in `ch` came
out around 115 characters to the line.

**Section pages run tighter than the landing page.** `body.reading .sheet` overrides
`--sheet-pad` to `clamp(16px, 2.6vw, 32px)` (home is `clamp(28px, 5vw, 64px)`) and gives
the foot only 0.6 of it, so the content runs further down the screen; the masthead's gaps
are tighter too. It is the VARIABLE that changes, so the monogram and photos.css's
full-bleed cover follow it, and it lands in the same task the flights measure in. There is
no vertical rule between the index and the card any more — the gutter alone separates
them.

**The piece sits on a white card** (`.page`: `--frame`, 20px corners) that fills the whole
right-hand column, and `.page-scroll` is now the card's full width so the wheel works
anywhere on it. ⚠️ The measure therefore comes from PADDING —
`padding-inline: max(gutter, (100% - --measure) / 2)` — not a `max-width` on the scroller;
header and prose are still one box with one left edge. The open title in the index is a
filled chip (`.is-current`, 9% ink) with the old leader line removed, and the rules on
either side of it are dropped so no hairline runs through the fill.

**The fades** (styles.css "The fades under overflowing content", toggled by `updateFade()`
in `js/paper.js`): a soft wash plus a feathered `backdrop-filter` blur over the bottom of
a scroller while it has more below, gone at the end. There is one PER SCROLLER, each fading
to what is behind it: the piece (`.page.is-fade`, `::after`) fades to **white** (`--frame`),
the index (`.spread.is-fade-index`, `::before`, `--index-w` wide) to the **paper**
(`--sheet-mid`, at a lighter 40% because the sheet is a lit gradient and a flat tone shows
as a band; ⚠️ the index's is blur only, and its titles are MASKED to transparent instead, which
lands on the real background exactly). ⚠️ **Only the writing spread has fades.** Photos and the
More pages (bookshelf, gear, app stack, places, career) are standalone and have none — they
were built and removed on request; don't add them back.
⚠️ **The piece's fade is a glass pane** (`.page::after`, 110–170px tall): the text behind is
blurred and over-saturated so it ghosts through, refracted by the `#glass` SVG filter
(inline in index.html; `backdrop-filter: url()` is Chromium-only, so it sits behind
`@supports` and other browsers keep blur + sheen), with three bands of light that
`paper.js` slides along with the scroll (`--glass-pos` on `.page`), and a bright hairline +
inner glow on the bottom edge. Each white band is paired with a cool grey one
(`--glass-lo`) because white on the white card is invisible; dark mode swaps both.
⚠️ The index's is masked on BOTH axes (vertical fades at both ends, plus a horizontal
feather) — a blurred rectangle on a grained sheet shows its edges otherwise. ⚠️ On a narrow sheet only
the pane that is showing counts. ⚠️ Throttled with `setTimeout`, not rAF: a hidden tab never
fires rAF, which wedged the "already queued" flag while testing.

**The prose** is the one place on the site set in sentence case. The face has real
lowercase (distinct glyphs, not a caps clone). `<strong>` can't get heavier — one
weight, and `font-synthesis: none` — so emphasis is a pencil wash (`--wash`). `<em>`
takes `font-synthesis: style` back: a sloped monoline still reads as the same face,
whereas a faked bold thickens into mud. **Headings are the exception, and they get
weight from a stroke, not a font-weight:** `-webkit-text-stroke: 0.035em currentColor`
(`--heading-stroke`, on `.page-title` and `.prose h2-h4`) thickens a monoline evenly
where synthesised bold smears. It is in `em`, so it scales with each heading.
Body copy is `clamp(0.95rem, 1.2vw, 1.1rem)`.

⚠️ **The prose is transliterated on render** (`fold()`). The face has no em dash, en
dash, ellipsis or straight double quote, and **every post in `content/writing/` uses
at least one**. An unmapped glyph doesn't fail loudly — it falls through to
`ui-sans-serif` and sets one character of the sentence in a different typeface. The
markdown stays correct; only what's rendered is folded down. Straight double quotes
become real curly ones, since those the face does have.

⚠️ **A YouTube link alone on its line renders as an embedded player.** Posts open with the
video they were made from, written as a plain markdown link (`[Title](https://youtu.be/ID)`);
`youtubeEmbed()` in `mdToHTML` turns a link that is the WHOLE line (markdown or bare URL,
`youtu.be` or `youtube.com/watch`, a `t=` start time honoured) into a 16:9
`youtube-nocookie.com` iframe (`.prose .video`), and leaves the same link mid-sentence as a
link. It is not an `<iframe>` typed into the markdown because `fold()` curls every straight
`"`, which would break the attributes.

⚠️ **`filenameToSlug()` is the v2 site's, character for character.** The second-brain
vault hard-codes these routes in prose (`mocs/Site MOC.md`) and the chat hands them to
visitors verbatim, so a tidier slug would silently 404 every link the bot has given
out. It does not collapse runs: "7 habits  routines" has a double space and so a
double hyphen.

**Tuning it live**, the way the v2 warp worked: `paper.dur = 2600` to watch the rubber
in slow motion, `paper.flyDelay` to re-time the name's exit, `paper.enabled = false`
to compare against a hard cut. The zoom follows `paper.dur` (×0.67, written to
`--zoom-dur` at each toggle) rather than carrying a duration of its own, so slowing
the rubber down slows the paper down with it.

## More (`js/more.js`, `more.css`)

The third nav item is a toggle. Opening it drops a second row of links UNDER the
first — the way the macOS menu bar's hidden icons drop into a bar of their own
(Bartender) — holding **Bookshelf, Gear, App stack, Places**. The pages are the v2
site's More menu, moved onto the sheet and kept plain: a title and a ruled list.

⚠️ **The toggle is a `<button>` and is delegated off `.links`.** The erase
(`rubOut()`) snapshots `.links`' innerHTML and `restore()` puts it back, replacing
every node in it, so a listener on the button itself would be attached to a node
that no longer exists. State lives in a class on `.links` (`.is-more`), which
survives; `aria-expanded` and `inert` live in the innerHTML, which does not — hence
`moreSection.reset()`, called from `enterReading()` on BOTH its paths (after the
restore on the animated one, and directly on the instant one).

⚠️ **The row is `position: absolute` inside `.links`**, hanging into the sheet's
bottom padding, so opening it moves nothing — the name is centred in the grid's
other row and would otherwise slide up every time the menu was touched. Where the
padding is too shallow (`--sheet-pad` bottoms out at 28px) more.js writes the row's
height into `--more-h` and `.links` rides up by the shortfall. That uses `translate`,
NOT `transform`: `.links` carries the entrance's `settle` animation with fill-mode
`both`, and an animated `transform` beats a declared one for as long as the fill
holds.

⚠️ **Closed means `inert`, and `splitChars()` skips `[inert]`.** The closed row is
laid out (visibility, not display) so it can be measured; without the skip the
erase would put a line of type under the nav for the rubber to travel along.

**One surface, four routes.** `#bookshelf`, `#gear`, `#appstack`, `#places` all open
`.folio`; `SURFACES` maps each key to it, and `surfaceKey` is the ROUTE so the router
knows which page to paint. Moving between two of them never runs `showSurface()`, so
`paint()` cross-fades the content itself.

⚠️ **The folio is capped at `--folio-measure` (960px, on `.folio`), centred** — via
`padding-inline` on `.folio-scroll`, not a `max-width`, so the wheel works across the whole
sheet. Title, list and rule still share one left and one right edge (it once had a
`max-width` on the body alone and the header ran past it on both sides). Below 960px it is
the masthead's width again. Writing (reading measure) and photos (their own
inset) are deliberately NOT matched to the header. `js/more.js` loads BEFORE `js/paper.js` for the same reason
`js/photos.js` does.

**The bookshelf is grouped by the year each book was read**, newest year first and newest
read first inside a year, each year a band that alternates between plain paper and a faint
wash of `--ink` (`.year:nth-child(odd)`; `color-mix` on `--ink`, so one declaration serves
both themes). Books with no usable date are filed last under **"< [oldest year we can
date]"**, currently `< 2018`. ⚠️ The `<` is the site's chevron icon, not a character: the
face has no `<` glyph and the fallback font's would be the one wrong mark on the page.

⚠️ **The dates are `read` in `content/more/bookshelf.json`, stamped by
`build/read-dates.mjs`** from the public Goodreads RSS feed (`list_rss/<user id>`; no login
or key — the normal `review/list` page is behind a sign-in wall). `readSource` says where
each came from: `"read"` is Goodreads' own date read, `"added"` is the day it was added
(an estimate, used only when there is no date read), `null` is undated. Several Goodreads
read dates sit on the 1st of a month, which is month precision — the shelf only uses the
year. A day with five or more additions is a bulk import, not a reading day, and is never
used as a fallback (2023-06-19 is one; it is why Six of Crows and Crooked Kingdom are
undated). Matching is against the `read` shelf only, so an unread copy (to-read, DNF)
cannot lend its date. The script also ADDS any book on the Goodreads read shelf that the
site lacks (15 so far: `source: "goodreads"`, carrying `isbn` / `image` instead of an
Amazon link), then `build/make-covers.mjs` fetches their covers. Re-run both after
finishing a book.

**The bookshelf is covers only** — no titles, blurbs or ratings on the page (they stay in
the JSON), eight to a row on a wide sheet, six under 1100px, four under 760px. Bottom-
aligned and never cropped to one shape (a few covers are square); each `<img>` carries
its own `aspect-ratio` so the shelf doesn't jump as they land. The covers are not
clickable: several of the Amazon links in the v2 data point at the wrong book.

⚠️ **Covers come from `build/make-covers.mjs`** (`npm install --no-save sharp` first;
files land in `content/more/covers/`, 320px WebP). Amazon's image host by ISBN comes
first, because the ISBN is the ASIN in the row's link and so the edition Luke picked.
**Open Library by ISBN is NOT to be trusted** — it returned the wrong book for several
Percy Jackson titles. Even Amazon is wrong where the v2 data is: the "Iron Flame" and
"Fourth Wing" ASINs are each other's, and the Last Olympian / Battle of the Labyrinth
ones are shuffled. Those are pinned in the script (`PINNED`, `ISBN_FIX`) and were
chosen by looking at them; check the contact sheet by eye after any re-run.

**Data is static JSON** in `content/more/` (`bookshelf`, `gear`, `appstack`),
extracted from the arrays in the v2 `js/main.js` (`git show 8bda88c:js/main.js`).
The local product images (`images/gear-*`, `images/app-stack-*`) were restored from
the same commit; the rest still hotlink the vendor, as v2 did, and hide themselves
on error.

⚠️ **Gear shots sit on a light tile** (`.entry-mark--gear`). They are a mixed set —
white-background photos, cut-out PNGs, a few on black — and set straight on grey
paper they are a scatter of bright rectangles and holes. `mix-blend-mode: multiply`
was tried and blacks out the transparent ones.

⚠️ **Places is the v2 Mapbox map, on the paper.** Land fill is taken off so the
sheet is the land, roads are hidden, the sea is a wash. Mapbox loads on the FIRST
visit to the page (~700KB). The token comes from `/api/mapbox-token`
(`MAPBOX_PUBLIC_TOKEN` on Vercel), else the gitignored local `mapbox-config.js`;
pins from `/api/places` (`GOOGLE_MY_MAPS_ID`). No token → a one-line note, not a
blank plate. The map is `remove()`d in `leave()` to free the WebGL context.

⚠️ **The tab must be VISIBLE to test the transitions.** In a background tab
animations freeze and every `finished` promise hangs, so a route appears to stall
half-way. `paper.enabled = false` tests the routing logic on its own.

## Career (`career.css`, `content/career.json`)

`#career` is a fifth route onto the folio (the surface behind More), painted by
`renderCareer()` in `js/more.js`: a vertical timeline of roles down a hairline
rail (period in the margin, a dot per role, the current one filled), then the
**A -> X principles** — a struck "UX" over a display "A -> X", the headline
"Design from the Ask to the Experience", and six traits (Adaptability, Boldness,
Inclusivity, Articulation, Curiosity, Resilience). Both are taken from the v2
site: the timeline from `git show 8bda88c:_index.html` (`#homeTimeline`) and
`js/timeline.js`, the principles from `#homePrinciples`. The horizontal
scroll-jacked rail and the company logos did NOT come across — a pinned
horizontal sweep has no place on a surface that is already a column you fall
down, and colour logos are the one thing on a hairline sheet that isn't.

**Career is live in the nav** (`<a href="#career">` between Photos and More). It was a
"Soon" span for a while; the `.links .soon` rules are gone from `career.css` and `styles.css`.

**The resume button** sits inline with the title, far right (`head()` in `js/more.js`
takes an optional `action`; `.folio-head--action` is the two-column grid). Its URL is
`resume.url` in `content/career.json` — the v2 site's Google Drive download link
(`git show 8bda88c:js/main.js`, `renderResumeEmbed`), so the file is whatever is in that
Drive file today. Swap it for a committed PDF if you'd rather it be self-hosted.
The timeline is newest first, and the order is the order of `timeline` in that file.

⚠️ **The face has no `%` or `~`** (it does have `+ ( ) * ; # $ =`). The copy in
`content/career.json` says "percent" and "about"; check that when editing, or a
character is set in the fallback font. Dashes are fine — `fold()` handles them.

⚠️ **Instinct is two entries**: Head of Product Design (Aug 2026 - Present, `now`; four Senior
Product Designers, design strategy, the internal design system) above Senior Product Designer
(Dec 2025 - Aug 2026). `content/career.md` carries the same two. The landing bio already says
Head of Design.

## Photographs (`js/photos.js`, `photos.css`)

The second section, and much the larger of the two. It registers itself as
`window.photoSection` and paper.js hands it the tail of the hash once the name is in
the corner; everything before that moment is shared machinery.

⚠️ **`js/photos.js` has to be loaded BEFORE `js/paper.js`.** Both are deferred, so
they run in document order, and paper.js reads `window.photoSection` on its very first
`route()` — which runs at the end of its own script. Swap the two `<script>` tags and
landing straight on a `#photos` URL silently falls back to the sheet.

Routes: `#photos` (the index), `#photos/<slug>` (a collection), `#photos/<slug>/<day>`
(one day open, deep-linkable) and `#photos/<slug>/play`.

⚠️ **The collection is painted once and the day is opened OVER it.** `paint()` diffs
what changed since the last call rather than re-rendering, or the cover, the lede and
all twelve stamps would restart every time a day is opened or closed.

### Where the content lives

Two static manifests under `content/photos/collections/`, both **generated from the
files themselves** rather than hand-written:

- `index.json` — the sets on the landing page, plus the loose frames under them.
- `italy-2026.json` — the written collection: twelve days, each with its stamp, its
  copy, its keepsakes and its frames.

⚠️ **EXIF is baked into the manifests at build time**, not read per request. It is why
the scan panel needs no API and no change to `api/content/list.js` (or to its duplicate
in `build/dev.js`). The numbers beside a photograph are that photograph's own.

⚠️ **The manifests are invisible to the photos listing API on purpose.** It filters
`content/photos/` on image extensions and does not recurse, so `collections/` and
everything under it is skipped — the grid never picks up a stamp or a cover.

⚠️ **Most day frames are STAND-INS** — real photographs out of `content/photos/`, dealt
out per day, each flagged `"standin": true` and rendered with a faint hatch
(`.frame--standin`). Only `frames[0]` of each day is the real Italy frame. Drop the
real files in, rebuild the manifest and the flag goes with them. An unmarked stand-in
is just a wrong caption.

⚠️ **There are no unwritten sets any more — those frames are all loose.** The date
clusters (`24 May - 3 Jun 2026` and the rest) were folders with a provisional date
title and no copy. They are gone from `index.json`'s `collections`, and every frame
they held is in `loose` (sorted newest first with the frames that were already there),
so the index is Italy plus one masonry of loose frames. The plain-set route
(`paintPlainSet` in js/photos.js) is now unreachable but left in place; a set only
comes back if an unwritten one is added to `collections` again. Anything that
regenerates the manifest has to keep it that way.

⚠️ **The featured set on the index is a 40/60 lockup on a white card** — type left
with 32px of padding, cover right with none, so the photograph runs flush to the
card's top, right and bottom edges; the type is vertically centred against it
(`.pset--feature`, a two-column grid with named areas since the markup is
cover-then-meta), with 20px corners that also clip the flush photograph. "White" is `--frame`, so it is near-black in dark mode rather than
a literal #fff outshining the photograph. The card stays inside the page's column,
carries no drop shadow, and the focus ring goes round the card. The title is coloured
from the cover: `accent` in the collection's manifest entry (a saturation-weighted mean
of the cover's non-white, non-black pixels — `#735d43` for Italy), lightened in dark
mode. Recompute it if the cover changes. Under 640px it
stacks, cover first, as it always did.

⚠️ **The loose frames sit on a white card of their own** (`.ploose`: `--frame`, 20px
corners, 32px padding — the featured set's card again) with 6px-rounded photographs,
and the "Loose frames" title is gone. The rounding is scoped to `.ploose`; frames in
a collection's own gallery are still square.

⚠️ **Photographs carry no shadow, and the loose frames no hairline either.** `--plate-shadow` is a transparent no-op (kept as a
variable so the hairline rules that share it needn't change), and the scan stage's
`--stamp-shadow-lift` is gone. The **stamps** keep theirs — they are the perforated
objects, not photographs. Don't add a shadow back to a plate to make it read.

⚠️ **Italy 2026 is `"soon": true` in `index.json` while it is WIP.** `setHTML()` renders a `soon`
set as a `<div aria-disabled>` (no `href`) with a "Coming soon" badge over the photograph (`.pset-badge`) and a slightly muted cover
(`.pset--soon`), and `paint()` sends a deep link to `#photos/<slug>` back to the index. Delete the
one line to open it again; nothing else about the collection was touched.

### The trips without stamps (Montana 2024, Disney 2024, British Columbia 2025)

Three more written collections sit beside Italy on the index, as cards under the
featured one, **newest trip first** (`start` in each `index.json` entry is the sort
key; Italy is `feature`, so it is pulled out above the row regardless). None has
engravings, so `paintCollection()` hands them to `paintDays()` (js/photos.js): the
cover, then one white `.ploose` card per day — a header line, then that day's frames in
the masonry — with no stamps, riffle, scan, day view or play button. The route
`#photos/<slug>/<day>` just scrolls to that day's card. Give a day a `stamp` and the
collection takes the stamp path with no other change.

⚠️ **They are built by `build/make-collection.mjs` from a spec in `build/collections/`**
(`npm install --no-save sharp` first, then `node build/make-collection.mjs
build/collections/<slug>.json`). The spec lists the kept frames by filename; days are
grouped by each frame's own EXIF date (a day can span several via `dates`), frames run
in the order taken, `accent` is computed from the cover, and the index entry is
upserted and re-sorted. It wipes and rewrites the collection's folder each run, so
dropping a frame from the spec removes it. Baseline JPEGs, 1800px / 760px / 2000px+1000px
cover, as above.

⚠️ **No copy was invented.** Day titles are empty, there is no lede, captions are only
what a sign in the frame says, and `place` is either a sign (Gibsons, Molly's Reach) or a
park identified from landmarks. Days are only the dates that have photographs (Montana
has nothing on Oct 6, Disney nothing on Dec 4). Fill titles / `lede` / `alts` in the spec
and re-run.

### The stamps

Twelve engravings, one per day, drawn from Luke's own photographs (the source art is in
Drive under `Photos/Italy/Stamps`, as `Day N.png` beside `Day N_real.jpg`).

⚠️ **The captions were CROPPED OFF the artwork and are re-set in the page's own face.**
The source images are a picture on a cream field with a typewriter caption beneath;
only the picture is kept, cropped inside its stippled border, so every stamp can share
one card, one aspect ratio and one themeable caption. The crop is two detections — the
artwork (anchored on its densest band and grown out to the paper, because min-to-max
swallows the caption and a longest-run truncates at a pale sky band), then a step
inside the stipple.

⚠️ **The perforation is drawn in CSS**, not baked into the artwork: four
`radial-gradient` masks, one per edge, intersected. Every layer has to be FULL SIZE in
its cross axis — a layer sized `pitch 51%` covers half the card and under `intersect`
the half it does not cover is unpainted, which is to say the bottom of the stamp
disappears. Where `mask-composite` is unsupported the card degrades to a plain
rectangle, which is a stamp with no teeth rather than a broken one.

⚠️ **The tilt comes from the data**, not from `Math.random()` at render. A random rake
re-rolls on every paint, so a stamp moves when you come back to the page.

⚠️ **The stamps are not lazy.** There are twelve and they ARE the page; one that has
not arrived is a blank cream card with a caption under it, which reads as a missing
image rather than as one on its way.

**The route.** ONE line through all twelve, not a strand per row: along a row, out
right, back across underneath, up into the start of the next — a Z. ⚠️ It is
**measured off the laid-out stamps** by `drawRoute()` and redrawn on resize, rather
than drawn into a stretched viewBox: the grid is fluid and the row turns are the only
real curves in it, so `preserveAspectRatio="none"` would flatten precisely the parts
that matter. ⚠️ `drawRoute` is **guarded against its own ResizeObserver** — it writes
to the DOM from an observer, which is the shape of a loop; it bails unless the box
actually changed size.

**The riffle.** Hovering a stamp flicks through the frames it stands for, each wiped
on from the left over the engraving rather than cross-faded. The images are built on
first hover — twelve stamps times five frames is sixty photographs nobody has asked
for yet. The first one shown is `frames[0]`, the photograph the engraving was drawn
from.

### The scan

Clicking a stamp gathers the other eleven toward the middle, flies the one you picked
into the centre of the sheet, and repaints the engraving into the photograph it came
from — brushed on, with a lamp riding the edge, sparkle along it, and that frame's
real EXIF printing in beside it.

⚠️ **The ENGRAVING is masked away; the photograph is not masked in.** Built the other
way round first and it did not paint: with the photograph masked on top of an opaque
engraving it stayed invisible even after the sweep ended and its own `mask-image`
computed to `none` — loaded, on top, hit-testable, and not drawn until the layer
underneath was removed. Taking the engraving off instead leaves an ordinary opaque
photograph at the bottom of the stack and a resting state with no mask on it at all.
It is also the truer gesture: the brush is taking the drawing off the photograph that
was always underneath, not laying a photograph over a drawing.

⚠️ **The brushed edge is a DISPLACED GRADIENT**, not a straight wipe — an alpha ramp
pushed through `feTurbulence` + `feDisplacementMap`, low frequency across and high
down, so the ramp's iso-lines break into bristles. A plain `linear-gradient` mask reads
as a photocopier. The mask is 300% wide and TRAVELS (`mask-position`); animating the
gradient's stops instead re-rasterises the mask every frame.

⚠️ **The mask's plateaus are sized around the displacement.** The element sees one
third of the mask at a time and the filter pushes the edge up to 6.5% of the mask's
width either way, so the opaque run must reach past `0.333 + 0.065` and the clear run
must start before `0.667 - 0.065`. Hence the stops at 0.42 and 0.58 — tighten them and
the engraving is breaking up before the brush has touched it, or a rag of it survives
at the end.

⚠️ **The flight is a centre-based FLIP** (`translate` from centre to centre, scale from
`offsetWidth`). The stamp is pinned on an angle and `getBoundingClientRect` on a
rotated element returns the axis-aligned box AROUND it — a box a couple of percent too
wide, which is a couple of percent of scale error arriving exactly at the handover.

⚠️ **`paint()` has a floor under it.** Everything downstream hangs off the flight's
`finished` promise, and animations are frozen while the tab is in the background — so
opening a day and glancing at another tab would come back to a stamp sitting in the
middle of the sheet doing nothing.

### Play

⚠️ **`play` is not a slideshow and not a run of modals.** It clears the page below the
banner and lays the whole trip out in one continuous field — no steps, nothing to page
through. The cover stays, because it is what says which trip this is.

### Tuning it live

`photos.scanDur = 9000` to watch the brush work, `photos.riffle`, `photos.flyDur`,
`photos.enabled = false` for a hard cut. Same pattern as `paper`.

⚠️ **`--sheet-pad` is hoisted out of `.sheet`'s padding** (styles.css) so the full-bleed
cover can negate it exactly. And the negative margin is on the SURFACE, not on the
cover: `overflow` clips to the padding box, so a bleeding child of a scroller whose
padding box stops at the text column is simply cut off there.

⚠️ **`.pcol` carries `height: 100%`** and it is load-bearing. A percentage height
against an auto-height parent computes to `auto`, so without it the 90%-tall cover
quietly falls back to its image's intrinsic ratio — on a wide sheet, a photograph
taller than the window with its byline below the fold. For the same reason the
dog-ear clearance sits on `.pcol` / `.pindex` rather than on `.plates-scroll`: a padded
scroller shortens its own content box, and the cover measures against that.

### Rebuilding the assets

Not a committed build step — `sharp` is deliberately absent from `package.json` (see
**Photos**, below), and the source art lives in Drive. It was a one-off:

- **Stamps** → `content/photos/collections/italy-2026/stamps/*.webp`, cropped inside
  the stipple, 700px long edge, WebP q80.
- **Photographs** → `photos/` at 1800px and `thumbs/` at 760px; `keepExif()` on the
  full size, because the scan panel is the whole reason that data is there.
- **Cover** → `cover.jpg` at 2000px, `cover-sm.jpg` at 1000px.

⚠️ **Write them BASELINE, not progressive.** sharp's `mozjpeg: true` preset writes
progressive scans, and the 2400px progressive cover would not rasterise in Chrome at
all: the element laid out, the bitmap drew fine into a canvas, and the page painted the
placeholder behind it — while `img.decode()` on it hung the renderer outright. The
1000px version of the same file was fine. Baseline at a sane size is what actually
shows up.

⚠️ **`build/dev.js` had no `.webp` in its MIME map** and served the stamps as
`application/octet-stream`. Fixed there; Vercel gets it right on its own.

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
