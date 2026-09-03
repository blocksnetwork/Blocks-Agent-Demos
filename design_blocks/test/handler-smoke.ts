/**
 * Smoke test for the rewritten handler on the WORST path: empty bank,
 * vLLM down, embed sidecar down, imagine sidecar down. The contract is
 * that the task still returns every guaranteed artifact, the comps are
 * style tiles, and provenance says template-fallback out loud.
 *
 *   npx tsx test/handler-smoke.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Env BEFORE the (dynamic) handler import — module constants like
// BANK_DIR/VLLM_URL are read at load time, and static imports hoist.
const WORST = process.argv.includes('--worst');
if (WORST) {
  // Point every dependency at ports where nothing listens, so failures
  // are fast connection-refused, not long timeouts.
  process.env.VLLM_URL = 'http://127.0.0.1:9/v1/chat/completions';
  process.env.EMBED_URL = 'http://127.0.0.1:9';
  process.env.IMAGINE_URL = 'http://127.0.0.1:9';
  process.env.BANK_DIR = './definitely-missing-bank';
  process.env.DESIGN_BLOCKS_OFFLINE = '1'; // skip icon/photo fetches too
}
const { default: handler } = await import('../handler.js');

const GUARANTEED = ['direction', 'blueprint', 'kit', 'theme_css', 'motion_css', 'motion_js', 'hero'];

async function main() {
  const started = Date.now();
  const task = { requestParts: [{ text: 'plant care journal app, playful, warm' }] } as never;
  const result = await handler(task, undefined);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const artifacts = result.artifacts ?? [];
  const ids = artifacts.map((a) => (a as { outputId?: string }).outputId ?? '?');
  console.log(`\nartifacts (${elapsed}s): ${ids.join(', ')}`);

  const missing = GUARANTEED.filter((id) => !ids.includes(id));
  if (missing.length) {
    console.error(`FAIL: guaranteed artifacts missing: ${missing.join(', ')}`);
    process.exit(1);
  }

  const kitArtifact = artifacts.find((a) => (a as { outputId?: string }).outputId === 'kit') as { data: string };
  const kit = JSON.parse(kitArtifact.data) as {
    provenance: { compositionSource: string; sheds: string[] };
    directions: Array<{ compositionSource: string; tokens?: unknown; genome?: unknown }>;
  };
  console.log(`provenance.compositionSource: ${kit.provenance.compositionSource}`);
  console.log(`directions: ${kit.directions.map((d) => d.compositionSource).join(', ')}`);
  console.log(`directions carry tokens+genome: ${kit.directions.every((d) => d.tokens && d.genome)}`);

  if (kit.provenance.compositionSource !== 'template-fallback') {
    console.error('FAIL: with every model down, provenance must say template-fallback');
    process.exit(1);
  }
  if (!ids.includes('comp_1')) {
    console.error('FAIL: no comp rendered even as a style tile');
    process.exit(1);
  }
  if (ids.includes('composition_spec') || ids.includes('composition_html')) {
    console.error('FAIL: composition artifacts must not ship from the fallback path');
    process.exit(1);
  }
  if (WORST && ids.includes('board')) {
    console.error('FAIL: a board shipped with the bank missing — the env overrides did not take effect');
    process.exit(1);
  }

  // keep the outputs inspectable
  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out', WORST ? 'smoke-worst' : 'smoke');
  await mkdir(outDir, { recursive: true });
  for (const artifact of artifacts) {
    const a = artifact as { data: string | Buffer; fileName?: string; outputId?: string };
    await writeFile(join(outDir, a.fileName ?? `${a.outputId}.txt`), a.data);
  }
  console.log(`\nPASS — degraded-mode contract holds; outputs in test/out/${WORST ? 'smoke-worst' : 'smoke'}/`);
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
