/**
 * The quality gate must reject a real shipped-garbage spec (off-canvas
 * hero, 12%-wide headline, text on text, 46% coverage) and must name the
 * collisions in an otherwise sound spec so the retry can fix them.
 *   npx tsx test/quality-gate.test.ts
 */
import { readFile } from 'node:fs/promises';

import type { CompositionSpec } from '../lib/composition.js';
import { resolveLayout } from '../lib/resolve.js';
import { assessQuality } from '../lib/quality.js';
import { repairPalette } from '../lib/palette.js';

async function load(name: string): Promise<CompositionSpec> {
  const raw = JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as { spec: CompositionSpec };
  return raw.spec;
}

let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

const garbage = await load('garbage-spec.json');
const g = assessQuality(garbage, resolveLayout(garbage));
check('garbage spec is rejected', !g.ok, `${g.failures.length} failures`);
check('garbage: off-canvas elements named', g.metrics.offCanvas >= 3, `${g.metrics.offCanvas} off canvas`);
check('garbage: text-on-text collisions named', g.failures.some((f) => f.includes('text over text')));
check('garbage: dead space named', g.failures.some((f) => f.includes('covered')));

const sound = await load('claude-spec.json');
const s = assessQuality(sound, resolveLayout(sound));
check('sound spec: no off-canvas, no dead space', s.metrics.offCanvas === 0 && s.metrics.coverageWhole > 0.55, JSON.stringify(s.metrics));
check('sound spec: collisions are reported for the retry, not hidden', s.metrics.collisions > 0, `${s.metrics.collisions} collisions`);

const mud = repairPalette(['#848379', '#6d6d5d', '#5e5f4f', '#979792', '#a3a3a1']);
check('mud palette gains a light ground', mud.palette.some((h) => /^#[e-f][0-9a-f]/i.test(h)), mud.palette.join(' '));
check('mud palette gains a saturated accent', mud.repairs.some((r) => r.includes('accent')), mud.repairs.join('; '));
const fine = repairPalette(['#F4F2EA', '#D9DAC9', '#A3A398', '#33361F', '#7A8F3C']);
check('a palette with roles is left alone', fine.repairs.length === 0, fine.repairs.join('; '));

if (failed) {
  console.error(`\n${failed} quality-gate assertion(s) failed`);
  process.exit(1);
}
console.log('\nall quality-gate assertions passed');
