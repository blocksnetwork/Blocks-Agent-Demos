/**
 * Structural critique — the vision model checks whether the RENDERED
 * composition preserved the principles the spec claimed, then proposes
 * bounded revision ops.
 *
 * Three guards keep a 4B critic from doing damage:
 *  1. It sees the ANNOTATED preview (element outlines + ids), so its
 *     claims map to spec ids instead of vague regions.
 *  2. Every per-principle verdict is cross-checked against resolved
 *     geometry — a "lost the overlap" claim about an overlap the
 *     resolver measurably enforced is discarded before it can trigger
 *     a revision.
 *  3. It can only emit whitelisted ops (move/resize/setZ/setSurface/
 *     addRelation/strengthenRelation); the caller re-resolves,
 *     re-renders, re-SCORES, and keeps best-of — a revision can never
 *     ship unless it measurably improved the structural score.
 */

import type { DesignReferenceAnalysis } from './analysis.js';
import type { CompositionSpec, RevisionOp } from './composition.js';
import type { ResolvedLayout } from './resolve.js';
import { scoreStructure } from './score.js';
import { chat } from './qwen.js';

export type CritiqueVerdict = 'preserved' | 'weakened' | 'lost';

export type StructuralCritique = {
  perPrinciple: Array<{ principle: string; verdict: CritiqueVerdict; note: string }>;
  topIssues: string[];
  ops: RevisionOp[];
  /** claims the geometry cross-check threw out */
  discarded: string[];
};

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    per_principle: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          principle: { type: 'string' },
          verdict: { type: 'string', enum: ['preserved', 'weakened', 'lost'] },
          note: { type: 'string' },
        },
        required: ['principle', 'verdict'],
      },
    },
    top_issues: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    ops: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['move', 'resize', 'setZ', 'setSurface', 'addRelation', 'strengthenRelation'] },
          id: { type: 'string' },
          dx: { type: 'integer' }, dy: { type: 'integer' },
          w: { type: 'integer' }, h: { type: 'integer' },
          z: { type: 'integer' },
          surface: { type: 'string', enum: ['solid', 'glass', 'outline', 'none'] },
          index: { type: 'integer' },
          amount: { type: 'number' },
          relation: { type: 'object' },
        },
        required: ['op', 'id'],
      },
    },
  },
  required: ['per_principle', 'top_issues', 'ops'],
};

function specSummary(spec: CompositionSpec, layout: ResolvedLayout): string {
  return spec.elements
    .map((e) => {
      const r = layout.byId.get(e.id);
      const geo = r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}px` : 'unresolved';
      const relations = e.relations
        .map((rel) => `${rel.type}${'target' in rel ? `->${rel.target}` : ''}`)
        .join(' ');
      return `${e.id} (${e.kind}, ${e.role}) z${e.z} at ${geo}${relations ? ` [${relations}]` : ''}`;
    })
    .join('\n');
}

function sanitizeOps(raw: unknown): RevisionOp[] {
  if (!Array.isArray(raw)) return [];
  const ops: RevisionOp[] = [];
  for (const item of raw.slice(0, 8)) {
    const o = item as Record<string, unknown>;
    if (typeof o.id !== 'string') continue;
    const id = o.id;
    switch (o.op) {
      case 'move':
        ops.push({ op: 'move', id, dx: Number(o.dx) || 0, dy: Number(o.dy) || 0 });
        break;
      case 'resize':
        if (Number(o.w) > 0 && Number(o.h) > 0) ops.push({ op: 'resize', id, w: Number(o.w), h: Number(o.h) });
        break;
      case 'setZ':
        // a missing z must drop the op, not silently send the element
        // to the backmost plane
        if (typeof o.z === 'number' && Number.isFinite(o.z)) ops.push({ op: 'setZ', id, z: o.z });
        break;
      case 'setSurface':
        if (['solid', 'glass', 'outline', 'none'].includes(o.surface as string))
          ops.push({ op: 'setSurface', id, surface: o.surface as 'solid' });
        break;
      case 'addRelation':
        if (o.relation && typeof o.relation === 'object')
          ops.push({ op: 'addRelation', id, relation: o.relation as never });
        break;
      case 'strengthenRelation':
        if (typeof o.index === 'number' && Number.isFinite(o.index) && typeof o.amount === 'number' && Number.isFinite(o.amount))
          ops.push({ op: 'strengthenRelation', id, index: o.index, amount: o.amount });
        break;
    }
  }
  return ops;
}

/**
 * One vision call over the annotated preview. Returns null when the
 * model is unreachable — the caller simply ships the un-critiqued
 * winner (never blocks the task).
 */
export async function critiqueComposition(
  annotatedPng: Uint8Array,
  spec: CompositionSpec,
  layout: ResolvedLayout,
  analysis: DesignReferenceAnalysis,
): Promise<StructuralCritique | null> {
  const principles = spec.principles.length ? spec.principles : analysis.signaturePatterns.map((p) => p.principle);
  const dataUrl = `data:image/png;base64,${Buffer.from(annotatedPng).toString('base64')}`;

  const reply = await chat(
    [
      {
        role: 'system',
        content:
          'You are a design director reviewing whether an IMPLEMENTED page preserved the structural principles it was designed to embody. ' +
          'The screenshot has debug outlines: each element is labeled with its id and z plane.\n' +
          'Critique STRUCTURE ONLY — composition, dominance, depth, overlap, attachment, asymmetry, container breaks. ' +
          'Never comment on color shades, fonts, or copy. ' +
          'Good critique: "the primary image reads as a background, not a structural foreground object", "the three panels collapsed into an evenly spaced row, destroying the asymmetric hierarchy", "the overlap is too weak to separate depth planes". ' +
          'Bad critique: "the green could be darker".\n' +
          'For EVERY principle listed, give a verdict: preserved | weakened | lost, with a one-line note naming element ids. ' +
          'Then propose up to 6 surgical fixes as ops (move/resize in PIXELS, setZ 0-4, setSurface, addRelation, strengthenRelation). ' +
          'Reply ONLY JSON: {"per_principle":[{"principle","verdict","note"}],"top_issues":["<structural issues, worst first>"],"ops":[{"op","id",...}]}',
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          {
            type: 'text',
            text:
              `Principles this composition must embody:\n${principles.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n` +
              `Elements (id, kind, role, z, resolved geometry):\n${specSummary(spec, layout)}`,
          },
        ],
      },
    ],
    900,
    { guidedJson: CRITIQUE_SCHEMA },
  );
  if (!reply) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as Record<string, unknown>;
  } catch {
    console.error(`[design-blocks] critique reply was not JSON: ${reply.slice(0, 80)}`);
    return null;
  }

  const rawPerPrinciple = Array.isArray(parsed.per_principle)
    ? (parsed.per_principle as Array<Record<string, unknown>>)
        .filter((p) => typeof p.principle === 'string')
        .slice(0, 8)
        .map((p) => ({
          principle: p.principle as string,
          verdict: (['preserved', 'weakened', 'lost'].includes(p.verdict as string) ? p.verdict : 'weakened') as CritiqueVerdict,
          note: typeof p.note === 'string' ? p.note : '',
        }))
    : [];

  // Geometry cross-check: the deterministic scorer already knows which
  // principles verifiably survived into pixels. A "lost/weakened" claim
  // about one of those is a hallucination — discard it. The critic sees
  // spec.principles (the generator's paraphrases) while the scorer
  // verifies analysis principles, so matching is token-overlap fuzzy,
  // never exact-string.
  const measured = scoreStructure(spec, layout, analysis);
  const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));
  const similar = (a: string, b: string): boolean => {
    const ta = tokens(a);
    const tb = tokens(b);
    if (ta.size === 0 || tb.size === 0) return false;
    let shared = 0;
    for (const w of ta) if (tb.has(w)) shared++;
    return shared / Math.min(ta.size, tb.size) >= 0.5;
  };
  const survivedGeometrically = (principle: string): boolean =>
    measured.principlesSurviving.some((s) => similar(s, principle));
  const discarded: string[] = [];
  const perPrinciple = rawPerPrinciple.map((p) => {
    if (p.verdict !== 'preserved' && survivedGeometrically(p.principle)) {
      discarded.push(`critique claimed "${p.principle}" was ${p.verdict}, but resolved geometry shows it holds — discarded`);
      return { ...p, verdict: 'preserved' as CritiqueVerdict, note: `${p.note} [overruled by geometry]`.trim() };
    }
    return p;
  });

  return {
    perPrinciple,
    topIssues: Array.isArray(parsed.top_issues)
      ? (parsed.top_issues as unknown[]).filter((i): i is string => typeof i === 'string').slice(0, 5)
      : [],
    ops: sanitizeOps(parsed.ops),
    discarded,
  };
}
