/**
 * Turns the agent's markdown into clips the page can seek to.
 *
 * The handler asks for a fixed four-field block per pick, and the model
 * complies nearly every time — but "nearly" is why this reads tolerantly:
 * heading level, bold markers, and the dash between the two timestamps all
 * vary between runs of the same recording. What is not negotiable is the
 * timestamp pair, since a clip the page cannot seek to is not a clip. Blocks
 * that fail that test are dropped, and if none survive the raw markdown is
 * shown rather than an empty result.
 */

export interface Clip {
  rank: number;
  title: string;
  start: number;
  end: number;
  quote: string;
  caption: string;
  why: string;
}

export type Picks =
  | { kind: "picks"; clips: Clip[]; note: string | null; shortfall: string | null }
  /** The handler answering its own input failures in plain prose. */
  | { kind: "message"; text: string }
  | { kind: "raw"; text: string };

type Field = "timestamp" | "quote" | "caption" | "why";

const HEADING =
  /^[ \t]{0,3}(#{1,6}[ \t]*)?(?:\*\*|__)?[ \t]*(\d{1,2})[.)][ \t]*(.+?)[ \t]*$/;

const FIELD =
  /^[ \t]*(?:[-*•][ \t]*)?(?:\*\*|__|\*)?[ \t]*(timestamp|quote|caption|why)[ \t]*(?:\*\*|__|\*)?[ \t]*(?:[-–—:.)]+[ \t]*)?(.*)$/i;

/** The trailing italic note the handler appends when it trimmed the middle. */
const TRAILING_NOTE = /\n[ \t]*---[ \t]*\n+[ \t]*_([\s\S]+?)_[ \t]*$/;

/** Input failures the handler reports as prose rather than as picks. */
const HANDLER_MESSAGE =
  /^(no recording received|could not read the uploaded recording|the uploaded file was empty|could not transcribe that file)/i;

function stripInline(text: string): string {
  return (
    text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/^[ \t]*[-–—:][ \t]*/, "")
      // A heading like "**1. Title**" loses its opening marker to the heading
      // pattern, which leaves the closing one unpaired and unmatched above.
      .replace(/^[*_]{1,2}(?=\S)/, "")
      .replace(/(?<=\S)[*_]{1,2}$/, "")
      .trim()
  );
}

/**
 * Drop the quote marks the model wraps a quote in about half the time, so the
 * card can style speech consistently instead of inheriting whichever punctuation
 * the run happened to produce. Only a matched outer pair goes: quotes inside the
 * sentence are part of what was said.
 */
function unwrapQuote(text: string): string {
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ['"', '"'],
    ["\u201c", "\u201d"],
    ["\u2018", "\u2019"],
    ["'", "'"],
  ];

  for (const [open, close] of pairs) {
    if (text.length <= 2 || !text.startsWith(open) || !text.endsWith(close)) continue;

    // Requiring the pair to be the only one rules out "a" and "b", where the
    // first mark closes mid-sentence and stripping the ends would mangle it.
    const marks = [...text].filter((ch) => ch === open || ch === close).length;
    if (marks === 2) return text.slice(1, -1).trim();
  }
  return text;
}

/** MM:SS, H:MM:SS, or a bare second count. */
function parseStamp(raw: string): number | null {
  const match = raw.match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{1,2})$|^(\d{1,4})$/);
  if (!match) return null;

  if (match[4] !== undefined) return Number(match[4]);

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function parseRange(raw: string): { start: number; end: number } | null {
  // "01:12 to 01:44", "1:12 – 1:44", "01:12-01:44", "01:12 → 01:44".
  const match = raw.match(
    /(\d{1,2}:\d{1,3}:\d{1,2}|\d{1,3}:\d{1,2}|\d{1,4})[ \t]*(?:to|until|through|–|—|-|→|>)[ \t]*(\d{1,2}:\d{1,3}:\d{1,2}|\d{1,3}:\d{1,2}|\d{1,4})/i,
  );
  if (!match) return null;

  const start = parseStamp(match[1]);
  const end = parseStamp(match[2]);
  if (start === null || end === null) return null;

  // A backwards or zero-length range means the model garbled the pair; a
  // three-hour one means it hallucinated past the end of the recording. Let
  // the caller clamp against the real duration, but reject the nonsense here.
  if (end <= start || end - start > 600) return null;

  return { start, end };
}

interface Block {
  rank: number;
  title: string;
  lines: string[];
}

/**
 * Splits the reply into one block per pick.
 *
 * A heading is only believed once a Timestamp line turns up beneath it, which
 * is what keeps an enumerated sentence inside a Why from starting a new clip.
 */
function splitBlocks(markdown: string): { blocks: Block[]; tail: string } {
  const lines = markdown.split(/\r?\n/);
  const starts: Array<{ index: number; rank: number; title: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING);
    if (!match) continue;

    const hasField = lines
      .slice(i + 1, i + 6)
      .some((line) => FIELD.test(line) && /timestamp/i.test(line));
    if (!hasField && !match[1]) continue;

    starts.push({ index: i, rank: Number(match[2]), title: stripInline(match[3]) });
  }

  if (starts.length === 0) return { blocks: [], tail: markdown };

  const blocks = starts.map((start, i) => ({
    rank: start.rank,
    title: start.title,
    lines: lines.slice(start.index + 1, starts[i + 1]?.index ?? lines.length),
  }));

  return { blocks, tail: lines.slice(0, starts[0].index).join("\n").trim() };
}

function readFields(lines: string[]): { fields: Map<Field, string>; loose: string } {
  const fields = new Map<Field, string>();
  const loose: string[] = [];
  let current: Field | null = null;

  for (const line of lines) {
    const match = line.match(FIELD);
    if (match) {
      current = match[1].toLowerCase() as Field;
      fields.set(current, match[2] ?? "");
      continue;
    }

    if (!line.trim()) {
      current = null;
      continue;
    }

    if (current) {
      // A wrapped continuation of the field above it.
      fields.set(current, `${fields.get(current) ?? ""} ${line.trim()}`);
    } else {
      loose.push(line.trim());
    }
  }

  return { fields, loose: loose.join(" ") };
}

export function parsePicks(markdown: string): Picks {
  const text = markdown.trim();

  if (!text) return { kind: "message", text: "The agent returned an empty reply." };
  if (HANDLER_MESSAGE.test(text)) return { kind: "message", text: stripInline(text) };

  const noteMatch = text.match(TRAILING_NOTE);
  const note = noteMatch ? stripInline(noteMatch[1]) : null;
  const body = noteMatch ? text.slice(0, noteMatch.index).trim() : text;

  const { blocks, tail } = splitBlocks(body);

  const clips: Clip[] = [];
  const leftovers: string[] = tail ? [tail] : [];

  for (const block of blocks) {
    const { fields, loose } = readFields(block.lines);
    const range = parseRange(fields.get("timestamp") ?? "");

    if (!range) {
      // No usable range. Keep the prose — this is usually the model explaining
      // why a third pick did not qualify.
      const salvage = [block.title, ...[...fields.values()].map(stripInline), loose]
        .filter(Boolean)
        .join(" ");
      if (salvage) leftovers.push(salvage);
      continue;
    }

    const why = fields.get("why");

    // Prose sitting outside the four fields is the model talking about the
    // recording as a whole — usually why a third pick did not qualify — and
    // belongs in the note, not appended to this clip's reasoning.
    if (why !== undefined && loose) leftovers.push(loose);

    clips.push({
      rank: clips.length + 1,
      title: block.title,
      start: range.start,
      end: range.end,
      quote: unwrapQuote(stripInline(fields.get("quote") ?? "")),
      caption: stripInline(fields.get("caption") ?? ""),
      why: stripInline(why ?? loose),
    });
  }

  if (clips.length === 0) return { kind: "raw", text };

  clips.sort((a, b) => a.start - b.start);
  clips.forEach((clip, i) => {
    clip.rank = i + 1;
  });

  const shortfall = clips.length < 3 ? (leftovers.join(" ").trim() || null) : null;

  return { kind: "picks", clips, note, shortfall };
}

/**
 * Pulls every clip inside the recording. The model is told to use only
 * timestamps from the transcript and generally does, but a range that runs off
 * the end would leave the player seeking to nowhere.
 */
export function clampClips(clips: Clip[], duration: number): Clip[] {
  if (!Number.isFinite(duration) || duration <= 0) return clips;

  return clips
    .filter((clip) => clip.start < duration)
    .map((clip) => ({ ...clip, end: Math.min(clip.end, duration) }))
    .filter((clip) => clip.end > clip.start);
}
