/**
 * Zero-shot CLIP labeling — the tagger the bank falls back to when the
 * Qwen vLLM is unreachable. The embed sidecar puts label text and
 * reference images in the same space, so cosine against a small label
 * vocabulary yields a vibe and tags with no LLM at all. Labels are a
 * classifier's label space, not design opinions: retrieval still runs on
 * the raw CLIP embeddings; these only name what was ingested.
 */

import { embedText } from './sidecar.js';
import type { ImageTags } from './qwen.js';

const VIBES = [
  'botanical natural',
  'dark moody',
  'pastel dreamy',
  'warm earthy',
  'minimal architectural',
  'bold colorful',
  'glassy frosted',
  'editorial print',
  'flat geometric',
  'cozy interior',
];

const TAGS = [
  'green', 'leaves', 'moss', 'forest', 'flowers', 'wood', 'stone', 'water',
  'gradient', 'texture', 'glass', 'paper', 'fabric', 'night', 'light',
  'shadow', 'pastel', 'earthy', 'vibrant', 'muted', 'warm', 'cool',
  'minimal', 'organic', 'geometric', 'vintage', 'modern', 'photography',
  'illustration', 'macro',
];

let vocabCache: { vibes: number[][]; tags: number[][] } | null = null;

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

async function loadVocab(): Promise<{ vibes: number[][]; tags: number[][] } | null> {
  if (vocabCache) return vocabCache;
  const vibes: number[][] = [];
  for (const vibe of VIBES) {
    const embedding = await embedText(`a ${vibe} photograph`);
    if (!embedding) return null;
    vibes.push(embedding);
  }
  const tags: number[][] = [];
  for (const tag of TAGS) {
    const embedding = await embedText(`a photo of ${tag}`);
    if (!embedding) return null;
    tags.push(embedding);
  }
  vocabCache = { vibes, tags };
  return vocabCache;
}

/** Name an already-embedded image; null when the sidecar is down too. */
export async function zeroShotTags(imageEmbedding: number[]): Promise<ImageTags | null> {
  if (imageEmbedding.length === 0) return null;
  const vocab = await loadVocab();
  if (!vocab) return null;

  const vibeRanked = VIBES.map((label, i) => ({ label, score: cosine(imageEmbedding, vocab.vibes[i]) }))
    .sort((a, b) => b.score - a.score);
  const tagRanked = TAGS.map((label, i) => ({ label, score: cosine(imageEmbedding, vocab.tags[i]) }))
    .sort((a, b) => b.score - a.score);

  const vibe = vibeRanked[0].label;
  const tags = tagRanked.slice(0, 6).map((t) => t.label);
  return {
    vibe,
    tags,
    notes: `Zero-shot CLIP: reads as ${vibe}; strongest signals ${tags.slice(0, 3).join(', ')}.`,
  };
}

const KIND_LABELS: Array<{ kind: 'ui' | 'photo'; text: string }> = [
  { kind: 'ui', text: 'a screenshot of a user interface design, website, dashboard, or app screen' },
  { kind: 'photo', text: 'a photograph of a real-world scene, object, plant, or person' },
];

let kindCache: number[][] | null = null;

/**
 * ui-vs-photo classification for a bank entry, zero-shot over CLIP.
 * UI references are the primary composition inspiration; photography
 * remains an asset/mood source — retrieval prefers 'ui' when it can.
 */
export async function classifyKind(imageEmbedding: number[]): Promise<'ui' | 'photo' | 'unknown'> {
  if (imageEmbedding.length === 0) return 'unknown';
  if (!kindCache) {
    const embeds: number[][] = [];
    for (const label of KIND_LABELS) {
      const embedding = await embedText(label.text);
      if (!embedding) return 'unknown';
      embeds.push(embedding);
    }
    kindCache = embeds;
  }
  const scores = kindCache.map((e) => cosine(imageEmbedding, e));
  return KIND_LABELS[scores.indexOf(Math.max(...scores))].kind;
}
