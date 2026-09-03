/**
 * Run the quality gate over a saved composition-spec.json artifact.
 *   npx tsx tools/assess-spec.ts path/to/composition-spec.json
 */
import { readFile } from 'node:fs/promises';

import type { CompositionSpec } from '../lib/composition.js';
import { resolveLayout } from '../lib/resolve.js';
import { assessQuality } from '../lib/quality.js';

const path = process.argv[2];
if (!path) {
  console.error('usage: npx tsx tools/assess-spec.ts composition-spec.json');
  process.exit(1);
}
const raw = JSON.parse(await readFile(path, 'utf8')) as { spec?: CompositionSpec } | CompositionSpec;
const spec = ('spec' in raw && raw.spec ? raw.spec : raw) as CompositionSpec;
const layout = resolveLayout(spec);
const report = assessQuality(spec, layout);
console.log(`${report.ok ? 'PASS' : 'FAIL'} ${path}`);
console.log(JSON.stringify(report.metrics));
for (const f of report.failures) console.log(`  x ${f}`);
for (const w of report.warnings) console.log(`  ~ ${w}`);
process.exit(report.ok ? 0 : 2);
