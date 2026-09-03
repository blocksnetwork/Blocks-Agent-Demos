/**
 * Real assets, in the shape a coding agent can paste: inline SVG strings
 * with the matching npm import, a font install command, a hotlinkable
 * photo with its attribution HTML, and a procedural hero that needs no
 * key and no network at all.
 *
 * Icon search is hard-limited to permissive sets (Lucide ISC, Tabler MIT,
 * Heroicons MIT, Phosphor MIT) so nothing attribution-encumbered leaks
 * into a generated app. Asset fetching never fails the task — anything
 * unreachable is simply absent from the payload.
 */

import type { DesignTokens } from './tokens.js';

const OFFLINE = process.env.DESIGN_BLOCKS_OFFLINE === '1';
const PEXELS_KEY = process.env.PEXELS_API_KEY;

/** Permissive-license icon sets only, and how to import each from npm. */
const ICON_SETS: Record<string, { pkg: string; example: (name: string) => string }> = {
  lucide: { pkg: 'lucide-react', example: (n) => `import { ${pascal(n)} } from 'lucide-react'` },
  tabler: { pkg: '@tabler/icons-react', example: (n) => `import { Icon${pascal(n)} } from '@tabler/icons-react'` },
  heroicons: { pkg: '@heroicons/react', example: (n) => `import { ${pascal(n)}Icon } from '@heroicons/react/24/outline'` },
  ph: { pkg: '@phosphor-icons/react', example: (n) => `import { ${pascal(n)} } from '@phosphor-icons/react'` },
};
const PREFIXES = Object.keys(ICON_SETS).join(',');

export type IconAsset = { icon: string; svg?: string; npmPackage: string; npmImport: string };
export type PhotoAsset = {
  src: string;
  photographer: string;
  pageUrl: string;
  attributionHtml: string;
};
export type AssetBundle = {
  icons: IconAsset[];
  fonts: {
    display: string;
    body: string;
    bunnyCssUrl: string;
    fontsourceInstall: string;
    imports: string[];
  };
  photo?: PhotoAsset;
  hero: { proceduralSvg: string };
  pattern: { cssSnippet: string };
  notes: string[];
};

function pascal(name: string): string {
  return name
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(8_000), keepalive: false });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function getText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000), keepalive: false });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'and', 'with', 'app', 'page', 'site', 'website', 'web',
  'simple', 'basic', 'landing', 'my', 'our', 'new', 'that', 'this', 'of', 'to', 'in',
]);

/** A few terms from the brief plus the staples every UI ends up needing. */
export function iconQueries(brief: string): string[] {
  const fromBrief = brief
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    .slice(0, 3);
  return [...new Set([...fromBrief, 'arrow right', 'check', 'sparkles'])].slice(0, 6);
}

async function resolveIcon(query: string): Promise<IconAsset | null> {
  const search = await getJson<{ icons?: string[] }>(
    `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=32&prefixes=${PREFIXES}`,
  );
  const hit = search?.icons?.[0];
  if (!hit) return null;

  const [prefix, name] = hit.split(':');
  const set = ICON_SETS[prefix];
  if (!set) return null;

  const svg = await getText(`https://api.iconify.design/${prefix}/${name}.svg?height=24`);
  return {
    icon: hit,
    svg: svg ?? undefined,
    npmPackage: set.pkg,
    npmImport: set.example(name),
  };
}

async function resolvePhoto(query: string): Promise<PhotoAsset | undefined> {
  if (!PEXELS_KEY) return undefined;
  const result = await getJson<{
    photos?: Array<{
      src?: { large2x?: string };
      photographer?: string;
      photographer_url?: string;
      url?: string;
    }>;
  }>(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=3`,
    { Authorization: PEXELS_KEY },
  );
  const photo = result?.photos?.find((p) => p.src?.large2x);
  if (!photo) return undefined;
  return {
    src: photo.src!.large2x!,
    photographer: photo.photographer ?? 'Unknown',
    pageUrl: photo.url ?? 'https://www.pexels.com',
    attributionHtml:
      `<a href="${photo.url ?? 'https://www.pexels.com'}">Photo by ${photo.photographer ?? 'Unknown'}</a>` +
      ` on <a href="https://www.pexels.com">Pexels</a>`,
  };
}

/** A gradient hero built from the theme itself: zero keys, zero licenses. */
function proceduralHero(tokens: DesignTokens): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 480" role="img" aria-label="Decorative gradient">`,
    `  <defs>`,
    `    <linearGradient id="dm-hero" x1="0" y1="0" x2="1" y2="1">`,
    `      <stop offset="0%" stop-color="${tokens.primary}"/>`,
    `      <stop offset="100%" stop-color="${tokens.text}"/>`,
    `    </linearGradient>`,
    `    <radialGradient id="dm-glow" cx="0.8" cy="0.2" r="0.7">`,
    `      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>`,
    `      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>`,
    `    </radialGradient>`,
    `  </defs>`,
    `  <rect width="1200" height="480" fill="url(#dm-hero)"/>`,
    `  <rect width="1200" height="480" fill="url(#dm-glow)"/>`,
    `  <circle cx="1030" cy="360" r="180" fill="#ffffff" opacity="0.06"/>`,
    `  <circle cx="180" cy="90" r="120" fill="#ffffff" opacity="0.08"/>`,
    `</svg>`,
  ].join('\n');
}

function dotGrid(tokens: DesignTokens): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'>` +
    `<circle cx='2' cy='2' r='1.2' fill='${tokens.border}'/></svg>`;
  return `background-image: url("data:image/svg+xml,${encodeURIComponent(svg)}");`;
}

export async function gatherAssets(brief: string, tokens: DesignTokens): Promise<AssetBundle> {
  const notes: string[] = [];
  let icons: IconAsset[] = [];
  let photo: PhotoAsset | undefined;

  if (OFFLINE) {
    notes.push('Offline mode: icon SVGs and photos skipped; npm imports and procedural assets only.');
    icons = iconQueries(brief).map((q) => {
      const name = q.replace(/\s+/g, '-');
      return {
        icon: `lucide:${name}`,
        npmPackage: 'lucide-react',
        npmImport: ICON_SETS.lucide.example(name),
      };
    });
  } else {
    const [resolved, resolvedPhoto] = await Promise.all([
      Promise.all(iconQueries(brief).map(resolveIcon)),
      resolvePhoto(brief.split(/\s+/).slice(0, 4).join(' ') || 'abstract technology'),
    ]);
    icons = resolved.filter((i): i is IconAsset => i !== null);
    photo = resolvedPhoto;
    if (icons.length === 0) notes.push('Iconify was unreachable; use the npm packages directly.');
    if (!photo) {
      notes.push(
        PEXELS_KEY
          ? 'Pexels returned nothing for this brief; the procedural hero is the fallback.'
          : 'No PEXELS_API_KEY on the agent; the procedural hero is the fallback.',
      );
    } else {
      notes.push('The Pexels photo requires the included attribution HTML near where it is used.');
    }
  }

  return {
    icons,
    fonts: {
      display: tokens.fonts.display,
      body: tokens.fonts.body,
      bunnyCssUrl: tokens.fonts.bunnyCssUrl,
      fontsourceInstall: tokens.fonts.fontsourceInstall,
      imports: tokens.fonts.imports,
    },
    photo,
    hero: { proceduralSvg: proceduralHero(tokens) },
    pattern: { cssSnippet: dotGrid(tokens) },
    notes,
  };
}
