/**
 * The implementation handoff for the composition path.
 *
 * Two renderings of the SAME resolved geometry, so the preview the
 * critique blessed and the code the consumer builds cannot diverge:
 *
 * - specBlueprint: a prose walk of the composition for the coding
 *   agent, generated from the spec (NOT from section recipes — the old
 *   template blueprint survives only on the fallback path).
 * - emitCompositionHtml: a dumb serializer of the resolved frames into
 *   standalone HTML/CSS — percent-positioned absolute layout, z-index
 *   from planes, the same viz SVG strings, data-role attributes on
 *   every element. Deliberately NOT a second layout engine: geometry
 *   comes verbatim from the resolver.
 */

import type { CompositionSpec, CompElement } from './composition.js';
import type { ResolvedLayout } from './resolve.js';
import type { DesignTokens } from './tokens.js';
import { proceduralImageSvg } from './scene.js';

function pct(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(2)}%`;
}

function relationProse(element: CompElement): string[] {
  return element.relations.map((r) => {
    switch (r.type) {
      case 'overlaps':
        return `overlaps \`${r.target}\` by ${Math.round(r.amount * 100)}%${r.side ? ` from the ${r.side}` : ''} — this overlap is the depth cue, keep it`;
      case 'attachedTo':
        return `pinned to the point ${r.at.x}%,${r.at.y}% ON \`${r.target}\` with a drawn leader line — the annotation belongs to the subject, not to a card row`;
      case 'breaksContainer':
        return `breaks its container's ${r.side} edge by ${Math.round(r.amount * 100)}% of its own size — let it clip out, do not shrink it to fit`;
      case 'offsetFrom':
        return `deliberately misaligned ${Math.round(r.amount * 100)}% from \`${r.target}\`'s ${r.edge} edge — do NOT "fix" this alignment`;
      case 'encircles':
        return `wraps \`${r.target}\` as a ring at ${r.ratio.toFixed(2)}x its size — split the ring so it passes behind the subject at the top and in front at the bottom`;
    }
  });
}

function elementHeading(element: CompElement): string {
  return `\`${element.id}\` — ${element.role} (${element.kind}, depth plane ${element.z})`;
}

/** Reading-order walk of the composition, with exact resolved numbers. */
export function specBlueprint(
  spec: CompositionSpec,
  layout: ResolvedLayout,
  tokens: DesignTokens,
  meta: {
    brief: string;
    referenceSummary?: string;
    principlesSurviving?: string[];
    directionName: string;
  },
): string {
  const { width, height } = layout.canvas;
  const ordered = [...layout.elements].sort((a, b) => a.y - b.y || a.x - b.x);

  const lines: string[] = [
    `# Composition blueprint — ${meta.directionName}`,
    '',
    `Brief: ${meta.brief}`,
    meta.referenceSummary ? `Transferred from reference: ${meta.referenceSummary}` : '',
    '',
    '**This page is a COMPOSITION, not a stack of sections. Build `composition.html`\'s geometry, restyled into your framework — the percent coordinates and z-planes below are the design. The overlaps, attachments, and container breaks are intentional; flattening them into a clean vertical stack destroys the design.**',
    '',
    '## The principles this composition embodies',
    '',
    ...spec.principles.map((p) => `- ${p}`),
    ...(meta.principlesSurviving?.length
      ? ['', `Verified in the render: ${meta.principlesSurviving.length}/${spec.principles.length || meta.principlesSurviving.length} principles hold structurally.`]
      : []),
    '',
    '## Global rules',
    '',
    `- Canvas: ${width}px design width, ~${height}px tall; position elements with percent coordinates inside one \`position: relative\` canvas so the composition scales.`,
    `- Depth planes: ${spec.planes}. Map plane n to \`z-index: n*10\`. Elements on different planes are ALLOWED to overlap — that is the point.`,
    `- Fonts: display ${tokens.fonts.display}, body ${tokens.fonts.body} (theme_css loads them).`,
    `- Colors only via the theme tokens: --design-bg, --design-surface, --design-text, --design-muted, --design-primary, --design-primary-strong.`,
    `- Focal element: \`${spec.focalElementId}\` — nothing may out-scale or out-contrast it.`,
    '',
    '## Elements, in reading order',
    '',
  ];

  for (const resolved of ordered) {
    const e = resolved.element;
    lines.push(`### ${elementHeading(e)}`, '');
    lines.push(
      `- Geometry: left ${pct(resolved.x, width)}, top ${pct(resolved.y, height)}, width ${pct(resolved.w, width)}, height ${pct(resolved.h, height)} (${Math.round(resolved.w)}x${Math.round(resolved.h)}px at design size)${e.rotation ? `, rotated ${e.rotation}deg` : ''}.`,
    );
    for (const prose of relationProse(e)) lines.push(`- ${prose}`);
    if (e.imagery) {
      lines.push(
        `- Imagery: ${e.imagery.integration === 'cutout' ? 'transparent-background cutout (use the shipped PNG as-is, no frame, no border-radius)' : e.imagery.integration === 'bleed' ? 'full-bleed image, no radius, let it run under neighbors' : 'contained image'} of "${e.imagery.subject}"${e.imagery.mask === 'circle' ? ', circle-masked' : ''}.`,
      );
    }
    if (e.viz) {
      lines.push(
        `- Data viz (${e.viz.intent}): render as ${e.viz.render.map((p) => p.primitive).join(' + ')}${e.viz.form ? ` — the visual idea: ${e.viz.form}` : ''}. The exact SVG is inlined in composition.html; adapt it, never swap it for a generic stat card.`,
      );
      if (e.viz.values?.length) lines.push(`- Values: ${e.viz.values.map((v) => `${v.label}=${v.value}`).join(', ')}.`);
    }
    if (e.content?.heading) lines.push(`- Heading: "${e.content.heading}"${e.content.fit === 'fill' ? ' — sized to FILL the frame (display type is the design; do not shrink it)' : ''}.`);
    if (e.content?.body) lines.push(`- Body: "${e.content.body}"`);
    if (e.content?.label || e.content?.value) lines.push(`- Metric: ${e.content?.label ?? ''} ${e.content?.value ?? ''}`.trim());
    if (e.content?.items?.length) lines.push(`- Items: ${e.content.items.join(' · ')}`);
    if (e.style?.surface) lines.push(`- Surface: ${e.style.surface}${resolved.legibilityFix ? ' (scrim required for legibility)' : ''}.`);
    if (e.style?.paletteRole) lines.push(`- Color role: ${e.style.paletteRole} — the ${e.style.paletteRole === 'accent' ? 'ONE accent carrier on this page' : 'token to use'}.`);
    if (e.layout) lines.push(`- Grid group: ${e.layout.cols} columns, children flow in order.`);
    lines.push('');
  }

  lines.push(
    '## Responsive contract',
    '',
    '- The composition IS the desktop/tablet (>=760px) experience. Below 760px, LINEARIZE: elements flow in reading order, pure-depth decor elements disappear, and leader-line annotations are hidden — composition.html already implements this pattern; keep it.',
    '- Leader lines must be drawn at runtime from live element positions (see composition.html\'s script), never as fixed pixel coordinates — fixed lines break the moment the layout reflows.',
    '- Never scale-shrink the whole canvas onto a phone; never let absolutely positioned elements overlap unreadably at intermediate widths — test at 1440, 1024, 760, and 390.',
    '',
    '## Motion pass (after the layout is faithful)',
    '',
    '- data-reveal on each text heading; data-reveal-group on grid groups; data-float ONLY on small floating elements at plane 3+ (annotations, chips).',
    '- Never animate the focal element\'s position — depth comes from the static overlaps.',
    '',
    '## What NOT to do',
    '',
    '- Do not normalize overlapping elements into a vertical stack.',
    '- Do not equalize deliberately different panel sizes or "fix" declared misalignments.',
    '- Do not replace the custom viz SVGs with a chart library\'s default card.',
    '- Do not center the focal element if these coordinates place it off-axis.',
  );

  return lines.filter((l) => l !== null).join('\n');
}

/* ------------------------------------------------------------------ */
/* HTML serializer                                                     */
/* ------------------------------------------------------------------ */

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Standalone composition.html: same geometry as the preview, expressed
 * as percent-positioned CSS. `assetFiles` maps element ids to the image
 * file names shipped alongside (e.g. subject.png).
 */
export function emitCompositionHtml(
  spec: CompositionSpec,
  layout: ResolvedLayout,
  tokens: DesignTokens,
  palette: string[],
  assetFiles: Map<string, string>,
  vizSvgs: Map<string, string>,
  meta: { title: string },
): string {
  const { width, height } = layout.canvas;
  const body: string[] = [];

  // DOM in READING order (top-to-bottom, left-to-right) so the mobile
  // linearization reads correctly; desktop stacking comes from explicit
  // z-index, never from source order.
  const ordered = [...layout.elements].sort((a, b) => a.y - b.y || a.x - b.x);

  for (const resolved of ordered) {
    const e = resolved.element;
    const style = [
      `left:${pct(resolved.x, width)}`,
      `top:${pct(resolved.y, height)}`,
      `width:${pct(resolved.w, width)}`,
      `height:${pct(resolved.h, height)}`,
      `z-index:${e.z * 10 + Math.min(9, Math.round(resolved.y / height * 9))}`,
      e.rotation ? `transform:rotate(${e.rotation}deg)` : '',
    ]
      .filter(Boolean)
      .join(';');

    const hasContent =
      Boolean(e.content?.heading || e.content?.body || e.content?.label || e.content?.value || e.content?.items?.length) ||
      Boolean(e.viz) ||
      Boolean(e.imagery) ||
      Boolean(assetFiles.get(e.id));

    const classes = ['el', `kind-${e.kind}`];
    const surface = resolved.legibilityFix ?? e.style?.surface;
    if (surface && surface !== 'none') classes.push(`surface-${surface}`);
    if (e.imagery?.mask === 'circle') classes.push('mask-circle');
    if (e.imagery?.integration === 'cutout') classes.push('cutout');
    // pure depth/decor elements linearize to nothing on a phone
    if (!hasContent) classes.push('decor');

    // annotations pinned to a target carry their anchor as data — a tiny
    // runtime script draws the leader from LIVE element positions, so
    // lines survive any reflow (the old fixed-viewBox lines did not).
    const attach = e.relations.find((r) => r.type === 'attachedTo');
    const anchorAttrs =
      attach && attach.type === 'attachedTo'
        ? ` data-anchor-target="${esc(attach.target)}" data-anchor-at="${attach.at.x},${attach.at.y}"`
        : '';

    const inner: string[] = [];
    const assetFile = assetFiles.get(e.id);
    if (assetFile) {
      inner.push(`<img src="${esc(assetFile)}" alt="${esc(e.imagery?.subject ?? e.role)}" />`);
    } else if (e.imagery) {
      // same seeded procedural SVG the preview rendered — page and comp agree
      inner.push(
        proceduralImageSvg(Math.round(resolved.w), Math.round(resolved.h), palette, {
          circle: e.imagery.mask === 'circle',
          seed: `${e.id}:${e.imagery.subject ?? e.role}`,
        }).replace('<svg ', '<svg class="fill-media" preserveAspectRatio="xMidYMid slice" '),
      );
    }
    const vizSvg = vizSvgs.get(e.id);
    if (vizSvg) inner.push(vizSvg);
    if (e.content?.heading)
      inner.push(`<h2 class="${e.content.fit === 'fill' ? 'fill' : ''}">${esc(e.content.heading)}</h2>`);
    if (e.content?.body) inner.push(`<p>${esc(e.content.body)}</p>`);
    if (e.content?.label) inner.push(`<span class="label">${esc(e.content.label)}</span>`);
    if (e.content?.value) inner.push(`<span class="value">${esc(e.content.value)}</span>`);
    if (e.content?.items?.length)
      inner.push(`<ul>${e.content.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`);

    body.push(
      `  <!-- ${esc(e.role)}${e.relations.length ? ` | ${e.relations.map((r) => r.type).join(', ')}` : ''} -->\n` +
        `  <div class="${classes.join(' ')}" data-id="${esc(e.id)}" data-role="${esc(e.role)}"${anchorAttrs} style="${style}">\n` +
        inner.map((i) => `    ${i}\n`).join('') +
        `  </div>`,
    );
  }

  return `<!doctype html>
<!-- Generated by design_blocks from the winning CompositionSpec.
     Geometry is verbatim from the resolved layout: the preview comp and
     this file cannot disagree. Principles embodied:
${spec.principles.map((p) => `       - ${esc(p)}`).join('\n')}

     Responsive contract: the composition IS the >=760px experience.
     Below 760px the canvas linearizes into reading order, decor-only
     depth elements disappear, and leader lines are not drawn — never
     scale-shrink a composition onto a phone.
-->
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(meta.title)}</title>
<link rel="stylesheet" href="design-theme.css" />
<style>
  .composition {
    position: relative;
    width: min(100%, ${width}px);
    aspect-ratio: ${width} / ${height};
    margin: 0 auto;
    background: var(--design-bg);
    overflow: hidden;
  }
  .composition .el { position: absolute; display: flex; flex-direction: column; justify-content: center; padding: 1.2%; box-sizing: border-box; }
  .composition .el img, .composition .el svg.fill-media { width: 100%; height: 100%; object-fit: cover; border-radius: var(--design-radius); position: absolute; inset: 0; z-index: -1; }
  .composition .el.cutout img { object-fit: contain; border-radius: 0; }
  .composition .el.mask-circle img, .composition .el.mask-circle { border-radius: 50%; }
  .composition .surface-solid { background: var(--design-surface); border: 1px solid var(--design-border); border-radius: var(--design-radius); box-shadow: 0 12px 32px rgba(15,15,20,0.10); }
  .composition .surface-glass { background: color-mix(in srgb, var(--design-surface) 62%, transparent); backdrop-filter: blur(14px); border: 1px solid color-mix(in srgb, var(--design-surface) 70%, transparent); border-radius: var(--design-radius); }
  .composition .surface-outline { border: 2px solid var(--design-border); border-radius: var(--design-radius); }
  .composition h2 { margin: 0; font-family: var(--design-font-display); line-height: 1.05; letter-spacing: -0.02em; }
  .composition h2.fill { font-size: clamp(28px, 8vw, 150px); }
  .composition p { margin: 0.4em 0 0; color: var(--design-muted); font-size: 15px; }
  .composition .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--design-muted); }
  .composition .value { font-size: 28px; font-weight: 700; font-family: var(--design-font-display); }
  .composition ul { margin: 0.4em 0 0; padding-left: 1.1em; font-size: 14px; }
  .composition svg.viz { width: 100%; height: 100%; }
  .composition svg.leaders { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 60; pointer-events: none; }

  /* Below 760px the composition linearizes — reading order, no absolute
     geometry, no leader lines, no pure-depth decor. */
  @media (max-width: 760px) {
    .composition { aspect-ratio: auto; overflow: visible; padding: 12px 0 24px; }
    .composition .el {
      position: static; width: auto !important; height: auto !important;
      margin: 14px 5%; transform: none !important; min-height: 0;
    }
    .composition .el img, .composition .el svg.fill-media { position: static; height: auto; max-height: 320px; z-index: 0; }
    .composition .el.decor, .composition svg.leaders { display: none; }
    .composition h2.fill { font-size: clamp(40px, 13vw, 72px); }
  }
</style>
</head>
<body>
<main class="composition" aria-label="${esc(meta.title)}">
${body.join('\n')}
  <svg class="leaders" aria-hidden="true"></svg>
</main>
<script>
  // Leader lines drawn from LIVE geometry — annotations stay attached to
  // their anchors through any resize; skipped when the layout linearizes.
  (function () {
    var svg = document.querySelector('.composition svg.leaders');
    var canvas = document.querySelector('.composition');
    if (!svg || !canvas) return;
    function draw() {
      if (window.matchMedia('(max-width: 760px)').matches) { svg.innerHTML = ''; return; }
      var box = canvas.getBoundingClientRect();
      svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
      var parts = [];
      document.querySelectorAll('[data-anchor-target]').forEach(function (el) {
        var target = document.querySelector('[data-id="' + el.getAttribute('data-anchor-target') + '"]');
        if (!target) return;
        var at = (el.getAttribute('data-anchor-at') || '50,50').split(',');
        var t = target.getBoundingClientRect();
        var s = el.getBoundingClientRect();
        var ax = t.left - box.left + (parseFloat(at[0]) / 100) * t.width;
        var ay = t.top - box.top + (parseFloat(at[1]) / 100) * t.height;
        var sx = s.left - box.left + s.width / 2;
        var sy = s.top - box.top + s.height / 2;
        parts.push('<line x1="' + ax + '" y1="' + ay + '" x2="' + sx + '" y2="' + sy + '" stroke="var(--design-primary-strong)" stroke-width="2" opacity="0.85"/>');
        parts.push('<circle cx="' + ax + '" cy="' + ay + '" r="5" fill="var(--design-primary-strong)"/>');
      });
      svg.innerHTML = parts.join('');
    }
    window.addEventListener('resize', draw);
    window.addEventListener('load', draw);
    draw();
  })();
</script>
</body>
</html>
`;
}
