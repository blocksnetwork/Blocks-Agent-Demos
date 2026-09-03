import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import type { BankEntry } from '../lib/bank.js';
import { embedImage, extractPalette, makeThumb } from '../lib/sidecar.js';
import { tagImage } from '../lib/qwen.js';
import { classifyKind, zeroShotTags } from '../lib/zeroshot.js';
import { analyzeReference, analysisUsable } from '../lib/analysis.js';

/**
 * Build (or extend) the bank from a folder of reference images.
 *
 *   npx tsx ingest/ingest.ts ./my-inspo-folder [--bank ./bank]
 *
 * Only ingest images you have the right to use. The folder may carry a
 * credits.json ({"file.jpg": {"html": "<a ...>Photo by ...</a>", "source": "pexels"}});
 * those credits travel with the reference into every board it appears on.
 *
 * Per image: CLIP embedding + palette + thumbnail from the embed sidecar,
 * vibe/tags/notes from Qwen over the local vLLM, a ui-vs-photo kind from
 * zero-shot CLIP, and — when vLLM is up — a cached structural design
 * decomposition (bank/analysis/<id>.json) that the composition planner
 * transfers from at query time. Re-running skips images already in the
 * index (content-hashed), so it is safe to run repeatedly.
 */

const EXTENSIONS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function argAfter(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const source = process.argv[2];
  if (!source || source.startsWith('--')) {
    console.error('Usage: npx tsx ingest/ingest.ts ./folder-of-images [--bank ./bank]');
    process.exit(1);
  }
  const bankDir = argAfter('--bank', './bank');

  await mkdir(join(bankDir, 'refs'), { recursive: true });
  await mkdir(join(bankDir, 'thumbs'), { recursive: true });
  await mkdir(join(bankDir, 'analysis'), { recursive: true });

  let entries: BankEntry[] = [];
  try {
    entries = (JSON.parse(await readFile(join(bankDir, 'index.json'), 'utf8')) as { entries: BankEntry[] }).entries ?? [];
  } catch {
    /* first run */
  }
  const known = new Set(entries.map((e) => e.id));

  let credits: Record<string, { html: string; source: string }> = {};
  try {
    credits = JSON.parse(await readFile(join(source, 'credits.json'), 'utf8'));
  } catch {
    /* no credits file — fine for images you own */
  }

  const files = (await readdir(source)).filter((f) => EXTENSIONS[extname(f).toLowerCase()]);
  if (files.length === 0) {
    console.error(`No images (${Object.keys(EXTENSIONS).join(' ')}) found in ${source}.`);
    process.exit(1);
  }

  let added = 0;
  for (const file of files) {
    const bytes = new Uint8Array(await readFile(join(source, file)));
    const id = createHash('sha1').update(bytes).digest('hex').slice(0, 12);
    if (known.has(id)) {
      console.log(`= ${file} already in the bank, skipping`);
      continue;
    }

    const ext = extname(file).toLowerCase();
    const [embedding, palette, thumb, qwenTags] = await Promise.all([
      embedImage(bytes),
      extractPalette(bytes),
      makeThumb(bytes),
      tagImage(bytes, EXTENSIONS[ext]),
    ]);
    if (!embedding) console.error(`  ! no embedding for ${file} (sidecar down?) — keyword search only`);
    // vLLM down: fall back to zero-shot CLIP labels over the same sidecar.
    const tags = qwenTags ?? (embedding ? await zeroShotTags(embedding) : null);
    if (!tags) console.error(`  ! no tags for ${file} (vLLM and sidecar down?) — ingesting unlabeled`);
    const kind = embedding ? await classifyKind(embedding) : 'unknown';

    // The structural decomposition is what composition transfer runs on.
    // Ingest is the cheap moment to pay for it; query time backfills any
    // entry this could not cover.
    let analysisFile: string | undefined;
    const analysis = await analyzeReference(bytes, EXTENSIONS[ext], id);
    if (analysisUsable(analysis)) {
      analysisFile = join('analysis', `${id}.json`);
      await writeFile(join(bankDir, analysisFile), JSON.stringify(analysis, null, 1));
    } else {
      console.error(`  ! no structural analysis for ${file} (vLLM down?) — will backfill at query time`);
    }

    const refFile = join('refs', `${id}${ext}`);
    const thumbFile = join('thumbs', `${id}.jpg`);
    await writeFile(join(bankDir, refFile), bytes);
    await writeFile(join(bankDir, thumbFile), thumb ?? bytes);

    entries.push({
      id,
      file: refFile,
      thumb: thumbFile,
      vibe: tags?.vibe ?? 'unlabeled',
      tags: tags?.tags ?? [],
      notes: tags?.notes ?? '',
      palette: palette ?? [],
      attribution: credits[basename(file)],
      kind,
      analysisFile,
      embedding: embedding ?? [],
    });
    known.add(id);
    added++;
    console.log(`+ ${file} -> ${id} (${kind}, ${tags?.vibe ?? 'unlabeled'}${analysisFile ? ', analyzed' : ''})`);
  }

  await writeFile(join(bankDir, 'index.json'), JSON.stringify({ entries }, null, 1));
  console.log(`\nBank: ${entries.length} references (${added} new) in ${bankDir}/index.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
