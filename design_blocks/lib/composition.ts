/**
 * CompositionSpec — the layout representation that replaced the template
 * grammar as the owner of page structure.
 *
 * Design rules, learned the hard way:
 *
 * - OPEN where design lives: element roles are free text, frames are
 *   continuous numbers, relations compose arbitrarily. There is no
 *   heroForm enum and no section list — a composition the authors never
 *   anticipated must be expressible.
 * - CLOSED where a renderer needs a finite instruction set: element
 *   kinds (image/panel/text/viz/shape/group), relation types, viz
 *   drawing primitives, palette roles. The litmus test for a kind:
 *   rendering it with an empty spec must produce NOTHING — any kind
 *   with a built-in arrangement is a template seed and gets rejected.
 * - Frames are the model's initial guess; relations are the intent the
 *   resolver ENFORCES (an "overlaps 30%" that doesn't overlap after
 *   resolution is a resolver bug, not a hope).
 * - Sanitizers may clamp numbers into range but NEVER silently delete a
 *   relation — dropped structure is exactly the regression this
 *   architecture exists to prevent, so every repair/drop is counted in
 *   SpecIntegrity and too many demote the spec below the usability
 *   floor.
 *
 * frame convention: integer percentages of the PARENT box (canvas for
 * roots), {x,y,w,h} from the top-left, pre-rotation; rotation is degrees
 * about the frame center. Overshoot within [-50, 150] is legal — that is
 * how bleeds and container breaks are stated.
 */

import type { DesignReferenceAnalysis, PctBox } from './analysis.js';
import { transferBrief } from './analysis.js';
import { STANCE_EXEMPLARS } from './exemplars.js';
import type { ProductIntent } from './intent.js';
import { chat, parseJsonReply } from './qwen.js';

export type Stance = 'faithful' | 'bolder' | 'unexpected';

export type Relation =
  | { type: 'overlaps'; target: string; amount: number; side?: 'left' | 'right' | 'top' | 'bottom' }
  | { type: 'attachedTo'; target: string; at: { x: number; y: number } }
  | { type: 'breaksContainer'; side: 'left' | 'right' | 'top' | 'bottom'; amount: number }
  | { type: 'offsetFrom'; target: string; edge: 'left' | 'right' | 'top' | 'bottom'; amount: number }
  | { type: 'encircles'; target: string; ratio: number };

export type VizPrimitive = {
  primitive: 'ringSegment' | 'leaderCallout' | 'barColumn' | 'sparkline' | 'dotField' | 'flowLine';
  params: Record<string, unknown>;
};

export type ElementKind = 'image' | 'panel' | 'text' | 'viz' | 'shape' | 'group';

export type CompElement = {
  id: string;
  /** free text: 'primary-subject', 'metric-annotation', 'navigation', ... */
  role: string;
  kind: ElementKind;
  parent?: string;
  frame: PctBox;
  /** depth plane, 0 (back) .. 4 (front) */
  z: number;
  rotation?: number;
  relations: Relation[];
  imagery?: {
    subject: string;
    integration: 'cutout' | 'contained' | 'bleed';
    surface?: 'plain' | 'texture';
    mask?: 'circle' | 'none';
  };
  viz?: {
    /** which DataDisplayIntent this serves */
    intent: string;
    /** the visual idea in prose — provenance only, never rendered from */
    form: string;
    /** the machine-facing drawing program, chosen at spec time */
    render: VizPrimitive[];
    values?: Array<{ label: string; value: string }>;
  };
  content?: {
    heading?: string;
    body?: string;
    label?: string;
    value?: string;
    items?: string[];
    /** fill = size type to fill the frame (display type); wrap = normal flow */
    fit?: 'fill' | 'wrap';
  };
  style?: {
    surface?: 'solid' | 'glass' | 'outline' | 'none';
    paletteRole?: 'accent' | 'primary' | 'ink' | 'neutral' | 'surface';
    emphasis?: number;
  };
  /** groups only: regularity primitive — children without frames auto-flow */
  layout?: { type: 'grid'; cols: number; gap?: number };
};

export type CompositionSpec = {
  version: 1;
  canvas: { width: number; height: number };
  focalElementId: string;
  planes: number;
  /** the transferable principles this composition claims to embody */
  principles: string[];
  source: { referenceId?: string; stance: Stance; signaturePatternsUsed: string[] };
  elements: CompElement[];
};

/** Every repair and drop, counted — silent degradation is a bug. */
export type SpecIntegrity = {
  repairedFrames: number;
  repairedRelations: number;
  droppedRelations: number;
  droppedElements: number;
  notes: string[];
};

export const MAX_ELEMENTS = 18;
const MAX_RELATIONS_PER_ELEMENT = 3;
const MAX_IMAGERY_ELEMENTS = 3;
const RELATION_TYPES = new Set(['overlaps', 'attachedTo', 'breaksContainer', 'offsetFrom', 'encircles']);
const KINDS = new Set<ElementKind>(['image', 'panel', 'text', 'viz', 'shape', 'group']);
const SIDES = new Set(['left', 'right', 'top', 'bottom']);
const PRIMITIVES = new Set(['ringSegment', 'leaderCallout', 'barColumn', 'sparkline', 'dotField', 'flowLine']);
const SURFACES = new Set(['solid', 'glass', 'outline', 'none']);
const PALETTE_ROLES = new Set(['accent', 'primary', 'ink', 'neutral', 'surface']);
const INTEGRATIONS = new Set(['cutout', 'contained', 'bleed']);

/* ------------------------------------------------------------------ */
/* sanitize                                                            */
/* ------------------------------------------------------------------ */

function clampPct(n: unknown, integrity: SpecIntegrity, what: string): number {
  let v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  if (Math.abs(v) > 0 && Math.abs(v) <= 1.5 && !Number.isInteger(v)) {
    // fraction emitted where a percentage belongs
    v = v * 100;
    integrity.repairedFrames++;
  }
  if (v > 200) {
    // pixels emitted where a percentage belongs — scale, don't clamp
    v = (v / 1440) * 100;
    integrity.repairedFrames++;
    integrity.notes.push(`${what}: pixel-looking value rescaled`);
  }
  return Math.max(-50, Math.min(150, Math.round(v)));
}

function sanitizeFrame(raw: unknown, integrity: SpecIntegrity, id: string): PctBox {
  const v = (raw ?? {}) as Record<string, unknown>;
  const frame = {
    x: clampPct(v.x, integrity, `${id}.frame.x`),
    y: clampPct(v.y, integrity, `${id}.frame.y`),
    w: Math.max(2, clampPct(v.w, integrity, `${id}.frame.w`)),
    h: Math.max(2, clampPct(v.h, integrity, `${id}.frame.h`)),
  };
  if (!raw || typeof raw !== 'object') {
    integrity.repairedFrames++;
    integrity.notes.push(`${id}: missing frame, defaulted`);
    return { x: 10, y: 10, w: 40, h: 20 };
  }
  return frame;
}

function sanitizeRelation(raw: unknown, ids: Set<string>, selfId: string, integrity: SpecIntegrity): Relation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = typeof r.type === 'string' && RELATION_TYPES.has(r.type) ? r.type : null;
  if (!type) {
    integrity.droppedRelations++;
    integrity.notes.push(`${selfId}: relation with unknown type '${String(r.type)}' dropped`);
    return null;
  }
  const target = typeof r.target === 'string' ? r.target : '';
  const needsTarget = type !== 'breaksContainer';
  if (needsTarget && (!target || !ids.has(target) || target === selfId)) {
    integrity.droppedRelations++;
    integrity.notes.push(`${selfId}: ${type} relation with unresolvable target '${target}' dropped`);
    return null;
  }
  const frac = (v: unknown, fallback: number, lo: number, hi: number): number => {
    const given = typeof v === 'number' && Number.isFinite(v);
    let n = given ? (v as number) : fallback;
    // Percent-vs-fraction repair: only when the value sits far outside
    // the legal band (an encircles ratio of 1.8 is legal, 80 is not).
    if (n > hi * 2) n = n / 100;
    const clamped = Math.max(lo, Math.min(hi, n));
    // A repair is a genuine transformation of a supplied number — a
    // filled-in missing optional field is not one.
    if (given && clamped !== v) integrity.repairedRelations++;
    return clamped;
  };
  switch (type) {
    case 'overlaps':
      return {
        type,
        target,
        amount: frac(r.amount, 0.25, 0.05, 0.9),
        side: typeof r.side === 'string' && SIDES.has(r.side) ? (r.side as 'left') : undefined,
      };
    case 'attachedTo': {
      const at = (r.at ?? {}) as Record<string, unknown>;
      const point = (v: unknown) => {
        let n = typeof v === 'number' && Number.isFinite(v) ? v : 50;
        if (n <= 1.5) n = n * 100;
        return Math.max(0, Math.min(100, Math.round(n)));
      };
      return { type, target, at: { x: point(at.x), y: point(at.y) } };
    }
    case 'breaksContainer':
      return {
        type,
        side: typeof r.side === 'string' && SIDES.has(r.side) ? (r.side as 'left') : 'right',
        amount: frac(r.amount, 0.2, 0.05, 0.6),
      };
    case 'offsetFrom':
      return {
        type,
        target,
        edge: typeof r.edge === 'string' && SIDES.has(r.edge) ? (r.edge as 'left') : 'top',
        amount: frac(r.amount, 0.05, 0.01, 0.3),
      };
    case 'encircles':
      return { type, target, ratio: frac(r.ratio, 1.15, 1.0, 2.0) };
    default:
      return null;
  }
}

function sanitizeViz(raw: unknown): CompElement['viz'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = raw as Record<string, unknown>;
  const render = Array.isArray(v.render)
    ? (v.render as Array<Record<string, unknown>>)
        .filter((p) => typeof p.primitive === 'string' && PRIMITIVES.has(p.primitive))
        .slice(0, 4)
        .map((p) => ({
          primitive: p.primitive as VizPrimitive['primitive'],
          params: p.params && typeof p.params === 'object' ? (p.params as Record<string, unknown>) : {},
        }))
    : [];
  const values = Array.isArray(v.values)
    ? (v.values as Array<Record<string, unknown>>)
        .filter((x) => typeof x.label === 'string')
        .slice(0, 8)
        .map((x) => ({ label: x.label as string, value: String(x.value ?? '') }))
    : undefined;
  return {
    intent: typeof v.intent === 'string' ? v.intent : 'show data',
    form: typeof v.form === 'string' ? v.form : '',
    render: render.length ? render : defaultRender(typeof v.intent === 'string' ? v.intent : ''),
    values,
  };
}

/**
 * The deterministic intent→primitive floor. Used only when the model
 * named no drawing primitives at all — so a viz element still renders,
 * and the choice is recorded as a repair.
 */
export function defaultRender(intent: string): VizPrimitive[] {
  const lower = intent.toLowerCase();
  if (/(progress|health|complete|score)/.test(lower)) return [{ primitive: 'ringSegment', params: { fraction: 0.72 } }];
  if (/(time|trend|history|change)/.test(lower)) return [{ primitive: 'sparkline', params: {} }];
  if (/(compare|magnitude|rank)/.test(lower)) return [{ primitive: 'barColumn', params: { labelsInBars: true } }];
  if (/(spatial|condition|attach|annotate|pin)/.test(lower)) return [{ primitive: 'leaderCallout', params: {} }];
  if (/(distribution|density|spread)/.test(lower)) return [{ primitive: 'dotField', params: { count: 48 } }];
  return [{ primitive: 'sparkline', params: {} }];
}

function sanitizeElement(
  raw: Record<string, unknown>,
  index: number,
  ids: Set<string>,
  integrity: SpecIntegrity,
): CompElement {
  const id = typeof raw.id === 'string' && raw.id ? raw.id : `el-${index}`;
  const kindRaw = typeof raw.kind === 'string' ? raw.kind : 'panel';
  const kind = KINDS.has(kindRaw as ElementKind) ? (kindRaw as ElementKind) : 'panel';
  const style = (raw.style ?? {}) as Record<string, unknown>;
  const imagery = raw.imagery as Record<string, unknown> | undefined;
  const content = raw.content as Record<string, unknown> | undefined;
  const layout = raw.layout as Record<string, unknown> | undefined;

  const relationsRaw = Array.isArray(raw.relations) ? raw.relations : [];
  if (relationsRaw.length > MAX_RELATIONS_PER_ELEMENT) {
    integrity.droppedRelations += relationsRaw.length - MAX_RELATIONS_PER_ELEMENT;
    integrity.notes.push(`${id}: relation count capped at ${MAX_RELATIONS_PER_ELEMENT}`);
  }
  const relations = relationsRaw
    .slice(0, MAX_RELATIONS_PER_ELEMENT)
    .map((r) => sanitizeRelation(r, ids, id, integrity))
    .filter((r): r is Relation => r !== null);

  return {
    id,
    role: typeof raw.role === 'string' && raw.role ? raw.role : kind,
    kind,
    parent: typeof raw.parent === 'string' && ids.has(raw.parent) && raw.parent !== id ? raw.parent : undefined,
    frame: sanitizeFrame(raw.frame, integrity, id),
    z: Math.max(0, Math.min(4, Math.round(Number(raw.z)) || 0)),
    rotation:
      typeof raw.rotation === 'number' && Number.isFinite(raw.rotation)
        ? Math.max(-90, Math.min(90, Math.round(raw.rotation)))
        : undefined,
    relations,
    imagery:
      imagery && typeof imagery.subject === 'string'
        ? {
            subject: imagery.subject,
            integration: INTEGRATIONS.has(imagery.integration as string)
              ? (imagery.integration as 'cutout')
              : 'contained',
            surface: imagery.surface === 'texture' ? 'texture' : 'plain',
            mask: imagery.mask === 'circle' ? 'circle' : 'none',
          }
        : undefined,
    viz: kind === 'viz' ? (sanitizeViz(raw.viz) ?? { intent: 'show data', form: '', render: defaultRender('') }) : undefined,
    content: content
      ? {
          heading: typeof content.heading === 'string' ? content.heading.slice(0, 120) : undefined,
          body: typeof content.body === 'string' ? content.body.slice(0, 400) : undefined,
          label: typeof content.label === 'string' ? content.label.slice(0, 60) : undefined,
          value: typeof content.value === 'string' ? content.value.slice(0, 40) : undefined,
          items: Array.isArray(content.items)
            ? content.items.filter((i): i is string => typeof i === 'string').slice(0, 8)
            : undefined,
          fit: content.fit === 'fill' ? 'fill' : content.fit === 'wrap' ? 'wrap' : undefined,
        }
      : undefined,
    style: {
      surface: SURFACES.has(style.surface as string) ? (style.surface as 'solid') : undefined,
      paletteRole: PALETTE_ROLES.has(style.paletteRole as string) ? (style.paletteRole as 'accent') : undefined,
      emphasis:
        typeof style.emphasis === 'number' && Number.isFinite(style.emphasis)
          ? Math.max(0, Math.min(1, style.emphasis))
          : undefined,
    },
    layout:
      kind === 'group' && layout && layout.type === 'grid'
        ? {
            type: 'grid',
            cols: Math.max(1, Math.min(6, Math.round(Number(layout.cols)) || 2)),
            gap: typeof layout.gap === 'number' ? Math.max(0, Math.min(6, Math.round(layout.gap))) : 2,
          }
        : undefined,
  };
}

/** Break parent cycles by re-rooting the element that closes the loop. */
function breakParentCycles(elements: CompElement[], integrity: SpecIntegrity): void {
  const byId = new Map(elements.map((e) => [e.id, e]));
  for (const element of elements) {
    const seen = new Set<string>([element.id]);
    let current = element.parent;
    while (current) {
      if (seen.has(current)) {
        integrity.notes.push(`${element.id}: parent cycle broken`);
        element.parent = undefined;
        break;
      }
      seen.add(current);
      if (seen.size > 3) {
        // nesting deeper than 3 — flatten to root
        element.parent = undefined;
        integrity.notes.push(`${element.id}: nesting deeper than 3, re-rooted`);
        break;
      }
      current = byId.get(current)?.parent;
    }
  }
}

export function sanitizeSpec(
  raw: unknown,
  stance: Stance,
  referenceId?: string,
): { spec: CompositionSpec; integrity: SpecIntegrity } | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const elementsRaw = Array.isArray(s.elements) ? (s.elements as Array<Record<string, unknown>>) : [];
  if (elementsRaw.length === 0) return null;

  const integrity: SpecIntegrity = {
    repairedFrames: 0,
    repairedRelations: 0,
    droppedRelations: 0,
    droppedElements: 0,
    notes: [],
  };
  if (elementsRaw.length > MAX_ELEMENTS) {
    integrity.droppedElements = elementsRaw.length - MAX_ELEMENTS;
    integrity.notes.push(`element count capped at ${MAX_ELEMENTS}`);
  }

  // Two passes: ids first (relations/parents validate against the full
  // set), then the elements themselves.
  const capped = elementsRaw.slice(0, MAX_ELEMENTS);
  const ids = new Set<string>();
  capped.forEach((e, i) => {
    let id = typeof e.id === 'string' && e.id ? e.id : `el-${i}`;
    while (ids.has(id)) id = `${id}-${i}`;
    e.id = id;
    ids.add(id);
  });
  const elements = capped.map((e, i) => sanitizeElement(e, i, ids, integrity));
  breakParentCycles(elements, integrity);

  // Imagery cap: keep the largest imagery elements, demote the rest to panels.
  const withImagery = elements.filter((e) => e.imagery);
  if (withImagery.length > MAX_IMAGERY_ELEMENTS) {
    withImagery
      .sort((a, b) => b.frame.w * b.frame.h - a.frame.w * a.frame.h)
      .slice(MAX_IMAGERY_ELEMENTS)
      .forEach((e) => {
        e.imagery = undefined;
        integrity.notes.push(`${e.id}: imagery demoted (cap ${MAX_IMAGERY_ELEMENTS})`);
      });
  }

  const canvas = (s.canvas ?? {}) as Record<string, unknown>;
  const focalRaw = typeof s.focalElementId === 'string' ? s.focalElementId : '';
  const focal =
    ids.has(focalRaw)
      ? focalRaw
      : elements.reduce((best, e) => (e.frame.w * e.frame.h > best.frame.w * best.frame.h ? e : best), elements[0]).id;
  if (focal !== focalRaw) integrity.notes.push(`focalElementId '${focalRaw}' unresolvable — largest element assigned`);

  // focalCenter is the guided grammar's off-axis floor (buildGuidedSchema),
  // not part of the stored spec shape. When the model declared one, the
  // focal element's frame is translated so its center lands on it; the
  // field is stripped by never being copied into the result, so nothing
  // downstream sees a new shape. Specs without it — the unguided 4xx
  // fallback, every hand-authored spec — take this path as a pure no-op,
  // and a declaration that already agrees with the frame is not a repair.
  const declaredCenter = s.focalCenter as Record<string, unknown> | undefined;
  if (declaredCenter && typeof declaredCenter === 'object') {
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const cx = num(declaredCenter.x);
    const cy = num(declaredCenter.y);
    const focalElement = elements.find((e) => e.id === focal);
    if (focalElement && !focalElement.parent && cx !== null && cy !== null) {
      const nx = Math.max(-50, Math.min(150, Math.round(cx - focalElement.frame.w / 2)));
      const ny = Math.max(-50, Math.min(150, Math.round(cy - focalElement.frame.h / 2)));
      if (nx !== focalElement.frame.x || ny !== focalElement.frame.y) {
        integrity.repairedFrames++;
        integrity.notes.push(
          `${focalElement.id}: frame translated to declared focalCenter (${Math.round(cx)},${Math.round(cy)})`,
        );
        focalElement.frame.x = nx;
        focalElement.frame.y = ny;
      }
    }
  }

  return {
    spec: {
      version: 1,
      canvas: {
        width: 1440,
        height: Math.max(1200, Math.min(3000, Math.round(Number(canvas.height)) || 2000)),
      },
      focalElementId: focal,
      planes: Math.max(1, Math.min(5, Math.round(Number(s.planes)) || 2)),
      principles: Array.isArray(s.principles)
        ? s.principles.filter((p): p is string => typeof p === 'string').slice(0, 8)
        : [],
      source: {
        referenceId,
        stance,
        signaturePatternsUsed: Array.isArray((s.source as Record<string, unknown>)?.signaturePatternsUsed)
          ? ((s.source as Record<string, unknown>).signaturePatternsUsed as unknown[])
              .filter((p): p is string => typeof p === 'string')
              .slice(0, 8)
          : [],
      },
      elements,
    },
    integrity,
  };
}

/* ------------------------------------------------------------------ */
/* structural validation against the analysis                          */
/* ------------------------------------------------------------------ */

function elementArea(e: CompElement): number {
  return (e.frame.w * e.frame.h) / 10_000; // fraction of parent
}

/**
 * Quantitative assertions derived FROM the analysis — the tripwire that
 * catches a model regressing to navbar-hero-cards while the provenance
 * still claims reference transfer. Returns human-readable failures that
 * go verbatim into the retry prompt.
 */
export function validateSpecAgainstAnalysis(
  spec: CompositionSpec,
  analysis: DesignReferenceAnalysis,
  intent: ProductIntent,
): string[] {
  const errors: string[] = [];
  const byId = new Map(spec.elements.map((e) => [e.id, e]));
  const focal = byId.get(spec.focalElementId)!;
  const roots = spec.elements.filter((e) => !e.parent);

  // Dominance: if the reference had a dominant mass, the transfer needs one.
  const dominantMass = analysis.composition.masses.find((m) => m.area === 'dominant');
  if (dominantMass && elementArea(focal) < 0.12 && focal.parent === undefined) {
    errors.push(
      `the reference has a dominant visual mass (~${Math.round((dominantMass.bbox.w * dominantMass.bbox.h) / 100)}% of the canvas) but the focal element '${focal.id}' covers only ~${Math.round(elementArea(focal) * 100)}% — make one element genuinely dominant`,
    );
  }

  // Asymmetry: focal center must sit off-axis.
  if (analysis.composition.symmetry !== 'symmetric') {
    const centerX = focal.frame.x + focal.frame.w / 2;
    const minOffset = analysis.composition.symmetry === 'strongly-asymmetric' ? 12 : 6;
    if (Math.abs(centerX - 50) < minOffset && !focal.parent) {
      errors.push(
        `the reference is ${analysis.composition.symmetry} but the focal element is centered (center at ${Math.round(centerX)}%) — shift the dominant mass off-axis by at least ${minOffset}%`,
      );
    }
  }

  // Depth: claimed planes need real z-spread and real overlaps.
  if (analysis.layering.planes >= 3) {
    const zValues = new Set(spec.elements.map((e) => e.z));
    const depthRelations = spec.elements.flatMap((e) =>
      e.relations.filter((r) => (r.type === 'overlaps' && r.amount >= 0.15) || r.type === 'encircles'),
    );
    if (zValues.size < 3)
      errors.push(`the reference has ${analysis.layering.planes} depth planes but the spec uses only ${zValues.size} z values — spread elements across at least 3`);
    // demand no more layering than the reference itself shows
    const neededOverlaps = Math.min(2, Math.max(1, analysis.layering.overlaps.length));
    if (depthRelations.length < neededOverlaps)
      errors.push(`the reference layers elements (${analysis.layering.overlaps.length} overlaps) but the spec declares ${depthRelations.length} meaningful overlap/encircle relations — add at least ${neededOverlaps}`);
  }

  // Container breaks.
  if (analysis.layering.containerBreaks.length > 0) {
    const breaks = spec.elements.some(
      (e) =>
        e.relations.some((r) => r.type === 'breaksContainer') ||
        e.frame.x < 0 ||
        e.frame.y < 0 ||
        e.frame.x + e.frame.w > 100,
    );
    if (!breaks)
      errors.push('the reference lets elements escape their containers but nothing in the spec breaks a container or bleeds past the canvas — add a breaksContainer relation or an overshooting frame');
  }

  // Attached data: if the reference pins data to imagery, the transfer must too.
  const attachedForms = analysis.dataDisplay.some((d) => /(pin|attach|wrap|orbit|around|onto|spatial)/i.test(d.form + d.integration));
  if (attachedForms) {
    const hasAttachment = spec.elements.some((e) =>
      e.relations.some((r) => r.type === 'attachedTo' || r.type === 'encircles'),
    );
    if (!hasAttachment)
      errors.push('the reference attaches data spatially to its subject, but no element uses attachedTo or encircles — pin at least one data element to the primary visual');
  }

  // Product data must land somewhere.
  if (intent.dataDisplays.length > 0 && !spec.elements.some((e) => e.kind === 'viz')) {
    errors.push('the product has data to display but the spec has no viz element');
  }

  // The classic template tell: N same-size panels in a row on an
  // asymmetric reference.
  if (analysis.composition.symmetry !== 'symmetric') {
    const rows = new Map<string, CompElement[]>();
    for (const e of roots.filter((e) => e.kind === 'panel' || e.kind === 'viz')) {
      const key = `${Math.round(e.frame.y / 4)}:${Math.round(e.frame.w / 4)}:${Math.round(e.frame.h / 4)}`;
      rows.set(key, [...(rows.get(key) ?? []), e]);
    }
    for (const [, group] of rows) {
      if (group.length >= 3) {
        errors.push(
          `${group.length} identical panels sit in an evenly-spaced row (${group.map((g) => g.id).join(', ')}) — the reference is ${analysis.composition.symmetry}; vary their scale, vertical offset, or overlap`,
        );
        break;
      }
    }
  }

  if (spec.elements.length < 6) errors.push(`only ${spec.elements.length} elements — a full page needs at least 6`);
  if (!spec.elements.some((e) => e.kind === 'text' && e.content?.heading))
    errors.push('no text element carries a heading');

  // Density: sample a grid over the canvas — a composition full of empty
  // bands feels unfinished no matter how good its focal move is. Checked
  // for the first viewport and the whole page separately.
  const coverage = (fromY: number, toY: number): number => {
    let covered = 0;
    const cells = 20;
    for (let gx = 0; gx < cells; gx++) {
      for (let gy = 0; gy < cells; gy++) {
        const px = (gx + 0.5) * (100 / cells);
        const py = fromY + ((gy + 0.5) / cells) * (toY - fromY);
        const hit = roots.some(
          (e) => px >= e.frame.x && px <= e.frame.x + e.frame.w && py >= e.frame.y && py <= e.frame.y + e.frame.h,
        );
        if (hit) covered++;
      }
    }
    return covered / (cells * cells);
  };
  // Sparse-by-design references (brutalist emptiness IS the principle)
  // get looser floors — density policing must never fight the reference.
  const sparse = analysis.density.overall === 'sparse';
  const foldFloor = sparse ? 0.28 : 0.45;
  const wholeFloor = sparse ? 0.3 : 0.5;
  const viewportPct = Math.min(100, (900 / spec.canvas.height) * 100);
  const aboveFold = coverage(0, viewportPct);
  if (aboveFold < foldFloor)
    errors.push(
      `only ${Math.round(aboveFold * 100)}% of the first viewport is covered by elements — the opening screen must feel designed, not empty; add or enlarge elements in the top ${Math.round(viewportPct)}% of the canvas`,
    );
  const whole = coverage(0, 100);
  if (whole < wholeFloor)
    errors.push(
      `only ${Math.round(whole * 100)}% of the full canvas is covered — either shrink canvas.height or fill the empty bands with content`,
    );

  return errors;
}

/** The floor below which a spec may not render — fall back instead. */
export function specUsable(result: { spec: CompositionSpec; integrity: SpecIntegrity } | null): boolean {
  if (!result) return false;
  const { spec, integrity } = result;
  if (spec.elements.length < 5) return false;
  if (integrity.droppedRelations > 4) return false;
  const hasStructure =
    spec.elements.some((e) => e.relations.length > 0) ||
    spec.elements.some((e) => !e.parent && elementArea(e) >= 0.25);
  return hasStructure;
}

/* ------------------------------------------------------------------ */
/* generation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Guided-decoding schema, built per analysis — the floors the post-hoc
 * validators could only retry now live in the grammar itself:
 *
 * - `elements.minItems`: a sparse spec is unrepresentable. Both live runs
 *   emitted 5-element specs against the prompt's 9-14 rule, and the retry
 *   didn't fix it — prompt rules alone don't bind a 4B model.
 * - `focalCenter`: on any non-symmetric reference the spec must declare
 *   the canvas point where the focal element's center sits, and x is
 *   constrained to a disjoint off-axis band — a centered focal cannot be
 *   decoded. 38/62 clears even the strongly-asymmetric 12% floor because
 *   validateSpecAgainstAnalysis compares with strict <.
 *
 * validateSpecAgainstAnalysis stays as the backstop: chat() silently
 * retries unguided on a 4xx, and that path is bound by nothing but the
 * prompt.
 */
export const MIN_ELEMENTS = 9;

export function buildGuidedSchema(analysis: DesignReferenceAnalysis): Record<string, unknown> {
  const offAxisFocal = analysis.composition.symmetry !== 'symmetric';
  return {
    type: 'object',
    properties: {
      canvas: { type: 'object', properties: { height: { type: 'integer' } }, required: ['height'] },
      focalElementId: { type: 'string' },
      planes: { type: 'integer' },
      // Declared before `elements` so the model commits to the off-axis
      // anchor first and places the focal element to agree with it;
      // sanitizeSpec enforces the agreement, then strips the field.
      ...(offAxisFocal
        ? {
            focalCenter: {
              type: 'object',
              properties: {
                x: {
                  anyOf: [
                    { type: 'integer', minimum: 5, maximum: 38 },
                    { type: 'integer', minimum: 62, maximum: 95 },
                  ],
                },
                y: { type: 'integer', minimum: 5, maximum: 95 },
              },
              required: ['x', 'y'],
            },
          }
        : {}),
      principles: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      source: {
        type: 'object',
        properties: { signaturePatternsUsed: { type: 'array', items: { type: 'string' }, maxItems: 8 } },
      },
      elements: {
        type: 'array',
        minItems: MIN_ELEMENTS,
        maxItems: MAX_ELEMENTS,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            role: { type: 'string' },
            kind: { type: 'string', enum: ['image', 'panel', 'text', 'viz', 'shape', 'group'] },
            parent: { type: 'string' },
            frame: {
              type: 'object',
              properties: {
                x: { type: 'integer' }, y: { type: 'integer' },
                w: { type: 'integer' }, h: { type: 'integer' },
              },
              required: ['x', 'y', 'w', 'h'],
            },
            z: { type: 'integer' },
            rotation: { type: 'integer' },
            relations: {
              type: 'array',
              maxItems: MAX_RELATIONS_PER_ELEMENT,
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['overlaps', 'attachedTo', 'breaksContainer', 'offsetFrom', 'encircles'] },
                  target: { type: 'string' },
                  amount: { type: 'number' },
                  side: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
                  edge: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
                  at: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' } } },
                  ratio: { type: 'number' },
                },
                required: ['type'],
              },
            },
            imagery: {
              type: 'object',
              properties: {
                subject: { type: 'string' },
                integration: { type: 'string', enum: ['cutout', 'contained', 'bleed'] },
                surface: { type: 'string', enum: ['plain', 'texture'] },
                mask: { type: 'string', enum: ['circle', 'none'] },
              },
              required: ['subject', 'integration'],
            },
            viz: {
              type: 'object',
              properties: {
                intent: { type: 'string' },
                form: { type: 'string' },
                render: {
                  type: 'array',
                  maxItems: 4,
                  items: {
                    type: 'object',
                    properties: {
                      primitive: { type: 'string', enum: ['ringSegment', 'leaderCallout', 'barColumn', 'sparkline', 'dotField', 'flowLine'] },
                      params: { type: 'object' },
                    },
                    required: ['primitive'],
                  },
                },
                values: {
                  type: 'array',
                  maxItems: 8,
                  items: {
                    type: 'object',
                    properties: { label: { type: 'string' }, value: { type: 'string' } },
                    required: ['label'],
                  },
                },
              },
              required: ['intent', 'render'],
            },
            content: {
              type: 'object',
              properties: {
                heading: { type: 'string' }, body: { type: 'string' },
                label: { type: 'string' }, value: { type: 'string' },
                items: { type: 'array', items: { type: 'string' }, maxItems: 8 },
                fit: { type: 'string', enum: ['fill', 'wrap'] },
              },
            },
            style: {
              type: 'object',
              properties: {
                surface: { type: 'string', enum: ['solid', 'glass', 'outline', 'none'] },
                paletteRole: { type: 'string', enum: ['accent', 'primary', 'ink', 'neutral', 'surface'] },
                emphasis: { type: 'number' },
              },
            },
            layout: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['grid'] },
                cols: { type: 'integer' },
                gap: { type: 'integer' },
              },
              required: ['type', 'cols'],
            },
          },
          required: ['id', 'role', 'kind', 'frame', 'z'],
        },
      },
    },
    required: offAxisFocal
      ? ['focalElementId', 'planes', 'focalCenter', 'elements']
      : ['focalElementId', 'planes', 'elements'],
  };
}

/**
 * minItems:9 forces long decodes — nine full elements don't reliably fit
 * the old 2800-token cap, and a truncated guided reply wastes an entire
 * attempt (and its share of the shared T4).
 */
const SPEC_MAX_TOKENS = 3400;

/**
 * One compact worked exemplar of CROSS-DOMAIN transfer. 4B models need
 * the pattern shown, not described — this is the single strongest lever
 * against "put the reference's plant into the monitoring dashboard".
 */
const TRANSFER_EXEMPLAR =
  'Worked example of transfer (different reference, different product):\n' +
  'Structural brief said: mass A dominant at x=50..95%, data pinned onto it, ring wraps it, 4 planes, strongly-asymmetric.\n' +
  'Product was: infrastructure monitoring (subject: server topology graph; data: latency per node).\n' +
  'Correct transfer (excerpt): {"focalElementId":"topology","planes":4,"elements":[' +
  '{"id":"topology","role":"primary-subject","kind":"image","frame":{"x":42,"y":6,"w":55,"h":58},"z":2,"relations":[],' +
  '"imagery":{"subject":"server topology graph","integration":"cutout"}},' +
  '{"id":"latency-pin","role":"metric-annotation","kind":"viz","frame":{"x":30,"y":14,"w":16,"h":8},"z":3,' +
  '"relations":[{"type":"attachedTo","target":"topology","at":{"x":30,"y":40}}],' +
  '"viz":{"intent":"show latency at a node","form":"value pinned to a node","render":[{"primitive":"leaderCallout","params":{}}],"values":[{"label":"eu-west p99","value":"84ms"}]}},' +
  '{"id":"health-ring","role":"system-health","kind":"viz","frame":{"x":40,"y":4,"w":60,"h":62},"z":1,' +
  '"relations":[{"type":"encircles","target":"topology","ratio":1.15}],' +
  '"viz":{"intent":"indicate system health","form":"ring wrapping the subject","render":[{"primitive":"ringSegment","params":{"fraction":0.86}}]}},' +
  '{"id":"diag-panel","role":"diagnostic-panel","kind":"panel","frame":{"x":4,"y":48,"w":34,"h":30},"z":3,' +
  '"relations":[{"type":"overlaps","target":"topology","amount":0.3,"side":"right"}]}]}\n' +
  'Wrong transfer: putting a plant image into the monitoring page, or emitting a centered hero with a row of equal stat cards.';

export type GeneratedComposition = {
  spec: CompositionSpec;
  integrity: SpecIntegrity;
  validationErrors: string[];
  attempts: number;
};

const STANCE_NOTES: Record<Stance, string> = {
  faithful: 'Embody the structural brief as closely as the product allows.',
  bolder: 'Amplify the signature moves: stronger overlaps, bigger dominant mass, deeper layering than the brief states.',
  unexpected:
    'Keep the principles but make one defensible structural inversion (mirror the dominant axis, or move the density gradient) — still recognizably derived from the principles.',
};

function specPrompt(
  intent: ProductIntent,
  analysis: DesignReferenceAnalysis,
  stance: Stance,
  contentSeed: { headline?: string },
): Array<{ role: string; content: string }> {
  const dataLines = intent.dataDisplays
    .map((d) => `- ${d.intent} (${d.entities.join(', ') || 'unspecified'})`)
    .join('\n');
  return [
    {
      role: 'system',
      content:
        'You are an art director designing ONE page composition by TRANSFERRING the structural logic of a reference design onto a different product. ' +
        'You receive the reference as a domain-neutral structural brief plus transferable principles. You must ask: what is the EQUIVALENT design move for THIS product? ' +
        'Never copy reference content; never fall back to navbar + centered hero + equal cards unless the structural brief literally describes that.\n\n' +
        'Output ONLY JSON: {"canvas":{"height":<px 1200-4000>},"focalElementId":"<id>","planes":<1-5>,' +
        '"focalCenter":{"x","y"} (REQUIRED unless the reference is symmetric: the canvas point in % where the focal element\'s CENTER must sit — x is forced off-axis into 5-38 or 62-95, so commit to a side and place the focal element\'s frame to agree with it),' +
        '"principles":["<the principles you embodied>"],"source":{"signaturePatternsUsed":["<verbatim principles used>"]},' +
        '"elements":[{"id","role":"<free text role>","kind":"image|panel|text|viz|shape|group","parent":"<optional group id>",' +
        '"frame":{"x","y","w","h" as INTEGER % of parent (canvas for roots); overshoot past 0-100 = bleed},"z":<0-4 depth plane>,"rotation":<deg optional>,' +
        '"relations":[{"type":"overlaps","target","amount":<0-1>,"side"} | {"type":"attachedTo","target","at":{"x","y" % on target}} | ' +
        '{"type":"breaksContainer","side","amount":<0-1>} | {"type":"offsetFrom","target","edge","amount":<0-1>} | {"type":"encircles","target","ratio":<1.0-2.0>}],' +
        '"imagery":{"subject":"<text-to-image prompt for THIS product\'s subject>","integration":"cutout|contained|bleed","surface":"plain|texture","mask":"circle|none"},' +
        '"viz":{"intent":"<which product data need>","form":"<visual idea in words>","render":[{"primitive":"ringSegment|leaderCallout|barColumn|sparkline|dotField|flowLine","params":{}}],"values":[{"label","value"}]},' +
        '"content":{"heading","body","label","value","items":[],"fit":"fill|wrap"},' +
        '"style":{"surface":"solid|glass|outline|none","paletteRole":"accent|primary|ink|neutral|surface","emphasis":<0-1>},' +
        '"layout":{"type":"grid","cols":<1-6>,"gap":<0-6>} (groups only; children without frames auto-flow)}]}\n' +
        'Rules: 9-14 elements, terse content strings, canvas height 1400-2600 for a landing page. FILL the canvas — no empty band taller than ~15% of the page; the first viewport must feel dense with designed elements. Include a slim navigation group (explicit text children) and a footer text line as content, plus realistic content (headings, labels, values) from the product domain. ' +
        'Every product data need gets a viz element whose render primitives you choose to match the reference\'s data-display FORM. ' +
        'attachedTo pins annotations to points on a subject; encircles wraps a ring around it; overlaps and z create real depth; breaksContainer and frame overshoot create bleeds. ' +
        'A navigation area, if the page needs one, is a group of explicit text children — there is no prefab nav.\n\n' +
        TRANSFER_EXEMPLAR +
        '\n\n' +
        // One dense structural exemplar per stance (exemplars.ts) — the
        // transfer exemplar teaches the cross-domain move, this one teaches
        // density; different stances see different shapes so the three live
        // calls don't converge on one layout.
        STANCE_EXEMPLARS[stance],
    },
    {
      role: 'user',
      content:
        `PRODUCT\nType: ${intent.productType}\nAudience: ${intent.audience}\nTone: ${intent.tone.join(', ')}\n` +
        `Content to carry (priority order): ${intent.contentInventory.join('; ')}\n` +
        `Data needs:\n${dataLines || '- none'}\n` +
        `Primary visual subject: ${intent.primarySubject ?? 'none — let typography and surfaces carry the design'}\n` +
        (contentSeed.headline ? `Working headline: ${contentSeed.headline}\n` : '') +
        `\nREFERENCE (domain-scrubbed structural brief)\n${transferBrief(analysis)}\n` +
        `\nSTANCE: ${stance} — ${STANCE_NOTES[stance]}`,
    },
  ];
}

/**
 * intent + analysis -> CompositionSpec. One retry with the validation
 * failures quoted verbatim; the better of the two attempts wins. Null
 * only when both attempts fall below the usability floor.
 */
export async function generateComposition(
  intent: ProductIntent,
  analysis: DesignReferenceAnalysis,
  stance: Stance,
  contentSeed: { headline?: string } = {},
): Promise<GeneratedComposition | null> {
  const messages = specPrompt(intent, analysis, stance, contentSeed);
  const guidedSchema = buildGuidedSchema(analysis);
  let best: GeneratedComposition | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    // Long guided generation on a shared T4: one transport attempt with a
    // generous timeout — this loop is already the retry, and stacking
    // transport retries multiplies GPU load for every agent on the box.
    const reply = await chat(messages as unknown[], SPEC_MAX_TOKENS, {
      guidedJson: guidedSchema,
      timeoutMs: 240_000,
      attempts: 1,
    });
    if (!reply) break;

    const parsed = parseJsonReply(reply);
    if (parsed === null) {
      console.error(`[design-blocks] composition reply was not JSON (attempt ${attempt}): ${reply.slice(0, 80)}`);
      // Guided decoding cannot emit malformed JSON — an unparseable guided
      // reply means the decode ran out of max_tokens mid-object.
      console.error(
        `[design-blocks] reply looks truncated (${reply.length} chars at max_tokens ${SPEC_MAX_TOKENS}) — a bigger cap or a leaner prompt is the fix`,
      );
    }
    const result = sanitizeSpec(parsed, stance, analysis.refId);
    if (result && specUsable(result)) {
      const validationErrors = validateSpecAgainstAnalysis(result.spec, analysis, intent);
      const candidate: GeneratedComposition = { ...result, validationErrors, attempts: attempt };
      if (!best || candidate.validationErrors.length < best.validationErrors.length) best = candidate;
      if (validationErrors.length === 0) return candidate;
      // Feed the failures back verbatim for one guided retry.
      if (attempt === 1) {
        messages.push(
          { role: 'assistant', content: reply.slice(0, 6000) },
          {
            role: 'user',
            content:
              'Your composition failed these structural checks against the reference:\n' +
              validationErrors.map((e) => `- ${e}`).join('\n') +
              '\nRegenerate the FULL JSON fixing every failure. Keep everything that already works.',
          },
        );
      }
    } else if (attempt === 1) {
      messages.push({
        role: 'user',
        content: 'That was not a usable spec (too few elements or malformed). Output the full JSON again, following the schema exactly.',
      });
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* bounded revision — the only edits a critique round may make          */
/* ------------------------------------------------------------------ */

export type RevisionOp =
  | { op: 'move'; id: string; dx: number; dy: number }
  | { op: 'resize'; id: string; w: number; h: number }
  | { op: 'setZ'; id: string; z: number }
  | { op: 'setSurface'; id: string; surface: 'solid' | 'glass' | 'outline' | 'none' }
  | { op: 'addRelation'; id: string; relation: Relation }
  | { op: 'strengthenRelation'; id: string; index: number; amount: number };

/** the same amount bands sanitizeRelation enforces at generation time */
const AMOUNT_BANDS: Record<string, [number, number]> = {
  overlaps: [0.05, 0.9],
  breaksContainer: [0.05, 0.6],
  offsetFrom: [0.01, 0.3],
};

/**
 * Applies whitelisted ops to a DEEP COPY of the spec. Whole-element
 * rewrites are not possible from a critique round by construction —
 * bounded blast radius, and every op re-passes the resolver invariants.
 *
 * The critique prompt asks for move/resize in PIXELS (the critic sees
 * resolved px geometry); frames are percent-of-parent, so `sizes` maps
 * each element id to the pixel size of its parent box for conversion.
 * Without it, ops are treated as already-percent.
 */
export function applyRevisionOps(
  spec: CompositionSpec,
  ops: RevisionOp[],
  sizes?: Map<string, { w: number; h: number }>,
): CompositionSpec {
  const revised: CompositionSpec = JSON.parse(JSON.stringify(spec));
  const byId = new Map(revised.elements.map((e) => [e.id, e]));
  const ids = new Set(revised.elements.map((e) => e.id));
  const scratch: SpecIntegrity = { repairedFrames: 0, repairedRelations: 0, droppedRelations: 0, droppedElements: 0, notes: [] };
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
  const toPct = (id: string, px: number, axis: 'w' | 'h'): number => {
    const parent = sizes?.get(id);
    return parent ? (px / (axis === 'w' ? parent.w : parent.h)) * 100 : px;
  };

  for (const op of ops.slice(0, 8)) {
    const element = byId.get((op as { id: string }).id);
    if (!element) continue;
    switch (op.op) {
      case 'move':
        if (!Number.isFinite(op.dx) || !Number.isFinite(op.dy)) break;
        element.frame.x = clamp(element.frame.x + toPct(element.id, op.dx, 'w'), -50, 150);
        element.frame.y = clamp(element.frame.y + toPct(element.id, op.dy, 'h'), -50, 150);
        break;
      case 'resize':
        if (!(op.w > 0) || !(op.h > 0)) break;
        element.frame.w = clamp(toPct(element.id, op.w, 'w'), 2, 150);
        element.frame.h = clamp(toPct(element.id, op.h, 'h'), 2, 150);
        break;
      case 'setZ':
        if (!Number.isFinite(op.z)) break;
        element.z = clamp(op.z, 0, 4);
        break;
      case 'setSurface':
        element.style = { ...element.style, surface: op.surface };
        break;
      case 'addRelation': {
        // Critique ops arrive from a model — the relation passes through
        // the same sanitizer as generation output before it may touch
        // the spec (a garbage ratio/amount would corrupt the resolver).
        const clean = sanitizeRelation(op.relation, ids, element.id, scratch);
        if (clean && element.relations.length < MAX_RELATIONS_PER_ELEMENT) {
          element.relations.push(clean);
        }
        break;
      }
      case 'strengthenRelation': {
        if (!Number.isFinite(op.index) || !Number.isFinite(op.amount)) break;
        const relation = element.relations[op.index];
        if (relation && 'amount' in relation) {
          const [lo, hi] = AMOUNT_BANDS[relation.type] ?? [0.05, 0.9];
          relation.amount = Math.max(lo, Math.min(hi, op.amount));
        }
        break;
      }
    }
  }
  return revised;
}
