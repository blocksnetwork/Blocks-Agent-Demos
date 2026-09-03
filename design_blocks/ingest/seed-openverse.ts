import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Keyless companion to seed-pexels.ts: pulls openly-licensed reference
 * imagery from the Openverse API (CC0/CC-BY and similar; the license and
 * creator land in credits.json so attribution travels with every board).
 * Anonymous access is rate-limited — this script stays well under it.
 *
 *   npx tsx ingest/seed-openverse.ts "botanical green leaves" "pastel gradient" ...
 *   npx tsx ingest/ingest.ts ./inspo
 *
 * Same caveat as the Pexels seeder: these are mood/color/photography
 * references, not UI shots. For interface references, drop screenshots
 * you have rights to into ./inspo and run ingest.
 */

const FOLDER = './inspo';
const PER_QUERY = 4;

const DEFAULT_QUERIES = [
  'botanical leaves macro green',
  'minimal architecture light',
  'dark moody workspace desk',
  'pastel color gradient abstract',
  'warm editorial still life',
  'flat geometric illustration',
  'frosted glass texture',
  'moss forest closeup',
];

type OpenverseImage = {
  id: string;
  url?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  foreign_landing_url?: string;
  filetype?: string;
};

async function main() {
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
    const api =
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
      `&page_size=${PER_QUERY}&license_type=commercial&filter_dead=true`;
    const response = await fetch(api, {
      headers: { 'User-Agent': 'design-blocks-ingest/0.1' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.error(`Openverse returned ${response.status} for "${query}", skipping`);
      continue;
    }
    const { results = [] } = (await response.json()) as { results?: OpenverseImage[] };

    for (const image of results) {
      if (!image.url) continue;
      const ext = image.filetype === 'png' ? '.png' : '.jpg';
      const name = `openverse-${image.id.slice(0, 12)}${ext}`;
      try {
        const file = await fetch(image.url, {
          headers: { 'User-Agent': 'design-blocks-ingest/0.1' },
          signal: AbortSignal.timeout(30_000),
        });
        if (!file.ok) continue;
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.byteLength < 10_000) continue; // skip dead thumbnails
        await writeFile(join(FOLDER, name), bytes);
      } catch {
        continue;
      }
      const licenseLabel = `${(image.license ?? 'cc').toUpperCase()} ${image.license_version ?? ''}`.trim();
      credits[name] = {
        html:
          `<a href="${image.foreign_landing_url ?? 'https://openverse.org'}">` +
          `Image by ${image.creator ?? 'Unknown'}</a> (${licenseLabel}) via ` +
          `<a href="https://openverse.org">Openverse</a>`,
        source: 'openverse',
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
