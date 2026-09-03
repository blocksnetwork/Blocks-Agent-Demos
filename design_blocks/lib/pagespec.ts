/**
 * The blueprint layer — the difference between "advice" and a design.
 *
 * A page TYPE is inferred from the brief (a journal is not a landing
 * page), then a composition GENOME is sampled from an RNG seeded by the
 * brief text itself: hero form, display scale, accent treatment, overlap,
 * tilt, density, motion energy. It is a grammar with seeded sampling, not
 * a template — two different briefs cannot produce the same blueprint,
 * even with every model offline, while the same brief reproduces exactly.
 *
 * Qwen fills the blueprint with copy and floating-element content; the
 * structure and the numbers come from the genome and per-type recipes.
 */

import { chat } from './qwen.js';
import type { DesignTokens } from './tokens.js';

export type PageType = 'landing' | 'journal' | 'dashboard' | 'pricing' | 'portfolio' | 'app';

export type Genome = {
  seed: number;
  pageType: PageType;
  heroForm: 'split-editorial' | 'centered-stage' | 'collage-stack' | 'orbital-float' | 'banner-ledger';
  displayPx: number;
  scaleRatio: number;
  accent: 'phrase' | 'underline' | 'highlight';
  overlap: boolean;
  tilt: boolean;
  radius: 'sharp' | 'soft' | 'round' | 'pill';
  density: 'airy' | 'regular' | 'packed';
  motionEnergy: 'calm' | 'lively' | 'snappy';
};

export type FloatingElement = { kind: 'stat' | 'badge' | 'tag' | 'mini'; text: string; value?: string };

export type PageCopy = {
  headline: string;
  accentPhrase: string;
  subhead: string;
  sections: Array<{ section: string; title: string; note: string }>;
  floating: FloatingElement[];
};

/** djb2 — stable across runs, sensitive to every character of the brief. */
export function hashBrief(brief: string): number {
  let hash = 5381;
  for (let i = 0; i < brief.length; i++) hash = ((hash << 5) + hash + brief.charCodeAt(i)) >>> 0;
  return hash;
}

/** mulberry32: tiny deterministic PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, options: readonly T[]): T {
  return options[Math.floor(random() * options.length)];
}

const TYPE_HINTS: Array<{ type: PageType; words: string[] }> = [
  { type: 'journal', words: ['journal', 'diary', 'notebook', 'log', 'entries', 'timeline', 'notes', 'tracker'] },
  { type: 'dashboard', words: ['dashboard', 'analytics', 'admin', 'metrics', 'console', 'monitor'] },
  { type: 'pricing', words: ['pricing', 'plans', 'tiers', 'subscription', 'checkout'] },
  { type: 'portfolio', words: ['portfolio', 'gallery', 'showcase', 'marketplace', 'collection', 'shop'] },
  { type: 'landing', words: ['landing', 'waitlist', 'homepage', 'launch', 'marketing', 'signup', 'hero'] },
];

export function inferPageType(brief: string): PageType {
  const lower = brief.toLowerCase();
  for (const { type, words } of TYPE_HINTS) {
    if (words.some((w) => lower.includes(w))) return type;
  }
  return 'app';
}

/** Hero forms that make sense per page type — weighted, then sampled. */
const HERO_FORMS: Record<PageType, Genome['heroForm'][]> = {
  landing: ['split-editorial', 'centered-stage', 'collage-stack', 'orbital-float'],
  journal: ['banner-ledger', 'split-editorial'],
  dashboard: ['banner-ledger'],
  pricing: ['centered-stage', 'split-editorial'],
  portfolio: ['collage-stack', 'split-editorial'],
  app: ['split-editorial', 'centered-stage', 'banner-ledger'],
};

export function genomeFor(brief: string, axisIndex: number): Genome {
  const pageType = inferPageType(brief);
  const seed = hashBrief(`${brief}::${axisIndex}`);
  const random = rng(seed);

  return {
    seed,
    pageType,
    heroForm: pick(random, HERO_FORMS[pageType]),
    displayPx: 64 + Math.floor(random() * 8) * 8, // 64..120
    scaleRatio: 1.25 + Math.floor(random() * 4) * 0.1, // 1.25..1.55
    accent: pick(random, ['phrase', 'underline', 'highlight'] as const),
    overlap: random() > 0.35,
    tilt: random() > 0.55,
    radius: pick(random, ['sharp', 'soft', 'round', 'pill'] as const),
    density: pick(random, ['airy', 'airy', 'regular', 'packed'] as const),
    motionEnergy: pick(random, ['calm', 'lively', 'snappy'] as const),
  };
}

const SECTION_RECIPES: Record<PageType, string[]> = {
  landing: ['nav', 'hero', 'proof', 'features', 'showcase', 'cta', 'footer'],
  journal: ['nav', 'header-band', 'composer', 'timeline', 'collection-rail', 'footer'],
  dashboard: ['topbar', 'stat-row', 'main-panel', 'activity-feed'],
  pricing: ['nav', 'hero', 'plans', 'comparison', 'faq', 'footer'],
  portfolio: ['nav', 'hero', 'grid', 'spotlight', 'about', 'footer'],
  app: ['nav', 'hero', 'features', 'detail', 'cta', 'footer'],
};

const RADIUS_PX: Record<Genome['radius'], string> = { sharp: '2px', soft: '10px', round: '18px', pill: '28px' };
const SECTION_PAD: Record<Genome['density'], string> = { airy: '128px', regular: '96px', packed: '64px' };

type SpecLike = {
  name: string;
  adjectives: string[];
  palette: string[];
  tokens: DesignTokens;
};

function heroRecipe(genome: Genome, copy: PageCopy, spec: SpecLike): string[] {
  const t = spec.tokens;
  const accentLine =
    genome.accent === 'phrase'
      ? `color ONLY the words "${copy.accentPhrase}" in ${t.primaryStrong}; the rest of the headline stays ${t.text}`
      : genome.accent === 'underline'
        ? `give the words "${copy.accentPhrase}" a hand-drawn-feel underline (an inline SVG stroke in ${t.primary}, 6px, slightly overshooting)`
        : `give the words "${copy.accentPhrase}" a ${t.primary} highlight block behind them (padding 0 8px, color ${t.primaryText})`;

  const forms: Record<Genome['heroForm'], string[]> = {
    'split-editorial': [
      `Two-column split, 55/45, aligned to a 12-col grid with 80px outer margins.`,
      `LEFT: eyebrow label (13px, uppercase, letter-spacing 3px, ${t.muted}) → headline → subhead (18px, ${t.muted}, max 46ch) → CTA row (primary pill + ghost link with underline-draw hover).`,
      `RIGHT: the hero image bleeding to the viewport edge, with 2-3 floating sticker/stat elements overlapping its left edge by 24-40px${genome.tilt ? ', each rotated between -6deg and 5deg' : ''}. Attach data-float to each so they drift.`,
    ],
    'centered-stage': [
      `Single centered column, max-width 880px, headline centered.`,
      `Below the CTA row, the hero image sits as a wide stage (aspect ~2.2:1) with 3-4 floating UI chips (stickers from the asset pack) positioned absolutely AROUND and OVERLAPPING its edges${genome.tilt ? ' at slight rotations (-5deg..6deg)' : ''} — like satellites, data-float on each with different --float-delay.`,
    ],
    'collage-stack': [
      `Asymmetric: headline block occupies the left 5 columns; the right 7 columns hold a COLLAGE of 4-5 overlapping cards (hero image crops + sticker badges), each rotated -7deg..8deg, overlapping 20-35%, with the sticker badges pinned to card corners like labels.`,
      `The collage must feel hand-placed: no two rotations equal, z-index order deliberate, one card breaking out of the section's bottom edge.`,
    ],
    'orbital-float': [
      `Centered headline over a large hero visual; 4-5 floating stat/mini cards (asset pack) orbit it at different depths — vary their scale (0.8x-1.1x), blur the furthest one 1px, data-float with staggered delays so they drift independently.`,
      `Draw one thin elliptical orbit line (SVG, 1px, ${t.border}) behind the cards.`,
    ],
    'banner-ledger': [
      `Compact banner (not a tall hero): the hero image as a full-width band of ~300-360px height with the headline and one action inside it, bottom-left aligned, on a scrim.`,
      `Content starts immediately below — this page is about the CONTENT (entries/data), the banner just sets the mood.`,
    ],
  };

  return [
    `Headline: "${copy.headline}" set in ${t.fonts.display} at ${genome.displayPx}px/1.05, weight 700, letter-spacing -0.02em. ${accentLine}.`,
    ...forms[genome.heroForm],
    `Subhead: "${copy.subhead}"`,
  ];
}

function sectionRecipe(section: string, genome: Genome, copy: PageCopy, spec: SpecLike): string[] {
  const t = spec.tokens;
  const sectionCopy = copy.sections.find((s) => s.section === section);
  const title = sectionCopy?.title ?? section;
  const note = sectionCopy?.note ?? '';
  const pad = SECTION_PAD[genome.density];

  const recipes: Record<string, string[]> = {
    nav: [
      `Slim nav, 64px: wordmark left (${t.fonts.display} 700, 20px), 3-4 links center-right (15px, underline-draw hover), one pill CTA. Background ${t.bg} with a 1px ${t.border} bottom border that only appears after 40px of scroll (add .is-scrolled via motion.js).`,
    ],
    hero: heroRecipe(genome, copy, spec),
    proof: [
      `A quiet logo/social-proof strip: 5-6 items, grayscale at 60% opacity, hover restores color (200ms). Single row, ${pad} top padding halved.`,
    ],
    features: [
      `"${title}" — 3 feature cards on an asymmetric rhythm: middle card offset -24px vertically${genome.tilt ? ', outer cards rotated ±1.5deg' : ''}. Card: icon (asset pack, 28px in a ${RADIUS_PX[genome.radius]} tinted square of ${t.primary} at 12% opacity), 20px title in ${t.fonts.display}, 16px body ${t.muted}. data-reveal-group so they stagger in. Hover: lift.`,
      note ? `Content angle: ${note}` : '',
    ],
    showcase: [
      `"${title}" — one large panel: hero image crop as background, a floating mini-card (asset pack) overlapping its corner, and a short claim (32px display). Panel radius ${RADIUS_PX[genome.radius]}, breaks the container by extending 64px into the outer margin on one side.`,
      note ? `Content angle: ${note}` : '',
    ],
    cta: [
      `Full-bleed closer on ${t.text} (dark) with ${t.bg} text: 48px display line, one ${t.primary} pill button, generous ${pad} padding. Place one drifting sticker behind the text at 20% opacity.`,
    ],
    footer: [`Minimal footer: wordmark, 3 links, credit line, 14px ${t.muted}. No wall of columns.`],
    'header-band': [
      `Identity band ~280px: hero image as background, page name + one-line purpose bottom-left on a scrim, one stat chip (asset pack) floating on the right edge.`,
    ],
    composer: [
      `"${title}" — the primary input surface, elevated card (${RADIUS_PX[genome.radius]}, subtle shadow) sitting 32px OVERLAPPING the band above it. Inside: entity selector + quick-action chips (pill, one ${t.primary} filled when active) + a generous textarea. This is the page's hero — make it feel like the first thing to touch.`,
      note ? `Content angle: ${note}` : '',
    ],
    timeline: [
      `"${title}" — a true timeline, not a card list: a 2px ${t.border} vertical rail on the left, entries hanging off it with ${t.primary} node dots. Entry: date (13px uppercase ${t.muted}), body 16px, tag pills. Alternate subtle background tints per entry group. data-reveal on each entry so scrolling walks the history in.`,
      note ? `Content angle: ${note}` : '',
    ],
    'collection-rail': [
      `"${title}" — horizontal scroll rail of item cards (scroll-snap-x, no visible scrollbar), each card ${RADIUS_PX[genome.radius]} with a status dot and last-event line. The rail bleeds off the right viewport edge to invite scrolling.`,
    ],
    topbar: [`Dense topbar 56px: wordmark, search field (flex-1, max 420px), avatar. Bottom border ${t.border}.`],
    'stat-row': [
      `4 stat chips (asset pack) in a row, each with a 7-day sparkline placeholder; first chip uses the ${t.primary} accent treatment. data-reveal-group.`,
    ],
    'main-panel': [`Primary panel 2/3 + side panel 1/3. Primary holds the main visualization; side holds a ranked list with hover-lift rows.`],
    'activity-feed': [`Feed rows with left icon squares (tinted like feature icons), timestamps right-aligned, newest first, data-reveal per row.`],
    plans: [
      `"${title}" — 3 plan cards, the recommended one scaled 1.04 with a ${t.primary} border and a floating badge sticker overlapping its top edge. Annual/monthly toggle as a pill switch.`,
    ],
    comparison: [`Comparison table with sticky header row; check icons in ${t.primaryStrong}, not text.`],
    faq: [`FAQ as disclosure rows, plus-icon rotates 45deg on open (200ms).`],
    grid: [
      `"${title}" — masonry-feel grid (2-3 col, varied item heights), items hover-lift with a caption bar sliding up. ${genome.tilt ? 'Every 4th item rotated 1.5deg.' : ''}`,
    ],
    spotlight: [`One full-width spotlight: large image crop, oversized caption (40px display) overlapping its edge.`],
    about: [`Short about band: 24px text, max 60ch, one pull-quote line in ${t.fonts.display}.`],
    detail: [
      `"${title}" — alternating media/text rows (image one side, copy the other, swap each row), 45/55 split, ${pad} between rows, data-reveal per row.`,
      note ? `Content angle: ${note}` : '',
    ],
  };

  return (recipes[section] ?? [`"${title}" — ${note}`]).filter(Boolean);
}

export function fallbackCopy(brief: string, genome: Genome): PageCopy {
  const words = brief.split(/[^a-zA-Z]+/).filter((w) => w.length > 3);
  const subject = words.slice(0, 3).join(' ') || 'your product';
  const sections = SECTION_RECIPES[genome.pageType].map((section) => ({
    section,
    title: section.replace(/-/g, ' '),
    note: '',
  }));
  return {
    headline: brief.split(/[—,.]/)[0].slice(0, 60) || 'Make it feel designed',
    accentPhrase: words[1] ?? words[0] ?? 'designed',
    subhead: `Everything ${subject} needs, in one place.`,
    sections,
    floating: [
      { kind: 'stat', text: 'This week', value: '12' },
      { kind: 'badge', text: `@${(words[0] ?? 'you').toLowerCase()}` },
      { kind: 'tag', text: words[2] ?? 'new' },
      { kind: 'mini', text: subject },
    ],
  };
}

export async function writeCopy(brief: string, genome: Genome, spec: SpecLike): Promise<PageCopy> {
  const fallback = fallbackCopy(brief, genome);
  const sectionNames = SECTION_RECIPES[genome.pageType];

  const reply = await chat(
    [
      {
        role: 'system',
        content:
          'You write copy and content for a page blueprint. Reply with ONLY JSON: ' +
          '{"headline": "<5-9 words, no cliches, specific to the product>", ' +
          '"accent_phrase": "<2-3 consecutive words FROM the headline to accent>", ' +
          '"subhead": "<one sentence, concrete benefit>", ' +
          '"sections": [{"section": "<name from the given list>", "title": "<2-4 words>", "note": "<one sentence: what content goes here, specific to THIS product>"}], ' +
          '"floating": [{"kind": "stat|badge|tag|mini", "text": "<short label>", "value": "<short value, for stat only>"}] with 4 entries whose content comes from the product domain (a plant app floats watering stats, a fintech floats balances).',
      },
      {
        role: 'user',
        content: `Brief: ${brief}\nPage type: ${genome.pageType}\nDirection: ${spec.name} — ${spec.adjectives.join(', ')}\nSections: ${sectionNames.join(', ')}`,
      },
    ],
    700,
  );

  if (!reply) return fallback;
  try {
    const cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const headline = typeof parsed.headline === 'string' && parsed.headline ? parsed.headline : fallback.headline;
    const accent = typeof parsed.accent_phrase === 'string' && headline.toLowerCase().includes(parsed.accent_phrase.toLowerCase())
      ? parsed.accent_phrase
      : fallback.accentPhrase;
    return {
      headline,
      accentPhrase: accent,
      subhead: typeof parsed.subhead === 'string' ? parsed.subhead : fallback.subhead,
      sections: Array.isArray(parsed.sections)
        ? sectionNames.map((name) => {
            const found = (parsed.sections as Array<Record<string, string>>).find((s) => s.section === name);
            return { section: name, title: found?.title ?? name, note: found?.note ?? '' };
          })
        : fallback.sections,
      floating: Array.isArray(parsed.floating)
        ? (parsed.floating as Array<Record<string, string>>)
            .filter((f) => ['stat', 'badge', 'tag', 'mini'].includes(f.kind) && typeof f.text === 'string')
            .slice(0, 5)
            .map((f) => ({ kind: f.kind as FloatingElement['kind'], text: f.text, value: f.value }))
        : fallback.floating,
    };
  } catch {
    console.error(`[design-blocks] copy reply was not JSON: ${reply.slice(0, 80)}`);
    return fallback;
  }
}

/** The build plan itself — section by section, with exact numbers. */
export function buildBlueprint(brief: string, genome: Genome, copy: PageCopy, spec: SpecLike): string {
  const t = spec.tokens;
  const lines: string[] = [
    `# Blueprint — ${copy.headline}`,
    '',
    `Page type: **${genome.pageType}** · hero form: **${genome.heroForm}** · direction: **${spec.name}** (${spec.adjectives.join(', ')})`,
    '',
    '## Global rules (non-negotiable)',
    '',
    `- Type scale: display ${genome.displayPx}px, then divide by ${genome.scaleRatio} per step down (h2 ≈ ${Math.round(genome.displayPx / genome.scaleRatio)}px, h3 ≈ ${Math.round(genome.displayPx / genome.scaleRatio ** 2)}px, body 16-18px). Display face: ${t.fonts.display}. Body: ${t.fonts.body}.`,
    `- Section vertical padding: ${SECTION_PAD[genome.density]}. Corner radius family: ${RADIUS_PX[genome.radius]} everywhere (buttons may go pill).`,
    `- Color roles: page ${t.bg}, surfaces ${t.surface}, text ${t.text}, muted ${t.muted}, actions ${t.primary} (text on it: ${t.primaryText}), links/accents ${t.primaryStrong}. Use palette extras (${spec.palette.join(' ')}) only as tints and accents — never as text colors.`,
    `- Link design-theme.css last, then design-motion.css, then design-motion.js (defer). Wire motion via the data-attributes named below; never write ad-hoc keyframes.`,
    `- ${genome.overlap ? 'Layering is the signature: at least three elements on this page must overlap a neighbor or break their container.' : 'Keep elements on-grid; whitespace is the signature.'}`,
    `- NEVER: a centered gradient card as the hero, three identical white boxes in a row, or default-gray borders on everything. If a section below conflicts with a habit, the section wins.`,
    '',
  ];

  for (const section of SECTION_RECIPES[genome.pageType]) {
    lines.push(`## ${section}`, '');
    for (const line of sectionRecipe(section, genome, copy, spec)) lines.push(`- ${line}`);
    lines.push('');
  }

  lines.push(
    '## Floating elements (from the sticker assets)',
    '',
    ...copy.floating.map(
      (f) => `- ${f.kind}: "${f.text}"${f.value ? ` = ${f.value}` : ''} — place per the hero/section notes, always with data-float`,
    ),
    '',
    '## Motion pass (after layout works)',
    '',
    `- Energy: ${genome.motionEnergy}. Add data-reveal to every section's first heading, data-reveal-group to card/row containers, data-float to every sticker, hover-lift to cards. Details and timings live in design-motion.css.`,
  );

  return lines.join('\n');
}
