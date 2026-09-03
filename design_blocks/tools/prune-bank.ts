/**
 * Drop bank entries that carry nothing usable — no embedding and no tags
 * (macOS `._*` resource forks that slipped into an ingest folder look
 * exactly like this) — and delete their files.
 *
 *   npx tsx tools/prune-bank.ts [--bank ./bank] [--dry]
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BankEntry } from '../lib/bank.js';

function argAfter(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const bankDir = argAfter('--bank', './bank');
const dry = process.argv.includes('--dry');
const indexPath = join(bankDir, 'index.json');
const index = JSON.parse(await readFile(indexPath, 'utf8')) as { entries: BankEntry[] };

const junk = index.entries.filter((e) => e.embedding.length === 0 && (e.vibe === 'unlabeled' || e.tags.length === 0));
for (const entry of junk) {
  console.log(`- ${entry.id} (${entry.file}) ${entry.vibe}`);
  if (dry) continue;
  for (const file of [entry.file, entry.thumb, entry.analysisFile].filter((f): f is string => Boolean(f))) {
    await rm(join(bankDir, file), { force: true });
  }
}
if (!dry) {
  index.entries = index.entries.filter((e) => !junk.includes(e));
  await writeFile(indexPath, JSON.stringify(index, null, 1));
}
console.log(`${dry ? 'would remove' : 'removed'} ${junk.length}; ${dry ? index.entries.length - junk.length : index.entries.length} entries remain`);
