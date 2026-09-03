/**
 * The evidence markers pinned to the photo come from the model's own Why
 * section: one marker per sentence, up to three, each with a short label.
 * The model does not report coordinates, so the pins sit at fixed points on
 * the photo — the marker number is what ties a pin to its row in the
 * differential panel.
 */

export interface EvidencePoint {
  /** 1-based, shared by the pin on the photo and the row in the list. */
  n: number;
  /** The full sentence, for the list. */
  text: string;
  /** A one-line cut for the pin label. */
  label: string;
}

export const MAX_EVIDENCE = 3;

const LABEL_CHARS = 58;

function shorten(sentence: string): string {
  const flat = sentence.replace(/\s+/g, " ").trim().replace(/[.:;,]$/, "");
  if (flat.length <= LABEL_CHARS) return flat;
  const cut = flat.slice(0, LABEL_CHARS);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > 24 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

export function evidenceFrom(why: string): EvidencePoint[] {
  const sentences = why
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

  return sentences.slice(0, MAX_EVIDENCE).map((text, index) => ({
    n: index + 1,
    text,
    label: shorten(text),
  }));
}
