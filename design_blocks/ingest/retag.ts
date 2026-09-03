import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BankEntry } from '../lib/bank.js';
import { classifyKind, zeroShotTags } from '../lib/zeroshot.js';
import { getAnalysis, loadCachedAnalysis } from '../lib/analysis.js';

/**
 * Bring an EXISTING bank up to date in place — the tool to run after
 * upgrading design_blocks, because ingest content-hash-skips known
 * images and would never touch them again. Three passes per entry:
 *
 *  1. vibe/tags for unlabeled entries (zero-shot CLIP, no vLLM needed)
 *  2. ui-vs-photo kind where missing (zero-shot CLIP)
 *  3. structural decomposition where missing or stale — the input the
 *     composition planner transfers from (needs vLLM; skipped with a
 *     warning when it is down)
 *
 *   npx tsx ingest/retag.ts [--bank ./bank]
 */

function argAfter(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const bankDir = argAfter('--bank', './bank');
  const indexPath = join(bankDir, 'index.json');
  const { entries } = JSON.parse(await readFile(indexPath, 'utf8')) as { entries: BankEntry[] };

  let retagged = 0;
  let kinded = 0;
  let analyzed = 0;
  let analysisFailures = 0;

  for (const entry of entries) {
    if (entry.vibe === 'unlabeled' && entry.embedding.length > 0) {
      const tags = await zeroShotTags(entry.embedding);
      if (tags) {
        entry.vibe = tags.vibe;
        entry.tags = tags.tags;
        entry.notes = tags.notes;
        retagged++;
        console.log(`~ ${entry.id} -> ${tags.vibe} [${tags.tags.join(', ')}]`);
      } else {
        console.error(`  ! sidecar down — cannot retag ${entry.id}`);
      }
    }

    if ((!entry.kind || entry.kind === 'unknown') && entry.embedding.length > 0) {
      const kind = await classifyKind(entry.embedding);
      if (kind !== 'unknown') {
        entry.kind = kind;
        kinded++;
        console.log(`~ ${entry.id} kind -> ${kind}`);
      }
    }

    // Analysis backfill: cache-through, so entries with a valid current-
    // version decomposition cost nothing. The breaker counts CONSECUTIVE
    // failures only — a single bad reply for one image must not strand
    // the rest of the bank; four in a row means vLLM is actually down.
    if (analysisFailures < 4) {
      const cached = await loadCachedAnalysis(bankDir, entry);
      if (cached) {
        entry.analysisFile = join('analysis', `${entry.id}.json`);
        continue;
      }
      const analysis = await getAnalysis(bankDir, entry);
      if (analysis) {
        entry.analysisFile = join('analysis', `${entry.id}.json`);
        analyzed++;
        analysisFailures = 0;
        console.log(`+ ${entry.id} analyzed: ${analysis.summary.slice(0, 70)} (${analysis.signaturePatterns.length} signature patterns)`);
      } else {
        analysisFailures++;
        console.error(`  ! no structural analysis for ${entry.id} (bad reply or vLLM down)`);
        if (analysisFailures >= 4) console.error('  ! four consecutive failures — vLLM looks down; giving up on analyses for this run');
      }
    }
  }

  await writeFile(indexPath, JSON.stringify({ entries }, null, 1));
  const withAnalysis = entries.filter((e) => e.analysisFile).length;
  console.log(
    `\n${indexPath}: ${retagged} retagged, ${kinded} kind-classified, ${analyzed} newly analyzed — ` +
      `${withAnalysis}/${entries.length} entries now carry a structural decomposition`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
