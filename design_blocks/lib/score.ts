/**
 * Structural fidelity scoring — deterministic, model-free, and the
 * dominant term in winner selection.
 *
 * Why not CLIP-vs-anchor: CLIP ViT-B/32 similarity is dominated by
 * palette and subject gist, so it scores a green navbar-hero-cards page
 * as high as a real structural transfer, and scores CLONING the
 * reference's domain content highest of all. Exactly the two failure
 * modes this architecture exists to kill — so the anchor-similarity
 * term is gone. Structure is scored here against the direction's own
 * analysis from resolved pixel geometry; CLIP survives only as a
 * domain-fit term (preview vs the BRIEF text) computed by the caller.
 */

import type { DesignReferenceAnalysis } from './analysis.js';
import type { CompositionSpec } from './composition.js';
import { overlapFraction, type ResolvedLayout } from './resolve.js';

export type StructuralScore = {
  /** 0..1 blend of the parts */
  score: number;
  parts: {
    dominance: number;
    symmetry: number;
    depth: number;
    overlapRealization: number;
    containerBreaks: number;
    attachment: number;
  };
  /** principles that verifiably survived into resolved geometry */
  principlesSurviving: string[];
  /** principles the geometry cannot verify either way */
  principlesUnverifiable: string[];
};

function classifySymmetry(layout: ResolvedLayout, focalId?: string): 'symmetric' | 'asymmetric' | 'strongly-asymmetric' {
  // Area-weighted horizontal center of visual mass. Full-width bands are
  // excluded — a nav or footer is symmetric by nature and would wash out
  // the compositional signal.
  let weighted = 0;
  let total = 0;
  for (const e of layout.elements) {
    if (e.w > layout.canvas.width * 0.85) continue;
    const area = e.w * e.h;
    weighted += (e.x + e.w / 2) * area;
    total += area;
  }
  const massOffset = total === 0 ? 0 : Math.abs(weighted / total - layout.canvas.width / 2) / layout.canvas.width;
  const focal = focalId ? layout.byId.get(focalId) : undefined;
  const focalOffset = focal ? Math.abs(focal.x + focal.w / 2 - layout.canvas.width / 2) / layout.canvas.width : 0;
  const offset = Math.max(massOffset, focalOffset);
  return offset > 0.09 ? 'strongly-asymmetric' : offset > 0.04 ? 'asymmetric' : 'symmetric';
}

/** pairs of elements on different z planes with real pixel overlap */
function realOverlapPairs(layout: ResolvedLayout): number {
  let pairs = 0;
  const els = layout.elements;
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      if (els[i].element.z === els[j].element.z) continue;
      if (els[i].element.parent === els[j].element.id || els[j].element.parent === els[i].element.id) continue;
      const frac = Math.max(overlapFraction(els[i], els[j]), overlapFraction(els[j], els[i]));
      if (frac >= 0.1 && frac < 0.98) pairs++;
    }
  }
  return pairs;
}

export function scoreStructure(
  spec: CompositionSpec,
  layout: ResolvedLayout,
  analysis: DesignReferenceAnalysis,
): StructuralScore {
  // Dominance is judged against the SPEC canvas (the designed viewport),
  // not the grown full-page height — a tall page must not dilute its
  // focal mass.
  const canvasArea = spec.canvas.width * spec.canvas.height;

  // dominance: does the transfer have a mass as dominant as the reference's?
  const referenceDominant = analysis.composition.masses[0]
    ? Math.min(0.85, (analysis.composition.masses[0].bbox.w * analysis.composition.masses[0].bbox.h) / 10_000)
    : 0.3;
  const focal = layout.byId.get(spec.focalElementId);
  const focalFraction = focal ? (focal.w * focal.h) / canvasArea : 0;
  const dominance = 1 - Math.min(1, Math.abs(focalFraction - referenceDominant) / Math.max(referenceDominant, 0.15));

  // symmetry class match
  const observed = classifySymmetry(layout, spec.focalElementId);
  const wanted = analysis.composition.symmetry;
  const symmetry = observed === wanted ? 1 : observed !== 'symmetric' && wanted !== 'symmetric' ? 0.6 : 0;

  // depth: z utilization vs the reference's planes
  const zUsed = new Set(spec.elements.map((e) => e.z)).size;
  const depth = 1 - Math.min(1, Math.abs(zUsed - analysis.layering.planes) / 4);

  // overlaps: the reference's layering must survive as real pixels
  const wantedOverlaps = Math.max(analysis.layering.overlaps.length, analysis.layering.planes >= 3 ? 2 : 0);
  const overlapRealization = wantedOverlaps === 0 ? 1 : Math.min(1, realOverlapPairs(layout) / wantedOverlaps);

  // container breaks
  const wantsBreaks = analysis.layering.containerBreaks.length > 0;
  const hasBreaks =
    layout.adjustments.some((a) => a.includes('past its container')) ||
    spec.elements.some((e) => e.relations.some((r) => r.type === 'breaksContainer')) ||
    layout.elements.some((e) => e.x < -4 || e.x + e.w > layout.canvas.width + 4);
  const containerBreaks = wantsBreaks ? (hasBreaks ? 1 : 0) : 1;

  // spatial attachment of data
  const wantsAttachment = analysis.dataDisplay.some((d) => /(pin|attach|wrap|orbit|around|onto|spatial)/i.test(d.form + d.integration));
  const hasAttachment = layout.elements.some((e) => e.attachPoint || e.ring);
  const attachment = wantsAttachment ? (hasAttachment ? 1 : 0) : 1;

  const parts = { dominance, symmetry, depth, overlapRealization, containerBreaks, attachment };
  const score =
    0.2 * dominance + 0.2 * symmetry + 0.2 * depth + 0.2 * overlapRealization + 0.1 * containerBreaks + 0.1 * attachment;

  // principle survival: keyword-matched against verifiable geometry.
  const surviving: string[] = [];
  const unverifiable: string[] = [];
  for (const pattern of analysis.signaturePatterns) {
    const p = pattern.principle.toLowerCase();
    let verdict: boolean | null = null;
    if (/(overlap|layer|depth|plane|behind|front)/.test(p)) verdict = realOverlapPairs(layout) >= 1;
    else if (/(attach|pin|annotat|label.*(subject|object|point))/.test(p)) verdict = layout.elements.some((e) => e.attachPoint);
    else if (/(ring|circle|orbit|wrap|encircl|radial)/.test(p)) verdict = layout.elements.some((e) => e.ring);
    else if (/(break|escape|bleed|spill|outside)/.test(p)) verdict = hasBreaks;
    else if (/(asymmetr|off-cent|off cent|one side|imbalan)/.test(p)) verdict = observed !== 'symmetric';
    else if (/(oversiz|dominant|large|monumental|full-bleed|giant|massive)/.test(p)) verdict = focalFraction >= 0.15;
    else if (/(diagonal|rotat|tilt|angle)/.test(p)) verdict = spec.elements.some((e) => (e.rotation ?? 0) !== 0);
    if (verdict === true) surviving.push(pattern.principle);
    else if (verdict === null) unverifiable.push(pattern.principle);
  }

  return { score, parts, principlesSurviving: surviving, principlesUnverifiable: unverifiable };
}

/**
 * The live score blend, extracted from handler stage 6 so W2-4 can calibrate
 * against it. parts.craft is a nullable scalar whose composition from the
 * raw craft proxies is decided ONLY by the W2-4 calibration report — until
 * then it stays null and craftWeight stays 0, making the output bit-identical
 * to the legacy 0.55/0.2/0.15/0.1 formula (P4: proxies measure, they do not
 * yet judge).
 */
export interface ScoreParts {
  structure: number | null;
  domain: number | null;
  palette: number | null;
  prior: number;
  craft?: number | null;
}

export function blendScore(parts: ScoreParts, craftWeight: number): number {
  const legacy =
    0.55 * (parts.structure ?? 0.3) + // fallback tiles have no structural claim
    0.2 * (parts.domain ?? 0.5) +
    0.15 * (parts.palette ?? 0.8) +
    0.1 * parts.prior;
  const craft = parts.craft ?? null;
  if (craft === null) return legacy;
  return (1 - craftWeight) * legacy + craftWeight * craft;
}
