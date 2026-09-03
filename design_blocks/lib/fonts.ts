/**
 * Runtime font fetching for the comp renderer. Satori needs raw TTF data;
 * Fontsource mirrors every family on jsDelivr with a deterministic URL,
 * so fonts are fetched on first use and disk-cached forever after. If a
 * family cannot be fetched from either the deterministic URL or the
 * Fontsource API, the caller drops to whatever faces did load.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CACHE_DIR = process.env.FONT_CACHE_DIR ?? './fonts-cache';

export type SatoriFont = { name: string; data: ArrayBuffer; weight: number; style: 'normal' };

export function fontId(family: string): string {
  return family.toLowerCase().replace(/\s+/g, '-');
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000), keepalive: false });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function fontData(family: string, weight: number): Promise<Buffer | null> {
  const id = fontId(family);
  const cachePath = join(CACHE_DIR, `${id}-${weight}.ttf`);

  try {
    return await readFile(cachePath);
  } catch {
    /* not cached yet */
  }

  // Deterministic jsDelivr URL first, the Fontsource API's own URL second.
  let bytes = await fetchBytes(
    `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-${weight}-normal.ttf`,
  );
  if (!bytes) {
    try {
      const meta = (await (
        await fetch(`https://api.fontsource.org/v1/fonts/${id}`, { signal: AbortSignal.timeout(10_000) })
      ).json()) as { variants?: Record<string, { normal?: { latin?: { url?: { ttf?: string } } } }> };
      const url = meta.variants?.[String(weight)]?.normal?.latin?.url?.ttf;
      if (url) bytes = await fetchBytes(url);
    } catch {
      /* API down too */
    }
  }
  if (!bytes) {
    console.error(`[design-blocks] could not fetch font ${family} ${weight}`);
    return null;
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, bytes);
  return bytes;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

/**
 * Load the faces one comp needs: display 700, body 400 and 700. Returns
 * null when nothing at all could be loaded — the caller then skips comps
 * rather than rendering tofu.
 */
export async function loadFonts(display: string, body: string): Promise<SatoriFont[] | null> {
  const wanted: Array<{ family: string; weight: number }> = [
    { family: display, weight: 700 },
    { family: body, weight: 400 },
    { family: body, weight: 700 },
  ];

  const fonts: SatoriFont[] = [];
  for (const { family, weight } of wanted) {
    const data = await fontData(family, weight);
    if (data) fonts.push({ name: family, data: toArrayBuffer(data), weight, style: 'normal' });
  }
  if (fonts.length === 0) return null;
  return fonts;
}
