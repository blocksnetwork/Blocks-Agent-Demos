/**
 * Turns the bank's reference palettes into tokens a coding agent can
 * apply in one move. The matched moodboard seeds the colors, the brief's
 * vibe picks the fonts, and every text/background pair is walked until
 * it clears WCAG AA — direction you can link, not just look at.
 */

import { contrastRatio, hslToRgb, parseColor, rgbToHsl, toHex, type Rgba } from './color.js';

export type FontPairing = {
  vibe: string;
  display: string;
  body: string;
  bunnyCssUrl: string;
  fontsourceInstall: string;
  imports: string[];
};

export type DesignTokens = {
  primary: string;
  primaryText: string;
  primaryStrong: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  radius: string;
  spacing: number[];
  fonts: FontPairing;
};

/**
 * Curated pairings, all OFL-licensed, all on Bunny Fonts (Google-Fonts-
 * compatible CSS, EU CDN, no logging) and installable as @fontsource
 * packages for self-hosting. Matched against vibe words in the brief.
 */
const PAIRINGS: Array<FontPairing & { keywords: string[] }> = [
  {
    vibe: 'modern product',
    keywords: ['modern', 'saas', 'startup', 'product', 'clean', 'minimal'],
    display: 'Sora',
    body: 'Inter',
    bunnyCssUrl: 'https://fonts.bunny.net/css?family=sora:600,700|inter:400,500,600&display=swap',
    fontsourceInstall: 'npm install @fontsource/sora @fontsource/inter',
    imports: ["import '@fontsource/sora/700.css';", "import '@fontsource/inter/400.css';"],
  },
  {
    vibe: 'editorial',
    keywords: ['editorial', 'magazine', 'blog', 'writing', 'serif', 'warm', 'literary'],
    display: 'Fraunces',
    body: 'Inter',
    bunnyCssUrl: 'https://fonts.bunny.net/css?family=fraunces:600,700|inter:400,500,600&display=swap',
    fontsourceInstall: 'npm install @fontsource/fraunces @fontsource/inter',
    imports: ["import '@fontsource/fraunces/700.css';", "import '@fontsource/inter/400.css';"],
  },
  {
    vibe: 'technical',
    keywords: ['technical', 'developer', 'devtool', 'terminal', 'data', 'dashboard', 'api'],
    display: 'Space Grotesk',
    body: 'IBM Plex Sans',
    bunnyCssUrl:
      'https://fonts.bunny.net/css?family=space-grotesk:500,700|ibm-plex-sans:400,500,600&display=swap',
    fontsourceInstall: 'npm install @fontsource/space-grotesk @fontsource/ibm-plex-sans',
    imports: [
      "import '@fontsource/space-grotesk/700.css';",
      "import '@fontsource/ibm-plex-sans/400.css';",
    ],
  },
  {
    vibe: 'playful',
    keywords: ['playful', 'fun', 'kids', 'game', 'friendly', 'cute', 'social'],
    display: 'Baloo 2',
    body: 'Nunito',
    bunnyCssUrl: 'https://fonts.bunny.net/css?family=baloo-2:600,700|nunito:400,600,700&display=swap',
    fontsourceInstall: 'npm install @fontsource/baloo-2 @fontsource/nunito',
    imports: ["import '@fontsource/baloo-2/700.css';", "import '@fontsource/nunito/400.css';"],
  },
  {
    vibe: 'elegant',
    keywords: ['elegant', 'luxury', 'fashion', 'premium', 'boutique', 'wedding'],
    display: 'Playfair Display',
    body: 'Source Sans 3',
    bunnyCssUrl:
      'https://fonts.bunny.net/css?family=playfair-display:600,700|source-sans-3:400,600&display=swap',
    fontsourceInstall: 'npm install @fontsource/playfair-display @fontsource/source-sans-3',
    imports: [
      "import '@fontsource/playfair-display/700.css';",
      "import '@fontsource/source-sans-3/400.css';",
    ],
  },
  {
    vibe: 'organic notebook',
    keywords: ['journal', 'notebook', 'diary', 'organic', 'nature', 'garden', 'handmade', 'craft'],
    display: 'Lora',
    body: 'DM Sans',
    bunnyCssUrl: 'https://fonts.bunny.net/css?family=lora:600,700|dm-sans:400,500,700&display=swap',
    fontsourceInstall: 'npm install @fontsource/lora @fontsource/dm-sans',
    imports: ["import '@fontsource/lora/700.css';", "import '@fontsource/dm-sans/400.css';"],
  },
  {
    vibe: 'bold creative',
    keywords: ['creative', 'art', 'artist', 'marketplace', 'expressive', 'brutalist', 'studio', 'music'],
    display: 'Bricolage Grotesque',
    body: 'DM Sans',
    bunnyCssUrl:
      'https://fonts.bunny.net/css?family=bricolage-grotesque:600,700|dm-sans:400,500,700&display=swap',
    fontsourceInstall: 'npm install @fontsource/bricolage-grotesque @fontsource/dm-sans',
    imports: [
      "import '@fontsource/bricolage-grotesque/700.css';",
      "import '@fontsource/dm-sans/400.css';",
    ],
  },
  {
    vibe: 'friendly rounded',
    keywords: ['friendly', 'rounded', 'community', 'wellness', 'health', 'calm', 'cozy'],
    display: 'Outfit',
    body: 'Manrope',
    bunnyCssUrl: 'https://fonts.bunny.net/css?family=outfit:600,700|manrope:400,500,700&display=swap',
    fontsourceInstall: 'npm install @fontsource/outfit @fontsource/manrope',
    imports: ["import '@fontsource/outfit/700.css';", "import '@fontsource/manrope/400.css';"],
  },
];

export function pickPairing(brief: string, seed = 0): FontPairing {
  const lower = brief.toLowerCase();
  // Score by hit count — a brief saying "journal ... clean and modern"
  // is more notebook than product; first-match order would say otherwise.
  let hit: (typeof PAIRINGS)[number] | undefined;
  let bestHits = 0;
  for (const pairing of PAIRINGS) {
    const hits = pairing.keywords.filter((k) => lower.includes(k)).length;
    if (hits > bestHits) {
      hit = pairing;
      bestHits = hits;
    }
  }
  // No keyword hit: pick by seed rather than always defaulting to the
  // first row — vague briefs still get typographic variety.
  const { keywords: _drop, ...pairing } = hit ?? PAIRINGS[seed % PAIRINGS.length];
  return pairing;
}

/** Darken (or lighten) `color` until it reads against `on` at `target` or better. */
function solveContrast(color: Rgba, on: Rgba, target: number): Rgba {
  if (contrastRatio(color, on) >= target) return color;
  const { h, s, l } = rgbToHsl(color);
  const darkerWins = rgbToHsl(on).l > 0.5;
  for (let step = 1; step <= 20; step++) {
    const candidate = hslToRgb(h, s, darkerWins ? Math.max(0, l - step * 0.04) : Math.min(1, l + step * 0.04));
    if (contrastRatio(candidate, on) >= target) return candidate;
  }
  return darkerWins ? { r: 26, g: 26, b: 26, a: 1 } : { r: 250, g: 250, b: 250, a: 1 };
}

/**
 * Seed the tokens from the matched references' palettes, so the theme is
 * the moodboard made applicable. A board with no saturated color anywhere
 * gets a default indigo.
 */
export function deriveTokens(paletteHexes: string[], brief: string, seed = 0): DesignTokens {
  const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };

  let primary: Rgba | null = null;
  let bestSaturation = 0.25;
  for (const hexValue of paletteHexes) {
    const rgba = parseColor(hexValue);
    if (!rgba) continue;
    const { s, l } = rgbToHsl(rgba);
    if (s > bestSaturation && l > 0.15 && l < 0.75) {
      primary = rgba;
      bestSaturation = s;
    }
  }
  if (!primary) {
    // No saturated color anywhere on the board (muted photography does
    // this a lot): keep the board's dominant HUE and lift it to a usable
    // accent, instead of abandoning the moodboard for default indigo.
    let mutedBest: { h: number; s: number; l: number } | null = null;
    for (const hexValue of paletteHexes) {
      const rgba = parseColor(hexValue);
      if (!rgba) continue;
      const hsl = rgbToHsl(rgba);
      if (hsl.l <= 0.1 || hsl.l >= 0.9) continue;
      if (!mutedBest || hsl.s > mutedBest.s) mutedBest = hsl;
    }
    primary = mutedBest
      ? hslToRgb(mutedBest.h, Math.max(0.45, mutedBest.s), Math.min(0.5, Math.max(0.3, mutedBest.l)))
      : { r: 79, g: 70, b: 229, a: 1 }; // #4f46e5 — empty board only
  }
  primary = solveContrast(primary, white, 3); // buttons: large-text/UI threshold

  const bg: Rgba = { r: 250, g: 250, b: 249, a: 1 };
  const text = solveContrast({ r: 40, g: 40, b: 46, a: 1 }, bg, 7);
  const muted = solveContrast({ r: 110, g: 110, b: 120, a: 1 }, bg, 4.5);
  // Links are normal-size text on the page background, so they get a
  // variant of primary solved to the full 4.5:1.
  const primaryStrong = solveContrast(primary, bg, 4.5);
  const ink: Rgba = { r: 26, g: 26, b: 26, a: 1 };

  return {
    primary: toHex(primary),
    primaryText:
      contrastRatio(white, primary) >= contrastRatio(ink, primary) ? '#ffffff' : '#1a1a1a',
    primaryStrong: toHex(primaryStrong),
    bg: toHex(bg),
    surface: '#ffffff',
    text: toHex(text),
    muted: toHex(muted),
    border: '#e4e4e7',
    radius: '10px',
    spacing: [4, 8, 12, 16, 24, 32, 48, 64],
    fonts: pickPairing(brief, seed),
  };
}

/**
 * Append-safe stylesheet: custom properties plus plain element overrides,
 * so "link it last" always visibly applies no matter how the app's own
 * CSS is organized. No classes to adopt, nothing to refactor first.
 */
export function buildThemeCss(t: DesignTokens): string {
  return `/* Design Blocks theme — link this last, after your existing styles. */
@import url('${t.fonts.bunnyCssUrl}');

:root {
  --design-primary: ${t.primary};
  --design-primary-text: ${t.primaryText};
  --design-primary-strong: ${t.primaryStrong};
  --design-bg: ${t.bg};
  --design-surface: ${t.surface};
  --design-text: ${t.text};
  --design-muted: ${t.muted};
  --design-border: ${t.border};
  --design-radius: ${t.radius};
  --design-font-display: '${t.fonts.display}', system-ui, sans-serif;
  --design-font-body: '${t.fonts.body}', system-ui, sans-serif;
  ${t.spacing.map((s, i) => `--design-space-${i + 1}: ${s}px;`).join('\n  ')}
}

body {
  background: var(--design-bg);
  color: var(--design-text);
  font-family: var(--design-font-body);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  font-family: var(--design-font-display);
  color: var(--design-text);
  line-height: 1.15;
  letter-spacing: -0.015em;
}
h1 { font-size: clamp(2rem, 5vw, 3rem); margin-bottom: var(--design-space-4); }
h2 { font-size: clamp(1.4rem, 3vw, 1.9rem); margin-bottom: var(--design-space-3); }
h3 { font-size: 1.15rem; margin-bottom: var(--design-space-2); }

p { color: var(--design-muted); max-width: 65ch; }

a { color: var(--design-primary-strong); text-decoration-thickness: 1px; text-underline-offset: 2px; }

button, [type='submit'], .btn {
  background: var(--design-primary);
  color: var(--design-primary-text);
  font-family: var(--design-font-body);
  font-weight: 600;
  border: none;
  border-radius: var(--design-radius);
  padding: var(--design-space-3) var(--design-space-5);
  cursor: pointer;
  transition: filter 120ms ease;
}
button:hover, [type='submit']:hover, .btn:hover { filter: brightness(1.08); }

input, select, textarea {
  font-family: var(--design-font-body);
  color: var(--design-text);
  background: var(--design-surface);
  border: 1px solid var(--design-border);
  border-radius: var(--design-radius);
  padding: var(--design-space-3) var(--design-space-4);
}
input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--design-primary);
  outline-offset: 1px;
}
`;
}
