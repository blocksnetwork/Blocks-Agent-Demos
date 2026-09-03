/**
 * W2-2 golden tests for the deterministic craft proxies + the blendScore
 * extraction. Fixtures are RAW pngjs-encoded synthetic images (no satori —
 * lib/fonts.ts would fetch TTFs over the network; these must be offline
 * and byte-deterministic).
 *
 *   npx tsx test/craft-proxies.test.ts
 */

import { PNG } from 'pngjs';
import { computeCraftProxies } from '../lib/craft.js';
import { blendScore, type ScoreParts } from '../lib/score.js';

let failures = 0;
const check = (label: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};

const W = 1200;
const H = 1500;

function paint(fill: (x: number, y: number) => [number, number, number]): Uint8Array {
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const [r, g, b] = fill(x, y);
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  return new Uint8Array(PNG.sync.write(png));
}

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const PALETTE = ['#e8384f', '#4178bc', '#37a862'];
const [A, B, C] = PALETTE.map(hex);

// 1 — all-white canvas: maximal whitespace, maximal empty rectangle.
const white = paint(() => [255, 255, 255]);
const started = Date.now();
const whiteProxies = computeCraftProxies(white, PALETTE);
const perRenderMs = Date.now() - started;
check('all-white whitespaceRatio >= 0.98', whiteProxies.whitespaceRatio >= 0.98, `${whiteProxies.whitespaceRatio}`);
check('all-white largestEmptyRect >= 0.90', whiteProxies.largestEmptyRect >= 0.90, `${whiteProxies.largestEmptyRect}`);
console.log(`per-render compute time: ${perRenderMs}ms`);
check('per-render compute < 300ms', perRenderMs < 300, `${perRenderMs}ms`);

// 2 — half-covered: a centered full-width band covering exactly 50%, white
// edges keep the background detection unambiguous.
const half = paint((_x, y) => (y >= H * 0.25 && y < H * 0.75 ? B : [255, 255, 255]));
const halfProxies = computeCraftProxies(half, PALETTE);
check(
  'half-covered whitespaceRatio in [0.45,0.55]',
  halfProxies.whitespaceRatio >= 0.45 && halfProxies.whitespaceRatio <= 0.55,
  `${halfProxies.whitespaceRatio}`,
);

// 3 — exact 60/30/10 horizontal bands of the three palette colors.
const bands = paint((_x, y) => (y < H * 0.6 ? A : y < H * 0.9 ? B : C));
const bandProxies = computeCraftProxies(bands, PALETTE);
check(
  '60/30/10 colorBalance >= 0.95',
  bandProxies.colorBalance >= 0.95,
  `${bandProxies.colorBalance} shares=[${bandProxies.shares.join(', ')}]`,
);

// 4 — 10/10/80 inversion: dominant color owns far too much of the canvas.
const inverted = paint((_x, y) => (y < H * 0.1 ? A : y < H * 0.2 ? B : C));
const invertedProxies = computeCraftProxies(inverted, PALETTE);
check('10/10/80 colorBalance <= 0.5', invertedProxies.colorBalance <= 0.5, `${invertedProxies.colorBalance}`);

// 5 — determinism: byte-identical JSON across two computations.
check(
  'byte-identical JSON across two runs',
  JSON.stringify(computeCraftProxies(bands, PALETTE)) === JSON.stringify(bandProxies),
);

// 6 — blendScore reproduces the legacy handler formula bit-for-bit at weight 0,
// including the null-fallback 0.3/0.5/0.8 defaults.
const partSets: ScoreParts[] = [
  { structure: 0.87, domain: 0.61, palette: 0.79, prior: 1 },
  { structure: null, domain: null, palette: null, prior: 0.5 },
  { structure: 0, domain: 0, palette: 0, prior: 0 },
  { structure: 1, domain: 1, palette: 1, prior: 1 },
  { structure: 0.42, domain: null, palette: 0.9, prior: 0.85 },
];
for (const parts of partSets) {
  const legacy =
    0.55 * (parts.structure ?? 0.3) + 0.2 * (parts.domain ?? 0.5) + 0.15 * (parts.palette ?? 0.8) + 0.1 * parts.prior;
  check(
    `blendScore(parts, 0) matches legacy to 1e-9 for ${JSON.stringify(parts)}`,
    Math.abs(blendScore(parts, 0) - legacy) < 1e-9,
  );
  check('null craft ignores the weight', blendScore({ ...parts, craft: null }, 0.2) === blendScore(parts, 0));
}

process.exit(failures ? 1 : 0);
