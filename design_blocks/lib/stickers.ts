/**
 * Component assets — the floating stat chips, sticker badges, tag pills,
 * and mini-cards that give reference-grade pages their layered, produced
 * look. Rendered per-brief with satori in the direction's real fonts and
 * palette, delivered as SVG (scalable, animatable) with a PNG for
 * embedding into the comps.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

import type { DirectionSpec } from './directions.js';
import type { FloatingElement } from './pagespec.js';
import { loadFonts, type SatoriFont } from './fonts.js';

export type Sticker = { kind: FloatingElement['kind']; text: string; svg: string; png: Uint8Array; width: number; height: number };

type El = { type: string; props: Record<string, unknown> };

function el(type: string, style: Record<string, unknown>, ...children: Array<El | string>): El {
  const kids = children.length === 0 ? undefined : children.length === 1 ? children[0] : children;
  const needsFlex = Array.isArray(kids) || (kids !== undefined && typeof kids !== 'string');
  return {
    type,
    props: { style: needsFlex && !('display' in style) ? { display: 'flex', ...style } : style, children: kids },
  };
}

const SHADOW = '0 12px 32px rgba(15, 15, 20, 0.14)';

function statChip(spec: DirectionSpec, item: FloatingElement): { tree: El; w: number; h: number } {
  const t = spec.tokens;
  return {
    w: 220,
    h: 96,
    tree: el(
      'div',
      {
        width: 220,
        height: 96,
        background: t.surface,
        borderRadius: 18,
        boxShadow: SHADOW,
        padding: '16px 20px',
        flexDirection: 'column',
        justifyContent: 'center',
        fontFamily: t.fonts.body,
        border: `1px solid ${t.border}`,
      },
      el('div', { fontSize: 13, color: t.muted, textTransform: 'uppercase', letterSpacing: 1.5 }, item.text),
      el(
        'div',
        { alignItems: 'baseline', marginTop: 4 },
        el('div', { fontSize: 30, fontWeight: 700, fontFamily: t.fonts.display, color: t.text }, item.value ?? '24'),
        el('div', { fontSize: 14, fontWeight: 700, color: t.primaryStrong, marginLeft: 10 }, '▲'),
      ),
    ),
  };
}

function badge(spec: DirectionSpec, item: FloatingElement): { tree: El; w: number; h: number } {
  const t = spec.tokens;
  return {
    w: 180,
    h: 64,
    tree: el(
      'div',
      { width: 180, height: 64, flexDirection: 'column', alignItems: 'flex-start' },
      el(
        'div',
        {
          background: t.text,
          color: t.bg,
          fontSize: 20,
          fontWeight: 700,
          fontFamily: t.fonts.body,
          padding: '10px 22px',
          borderRadius: 999,
          boxShadow: SHADOW,
        },
        item.text,
      ),
      // Speech-bubble tail.
      el('div', {
        width: 0,
        height: 0,
        borderLeft: '10px solid transparent',
        borderRight: '4px solid transparent',
        borderTop: `12px solid ${spec.tokens.text}`,
        marginLeft: 26,
      }),
    ),
  };
}

function tagPill(spec: DirectionSpec, item: FloatingElement): { tree: El; w: number; h: number } {
  const t = spec.tokens;
  return {
    w: 150,
    h: 48,
    tree: el(
      'div',
      {
        width: 150,
        height: 48,
        background: t.primary,
        color: t.primaryText,
        fontSize: 17,
        fontWeight: 700,
        fontFamily: t.fonts.body,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: SHADOW,
      },
      item.text,
    ),
  };
}

function miniCard(spec: DirectionSpec, item: FloatingElement): { tree: El; w: number; h: number } {
  const t = spec.tokens;
  return {
    w: 250,
    h: 84,
    tree: el(
      'div',
      {
        width: 250,
        height: 84,
        background: t.surface,
        borderRadius: 16,
        boxShadow: SHADOW,
        border: `1px solid ${t.border}`,
        padding: '14px 16px',
        alignItems: 'center',
        fontFamily: t.fonts.body,
      },
      el('div', {
        width: 40,
        height: 40,
        borderRadius: 12,
        background: t.primary,
        opacity: 0.9,
        marginRight: 14,
      }),
      el(
        'div',
        { flexDirection: 'column' },
        el('div', { fontSize: 16, fontWeight: 700, color: t.text }, item.text),
        el('div', { fontSize: 13, color: t.muted, marginTop: 2 }, item.value ?? 'just now'),
      ),
    ),
  };
}

const BUILDERS = { stat: statChip, badge, tag: tagPill, mini: miniCard } as const;

async function renderOne(
  spec: DirectionSpec,
  item: FloatingElement,
  fonts: SatoriFont[],
): Promise<Sticker | null> {
  try {
    const { tree, w, h } = BUILDERS[item.kind](spec, item);
    const svg = await satori(tree as never, { width: w, height: h, fonts } as never);
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: w * 2 } }).render().asPng();
    return { kind: item.kind, text: item.text, svg, png, width: w, height: h };
  } catch (err) {
    console.error(`[design-blocks] sticker render failed (${item.kind}): ${(err as Error).message}`);
    return null;
  }
}

export async function renderStickers(spec: DirectionSpec, floating: FloatingElement[]): Promise<Sticker[]> {
  const fonts = await loadFonts(spec.tokens.fonts.display, spec.tokens.fonts.body);
  if (!fonts) return [];
  const rendered = await Promise.all(floating.slice(0, 5).map((item) => renderOne(spec, item, fonts)));
  return rendered.filter((s): s is Sticker => s !== null);
}
