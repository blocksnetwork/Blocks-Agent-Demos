/**
 * Style-tile rendering: satori lays the comp out (real text shaping, real
 * fonts) as SVG, resvg rasterizes it to PNG — the @vercel/og stack, no
 * browser anywhere. One tile per direction: hero band, type specimen,
 * hex-labeled palette, UI samples. All copy is composited here; the
 * diffusion model never draws a letter.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

import type { DirectionSpec } from './directions.js';
import { contrastRatio, parseColor } from './color.js';
import { loadFonts, type SatoriFont } from './fonts.js';

export const TILE_W = 1200;
export const TILE_H = 1500;

type El = { type: string; props: Record<string, unknown> };
type Child = El | string;

/**
 * Satori demands display:flex on any node with array children; this
 * helper makes forgetting that structurally impossible.
 */
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

function labelColor(hex: string): string {
  const rgba = parseColor(hex);
  if (!rgba) return '#ffffff';
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const ink = { r: 26, g: 26, b: 26, a: 1 };
  return contrastRatio(white, rgba) >= contrastRatio(ink, rgba) ? '#ffffff' : '#1a1a1a';
}

type StickerUri = { uri: string; width: number; height: number };

function tileTree(spec: DirectionSpec, heroDataUri: string, briefLine: string, stickerUris: StickerUri[]): El {
  const t = spec.tokens;
  const display = t.fonts.display;
  const body = t.fonts.body;

  return el(
    'div',
    { flexDirection: 'column', width: TILE_W, height: TILE_H, background: t.bg, color: t.text, fontFamily: body },
    // Header: name + axis + adjectives
    el(
      'div',
      { flexDirection: 'column', padding: '28px 40px 20px' },
      el(
        'div',
        { alignItems: 'center', justifyContent: 'space-between' },
        el('div', { fontFamily: display, fontSize: 40, fontWeight: 700 }, spec.name),
        el(
          'div',
          {
            fontSize: 15,
            fontWeight: 700,
            color: t.primaryText,
            background: t.primary,
            padding: '6px 16px',
            borderRadius: 999,
            textTransform: 'uppercase',
            letterSpacing: 2,
          },
          spec.axis,
        ),
      ),
      el('div', { fontSize: 18, color: t.muted, marginTop: 6 }, spec.adjectives.join(' · ')),
    ),
    // Hero band, with sticker assets floating over it like the real page will have
    el(
      'div',
      { position: 'relative', width: TILE_W, height: 520 },
      img(heroDataUri, { width: TILE_W, height: 520, objectFit: 'cover', position: 'absolute', top: 0, left: 0 }),
      ...stickerUris.slice(0, 2).map((sticker, i) =>
        img(sticker.uri, {
          position: 'absolute',
          width: sticker.width,
          height: sticker.height,
          top: i === 0 ? 64 : 320,
          left: i === 0 ? TILE_W - sticker.width - 70 : 56,
          ...(spec.genome.tilt ? { transform: `rotate(${i === 0 ? -4 : 3}deg)` } : {}),
        }),
      ),
    ),
    // Type specimen
    el(
      'div',
      { flexDirection: 'column', padding: '30px 40px 8px' },
      el('div', { fontFamily: display, fontSize: 62, fontWeight: 700, lineHeight: 1.1 }, briefLine),
      el(
        'div',
        { fontSize: 17, color: t.muted, lineHeight: 1.6, marginTop: 14, maxWidth: 980 },
        'Body text sits in ' + body + ' at a calm 1.6 leading, with ' + display + ' carrying the display voice. ' +
          spec.layoutNote,
      ),
      el(
        'div',
        { fontSize: 13, color: t.muted, marginTop: 10, textTransform: 'uppercase', letterSpacing: 2 },
        display + ' 700 · ' + body + ' 400',
      ),
    ),
    // Palette row
    el(
      'div',
      { padding: '22px 40px 0' },
      ...spec.palette.slice(0, 5).map((hex) =>
        el(
          'div',
          {
            flexGrow: 1,
            height: 120,
            background: hex,
            alignItems: 'flex-end',
            padding: 10,
            marginRight: 8,
            borderRadius: 10,
          },
          el('div', { fontSize: 15, fontWeight: 700, color: labelColor(hex) }, hex.toUpperCase()),
        ),
      ),
    ),
    // UI row: button, secondary, input
    el(
      'div',
      { padding: '26px 40px 0', alignItems: 'center' },
      el(
        'div',
        {
          background: t.primary,
          color: t.primaryText,
          fontSize: 19,
          fontWeight: 700,
          padding: '16px 34px',
          borderRadius: t.radius,
          marginRight: 18,
        },
        'Get started',
      ),
      el(
        'div',
        {
          border: '2px solid ' + t.primaryStrong,
          color: t.primaryStrong,
          fontSize: 19,
          fontWeight: 700,
          padding: '14px 34px',
          borderRadius: t.radius,
          marginRight: 18,
        },
        'Learn more',
      ),
      el(
        'div',
        {
          flexGrow: 1,
          border: '1px solid ' + t.border,
          background: t.surface,
          color: t.muted,
          fontSize: 18,
          padding: '16px 20px',
          borderRadius: t.radius,
        },
        'you@example.com',
      ),
    ),
    // Footer
    el(
      'div',
      { flexGrow: 1, alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 40px 26px' },
      el('div', { fontSize: 14, color: t.muted }, spec.anchor ? 'anchored to: ' + spec.anchor.vibe : 'no bank anchor'),
      el('div', { fontSize: 14, fontWeight: 700, color: t.muted, letterSpacing: 2 }, 'DESIGN_BLOCKS'),
    ),
  );
}

async function rasterize(tree: El, width: number, fonts: SatoriFont[]): Promise<Uint8Array> {
  const svg = await satori(tree as never, { width, height: undefined as never, fonts } as never);
  return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
}

async function rasterizeFixed(tree: El, width: number, height: number, fonts: SatoriFont[]): Promise<{ png: Uint8Array; svg: string }> {
  const svg = await satori(tree as never, { width, height, fonts } as never);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  return { png, svg };
}

export async function renderTile(
  spec: DirectionSpec,
  heroPng: Uint8Array,
  briefLine: string,
  stickers: Array<{ png: Uint8Array; width: number; height: number }> = [],
): Promise<{ png: Uint8Array; svg: string } | null> {
  const fonts = await loadFonts(spec.tokens.fonts.display, spec.tokens.fonts.body);
  if (!fonts) return null;
  const heroUri = `data:image/png;base64,${Buffer.from(heroPng).toString('base64')}`;
  const stickerUris = stickers.map((s) => ({
    uri: `data:image/png;base64,${Buffer.from(s.png).toString('base64')}`,
    width: s.width,
    height: s.height,
  }));
  try {
    return await rasterizeFixed(tileTree(spec, heroUri, briefLine, stickerUris), TILE_W, TILE_H, fonts);
  } catch (err) {
    console.error(`[design-blocks] tile render failed for ${spec.name}: ${(err as Error).message}`);
    return null;
  }
}

/** All three comps side by side with scores, winner ringed in its primary. */
export async function renderContactSheet(
  entries: Array<{ spec: DirectionSpec; tilePng: Uint8Array; score: number; winner: boolean }>,
  fontsFrom: DirectionSpec,
): Promise<Uint8Array | null> {
  const fonts = await loadFonts(fontsFrom.tokens.fonts.display, fontsFrom.tokens.fonts.body);
  if (!fonts || entries.length === 0) return null;

  const cellW = 560;
  const cellH = Math.round((cellW / TILE_W) * TILE_H);
  const tree = el(
    'div',
    { flexDirection: 'row', width: entries.length * (cellW + 24) + 24, height: cellH + 110, background: '#141414', padding: 24 },
    ...entries.map(({ spec, tilePng, score, winner }) =>
      el(
        'div',
        { flexDirection: 'column', marginRight: 24 },
        img(`data:image/png;base64,${Buffer.from(tilePng).toString('base64')}`, {
          width: cellW,
          height: cellH,
          // comps may be style tiles (1200x1500) or full-page previews
          // (1440 x variable) — crop from the top rather than distort
          objectFit: 'cover',
          objectPosition: 'top',
          borderRadius: 12,
          border: winner ? `5px solid ${spec.tokens.primary}` : '5px solid #2a2a2a',
        }),
        el(
          'div',
          { alignItems: 'center', justifyContent: 'space-between', marginTop: 12, width: cellW },
          el('div', { fontSize: 22, fontWeight: 700, color: '#fafafa' }, `${spec.name}${winner ? '  ★' : ''}`),
          el('div', { fontSize: 18, color: '#a1a1aa' }, `${spec.axis} · ${score.toFixed(2)}`),
        ),
      ),
    ),
  );

  try {
    const width = entries.length * (cellW + 24) + 24;
    const svg = await satori(tree as never, { width, height: cellH + 110, fonts } as never);
    return new Resvg(svg).render().asPng();
  } catch (err) {
    console.error(`[design-blocks] contact sheet render failed: ${(err as Error).message}`);
    return null;
  }
}

/** 1200x630 og:image — winner hero under a scrim with the headline set in the theme. */
export async function renderOgImage(
  spec: DirectionSpec,
  heroPng: Uint8Array,
  title: string,
  subtitle: string,
): Promise<Uint8Array | null> {
  const fonts = await loadFonts(spec.tokens.fonts.display, spec.tokens.fonts.body);
  if (!fonts) return null;
  const heroUri = `data:image/png;base64,${Buffer.from(heroPng).toString('base64')}`;

  const tree = el(
    'div',
    { width: 1200, height: 630, position: 'relative' },
    img(heroUri, { width: 1200, height: 630, objectFit: 'cover', position: 'absolute', top: 0, left: 0 }),
    el(
      'div',
      {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1200,
        height: 630,
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: 60,
        background: 'linear-gradient(90deg, rgba(10,10,12,0.82) 0%, rgba(10,10,12,0.35) 55%, rgba(10,10,12,0) 100%)',
      },
      el(
        'div',
        { fontFamily: spec.tokens.fonts.display, fontSize: 64, fontWeight: 700, color: '#ffffff', lineHeight: 1.1, maxWidth: 760 },
        title,
      ),
      el('div', { fontSize: 26, color: 'rgba(255,255,255,0.85)', marginTop: 16, maxWidth: 700 }, subtitle),
    ),
  );

  try {
    const svg = await satori(tree as never, { width: 1200, height: 630, fonts } as never);
    return new Resvg(svg).render().asPng();
  } catch (err) {
    console.error(`[design-blocks] og render failed: ${(err as Error).message}`);
    return null;
  }
}

/** Procedural hero as PNG — the zero-GPU fallback, rendered from an SVG gradient. */
export async function proceduralHeroPng(spec: DirectionSpec, width = 1024, height = 1024): Promise<Uint8Array> {
  const [a, b, c] = [
    spec.palette[0] ?? spec.tokens.primary,
    spec.palette[Math.min(2, spec.palette.length - 1)] ?? spec.tokens.bg,
    spec.tokens.primary,
  ];
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `  <defs>`,
    `    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
    `      <stop offset="0%" stop-color="${a}"/>`,
    `      <stop offset="100%" stop-color="${b}"/>`,
    `    </linearGradient>`,
    `    <radialGradient id="r" cx="0.78" cy="0.22" r="0.8">`,
    `      <stop offset="0%" stop-color="${c}" stop-opacity="0.55"/>`,
    `      <stop offset="100%" stop-color="${c}" stop-opacity="0"/>`,
    `    </radialGradient>`,
    `  </defs>`,
    `  <rect width="${width}" height="${height}" fill="url(#g)"/>`,
    `  <rect width="${width}" height="${height}" fill="url(#r)"/>`,
    `  <circle cx="${Math.round(width * 0.82)}" cy="${Math.round(height * 0.72)}" r="${Math.round(height * 0.28)}" fill="#ffffff" opacity="0.07"/>`,
    `  <circle cx="${Math.round(width * 0.16)}" cy="${Math.round(height * 0.18)}" r="${Math.round(height * 0.16)}" fill="#ffffff" opacity="0.09"/>`,
    `</svg>`,
  ].join('\n');
  return new Resvg(svg).render().asPng();
}
