/** Small exact color toolkit: parsing, WCAG contrast, HSL round-trips. */

export type Rgba = { r: number; g: number; b: number; a: number };

const NAMED: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  transparent: 'rgba(0,0,0,0)',
};

export function parseColor(input: string | undefined): Rgba | null {
  if (!input) return null;
  const value = (NAMED[input.trim().toLowerCase()] ?? input).trim();

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1];
  if (hex) {
    const long = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return {
      r: parseInt(long.slice(0, 2), 16),
      g: parseInt(long.slice(2, 4), 16),
      b: parseInt(long.slice(4, 6), 16),
      a: long.length === 8 ? parseInt(long.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1
      : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100
      : parseFloat(rgb[4]);
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: alpha };
  }

  return null;
}

export function toHex({ r, g, b }: Rgba): string {
  const c = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** WCAG 2.x relative luminance. */
export function luminance({ r, g, b }: Rgba): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function rgbToHsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
    : max === gn ? ((bn - rn) / d + 2) / 6
    : ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number): Rgba {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v, a: 1 };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = ((t % 1) + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: channel(h + 1 / 3) * 255, g: channel(h) * 255, b: channel(h - 1 / 3) * 255, a: 1 };
}
