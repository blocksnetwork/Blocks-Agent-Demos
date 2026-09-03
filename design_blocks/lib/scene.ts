/**
 * Scene renderer: resolved composition in, full-page comp PNG out.
 *
 * satori + resvg, same stack as the style tiles — but where the tile
 * had a fixed arrangement, this renderer has NONE: every element is
 * painted exactly at its resolved frame, in resolved paint order, with
 * rotation, bleeds, scrims, ring arcs, and leader lines computed from
 * the spec. Rendering an empty spec produces an empty page — that is
 * the anti-template contract.
 *
 * Depth is real: encircles-rings are split into a back arc (painted
 * before their target) and a front arc (after it), so wrapping reads as
 * wrapping instead of a sticker. Data-viz elements carry their own
 * drawing program (VizPrimitive[]) which is rendered here as inline SVG
 * — generic stat cards cannot appear unless the spec literally asks for
 * panels in a row.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

import type { CompElement, CompositionSpec, VizPrimitive } from './composition.js';
import type { ResolvedElement, ResolvedLayout } from './resolve.js';
import type { DesignTokens } from './tokens.js';
import { loadFonts, type SatoriFont } from './fonts.js';

export type SceneAsset = { uri: string; cutout: boolean };
/** elementId -> rendered imagery */
export type SceneAssets = Map<string, SceneAsset>;

type El = { type: string; props: Record<string, unknown> };
type Child = El | string;

function el(type: string, style: Record<string, unknown>, ...children: Child[]): El {
  const kids: Child[] | Child | undefined =
    children.length === 0 ? undefined : children.length === 1 ? children[0] : children;
  const needsFlex = Array.isArray(kids) || (kids !== undefined && typeof kids !== 'string');
  return {
    type,
    props: {
      style: needsFlex && !('display' in style) ? { display: 'flex', ...style } : style,
      children: kids,
    },
  };
}

function img(src: string, style: Record<string, unknown>): El {
  return { type: 'img', props: { src, style } };
}

function svgUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function roleColor(role: string | undefined, t: DesignTokens): string {
  switch (role) {
    case 'accent': return t.primaryStrong;
    case 'primary': return t.primary;
    case 'ink': return t.text;
    case 'neutral': return t.muted;
    case 'surface': return t.surface;
    default: return t.text;
  }
}

function surfaceStyle(
  surface: string | undefined,
  t: DesignTokens,
  emphasis: number,
): Record<string, unknown> {
  const radius = parseInt(t.radius, 10) || 10;
  switch (surface) {
    case 'solid':
      return {
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: radius,
        boxShadow: `0 ${8 + emphasis * 16}px ${24 + emphasis * 24}px rgba(15,15,20,${0.08 + emphasis * 0.08})`,
      };
    case 'glass':
      return {
        background: 'rgba(255,255,255,0.62)',
        border: '1px solid rgba(255,255,255,0.7)',
        borderRadius: radius,
        boxShadow: '0 10px 30px rgba(15,15,20,0.12)',
      };
    case 'outline':
      return { border: `2px solid ${t.border}`, borderRadius: radius };
    default:
      return {};
  }
}

/* ------------------------------------------------------------------ */
/* viz primitive SVG                                                   */
/* ------------------------------------------------------------------ */

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy + r * Math.sin(rad(endDeg));
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function numbers(params: Record<string, unknown>, key: string, fallback: number[]): number[] {
  const v = params[key];
  const clean = Array.isArray(v)
    ? v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0).slice(0, 16)
    : [];
  return clean.length > 1 && clean.some((n) => n > 0) ? clean : fallback;
}

function escSvg(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function vizSvg(
  primitive: VizPrimitive,
  w: number,
  h: number,
  t: DesignTokens,
  values?: Array<{ label: string; value: string }>,
): string {
  const accent = t.primaryStrong;
  const primary = t.primary;
  const track = t.border;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  const close = '</svg>';

  switch (primitive.primitive) {
    case 'ringSegment': {
      const fractionRaw = Number(primitive.params.fraction);
      const fraction = Number.isFinite(fractionRaw) ? Math.max(0.05, Math.min(1, fractionRaw)) : 0.72;
      const r = Math.min(w, h) / 2 - 10;
      const thickness = Math.max(6, r * 0.16);
      return [
        open,
        `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${thickness}" opacity="0.5"/>`,
        `<path d="${arcPath(w / 2, h / 2, r, 0, Math.min(359.9, fraction * 360))}" fill="none" stroke="${primary}" stroke-width="${thickness}" stroke-linecap="round"/>`,
        close,
      ].join('');
    }
    case 'barColumn': {
      const data = numbers(primitive.params, 'values', [42, 68, 55, 81, 47]);
      const max = Math.max(Math.max(...data), 1); // numbers() guarantees a positive entry; belt and braces
      const gap = Math.min(w * 0.04, w / (data.length * 4));
      const barW = Math.max(2, (w - gap * (data.length - 1)) / data.length);
      const labelsIn = primitive.params.labelsInBars !== false;
      const bars = data.map((v, i) => {
        const barH = Math.max(8, (v / max) * (h - 8));
        const x = i * (barW + gap);
        const y = h - barH;
        const label = values?.[i]?.label ?? '';
        return (
          `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="${Math.min(8, barW * 0.18)}" fill="${i === data.indexOf(max) ? primary : accent}" opacity="${0.55 + 0.45 * (v / max)}"/>` +
          (labelsIn && label && barH > 34
            ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(h - 10).toFixed(1)}" text-anchor="middle" font-size="${Math.min(13, barW * 0.3)}" fill="#ffffff" font-family="sans-serif">${escSvg(label.slice(0, 8))}</text>`
            : '')
        );
      });
      return open + bars.join('') + close;
    }
    case 'sparkline': {
      const data = numbers(primitive.params, 'values', [30, 44, 38, 62, 55, 74, 70, 88]);
      const max = Math.max(...data);
      const min = Math.min(...data);
      const span = max - min || 1;
      const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * (w - 8) + 4;
        const y = h - 6 - ((v - min) / span) * (h - 14);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      return [
        open,
        `<polyline points="${points.join(' ')} ${w - 4},${h - 2} 4,${h - 2}" fill="${primary}" opacity="0.12"/>`,
        `<polyline points="${points.join(' ')}" fill="none" stroke="${primary}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
        `<circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="4.5" fill="${accent}"/>`,
        close,
      ].join('');
    }
    case 'dotField': {
      const countRaw = Number(primitive.params.count);
      const count = Number.isFinite(countRaw) ? Math.max(6, Math.min(120, Math.round(countRaw))) : 48;
      const activeRaw = Number(primitive.params.activeFraction);
      const active = Number.isFinite(activeRaw) ? Math.max(0, Math.min(1, activeRaw)) : 0.6;
      const cols = Math.ceil(Math.sqrt((count * w) / h));
      const rows = Math.ceil(count / cols);
      const dots: string[] = [];
      for (let i = 0; i < count; i++) {
        const cx = ((i % cols) + 0.5) * (w / cols);
        const cy = (Math.floor(i / cols) + 0.5) * (h / rows);
        dots.push(
          `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.min(w / cols, h / rows) * 0.24}" fill="${i < count * active ? primary : track}"/>`,
        );
      }
      return open + dots.join('') + close;
    }
    case 'flowLine': {
      const nodesRaw = Number(primitive.params.points);
      const nodes = Number.isFinite(nodesRaw) ? Math.max(2, Math.min(8, Math.round(nodesRaw))) : 4;
      const stops: string[] = [];
      const dots: string[] = [];
      for (let i = 0; i < nodes; i++) {
        const x = 8 + (i / (nodes - 1)) * (w - 16);
        const y = h / 2 + Math.sin(i * 1.4) * h * 0.22;
        stops.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
        dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${i === nodes - 1 ? accent : primary}"/>`);
      }
      return [
        open,
        `<path d="${stops.join(' ')}" fill="none" stroke="${track}" stroke-width="2.5" stroke-dasharray="1 7" stroke-linecap="round"/>`,
        dots.join(''),
        close,
      ].join('');
    }
    case 'leaderCallout':
      // the callout box is rendered as satori content; the line lives on
      // the leader overlay — nothing to draw here.
      return `${open}${close}`;
  }
}

/* ------------------------------------------------------------------ */
/* element rendering                                                   */
/* ------------------------------------------------------------------ */

function fillFontSize(text: string, w: number, h: number): number {
  const lines = text.split('\n');
  const longest = Math.max(...lines.map((line) => line.length), 1);
  return Math.max(18, Math.min(240, Math.min((h * 0.72) / lines.length, (w * 1.72) / longest)));
}

/**
 * The same viz drawing program as inline SVG for composition.html —
 * one source of truth for what the visualization looks like.
 */
export function vizSvgForElement(
  element: CompElement,
  w: number,
  h: number,
  tokens: DesignTokens,
): string | null {
  if (!element.viz) return null;
  const drawable = element.viz.render.filter((p) => p.primitive !== 'leaderCallout');
  if (drawable.length === 0) return null;
  return vizSvg(drawable[0], w, h, tokens, element.viz.values).replace('<svg ', '<svg class="viz" ');
}

function textContent(resolved: ResolvedElement, t: DesignTokens): Child[] {
  const { element } = resolved;
  const content = element.content ?? {};
  const color = roleColor(element.style?.paletteRole ?? 'ink', t);
  const emphasis = element.style?.emphasis ?? 0.5;
  const out: Child[] = [];

  if (content.heading) {
    const fill = content.fit === 'fill';
    out.push(
      el(
        'div',
        {
          fontFamily: t.fonts.display,
          fontWeight: 700,
          color,
          fontSize: fill ? fillFontSize(content.heading, resolved.w, resolved.h) : Math.round(20 + emphasis * 34),
          lineHeight: 1.04,
          letterSpacing: -1,
          // a wrapped heading must keep its full height — Yoga would
          // otherwise shrink it and the body would draw over line two
          flexShrink: 0,
          // declared line breaks in fill headings are design decisions
          ...(fill ? { whiteSpace: 'pre-line' } : {}),
        },
        content.heading,
      ),
    );
  }
  if (content.body) {
    out.push(
      el(
        'div',
        { fontSize: 16, color: t.muted, lineHeight: 1.55, marginTop: content.heading ? 10 : 0, flexShrink: 0 },
        content.body,
      ),
    );
  }
  if (content.label || content.value) {
    out.push(
      el(
        'div',
        { flexDirection: 'column', marginTop: 6, flexShrink: 0 },
        ...(content.label
          ? [el('div', { fontSize: 12, color: t.muted, textTransform: 'uppercase', letterSpacing: 1.6 }, content.label)]
          : []),
        ...(content.value
          ? [el('div', { fontSize: Math.min(34, resolved.h * 0.42), fontWeight: 700, fontFamily: t.fonts.display, color: t.text, marginTop: 2 }, content.value)]
          : []),
      ),
    );
  }
  if (content.items?.length) {
    out.push(
      el(
        'div',
        { flexDirection: 'column', marginTop: 8, flexShrink: 0 },
        ...content.items.slice(0, 6).map((item, i) =>
          el(
            'div',
            { alignItems: 'center', marginTop: i === 0 ? 0 : 6 },
            el('div', { width: 7, height: 7, borderRadius: 4, background: t.primary, marginRight: 10, flexShrink: 0 }),
            el('div', { fontSize: 14, color: t.text }, item),
          ),
        ),
      ),
    );
  }
  return out;
}

function seedHash(text: string): number {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash;
}

/**
 * Procedural placeholder imagery — SEEDED per element, so a texture, a
 * subject, and an atmosphere band on the same page never render as the
 * same gradient twice. Three families (gradient blob / organic strokes /
 * dot texture) chosen by the element's subject+id hash, colors rotated
 * through the palette by the same seed. Exported so composition.html
 * can inline the exact SVG the preview showed.
 */
export function proceduralImageSvg(
  w: number,
  h: number,
  palette: string[],
  opts: { circle?: boolean; seed?: string } = {},
): string {
  const hash = seedHash(opts.seed ?? 'default');
  const pick = (i: number) => palette[(hash + i) % Math.max(1, palette.length)] ?? '#4f46e5';
  const [a, b, c] = [pick(0), pick(2), pick(1)];
  const family = hash % 3;
  const clip = opts.circle
    ? `<clipPath id="c${hash}"><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2}"/></clipPath>`
    : '';
  const wrap = (inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g${hash}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></linearGradient>${clip}</defs>` +
    (opts.circle ? `<g clip-path="url(#c${hash})">` : '') +
    inner +
    (opts.circle ? `</g>` : '') +
    `</svg>`;

  const base = `<rect width="${w}" height="${h}" fill="url(#g${hash})"/>`;
  if (family === 1) {
    // organic strokes — leaf-vein-ish curves fanning from one corner
    const strokes: string[] = [];
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x0 = w * (0.1 + 0.05 * ((hash >> i) % 3));
      const y0 = h * (0.9 - 0.06 * i);
      strokes.push(
        `<path d="M ${x0} ${y0} Q ${w * (0.3 + t * 0.3)} ${h * (0.55 - t * 0.3)} ${w * (0.55 + t * 0.45)} ${h * (0.35 - t * 0.3)}"` +
          ` fill="none" stroke="${c}" stroke-width="${2 + (i % 3)}" opacity="${0.18 + t * 0.2}" stroke-linecap="round"/>`,
      );
    }
    return wrap(base + strokes.join(''));
  }
  if (family === 2) {
    // dot texture — irregular field, density from the seed
    const dots: string[] = [];
    const count = 40 + (hash % 30);
    for (let i = 0; i < count; i++) {
      const dx = ((hash * (i + 3)) % 997) / 997;
      const dy = ((hash * (i + 7)) % 1009) / 1009;
      dots.push(
        `<circle cx="${(dx * w).toFixed(0)}" cy="${(dy * h).toFixed(0)}" r="${1.5 + ((hash + i) % 4)}" fill="${c}" opacity="${0.1 + ((i % 5) * 0.05)}"/>`,
      );
    }
    return wrap(base + dots.join(''));
  }
  // gradient blobs (default family)
  return wrap(
    base +
      `<circle cx="${w * (0.6 + (hash % 30) / 100)}" cy="${h * (0.2 + (hash % 40) / 100)}" r="${Math.min(w, h) * 0.28}" fill="${c}" opacity="0.22"/>` +
      `<circle cx="${w * (0.15 + (hash % 20) / 100)}" cy="${h * 0.75}" r="${Math.min(w, h) * 0.18}" fill="#ffffff" opacity="0.10"/>`,
  );
}

function renderElement(
  resolved: ResolvedElement,
  t: DesignTokens,
  palette: string[],
  assets: SceneAssets,
  annotate: boolean,
): El {
  const { element } = resolved;
  const emphasis = element.style?.emphasis ?? 0.4;
  const radius = parseInt(t.radius, 10) || 10;
  const surface = resolved.legibilityFix ?? element.style?.surface;

  const wrapper: Record<string, unknown> = {
    position: 'absolute',
    left: Math.round(resolved.x),
    top: Math.round(resolved.y),
    width: Math.round(resolved.w),
    height: Math.round(resolved.h),
    flexDirection: 'column',
    ...(element.rotation ? { transform: `rotate(${element.rotation}deg)` } : {}),
    ...(annotate ? { border: '1px dashed #ff0055' } : {}),
  };

  const inner: Child[] = [];

  if (element.kind === 'image' || element.imagery) {
    const asset = assets.get(element.id);
    const uri =
      asset?.uri ??
      svgUri(
        proceduralImageSvg(Math.round(resolved.w), Math.round(resolved.h), palette, {
          circle: element.imagery?.mask === 'circle',
          seed: `${element.id}:${element.imagery?.subject ?? element.role}`,
        }),
      );
    inner.push(
      img(uri, {
        position: 'absolute',
        top: 0,
        left: 0,
        width: Math.round(resolved.w),
        height: Math.round(resolved.h),
        objectFit: asset?.cutout ? 'contain' : 'cover',
        ...(element.imagery?.mask === 'circle'
          ? { borderRadius: Math.round(Math.min(resolved.w, resolved.h) / 2) }
          : element.imagery?.integration === 'bleed' || asset?.cutout
            ? {}
            : { borderRadius: radius }),
      }),
    );
  }

  if (element.kind === 'viz' && element.viz) {
    // one primitive per viz element — the same one composition.html
    // inlines (vizSvgForElement), so preview and handoff cannot diverge
    const drawable = element.viz.render.filter((p) => p.primitive !== 'leaderCallout');
    for (const primitive of drawable.slice(0, 1)) {
      inner.push(
        img(svgUri(vizSvg(primitive, Math.round(resolved.w), Math.round(resolved.h), t, element.viz.values)), {
          position: 'absolute',
          top: 0,
          left: 0,
          width: Math.round(resolved.w),
          height: Math.round(resolved.h),
        }),
      );
    }
    // callout chip / center label for ring metrics
    const isCallout = element.viz.render.some((p) => p.primitive === 'leaderCallout');
    const value = element.viz.values?.[0] ?? (element.content?.value ? { label: element.content.label ?? '', value: element.content.value } : undefined);
    if (isCallout || (value && drawable.some((p) => p.primitive === 'ringSegment'))) {
      inner.push(
        el(
          'div',
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: Math.round(resolved.w),
            height: Math.round(resolved.h),
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
          },
          ...(value
            ? [
                el('div', { fontSize: Math.min(30, resolved.h * 0.3), fontWeight: 700, fontFamily: t.fonts.display, color: t.text }, value.value || '—'),
                el('div', { fontSize: 12, color: t.muted, textTransform: 'uppercase', letterSpacing: 1.4, marginTop: 2 }, value.label.slice(0, 24)),
              ]
            : []),
        ),
      );
    }
  }

  if (element.kind === 'shape') {
    inner.push(
      el('div', {
        position: 'absolute',
        top: 0,
        left: 0,
        width: Math.round(resolved.w),
        height: Math.round(resolved.h),
        background: roleColor(element.style?.paletteRole ?? 'primary', t),
        opacity: 0.25 + emphasis * 0.5,
        borderRadius: element.imagery?.mask === 'circle' ? Math.round(Math.min(resolved.w, resolved.h) / 2) : radius,
      }),
    );
  }

  const texts = element.kind !== 'viz' ? textContent(resolved, t) : [];
  if (texts.length) {
    const pad = Math.max(10, Math.min(28, Math.min(resolved.w, resolved.h) * 0.07));
    inner.push(
      el(
        'div',
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: Math.round(resolved.w),
          height: Math.round(resolved.h),
          flexDirection: 'column',
          justifyContent: element.kind === 'text' ? 'center' : 'flex-start',
          padding: pad,
          overflow: 'hidden',
        },
        ...texts,
      ),
    );
  }

  if (annotate) {
    inner.push(
      el(
        'div',
        {
          position: 'absolute',
          top: 0,
          left: 0,
          background: '#ff0055',
          color: '#ffffff',
          fontSize: 13,
          padding: '1px 6px',
        },
        `${element.id} z${element.z}`,
      ),
    );
  }

  const surfaceCss =
    element.kind === 'panel' || element.kind === 'group' || surface
      ? surfaceStyle(surface ?? (element.kind === 'panel' ? 'solid' : undefined), t, emphasis)
      : {};

  return el('div', { ...wrapper, ...surfaceCss, overflow: element.kind === 'panel' ? 'hidden' : 'visible' }, ...inner);
}

/* ------------------------------------------------------------------ */
/* ring arcs + leader overlay                                          */
/* ------------------------------------------------------------------ */

function ringArcSvg(
  canvasW: number,
  canvasH: number,
  ring: { cx: number; cy: number; r: number; thickness: number },
  half: 'back' | 'front',
  t: DesignTokens,
): string {
  // back = top half (behind the subject), front = bottom half (over it):
  // the split is what makes the wrap read as depth.
  const [start, end] = half === 'back' ? [268, 92] : [92, 268];
  const path = half === 'back'
    ? arcPath(ring.cx, ring.cy, ring.r, start - 360, end)
    : arcPath(ring.cx, ring.cy, ring.r, start, end);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">` +
    `<path d="${path}" fill="none" stroke="${half === 'front' ? t.primary : t.border}" stroke-width="${ring.thickness}" stroke-linecap="round" ${half === 'back' ? 'opacity="0.55"' : ''}/>` +
    `</svg>`
  );
}

function leaderOverlaySvg(canvasW: number, canvasH: number, layout: ResolvedLayout, t: DesignTokens): string | null {
  const lines: string[] = [];
  for (const resolved of layout.elements) {
    if (!resolved.attachPoint) continue;
    const anchor = resolved.attachPoint;
    // connect the anchor to the nearest edge midpoint of the callout box
    const candidates = [
      { x: resolved.x, y: resolved.y + resolved.h / 2 },
      { x: resolved.x + resolved.w, y: resolved.y + resolved.h / 2 },
      { x: resolved.x + resolved.w / 2, y: resolved.y },
      { x: resolved.x + resolved.w / 2, y: resolved.y + resolved.h },
    ];
    const edge = candidates.reduce((best, c) =>
      Math.hypot(c.x - anchor.x, c.y - anchor.y) < Math.hypot(best.x - anchor.x, best.y - anchor.y) ? c : best,
    );
    const midX = (anchor.x + edge.x) / 2;
    lines.push(
      `<path d="M ${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)} Q ${midX.toFixed(1)} ${anchor.y.toFixed(1)} ${edge.x.toFixed(1)} ${edge.y.toFixed(1)}" fill="none" stroke="${t.primaryStrong}" stroke-width="2"/>`,
      `<circle cx="${anchor.x.toFixed(1)}" cy="${anchor.y.toFixed(1)}" r="5.5" fill="${t.primaryStrong}"/>`,
      `<circle cx="${anchor.x.toFixed(1)}" cy="${anchor.y.toFixed(1)}" r="9.5" fill="none" stroke="${t.primaryStrong}" stroke-width="1.5" opacity="0.45"/>`,
    );
  }
  if (lines.length === 0) return null;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">` +
    lines.join('') +
    `</svg>`
  );
}

/* ------------------------------------------------------------------ */
/* scene assembly                                                      */
/* ------------------------------------------------------------------ */

export async function renderScene(
  spec: CompositionSpec,
  layout: ResolvedLayout,
  tokens: DesignTokens,
  palette: string[],
  assets: SceneAssets,
  opts: { annotate?: boolean } = {},
): Promise<{ png: Uint8Array; svg: string } | null> {
  const fonts = await loadFonts(tokens.fonts.display, tokens.fonts.body);
  if (!fonts) return null;

  const { width, height } = layout.canvas;
  const items: Array<{ order: number; node: El }> = [];

  layout.elements.forEach((resolved, index) => {
    const order = index * 10;
    if (resolved.ring) {
      const targetRelation = resolved.element.relations.find((r) => r.type === 'encircles');
      const targetIndex = targetRelation && 'target' in targetRelation
        ? layout.elements.findIndex((e) => e.element.id === targetRelation.target)
        : -1;
      const anchorOrder = targetIndex >= 0 ? targetIndex * 10 : order;
      items.push({
        order: anchorOrder - 5,
        node: img(svgUri(ringArcSvg(width, height, resolved.ring, 'back', tokens)), {
          position: 'absolute', top: 0, left: 0, width, height,
        }),
      });
      items.push({
        order: anchorOrder + 5,
        node: img(svgUri(ringArcSvg(width, height, resolved.ring, 'front', tokens)), {
          position: 'absolute', top: 0, left: 0, width, height,
        }),
      });
      // the ring element may still carry a center label — ONLY the label
      // chip renders here; re-running renderElement would repaint the
      // ring's own viz program over the split arcs
      const ringValue =
        resolved.element.viz?.values?.[0] ??
        (resolved.element.content?.value
          ? { label: resolved.element.content.label ?? '', value: resolved.element.content.value }
          : undefined);
      if (ringValue) {
        items.push({
          order: anchorOrder + 6,
          node: el(
            'div',
            {
              position: 'absolute',
              left: Math.round(resolved.x),
              top: Math.round(resolved.y),
              width: Math.round(resolved.w),
              height: Math.round(resolved.h),
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            },
            el('div', { fontSize: Math.min(34, resolved.ring.r * 0.28), fontWeight: 700, fontFamily: tokens.fonts.display, color: tokens.text }, ringValue.value || '—'),
            el('div', { fontSize: 12, color: tokens.muted, textTransform: 'uppercase', letterSpacing: 1.4, marginTop: 2 }, ringValue.label.slice(0, 24)),
          ),
        });
      }
      return;
    }
    items.push({ order, node: renderElement(resolved, tokens, palette, assets, opts.annotate ?? false) });
  });

  const leader = leaderOverlaySvg(width, height, layout, tokens);
  if (leader) {
    items.push({
      order: Number.MAX_SAFE_INTEGER,
      node: img(svgUri(leader), { position: 'absolute', top: 0, left: 0, width, height }),
    });
  }

  items.sort((a, b) => a.order - b.order);

  const tree = el(
    'div',
    {
      position: 'relative',
      width,
      height,
      background: tokens.bg,
      fontFamily: tokens.fonts.body,
      color: tokens.text,
      overflow: 'hidden',
    },
    ...items.map((i) => i.node),
  );

  try {
    const svg = await satori(tree as never, { width, height, fonts: fonts as SatoriFont[] } as never);
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
    return { png, svg };
  } catch (err) {
    console.error(`[design-blocks] scene render failed: ${(err as Error).message}`);
    return null;
  }
}
