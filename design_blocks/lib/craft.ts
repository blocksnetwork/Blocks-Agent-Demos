/**
 * Deterministic craft proxies (W2-2): three CPU-only measurements computed
 * from a rendered comp's pixels — whitespace ratio, largest empty rectangle,
 * and 60/30/10 color balance. They MEASURE only: nothing composes them into
 * a score until the W2-4 calibration report recommends a formula (a blank
 * page maximizes whitespaceRatio, so the raw proxies are not monotone-good).
 * All outputs are rounded to 4 decimals so the JSON is byte-stable.
 */

import { PNG } from 'pngjs';
import { parseColor } from './color.js';

export interface CraftProxies {
  whitespaceRatio: number;
  largestEmptyRect: number;
  colorBalance: number;
  shares: number[];
}

// Fixed-size analysis grid: cost is resolution-independent, and cell edges
// land exactly on the 1200x1500 test fixtures.
const GRID_W = 64;
const GRID_H = 80;

// Background-likeness thresholds (8-bit channels).
const LUMA_EPS = 18;
const CHANNEL_EPS = 30;
// Candidate colors closer than this (max channel delta) collapse into one.
const CANDIDATE_MERGE_EPS = 12;

type Cell = { r: number; g: number; b: number };

const luma = (c: Cell): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const maxChannelDelta = (a: Cell, b: Cell): number =>
  Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

function downsample(png: { width: number; height: number; data: Buffer }): Cell[] {
  const { width, height, data } = png;
  const cells: Cell[] = new Array<Cell>(GRID_W * GRID_H);
  for (let gy = 0; gy < GRID_H; gy++) {
    const y0 = Math.floor((gy * height) / GRID_H);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / GRID_H));
    for (let gx = 0; gx < GRID_W; gx++) {
      const x0 = Math.floor((gx * width) / GRID_W);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / GRID_W));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * width + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          const a = data[i + 3] / 255;
          // composite over white: comps are opaque, but a stray alpha edge
          // must not read as black
          r += data[i] * a + 255 * (1 - a);
          g += data[i + 1] * a + 255 * (1 - a);
          b += data[i + 2] * a + 255 * (1 - a);
          n++;
        }
      }
      cells[gy * GRID_W + gx] = { r: r / n, g: g / n, b: b / n };
    }
  }
  return cells;
}

/** Dominant background = the modal quantized color of the 4 canvas edges. */
function detectBackground(cells: Cell[]): Cell {
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  const consider = (c: Cell): void => {
    const key = `${Math.round(c.r / 16)},${Math.round(c.g / 16)},${Math.round(c.b / 16)}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += c.r;
    bucket.g += c.g;
    bucket.b += c.b;
    bucket.n++;
    buckets.set(key, bucket);
  };
  for (let gx = 0; gx < GRID_W; gx++) {
    consider(cells[gx]);
    consider(cells[(GRID_H - 1) * GRID_W + gx]);
  }
  for (let gy = 1; gy < GRID_H - 1; gy++) {
    consider(cells[gy * GRID_W]);
    consider(cells[gy * GRID_W + GRID_W - 1]);
  }
  // Map iteration is insertion-ordered and only a strictly greater count
  // replaces the leader, so ties resolve deterministically.
  let best: { r: number; g: number; b: number; n: number } | null = null;
  for (const bucket of buckets.values()) if (!best || bucket.n > best.n) best = bucket;
  const b = best as { r: number; g: number; b: number; n: number };
  return { r: b.r / b.n, g: b.g / b.n, b: b.b / b.n };
}

const isBackground = (c: Cell, bg: Cell): boolean =>
  Math.abs(luma(c) - luma(bg)) <= LUMA_EPS && maxChannelDelta(c, bg) <= CHANNEL_EPS;

/** Maximal all-background rectangle (histogram DP), as a fraction of canvas area. */
function largestBackgroundRect(bgMask: boolean[]): number {
  const heights = new Array<number>(GRID_W).fill(0);
  let best = 0;
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) heights[gx] = bgMask[gy * GRID_W + gx] ? heights[gx] + 1 : 0;
    const stack: number[] = [];
    for (let gx = 0; gx <= GRID_W; gx++) {
      const h = gx === GRID_W ? 0 : heights[gx];
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop() as number;
        const width = stack.length ? gx - stack[stack.length - 1] - 1 : gx;
        best = Math.max(best, heights[top] * width);
      }
      stack.push(gx);
    }
  }
  return best / (GRID_W * GRID_H);
}

/**
 * Area share per candidate color (direction palette + detected background +
 * white/black neutrals, near-duplicates merged), nearest-color assignment,
 * zero shares dropped, sorted descending.
 */
function colorShares(cells: Cell[], palette: string[], bg: Cell): number[] {
  const candidates: Cell[] = [];
  const push = (c: Cell): void => {
    if (candidates.some((existing) => maxChannelDelta(existing, c) <= CANDIDATE_MERGE_EPS)) return;
    candidates.push(c);
  };
  for (const hexColor of palette) {
    const parsed = parseColor(hexColor);
    if (parsed) push({ r: parsed.r, g: parsed.g, b: parsed.b });
  }
  push(bg);
  push({ r: 255, g: 255, b: 255 });
  push({ r: 0, g: 0, b: 0 });
  const counts = new Array<number>(candidates.length).fill(0);
  for (const cell of cells) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const d =
        (cell.r - candidates[i].r) ** 2 + (cell.g - candidates[i].g) ** 2 + (cell.b - candidates[i].b) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    counts[bestIdx]++;
  }
  return counts
    .map((n) => n / cells.length)
    .filter((share) => share > 0)
    .sort((a, b) => b - a);
}

/** Distance of the top-3 area shares from the 60/30/10 ideal, mapped to 0..1. */
function balanceScore(shares: number[]): number {
  const [s1 = 0, s2 = 0, s3 = 0] = shares;
  const deviation = Math.abs(s1 - 0.6) + Math.abs(s2 - 0.3) + Math.abs(s3 - 0.1);
  // 0.8 = the single-color-owns-everything deviation; rare pathological
  // many-tiny-shares cases can exceed it and clamp to 0
  return Math.max(0, 1 - deviation / 0.8);
}

export function computeCraftProxies(png: Uint8Array, palette: string[]): CraftProxies {
  const decoded = PNG.sync.read(Buffer.from(png.buffer, png.byteOffset, png.byteLength));
  const cells = downsample(decoded);
  const bg = detectBackground(cells);
  const bgMask = cells.map((c) => isBackground(c, bg));
  const whitespaceRatio = bgMask.filter(Boolean).length / cells.length;
  const largestEmptyRect = largestBackgroundRect(bgMask);
  const shares = colorShares(cells, palette, bg);
  return {
    whitespaceRatio: round4(whitespaceRatio),
    largestEmptyRect: round4(largestEmptyRect),
    colorBalance: round4(balanceScore(shares)),
    shares: shares.map(round4),
  };
}
