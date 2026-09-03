import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { StartTaskMessage, TaskContext, HandlerResult } from '@blocks-network/sdk';

import { loadBank, search, type BankEntry } from './lib/bank.js';
import { cutoutSubject, embedImage, embedText, extractPalette, makeSheet } from './lib/sidecar.js';
import { draftDirections, type DirectionSpec } from './lib/directions.js';
import { buildBlueprint, fallbackCopy, writeCopy, type FloatingElement } from './lib/pagespec.js';
import { buildMotionCss, buildMotionJs } from './lib/motion.js';
import { renderStickers } from './lib/stickers.js';
import { generateHero } from './lib/imagine.js';
import { proceduralHeroPng, renderContactSheet, renderOgImage, renderTile } from './lib/comps.js';
import { pickHeroReference, referenceHeroPng, type HeroSource } from './lib/hero.js';
import { curateReferences, pageGuidance, type Curation } from './lib/curate.js';
import { assessQuality, type QualityReport } from './lib/quality.js';
import { buildThemeCss } from './lib/tokens.js';
import { gatherAssets } from './lib/assets.js';
import { parseColor } from './lib/color.js';
import {
  analysisUsable,
  getAnalysis,
  loadCachedAnalysis,
  structuralRichness,
  type DesignReferenceAnalysis,
} from './lib/analysis.js';
import { deriveIntent } from './lib/intent.js';
import {
  applyRevisionOps,
  generateComposition,
  type CompositionSpec,
  type GeneratedComposition,
  type Stance,
} from './lib/composition.js';
import { resolveLayout, type ResolvedLayout } from './lib/resolve.js';
import { renderScene, vizSvgForElement, type SceneAssets } from './lib/scene.js';
import { blendScore, scoreStructure, type StructuralScore } from './lib/score.js';
import { computeCraftProxies, type CraftProxies } from './lib/craft.js';
import { critiqueComposition } from './lib/critique.js';
import { specBlueprint, emitCompositionHtml } from './lib/blueprint.js';

/**
 * Design Blocks v3: brief in, three rendered COMPOSITIONS out.
 *
 * The primary path is reference transfer:
 *   retrieve -> decompose the reference (vision) -> transferable
 *   principles -> CompositionSpec (LLM, validated against the analysis)
 *   -> deterministic layout resolution -> full-page comp render ->
 *   structural scoring -> vision critique -> bounded revision.
 *
 * The old template grammar (pagespec genome) survives ONLY as the
 * labeled fallback for when vision/LLM are unreachable or a spec falls
 * below the usability floor — it can no longer silently own the page.
 * kit.provenance records which path produced every direction, which
 * reference and signature patterns drove it, what the sanitizers had to
 * repair, and which principles verifiably survived into the render.
 */

const BANK_DIR = process.env.BANK_DIR ?? './bank';
// Hosted authoring runs three sequential transfers plus a critique round;
// 380s shed the third direction every run, 450s fits all of them.
const TASK_BUDGET_MS = Number(process.env.DESIGN_TASK_BUDGET_MS ?? 450_000);
const CRITIQUE_ROUNDS = Math.max(0, Math.min(2, Number(process.env.DESIGN_CRITIQUE_ROUNDS ?? 1)));
// P4 gate: craft proxies MEASURE from day one, but cannot judge until the
// W2-4 calibration report recommends a weight — default 0, hard-clamped.
const CRAFT_WEIGHT = Math.max(0, Math.min(0.2, Number(process.env.DESIGN_CRAFT_WEIGHT ?? 0)));
// Diffusion imagery is opt-in: the reference-photo hero needs no GPU.
const IMAGINE_ENABLED = process.env.DESIGN_IMAGINE === '1';

type Brief = { goal: string; vibe: string; framework: string; count: number };

type DirectionOutcome = {
  spec: DirectionSpec;
  stance: Stance;
  anchor?: BankEntry;
  analysis: DesignReferenceAnalysis | null;
  composition: GeneratedComposition | null;
  layout: ResolvedLayout | null;
  quality: QualityReport | null;
  preview: { png: Uint8Array; svg: string } | null;
  structural: StructuralScore | null;
  craftProxies: CraftProxies | null;
  heroPng: Uint8Array | null;
  heroSource: HeroSource;
  heroRef?: BankEntry;
  score: number;
  parts: { structure: number | null; domain: number | null; palette: number | null; prior: number; craft: number | null };
  compositionSource: 'reference-transfer' | 'template-fallback';
  sheds: string[];
};

function describe(err: unknown): string {
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  const cause = e?.cause ? ` cause=${e.cause.code ?? ''} ${e.cause.message ?? ''}`.trim() : '';
  return `${e?.message ?? String(err)}${cause ? ` (${cause})` : ''}`;
}

function extractBytes(downloaded: unknown): Uint8Array | null {
  if (!downloaded) return null;
  if (downloaded instanceof Uint8Array) return downloaded;
  const data = (downloaded as { data?: unknown }).data;
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return Buffer.from(data, 'base64');
  return null;
}

async function readBrief(task: StartTaskMessage, ctx?: TaskContext): Promise<string> {
  const part = (task.requestParts ?? [])[0] as { text?: string } | undefined;
  if (!part) return '';
  if (typeof part.text === 'string') return part.text;
  try {
    const bytes = extractBytes(await ctx?.downloadInputArtifact(part as never));
    return bytes?.length ? new TextDecoder().decode(bytes) : '';
  } catch (err) {
    console.error('[design-blocks] brief download failed:', describe(err));
    return '';
  }
}

function parseBrief(raw: string): Brief {
  const fallback: Brief = { goal: '', vibe: '', framework: '', count: 4 };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<Brief>;
    return {
      goal: typeof parsed.goal === 'string' ? parsed.goal : '',
      vibe: typeof parsed.vibe === 'string' ? parsed.vibe : '',
      framework: typeof parsed.framework === 'string' ? parsed.framework : '',
      count: Math.min(8, Math.max(2, typeof parsed.count === 'number' ? Math.round(parsed.count) : 4)),
    };
  } catch {
    return { ...fallback, goal: raw.slice(0, 300) };
  }
}

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

/** 0..1: how close the preview's actual colors sit to the direction's hexes. */
function paletteFidelity(heroPalette: string[] | null, target: string[]): number | null {
  if (!heroPalette?.length) return null;
  const targets = target.map(parseColor).filter((c) => c !== null);
  if (targets.length === 0) return null;
  let total = 0;
  let counted = 0;
  for (const hex of heroPalette) {
    const color = parseColor(hex);
    if (!color) continue;
    const nearest = Math.min(
      ...targets.map((t) => Math.hypot(color.r - t!.r, color.g - t!.g, color.b - t!.b)),
    );
    total += nearest;
    counted++;
  }
  return counted ? Math.max(0, 1 - total / counted / 442) : null;
}

const AXIS_PRIOR: Record<Stance, number> = { faithful: 1, bolder: 0.5, unexpected: 0 };

function publicRef(ref: BankEntry): Omit<BankEntry, 'embedding' | 'file' | 'thumb'> {
  const { embedding: _e, file: _f, thumb: _t, ...rest } = ref;
  return rest;
}

async function loadThumbs(dir: string, refs: BankEntry[]): Promise<Uint8Array[]> {
  const thumbs: Uint8Array[] = [];
  for (const ref of refs) {
    try {
      thumbs.push(new Uint8Array(await readFile(join(dir, ref.thumb))));
    } catch {
      /* thumb missing — the board just gets shorter */
    }
  }
  return thumbs;
}

/**
 * Anchor selection for transfer. The faithful anchor stays the best
 * brief match; the bolder anchor is the structurally RICHEST candidate
 * (planes, overlaps, breaks — the references worth transferring from,
 * however far their subject matter sits from the brief); the unexpected
 * anchor is the embedding-farthest from the faithful pick. UI-kind
 * references are preferred throughout — photography remains an asset
 * source, not the composition teacher.
 */
async function pickTransferAnchors(
  candidates: BankEntry[],
  bankDir: string,
): Promise<Array<BankEntry | undefined>> {
  if (candidates.length === 0) return [undefined, undefined, undefined];
  const ordered = [
    ...candidates.filter((c) => c.kind === 'ui'),
    ...candidates.filter((c) => c.kind !== 'ui'),
  ];
  const faithful = ordered[0];
  const rest = ordered.filter((c) => c !== faithful);

  const richness = new Map<string, number>();
  for (const candidate of rest) {
    const cached = await loadCachedAnalysis(bankDir, candidate);
    richness.set(candidate.id, cached ? structuralRichness(cached) : 0);
  }
  const bolder = [...rest].sort((a, b) => (richness.get(b.id) ?? 0) - (richness.get(a.id) ?? 0))[0];
  const afterBolder = rest.filter((c) => c !== bolder);
  const unexpected =
    faithful.embedding.length > 0
      ? [...afterBolder].sort(
          (a, b) => cosine(a.embedding, faithful.embedding) - cosine(b.embedding, faithful.embedding),
        )[0]
      : afterBolder[0];

  return [faithful, bolder ?? rest[0], unexpected ?? bolder ?? rest[0]];
}

/** Small floating elements from the spec become sticker assets. */
function floatingFromSpec(spec: CompositionSpec | null, fallbackFloating: FloatingElement[]): FloatingElement[] {
  if (!spec) return fallbackFloating;
  const floats: FloatingElement[] = [];
  for (const element of spec.elements) {
    if (floats.length >= 4) break;
    const area = (element.frame.w * element.frame.h) / 10_000;
    if (element.parent || area > 0.06 || element.z < 2) continue;
    const label = element.content?.label ?? element.content?.heading;
    if (!label) continue;
    floats.push(
      element.content?.value
        ? { kind: 'stat', text: label.slice(0, 24), value: element.content.value.slice(0, 12) }
        : { kind: label.length < 12 ? 'tag' : 'mini', text: label.slice(0, 24) },
    );
  }
  return floats.length >= 2 ? floats : fallbackFloating;
}

/** Map CLIP text-image cosine (~0..0.35 in practice) onto 0..1. */
function domainFit(cos: number | null): number | null {
  return cos === null ? null : Math.max(0, Math.min(1, cos / 0.32));
}

export default async function handler(
  task: StartTaskMessage,
  ctx?: TaskContext,
): Promise<HandlerResult> {
  const startedAt = Date.now();
  const remaining = () => TASK_BUDGET_MS - (Date.now() - startedAt);
  const sheds: string[] = [];
  // Every stage goes to the task stream AND the service log, so "what is
  // it doing right now" has an answer on the box, not just in the client.
  const status = (message: string) => {
    console.error(`[design-blocks] ${Math.round((Date.now() - startedAt) / 1000)}s ${message}`);
    ctx?.reportStatus(message);
  };

  status('Reading the brief...');
  const brief = parseBrief(await readBrief(task, ctx));
  const briefText = [brief.goal, brief.vibe, brief.framework].filter(Boolean).join(' — ');
  const fallbackHeadline = (brief.goal || briefText || 'Your next thing').split(/[.!?]/)[0].slice(0, 60);

  /* 1 — retrieve. */
  const bank = await loadBank(BANK_DIR);
  status(
    bank.entries.length
      ? `Searching ${bank.entries.length} references...`
      : 'Bank is empty — designing from the brief alone...',
  );
  const query = bank.entries.length ? await embedText(briefText || 'clean modern web app') : null;
  const topRefs = search(bank, query, briefText, 12).map((hit) => hit.entry);
  // Composition anchors come from PAGE DESIGNS. Photography is imagery
  // and a palette source, never a composition teacher — a brief about
  // plants must not have its layout "transferred" from a moss macro just
  // because CLIP ranked the moss first.
  const uiBank = { ...bank, entries: bank.entries.filter((e) => e.kind === 'ui') };
  const uiRefs = uiBank.entries.length ? search(uiBank, query, briefText, 14).map((hit) => hit.entry) : [];
  const photoBank = { ...bank, entries: bank.entries.filter((e) => e.kind !== 'ui') };
  const photoRefs = photoBank.entries.length ? search(photoBank, query, briefText, 20).map((hit) => hit.entry) : [];
  // An art-director pass over the candidates: a vision model reads the
  // brief and LOOKS at the page designs and photographs, then names the
  // page type, the three anchors and the hero photograph. CLIP ranking
  // alone put a monospace blog under an app brief and a grey texture
  // under a plant product.
  status('Curating references — reviewing the page designs and photographs against the brief...');
  const heuristicAnchors = await pickTransferAnchors(uiRefs.length ? uiRefs : topRefs, BANK_DIR);
  const curation: Curation | null = await curateReferences(briefText, uiRefs, photoRefs, BANK_DIR);
  const anchors = curation ? curation.anchors.map((a, i) => a ?? heuristicAnchors[i]) : heuristicAnchors;
  if (curation) {
    status(
      `Page type: ${curation.pageType}. Anchors ${anchors.map((a) => a?.id ?? '—').join(', ')}; hero ${curation.hero?.id ?? 'none'} — ${curation.reasons.faithful ?? ''}`,
    );
  } else {
    sheds.push('reference curation unavailable — anchors chosen by CLIP ranking');
  }

  /* 2 — product intent and style directions, concurrently. */
  status('Understanding the product and sketching three directions...');
  const [intent, specs] = await Promise.all([
    deriveIntent(briefText || 'modern product page'),
    draftDirections(
      briefText || 'modern product page',
      anchors.filter((a): a is BankEntry => a !== undefined),
    ),
  ]);

  /* 3 — decompose the anchor references (cached at ingest; lazy here). */
  const stances: Stance[] = ['faithful', 'bolder', 'unexpected'];
  const analyses = await Promise.all(
    anchors.map(async (anchor) => {
      if (!anchor) return null;
      if (remaining() < 90_000) {
        const cached = await loadCachedAnalysis(BANK_DIR, anchor);
        if (!cached) sheds.push(`skipped uncached analysis of ${anchor.id} (deadline)`);
        return cached;
      }
      return getAnalysis(BANK_DIR, anchor);
    }),
  );
  const usableCount = analyses.filter((a) => analysisUsable(a)).length;
  if (usableCount > 0) {
    const patternTotal = analyses.reduce((n, a) => n + (a?.signaturePatterns.length ?? 0), 0);
    status(
      `Analyzed ${usableCount} reference composition${usableCount > 1 ? 's' : ''} — ${patternTotal} distinctive design patterns extracted.`,
    );
  } else {
    status('No reference decomposition available — building from the template fallback...');
  }

  /* 4 — composition transfer, SEQUENTIAL by design: a shared T4 divides
     its throughput across concurrent generations (3-way = timeouts for
     everyone, including the other agents on this vLLM). Faithful always
     gets its shot; later stances need budget left. */
  const generateFor = async (index: number): Promise<GeneratedComposition | null> => {
    const analysis = analyses[index];
    if (!analysisUsable(analysis)) return null;
    if (index > 0 && remaining() < 150_000) {
      sheds.push(`direction ${stances[index]} fell back to template (deadline)`);
      return null;
    }
    status(`Transferring reference structure (${stances[index]})...`);
    return generateComposition(intent, analysis, stances[index], {
      headline: fallbackHeadline,
      pageType: curation?.pageType,
      pageGuidance: curation ? pageGuidance(curation.pageType) : undefined,
    });
  };
  const compositions: Array<GeneratedComposition | null> = [];
  for (let i = 0; i < stances.length; i++) compositions.push(await generateFor(i));

  /* 5 — resolve layouts, generate one preview image per direction, render. */
  const outcomes: DirectionOutcome[] = [];
  for (let i = 0; i < specs.length; i++) {
    let composition = compositions[i] ?? null;
    let layout = composition ? resolveLayout(composition.spec) : null;
    // Absolute quality gate: a transferred composition that fails the
    // plain reviewer rules (legible headline, nothing off-canvas, no text
    // on text, imagery as subject, no dead bands) is demoted to the
    // template path rather than shipped as a design.
    let quality: QualityReport | null = null;
    if (composition && layout) {
      quality = assessQuality(composition.spec, layout);
      if (!quality.ok) {
        console.error(`[design-blocks] quality gate rejected ${stances[i]}: ${quality.failures.join(' | ')}`);
        sheds.push(`direction ${stances[i]}: composition failed the quality gate (${quality.failures.slice(0, 3).join('; ')}) — template fallback`);
        composition = null;
        layout = null;
      }
    }
    outcomes.push({
      spec: specs[i],
      stance: stances[i],
      anchor: anchors[i],
      analysis: analyses[i],
      composition,
      layout,
      quality,
      preview: null,
      structural: null,
      craftProxies: null,
      heroPng: null,
      heroSource: 'procedural',
      heroRef: undefined,
      score: 0,
      parts: { structure: null, domain: null, palette: null, prior: AXIS_PRIOR[stances[i]], craft: null },
      compositionSource: composition ? 'reference-transfer' : 'template-fallback',
      sheds: [],
    });
  }

  // Imagery, one per direction. Retrieval-first: the bank photograph CLIP
  // matched to the brief, gradient-mapped onto the direction's palette by
  // resvg — no GPU, ~100ms, and a real photograph. The diffusion sidecar
  // is consulted only when DESIGN_IMAGINE=1 (a shared T4 never had the
  // VRAM for it, and its output lost to the photos anyway).
  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    status(`Art-directing imagery ${i + 1}/${outcomes.length} — ${outcome.spec.name}...`);
    if (IMAGINE_ENABLED && remaining() > 100_000) {
      const imageryElements = outcome.composition?.spec.elements.filter((e) => e.imagery) ?? [];
      const primary = imageryElements.sort((a, b) => b.frame.w * b.frame.h - a.frame.w * a.frame.h)[0];
      const prompt = primary?.imagery?.subject ?? intent.subjectImagePrompt ?? outcome.spec.heroPrompt;
      const generated = await generateHero(
        `${prompt}${primary?.imagery?.integration === 'cutout' ? ', isolated on a plain solid light background, studio shot' : ''}, no text, no letters, no watermark`,
        outcome.spec.palette,
      );
      if (generated) {
        outcome.heroPng = generated;
        outcome.heroSource = 'generated';
        continue;
      }
    }
    // The curator saw every photograph next to the brief; its pick (or its
    // "none") outranks the CLIP nearest-neighbour, which is how a grey
    // texture ended up as the hero of a plant product.
    const ref = curation ? (curation.hero ?? undefined) : pickHeroReference(topRefs, i);
    if (!ref) {
      if (curation) outcome.sheds.push('no bank photograph shows the product subject — procedural hero');
      continue;
    }
    const photo = await referenceHeroPng(BANK_DIR, ref, outcome.spec.palette);
    if (photo) {
      outcome.heroPng = photo;
      outcome.heroSource = 'reference-photo';
      outcome.heroRef = ref;
    } else {
      outcome.sheds.push(`reference photo ${ref.id} unusable — procedural hero`);
    }
  }

  status('Rendering compositions...');
  const tileJobs = outcomes.map(async (outcome) => {
    if (outcome.composition && outcome.layout) {
      const assets: SceneAssets = new Map();
      const imageryElements = outcome.composition.spec.elements.filter((e) => e.imagery);
      const primary = imageryElements.sort((a, b) => b.frame.w * b.frame.h - a.frame.w * a.frame.h)[0];
      if (primary && outcome.heroPng) {
        assets.set(primary.id, {
          uri: `data:image/png;base64,${Buffer.from(outcome.heroPng).toString('base64')}`,
          cutout: false,
        });
      }
      outcome.preview = await renderScene(
        outcome.composition.spec,
        outcome.layout,
        outcome.spec.tokens,
        outcome.spec.palette,
        assets,
      );
      if (outcome.preview) {
        outcome.structural = scoreStructure(outcome.composition.spec, outcome.layout, outcome.analysis!);
        return;
      }
      // renderer failure: demote to template path FULLY — a spec whose
      // geometry never rendered must not leak into blueprint/spec/html
      // artifacts while the comps show a style tile
      outcome.compositionSource = 'template-fallback';
      outcome.composition = null;
      outcome.layout = null;
      outcome.sheds.push('scene render failed — style tile fallback');
    }
    // Template fallback: the old style tile, from the genome grammar.
    if (!outcome.heroPng) outcome.heroSource = 'procedural';
    const hero = outcome.heroPng ?? (await proceduralHeroPng(outcome.spec));
    outcome.heroPng = hero;
    const stickers = await renderStickers(
      outcome.spec,
      fallbackCopy(briefText, outcome.spec.genome).floating.slice(0, 2),
    );
    outcome.preview = await renderTile(outcome.spec, hero, fallbackHeadline, stickers);
  });
  await Promise.all(tileJobs);

  /* 6 — deterministic scoring: structure leads, CLIP measures fit to the
     BRIEF (not the anchor — cloning the reference must not win). */
  status('Scoring structural fidelity against each reference decomposition...');
  const briefEmbedding = query ?? (await embedText(briefText || 'clean modern web app'));
  await Promise.all(
    outcomes.map(async (outcome) => {
      if (!outcome.preview) return;
      const [previewEmbedding, previewPalette] = await Promise.all([
        briefEmbedding ? embedImage(outcome.preview.png) : Promise.resolve(null),
        extractPalette(outcome.preview.png),
      ]);
      outcome.parts.structure = outcome.structural?.score ?? null;
      outcome.parts.domain =
        previewEmbedding && briefEmbedding ? domainFit(cosine(previewEmbedding, briefEmbedding)) : null;
      outcome.parts.palette = paletteFidelity(previewPalette, outcome.spec.palette);
      try {
        outcome.craftProxies = computeCraftProxies(outcome.preview.png, outcome.spec.palette);
      } catch (err) {
        // never-fail posture (same as assets): a decode error costs the
        // measurement, not the task
        outcome.craftProxies = null;
        outcome.sheds.push(`craft proxies failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      // parts.craft stays null until W2-4 recommends a composition of the raw
      // proxies, so CRAFT_WEIGHT is inert and the blend is bit-identical to
      // the legacy formula.
      outcome.score = blendScore(outcome.parts, CRAFT_WEIGHT);
    }),
  );

  const ranked = [...outcomes].sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  status(`Winner: ${winner.spec.name} (${winner.stance}, ${winner.compositionSource}) — refining...`);

  /* 7 — cutouts for the winner, then the bounded critique loop. */
  const critiqueLog: Array<{ round: number; issues: string[]; discarded: string[]; applied: number; kept: boolean }> = [];
  let winnerCutoutPng: Uint8Array | null = null;
  if (winner.composition && winner.layout && winner.analysis) {
    // cutout pass: winner's cutout-treatment elements get real alpha
    const cutoutElements = winner.composition.spec.elements.filter((e) => e.imagery?.integration === 'cutout');
    const winnerAssets: SceneAssets = new Map();
    const imageryElements = winner.composition.spec.elements.filter((e) => e.imagery);
    const primary = imageryElements.sort((a, b) => b.frame.w * b.frame.h - a.frame.w * a.frame.h)[0];
    if (primary && winner.heroPng) {
      let uri = `data:image/png;base64,${Buffer.from(winner.heroPng).toString('base64')}`;
      let cutout = false;
      if (cutoutElements.includes(primary) && remaining() > 60_000) {
        const cut = await cutoutSubject(winner.heroPng);
        if (cut) {
          uri = `data:image/png;base64,${Buffer.from(cut).toString('base64')}`;
          cutout = true;
          // composition.html points hero.png at this element expecting
          // alpha — ship the cutout bytes as the hero artifact
          winnerCutoutPng = cut;
        } else {
          winner.sheds.push(`${primary.id}: cutout failed — downgraded to contained imagery`);
          primary.imagery!.integration = 'contained';
        }
      }
      winnerAssets.set(primary.id, { uri, cutout });
    }
    const rerender = () =>
      renderScene(winner.composition!.spec, winner.layout!, winner.spec.tokens, winner.spec.palette, winnerAssets);
    winner.preview = (await rerender()) ?? winner.preview;

    for (let round = 1; round <= CRITIQUE_ROUNDS; round++) {
      if (remaining() < 70_000) {
        sheds.push(`critique round ${round} skipped (deadline)`);
        break;
      }
      status(`Critiquing composition (round ${round}) — checking depth, overlap, and hierarchy...`);
      const annotated = await renderScene(
        winner.composition.spec,
        winner.layout,
        winner.spec.tokens,
        winner.spec.palette,
        winnerAssets,
        { annotate: true },
      );
      if (!annotated) break;
      const critique = await critiqueComposition(annotated.png, winner.composition.spec, winner.layout, winner.analysis);
      if (!critique) break;
      if (critique.ops.length === 0) {
        critiqueLog.push({ round, issues: critique.topIssues, discarded: critique.discarded, applied: 0, kept: true });
        break;
      }
      // the critic emitted px (it saw resolved geometry); convert to
      // percent-of-parent via each element's parent pixel size
      const parentSizes = new Map(
        winner.composition.spec.elements.map((e) => {
          const parent = e.parent ? winner.layout!.byId.get(e.parent) : undefined;
          return [
            e.id,
            parent
              ? { w: parent.w, h: parent.h }
              : { w: winner.composition!.spec.canvas.width, h: winner.composition!.spec.canvas.height },
          ] as const;
        }),
      );
      const revisedSpec = applyRevisionOps(winner.composition.spec, critique.ops, parentSizes);
      const revisedLayout = resolveLayout(revisedSpec);
      const revisedStructural = scoreStructure(revisedSpec, revisedLayout, winner.analysis);
      const revisedQuality = assessQuality(revisedSpec, revisedLayout);
      // a revision must clear the same gate the original did
      const kept = revisedQuality.ok && revisedStructural.score >= (winner.structural?.score ?? 0);
      if (kept) {
        winner.composition = { ...winner.composition, spec: revisedSpec };
        winner.layout = revisedLayout;
        winner.structural = revisedStructural;
        winner.quality = revisedQuality;
        winner.preview = (await rerender()) ?? winner.preview;
        status(
          critique.topIssues[0]
            ? `Revised: ${critique.topIssues[0].slice(0, 90)}`
            : 'Applied structural revisions.',
        );
      } else {
        status('Revision would have weakened the structure — kept the original.');
      }
      critiqueLog.push({
        round,
        issues: critique.topIssues,
        discarded: critique.discarded,
        applied: critique.ops.length,
        kept,
      });
      if (kept === false) break;
    }
  }

  /* 8 — expansion: copy, assets, artifacts. */
  const winnerSpec = winner.composition?.spec ?? null;
  const focalText =
    winnerSpec?.elements.find((e) => e.id === winnerSpec.focalElementId && e.content?.heading)?.content?.heading ??
    winnerSpec?.elements.find((e) => e.kind === 'text' && e.content?.heading)?.content?.heading;

  const [copy, assets, boardThumbs] = await Promise.all([
    winnerSpec
      ? Promise.resolve(null)
      : writeCopy(briefText, winner.spec.genome, winner.spec),
    gatherAssets(briefText || 'product landing page', winner.spec.tokens),
    loadThumbs(bank.dir, topRefs.slice(0, brief.count)),
  ]);
  const headline = focalText ?? copy?.headline ?? fallbackHeadline;
  const floating = floatingFromSpec(winnerSpec, copy?.floating ?? fallbackCopy(briefText, winner.spec.genome).floating);

  if (!winner.heroPng) winner.heroSource = 'procedural';
  const heroPng = winner.heroPng ?? (await proceduralHeroPng(winner.spec));
  const [winnerStickers, og, board] = await Promise.all([
    renderStickers(winner.spec, floating),
    renderOgImage(winner.spec, heroPng, headline, brief.vibe || winner.spec.adjectives.slice(0, 3).join(' · ')),
    makeSheet(boardThumbs),
  ]);

  const blueprint =
    winnerSpec && winner.layout
      ? specBlueprint(winnerSpec, winner.layout, winner.spec.tokens, {
          brief: briefText || 'your product',
          referenceSummary: winner.analysis?.summary,
          principlesSurviving: winner.structural?.principlesSurviving,
          directionName: winner.spec.name,
        })
      : buildBlueprint(briefText, winner.spec.genome, copy ?? fallbackCopy(briefText, winner.spec.genome), winner.spec);

  let compositionHtml: string | null = null;
  if (winnerSpec && winner.layout) {
    const assetFiles = new Map<string, string>();
    const vizSvgs = new Map<string, string>();
    const imageryElements = winnerSpec.elements.filter((e) => e.imagery);
    const primary = imageryElements.sort((a, b) => b.frame.w * b.frame.h - a.frame.w * a.frame.h)[0];
    if (primary) assetFiles.set(primary.id, 'hero.png');
    for (const element of winnerSpec.elements) {
      if (element.kind !== 'viz' || !element.viz) continue;
      const resolved = winner.layout.byId.get(element.id);
      if (resolved) {
        const svg = vizSvgForElement(element, Math.round(resolved.w), Math.round(resolved.h), winner.spec.tokens);
        if (svg) vizSvgs.set(element.id, svg);
      }
    }
    compositionHtml = emitCompositionHtml(winnerSpec, winner.layout, winner.spec.tokens, winner.spec.palette, assetFiles, vizSvgs, {
      title: headline,
    });
  }

  const motionCss = buildMotionCss(winner.spec.genome, winner.spec.tokens);
  const motionJs = buildMotionJs();
  const sheet = await renderContactSheet(
    outcomes
      .filter((o) => o.preview)
      .map((o) => ({ spec: o.spec, tilePng: o.preview!.png, score: o.score, winner: o === winner })),
    winner.spec,
  );

  const provenance = {
    compositionSource: winner.compositionSource,
    stance: winner.stance,
    referenceId: winner.anchor?.id ?? null,
    referenceKind: winner.anchor?.kind ?? null,
    anchorPool: uiRefs.length ? 'page-designs' : 'all-references',
    curation: curation
      ? {
          pageType: curation.pageType,
          anchorIds: curation.anchors.map((a) => a?.id ?? null),
          heroId: curation.hero?.id ?? null,
          reasons: curation.reasons,
        }
      : null,
    referenceSummary: winner.analysis?.summary ?? null,
    signaturePatternsUsed: winnerSpec?.source.signaturePatternsUsed ?? [],
    principles: winnerSpec?.principles ?? [],
    principlesSurviving: winner.structural?.principlesSurviving ?? [],
    principlesUnverifiable: winner.structural?.principlesUnverifiable ?? [],
    structuralScore: winner.structural ? Number(winner.structural.score.toFixed(3)) : null,
    structuralParts: winner.structural?.parts ?? null,
    qualityGate: winner.quality,
    qualityGates: Object.fromEntries(
      outcomes.map((o) => [o.stance, o.quality ? { ok: o.quality.ok, failures: o.quality.failures, metrics: o.quality.metrics } : null]),
    ),
    craftProxies: Object.fromEntries(outcomes.map((o) => [o.stance, o.craftProxies])),
    specIntegrity: winner.composition?.integrity ?? null,
    specValidationErrors: winner.composition?.validationErrors ?? [],
    specAttempts: winner.composition?.attempts ?? 0,
    resolverAdjustments: winner.layout?.adjustments ?? [],
    critique: critiqueLog,
    sheds: [...sheds, ...winner.sheds],
    elapsedMs: Date.now() - startedAt,
  };

  const attributions = topRefs.filter((r) => r.attribution).map((r) => r.attribution!.html);
  const heroCreditLine =
    winner.heroSource === 'reference-photo'
      ? `bank photograph \`${winner.heroRef?.id}\` gradient-mapped to the palette${winner.heroRef?.attribution ? ` (${winner.heroRef.attribution.html})` : ''}`
      : winner.heroSource === 'generated'
        ? 'diffusion sidecar on the provider GPU'
        : 'procedural SVG gradient (no matching photograph in the bank)';
  const transferLine =
    winner.compositionSource === 'reference-transfer'
      ? `Composition transferred from reference \`${winner.anchor?.id}\` (${winner.analysis?.summary ?? 'decomposed reference'}); ` +
        `${provenance.principlesSurviving.length}/${provenance.principles.length || provenance.principlesSurviving.length} principles verified in the render.`
      : `Composition came from the deterministic TEMPLATE FALLBACK (${
          sheds.some((s) => s.includes('quality gate'))
            ? 'the transferred compositions failed the quality gate — see kit.provenance.sheds'
            : 'no usable reference decomposition was available'
        }).`;

  const markdown = [
    `# Design direction — ${briefText || 'your app'}`,
    '',
    `**Winner: ${winner.spec.name}** (${winner.stance}) — structural fidelity ${winner.structural ? winner.structural.score.toFixed(2) : 'n/a'}, score ${winner.score.toFixed(2)}.`,
    '',
    transferLine,
    '',
    '**The `blueprint` artifact is the page — build its composition, with its exact geometry. It outranks any layout habit.**',
    '',
    '## The three comps',
    '',
    ...ranked.map(
      (r, i) =>
        `${i + 1}. **${r.spec.name}** (${r.stance}, ${r.compositionSource}) — score ${r.score.toFixed(2)}${r.structural ? ` · structure ${r.structural.score.toFixed(2)}` : ''}${r === winner ? ' ★' : ''}`,
    ),
    '',
    'Show the `comps` contact sheet to the user before building — a different pick means building that comp instead (each direction\'s spec provenance is in the kit).',
    '',
    '## Apply, in order',
    '',
    '1. Read `blueprint` (design-blueprint.md) end to end before writing markup.',
    ...(compositionHtml
      ? ['2. Open `composition_html` (composition.html) — it is the winning composition as positioned HTML/CSS with the same geometry as the comp. Port it into your framework rather than re-inventing the layout.']
      : []),
    `${compositionHtml ? 3 : 2}. Link \`theme_css\` after existing styles, then \`motion_css\`, then \`motion_js\` with \`defer\`.`,
    `${compositionHtml ? 4 : 3}. Save \`hero\` as \`public/hero.png\` and \`og\` as \`public/og.png\` (wire the og:image meta tag).`,
    `${compositionHtml ? 5 : 4}. Inline the \`stickers\` SVGs where the blueprint places floating elements — each gets \`data-float\`.`,
    `${compositionHtml ? 6 : 5}. Install the fonts: \`${winner.spec.tokens.fonts.fontsourceInstall}\` (or keep the Bunny \`@import\` in the theme).`,
    ...(attributions.length ? [`${compositionHtml ? 7 : 6}. Keep these credits where sourced photos appear: ${attributions.join(' · ')}`] : []),
    '',
    '---',
    `_Imagery: ${heroCreditLine} · comps rendered with satori/resvg (MPL-2.0)_`,
  ].join('\n');

  const kit = {
    brief: briefText,
    provenance,
    winner: {
      name: winner.spec.name,
      stance: winner.stance,
      adjectives: winner.spec.adjectives,
      palette: winner.spec.palette,
      tokens: winner.spec.tokens,
      headline,
      heroSource: winner.heroSource,
      heroReferenceId: winner.heroRef?.id ?? null,
      heroCredit: winner.heroRef?.attribution?.html ?? null,
    },
    directions: ranked.map((r) => ({
      name: r.spec.name,
      stance: r.stance,
      compositionSource: r.compositionSource,
      adjectives: r.spec.adjectives,
      palette: r.spec.palette,
      // a different pick must be buildable: tokens + genome travel with
      // every direction, exactly as the invocation pack promises
      tokens: r.spec.tokens,
      genome: r.spec.genome,
      referenceId: r.anchor?.id ?? null,
      score: Number(r.score.toFixed(3)),
      parts: r.parts,
      principles: r.composition?.spec.principles ?? [],
    })),
    icons: assets.icons,
    photo: assets.photo,
    pattern: assets.pattern,
    refs: topRefs.slice(0, brief.count).map(publicRef),
    notes: assets.notes,
  };
  let kitJson = JSON.stringify(kit, null, 2);
  if (kitJson.length > 18_000) {
    kitJson = JSON.stringify({ ...kit, icons: assets.icons.map((icon) => ({ ...icon, svg: undefined })), refs: [] });
  }

  console.log(
    `[design-blocks] winner ${winner.spec.name} (${winner.stance}, ${winner.compositionSource}) score ${winner.score.toFixed(2)}, ` +
      `transfers ${outcomes.filter((o) => o.compositionSource === 'reference-transfer').length}/3, ` +
      `critique rounds ${critiqueLog.length}, elapsed ${Math.round((Date.now() - startedAt) / 1000)}s`,
  );
  status(
    `Done: ${winner.spec.name} wins (${winner.compositionSource}) — comps, spec, blueprint, theme, and imagery attached.`,
  );

  const artifacts: NonNullable<HandlerResult['artifacts']> = [
    { data: markdown, mimeType: 'text/markdown', outputId: 'direction' },
    { data: blueprint, mimeType: 'text/markdown', fileName: 'design-blueprint.md', outputId: 'blueprint' },
    { data: kitJson, mimeType: 'application/json', fileName: 'design-kit.json', outputId: 'kit' },
    { data: buildThemeCss(winner.spec.tokens), mimeType: 'text/css', fileName: 'design-theme.css', outputId: 'theme_css' },
    { data: motionCss, mimeType: 'text/css', fileName: 'design-motion.css', outputId: 'motion_css' },
    { data: motionJs, mimeType: 'text/javascript', fileName: 'design-motion.js', outputId: 'motion_js' },
  ];
  if (winnerSpec && winner.layout) {
    artifacts.push({
      data: JSON.stringify(
        {
          spec: winnerSpec,
          resolved: winner.layout.elements.map((e) => ({
            id: e.element.id,
            x: Math.round(e.x),
            y: Math.round(e.y),
            w: Math.round(e.w),
            h: Math.round(e.h),
            z: e.element.z,
            attachPoint: e.attachPoint,
            ring: e.ring,
          })),
          canvas: winner.layout.canvas,
          adjustments: winner.layout.adjustments,
        },
        null,
        1,
      ),
      mimeType: 'application/json',
      fileName: 'composition-spec.json',
      outputId: 'composition_spec',
    });
  }
  if (compositionHtml) {
    artifacts.push({ data: compositionHtml, mimeType: 'text/html', fileName: 'composition.html', outputId: 'composition_html' });
  }
  if (winner.analysis) {
    artifacts.push({
      data: JSON.stringify(winner.analysis, null, 1),
      mimeType: 'application/json',
      fileName: 'reference-analysis.json',
      outputId: 'analysis',
    });
  }
  if (winnerStickers.length) {
    artifacts.push({
      data: JSON.stringify(
        { stickers: winnerStickers.map(({ png: _png, ...sticker }) => sticker) },
        null,
        1,
      ),
      mimeType: 'application/json',
      fileName: 'design-stickers.json',
      outputId: 'stickers',
    });
  }
  outcomes.forEach((o, i) => {
    if (o.preview) {
      artifacts.push({
        data: Buffer.from(o.preview.png),
        mimeType: 'image/png',
        fileName: `comp-${i + 1}.png`,
        outputId: `comp_${i + 1}`,
      });
    }
  });
  if (sheet) artifacts.push({ data: Buffer.from(sheet), mimeType: 'image/png', fileName: 'comps.png', outputId: 'comps' });
  // when the winner's primary imagery is a cutout, composition.html and
  // the blueprint expect hero.png to carry alpha — ship the cutout; the
  // og image above already used the uncut original
  artifacts.push({ data: Buffer.from(winnerCutoutPng ?? heroPng), mimeType: 'image/png', fileName: 'hero.png', outputId: 'hero' });
  if (og) artifacts.push({ data: Buffer.from(og), mimeType: 'image/png', fileName: 'og.png', outputId: 'og' });
  if (board) artifacts.push({ data: Buffer.from(board), mimeType: 'image/jpeg', fileName: 'design-board.jpg', outputId: 'board' });

  return { artifacts };
}
