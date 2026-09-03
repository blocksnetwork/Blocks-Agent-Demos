import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Legally seed an inspiration folder from Pexels (free key, hotlink- and
 * download-friendly licence) so the demo has a bank without you saving a
 * single image by hand. These are mood/color/photography references, not
 * UI shots — for actual interface references, drop images you have rights
 * to into the same folder and run ingest.
 *
 *   PEXELS_API_KEY=... npx tsx ingest/seed-pexels.ts "dark moody interior" "pastel gradient" ...
 *   npx tsx ingest/ingest.ts ./inspo
 *
 * Writes ./inspo/*.jpg plus credits.json, which ingest merges so every
 * board that shows a seeded photo carries its credit.
 */

const FOLDER = './inspo';
const PER_QUERY = 4;

const DEFAULT_QUERIES = [
  'minimal architecture light',
  'dark moody workspace',
  'pastel color gradient abstract',
  'botanical green leaves closeup',
  'bold neon night city',
  'warm editorial still life',
];

type PexelsPhoto = {
  id: number;
  src?: { large?: string };
  photographer?: string;
  url?: string;
};

async function main() {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    console.error('PEXELS_API_KEY is not set — get a free key at https://www.pexels.com/api/');
    process.exit(1);
  }
  const queries = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const useQueries = queries.length ? queries : DEFAULT_QUERIES;

  await mkdir(FOLDER, { recursive: true });
  let credits: Record<string, { html: string; source: string }> = {};
  try {
    credits = JSON.parse(await readFile(join(FOLDER, 'credits.json'), 'utf8'));
  } catch {
    /* first run */
  }

  for (const query of useQueries) {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_QUERY}`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) {
      console.error(`Pexels returned ${response.status} for "${query}", skipping`);
      continue;
    }
    const { photos = [] } = (await response.json()) as { photos?: PexelsPhoto[] };

    for (const photo of photos) {
      if (!photo.src?.large) continue;
      const name = `pexels-${photo.id}.jpg`;
      const image = await fetch(photo.src.large, { signal: AbortSignal.timeout(30_000) });
      if (!image.ok) continue;
      await writeFile(join(FOLDER, name), new Uint8Array(await image.arrayBuffer()));
      credits[name] = {
        html:
          `<a href="${photo.url ?? 'https://www.pexels.com'}">Photo by ${photo.photographer ?? 'Unknown'}</a>` +
          ` on <a href="https://www.pexels.com">Pexels</a>`,
        source: 'pexels',
      };
      console.log(`+ ${name}  (${query})`);
    }
  }

  await writeFile(join(FOLDER, 'credits.json'), JSON.stringify(credits, null, 2));
  console.log(`\nSeeded ${FOLDER} — now run: npx tsx ingest/ingest.ts ${FOLDER}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
