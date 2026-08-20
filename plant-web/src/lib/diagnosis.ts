/**
 * Turns the agent's markdown into the shape the result panel renders.
 *
 * The agent is told to answer in four sections — Diagnosis, Confidence, Why,
 * Fix — and in practice it complies almost every time, including when it has
 * nothing to diagnose. Its refusals therefore arrive as well-formed answers
 * headed "Not a plant" or "Not diagnosable" rather than as the one-line
 * bail-out the prompt asks for, so those are caught by reading the diagnosis
 * line, not by the reply being short. Anything that still does not parse falls
 * through to the raw view rather than being forced into a layout it does not
 * fit.
 */

export type Confidence = "high" | "medium" | "low";
export type ResultLevel = "good" | "ok" | "warn";

export interface ParsedDiagnosis {
  kind: "parsed";
  diagnosis: string;
  confidence: Confidence | null;
  confidenceNote: string;
  why: string;
  fix: string[];
  level: ResultLevel;
}

/**
 * A refusal. `body` is the model's own account of what it saw, and `tips` are
 * whatever re-shooting advice it offered — both far more useful than anything
 * generic we could write, so the panel prefers them when they exist.
 */
export interface Refusal {
  kind: "noplant" | "notdiagnosable";
  body: string;
  tips: string[];
}

export type Diagnosis =
  | ParsedDiagnosis
  | Refusal
  | { kind: "unreadable"; text: string }
  | { kind: "raw"; text: string };

type SectionName = "diagnosis" | "confidence" | "why" | "fix";

const SECTION_HEADER =
  /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*|__|\*)?[ \t]*(diagnosis|confidence|why|fix)[ \t]*(?:\*\*|__|\*)?[ \t]*(?:[-–—:.)]+[ \t]*)?(.*)$/i;

const LIST_MARKER = /^[ \t]*(?:\d+[.)]|[-*•])[ \t]+/;

/**
 * Refusals the model dresses up as a diagnosis. These are matched against the
 * diagnosis line alone — it is short and declarative, so a mention of "out of
 * focus" there means the run failed, whereas the same words in Why are just
 * evidence. The wording varies between runs of the same photo ("Not a plant",
 * "The photo does not show a plant"), hence the alternatives rather than a
 * fixed opener.
 */
const NO_PLANT =
  /\b(?:not a plant|isn'?t a plant|no plants? (?:visible|detected|present|found|in (?:this|the) (?:photo|image|frame))|does not (?:show|contain|depict|include) (?:a |any )?plants?|nothing to diagnose)\b/i;

const NOT_DIAGNOSABLE =
  /\bnot diagnosable|\bundiagnosable|\bcannot (?:be )?diagnos|\bcan'?t (?:be )?diagnos|\bunable to diagnos|\binsufficient detail|\btoo (?:blurry|unclear|dark|small)\b|\bout of focus\b|\bimage quality\b/i;

/** Strips the inline markdown the model sprinkles into section bodies. */
function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
}

function splitSections(markdown: string): Map<SectionName, string> {
  const sections = new Map<SectionName, string>();
  let current: SectionName | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current && !sections.has(current)) {
      sections.set(current, buffer.join("\n").trim());
    }
    buffer = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(SECTION_HEADER);
    if (match) {
      flush();
      current = match[1].toLowerCase() as SectionName;
      buffer = match[2] ? [match[2]] : [];
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

function readConfidence(section: string): Confidence | null {
  const match = section.match(/\b(high|medium|moderate|low)\b/i);
  if (!match) return null;
  const word = match[1].toLowerCase();
  return word === "moderate" ? "medium" : (word as Confidence);
}

/**
 * "high — a close-up would confirm it" carries both the rating and the note.
 * The rating already shows in the badge, so only the remainder is prose.
 */
function readConfidenceNote(section: string): string {
  const note = stripInline(
    section
      .replace(
        /^\s*(?:confidence[ \t]*[:–—-]?[ \t]*)?(high|medium|moderate|low)\b[ \t]*[,.;:–—-]*[ \t]*/i,
        "",
      )
      .trim(),
  );

  // Cutting the rating off the front often leaves a lowercase sentence.
  // Leave words like "pH" alone.
  if (/^[a-z][^A-Z]/.test(note)) {
    return note[0].toUpperCase() + note.slice(1);
  }
  return note;
}

function readFixSteps(section: string): string[] {
  const steps: string[] = [];
  let blankSince = false;

  for (const line of section.split(/\r?\n/)) {
    if (!line.trim()) {
      blankSince = true;
      continue;
    }

    if (LIST_MARKER.test(line)) {
      steps.push(line.replace(LIST_MARKER, "").trim());
    } else if (steps.length > 0 && !blankSince) {
      // A wrapped continuation of the step above it.
      steps[steps.length - 1] += ` ${line.trim()}`;
    } else {
      // Either an unmarked one-paragraph fix, or a trailing note after the
      // list. Standing on its own beats being glued onto the final step.
      steps.push(line.trim());
    }

    blankSince = false;
  }

  return steps.map(stripInline).filter(Boolean);
}

function levelFor(diagnosis: string, confidence: Confidence | null): ResultLevel {
  if (/\b(healthy|no (?:visible )?(?:problem|issue|disease))\b/i.test(diagnosis)) {
    return "good";
  }
  return confidence === "high" ? "ok" : "warn";
}

export function parseDiagnosis(markdown: string): Diagnosis {
  const text = markdown.trim();

  if (!text) {
    return { kind: "unreadable", text: "The model returned an empty reply." };
  }

  // The handler answers its own input failures in plain prose.
  if (
    /^(no photo received|could not read the uploaded image|the uploaded file was empty)/i.test(
      text,
    )
  ) {
    return { kind: "unreadable", text: stripInline(text) };
  }

  const sections = splitSections(text);
  const diagnosis = stripInline(sections.get("diagnosis") ?? "");
  const why = stripInline(sections.get("why") ?? "");

  if (diagnosis && why) {
    // The model sometimes runs the whole answer into the Diagnosis line;
    // the hero is a headline, so only the first sentence belongs there.
    const headline = firstLine(diagnosis);
    const fix = readFixSteps(sections.get("fix") ?? "");

    // A refusal in the shape of an answer. Rendering it as a diagnosis would
    // put "Not a plant" under a confident green badge.
    if (NO_PLANT.test(headline)) {
      return { kind: "noplant", body: why, tips: fix };
    }
    if (NOT_DIAGNOSABLE.test(headline)) {
      return { kind: "notdiagnosable", body: why, tips: fix };
    }

    const confidenceSection = sections.get("confidence") ?? "";
    const confidence = readConfidence(confidenceSection);

    return {
      kind: "parsed",
      diagnosis: headline,
      confidence,
      confidenceNote: readConfidenceNote(confidenceSection),
      why,
      fix,
      level: levelFor(diagnosis, confidence),
    };
  }

  // The one-line bail-out the prompt asks for. Rare in practice, but it costs
  // little to keep honouring it.
  const flat = text.replace(/\s+/g, " ");
  const brief = flat.length < 400;

  if (
    brief &&
    /\b(no plant|not a plant|isn'?t a plant|does not (?:show|contain) a plant|nothing (?:to diagnose|that (?:i|it) c(?:ould|an) diagnose))\b/i.test(
      flat,
    )
  ) {
    return { kind: "noplant", body: stripInline(text), tips: [] };
  }

  if (
    brief &&
    /\b(not diagnosable|cannot be diagnosed|can'?t be diagnosed|too (?:blurry|soft|dark|out of focus)|out of focus|re-?shoot)\b/i.test(
      flat,
    )
  ) {
    return { kind: "notdiagnosable", body: stripInline(text), tips: [] };
  }

  return { kind: "raw", text };
}

function firstLine(value: string): string {
  const line = value.split(/\r?\n/)[0].trim();
  // Keep short trailing clauses ("Root rot, advanced") but drop full sentences.
  const sentence = line.match(/^(.+?[.!?])(?:\s|$)/);
  return sentence && sentence[1].length > 24 ? sentence[1].replace(/[.]$/, "") : line;
}

export function confidenceBadge(confidence: Confidence | null): string | null {
  return confidence ? `Confidence: ${confidence}` : null;
}
