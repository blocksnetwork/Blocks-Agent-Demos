/**
 * Hand-authored dense spec exemplars for the composition prompt.
 *
 * The transfer exemplar in composition.ts teaches the cross-domain move;
 * these teach DENSITY and off-axis structure — the two things the live
 * runs kept getting wrong (5-element specs with a centered focal). One
 * exemplar per stance so the three live calls see different shapes and
 * don't converge on one layout.
 *
 * Authoring rules, enforced by test/grammar-floors.ts:
 * - structure only: every content string is a <placeholder>, no product
 *   or reference nouns anywhere;
 * - 9-14 elements, four z planes, focalCenter.x in the grammar's
 *   off-axis bands (5-38 or 62-95) and consistent with the focal frame;
 * - each spec survives sanitizeSpec with ZERO integrity repairs (frames
 *   integer and in range, relation amounts inside their bands, every
 *   element carries an explicit frame — a missing frame counts as a
 *   repair) and resolves with the focal center still off-axis;
 * - each serialized exemplar stays under ~1200 estimated tokens.
 */

import type { Stance } from './composition.js';

/**
 * Asymmetric data dashboard: dominant subject right of axis, metric
 * callouts pinned onto it, a detail panel overlapping its left edge, a
 * history band bleeding off the right, density falling toward the focal.
 */
const DASHBOARD_SPEC = {
  canvas: { height: 2000 },
  focalElementId: 'subject',
  focalCenter: { x: 72, y: 34 },
  planes: 4,
  principles: [
    'one dominant mass anchors the composition off-axis right',
    'data pins to points on the subject instead of separate stat cards',
    'four z planes with panels both behind and in front of the subject',
    'density falls off along the reading axis',
  ],
  source: { signaturePatternsUsed: ['dominant off-axis mass', 'pinned data', 'four planes'] },
  elements: [
    { id: 'nav', role: 'navigation', kind: 'group', frame: { x: 0, y: 0, w: 100, h: 4 }, z: 3, relations: [] },
    { id: 'nav-brand', role: 'wordmark', kind: 'text', parent: 'nav', frame: { x: 2, y: 20, w: 18, h: 60 }, z: 3, relations: [], content: { heading: '<brand>' } },
    { id: 'nav-links', role: 'nav links', kind: 'text', parent: 'nav', frame: { x: 66, y: 25, w: 32, h: 50 }, z: 3, relations: [], content: { items: ['<nav item>', '<nav item>', '<nav item>'] } },
    { id: 'backdrop', role: 'depth plane behind the subject', kind: 'shape', frame: { x: 55, y: 0, w: 45, h: 58 }, z: 0, relations: [], style: { paletteRole: 'primary', emphasis: 0.15 } },
    { id: 'subject', role: 'primary-subject', kind: 'image', frame: { x: 50, y: 8, w: 44, h: 52 }, z: 2, relations: [], imagery: { subject: '<primary subject>', integration: 'cutout' } },
    { id: 'pin-a', role: 'metric annotation pinned to the subject', kind: 'viz', frame: { x: 36, y: 16, w: 15, h: 7 }, z: 3, relations: [{ type: 'attachedTo', target: 'subject', at: { x: 22, y: 30 } }], viz: { intent: '<primary data need>', form: 'value pinned to the subject with a leader line', render: [{ primitive: 'leaderCallout', params: {} }], values: [{ label: '<label>', value: '<value>' }] }, style: { surface: 'glass' } },
    { id: 'pin-b', role: 'metric annotation pinned to the subject', kind: 'viz', frame: { x: 84, y: 44, w: 14, h: 7 }, z: 3, relations: [{ type: 'attachedTo', target: 'subject', at: { x: 78, y: 64 } }], viz: { intent: '<primary data need>', form: 'value pinned to the subject with a leader line', render: [{ primitive: 'leaderCallout', params: {} }], values: [{ label: '<label>', value: '<value>' }] }, style: { surface: 'glass' } },
    { id: 'headline', role: 'headline in the sparse zone', kind: 'text', frame: { x: 4, y: 10, w: 34, h: 16 }, z: 2, relations: [], content: { heading: '<heading>', body: '<body>', fit: 'fill' } },
    { id: 'side-panel', role: 'detail panel overlapping the subject', kind: 'panel', frame: { x: 30, y: 34, w: 26, h: 20 }, z: 3, relations: [{ type: 'overlaps', target: 'subject', amount: 0.2, side: 'left' }], content: { heading: '<heading>', items: ['<item>', '<item>', '<item>'] }, style: { surface: 'solid', emphasis: 0.7 } },
    { id: 'trend', role: 'history band bleeding off the right edge', kind: 'viz', frame: { x: 30, y: 64, w: 80, h: 12 }, z: 1, relations: [{ type: 'breaksContainer', side: 'right', amount: 0.12 }], viz: { intent: '<trend data need>', form: 'full-width flowing line', render: [{ primitive: 'sparkline', params: {} }], values: [{ label: '<label>', value: '<value>' }] } },
    { id: 'kpi-line', role: 'single bare metric', kind: 'text', frame: { x: 4, y: 66, w: 24, h: 5 }, z: 2, relations: [], content: { label: '<label>', value: '<value>' } },
    { id: 'footer', role: 'footer line', kind: 'text', frame: { x: 4, y: 94, w: 56, h: 3 }, z: 1, relations: [], content: { body: '<footer line>' } },
  ],
};

/**
 * Editorial split: bleed image owns the left half, stepped text rhythm
 * owns the right, a pull quote breaks the left canvas edge, one heavy
 * band closes the page. No cards anywhere.
 */
const EDITORIAL_SPEC = {
  canvas: { height: 2200 },
  focalElementId: 'lead-photo',
  focalCenter: { x: 26, y: 29 },
  planes: 4,
  principles: [
    'a full-bleed image owns the left half; text owns the right',
    'text blocks step down in a strict offset rhythm',
    'a pull quote breaks the canvas edge',
    'one heavy band closes the page',
  ],
  source: { signaturePatternsUsed: ['split composition', 'edge-breaking pull quote', 'offset rhythm'] },
  elements: [
    { id: 'masthead', role: 'masthead', kind: 'group', frame: { x: 0, y: 0, w: 100, h: 5 }, z: 2, relations: [] },
    { id: 'mast-brand', role: 'wordmark', kind: 'text', parent: 'masthead', frame: { x: 2, y: 20, w: 26, h: 60 }, z: 2, relations: [], content: { heading: '<brand>' } },
    { id: 'mast-issue', role: 'issue label', kind: 'text', parent: 'masthead', frame: { x: 78, y: 30, w: 20, h: 40 }, z: 2, relations: [], content: { label: '<label>' } },
    { id: 'lead-photo', role: 'primary-subject as a bleed image', kind: 'image', frame: { x: 0, y: 5, w: 52, h: 48 }, z: 1, relations: [], imagery: { subject: '<primary subject>', integration: 'bleed' } },
    { id: 'kicker', role: 'kicker line', kind: 'text', frame: { x: 56, y: 9, w: 36, h: 5 }, z: 2, relations: [], content: { label: '<label>' } },
    { id: 'headline', role: 'display headline', kind: 'text', frame: { x: 56, y: 16, w: 40, h: 18 }, z: 2, relations: [], content: { heading: '<heading>', fit: 'fill' } },
    { id: 'body-1', role: 'body block, stepped right', kind: 'text', frame: { x: 58, y: 37, w: 38, h: 11 }, z: 2, relations: [{ type: 'offsetFrom', target: 'headline', edge: 'left', amount: 0.02 }], content: { body: '<body>' } },
    { id: 'body-2', role: 'body block, stepped further', kind: 'text', frame: { x: 60, y: 51, w: 38, h: 11 }, z: 2, relations: [{ type: 'offsetFrom', target: 'body-1', edge: 'left', amount: 0.02 }], content: { body: '<body>' } },
    { id: 'pull-quote', role: 'pull quote breaking the left edge', kind: 'text', frame: { x: -6, y: 58, w: 40, h: 14 }, z: 3, relations: [{ type: 'breaksContainer', side: 'left', amount: 0.15 }], content: { heading: '<pull quote>', fit: 'fill' }, style: { paletteRole: 'accent' } },
    { id: 'caption', role: 'photo caption', kind: 'text', frame: { x: 6, y: 76, w: 30, h: 5 }, z: 2, relations: [], content: { label: '<caption>' } },
    { id: 'close-band', role: 'closing band', kind: 'panel', frame: { x: 0, y: 84, w: 100, h: 16 }, z: 0, relations: [], style: { surface: 'solid', paletteRole: 'ink' } },
    { id: 'close-note', role: 'footer line', kind: 'text', frame: { x: 4, y: 92, w: 60, h: 4 }, z: 1, relations: [], content: { body: '<footer line>' } },
  ],
};

/**
 * Poster-style diagonal: circular subject wrapped by a status ring
 * off-axis right, rotated display type and a diagonal slash carrying one
 * strong axis, dot-field texture instead of panels.
 */
const POSTER_SPEC = {
  canvas: { height: 1600 },
  focalElementId: 'subject',
  focalCenter: { x: 66, y: 34 },
  planes: 4,
  principles: [
    'the subject sits in a ring off-axis right',
    'rotated type and a diagonal slash give the page one strong axis',
    'texture comes from a dot field, not panels',
    'no cards — bare blocks carry the hierarchy',
  ],
  source: { signaturePatternsUsed: ['encircled subject', 'diagonal axis', 'dot-field texture'] },
  elements: [
    { id: 'field', role: 'poster field bleeding past the edges', kind: 'shape', frame: { x: -10, y: -6, w: 120, h: 72 }, z: 0, relations: [], style: { paletteRole: 'primary', emphasis: 0.15 } },
    { id: 'subject', role: 'primary-subject in a circular mask', kind: 'image', frame: { x: 44, y: 12, w: 44, h: 44 }, z: 2, relations: [], imagery: { subject: '<primary subject>', integration: 'cutout', mask: 'circle' } },
    { id: 'orbit-ring', role: 'status ring wrapping the subject', kind: 'viz', frame: { x: 38, y: 6, w: 56, h: 56 }, z: 1, relations: [{ type: 'encircles', target: 'subject', ratio: 1.2 }], viz: { intent: '<primary data need>', form: 'segmented ring wrapping the subject', render: [{ primitive: 'ringSegment', params: { fraction: 0.75 } }], values: [{ label: '<label>', value: '<value>' }] } },
    { id: 'dot-texture', role: 'distribution texture field', kind: 'viz', frame: { x: 2, y: 54, w: 34, h: 28 }, z: 0, relations: [], viz: { intent: '<distribution data need>', form: 'loose dot field', render: [{ primitive: 'dotField', params: { count: 48 } }] } },
    { id: 'title', role: 'rotated display title', kind: 'text', frame: { x: 2, y: 10, w: 40, h: 22 }, z: 3, rotation: -8, relations: [], content: { heading: '<heading>', fit: 'fill' } },
    { id: 'subtitle', role: 'rotated subtitle', kind: 'text', frame: { x: 6, y: 34, w: 30, h: 8 }, z: 3, rotation: -8, relations: [], content: { body: '<body>' } },
    { id: 'slash', role: 'diagonal slash crossing the poster', kind: 'shape', frame: { x: 30, y: -4, w: 8, h: 78 }, z: 1, rotation: 24, relations: [], style: { paletteRole: 'accent', emphasis: 0.3 } },
    { id: 'badge', role: 'floating badge on the ring', kind: 'shape', frame: { x: 90, y: 52, w: 10, h: 10 }, z: 3, rotation: 12, relations: [{ type: 'overlaps', target: 'orbit-ring', amount: 0.3 }], style: { paletteRole: 'accent', emphasis: 0.8 } },
    { id: 'stat-strip', role: 'bare comparison strip', kind: 'viz', frame: { x: 8, y: 68, w: 42, h: 9 }, z: 2, rotation: -8, relations: [], viz: { intent: '<comparison data need>', form: 'bare labeled columns', render: [{ primitive: 'barColumn', params: { labelsInBars: true } }], values: [{ label: '<label>', value: '<value>' }, { label: '<label>', value: '<value>' }] } },
    { id: 'cta', role: 'action block hung under the subject', kind: 'panel', frame: { x: 56, y: 54, w: 34, h: 12 }, z: 3, relations: [{ type: 'offsetFrom', target: 'subject', edge: 'bottom', amount: 0.1 }], content: { heading: '<call to action>', body: '<body>' }, style: { surface: 'outline' } },
    { id: 'footer', role: 'footer line', kind: 'text', frame: { x: 8, y: 92, w: 56, h: 4 }, z: 1, relations: [], content: { body: '<footer line>' } },
  ],
};

/** Raw (pre-sanitize) exemplar specs, exported for test/grammar-floors.ts. */
export const EXEMPLAR_SPECS: Record<Stance, Record<string, unknown>> = {
  faithful: DASHBOARD_SPEC,
  bolder: POSTER_SPEC,
  unexpected: EDITORIAL_SPEC,
};

const frameExemplar = (shape: string, spec: object): string =>
  `Worked example of a correctly DENSE spec (${shape}). Structure only — every <placeholder> stands for real product content you must write; match the density and layering, never the layout verbatim:\n${JSON.stringify(spec)}`;

/** Stance-mapped prompt exemplars, appended after the transfer exemplar. */
export const STANCE_EXEMPLARS: Record<Stance, string> = {
  faithful: frameExemplar(
    'asymmetric data dashboard: 12 elements, dominant subject right of axis, data pinned onto it, four z planes, a band bleeding off the right',
    DASHBOARD_SPEC,
  ),
  bolder: frameExemplar(
    'poster-style diagonal: 11 elements, ring-wrapped subject off-axis, rotated display type, a diagonal slash, dot-field texture',
    POSTER_SPEC,
  ),
  unexpected: frameExemplar(
    'editorial split: 12 elements, bleed image left, stepped text rhythm right, a pull quote breaking the left edge',
    EDITORIAL_SPEC,
  ),
};
