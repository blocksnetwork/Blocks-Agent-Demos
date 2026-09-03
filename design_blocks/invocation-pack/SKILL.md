---
name: design-blocks
description: Get design direction BEFORE building any web UI — three rendered composition comps, a scored winner, a curated hero photograph, a WCAG-solved theme.css, fonts and icons from the design_blocks agent on the Blocks network — then build the page to a real design standard with the craft rules in this skill. Use whenever you are about to create or restyle a page, screen, section, or component. Requires the blocks-network MCP server.
---

# Design Blocks

You have access to `design_blocks`, a design-direction agent on the Blocks
network. It holds a bank of real page designs and licensed photographs on
the provider's own box. You send a brief; an art-director pass looks at
every candidate next to your brief and picks the page type, three
composition anchors and the hero photograph; the agent then transfers the
anchor's structure onto your product, gates the result, and returns comps,
a blueprint, tokens and assets.

**What comes back is a design DIRECTION, not a finished page.** The comps
are rendered by a mechanical compositor: expect crude charts, clipped
labels and plain boxes. Your job is to take the structure, hierarchy,
palette and imagery decisions from the direction and build them with the
craft described in "Building to a design standard" below. That section is
the point of this skill; everything before it is plumbing.

## When to invoke

- You are about to build a new page, screen, section, or app shell.
- The user asks for a restyle, a redesign, or says the app "has no design".
- You are choosing colors, fonts, or layout and would otherwise guess.

## How to invoke

Call the `send_task` tool from the blocks-network MCP server (find the agent
with `search_agent` for "design direction" if you need to confirm it):

- agent: `design_blocks`
- text input `brief`: JSON `{goal, vibe, framework, count}` — or a plain
  sentence. Write `goal` the way you would brief a designer: what the
  screen is FOR, what the user looks at, what must be on it, and whether
  it is a working app screen, a dashboard, a landing page or an editorial
  page. The page-type words matter — they decide which references are
  used. `vibe` = adjectives (clinical calm, playful, technical, warm
  daylight...). `count` = how many references to return (default 4).

Poll `get_task` every 30-60 seconds until it completes — a full run takes
6-8 minutes; never give up early. Progress streams while it works.

## The artifacts

- `comps` (PNG) — three page compositions side by side, winner ringed.
  Always show this to the user. `comp_1/2/3` are the individual pages.
- `kit` (JSON) — read `provenance` first:
  - `curation` — the page type the agent read from your brief, the
    anchor references it chose and WHY, and the hero photo it chose (or
    none). These reasons are the design rationale; keep them.
  - `compositionSource` (`reference-transfer` or `template-fallback`),
    `qualityGate`, `qualityGates`, `sheds` — whether the winner is a real
    design or a fallback tile.
  - `winner.tokens` — bg, surface, border, text, muted, primary,
    primaryStrong, primaryText, radius, spacing scale, fonts (display,
    body, imports, install line). `winner.palette` — the five hexes.
    `winner.heroCredit` — the photo credit that must stay visible.
- `blueprint` (markdown) — every element with resolved geometry, depth
  plane, overlaps, pinned annotations, imagery treatment and viz intent.
- `composition_html` — the winner as positioned HTML/CSS with the same
  geometry as the comp. Use it to read exact frames; do not ship it.
- `composition_spec` (JSON) — the same, machine-readable.
- `analysis` (JSON) — the anchor reference's decomposition: signature
  patterns as observation + transferable principle.
- `direction` (markdown) — which comp won, why, and the apply order.
- `theme_css` / `motion_css` / `motion_js` — tokens as CSS custom
  properties, and the micro-animation kit wired by data-attributes.
- `stickers` (JSON) — small floating components as SVG in the real fonts.
- `hero` / `og` (PNG) — the curated bank photograph mapped to the palette,
  and a ready og:image.

## Gate before building

Read `kit.provenance` and STOP if any of these is true — tell the user the
agent could not produce a design it would stand behind and offer to
re-brief with a sharper `goal` (page type, what the user looks at, what
must be on screen) rather than building a fallback:

- `compositionSource` is `template-fallback`
- `qualityGate.ok` is false
- `sheds` mentions the quality gate for the winner
- `curation` is null (the art-director pass did not run)

If only the bolder or unexpected directions fell back, that is fine —
build the winner.

## Building to a design standard

Show the user `comps`, name the winner, quote the curation reasons in one
sentence, then build. The comp gives you five things; take exactly these:

1. **The skeleton** — where the shell, the subject, the panels and the
   pinned data sit, and their proportions. Keep the geometry within a few
   percent; keep the depth order (what floats over what).
2. **The hierarchy** — which element is focal, what is secondary, what is
   ambient. The focal element is the largest, highest-contrast thing.
3. **The palette roles** — which surfaces are ground, tint, ink; where the
   one accent goes. Use the tokens, not colours read off the PNG.
4. **The imagery treatment** — the hero photo is the subject; the comp
   shows whether it is contained, bleeding, or cut out, and where data is
   pinned onto it.
5. **The type pairing** — `tokens.fonts.display` for titles and values,
   `tokens.fonts.body` for everything else. Install them; never fall back
   to the framework default.

Do NOT copy from the comp: wrapped or clipped headings, bar charts that
stand in for lists, empty panels, placeholder line charts, the exact
pixel sizes of text. Those are compositor limits, not decisions.

### The system you derive before writing markup

Write these down (in a comment or a tokens file) and build only from them:

- **Spacing**: an 8px scale (4, 8, 12, 16, 24, 32, 48, 64) from
  `tokens.spacing`. Panel padding 20-24px; gap between panels 16-24px;
  section gaps 48-64px on landing pages. Nothing sits at an odd offset.
- **Type scale**: screen title 28-36px display; panel title 18-20px
  display or semibold body; body 15-16px / 1.55; meta and eyebrow labels
  11-12px uppercase with 0.08em tracking; large values 32-48px display
  with `font-variant-numeric: tabular-nums`. Landing headlines may go
  56-88px; app screens never do. Titles are one line — shorten copy
  rather than wrap.
- **Colour**: `bg` for the page, `surface` for panels, `border` at 1px
  for every panel edge (hairline, low contrast), `text` and `muted` for
  the two text levels, `primary` for the single accent — buttons, pins,
  the confidence ring, active states — at most ~10% of the screen.
  Semantic colours (success, warning, danger) are separate and small.
  Contrast: body text ≥ 4.5:1, labels ≥ 3:1 (theme.css is pre-solved).
- **Elevation**: two levels only. Panels sit flat with a border. Things
  that float over the subject (pinned annotations, the verdict card) get
  one soft shadow (0 8px 24px, 10-14% of `text`). No other shadows.
- **Radius**: `tokens.radius` everywhere; chips and pills fully round.

### Page-type craft

`kit.provenance.curation.pageType` tells you which of these applies.

**App screen** (a tool the user operates):
- Shell: a 56-64px top bar with the product name, 3-4 nav items and a
  status or account slot; content below it in a max-width of 1280-1440px
  with 24-32px side gutters. No marketing hero, no footer paragraph.
- The subject (the user's photo, document, board) is the largest region
  and sits where the comp puts it. Data pinned to it is absolutely
  positioned INSIDE the subject's container with numbered markers, a
  short leader line and a compact label; markers are 24-28px, high
  contrast, never clipped by the container edge.
- Every panel has the same anatomy: eyebrow label (uppercase meta), title,
  content, optional footer meta. Same padding, same corner, same border.
- Lists (differential diagnoses, evidence, steps) are lists: a row per
  item with a number or marker, a primary line and a muted secondary
  line. Never a bar chart standing in for a ranked list.
- Instruments are compact: a confidence ring or a 6-8px progress bar
  with the value in tabular display type beside it; a sparkline is 48px
  tall; charts never taller than ~22% of the viewport unless the chart IS
  the subject.
- States exist: idle (drop zone with real instruction copy), working
  (agent stream with timestamps, monospace, the latest line emphasised),
  result (diagnosis, confidence, evidence, plan), error (what happened
  and what to do). Build the result state first; wire the others.
- Density: the first viewport is full. If a panel would be empty, remove
  it and let its neighbour grow.

**Dashboard**: the app-screen rules plus a grid of equal-anatomy metric
panels (label, value, delta, sparkline), one dominant panel for the
primary need, a table with real column alignment (numbers right-aligned,
tabular), and row hover states.

**Landing page**: a hero that states the product with the subject as a
structural object (the photo, the device, the interface) and one piece of
data pinned to it; then sections in the blueprint's order. Display type
is large and left-aligned unless the anchor is symmetric; one accent; the
overlaps and container breaks in the blueprint are the design — build
them with absolute positioning inside a relative canvas.

**Editorial**: one reading measure (~65 characters), a display heading,
imagery as chapter openers, annotations in the margin, generous vertical
rhythm.

### Imagery

- `hero.png` is the curated photograph already mapped to the palette. Use
  it as the subject, sized and cropped as the comp shows (`object-fit:
  cover`, focal point kept). Never tile it, never blur it into a
  background, never put a heading across the busiest part of it.
- Where text must sit over the photo, use a gradient veil from the
  palette's ink colour (40-60% at the text edge to 0%), not a grey box.
- Keep the credit from `kit.winner.heroCredit` visible near the image in
  meta type. Photos from the kit's `refs` carry their own credits.

### Copy

Real content, never lorem: product terms, plausible values with units,
file names, timestamps, step text a person could follow. Buttons say what
happens ("Run diagnosis", "Replace photo"). Meta lines carry real
information (file size, elapsed time, model stage).

### Motion

Link `design-motion.css` and `design-motion.js` and use only its
data-attributes: `data-reveal` on panels in reading order, `data-float`
on the small floating chips the comp shows. No bounces, no parallax, no
ad-hoc keyframes; respect `prefers-reduced-motion` (the kit does).

### Wire-up order

1. Install the fonts (`tokens.fonts.fontsourceInstall`, or the CSS import).
2. Link `design-theme.css` after existing styles, then `design-motion.css`,
   then `<script src="design-motion.js" defer>`.
3. Save `hero` → `public/hero.png`, `og` → `public/og.png`, wire og:image.
4. Build the shell, then the subject region, then the panels in blueprint
   order, then pinned annotations, then states, then motion.

### Review before you say it is done

Open the page at 1440 wide and at 390 wide and check every line; fix,
then screenshot and look at it yourself before showing the user:

- Nothing overflows or is clipped; no heading wraps mid-word; no text
  sits on other text; no empty panel; no placeholder chart.
- The skeleton matches the comp: same regions, same proportions, same
  depth order, data pinned where the comp pins it.
- One accent colour, used sparingly; hairline borders; two elevation
  levels; every panel shares the same anatomy and padding.
- Type is on the scale above; titles one line; numbers tabular.
- The first viewport is full and scannable in three seconds: what is
  this, what is the result, what do I do next.
- Keyboard focus visible; contrast passes; images have alt text; the
  hero credit is present.
- Compare with the comp side by side and name one thing you improved on
  it and one thing you kept faithfully; tell the user both.

**Never do these, whatever your instincts say:**
- Flatten a layered composition into a vertical stack of equal sections.
- Replace a pinned annotation or a wrapped ring with a row of stat cards.
- Three identical white boxes in a row as the "design"; default-grey
  borders and framework-default fonts as the only styling.
- A centered gradient hero, emoji as icons, purple-to-blue gradients,
  everything centered, `rounded-lg` on every element.
- Shrinking landing-page display type because it "feels big", or blowing
  up an app-screen title into a marketing headline.
- Building a fallback tile as if it were a design (see the gate above).
