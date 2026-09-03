/**
 * Samples N unordered render pairs for blind ranking. Same-brief pairs
 * (the stances of one brief against each other) ALL come first — they are
 * the highest-signal comparisons — then cross-brief pairs fill the rest.
 * File order and a/b order within each pair are shuffled (seeded) so the
 * picker leaks nothing. Exits nonzero only when fewer than N pairs are
 * constructible at all.
 *
 *   npx tsx tools/make-pairs.ts --corpus ./corpus --n 200 [--seed 42]
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface RenderRef {
  render_id: string;
  brief_id: string | null;
}

interface Pair {
  pair_id: string;
  render_a: string;
  render_b: string;
}

function parseArgs(argv: string[]) {
  const args = { corpus: './corpus', n: 200, seed: 42, out: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--corpus') args.corpus = argv[++i] ?? args.corpus;
    else if (argv[i] === '--n') args.n = Number(argv[++i]);
    else if (argv[i] === '--seed') args.seed = Number(argv[++i]);
    else if (argv[i] === '--out') args.out = argv[++i] ?? '';
    else {
      console.error(`unknown flag: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.out) args.out = join(args.corpus, 'pairs.json');
  if (!Number.isInteger(args.n) || args.n < 1) {
    console.error('--n must be a positive integer');
    process.exit(2);
  }
  return args;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Unordered identity: the same two renders always hash to the same pair_id. */
const pairId = (a: string, b: string): string => {
  const [x, y] = a < b ? [a, b] : [b, a];
  return 'p-' + createHash('sha1').update(`${x}:${y}`).digest('hex').slice(0, 10);
};

function loadCorpus(corpusDir: string): RenderRef[] {
  const rendersDir = join(corpusDir, 'renders');
  if (!existsSync(rendersDir)) {
    console.error(`no renders under ${corpusDir}`);
    process.exit(1);
  }
  const items: RenderRef[] = [];
  const seenIds = new Set<string>();
  for (const run of readdirSync(rendersDir)) {
    let files: string[] = [];
    try {
      files = readdirSync(join(rendersDir, run));
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.meta.json')) continue;
      try {
        const meta = JSON.parse(readFileSync(join(rendersDir, run, f), 'utf8')) as {
          render_id?: unknown;
          brief_id?: unknown;
        };
        if (typeof meta.render_id !== 'string' || seenIds.has(meta.render_id)) continue;
        seenIds.add(meta.render_id);
        items.push({ render_id: meta.render_id, brief_id: typeof meta.brief_id === 'string' ? meta.brief_id : null });
      } catch {
        /* skip unreadable meta */
      }
    }
  }
  return items;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const rnd = mulberry32(args.seed);
  const items = loadCorpus(args.corpus);

  const samePairs: Array<[string, string]> = [];
  const crossPairs: Array<[string, string]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const same = a.brief_id !== null && a.brief_id === b.brief_id;
      (same ? samePairs : crossPairs).push([a.render_id, b.render_id]);
    }
  }
  const total = samePairs.length + crossPairs.length;
  if (total < args.n) {
    console.error(`only ${total} constructible pairs from ${items.length} renders — cannot sample ${args.n}`);
    process.exit(1);
  }

  let chosen: Array<[string, string]>;
  let sameUsed: number;
  if (samePairs.length >= args.n) {
    console.warn(`[pairs] ${samePairs.length} same-brief pairs alone exceed --n ${args.n} — truncating the same-brief set`);
    chosen = shuffle([...samePairs], rnd).slice(0, args.n);
    sameUsed = chosen.length;
  } else {
    chosen = [...samePairs];
    sameUsed = samePairs.length;
    chosen.push(...shuffle([...crossPairs], rnd).slice(0, args.n - samePairs.length));
  }

  shuffle(chosen, rnd);
  const seenPair = new Set<string>();
  const pairs: Pair[] = chosen.map(([a, b]) => {
    const id = pairId(a, b);
    if (a === b || seenPair.has(id)) {
      console.error(`self or duplicate pair generated (${id}) — construction bug`);
      process.exit(1);
    }
    seenPair.add(id);
    const flip = rnd() < 0.5;
    return { pair_id: id, render_a: flip ? b : a, render_b: flip ? a : b };
  });

  writeFileSync(args.out, JSON.stringify(pairs, null, 1));
  const briefCount = new Set(items.map((r) => r.brief_id).filter(Boolean)).size;
  console.log(
    `[pairs] ${pairs.length} pairs → ${args.out} — ${sameUsed} same-brief, ${pairs.length - sameUsed} cross-brief ` +
      `(renders: ${items.length}, briefs: ${briefCount})`,
  );
}

main();
