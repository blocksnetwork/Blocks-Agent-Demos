/**
 * The layout resolver: CompositionSpec in, absolute pixel geometry out.
 *
 * This is the only component in the composition path that is fully
 * deterministic, so every guarantee the model cannot give lives here:
 * a declared overlap ACTUALLY overlaps (clamped to what geometry can
 * achieve, and reported honestly when clamped), a container break
 * ACTUALLY breaks, an attached annotation sits within reach of its
 * anchor, text never lands unreadably on imagery, and nothing
 * degenerates to zero size or drifts off-canvas unintentionally.
 *
 * Movement discipline: every translation goes through moveBy(), which
 * carries an element's resolved descendants along — a panel that gets
 * pushed keeps its children. After all box-moving passes, a FINAL SYNC
 * recomputes attachment anchors and ring geometry from the targets'
 * final boxes, so leader lines and wraps can never point at where an
 * element USED to be. Every adjustment is logged; the log feeds
 * provenance and the critique geometry cross-check.
 */

import type { CompElement, CompositionSpec, Relation } from './composition.js';

export type ResolvedElement = {
  element: CompElement;
  /** absolute canvas px, pre-rotation box */
  x: number;
  y: number;
  w: number;
  h: number;
  /** stable paint order (back to front) */
  paintOrder: number;
  /** absolute px anchor on the attachedTo target, when one exists */
  attachPoint?: { x: number; y: number };
  /** ring geometry for encircles relations */
  ring?: { cx: number; cy: number; r: number; thickness: number };
  /** scrim forced by the legibility invariant */
  legibilityFix?: 'glass';
};

export type ResolvedLayout = {
  canvas: { width: number; height: number };
  /** sorted back-to-front */
  elements: ResolvedElement[];
  byId: Map<string, ResolvedElement>;
  /** every enforcement action, human-readable */
  adjustments: string[];
};

type Box = { x: number; y: number; w: number; h: number };

export function intersection(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** fraction of `a` covered by `b` */
export function overlapFraction(a: Box, b: Box): number {
  const area = a.w * a.h;
  return area > 0 ? intersection(a, b) / area : 0;
}

const MIN_SIZE: Record<CompElement['kind'], { w: number; h: number }> = {
  text: { w: 120, h: 28 },
  viz: { w: 70, h: 40 },
  panel: { w: 60, h: 40 },
  image: { w: 60, h: 60 },
  shape: { w: 8, h: 8 },
  group: { w: 80, h: 60 },
};

export function resolveLayout(spec: CompositionSpec): ResolvedLayout {
  const { width, height } = spec.canvas;
  const adjustments: string[] = [];
  const byId = new Map<string, ResolvedElement>();
  const elements: ResolvedElement[] = [];

  /* 1 — absolute frames, DFS from roots; grids flow their children. */
  const children = new Map<string, CompElement[]>();
  const roots: CompElement[] = [];
  for (const element of spec.elements) {
    if (element.parent) children.set(element.parent, [...(children.get(element.parent) ?? []), element]);
    else roots.push(element);
  }

  const place = (element: CompElement, parentBox: Box, gridCell?: Box): void => {
    const box: Box = gridCell ?? {
      x: parentBox.x + (element.frame.x / 100) * parentBox.w,
      y: parentBox.y + (element.frame.y / 100) * parentBox.h,
      w: (element.frame.w / 100) * parentBox.w,
      h: (element.frame.h / 100) * parentBox.h,
    };
    const resolved: ResolvedElement = { element, ...box, paintOrder: 0 };
    byId.set(element.id, resolved);
    elements.push(resolved);

    const kids = children.get(element.id) ?? [];
    if (element.layout?.type === 'grid' && kids.length > 0) {
      const cols = element.layout.cols;
      const rows = Math.ceil(kids.length / cols);
      // gap derives per axis so many rows in a short group can't push
      // cell height negative
      const gapX = Math.min(((element.layout.gap ?? 2) / 100) * box.w, cols > 1 ? box.w / (2 * (cols - 1)) : 0);
      const gapY = Math.min(((element.layout.gap ?? 2) / 100) * box.h, rows > 1 ? box.h / (2 * (rows - 1)) : 0);
      const cellW = (box.w - gapX * (cols - 1)) / cols;
      const cellH = (box.h - gapY * (rows - 1)) / rows;
      kids.forEach((kid, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        place(kid, box, {
          x: box.x + col * (cellW + gapX),
          y: box.y + row * (cellH + gapY),
          w: cellW,
          h: cellH,
        });
      });
    } else {
      for (const kid of kids) place(kid, box);
    }
  };
  const canvasBox: Box = { x: 0, y: 0, w: width, h: height };
  for (const root of roots) place(root, canvasBox);

  /* movement discipline: descendants travel with their ancestor. */
  const descendantsOf = (id: string): ResolvedElement[] => {
    const out: ResolvedElement[] = [];
    const walk = (parentId: string) => {
      for (const kid of children.get(parentId) ?? []) {
        const resolved = byId.get(kid.id);
        if (resolved) out.push(resolved);
        walk(kid.id);
      }
    };
    walk(id);
    return out;
  };
  const moveBy = (resolved: ResolvedElement, dx: number, dy: number): void => {
    if (dx === 0 && dy === 0) return;
    resolved.x += dx;
    resolved.y += dy;
    for (const descendant of descendantsOf(resolved.element.id)) {
      descendant.x += dx;
      descendant.y += dy;
    }
  };

  const parentBoxOf = (element: CompElement): Box =>
    element.parent && byId.has(element.parent) ? byId.get(element.parent)! : canvasBox;

  /* 2 — relation enforcement, fixed order, mover = relation holder. */
  const enforce = (type: Relation['type'], fn: (self: ResolvedElement, relation: Relation) => void): void => {
    for (const resolved of elements) {
      for (const relation of resolved.element.relations) {
        if (relation.type === type) fn(resolved, relation);
      }
    }
  };

  /** anchor px on the target for an attachedTo relation, from its CURRENT box */
  const anchorFor = (target: ResolvedElement, at: { x: number; y: number }) => ({
    x: target.x + (at.x / 100) * target.w,
    y: target.y + (at.y / 100) * target.h,
  });

  /** pull self within leader-line reach of the anchor; returns true if moved */
  const pullWithinReach = (self: ResolvedElement, anchor: { x: number; y: number }): boolean => {
    const cx = self.x + self.w / 2;
    const cy = self.y + self.h / 2;
    const reach = Math.hypot(width, height) * 0.22;
    const distance = Math.hypot(cx - anchor.x, cy - anchor.y);
    if (distance <= reach) return false;
    const t = 1 - reach / distance;
    moveBy(self, (anchor.x - cx) * t, (anchor.y - cy) * t);
    return true;
  };

  enforce('attachedTo', (self, relation) => {
    if (relation.type !== 'attachedTo') return;
    const target = byId.get(relation.target);
    if (!target) return;
    const anchor = anchorFor(target, relation.at);
    self.attachPoint = anchor; // provisional; FINAL SYNC recomputes
    if (pullWithinReach(self, anchor)) {
      adjustments.push(`${self.element.id}: pulled within reach of its anchor on ${relation.target}`);
    }
  });

  const syncRing = (self: ResolvedElement, relation: Extract<Relation, { type: 'encircles' }>): void => {
    const target = byId.get(relation.target);
    if (!target) return;
    const r = (Math.max(target.w, target.h) / 2) * relation.ratio;
    const cx = target.x + target.w / 2;
    const cy = target.y + target.h / 2;
    self.ring = { cx, cy, r, thickness: Math.max(8, r * 0.09) };
    // The element's own box becomes the ring's bounding square, so
    // downstream invariants and scoring see the true geometry.
    self.x = cx - r;
    self.y = cy - r;
    self.w = r * 2;
    self.h = r * 2;
  };

  enforce('encircles', (self, relation) => {
    if (relation.type !== 'encircles') return;
    syncRing(self, relation);
    if (self.ring) {
      adjustments.push(`${self.element.id}: locked concentric with ${relation.target} (r=${Math.round(self.ring.r)}px)`);
    }
  });

  enforce('overlaps', (self, relation) => {
    if (relation.type !== 'overlaps') return;
    const target = byId.get(relation.target);
    if (!target) return;

    // Clamp the demand to what geometry can achieve (a huge element can
    // never be 60%-covered by a small target) — and say so.
    const selfArea = self.w * self.h;
    const maxIntersection = Math.min(self.w, target.w) * Math.min(self.h, target.h);
    let amount = relation.amount;
    const ceiling = selfArea > 0 ? maxIntersection / selfArea : 0;
    if (amount > ceiling) {
      amount = Math.max(0.02, ceiling * 0.95);
      adjustments.push(
        `${self.element.id}: overlaps(${relation.target}) demand ${relation.amount.toFixed(2)} unachievable — clamped to ${amount.toFixed(2)}`,
      );
    }
    const before = overlapFraction(self, target);
    if (before >= amount) return;

    // Destination: hanging off the hinted side at exactly `amount`, or
    // center-aligned (maximum overlap). Perpendicular axis center-aligns
    // so disjoint ranges can't defeat the move.
    let destX = target.x + (target.w - self.w) / 2;
    let destY = target.y + (target.h - self.h) / 2;
    switch (relation.side) {
      case 'left':
        destX = target.x - self.w * (1 - amount);
        break;
      case 'right':
        destX = target.x + target.w - self.w * amount;
        break;
      case 'top':
        destY = target.y - self.h * (1 - amount);
        break;
      case 'bottom':
        destY = target.y + target.h - self.h * amount;
        break;
    }

    // Overlap grows monotonically along the straight line to the
    // destination — binary-search the smallest sufficient move.
    const startX = self.x;
    const startY = self.y;
    const overlapAt = (t: number): number =>
      overlapFraction({ x: startX + (destX - startX) * t, y: startY + (destY - startY) * t, w: self.w, h: self.h }, target);
    let t = 1;
    if (overlapAt(1) >= amount) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (overlapAt(mid) >= amount) hi = mid;
        else lo = mid;
      }
      t = hi;
    }
    moveBy(self, (destX - startX) * t, (destY - startY) * t);
    adjustments.push(
      `${self.element.id}: moved to honor overlaps(${relation.target}, ${amount.toFixed(2)}) — was ${before.toFixed(2)}, now ${overlapFraction(self, target).toFixed(2)}`,
    );
  });

  enforce('offsetFrom', (self, relation) => {
    if (relation.type !== 'offsetFrom') return;
    const target = byId.get(relation.target);
    if (!target) return;
    const offset = relation.amount * (relation.edge === 'left' || relation.edge === 'right' ? width : height);
    const edgeOf = (box: Box) =>
      relation.edge === 'left' ? box.x
      : relation.edge === 'right' ? box.x + box.w
      : relation.edge === 'top' ? box.y
      : box.y + box.h;
    const gap = edgeOf(self) - edgeOf(target);
    if (Math.abs(Math.abs(gap) - offset) < 2) return;
    const delta = (gap >= 0 ? offset : -offset) - gap;
    if (relation.edge === 'left' || relation.edge === 'right') moveBy(self, delta, 0);
    else moveBy(self, 0, delta);
    adjustments.push(`${self.element.id}: deliberate ${relation.edge}-misalignment of ${Math.round(offset)}px vs ${relation.target} enforced`);
  });

  enforce('breaksContainer', (self, relation) => {
    if (relation.type !== 'breaksContainer') return;
    const parent = parentBoxOf(self.element);
    const needed = relation.amount * (relation.side === 'left' || relation.side === 'right' ? self.w : self.h);
    const outside =
      relation.side === 'left' ? parent.x - self.x
      : relation.side === 'right' ? self.x + self.w - (parent.x + parent.w)
      : relation.side === 'top' ? parent.y - self.y
      : self.y + self.h - (parent.y + parent.h);
    if (outside >= needed) return;
    // Signed distance: an element starting well inside its container
    // must travel the inside distance PLUS the declared break.
    const delta = needed - outside;
    if (relation.side === 'left') moveBy(self, -delta, 0);
    if (relation.side === 'right') moveBy(self, delta, 0);
    if (relation.side === 'top') moveBy(self, 0, -delta);
    if (relation.side === 'bottom') moveBy(self, 0, delta);
    adjustments.push(`${self.element.id}: pushed ${Math.round(relation.amount * 100)}% past its container's ${relation.side} edge`);
  });

  /* 3 — invariants. */
  const breaksIntent = (resolved: ResolvedElement): boolean =>
    resolved.element.relations.some((r) => r.type === 'breaksContainer') ||
    resolved.element.frame.x < 0 ||
    resolved.element.frame.y < 0 ||
    resolved.element.frame.x + resolved.element.frame.w > 100 ||
    resolved.element.frame.y + resolved.element.frame.h > 100;

  const pullOnCanvas = (resolved: ResolvedElement): boolean => {
    const visible = overlapFraction(resolved, canvasBox);
    const minVisible = breaksIntent(resolved) ? 0.3 : 0.85;
    if (visible >= minVisible) return false;
    const clampedX = Math.min(Math.max(resolved.x, -resolved.w * 0.5), width - resolved.w * 0.5);
    const clampedY = Math.min(Math.max(resolved.y, -resolved.h * 0.5), height - resolved.h * 0.5);
    moveBy(resolved, clampedX - resolved.x, clampedY - resolved.y);
    let guard = 0;
    while (overlapFraction(resolved, canvasBox) < minVisible && guard++ < 40) {
      moveBy(
        resolved,
        (width / 2 - (resolved.x + resolved.w / 2)) * 0.1,
        (height / 2 - (resolved.y + resolved.h / 2)) * 0.1,
      );
    }
    adjustments.push(`${resolved.element.id}: pulled back on-canvas (${Math.round(visible * 100)}% was visible)`);
    return true;
  };

  for (const resolved of elements) {
    // minimum sizes — skipped for rotated elements (a vertical text rail
    // is deliberately narrow; its box is pre-rotation)
    const min = MIN_SIZE[resolved.element.kind];
    if (!resolved.element.rotation && (resolved.w < min.w || resolved.h < min.h)) {
      resolved.w = Math.max(resolved.w, min.w);
      resolved.h = Math.max(resolved.h, min.h);
      adjustments.push(`${resolved.element.id}: grown to minimum ${resolved.element.kind} size`);
    }
    pullOnCanvas(resolved);
  }

  // legibility: text sitting on imagery below it gets a scrim, no model
  // consulted. Monumental fill-type is exempt — display type overlapping
  // imagery is a deliberate move (and big enough to stay readable).
  for (const resolved of elements) {
    if (resolved.element.kind !== 'text') continue;
    if (resolved.element.content?.fit === 'fill') continue;
    if (resolved.element.style?.surface && resolved.element.style.surface !== 'none') continue;
    for (const other of elements) {
      if (other === resolved || !other.element.imagery) continue;
      if (other.element.z <= resolved.element.z && overlapFraction(resolved, other) > 0.3) {
        resolved.legibilityFix = 'glass';
        adjustments.push(`${resolved.element.id}: glass scrim forced (sits on ${other.element.id})`);
        break;
      }
    }
  }

  // near-duplicate sibling frames: jitter the later one so "three
  // identical cards" can never render pixel-identical by accident.
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];
      if (a.element.parent !== b.element.parent) continue;
      if (a.element.parent && byId.get(a.element.parent)?.element.layout?.type === 'grid') continue;
      if (Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4 && Math.abs(a.w - b.w) < 4 && Math.abs(a.h - b.h) < 4) {
        moveBy(b, 16, 16);
        adjustments.push(`${b.element.id}: jittered off near-duplicate frame of ${a.element.id}`);
      }
    }
  }

  /* 4 — FINAL SYNC: anchors and rings recompute from their targets'
     final boxes, so nothing points at where an element used to be. */
  for (const resolved of elements) {
    for (const relation of resolved.element.relations) {
      if (relation.type === 'attachedTo') {
        const target = byId.get(relation.target);
        if (!target) continue;
        const anchor = anchorFor(target, relation.at);
        const stale =
          !resolved.attachPoint ||
          Math.hypot(anchor.x - resolved.attachPoint.x, anchor.y - resolved.attachPoint.y) > 2;
        resolved.attachPoint = anchor;
        if (stale && pullWithinReach(resolved, anchor)) {
          adjustments.push(`${resolved.element.id}: re-anchored to ${relation.target}'s final position`);
          pullOnCanvas(resolved);
        }
      }
      if (relation.type === 'encircles') {
        const hadRing = resolved.ring;
        syncRing(resolved, relation);
        if (hadRing && resolved.ring && (Math.abs(hadRing.cx - resolved.ring.cx) > 2 || Math.abs(hadRing.r - resolved.ring.r) > 2)) {
          adjustments.push(`${resolved.element.id}: ring re-synced to ${relation.target}'s final geometry`);
        }
      }
    }
  }

  /* 5 — paint order: z plane first, then containment depth, then
     attachment holders above their targets, stable on input order. */
  const depthOf = (element: CompElement): number => {
    let depth = 0;
    let current = element.parent;
    while (current && byId.has(current) && depth < 4) {
      depth++;
      current = byId.get(current)!.element.parent;
    }
    return depth;
  };
  elements.forEach((resolved, index) => {
    resolved.paintOrder = resolved.element.z * 10_000 + depthOf(resolved.element) * 500 + index;
  });
  for (const resolved of elements) {
    for (const relation of resolved.element.relations) {
      if (relation.type === 'attachedTo') {
        const target = byId.get(relation.target);
        if (target && resolved.paintOrder <= target.paintOrder) {
          resolved.paintOrder = target.paintOrder + 1;
        }
      }
    }
  }
  elements.sort((a, b) => a.paintOrder - b.paintOrder);

  /* 6 — the canvas grows to fit real content (never shrinks). */
  const bottom = Math.max(...elements.map((e) => e.y + e.h), height);
  const finalHeight = Math.min(4200, Math.round(bottom === height ? height : bottom + 40));

  return { canvas: { width, height: finalHeight }, elements, byId, adjustments };
}
