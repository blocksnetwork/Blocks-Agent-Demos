/**
 * Design decomposition — the stage that makes reference transfer possible.
 *
 * A vision model looks at ONE reference and produces a structured account
 * of WHY the design works: where the visual mass sits (as numeric
 * bounding boxes deterministic code can score against), how many depth
 * planes exist, what overlaps what, how imagery is integrated, how data
 * is represented spatially, and — most importantly — the 3-8 signature
 * decisions that separate this design from a generic SaaS template.
 *
 * Every signature pattern is stored twice, deliberately:
 *   observation           what THIS design literally does
 *   principle             the transferable move, stated product-neutrally
 * The composition planner receives the principles plus a domain-SCRUBBED
 * structural brief (see transferBrief); it never sees the reference's
 * domain nouns next to the product brief. That is the line between
 * design transfer and screenshot cloning.
 *
 * Analyses are cached per bank entry (bank/analysis/<id>.json, id = the
 * content hash) — ingest computes them when vLLM is up, query time
 * backfills lazily. Cache entries carry version + model and mismatch is
 * a miss.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BankEntry } from './bank.js';
import { chat } from './qwen.js';

/** Bump when the schema or the analysis prompt changes meaningfully. */
export const ANALYSIS_VERSION = 2;

export type SignaturePattern = {
  /** literal: "a leaf occupies ~45% of the right half" */
  observation: string;
  /** transferable: "one oversized domain subject anchors the composition" */
  principle: string;
};

/** Integer percentages of the full canvas, 0-100; may overshoot for bleeds. */
export type PctBox = { x: number; y: number; w: number; h: number };

export type VisualMass = {
  what: string;
  area: 'small' | 'medium' | 'large' | 'dominant';
  bbox: PctBox;
};

export type DesignReferenceAnalysis = {
  version: number;
  model: string;
  refId?: string;
  summary: string;
  composition: {
    dominantRegion: string;
    masses: VisualMass[];
    symmetry: 'symmetric' | 'asymmetric' | 'strongly-asymmetric';
    focalPoint: string;
    readingPath: string;
    grid: string;
  };
  layering: {
    planes: number;
    overlaps: Array<{ front: string; back: string; degree: 'slight' | 'partial' | 'heavy' }>;
    containerBreaks: string[];
    floating: string[];
  };
  imagery: Array<{ subject: string; role: string; integration: string }>;
  dataDisplay: Array<{ what: string; form: string; integration: string }>;
  geometry: { corners: string; shapes: string; diagonals: boolean; organic: boolean };
  density: { overall: 'sparse' | 'editorial' | 'balanced' | 'dense'; gradient: string };
  signaturePatterns: SignaturePattern[];
};

const AREAS = new Set(['small', 'medium', 'large', 'dominant']);
const SYMMETRIES = new Set(['symmetric', 'asymmetric', 'strongly-asymmetric']);
const DEGREES = new Set(['slight', 'partial', 'heavy']);
const DENSITIES = new Set(['sparse', 'editorial', 'balanced', 'dense']);

const ANALYSIS_PROMPT =
  'You are a design director decomposing a UI/graphic reference into its STRUCTURAL design logic. ' +
  'Do NOT caption it ("modern green dashboard") — describe why the composition works. ' +
  'All bbox values are integer percentages of the full image, {"x","y","w","h"} from the top-left. ' +
  'Reply with ONLY JSON, exactly this shape:\n' +
  '{"summary": "<one line>",\n' +
  '"composition": {"dominant_region": "<where the visual mass concentrates>", ' +
  '"masses": [{"what": "<element>", "area": "small|medium|large|dominant", "bbox": {"x":55,"y":10,"w":40,"h":80}}] (3-6 entries, largest first), ' +
  '"symmetry": "symmetric|asymmetric|strongly-asymmetric", "focal_point": "<what the eye lands on first>", ' +
  '"reading_path": "<how the eye moves through the page>", "grid": "<column behavior, incl. deliberate grid-breaking>"},\n' +
  '"layering": {"planes": <number of apparent depth planes, 1-5>, ' +
  '"overlaps": [{"front": "<element>", "back": "<element>", "degree": "slight|partial|heavy"}], ' +
  '"container_breaks": ["<elements escaping their parent container>"], "floating": ["<detached floating elements>"]},\n' +
  '"imagery": [{"subject": "<what is pictured>", "role": "<structural role: structural-subject | foreground-cutout | background-atmosphere | texture | data-canvas | contained-illustration>", "integration": "<how it relates to UI: behind panels, breaks its frame, data pinned to it...>"}],\n' +
  '"data_display": [{"what": "<the data shown>", "form": "<the VISUAL idea, e.g. radial ring wrapping the subject / values pinned to spatial coordinates / stepped gradient columns / tiny inline plots — never just \'bar chart\'>", "integration": "<where it sits relative to other elements>"}],\n' +
  '"geometry": {"corners": "<sharp|soft|mixed + notes>", "shapes": "<recurring shapes>", "diagonals": true|false, "organic": true|false},\n' +
  '"density": {"overall": "sparse|editorial|balanced|dense", "gradient": "<where density increases/decreases>"},\n' +
  '"signature_patterns": [{"observation": "<what THIS design literally does, with rough proportions>", "principle": "<the same move stated as a transferable rule, with NO domain nouns from the image>"}] — the 3-8 decisions that make this design UNLIKE a generic template. This is the most important field.}\n' +
  'If the image is photography rather than an interface, still decompose its composition (masses, focal point, symmetry, geometry, density) and leave data_display empty.';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value) ? (value as T) : fallback;
}

function strArray(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0).slice(0, max)
    : [];
}

/**
 * Integer-percent box. Values that look like pixels (>200) are scaled
 * down against a 1000px guess rather than clamped into nonsense; mild
 * overshoot (bleeds) is legal.
 */
function pctBox(value: unknown): PctBox | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const num = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);
  let [x, y, w, h] = [num(v.x), num(v.y), num(v.w), num(v.h)];
  if (x === null || y === null || w === null || h === null) return null;
  if (Math.max(x, y, w, h) > 200) {
    const scale = 100 / 1000;
    [x, y, w, h] = [x * scale, y * scale, w * scale, h * scale];
  }
  const clamp = (n: number) => Math.max(-50, Math.min(150, Math.round(n)));
  return { x: clamp(x), y: clamp(y), w: Math.max(1, clamp(w)), h: Math.max(1, clamp(h)) };
}

/** Field-by-field sanitize: bad fields degrade to neutral values, never throw. */
export function sanitizeAnalysis(raw: unknown, refId?: string): DesignReferenceAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const comp = (a.composition ?? {}) as Record<string, unknown>;
  const layers = (a.layering ?? {}) as Record<string, unknown>;
  const geom = (a.geometry ?? {}) as Record<string, unknown>;
  const dens = (a.density ?? {}) as Record<string, unknown>;

  const masses = Array.isArray(comp.masses)
    ? (comp.masses as Array<Record<string, unknown>>)
        .filter((m) => typeof m.what === 'string')
        .slice(0, 6)
        .map((m) => ({
          what: m.what as string,
          area: pickEnum(m.area, AREAS, 'medium' as const),
          bbox: pctBox(m.bbox) ?? { x: 0, y: 0, w: 100, h: 30 },
        }))
    : [];

  const patterns = Array.isArray(a.signature_patterns)
    ? (a.signature_patterns as Array<Record<string, unknown>>)
        .filter((p) => typeof p.observation === 'string' && typeof p.principle === 'string')
        .slice(0, 8)
        .map((p) => ({ observation: p.observation as string, principle: p.principle as string }))
    : [];

  return {
    version: ANALYSIS_VERSION,
    model: typeof a.model === 'string' ? a.model : process.env.VLLM_MODEL ?? 'Qwen/Qwen3.5-4B',
    refId,
    summary: str(a.summary, 'no summary'),
    composition: {
      dominantRegion: str(comp.dominant_region, 'unspecified'),
      masses,
      symmetry: pickEnum(comp.symmetry, SYMMETRIES, 'asymmetric' as const),
      focalPoint: str(comp.focal_point, 'unspecified'),
      readingPath: str(comp.reading_path, 'top-left to bottom-right'),
      grid: str(comp.grid, 'unspecified'),
    },
    layering: {
      planes: Math.max(1, Math.min(5, Math.round(Number(layers.planes)) || 1)),
      overlaps: Array.isArray(layers.overlaps)
        ? (layers.overlaps as Array<Record<string, unknown>>)
            .filter((o) => typeof o.front === 'string' && typeof o.back === 'string')
            .slice(0, 6)
            .map((o) => ({
              front: o.front as string,
              back: o.back as string,
              degree: pickEnum(o.degree, DEGREES, 'partial' as const),
            }))
        : [],
      containerBreaks: strArray(layers.container_breaks, 4),
      floating: strArray(layers.floating, 5),
    },
    imagery: Array.isArray(a.imagery)
      ? (a.imagery as Array<Record<string, unknown>>)
          .filter((i) => typeof i.subject === 'string')
          .slice(0, 4)
          .map((i) => ({
            subject: i.subject as string,
            role: str(i.role, 'contained-illustration'),
            integration: str(i.integration, ''),
          }))
      : [],
    dataDisplay: Array.isArray(a.data_display)
      ? (a.data_display as Array<Record<string, unknown>>)
          .filter((d) => typeof d.what === 'string' && typeof d.form === 'string')
          .slice(0, 5)
          .map((d) => ({ what: d.what as string, form: d.form as string, integration: str(d.integration, '') }))
      : [],
    geometry: {
      corners: str(geom.corners, 'mixed'),
      shapes: str(geom.shapes, ''),
      diagonals: geom.diagonals === true,
      organic: geom.organic === true,
    },
    density: {
      overall: pickEnum(dens.overall, DENSITIES, 'balanced' as const),
      gradient: str(dens.gradient, 'even'),
    },
    signaturePatterns: patterns,
  };
}

/**
 * The bar an analysis must clear before it may drive composition. Below
 * it the pipeline falls back rather than designing from noise.
 */
export function analysisUsable(analysis: DesignReferenceAnalysis | null): analysis is DesignReferenceAnalysis {
  return (
    analysis !== null &&
    analysis.signaturePatterns.length >= 2 &&
    analysis.composition.masses.length >= 2
  );
}

/**
 * How structurally interesting a reference is — used to bias the
 * bolder/unexpected anchor picks toward references worth transferring
 * from, regardless of subject-matter distance from the brief.
 */
export function structuralRichness(analysis: DesignReferenceAnalysis): number {
  return (
    analysis.layering.planes +
    analysis.layering.overlaps.length +
    analysis.layering.containerBreaks.length * 2 +
    (analysis.composition.symmetry === 'strongly-asymmetric' ? 2 : analysis.composition.symmetry === 'asymmetric' ? 1 : 0) +
    analysis.signaturePatterns.length +
    analysis.dataDisplay.length
  );
}

/** Bounded schema for vLLM guided decoding — no fences, no malformed JSON. */
const ANALYSIS_GUIDED_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    composition: {
      type: 'object',
      properties: {
        dominant_region: { type: 'string' },
        masses: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              what: { type: 'string' },
              area: { type: 'string', enum: ['small', 'medium', 'large', 'dominant'] },
              bbox: {
                type: 'object',
                properties: { x: { type: 'integer' }, y: { type: 'integer' }, w: { type: 'integer' }, h: { type: 'integer' } },
                required: ['x', 'y', 'w', 'h'],
              },
            },
            required: ['what', 'area', 'bbox'],
          },
        },
        symmetry: { type: 'string', enum: ['symmetric', 'asymmetric', 'strongly-asymmetric'] },
        focal_point: { type: 'string' },
        reading_path: { type: 'string' },
        grid: { type: 'string' },
      },
      required: ['masses', 'symmetry'],
    },
    layering: {
      type: 'object',
      properties: {
        planes: { type: 'integer' },
        overlaps: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              front: { type: 'string' },
              back: { type: 'string' },
              degree: { type: 'string', enum: ['slight', 'partial', 'heavy'] },
            },
            required: ['front', 'back'],
          },
        },
        container_breaks: { type: 'array', items: { type: 'string' }, maxItems: 4 },
        floating: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      },
      required: ['planes'],
    },
    imagery: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        properties: { subject: { type: 'string' }, role: { type: 'string' }, integration: { type: 'string' } },
        required: ['subject', 'role'],
      },
    },
    data_display: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: { what: { type: 'string' }, form: { type: 'string' }, integration: { type: 'string' } },
        required: ['what', 'form'],
      },
    },
    geometry: {
      type: 'object',
      properties: {
        corners: { type: 'string' },
        shapes: { type: 'string' },
        diagonals: { type: 'boolean' },
        organic: { type: 'boolean' },
      },
    },
    density: {
      type: 'object',
      properties: {
        overall: { type: 'string', enum: ['sparse', 'editorial', 'balanced', 'dense'] },
        gradient: { type: 'string' },
      },
    },
    signature_patterns: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: { observation: { type: 'string' }, principle: { type: 'string' } },
        required: ['observation', 'principle'],
      },
    },
  },
  required: ['summary', 'composition', 'layering', 'signature_patterns'],
};

/** One vision call: reference image in, structural decomposition out. */
export async function analyzeReference(
  bytes: Uint8Array,
  mimeType: string,
  refId?: string,
): Promise<DesignReferenceAnalysis | null> {
  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
  const reply = await chat(
    [
      { role: 'system', content: ANALYSIS_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: 'Decompose this reference design.' },
        ],
      },
    ],
    1600,
    { guidedJson: ANALYSIS_GUIDED_SCHEMA },
  );
  if (!reply) return null;
  try {
    const cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return sanitizeAnalysis(JSON.parse(cleaned), refId);
  } catch {
    console.error(`[design-blocks] analysis reply was not JSON: ${reply.slice(0, 80)}`);
    return null;
  }
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function analysisPath(bankDir: string, id: string): string {
  return join(bankDir, 'analysis', `${id}.json`);
}

/**
 * Disk cache only — no model calls. Null on miss or version mismatch.
 *
 * The cache stores the SANITIZED (camelCase) shape, so it must never be
 * pushed back through sanitizeAnalysis, which reads the raw snake_case
 * LLM shape — doing so silently empties every field and turns each
 * lookup into a cache miss (a bug this comment exists to keep dead).
 */
export async function loadCachedAnalysis(bankDir: string, entry: BankEntry): Promise<DesignReferenceAnalysis | null> {
  try {
    const raw = JSON.parse(await readFile(analysisPath(bankDir, entry.id), 'utf8')) as Partial<DesignReferenceAnalysis>;
    if (raw.version !== ANALYSIS_VERSION) return null;
    // A decomposition written by a different model is a miss — quality
    // characteristics differ and stale-but-parseable is the worst kind
    // of stale. (Entry ids are content hashes, so image changes already
    // miss naturally.)
    if (raw.model !== (process.env.VLLM_MODEL ?? 'Qwen/Qwen3.5-4B')) return null;
    // Light shape check on the stored camelCase structure.
    if (!Array.isArray(raw.signaturePatterns) || !Array.isArray(raw.composition?.masses)) return null;
    const cached = raw as DesignReferenceAnalysis;
    return analysisUsable(cached) ? { ...cached, refId: entry.id } : null;
  } catch {
    return null;
  }
}

/**
 * Cache-through analysis for a bank entry: disk cache first, then one
 * vision call, cached on success. Null when neither is possible.
 */
export async function getAnalysis(bankDir: string, entry: BankEntry): Promise<DesignReferenceAnalysis | null> {
  const cached = await loadCachedAnalysis(bankDir, entry);
  if (cached) return cached;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(join(bankDir, entry.file)));
  } catch {
    return null;
  }
  const ext = entry.file.slice(entry.file.lastIndexOf('.')).toLowerCase();
  const analysis = await analyzeReference(bytes, MIME_BY_EXT[ext] ?? 'image/png', entry.id);
  if (!analysisUsable(analysis)) return null;

  try {
    await mkdir(join(bankDir, 'analysis'), { recursive: true });
    await writeFile(analysisPath(bankDir, entry.id), JSON.stringify(analysis, null, 1));
  } catch (err) {
    console.error(`[design-blocks] could not cache analysis for ${entry.id}: ${(err as Error).message}`);
  }
  return analysis;
}

/**
 * The domain-SCRUBBED structural brief the composition planner reads.
 *
 * Masses lose their nouns (mass A/B/C + role hints); imagery keeps only
 * its structural role and integration; data display keeps the visual
 * FORM but not what the reference measured; signature patterns
 * contribute only their product-neutral principles. The planner's only
 * domain vocabulary comes from the ProductIntent — so the easy move
 * (clone the reference's content) is not available, and the equivalent
 * move for THIS product is the only move left.
 */
export function transferBrief(analysis: DesignReferenceAnalysis): string {
  const massLabel = (i: number) => `mass ${String.fromCharCode(65 + i)}`;
  const lines = [
    `Composition: ${analysis.composition.symmetry}; dominant mass concentrated at ${analysis.composition.dominantRegion}; reading path: ${analysis.composition.readingPath}; grid: ${analysis.composition.grid}`,
    `Masses (as fractions of the canvas):`,
    ...analysis.composition.masses.map(
      (m, i) =>
        `  ${massLabel(i)}: ${m.area}, bbox x=${m.bbox.x}% y=${m.bbox.y}% w=${m.bbox.w}% h=${m.bbox.h}%`,
    ),
    `Layering: ${analysis.layering.planes} depth planes; ${analysis.layering.overlaps.length} deliberate overlaps` +
      (analysis.layering.overlaps.length
        ? ` (${analysis.layering.overlaps.map((o) => o.degree).join(', ')})`
        : '') +
      (analysis.layering.containerBreaks.length
        ? `; ${analysis.layering.containerBreaks.length} element(s) break their container`
        : '') +
      (analysis.layering.floating.length ? `; ${analysis.layering.floating.length} floating element(s)` : ''),
    analysis.imagery.length
      ? `Imagery: ${analysis.imagery.map((i) => `one ${i.role} image (${i.integration || 'integrated with the layout'})`).join(' · ')}`
      : 'Imagery: none — typography and surfaces carry the design',
    analysis.dataDisplay.length
      ? `Data display forms: ${analysis.dataDisplay.map((d) => `${d.form}${d.integration ? ` — ${d.integration}` : ''}`).join(' · ')}`
      : '',
    `Geometry: ${analysis.geometry.corners}; ${analysis.geometry.shapes}${analysis.geometry.diagonals ? '; uses diagonals' : ''}${analysis.geometry.organic ? '; organic forms' : ''}`,
    `Density: ${analysis.density.overall}; ${analysis.density.gradient}`,
    'Transferable principles (rules to embody, NOT content to copy):',
    ...analysis.signaturePatterns.map((p, i) => `  ${i + 1}. ${p.principle}`),
  ];
  return lines.filter(Boolean).join('\n');
}

/** Full un-scrubbed rendering — for the critique stage and artifacts. */
export function analysisBrief(analysis: DesignReferenceAnalysis): string {
  const lines = [
    `Summary: ${analysis.summary}`,
    `Composition: dominant region ${analysis.composition.dominantRegion}; ${analysis.composition.symmetry}; focal point: ${analysis.composition.focalPoint}; reading path: ${analysis.composition.readingPath}`,
    `Masses: ${analysis.composition.masses.map((m) => `${m.what} (${m.area}, at ${m.bbox.x},${m.bbox.y} ${m.bbox.w}x${m.bbox.h}%)`).join(' · ')}`,
    `Layering: ${analysis.layering.planes} depth planes` +
      (analysis.layering.overlaps.length
        ? `; overlaps: ${analysis.layering.overlaps.map((o) => `${o.front} ${o.degree}ly over ${o.back}`).join(', ')}`
        : '') +
      (analysis.layering.containerBreaks.length
        ? `; container breaks: ${analysis.layering.containerBreaks.join(', ')}`
        : ''),
    analysis.imagery.length
      ? `Imagery: ${analysis.imagery.map((i) => `${i.subject} as ${i.role} (${i.integration})`).join(' · ')}`
      : 'Imagery: none',
    analysis.dataDisplay.length
      ? `Data display: ${analysis.dataDisplay.map((d) => `${d.what} as ${d.form}${d.integration ? `, ${d.integration}` : ''}`).join(' · ')}`
      : '',
    'Signature patterns (observation → transferable principle):',
    ...analysis.signaturePatterns.map((p, i) => `  ${i + 1}. "${p.observation}" → ${p.principle}`),
  ];
  return lines.filter(Boolean).join('\n');
}

/** Just the product-neutral principles — what generation is allowed to see as rules. */
export function transferablePrinciples(analysis: DesignReferenceAnalysis): string[] {
  return analysis.signaturePatterns.map((p) => p.principle);
}
