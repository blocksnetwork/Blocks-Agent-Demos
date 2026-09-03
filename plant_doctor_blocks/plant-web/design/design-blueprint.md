# Composition blueprint — Textured Botanical

Brief: Plant Doctor — drop a photo of a sick plant and an AI agent on the Blocks network diagnoses it: the page shows the photo, streams the agent's progress, then presents the diagnosis with confidence, visual evidence pinned to the leaf, and a numbered treatment plan. One-screen web app, not a marketing page. — botanical, clinical calm, editorial, warm daylight, trustworthy — Next.js + Tailwind 4
Transferred from reference: A macro shot of a textured, cellular surface transitioning from matte green at the top to metallic silver at the bottom.

**This page is a COMPOSITION, not a stack of sections. Build `composition.html`'s geometry, restyled into your framework — the percent coordinates and z-planes below are the design. The overlaps, attachments, and container breaks are intentional; flattening them into a clean vertical stack destroys the design.**

## The principles this composition embodies

- dominant mass anchors top-left with high-contrast green texture
- organic irregular boundaries replace rigid grids to mimic cellular structure
- diagnostic data pins directly onto the leaf anatomy rather than floating panels
- vertical flow line carries the headline and progress stream down the left edge
- density fills the entire canvas height with no empty bands

Verified in the render: 2/5 principles hold structurally.

## Global rules

- Canvas: 1440px design width, ~2722px tall; position elements with percent coordinates inside one `position: relative` canvas so the composition scales.
- Depth planes: 2. Map plane n to `z-index: n*10`. Elements on different planes are ALLOWED to overlap — that is the point.
- Fonts: display Fraunces, body Inter (theme_css loads them).
- Colors only via the theme tokens: --design-bg, --design-surface, --design-text, --design-muted, --design-primary, --design-primary-strong.
- Focal element: `leafSubject` — nothing may out-scale or out-contrast it.

## Elements, in reading order

### `leafSubject` — primary-subject (image, depth plane 1)

- Geometry: left -38.00%, top -25.86%, width 100.00%, height 80.82% (1440x2200px at design size).
- Imagery: transparent-background cutout (use the shipped PNG as-is, no frame, no border-radius) of "macro closeup of a healthy green leaf with a single subtle brown necrotic spot, cellular texture visible, soft directional lighting casting deep shadows within the veins".
- Surface: solid.
- Color role: primary — the token to use.

### `nav-ghost` — navigation (group, depth plane 2)

- Geometry: left 0.00%, top 0.00%, width 100.00%, height 2.42% (1440x66px at design size).
- Items: upload · history · settings
- Surface: outline.
- Color role: neutral — the token to use.

### `footer-line` — footer-text (text, depth plane 1)

- Geometry: left 0.00%, top 15.36%, width 100.00%, height 1.62% (1440x44px at design size).
- Body: "© 2024 Plant Doctor AI. Clinical diagnosis guidance."
- Surface: solid.
- Color role: neutral — the token to use.

### `confidence-pin` — metric-annotation (viz, depth plane 3)

- Geometry: left 69.18%, top 26.63%, width 14.00%, height 8.08% (202x220px at design size).
- pinned to the point 88%,50% ON `leafSubject` with a drawn leader line — the annotation belongs to the subject, not to a card row
- Data viz (show diagnosis confidence percentage): render as leaderCallout — the visual idea: value pinned to the leaf edge with a leader line. The exact SVG is inlined in composition.html; adapt it, never swap it for a generic stat card.
- Values: Confidence=98.4%.
- Surface: solid.
- Color role: neutral — the token to use.

### `anatomy-pin` — spatial-condition (viz, depth plane 3)

- Geometry: left 8.07%, top 42.03%, width 16.00%, height 9.70% (230x264px at design size).
- pinned to the point 28%,70% ON `leafSubject` with a drawn leader line — the annotation belongs to the subject, not to a card row
- Data viz (show disease location and tissue damage): render as ringSegment — the visual idea: magnified view pinned to the brown spot. The exact SVG is inlined in composition.html; adapt it, never swap it for a generic stat card.
- Values: Location=mid-vein.
- Surface: glass.
- Color role: primary — the token to use.

### `treatment-plan` — step-by-step-guide (panel, depth plane 2)

- Geometry: left 8.40%, top 47.27%, width 28.00%, height 36.37% (403x990px at design size).
- pinned to the point 0%,100% ON `progress-stream` with a drawn leader line — the annotation belongs to the subject, not to a card row
- Items: 1. Remove affected leaf · 2. Apply fungicide spray · 3. Water lightly
- Surface: solid.
- Color role: neutral — the token to use.

### `progress-stream` — diagnostic-progress (viz, depth plane 2)

- Geometry: left -6.00%, top 51.64%, width 12.00%, height 46.88% (173x1276px at design size).
- pinned to the point 2%,100% ON `leafSubject` with a drawn leader line — the annotation belongs to the subject, not to a card row
- Data viz (show AI agent processing steps): render as flowLine — the visual idea: vertical flowing line with pulsing nodes. The exact SVG is inlined in composition.html; adapt it, never swap it for a generic stat card.
- Values: Step 1=upload, Step 2=analyzing, Step 3=done.
- Surface: glass.
- Color role: accent — the ONE accent carrier on this page.

### `headline-stream` — headline-in-flow (text, depth plane 2)

- Geometry: left -6.00%, top 67.08%, width 12.00%, height 11.32% (173x308px at design size).
- pinned to the point 0%,100% ON `leafSubject` with a drawn leader line — the annotation belongs to the subject, not to a card row
- Heading: "Plant Doctor" — sized to FILL the frame (display type is the design; do not shrink it).
- Body: "drop a photo of a sick plant and an AI agent"
- Surface: solid.
- Color role: ink — the token to use.

### `agent-status` — system-health (viz, depth plane 2)

- Geometry: left 2.95%, top 70.87%, width 10.00%, height 6.47% (144x176px at design size).
- pinned to the point 0%,100% ON `progress-stream` with a drawn leader line — the annotation belongs to the subject, not to a card row
- Data viz (indicate diagnostic agent status): render as ringSegment — the visual idea: status ring. The exact SVG is inlined in composition.html; adapt it, never swap it for a generic stat card.
- Values: Status=Active.
- Surface: solid.
- Color role: primary — the token to use.

### `severity-badge` — magnitude-indicator (panel, depth plane 2)

- Geometry: left -6.56%, top 73.55%, width 28.00%, height 14.55% (403x396px at design size).
- pinned to the point 0%,100% ON `progress-stream` with a drawn leader line — the annotation belongs to the subject, not to a card row
- Heading: "Severity".
- Metric:  Low
- Items: Urgency: 2/10
- Surface: solid.
- Color role: neutral — the token to use.

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