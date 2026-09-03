/**
 * Three competing directions from one brief. Anchors come from
 * farthest-point sampling over the retrieved references' CLIP embeddings
 * (max visual spread), then ONE Qwen call writes all three jointly under
 * forced axes — faithful, bolder, unexpected — so they cannot collapse
 * into the same take. Everything has a deterministic fallback: the demo
 * produces three directions even with every model down.
 */

import type { BankEntry } from './bank.js';
import { chat } from './qwen.js';
import { parseColor, rgbToHsl, toHex, hslToRgb } from './color.js';
import { deriveTokens, type DesignTokens } from './tokens.js';
import { repairPalette } from './palette.js';
import { genomeFor, type Genome } from './pagespec.js';

export type Axis = 'faithful' | 'bolder' | 'unexpected';

export type DirectionSpec = {
  axis: Axis;
  name: string;
  adjectives: string[];
  palette: string[];
  fontVibe: string;
  heroPrompt: string;
  layoutNote: string;
  tokens: DesignTokens;
  genome: Genome;
  anchor?: BankEntry;
};

const AXES: Axis[] = ['faithful', 'bolder', 'unexpected'];

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/**
 * Pick 3 maximally-spread anchors: the best match first, then twice the
 * ref farthest from everything already picked. Stable, ~10 lines, no
 * k-means drama on 8 points.
 */
export function pickAnchors(refs: BankEntry[]): BankEntry[] {
  const usable = refs.filter((r) => r.embedding.length > 0);
  if (usable.length < 3) return refs.slice(0, 3);

  const picked = [usable[0]];
  while (picked.length < 3) {
    let best = usable[0];
    let bestScore = -Infinity;
    for (const candidate of usable) {
      if (picked.includes(candidate)) continue;
      const minDist = Math.min(...picked.map((p) => 1 - cosine(candidate.embedding, p.embedding)));
      if (minDist > bestScore) {
        bestScore = minDist;
        best = candidate;
      }
    }
    picked.push(best);
  }
  return picked;
}

function hueOf(hex: string): number | null {
  const rgba = parseColor(hex);
  return rgba ? rgbToHsl(rgba).h * 360 : null;
}

function shiftPalette(palette: string[], degrees: number, saturate: number): string[] {
  return palette.map((hex) => {
    const rgba = parseColor(hex);
    if (!rgba) return hex;
    const { h, s, l } = rgbToHsl(rgba);
    return toHex(hslToRgb((h + degrees / 360) % 1, Math.min(1, s * saturate), l));
  });
}

const HERO_FAMILIES = [
  'abstract flowing gradient mesh background',
  'macro texture of layered translucent paper background',
  'soft 3d frosted glass shapes on a plain backdrop',
];

function fallbackSpec(
  axis: Axis,
  index: number,
  brief: string,
  anchor: BankEntry | undefined,
  genome: Genome,
): Omit<DirectionSpec, 'tokens' | 'genome'> {
  // Seed the variation from the genome, so even the fully-offline path
  // gives two different briefs two different directions — never the same
  // report twice.
  const hueTwist = 60 + (genome.seed % 180);
  const basePalette = anchor?.palette?.length
    ? anchor.palette
    : shiftPalette(['#4f46e5', '#fafaf9', '#28282e'], genome.seed % 360, 1);
  const palette =
    axis === 'faithful' ? basePalette
    : axis === 'bolder' ? shiftPalette(basePalette, 10 + (genome.seed % 25), 1.4 + (genome.seed % 30) / 100)
    : shiftPalette(basePalette, hueTwist, 1.2);
  const adjectives =
    axis === 'faithful' ? (anchor?.tags.slice(0, 3) ?? ['clean', 'modern', 'calm'])
    : axis === 'bolder' ? ['bold', 'saturated', 'confident']
    : ['unexpected', 'contrasting', 'distinctive'];
  return {
    axis,
    name: `${axis[0].toUpperCase()}${axis.slice(1)} ${anchor?.vibe.split(' ')[0] ?? 'direction'}`,
    adjectives,
    palette,
    fontVibe: axis === 'unexpected' ? 'editorial' : brief,
    heroPrompt: `${HERO_FAMILIES[(index + genome.seed) % HERO_FAMILIES.length]}, ${adjectives.join(', ')}, generous negative space, soft diffuse lighting, minimal, website hero backdrop`,
    layoutNote: `${genome.heroForm} hero, ${genome.density} density${genome.tilt ? ', tilted layered cards' : ''}`,
  };
}

function sanitizeSpec(
  raw: unknown,
  axis: Axis,
  index: number,
  brief: string,
  anchor: BankEntry | undefined,
  genome: Genome,
): Omit<DirectionSpec, 'tokens' | 'genome'> {
  const fallback = fallbackSpec(axis, index, brief, anchor, genome);
  const spec = (raw ?? {}) as Record<string, unknown>;
  const palette = Array.isArray(spec.palette)
    ? spec.palette.filter((p): p is string => typeof p === 'string' && parseColor(p) !== null).slice(0, 6)
    : [];
  const adjectives = Array.isArray(spec.adjectives)
    ? spec.adjectives.filter((a): a is string => typeof a === 'string').slice(0, 5)
    : [];
  const heroPrompt = typeof spec.hero_prompt === 'string' && spec.hero_prompt.length > 20 ? spec.hero_prompt : fallback.heroPrompt;
  return {
    axis,
    name: typeof spec.name === 'string' && spec.name ? spec.name.slice(0, 40) : fallback.name,
    adjectives: adjectives.length >= 2 ? adjectives : fallback.adjectives,
    // roles, not just colors: a photo-derived palette of five greys is
    // repaired into ground / tint / mid / ink / accent around its own hue
    palette: repairPalette(palette.length >= 3 ? palette : fallback.palette, genome.seed).palette,
    fontVibe: typeof spec.font_vibe === 'string' ? spec.font_vibe : fallback.fontVibe,
    // No embedded words, ever — the renderer owns all text.
    heroPrompt: `${heroPrompt.replace(/\b(text|typography|letters?|words?|logo)\b/gi, 'shapes')}, no text, no letters, no watermark`,
    layoutNote: typeof spec.layout_note === 'string' ? spec.layout_note : fallback.layoutNote,
  };
}

/** Two directions are "the same" if they share most adjectives or hues. */
function tooSimilar(
  a: Omit<DirectionSpec, 'tokens' | 'genome'>,
  b: Omit<DirectionSpec, 'tokens' | 'genome'>,
): boolean {
  const setA = new Set(a.adjectives.map((w) => w.toLowerCase()));
  const shared = b.adjectives.filter((w) => setA.has(w.toLowerCase())).length;
  const overlap = shared / Math.max(1, Math.min(a.adjectives.length, b.adjectives.length));
  const hueA = hueOf(a.palette[0]);
  const hueB = hueOf(b.palette[0]);
  const hueGap = hueA !== null && hueB !== null ? Math.min(Math.abs(hueA - hueB), 360 - Math.abs(hueA - hueB)) : 180;
  return overlap > 0.6 && hueGap < 40;
}

export async function draftDirections(
  brief: string,
  anchors: BankEntry[],
): Promise<DirectionSpec[]> {
  const anchorLines = anchors
    .map((a, i) => `${i + 1}. vibe: ${a.vibe}; tags: ${a.tags.join(', ')}; palette: ${a.palette.join(' ')}; notes: ${a.notes}`)
    .join('\n');

  const reply = await chat(
    [
      {
        role: 'system',
        content:
          'You are an art director drafting three COMPETING design directions for one brief. ' +
          'They must be mutually exclusive takes: "faithful" hews closest to the reference designs, ' +
          '"bolder" pushes the same territory harder (stronger color, bigger type), ' +
          '"unexpected" makes a defensible left-field move (different hue family or typographic attitude). ' +
          'Reply with ONLY JSON: {"directions": [{"axis": "faithful|bolder|unexpected", ' +
          '"name": "<2-3 word name>", "adjectives": ["<5 style words>"], ' +
          '"palette": ["<5 hex colors, light-to-dark spread, one saturated accent>"], ' +
          '"font_vibe": "<one of: modern, editorial, technical, playful, elegant>", ' +
          '"hero_prompt": "<text-to-image prompt for an ABSTRACT hero backdrop: a material/texture/gradient subject, 2-3 named colors (never hex codes), \'generous negative space\', \'website hero backdrop\'. Absolutely no text, letters, faces, or logos in the prompt>", ' +
          '"layout_note": "<one sentence of layout guidance>"}] } with exactly three entries, one per axis.',
      },
      {
        role: 'user',
        content: `Brief: ${brief}\n\nAnchor references (one per direction, in order faithful/bolder/unexpected):\n${anchorLines || '(no references — invent from the brief alone)'}`,
      },
    ],
    900,
  );

  let parsed: unknown[] = [];
  if (reply) {
    try {
      const cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const obj = JSON.parse(cleaned) as { directions?: unknown[] };
      if (Array.isArray(obj.directions)) parsed = obj.directions;
    } catch {
      console.error(`[design-blocks] directions reply was not JSON: ${reply.slice(0, 80)}`);
    }
  }

  const genomes = AXES.map((_, i) => genomeFor(brief, i));
  const specs = AXES.map((axis, i) => {
    const raw = parsed.find((d) => (d as { axis?: string }).axis === axis) ?? parsed[i];
    return sanitizeSpec(raw, axis, i, brief, anchors[i], genomes[i]);
  });

  // Distinctness gate: nudge any clone apart deterministically rather
  // than paying for a retry round on stage.
  for (let i = 1; i < specs.length; i++) {
    for (let j = 0; j < i; j++) {
      if (tooSimilar(specs[i], specs[j])) {
        console.log(`[design-blocks] directions ${j}/${i} too similar — shifting ${specs[i].axis}`);
        specs[i] = { ...specs[i], palette: shiftPalette(specs[i].palette, 120, 1.2) };
      }
    }
  }

  return specs.map((spec, i) => ({
    ...spec,
    anchor: anchors[i],
    genome: genomes[i],
    tokens: deriveTokens(spec.palette, `${spec.fontVibe} ${brief}`, genomes[i].seed),
  }));
}

/** Expand the winning direction into the final written direction. */
export async function expandWinner(
  brief: string,
  winner: DirectionSpec,
  reason: string,
): Promise<string> {
  const reply = await chat(
    [
      {
        role: 'system',
        content:
          'You are an art director briefing a coding agent. Expand the chosen design direction into ' +
          'markdown: a two-sentence overall direction, then 6-8 bullets of concrete buildable guidance ' +
          '(layout shape, where the hero image goes, color roles by token name, typography attitude, ' +
          'spacing feel, one signature detail). No preamble, under 250 words.',
      },
      {
        role: 'user',
        content:
          `Brief: ${brief}\nWinning direction: ${winner.name} (${winner.axis}) — ${winner.adjectives.join(', ')}. ` +
          `Palette: ${winner.palette.join(' ')}. Fonts: ${winner.tokens.fonts.display} + ${winner.tokens.fonts.body}. ` +
          `Layout: ${winner.layoutNote}. Why it won: ${reason}`,
      },
    ],
    500,
  );
  if (reply) return reply;

  return [
    `**${winner.name}** (${winner.axis}) — ${winner.adjectives.join(', ')}.`,
    '',
    `- Layout: ${winner.layoutNote}`,
    `- Set headings in ${winner.tokens.fonts.display}, body in ${winner.tokens.fonts.body}.`,
    `- Use the hero image as a full-width band; keep copy in its negative space.`,
    `- Color roles: --design-primary for actions, --design-bg for the page, accents from the palette sparingly.`,
    `- Spacing: stick to the token scale; let the hero breathe.`,
  ].join('\n');
}
