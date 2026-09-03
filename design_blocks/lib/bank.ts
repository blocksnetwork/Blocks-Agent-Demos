/**
 * The bank: a folder of reference designs the ingest script has indexed —
 * per image, a CLIP embedding, a palette, vibe tags, and a thumbnail.
 * Retrieval is cosine similarity against the brief's text embedding, with
 * a plain keyword fallback so the agent still answers when the embedding
 * sidecar is down.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export type BankEntry = {
  id: string;
  file: string;
  thumb: string;
  vibe: string;
  tags: string[];
  notes: string;
  palette: string[];
  attribution?: { html: string; source: string };
  /** 'ui' = an actual interface/design reference; 'photo' = mood/asset photography. */
  kind?: 'ui' | 'photo' | 'unknown';
  /** relative path of the cached DesignReferenceAnalysis JSON, when one exists */
  analysisFile?: string;
  embedding: number[];
};

export type Bank = { dir: string; entries: BankEntry[] };

let cached: { bank: Bank; mtimeMs: number } | null = null;

export async function loadBank(dir: string): Promise<Bank> {
  const indexPath = join(dir, 'index.json');
  try {
    const { mtimeMs } = await stat(indexPath);
    if (cached && cached.bank.dir === dir && cached.mtimeMs === mtimeMs) return cached.bank;
    const parsed = JSON.parse(await readFile(indexPath, 'utf8')) as { entries?: BankEntry[] };
    const bank: Bank = { dir, entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
    cached = { bank, mtimeMs };
    return bank;
  } catch {
    return { dir, entries: [] };
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

function keywordScore(entry: BankEntry, brief: string): number {
  const words = brief.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  const haystack = `${entry.vibe} ${entry.tags.join(' ')} ${entry.notes}`.toLowerCase();
  return words.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
}

/** Top-k references for a brief; embedding first, keywords as fallback. */
export function search(
  bank: Bank,
  queryEmbedding: number[] | null,
  brief: string,
  k: number,
): Array<{ entry: BankEntry; score: number }> {
  // Cosine (~0..0.35) and keyword hit counts (0..N) are incomparable —
  // when an embedding query exists, entries without embeddings compete
  // on a keyword score squashed BELOW the useful cosine range, so they
  // rank as a second tier instead of leapfrogging real matches.
  const scored = bank.entries.map((entry) => ({
    entry,
    score:
      queryEmbedding && entry.embedding.length > 0
        ? cosine(queryEmbedding, entry.embedding)
        : queryEmbedding
          ? Math.min(keywordScore(entry, brief) / 40, 0.15)
          : keywordScore(entry, brief),
  }));
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}
