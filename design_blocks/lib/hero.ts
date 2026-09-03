/**
 * Retrieval-first hero imagery. The bank already holds licensed
 * photography that CLIP matched to the brief; a real photograph,
 * desaturated and gradient-mapped onto the direction's own palette, beats
 * anything a small diffusion model paints on a T4 — and costs no GPU at
 * all. resvg does the whole thing from one SVG: embedded raster, a
 * saturate+table filter for the gradient map, and a soft palette veil for
 * depth. The photo's attribution travels with the kit.
 */

import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { Resvg } from '@resvg/resvg-js';

import type { BankEntry } from './bank.js';
import { parseColor, type Rgba } from './color.js';

export type HeroSource = 'reference-photo' | 'generated' | 'procedural';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function luma(c: Rgba): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function saturation(c: Rgba): number {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Photographs only — UI screenshots are composition teachers, never hero
 * art. `index` rotates through the matches so the three directions do not
 * share one photo.
 */
export function pickHeroReference(refs: BankEntry[], index = 0): BankEntry | undefined {
  // the zero-shot kind classifier is known to call texture/macro photos
  // "ui" — when it leaves nothing, every retrieved reference is a candidate
  const photos = refs.filter((r) => r.kind !== 'ui');
  const pool = photos.length > 0 ? photos : refs;
  if (pool.length === 0) return undefined;
  return pool[index % pool.length];
}

/** dark / accent / light stops for the gradient map, from the direction palette. */
type Stops = { dark: Rgba; mid: Rgba; light: Rgba; accent: Rgba };

function stops(palette: string[]): Stops {
  const colors = palette.map(parseColor).filter((c): c is Rgba => c !== null);
  const fallback: Stops = {
    dark: { r: 20, g: 22, b: 30, a: 1 },
    mid: { r: 90, g: 110, b: 200, a: 1 },
    light: { r: 240, g: 240, b: 245, a: 1 },
    accent: { r: 90, g: 110, b: 200, a: 1 },
  };
  if (colors.length === 0) return fallback;
  const byLuma = [...colors].sort((a, b) => luma(a) - luma(b));
  const dark = byLuma[0];
  const light = byLuma[byLuma.length - 1];
  // The midtone carries most of the photograph, so it takes the palette's
  // tonal workhorse (closest to a mid luma), not its loudest accent — the
  // accent shows up in the veil instead. Pull it a third of the way toward
  // neutral so texture survives the map.
  const candidates = byLuma.filter((c) => c !== dark && c !== light);
  const picked = candidates.sort((a, b) => Math.abs(luma(a) - 110) - Math.abs(luma(b) - 110))[0] ?? byLuma[Math.floor(byLuma.length / 2)];
  const grey = luma(picked);
  const mid: Rgba = {
    r: picked.r * 0.65 + grey * 0.35,
    g: picked.g * 0.65 + grey * 0.35,
    b: picked.b * 0.65 + grey * 0.35,
    a: 1,
  };
  const accent = [...colors].sort((a, b) => saturation(b) - saturation(a))[0] ?? mid;
  return { dark, mid, light, accent };
}

function table(channel: 'r' | 'g' | 'b', s: Stops): string {
  return [s.dark, s.mid, s.light].map((c) => (c[channel] / 255).toFixed(4)).join(' ');
}

function hex(c: Rgba): string {
  return `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The bank photo as a 1024² hero, art-directed to the palette. Null when
 * the file is missing or cannot be rasterized — the caller falls back to
 * the procedural gradient exactly as before.
 */
export async function referenceHeroPng(
  bankDir: string,
  ref: BankEntry,
  palette: string[],
  width = 1024,
  height = 1024,
): Promise<Uint8Array | null> {
  const mime = MIME[extname(ref.file).toLowerCase()];
  if (!mime) return null;
  let bytes: Buffer;
  try {
    bytes = await readFile(join(bankDir, ref.file));
  } catch {
    return null;
  }
  const s = stops(palette);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs>',
    '<filter id="map" color-interpolation-filters="sRGB">',
    '<feColorMatrix type="saturate" values="0"/>',
    // stretch the photo's tonal range first so the map reaches both ends
    '<feComponentTransfer>',
    '<feFuncR type="linear" slope="1.3" intercept="-0.15"/>',
    '<feFuncG type="linear" slope="1.3" intercept="-0.15"/>',
    '<feFuncB type="linear" slope="1.3" intercept="-0.15"/>',
    '</feComponentTransfer>',
    '<feComponentTransfer>',
    `<feFuncR type="table" tableValues="${table('r', s)}"/>`,
    `<feFuncG type="table" tableValues="${table('g', s)}"/>`,
    `<feFuncB type="table" tableValues="${table('b', s)}"/>`,
    '</feComponentTransfer>',
    '</filter>',
    '<linearGradient id="veil" x1="0" y1="0" x2="1" y2="1">',
    `<stop offset="0" stop-color="${hex(s.accent)}" stop-opacity="0.22"/>`,
    `<stop offset="1" stop-color="${hex(s.dark)}" stop-opacity="0.25"/>`,
    '</linearGradient>',
    '</defs>',
    `<rect width="${width}" height="${height}" fill="${hex(s.dark)}"/>`,
    `<image xlink:href="data:${mime};base64,${bytes.toString('base64')}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" filter="url(#map)"/>`,
    `<rect width="${width}" height="${height}" fill="url(#veil)"/>`,
    '</svg>',
  ].join('');
  try {
    return new Resvg(svg).render().asPng();
  } catch (err) {
    console.error(`[design-blocks] reference hero render failed for ${ref.id}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
