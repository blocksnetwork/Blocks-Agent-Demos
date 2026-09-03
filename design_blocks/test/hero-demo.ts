/**
 * Renders three reference-photo heroes from the local bank into test/out/
 * so the gradient map can be eyeballed without a vLLM or a task.
 *   npx tsx test/hero-demo.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadBank } from '../lib/bank.js';
import { pickHeroReference, referenceHeroPng } from '../lib/hero.js';

const bankDir = process.env.BANK_DIR ?? './bank';
const outDir = join('test', 'out');
await mkdir(outDir, { recursive: true });

const bank = await loadBank(bankDir);
if (bank.entries.length === 0) {
  console.error(`bank at ${bankDir} is empty — ingest first`);
  process.exit(1);
}

const palettes = [
  ['#0b1f3a', '#1e4d8c', '#f2a900', '#e8eef7', '#ffffff'],
  ['#2a1a0f', '#8c4a1e', '#e07a3f', '#f5e6d3', '#fffaf3'],
  ['#101410', '#2f5d3a', '#9ccc65', '#e6f2e0', '#ffffff'],
];

const started = Date.now();
for (let i = 0; i < palettes.length; i++) {
  const ref = pickHeroReference(bank.entries, i);
  if (!ref) throw new Error('no reference available');
  const png = await referenceHeroPng(bankDir, ref, palettes[i]);
  if (!png) throw new Error(`render failed for ${ref.id}`);
  const file = join(outDir, `hero-${i + 1}.png`);
  await writeFile(file, png);
  console.log(`${file} <- ${ref.id} (${ref.vibe}) ${png.length} bytes`);
}
console.log(`elapsed ${Date.now() - started}ms`);
