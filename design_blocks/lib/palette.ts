/**
 * A usable UI palette has roles, not just colors: a light ground, a tint,
 * a mid tone, an ink, and ONE saturated accent. Palettes lifted from
 * photographs are usually five mid-luma greys — technically colors,
 * useless as a theme. Repair keeps the palette's own hue and fills the
 * missing roles from it, so the moodboard still steers the result.
 */

import { hslToRgb, parseColor, rgbToHsl, toHex } from './color.js';

export type PaletteRepair = { palette: string[]; repairs: string[] };

type Hsl = { h: number; s: number; l: number };

export function repairPalette(input: string[], seed = 0): PaletteRepair {
  const parsed = input.map((hex) => ({ hex, rgba: parseColor(hex) })).filter((c) => c.rgba !== null);
  const hsl: Array<Hsl & { hex: string }> = parsed.map((c) => ({ ...rgbToHsl(c.rgba!), hex: c.hex }));
  const repairs: string[] = [];

  const chroma = hsl.filter((c) => c.l > 0.08 && c.l < 0.92).sort((a, b) => b.s - a.s)[0];
  const hue = chroma ? chroma.h : ((seed % 360) + 360) % 360 / 360;

  const pick = (test: (c: Hsl) => boolean, make: () => string, role: string): string => {
    const found = hsl.find(test);
    if (found) return found.hex;
    repairs.push(`no ${role} in the palette — synthesized from its hue`);
    return make();
  };
  const mk = (s: number, l: number) => toHex(hslToRgb(hue, s, l));

  const ground = pick((c) => c.l >= 0.9, () => mk(0.2, 0.965), 'light ground');
  const tint = pick((c) => c.l >= 0.74 && c.l < 0.9, () => mk(0.22, 0.86), 'tint');
  const mid = pick((c) => c.l > 0.35 && c.l < 0.74 && c.s < 0.5, () => mk(0.16, 0.55), 'mid tone');
  const ink = pick((c) => c.l <= 0.22, () => mk(0.28, 0.13), 'ink');
  // an olive at 40% saturation is a real accent; five greys at 5% are not
  const accent = pick((c) => c.s >= 0.35 && c.l >= 0.25 && c.l <= 0.62, () => mk(0.62, 0.42), 'saturated accent');

  const palette: string[] = [];
  for (const hex of [ground, tint, mid, ink, accent]) {
    if (!palette.includes(hex)) palette.push(hex);
  }
  return { palette, repairs };
}
