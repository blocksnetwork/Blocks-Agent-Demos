/**
 * Offline proof of the transfer pipeline's back half:
 *
 *   fixture DesignReferenceAnalysis (x2, maximally different)
 *   -> CompositionSpec (authored to the schema, as the planner would emit)
 *   -> sanitize -> validate against the analysis -> resolve -> score
 *   -> full-page comp render
 *
 * for ONE product (AI infrastructure monitoring). No vLLM, no GPU, no
 * sidecars — imagery is procedural. What this demonstrates: a different
 * reference changes the SHAPE of the output, the validator's tripwire
 * rejects a generic navbar-hero-cards spec against a layered reference,
 * and preview + composition.html come from the same resolved geometry.
 *
 *   npx tsx test/transfer-demo.ts        # writes test/out/
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sanitizeAnalysis, analysisUsable, transferBrief } from '../lib/analysis.js';
import type { ProductIntent } from '../lib/intent.js';
import { sanitizeSpec, specUsable, validateSpecAgainstAnalysis } from '../lib/composition.js';
import { resolveLayout } from '../lib/resolve.js';
import { scoreStructure } from '../lib/score.js';
import { renderScene, vizSvgForElement, type SceneAssets } from '../lib/scene.js';
import { specBlueprint, emitCompositionHtml } from '../lib/blueprint.js';
import { deriveTokens } from '../lib/tokens.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');

const intent: ProductIntent = {
  productType: 'AI infrastructure monitoring console',
  audience: 'SREs and platform engineers',
  contentInventory: [
    'product name and one-line promise',
    'live cluster state',
    'per-node latency and error hotspots',
    'throughput trend',
    'primary action: open the console',
  ],
  dataDisplays: [
    { intent: 'indicate system health', entities: ['cluster health'], importance: 'primary' },
    { intent: 'show spatial condition of individual nodes', entities: ['latency', 'errors'], importance: 'primary' },
    { intent: 'show change over time', entities: ['throughput'], importance: 'secondary' },
  ],
  primarySubject: 'server topology graph',
  subjectImagePrompt: 'abstract server topology graph, glowing nodes and edges, plain background, no text, no letters, no watermark',
  tone: ['technical', 'calm', 'confident'],
};

/**
 * Transfer of the agriculture-dashboard logic: the topology graph takes
 * the plant's structural role, latency callouts take the leaf labels,
 * the health ring wraps the topology, the diagnostics panel overlaps it.
 */
const specFromAgri = {
  canvas: { height: 2000 },
  focalElementId: 'topology',
  planes: 4,
  principles: [
    'one oversized domain subject anchors the composition and escapes its container',
    'attach data spatially to meaningful regions of the primary subject instead of placing metrics in separate cards',
    'wrap the key status indicator around the subject rather than boxing it',
    'use at least four depth planes, with panels layered both behind and in front of the subject',
    'let information density fall off across the reading axis and keep the composition strongly off-axis',
  ],
  source: { signaturePatternsUsed: ['oversized subject', 'attached data', 'wrapped ring', 'four planes', 'density gradient'] },
  elements: [
    { id: 'nav', role: 'navigation', kind: 'group', frame: { x: 0, y: 0, w: 100, h: 4 }, z: 3 },
    { id: 'nav-name', role: 'wordmark', kind: 'text', parent: 'nav', frame: { x: 3, y: 20, w: 20, h: 60 }, z: 3, content: { heading: 'Meshwatch' } },
    { id: 'nav-cta', role: 'nav-action', kind: 'text', parent: 'nav', frame: { x: 84, y: 20, w: 13, h: 60 }, z: 3, content: { label: 'Open console' }, style: { paletteRole: 'accent' } },
    {
      id: 'hero-band', role: 'atmosphere band behind the subject', kind: 'panel',
      frame: { x: 0, y: 4, w: 100, h: 40 }, z: 0, style: { surface: 'none' },
    },
    {
      id: 'topology', role: 'primary-subject: the live cluster topology', kind: 'image',
      frame: { x: 40, y: 6, w: 48, h: 40 }, z: 2,
      relations: [{ type: 'breaksContainer', side: 'top', amount: 0.12 }],
      imagery: { subject: 'server topology graph, glowing nodes', integration: 'cutout' },
    },
    {
      id: 'health-ring', role: 'cluster health indicator wrapping the subject', kind: 'viz',
      frame: { x: 36, y: 4, w: 56, h: 44 }, z: 2,
      relations: [{ type: 'encircles', target: 'topology', ratio: 1.18 }],
      viz: {
        intent: 'indicate system health', form: 'segmented ring wrapping the subject',
        render: [{ primitive: 'ringSegment', params: { fraction: 0.86 } }],
        values: [{ label: 'cluster health', value: '86%' }],
      },
    },
    {
      id: 'latency-eu', role: 'metric-annotation pinned to a node', kind: 'viz',
      frame: { x: 26, y: 10, w: 14, h: 6 }, z: 3,
      relations: [{ type: 'attachedTo', target: 'topology', at: { x: 22, y: 34 } }],
      viz: {
        intent: 'show spatial condition of individual nodes', form: 'value pinned to a node with a leader line',
        render: [{ primitive: 'leaderCallout', params: {} }],
        values: [{ label: 'eu-west p99', value: '84ms' }],
      },
      style: { surface: 'glass' },
    },
    {
      id: 'errors-us', role: 'metric-annotation pinned to a node', kind: 'viz',
      frame: { x: 74, y: 34, w: 15, h: 6 }, z: 3,
      relations: [{ type: 'attachedTo', target: 'topology', at: { x: 78, y: 62 } }],
      viz: {
        intent: 'show spatial condition of individual nodes', form: 'value pinned to a node with a leader line',
        render: [{ primitive: 'leaderCallout', params: {} }],
        values: [{ label: 'us-east errors', value: '0.4%' }],
      },
      style: { surface: 'glass' },
    },
    {
      id: 'headline', role: 'page headline in the sparse zone', kind: 'text',
      frame: { x: 4, y: 8, w: 30, h: 14 }, z: 1,
      content: { heading: 'Every node,\nin sight.', body: 'The mesh watches itself so you can sleep.', fit: 'fill' },
    },
    {
      id: 'diag-panel', role: 'diagnostic-panel overlapping the subject', kind: 'panel',
      frame: { x: 3, y: 26, w: 26, h: 18 }, z: 3,
      relations: [{ type: 'overlaps', target: 'topology', amount: 0.25, side: 'left' }],
      content: { heading: 'Live diagnostics', items: ['3 pods rescheduled', 'us-east-1b saturating', 'p50 stable at 12ms'] },
      style: { surface: 'solid', emphasis: 0.7 },
    },
    {
      id: 'behind-glow', role: 'depth plane behind everything', kind: 'shape',
      frame: { x: 52, y: 2, w: 40, h: 40 }, z: 0,
      imagery: { subject: 'glow', integration: 'contained', mask: 'circle' },
      style: { paletteRole: 'primary', emphasis: 0.2 },
    },
    {
      id: 'throughput-band', role: 'history band breaking the right edge', kind: 'viz',
      frame: { x: 6, y: 50, w: 90, h: 12 }, z: 1,
      relations: [{ type: 'breaksContainer', side: 'right', amount: 0.1 }],
      viz: {
        intent: 'show change over time', form: 'flowing full-width line with node dots',
        render: [{ primitive: 'sparkline', params: { values: [40, 44, 43, 58, 52, 66, 61, 78, 74, 88] } }],
        values: [{ label: 'throughput, 24h', value: '2.4M rps' }],
      },
    },
    {
      id: 'cta', role: 'primary action, offset into the sparse zone', kind: 'text',
      frame: { x: 6, y: 65, w: 22, h: 5 }, z: 2,
      content: { heading: 'Open the console' }, style: { paletteRole: 'accent' },
    },
  ],
};

/**
 * Transfer of the brutalist-editorial logic onto the SAME product: the
 * monumental word is the dominant object overlapping the topology image,
 * type bleeds off-canvas, a vertical rail runs the right edge, the CTA
 * block is deliberately misaligned. No cards.
 */
const specFromBrutalist = {
  canvas: { height: 1800 },
  focalElementId: 'giant-word',
  planes: 3,
  principles: [
    'monumental display type is the dominant compositional object, overlapping imagery rather than sitting above it',
    'let the dominant object bleed off the canvas edge',
    'set one strip of secondary text vertically along a canvas edge',
    'misalign neighboring blocks deliberately; alignment tension replaces decoration',
    'avoid conventional card components entirely; bare blocks and whitespace carry the hierarchy',
  ],
  source: { signaturePatternsUsed: ['monumental type', 'edge bleed', 'vertical rail', 'deliberate misalignment', 'no cards'] },
  elements: [
    {
      id: 'topo-photo', role: 'duotone topology image the type cuts across', kind: 'image',
      frame: { x: 46, y: 16, w: 50, h: 50 }, z: 1,
      imagery: { subject: 'server rack room, harsh light', integration: 'bleed' },
    },
    {
      id: 'giant-word', role: 'monumental headline as the dominant object', kind: 'text',
      frame: { x: -8, y: 8, w: 92, h: 36 }, z: 2,
      relations: [{ type: 'overlaps', target: 'topo-photo', amount: 0.35 }],
      content: { heading: 'UPTIME.', fit: 'fill' },
      style: { paletteRole: 'ink' },
    },
    {
      id: 'rail', role: 'vertical text rail on the right edge', kind: 'text',
      frame: { x: 95, y: 26, w: 4, h: 50 }, z: 3, rotation: 90,
      content: { label: 'MESHWATCH — INFRASTRUCTURE OBSERVED' },
      style: { paletteRole: 'neutral' },
    },
    {
      id: 'claim', role: 'one-line promise, small against the giant word', kind: 'text',
      frame: { x: 6, y: 48, w: 30, h: 8 }, z: 2,
      content: { body: 'The mesh watches itself. You get told only when it matters.' },
    },
    {
      id: 'offer-block', role: 'action block, deliberately off the photo grid', kind: 'panel',
      frame: { x: 10, y: 62, w: 34, h: 20 }, z: 2,
      relations: [{ type: 'offsetFrom', target: 'topo-photo', edge: 'left', amount: 0.04 }],
      content: { heading: 'Open the console', body: 'No dashboards to build. It already knows your topology.' },
      style: { surface: 'outline' },
    },
    {
      id: 'stat-line', role: 'single bare metric, no card', kind: 'text',
      frame: { x: 58, y: 72, w: 30, h: 8 }, z: 2,
      content: { label: 'cluster health', value: '86% · 84ms p99' },
      style: { paletteRole: 'accent' },
    },
    {
      id: 'trend', role: 'thin throughput trace under the emptiness', kind: 'viz',
      frame: { x: 58, y: 84, w: 36, h: 6 }, z: 0,
      viz: {
        intent: 'show change over time', form: 'bare line, no frame',
        render: [{ primitive: 'sparkline', params: { values: [30, 42, 40, 55, 51, 64, 60, 76] } }],
      },
    },
  ],
};

/** What the old system would have produced: the tripwire must fire. */
const genericTemplateSpec = {
  canvas: { height: 1800 },
  focalElementId: 'hero',
  planes: 1,
  principles: [],
  source: { signaturePatternsUsed: [] },
  elements: [
    { id: 'nav', role: 'navigation', kind: 'group', frame: { x: 0, y: 0, w: 100, h: 5 }, z: 0 },
    { id: 'hero', role: 'hero', kind: 'text', frame: { x: 25, y: 10, w: 50, h: 14 }, z: 0, content: { heading: 'Monitor your infrastructure' } },
    { id: 'hero-img', role: 'hero image', kind: 'image', frame: { x: 20, y: 26, w: 60, h: 22 }, z: 0, imagery: { subject: 'dashboard', integration: 'contained' } },
    { id: 'card-1', role: 'stat card', kind: 'panel', frame: { x: 8, y: 54, w: 26, h: 14 }, z: 0, content: { label: 'uptime', value: '99.9%' } },
    { id: 'card-2', role: 'stat card', kind: 'panel', frame: { x: 37, y: 54, w: 26, h: 14 }, z: 0, content: { label: 'latency', value: '84ms' } },
    { id: 'card-3', role: 'stat card', kind: 'panel', frame: { x: 66, y: 54, w: 26, h: 14 }, z: 0, content: { label: 'errors', value: '0.4%' } },
    { id: 'footer', role: 'footer', kind: 'text', frame: { x: 30, y: 90, w: 40, h: 5 }, z: 0, content: { body: 'Meshwatch inc.' } },
  ],
};

async function run() {
  await mkdir(outDir, { recursive: true });
  const tokens = deriveTokens(['#22c55e', '#f0fdf4', '#14532d', '#0a0f0a', '#86efac'], 'technical dashboard', 1);
  const palette = ['#22c55e', '#f0fdf4', '#14532d'];

  const cases = [
    { name: 'agri-dashboard', raw: specFromAgri },
    { name: 'brutalist-editorial', raw: specFromBrutalist },
  ];

  for (const { name, raw } of cases) {
    const analysisRaw = JSON.parse(await readFile(join(here, 'fixtures', `${name}.analysis.json`), 'utf8'));
    const analysis = sanitizeAnalysis(analysisRaw, `${name}-fixture`);
    if (!analysisUsable(analysis)) throw new Error(`${name}: fixture analysis unusable`);

    console.log(`\n=== ${name} ===`);
    console.log('--- domain-scrubbed transfer brief the planner would see ---');
    console.log(transferBrief(analysis));

    const result = sanitizeSpec(raw, 'faithful', analysis.refId);
    if (!result || !specUsable(result)) throw new Error(`${name}: spec below floor`);
    const errors = validateSpecAgainstAnalysis(result.spec, analysis, intent);
    console.log(`\nvalidation errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    console.log(`integrity: ${JSON.stringify(result.integrity)}`);

    const layout = resolveLayout(result.spec);
    console.log(`resolver adjustments:\n  ${layout.adjustments.join('\n  ') || '(none)'}`);

    const structural = scoreStructure(result.spec, layout, analysis);
    console.log(`structural fidelity: ${structural.score.toFixed(2)} ${JSON.stringify(structural.parts)}`);
    console.log(`principles surviving: ${structural.principlesSurviving.length}/${analysis.signaturePatterns.length}`);

    const assets: SceneAssets = new Map();
    const scene = await renderScene(result.spec, layout, tokens, palette, assets);
    if (scene) {
      await writeFile(join(outDir, `${name}.comp.png`), scene.png);
      await writeFile(join(outDir, `${name}.comp.svg`), scene.svg);
      console.log(`wrote test/out/${name}.comp.png (${layout.canvas.width}x${layout.canvas.height})`);
    } else {
      console.log('render failed (fonts unreachable?) — geometry results above still stand');
    }

    const annotated = await renderScene(result.spec, layout, tokens, palette, assets, { annotate: true });
    if (annotated) await writeFile(join(outDir, `${name}.annotated.png`), annotated.png);

    await writeFile(join(outDir, `${name}.spec.json`), JSON.stringify(result.spec, null, 2));
    await writeFile(
      join(outDir, `${name}.blueprint.md`),
      specBlueprint(result.spec, layout, tokens, {
        brief: intent.productType,
        referenceSummary: analysis.summary,
        principlesSurviving: structural.principlesSurviving,
        directionName: name,
      }),
    );
    const vizSvgs = new Map<string, string>();
    for (const element of result.spec.elements) {
      const r = layout.byId.get(element.id);
      if (r && element.viz) {
        const svg = vizSvgForElement(element, Math.round(r.w), Math.round(r.h), tokens);
        if (svg) vizSvgs.set(element.id, svg);
      }
    }
    await writeFile(
      join(outDir, `${name}.composition.html`),
      emitCompositionHtml(result.spec, layout, tokens, palette, new Map(), vizSvgs, { title: `Meshwatch — ${name}` }),
    );
  }

  // The tripwire: the generic template spec must FAIL validation against
  // the layered agriculture reference.
  console.log('\n=== tripwire: generic navbar-hero-cards spec vs the agri reference ===');
  const agriAnalysis = sanitizeAnalysis(
    JSON.parse(await readFile(join(here, 'fixtures', 'agri-dashboard.analysis.json'), 'utf8')),
    'agri-fixture',
  )!;
  const generic = sanitizeSpec(genericTemplateSpec, 'faithful', 'agri-fixture');
  if (!generic) throw new Error('generic spec did not sanitize');
  const tripwire = validateSpecAgainstAnalysis(generic.spec, agriAnalysis, intent);
  console.log(tripwire.length ? tripwire.map((e) => `REJECTED: ${e}`).join('\n') : 'BUG: the template spec passed validation');
  if (tripwire.length === 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
