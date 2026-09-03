/**
 * Art-director pass over the retrieved references.
 *
 * CLIP ranking answers "which image is nearest this sentence" — it does
 * not know that an app brief needs an app-shell reference rather than a
 * monospace blog, or that a plant product wants the leaf photograph and
 * not the grey texture that happened to embed closer. So before any
 * transfer, a vision model reads the brief, LOOKS at every candidate page
 * design and photograph, and names:
 *
 *   - the page type the brief actually describes (app screen, dashboard,
 *     landing page, editorial page) — it steers the composition prompt
 *   - the three composition anchors (faithful / bolder / unexpected)
 *   - the hero photograph whose subject matches the product, or none
 *
 * Only the hosted model does this; a 4B local model cannot judge thirty
 * thumbnails at once, and the caller falls back to the CLIP heuristics.
 */

import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import type { BankEntry } from './bank.js';
import { claudeEnabled } from './claude.js';
import type { PageType } from './composition.js';
import { chat } from './qwen.js';

export type Curation = {
  pageType: PageType;
  /** faithful, bolder, unexpected — undefined where the model named nothing usable */
  anchors: Array<BankEntry | undefined>;
  hero: BankEntry | null;
  reasons: Record<string, string>;
};

const PAGE_TYPES: PageType[] = ['app-screen', 'dashboard', 'landing', 'editorial'];

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const CURATION_SCHEMA = {
  type: 'object',
  properties: {
    page_type: { type: 'string', enum: PAGE_TYPES },
    faithful: { type: 'string' },
    bolder: { type: 'string' },
    unexpected: { type: 'string' },
    hero: { type: 'string' },
    reasons: {
      type: 'object',
      properties: {
        page_type: { type: 'string' },
        faithful: { type: 'string' },
        bolder: { type: 'string' },
        unexpected: { type: 'string' },
        hero: { type: 'string' },
      },
      required: ['page_type', 'faithful', 'bolder', 'unexpected', 'hero'],
    },
  },
  required: ['page_type', 'faithful', 'bolder', 'unexpected', 'hero', 'reasons'],
};

const CURATION_PROMPT =
  'You are the art director of a design studio. You receive a product brief and a labeled set of candidate references: ' +
  'PAGE DESIGNS (screenshots of real interfaces) and PHOTOGRAPHS (imagery assets). Judge STRUCTURE and FIT, never colour — colour is re-mapped later.\n\n' +
  'Decide:\n' +
  '1. page_type — what the brief actually describes: "app-screen" (a working tool the user operates: upload, stream, results, panels), ' +
  '"dashboard" (metrics and tables at a glance), "landing" (a marketing page selling something), or "editorial" (an article or reading page). ' +
  'A brief that says "web app, not a marketing page" is an app-screen no matter how pretty the landing pages look.\n' +
  '2. faithful — the PAGE DESIGN whose skeleton fits that page type best: an app-screen or dashboard brief takes a shell with panels, sidebars and data regions; ' +
  'a landing brief takes a landing page; an editorial brief takes a reading layout. Never pick a blog column for an app.\n' +
  '3. bolder — the PAGE DESIGN with the richest layering, depth or asymmetry that still suits the page type.\n' +
  '4. unexpected — a PAGE DESIGN structurally different from the other two that a good designer could defend for this product.\n' +
  "5. hero — the PHOTOGRAPH whose subject matches the product's primary visual subject (the thing the user looks at in the product). " +
  'A plant product wants a leaf or plant; a food product wants food. If no photograph shows the subject, answer "none" — a wrong subject is worse than no photo.\n\n' +
  'Answer with the candidate LABELS exactly as given (e.g. "UI-3", "PHOTO-7", or "none" for hero). Reasons: one short sentence each. Output only the JSON object.';

async function thumbDataUrl(bankDir: string, entry: BankEntry): Promise<string | null> {
  const file = entry.thumb || entry.file;
  if (!file) return null;
  const mime = MIME_BY_EXT[extname(file).toLowerCase()];
  if (!mime) return null;
  try {
    const bytes = await readFile(join(bankDir, file));
    return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}

function parseJson(reply: string): Record<string, unknown> | null {
  const cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** "UI-3" / "PHOTO-7" / a raw bank id → the entry, or undefined. */
function resolveLabel(value: unknown, labels: Map<string, BankEntry>): BankEntry | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim();
  if (!key || /^none$/i.test(key)) return undefined;
  return labels.get(key.toUpperCase()) ?? [...labels.values()].find((e) => e.id === key);
}

export async function curateReferences(
  brief: string,
  uiRefs: BankEntry[],
  photoRefs: BankEntry[],
  bankDir: string,
): Promise<Curation | null> {
  if (!claudeEnabled() || uiRefs.length === 0) return null;

  const labels = new Map<string, BankEntry>();
  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: `PRODUCT BRIEF\n${brief}\n\nPAGE DESIGNS (composition candidates):` },
  ];
  let uiCount = 0;
  for (const ref of uiRefs) {
    const url = await thumbDataUrl(bankDir, ref);
    if (!url) continue;
    uiCount++;
    const label = `UI-${uiCount}`;
    labels.set(label, ref);
    parts.push({ type: 'text', text: `${label} — tags: ${ref.tags.slice(0, 8).join(', ') || 'untagged'}` });
    parts.push({ type: 'image_url', image_url: { url } });
  }
  if (uiCount === 0) return null;

  parts.push({ type: 'text', text: '\nPHOTOGRAPHS (hero imagery candidates):' });
  let photoCount = 0;
  for (const ref of photoRefs) {
    const url = await thumbDataUrl(bankDir, ref);
    if (!url) continue;
    photoCount++;
    const label = `PHOTO-${photoCount}`;
    labels.set(label, ref);
    parts.push({ type: 'text', text: `${label} — tags: ${ref.tags.slice(0, 6).join(', ') || 'untagged'}` });
    parts.push({ type: 'image_url', image_url: { url } });
  }
  if (photoCount === 0) parts.push({ type: 'text', text: '(no photographs available — answer "none" for hero)' });
  parts.push({ type: 'text', text: '\nChoose the page type, the three anchors and the hero photograph.' });

  const reply = await chat(
    [
      { role: 'system', content: CURATION_PROMPT },
      { role: 'user', content: parts },
    ],
    700,
    { guidedJson: CURATION_SCHEMA, timeoutMs: 120_000, attempts: 1 },
  );
  if (!reply) return null;
  const parsed = parseJson(reply);
  if (!parsed) {
    console.error(`[design-blocks] curation reply was not JSON: ${reply.slice(0, 80)}`);
    return null;
  }

  const pageType = PAGE_TYPES.includes(parsed.page_type as PageType) ? (parsed.page_type as PageType) : 'landing';
  const picks = [parsed.faithful, parsed.bolder, parsed.unexpected].map((v) => resolveLabel(v, labels));
  // the three anchors must be page designs, and distinct where possible
  const seen = new Set<string>();
  const anchors = picks.map((entry) => {
    if (!entry || entry.kind !== 'ui' || seen.has(entry.id)) return undefined;
    seen.add(entry.id);
    return entry;
  });
  if (!anchors[0]) return null;
  const heroPick = resolveLabel(parsed.hero, labels);
  const hero = heroPick && heroPick.kind !== 'ui' ? heroPick : null;
  const rawReasons = (parsed.reasons ?? {}) as Record<string, unknown>;
  const reasons: Record<string, string> = {};
  for (const key of ['page_type', 'faithful', 'bolder', 'unexpected', 'hero']) {
    if (typeof rawReasons[key] === 'string') reasons[key] = (rawReasons[key] as string).slice(0, 240);
  }
  return { pageType, anchors, hero, reasons };
}

/**
 * What the composition author must know about the page type. The transfer
 * prompt was written for landing pages; an app screen has different
 * density, height and furniture, and saying so is what stops "poster with
 * a bar chart" from coming back for a tool brief.
 */
export function pageGuidance(pageType: PageType): string {
  switch (pageType) {
    case 'app-screen':
      return (
        'This is a WORKING APP SCREEN, not a marketing page. Canvas height 1200-1400: one viewport with at most a little scroll. ' +
        'Build an app shell: a compact top bar group (product name + 3-4 text children) no taller than 6% of the canvas; ' +
        "a primary work area holding the subject (the user's photo or main object) with data pinned onto it; " +
        'one or two side panels (progress or agent stream, diagnosis or result, numbered steps) as panels with real items. ' +
        'Density is high: the first viewport is at least 70% covered by designed elements; panels align to a grid with consistent gaps; ' +
        'text lives inside panels, never floating alone in empty space; the biggest heading is a screen title, not a marketing headline; ' +
        'no CTA row, no footer paragraph, no empty band anywhere.'
      );
    case 'dashboard':
      return (
        'This is a DASHBOARD: metrics and tables at a glance. Canvas height 1200-1600. ' +
        'A compact top bar group, a dense grid of panels (each with a label, a value and a viz), one dominant panel for the primary data need, ' +
        'and a table or list panel with items. First viewport at least 70% covered; consistent gaps; no marketing hero, no footer paragraph.'
      );
    case 'editorial':
      return (
        'This is an EDITORIAL page: reading comes first. Canvas height 1600-2600. One clear text measure, a strong display heading, ' +
        'imagery as chapter openers or pinned figures, pull quotes or annotations in the margin; the first viewport still at least 60% covered.'
      );
    case 'landing':
    default:
      return (
        'This is a LANDING page: a thesis first, then proof. Canvas height 1400-2600. A hero that states the product with the subject as a structural object, ' +
        'data pinned to it, supporting panels below, a slim navigation group and a footer line; no empty band taller than 12% of the page.'
      );
  }
}
