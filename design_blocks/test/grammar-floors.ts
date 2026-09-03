/**
 * Offline proof of the grammar-level floors (task w1-1):
 *
 *   1. buildGuidedSchema puts the element-count floor and the off-axis
 *      focalCenter split INTO the guided-JSON grammar — asymmetric
 *      references get a required focalCenter with disjoint x bands,
 *      symmetric references don't get the field at all;
 *   2. every stance exemplar survives sanitizeSpec with zero integrity
 *      repairs, resolves to >= MIN_ELEMENTS elements with the focal
 *      center off-axis, and specs without focalCenter sanitize as a
 *      byte-identical no-op;
 *   3. each serialized exemplar stays under the prompt-size budget.
 *
 *   npx tsx test/grammar-floors.ts        # exits nonzero on any failure
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sanitizeAnalysis, type DesignReferenceAnalysis } from '../lib/analysis.js';
import {
  buildGuidedSchema,
  MAX_ELEMENTS,
  MIN_ELEMENTS,
  sanitizeSpec,
  specUsable,
  type Stance,
} from '../lib/composition.js';
import { EXEMPLAR_SPECS, STANCE_EXEMPLARS } from '../lib/exemplars.js';
import { resolveLayout } from '../lib/resolve.js';

const here = dirname(fileURLToPath(import.meta.url));

let failures = 0;
function check(cond: boolean, label: string): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

type Obj = Record<string, any>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

async function run(): Promise<void> {
  /* 1 — schema floors, from the raw snake_case fixture THROUGH sanitizeAnalysis. */
  const fixtureRaw = JSON.parse(await readFile(join(here, 'fixtures', 'agri-dashboard.analysis.json'), 'utf8'));
  const analysis = sanitizeAnalysis(fixtureRaw, 'grammar-floors-fixture');
  check(analysis !== null, 'fixture analysis sanitizes');
  if (!analysis) throw new Error('fixture unusable — cannot continue');
  check(analysis.composition.symmetry === 'strongly-asymmetric', 'fixture is strongly-asymmetric');

  const schema = buildGuidedSchema(analysis) as Obj;
  const elements = (schema.properties as Obj).elements as Obj;
  check(MIN_ELEMENTS === 9, `MIN_ELEMENTS is 9 (got ${MIN_ELEMENTS})`);
  check(elements.minItems === MIN_ELEMENTS, `schema elements.minItems = ${String(elements.minItems)} (MIN_ELEMENTS)`);
  check(elements.maxItems === MAX_ELEMENTS, `schema elements.maxItems = ${String(elements.maxItems)} (MAX_ELEMENTS)`);

  const focalCenter = (schema.properties as Obj).focalCenter as Obj | undefined;
  check(focalCenter !== undefined, 'asymmetric analysis: schema has focalCenter');
  check(Array.isArray(schema.required) && (schema.required as string[]).includes('focalCenter'), 'asymmetric analysis: focalCenter is REQUIRED');
  const branches = (focalCenter?.properties?.x?.anyOf ?? []) as Obj[];
  check(branches.length === 2, 'focalCenter.x uses a two-branch anyOf');
  check(
    branches[0]?.minimum === 5 && branches[0]?.maximum === 38 && branches[1]?.minimum === 62 && branches[1]?.maximum === 95,
    'anyOf bands are 5-38 and 62-95 — a centered focal is unrepresentable',
  );

  const symmetric: DesignReferenceAnalysis = {
    ...analysis,
    composition: { ...analysis.composition, symmetry: 'symmetric' },
  };
  const symSchema = buildGuidedSchema(symmetric) as Obj;
  check((symSchema.properties as Obj).focalCenter === undefined, 'symmetric analysis: NO focalCenter property');
  check(!(symSchema.required as string[]).includes('focalCenter'), 'symmetric analysis: focalCenter not required');
  check(((symSchema.properties as Obj).elements as Obj).minItems === MIN_ELEMENTS, 'symmetric analysis: minItems floor still applies');

  /* 2 — exemplars: sanitize -> usable -> resolve, zero repairs, focal off-axis. */
  for (const stance of ['faithful', 'bolder', 'unexpected'] as Stance[]) {
    const raw = clone(EXEMPLAR_SPECS[stance]);
    const authoredFocal = (raw.elements as Obj[]).find((e) => e.id === raw.focalElementId)!.frame as Obj;

    const result = sanitizeSpec(raw, stance, 'exemplar');
    check(result !== null && specUsable(result), `${stance}: exemplar sanitizes and clears the usability floor`);
    if (!result) continue;
    const { spec, integrity } = result;

    const repairs =
      integrity.repairedFrames + integrity.repairedRelations + integrity.droppedRelations + integrity.droppedElements;
    check(
      repairs === 0 && integrity.notes.length === 0,
      `${stance}: zero integrity repairs (got ${repairs}, notes: ${integrity.notes.join('; ') || 'none'})`,
    );
    check(
      spec.elements.length >= MIN_ELEMENTS && spec.elements.length <= 14,
      `${stance}: ${spec.elements.length} elements in 9-14`,
    );

    const focalEl = spec.elements.find((e) => e.id === spec.focalElementId)!;
    check(
      JSON.stringify(focalEl.frame) === JSON.stringify(authoredFocal),
      `${stance}: consistent focalCenter leaves the focal frame untouched`,
    );
    check(!JSON.stringify(spec).includes('focalCenter'), `${stance}: focalCenter stripped from the stored spec`);

    const layout = resolveLayout(spec);
    const resolvedFocal = layout.byId.get(spec.focalElementId)!;
    const centerX = ((resolvedFocal.x + resolvedFocal.w / 2) / layout.canvas.width) * 100;
    check(centerX <= 38 || centerX >= 62, `${stance}: resolved focal center x = ${centerX.toFixed(1)}% (off-axis)`);

    // No-op proof: the same spec WITHOUT focalCenter must sanitize to the
    // byte-identical result.
    const bare = clone(EXEMPLAR_SPECS[stance]);
    delete bare.focalCenter;
    const bareResult = sanitizeSpec(bare, stance, 'exemplar');
    check(
      bareResult !== null && JSON.stringify(bareResult.spec) === JSON.stringify(spec) && JSON.stringify(bareResult.integrity) === JSON.stringify(integrity),
      `${stance}: spec without focalCenter sanitizes identically (pure no-op)`,
    );

    /* 3 — prompt budget: chars/4 as the token estimate. */
    const estTokens = Math.ceil(STANCE_EXEMPLARS[stance].length / 4);
    check(estTokens < 1200, `${stance}: exemplar adds ~${estTokens} est. tokens (< 1200)`);
  }

  /* 2b — a focalCenter that disagrees with the frame translates it, logs one repair, and is stripped. */
  const moved = clone(EXEMPLAR_SPECS.faithful);
  (moved as Obj).focalCenter = { x: 20, y: 40 };
  const movedResult = sanitizeSpec(moved, 'faithful', 'exemplar');
  check(movedResult !== null, 'translation case sanitizes');
  if (movedResult) {
    const focalEl = movedResult.spec.elements.find((e) => e.id === movedResult.spec.focalElementId)!;
    check(
      focalEl.frame.x + focalEl.frame.w / 2 === 20 && focalEl.frame.y + focalEl.frame.h / 2 === 40,
      `translation: focal center now (${focalEl.frame.x + focalEl.frame.w / 2},${focalEl.frame.y + focalEl.frame.h / 2}) = declared (20,40)`,
    );
    check(
      movedResult.integrity.repairedFrames === 1 && movedResult.integrity.notes.some((n) => n.includes('focalCenter')),
      'translation is logged as one SpecIntegrity repair with a focalCenter note',
    );
    check(!JSON.stringify(movedResult.spec).includes('focalCenter'), 'translation case: focalCenter stripped');
  }

  console.log(failures === 0 ? '\nall grammar-floor assertions passed' : `\n${failures} assertion(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
