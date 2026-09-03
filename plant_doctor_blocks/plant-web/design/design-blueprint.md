# Composition blueprint — Night Lab

Brief: Plant Doctor — a one-screen working web app, not a marketing page: the user drops a photo of a sick plant; an AI agent on the Blocks network diagnoses it. The screen shows the photo as the subject with evidence markers pinned to the leaf, streams the agent's progress, then presents the diagnosis with a confidence value, the ranked differential, and a numbered treatment plan. — botanical, clinical calm, editorial, warm daylight, trustworthy — Next.js + Tailwind 4
Transferred from reference: Dark documentation landing page that pairs a centered, air-heavy typographic hero with a full-bleed live product demo docked below and cropped by the viewport edge.

**This page is a COMPOSITION, not a stack of sections. Build `composition.html`'s geometry, restyled into your framework — the percent coordinates and z-planes below are the design. The overlaps, attachments, and container breaks are intentional; flattening them into a clean vertical stack destroys the design.**

## The principles this composition embodies

- switch axis systems mid-screen: a calm three-part verdict band above, an asymmetric rail-plus-exhibit block below
- crop the primary artifact at the frame edge so the exhibit implies continuation
- insert a control strip between the verdict band and the exhibit so the photo reads as interactive apparatus, not decoration
- every quantitative unit runs label → magnitude → interpretation → context so the screen scans as one table
- freeze an interaction state (agent mid-step) into the still layout to prove liveness
- near-monochrome surfaces; one saturated marker dot carries hierarchy signalling

Verified in the render: 2/6 principles hold structurally.

## Global rules

- Canvas: 1440px design width, ~1320px tall; position elements with percent coordinates inside one `position: relative` canvas so the composition scales.
- Depth planes: 3. Map plane n to `z-index: n*10`. Elements on different planes are ALLOWED to overlap — that is the point.
- Fonts: display Fraunces, body Inter (theme_css loads them).
- Colors only via the theme tokens: --design-bg, --design-surface, --design-text, --design-muted, --design-primary, --design-primary-strong.
- Focal element: `leaf-photo` — nothing may out-scale or out-contrast it.

## Elements, in reading order

### `topbar` — app top bar (group, depth plane 3)

- Geometry: left 0.00%, top 0.00%, width 100.00%, height 5.00% (1440x66px at design size).
- Surface: solid.
- Color role: surface — the token to use.

### `brand` — product name (text, depth plane 3)

- Geometry: left 2.00%, top 1.10%, width 24.00%, height 2.80% (346x37px at design size).
- Heading: "Plant Doctor".

### `nav-links` — nav links (text, depth plane 3)

- Geometry: left 48.00%, top 1.30%, width 50.00%, height 2.40% (720x32px at design size).
- Items: Scans · Library · Care log · Re-diagnose

### `screen-title` — screen title and specimen line (text, depth plane 2)

- Geometry: left 3.00%, top 7.00%, width 29.00%, height 12.00% (418x158px at design size).
- Heading: "Leaf scan — Ficus lyrata" — sized to FILL the frame (display type is the design; do not shrink it).
- Metric: IMG_2291 · 14:06 · north window

### `diagnosis` — primary diagnosis verdict (panel, depth plane 2)

- Geometry: left 34.00%, top 7.00%, width 34.00%, height 12.00% (490x158px at design size).
- Heading: "Septoria leaf spot".
- Body: "Fungal spotting spread by water splashing onto lower leaves."
- Metric: primary diagnosis
- Surface: solid.
- Color role: ink — the token to use.

### `confidence` — certainty instrument (viz, depth plane 3)

- Geometry: left 62.00%, top 7.00%, width 31.00%, height 12.00% (446x158px at design size).
- overlaps `diagnosis` by 7% from the left — this overlap is the depth cue, keep it
- Data viz (communicate certainty of the primary diagnosis at a glance): render as ringSegment — the visual idea: open ring with the percentage set large inside it and a context caption beneath. The exact SVG is inlined in composition.html; adapt it, never swap it for a generic stat card.
- Values: confidence=87%, markers matched=4 of 5.
- Surface: outline.
- Color role: accent — the ONE accent carrier on this page.

### `view-tabs` — control strip between verdict band and exhibit (text, depth plane 3)

- Geometry: left 3.00%, top 21.00%, width 94.00%, height 7.00% (1354x92px at design size).
- Items: Evidence · Overlay mask · Differential · Zoom 1.4× · Compare last scan
- Surface: outline.
- Color role: neutral — the token to use.

### `agent-stream` — live agent reasoning rail (viz, depth plane 3)

- Geometry: left 3.00%, top 27.00%, width 34.00%, height 20.00% (490x264px at design size).
- Data viz (communicate progress of the agent's live analysis run): render as dotField — the visual idea: vertical step list, filled dots for finished steps and one live dot on the running step, elapsed time in the header. The exact SVG is inlined in composition.html; adapt it, never swap it for a generic stat card.
- Values: segment leaf mask=done, detect lesion clusters=done, measure halo ratio=done, match spore pattern=done, rank differentials=running 12.4s.
- Surface: solid.
- Color role: surface — the token to use.

### `leaf-photo` — primary-subject: uploaded leaf photo work area (image, depth plane 2)

- Geometry: left 45.44%, top 27.00%, width 62.00%, height 45.00% (893x594px at design size).
- breaks its container's right edge by 12% of its own size — let it clip out, do not shrink it to fit
- Imagery: contained image of "macro photograph of one fiddle-leaf fig leaf with dark brown necrotic spots ringed by yellow halos, clinical flat lighting, neutral grey backdrop".
- Metric: 4032×3024 · overlay on

### `marker-a` — evidence marker pinned to lesion (viz, depth plane 3)

- Geometry: left 43.00%, top 32.00%, width 17.00%, height 7.00% (245x92px at design size).
- pinned to the point 24%,34% ON `leaf-photo` with a drawn leader line — the annotation belongs to the subject, not to a card row
- overlaps `leaf-photo` by 85% from the left — this overlap is the depth cue, keep it
- Data viz (locate symptoms directly on the plant photo): render as leaderCallout — the visual idea: saturated dot on the lesion with a leader line to a compact readout. The exact SVG is inlined in composition.html; adapt it, never swap it for a generic stat card.
- Values: necrotic center=4mm.
- Surface: glass.
- Color role: accent — the ONE accent carrier on this page.

### `differential` — ranked competing conditions (viz, depth plane 3)

- Geometry: left 3.00%, top 49.00%, width 34.00%, height 23.00% (490x304px at design size).
- Data viz (compare magnitudes — rank competing explanations against each other): render as barColumn — the visual idea: ranked rows, each a label with a hairline likelihood bar and the score at the row end. The exact SVG is inlined in composition.html; adapt it, never swap it for a generic stat card.
- Values: Septoria leaf spot=87, Bacterial leaf spot=41, Overwatering edema=23, Spider mite damage=11.
- Surface: solid.
- Color role: surface — the token to use.

### `marker-b` — evidence marker pinned to leaf margin (viz, depth plane 3)

- Geometry: left 80.00%, top 57.00%, width 18.00%, height 7.00% (259x92px at design size).
- pinned to the point 62%,74% ON `leaf-photo` with a drawn leader line — the annotation belongs to the subject, not to a card row
- overlaps `leaf-photo` by 80% from the right — this overlap is the depth cue, keep it
- Data viz (locate symptoms directly on the plant photo): render as leaderCallout — the visual idea: dot on the chlorotic margin with a leader line to a compact readout. The exact SVG is inlined in composition.html; adapt it, never swap it for a generic stat card.
- Values: chlorotic halo=9 sites.
- Surface: glass.
- Color role: accent — the ONE accent carrier on this page.

### `treatment` — numbered treatment plan (panel, depth plane 3)

- Geometry: left 3.00%, top 74.00%, width 95.00%, height 18.00% (1368x238px at design size).
- Heading: "Do this next".
- Metric: treatment plan · 14 days
- Items: 1 · Remove spotted leaves today — sterile shears, bin, do not compost · 2 · Water at soil only, morning — no misting for 14 days · 3 · Copper fungicide spray day 2 and day 9 — 5ml per litre · 4 · Move 40cm from the window, run a small fan 4h daily · 5 · Re-scan day 10 to compare lesion count
- Surface: solid.
- Color role: neutral — the token to use.

### `provenance` — provenance line (text, depth plane 1)

- Geometry: left 3.00%, top 96.00%, width 70.00%, height 3.00% (1008x40px at design size).
- Body: "agent pd-4 on Blocks network · model run 12.4s · re-diagnose"

## Responsive contract

- The composition IS the desktop/tablet (>=760px) experience. Below 760px, LINEARIZE: elements flow in reading order, pure-depth decor elements disappear, and leader-line annotations are hidden — composition.html already implements this pattern; keep it.
- Leader lines must be drawn at runtime from live element positions (see composition.html's script), never as fixed pixel coordinates — fixed lines break the moment the layout reflows.
- Never scale-shrink the whole canvas onto a phone; never let absolutely positioned elements overlap unreadably at intermediate widths — test at 1440, 1024, 760, and 390.

## Motion pass (after the layout is faithful)

- data-reveal on each text heading; data-reveal-group on grid groups; data-float ONLY on small floating elements at plane 3+ (annotations, chips).
- Never animate the focal element's position — depth comes from the static overlaps.

## What NOT to do

- Do not normalize overlapping elements into a vertical stack.
- Do not equalize deliberately different panel sizes or "fix" declared misalignments.
- Do not replace the custom viz SVGs with a chart library's default card.
- Do not center the focal element if these coordinates place it off-axis.