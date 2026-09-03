/**
 * W2-1 corpus builder: runs the design handler over a brief list and files
 * every comp render (plus per-render meta) into a rankable corpus, or
 * harvests existing renders from test/out into the same shape.
 *
 *   npx tsx tools/corpus-run.ts --briefs tools/corpus-briefs.json --out ./corpus [--limit N]
 *   npx tsx tools/corpus-run.ts --harvest test/out/e2e-box test/out/e2e-box-v3 test/out --out ./corpus
 *
 * Generation is strictly sequential (one handler invocation at a time) and
 * the live-traffic guard runs before EVERY brief, so a box serving a real
 * task is never crowded. Harvest mode is Mac-local: no guard, no handler.
 * No dependencies beyond node builtins — nothing on the box needs an install.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { guardOptionsFromArgv, waitForQuietBox, type GuardOptions } from './guard.js';

// comp-N.png is emitted in outcomes order, and outcomes are built over the
// fixed stance list in handler.ts (['faithful','bolder','unexpected']),
// while kit.directions is score-ranked — so per-comp meta is matched BY
// STANCE, never by array index.
const STANCE_ORDER = ['faithful', 'bolder', 'unexpected'] as const;

interface Brief {
  id: string;
  text: string;
}

interface RenderMeta {
  render_id: string;
  brief_id: string | null;
  brief: string | null;
  stance: string | null;
  compositionSource: string | null;
  referenceId: string | null;
  score: number | null;
  parts: unknown;
  origin: 'generated' | 'harvested';
  sourcePath?: string;
  createdAt: string;
}

const sha12 = (bytes: Buffer): string => createHash('sha1').update(bytes).digest('hex').slice(0, 12);
const metaName = (pngName: string): string => pngName.replace(/\.png$/, '.meta.json');

function parseArgs(argv: string[]) {
  const args = { briefs: '', out: './corpus', limit: Infinity, harvest: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--briefs') args.briefs = argv[++i] ?? '';
    else if (flag === '--out') args.out = argv[++i] ?? args.out;
    else if (flag === '--limit') args.limit = Number(argv[++i]);
    else if (flag === '--harvest') while (argv[i + 1] && !argv[i + 1].startsWith('--')) args.harvest.push(argv[++i]);
    else if (flag.startsWith('--guard-')) i++; // consumed by guardOptionsFromArgv
    else {
      console.error(`unknown flag: ${flag}`);
      process.exit(2);
    }
  }
  return args;
}

/** render_ids already in the corpus, so re-runs and re-harvests stay idempotent. */
function existingRenderIds(outDir: string): Set<string> {
  const ids = new Set<string>();
  const rendersDir = join(outDir, 'renders');
  if (!existsSync(rendersDir)) return ids;
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
        const meta = JSON.parse(readFileSync(join(rendersDir, run, f), 'utf8')) as { render_id?: unknown };
        if (typeof meta.render_id === 'string') ids.add(meta.render_id);
      } catch {
        /* an unreadable meta never blocks a run */
      }
    }
  }
  return ids;
}

function directionByStance(directions: Array<Record<string, unknown>>, stance: string | null): Record<string, unknown> {
  return directions.find((d) => d.stance === stance) ?? {};
}

function writeMeta(dir: string, pngName: string, meta: RenderMeta): void {
  writeFileSync(join(dir, metaName(pngName)), JSON.stringify(meta, null, 2));
}

async function generate(args: ReturnType<typeof parseArgs>, guard: GuardOptions, seen: Set<string>): Promise<void> {
  const briefs = JSON.parse(readFileSync(args.briefs, 'utf8')) as Brief[];
  const todo = briefs.slice(0, args.limit);
  // the handler module loads lazily AFTER the first guard pass, so a busy
  // box (guard exit 3) never even loads it
  let handler: ((task: never, ctx: undefined) => Promise<{ artifacts?: unknown[] }>) | null = null;
  let ok = 0;
  let failed = 0;
  for (const brief of todo) {
    await waitForQuietBox(guard);
    if (!handler) handler = (await import('../handler.js')).default;
    const runId = `${brief.id}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
    const runDir = join(args.out, 'renders', runId);
    const started = Date.now();
    try {
      const result = await handler({ requestParts: [{ text: brief.text }] } as never, undefined);
      const artifacts = (result.artifacts ?? []) as Array<{
        outputId?: string;
        fileName?: string;
        data: string | Buffer | Uint8Array;
      }>;
      const kitArtifact = artifacts.find((a) => a.outputId === 'kit');
      const kit = kitArtifact ? (JSON.parse(String(kitArtifact.data)) as Record<string, unknown>) : {};
      const directions = Array.isArray(kit.directions) ? (kit.directions as Array<Record<string, unknown>>) : [];
      mkdirSync(runDir, { recursive: true });
      if (kitArtifact) writeFileSync(join(runDir, 'design-kit.json'), String(kitArtifact.data));
      let wrote = 0;
      for (const artifact of artifacts) {
        const match = /^comp_(\d+)$/.exec(artifact.outputId ?? '');
        if (!match) continue;
        const idx = Number(match[1]) - 1;
        const stance = STANCE_ORDER[idx] ?? null;
        const bytes = Buffer.isBuffer(artifact.data) ? artifact.data : Buffer.from(artifact.data as Uint8Array);
        const pngName = artifact.fileName ?? `comp-${idx + 1}.png`;
        writeFileSync(join(runDir, pngName), bytes);
        const d = directionByStance(directions, stance);
        const meta: RenderMeta = {
          render_id: sha12(bytes),
          brief_id: brief.id,
          brief: brief.text,
          stance,
          compositionSource: typeof d.compositionSource === 'string' ? d.compositionSource : null,
          referenceId: typeof d.referenceId === 'string' ? d.referenceId : null,
          score: typeof d.score === 'number' ? d.score : null,
          parts: d.parts ?? null,
          origin: 'generated',
          createdAt: new Date().toISOString(),
        };
        writeMeta(runDir, pngName, meta);
        seen.add(meta.render_id);
        wrote++;
      }
      ok++;
      console.log(`[corpus] ${brief.id}: ${wrote} renders in ${((Date.now() - started) / 1000).toFixed(1)}s → ${runDir}`);
    } catch (err) {
      failed++;
      console.error(`[corpus] ${brief.id} FAILED after ${((Date.now() - started) / 1000).toFixed(1)}s:`, err);
    }
  }
  console.log(`[corpus] done: ${ok} briefs ok, ${failed} failed`);
  if (ok === 0 && failed > 0) process.exit(1);
}

function harvest(args: ReturnType<typeof parseArgs>, seen: Set<string>): void {
  let copied = 0;
  let skipped = 0;
  for (const src of args.harvest) {
    const srcDir = resolve(src);
    let entries: string[] = [];
    try {
      entries = readdirSync(srcDir);
    } catch {
      console.warn(`[harvest] cannot read ${srcDir} — skipped`);
      continue;
    }
    // comp-N.png (handler runs, stance by index) and <stem>.comp.png (demo
    // renders, meta in <stem>.spec.json). comps.png contact sheets match neither.
    const runComps = entries.filter((f) => /^comp-\d+\.png$/.test(f));
    const demoComps = entries.filter((f) => /\.comp\.png$/.test(f));
    if (!runComps.length && !demoComps.length) continue;
    const destDir = join(args.out, 'renders', `harvest-${basename(srcDir)}`);
    mkdirSync(destDir, { recursive: true });

    let directions: Array<Record<string, unknown>> = [];
    let kitBrief: string | null = null;
    if (runComps.length) {
      try {
        const kit = JSON.parse(readFileSync(join(srcDir, 'design-kit.json'), 'utf8')) as Record<string, unknown>;
        if (Array.isArray(kit.directions)) directions = kit.directions as Array<Record<string, unknown>>;
        if (typeof kit.brief === 'string') kitBrief = kit.brief;
      } catch {
        /* meta fields stay null without an adjacent kit */
      }
    }
    for (const f of runComps) {
      const bytes = readFileSync(join(srcDir, f));
      const id = sha12(bytes);
      if (seen.has(id)) {
        skipped++;
        continue;
      }
      const idx = Number(/^comp-(\d+)/.exec(f)?.[1] ?? 0) - 1;
      const stance = STANCE_ORDER[idx] ?? null;
      const d = directionByStance(directions, stance);
      copyFileSync(join(srcDir, f), join(destDir, f));
      writeMeta(destDir, f, {
        render_id: id,
        brief_id: `harvest:${basename(srcDir)}`,
        brief: kitBrief,
        stance,
        compositionSource: typeof d.compositionSource === 'string' ? d.compositionSource : null,
        referenceId: typeof d.referenceId === 'string' ? d.referenceId : null,
        score: typeof d.score === 'number' ? d.score : null,
        parts: d.parts ?? null,
        origin: 'harvested',
        sourcePath: join(srcDir, f),
        createdAt: new Date().toISOString(),
      });
      seen.add(id);
      copied++;
    }
    for (const f of demoComps) {
      const stem = f.replace(/\.comp\.png$/, '');
      const bytes = readFileSync(join(srcDir, f));
      const id = sha12(bytes);
      if (seen.has(id)) {
        skipped++;
        continue;
      }
      let source: Record<string, unknown> = {};
      try {
        const spec = JSON.parse(readFileSync(join(srcDir, `${stem}.spec.json`), 'utf8')) as Record<string, unknown>;
        if (spec.source && typeof spec.source === 'object') source = spec.source as Record<string, unknown>;
      } catch {
        /* meta fields stay null without an adjacent spec */
      }
      copyFileSync(join(srcDir, f), join(destDir, f));
      writeMeta(destDir, f, {
        render_id: id,
        brief_id: `harvest:${stem}`,
        brief: null,
        stance: typeof source.stance === 'string' ? source.stance : null,
        compositionSource: 'transfer-demo',
        referenceId: typeof source.referenceId === 'string' ? source.referenceId : null,
        score: null,
        parts: null,
        origin: 'harvested',
        sourcePath: join(srcDir, f),
        createdAt: new Date().toISOString(),
      });
      seen.add(id);
      copied++;
    }
  }
  console.log(`[harvest] ${copied} new renders copied, ${skipped} already in corpus`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const seen = existingRenderIds(args.out);
  if (args.harvest.length) {
    harvest(args, seen);
    return;
  }
  if (!args.briefs) {
    console.error('usage: corpus-run --briefs <file> --out <dir> [--limit N] | --harvest <dir>... --out <dir>');
    process.exit(2);
  }
  await generate(args, guardOptionsFromArgv(argv), seen);
}

await main();
