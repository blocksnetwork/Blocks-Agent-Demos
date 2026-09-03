/**
 * Absolute design-quality gate on a RESOLVED layout.
 *
 * Everything else in the pipeline judges a composition relative to its
 * reference (structural fidelity) or relative to its siblings (the score
 * ranking). Neither says whether the page is fit to ship. This does, with
 * the plain rules a design reviewer applies before looking at taste:
 *
 *   - the headline is legible (wide enough to read at display size)
 *   - nothing important hangs off the canvas
 *   - text never sits on top of other text; panels don't collide unless
 *     the spec deliberately layered them
 *   - imagery is a subject, not the whole page
 *   - the page is filled: no dead bands, the first viewport is designed
 *
 * A failing composition is demoted to the deterministic template path,
 * never rendered as if it were a design.
 */

import type { CompElement, CompositionSpec } from './composition.js';
import type { ResolvedElement, ResolvedLayout } from './resolve.js';

export type QualityReport = {
  ok: boolean;
  failures: string[];
  warnings: string[];
  metrics: {
    coverageWhole: number;
    coverageViewport: number;
    imageryShare: number;
    collisions: number;
    offCanvas: number;
  };
};

type Box = { x: number; y: number; w: number; h: number };

const VIEWPORT_H = 900;

function area(b: Box): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}

function intersect(a: Box, b: Box): number {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ix > 0 && iy > 0 ? ix * iy : 0;
}

function insideFraction(b: Box, canvas: Box): number {
  const a = area(b);
  return a > 0 ? intersect(b, canvas) / a : 1;
}

function isDescendant(byId: Map<string, CompElement>, id: string, ancestor: string): boolean {
  let cursor = byId.get(id)?.parent;
  let hops = 0;
  while (cursor && hops++ < 20) {
    if (cursor === ancestor) return true;
    cursor = byId.get(cursor)?.parent;
  }
  return false;
}

function declaresLayering(a: CompElement, b: CompElement): boolean {
  const names = (e: CompElement, other: string) =>
    e.relations.some(
      (r) => (r.type === 'overlaps' || r.type === 'attachedTo' || r.type === 'encircles') && r.target === other,
    );
  return names(a, b.id) || names(b, a.id);
}

function breaksContainer(e: CompElement): boolean {
  return e.relations.some((r) => r.type === 'breaksContainer');
}

function isTextLike(e: CompElement): boolean {
  return e.kind === 'text' || (e.kind === 'panel' && Boolean(e.content?.heading || e.content?.body || e.content?.items?.length));
}

export type QualityOptions = {
  /** app screens and dashboards carry a screen title, not display type — the headline floor drops */
  pageType?: string;
};

export function assessQuality(spec: CompositionSpec, layout: ResolvedLayout, opts: QualityOptions = {}): QualityReport {
  const failures: string[] = [];
  const warnings: string[] = [];
  const canvas: Box = { x: 0, y: 0, w: layout.canvas.width, h: layout.canvas.height };
  const canvasArea = area(canvas);
  const byId = new Map(spec.elements.map((e) => [e.id, e]));
  const resolved = layout.elements;
  const roots = resolved.filter((r) => !r.element.parent);
  const boxOf = (r: ResolvedElement): Box => ({ x: r.x, y: r.y, w: r.w, h: r.h });

  /* element count */
  if (spec.elements.length < 6) failures.push(`only ${spec.elements.length} elements — a page needs at least 6`);
  if (spec.elements.length > 22) warnings.push(`${spec.elements.length} elements — dense for one screen`);

  /* off-canvas */
  let offCanvas = 0;
  for (const r of roots) {
    const inside = insideFraction(boxOf(r), canvas);
    const floor = breaksContainer(r.element) || r.element.kind === 'image' || r.element.kind === 'shape' ? 0.5 : 0.85;
    if (inside < floor) {
      offCanvas++;
      failures.push(`${r.element.id} (${r.element.kind}) has ${Math.round((1 - inside) * 100)}% of its area off the canvas`);
    }
  }

  /* headline legibility */
  const headlines = resolved.filter((r) => r.element.kind === 'text' && r.element.content?.heading);
  if (headlines.length === 0) failures.push('no text element carries a heading');
  const widest = headlines.sort((a, b) => b.w - a.w)[0];
  const headlineFloor = opts.pageType === 'app-screen' || opts.pageType === 'dashboard' ? 0.12 : 0.2;
  if (widest && widest.w < canvas.w * headlineFloor) {
    failures.push(`the widest headline (${widest.element.id}) is only ${Math.round((widest.w / canvas.w) * 100)}% of the canvas wide — display type needs at least ${Math.round(headlineFloor * 100)}%`);
  }
  for (const r of headlines) {
    if (r.w < 120 || r.h < 32) failures.push(`${r.element.id} is a ${Math.round(r.w)}×${Math.round(r.h)}px heading — unreadable at that size`);
  }

  /* collisions between content that is not declared as layered */
  let collisions = 0;
  const content = resolved.filter((r) => ['text', 'panel', 'viz'].includes(r.element.kind));
  for (let i = 0; i < content.length; i++) {
    for (let j = i + 1; j < content.length; j++) {
      const a = content[i];
      const b = content[j];
      if (isDescendant(byId, a.element.id, b.element.id) || isDescendant(byId, b.element.id, a.element.id)) continue;
      if (a.element.parent && a.element.parent === b.element.parent && byId.get(a.element.parent)?.layout) continue;
      const overlap = intersect(boxOf(a), boxOf(b));
      if (overlap <= 0) continue;
      const smaller = Math.min(area(boxOf(a)), area(boxOf(b)));
      const share = smaller > 0 ? overlap / smaller : 0;
      const bothText = isTextLike(a.element) && isTextLike(b.element);
      const declared = declaresLayering(a.element, b.element);
      if (bothText && share > 0.08 && !(declared && share < 0.35)) {
        collisions++;
        failures.push(`${a.element.id} and ${b.element.id} put text over text (${Math.round(share * 100)}% of the smaller one)`);
      } else if (!bothText && share > 0.3 && !declared) {
        collisions++;
        failures.push(`${a.element.id} collides with ${b.element.id} (${Math.round(share * 100)}%) without a declared overlap`);
      }
    }
  }

  /* imagery share */
  let imageryArea = 0;
  for (const r of roots) {
    if (r.element.kind === 'image') imageryArea += intersect(boxOf(r), canvas);
  }
  const imageryShare = canvasArea > 0 ? imageryArea / canvasArea : 0;
  if (imageryShare > 0.62) failures.push(`imagery covers ${Math.round(imageryShare * 100)}% of the page — a subject, not a backdrop, is the ceiling (62%)`);

  /* coverage and dead bands, on the resolved geometry */
  const coverage = (fromY: number, toY: number): number => {
    const cells = 20;
    let hit = 0;
    for (let gx = 0; gx < cells; gx++) {
      for (let gy = 0; gy < cells; gy++) {
        const px = (gx + 0.5) * (canvas.w / cells);
        const py = fromY + ((gy + 0.5) / cells) * (toY - fromY);
        if (roots.some((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)) hit++;
      }
    }
    return hit / (cells * cells);
  };
  const coverageWhole = coverage(0, canvas.h);
  const coverageViewport = coverage(0, Math.min(canvas.h, VIEWPORT_H));
  if (coverageViewport < 0.55) failures.push(`the first viewport is ${Math.round(coverageViewport * 100)}% covered — the opening screen reads as empty`);
  if (coverageWhole < 0.55) failures.push(`the page is ${Math.round(coverageWhole * 100)}% covered — dead space dominates`);

  const bandH = canvas.h * 0.12;
  for (let y = canvas.h * 0.05; y + bandH <= canvas.h * 0.92; y += canvas.h * 0.025) {
    const band: Box = { x: 0, y, w: canvas.w, h: bandH };
    const occupied = roots.some((r) => intersect(boxOf(r), band) > 0);
    if (!occupied) {
      failures.push(`an empty band runs from ${Math.round((y / canvas.h) * 100)}% to ${Math.round(((y + bandH) / canvas.h) * 100)}% of the page height`);
      break;
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    metrics: {
      coverageWhole: Number(coverageWhole.toFixed(3)),
      coverageViewport: Number(coverageViewport.toFixed(3)),
      imageryShare: Number(imageryShare.toFixed(3)),
      collisions,
      offCanvas,
    },
  };
}
