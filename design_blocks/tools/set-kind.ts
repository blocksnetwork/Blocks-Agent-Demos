/**
 * Relabel bank entries' kind by hand when the zero-shot classifier got it
 * wrong (it files macro and texture photography under "ui").
 *
 *   npx tsx tools/set-kind.ts --kind photo            # every entry
 *   npx tsx tools/set-kind.ts --kind ui --ids a1,b2   # named entries
 *   npx tsx tools/set-kind.ts --kind photo --source openverse
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BankEntry } from '../lib/bank.js';

function argAfter(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const bankDir = argAfter('--bank', './bank');
const kind = argAfter('--kind', '');
const ids = new Set(argAfter('--ids', '').split(',').filter(Boolean));
const source = argAfter('--source', '');

if (kind !== 'ui' && kind !== 'photo') {
  console.error('--kind ui|photo is required');
  process.exit(1);
}

const indexPath = join(bankDir, 'index.json');
const index = JSON.parse(await readFile(indexPath, 'utf8')) as { entries: BankEntry[] };
let changed = 0;
for (const entry of index.entries) {
  if (ids.size && !ids.has(entry.id)) continue;
  if (source && entry.attribution?.source !== source) continue;
  if (entry.kind !== kind) {
    entry.kind = kind;
    changed++;
  }
}
await writeFile(indexPath, JSON.stringify(index, null, 1));
console.log(`${changed} entries set to kind=${kind} (${index.entries.length} total)`);
