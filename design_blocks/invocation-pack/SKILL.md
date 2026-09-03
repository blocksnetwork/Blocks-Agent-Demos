---
name: design-blocks
description: Get design direction BEFORE building any web UI — three rendered design comps with GPU-generated hero imagery, a scored winner, a WCAG-solved theme.css, fonts, icons, hero.png, and og.png from the design_blocks agent on the Blocks network. Use whenever you are about to create or restyle a page, section, or component. Requires the blocks-network MCP server.
---

# Design Blocks

You have access to `design_blocks`, a design-direction agent on the Blocks
network. It holds a bank of reference designs on the provider's own GPU box;
you send a one-line brief and get back the closest references, a concrete
direction, and assets you can apply immediately. Consult it BEFORE writing
UI code — direction first, then build to it.

## When to invoke

- You are about to build a new page, screen, section, or app shell.
- The user asks for a restyle, a redesign, or says the app "has no design".
- You are choosing colors, fonts, or layout and would otherwise guess.

## How to invoke

Call the `send_task` tool from the blocks-network MCP server (find the agent
with `search_agent` for "design direction" if you need to confirm it):

- agent: `design_blocks`
- text input `brief`: JSON `{goal, vibe, framework, count}` — or a plain
  sentence. `goal` = what the page is for, `vibe` = adjectives (playful,
  technical, elegant, dark...), `count` = how many references (default 4).

Poll `get_task` until it completes; progress streams while it works
("Painting hero 2/3..."). The artifacts:

- `comps` (PNG) — three rendered page COMPOSITIONS (full-page previews:
  depth planes, overlaps, data pinned to imagery), winner ringed. Always
  show this to the user; `comp_1/2/3` are the individual pages.
- `blueprint` (markdown) — **the page itself**: every element with its
  resolved percent geometry, depth plane, overlaps, pinned annotations,
  container breaks, imagery treatment, and custom viz — derived from the
  composition spec, not from section recipes.
- `composition_html` (HTML) — the winning composition as standalone
  positioned HTML/CSS, geometrically identical to the comp. **Port this
  into the app's framework instead of re-inventing the layout.**
- `composition_spec` (JSON) — the machine-readable composition: elements,
  relations, resolved pixel frames, the resolver's adjustment log.
- `analysis` (JSON) — the reference decomposition the design transferred
  from (signature patterns: observation + transferable principle).
- `direction` (markdown) — which comp won, why, provenance (was it a real
  reference transfer or the template fallback), and the apply order.
- `kit` (JSON) — provenance + winner tokens, all three directions with
  structural/domain/palette score parts, icons, fonts, headline copy.
- `theme_css` / `motion_css` / `motion_js` — the styling and the
  micro-animation kit (scroll reveals, floating drift, hover lift/tilt),
  wired entirely by data-attributes.
- `stickers` (JSON) — floating component assets (stat chips, badges, tag
  pills, mini-cards) as inline-ready SVGs in the direction's real fonts.
- `hero` / `og` (PNG) — the generated hero image and a ready og:image.

## The build contract (this is where quality lives)

**The blueprint is the page. Build it section by section, using its exact
numbers — sizes, paddings, overlaps, rotations. It outranks your habits.**

1. Show the user `comps` and name the winner (a different pick = build
   that comp: its genome and tokens are in the kit's `directions`).
2. Read `blueprint` end to end BEFORE writing any markup.
3. Wire the files: `design-theme.css` after existing styles, then
   `design-motion.css`, then `<script src="design-motion.js" defer>`.
   Save `hero` → `public/hero.png`, `og` → `public/og.png`.
4. Build each blueprint section in order. Inline the sticker SVGs where
   the blueprint places floating elements; give each `data-float`. Add
   `data-reveal` / `data-reveal-group` exactly where the blueprint says.
5. After layout works, do the motion pass the blueprint ends with, then
   load the page and confirm reveals fire and stickers drift.

**Never do these, whatever your instincts say:**
- Flatten the composition into a vertical stack of sections. The
  overlaps, container breaks, and deliberate misalignments in the
  blueprint ARE the design — build them with absolute positioning and
  z-index inside one relative canvas, exactly as composition.html does.
- Replace a pinned annotation or a wrapped ring with a row of stat
  cards. If the blueprint attaches data to a point on the subject, the
  built page attaches data to a point on the subject.
- A centered gradient card as the hero when the blueprint says otherwise.
- Three identical white boxes in a row; unlayered, non-overlapping
  everything; default-gray borders as the only styling.
- Shrinking the display type below the blueprint's px because it "feels
  big" — the size IS the design.
- Ad-hoc keyframes or inline transitions — the motion kit is the only
  animation source.
- Emoji standing in for icons, or dropping the stickers because they feel
  extra — the floating elements are the produced look.
