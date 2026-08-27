import type { StartTaskMessage, TaskContext, HandlerResult } from '@blocks-network/sdk';

const WHISPER_URL = process.env.WHISPER_URL ?? 'http://127.0.0.1:8001/transcribe';
const VLLM_URL = process.env.VLLM_URL ?? 'http://127.0.0.1:8000/v1/chat/completions';
const MODEL = process.env.VLLM_MODEL ?? 'Qwen/Qwen3.5-4B';

// Qwen3.5-4B is served with a 16k window. Reserve room for the prompt and the
// reply, then trim the transcript from the middle if it is still too long.
const MAX_TRANSCRIPT_CHARS = 34_000;

/**
 * Whisper's VAD splits speech at every pause, so its segments run three to five
 * seconds. Listing those one per line makes a single segment the obvious thing
 * to name, and the picks come back four seconds long however firmly the prompt
 * asks for twenty. Merging them to about the length of a clip first fixes that
 * at the source: the shortest span the model can point at is already postable,
 * and two blocks lands in the middle of the target range.
 */
const BLOCK_SECONDS = 14;

/** Anything shorter than this is not a clip, whatever the model returns. */
const MIN_CLIP_SECONDS = 16;

/** What a short range gets widened to, using block edges only. */
const TARGET_CLIP_SECONDS = 26;

const SYSTEM_PROMPT = `You pick short-form clips out of long recordings.

You are given a transcript split into blocks. Each line reads "MM:SS-MM:SS"
followed by what was said between those two times.

Choose the THREE strongest moments that would stand alone as a vertical short. A
strong moment makes a claim, shows a result, reacts to something, or says a
number out loud. Ignore setup, throat clearing, and anything that only makes
sense with prior context.

A clip is a span, not an instant. One block on its own is too short to post: take
the block the moment lands in, plus enough of the blocks either side that a
viewer gets both the setup and the payoff. Then give the START time of your first
block and the END time of your last block, both read straight off the transcript.
Aim for 20 to 45 seconds. Never return a range shorter than 16 seconds.

Reply in markdown. For each pick, in rank order:

### 1. <title, max 8 words>
**Timestamp** - MM:SS to MM:SS
**Quote** - the single best sentence inside that range, verbatim from the transcript
**Caption** - one line to post it with, no hashtags
**Why** - one sentence on why this holds attention

Never invent a quote: every quote must appear verbatim in the transcript. If the
recording has fewer than three usable moments, return only the ones that qualify
and say why the rest fall short.`;

type Segment = { start: number; end: number; text: string };
type Transcript = { language: string; duration: number; segments: Segment[] };

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

function stamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function toSeconds(text: string): number | null {
  const parts = text.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

/**
 * Gather segments into spans roughly BLOCK_SECONDS long. The boundaries are
 * still Whisper's own, so every timestamp the model can name falls on a pause
 * in the speech rather than mid-sentence.
 */
function toBlocks(segments: Segment[]): Segment[] {
  const blocks: Segment[] = [];

  for (const segment of segments) {
    const open = blocks[blocks.length - 1];
    if (!open || open.end - open.start >= BLOCK_SECONDS) {
      blocks.push({ start: segment.start, end: segment.end, text: segment.text });
      continue;
    }
    open.end = segment.end;
    open.text = `${open.text} ${segment.text}`;
  }

  return blocks;
}

/** Render blocks as "MM:SS-MM:SS text", dropping the middle if it overruns. */
function renderTranscript(blocks: Segment[]): { text: string; trimmed: boolean } {
  const lines = blocks.map((b) => `${stamp(b.start)}-${stamp(b.end)} ${b.text}`);
  const full = lines.join('\n');
  if (full.length <= MAX_TRANSCRIPT_CHARS) return { text: full, trimmed: false };

  const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
  let head = '';
  let tail = '';
  for (const line of lines) {
    if (head.length + line.length > half) break;
    head += `${line}\n`;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (tail.length + lines[i].length > half) break;
    tail = `${lines[i]}\n${tail}`;
  }
  return { text: `${head}\n[... middle of the recording omitted ...]\n\n${tail}`, trimmed: true };
}

const TIMESTAMP_LINE =
  /^([ \t]*(?:[-*\u2022][ \t]*)?(?:\*\*|__|\*)?[ \t]*Timestamp[ \t]*(?:\*\*|__|\*)?[ \t]*(?:[-\u2013\u2014:][ \t]*)?)(.*)$/gim;

const RANGE =
  /(\d{1,2}:\d{1,2}:\d{1,2}|\d{1,3}:\d{1,2})[ \t]*(?:to|until|through|\u2013|\u2014|\u2192|-)[ \t]*(\d{1,2}:\d{1,2}:\d{1,2}|\d{1,3}:\d{1,2})/i;

/**
 * Grow a range out to TARGET_CLIP_SECONDS, snapping to block edges so the
 * widened clip still starts and ends on a pause. Forward first: the payoff needs
 * room to land more often than the setup needs room to build.
 */
function widen(
  start: number,
  end: number,
  blocks: Segment[],
  duration: number,
): { start: number; end: number } {
  const starts = blocks.map((b) => b.start);
  const ends = blocks.map((b) => b.end);
  // Speech, not file length, bounds a clip: trailing room after the last word
  // is not worth spending on a hook.
  const ceiling = Math.min(duration > 0 ? duration : Infinity, ends[ends.length - 1]);

  let lo = start;
  let hi = end;
  let forward = true;

  for (let guard = 0; hi - lo < TARGET_CLIP_SECONDS && guard < 40; guard++) {
    const nextEnd = ends.find((value) => value > hi + 0.01);
    const prevStart = starts.filter((value) => value < lo - 0.01).pop();

    if (forward && nextEnd !== undefined) hi = Math.min(ceiling, nextEnd);
    else if (prevStart !== undefined) lo = prevStart;
    else if (nextEnd !== undefined) hi = Math.min(ceiling, nextEnd);
    else break;

    forward = !forward;
  }

  return { start: lo, end: hi };
}

/**
 * The last line of defence on clip length.
 *
 * The block-sized transcript makes a postable span the easy thing to name, but a
 * model that ignores it anyway would otherwise put a four-second clip in front
 * of someone. Only the Timestamp line is rewritten, which leaves the model's
 * editorial judgement intact: the sentence it chose still sits inside the range.
 */
function enforceClipLength(markdown: string, blocks: Segment[], duration: number): string {
  if (blocks.length === 0) return markdown;

  const spoken = { from: blocks[0].start, to: blocks[blocks.length - 1].end };

  return markdown.replace(TIMESTAMP_LINE, (line: string, label: string, value: string) => {
    const match = value.match(RANGE);
    if (!match) return line;

    const start = toSeconds(match[1]);
    const end = toSeconds(match[2]);
    if (start === null || end === null || end <= start) return line;
    if (end - start >= MIN_CLIP_SECONDS) return line;

    // A stamp past the end of the recording is invented, and there is no
    // neighbouring block to grow it into. Widening it would only turn a wrong
    // four seconds into a wrong four minutes, so leave it for the page to show
    // as the model wrote it.
    if (end <= spoken.from || start >= spoken.to) return line;

    const wider = widen(start, end, blocks, duration);
    if (wider.end - wider.start <= end - start) return line;

    console.log(
      `[clip-scout] widened ${stamp(start)}-${stamp(end)} to ` +
        `${stamp(wider.start)}-${stamp(wider.end)}`,
    );
    return `${label}${stamp(wider.start)} to ${stamp(wider.end)}`;
  });
}

async function withRetries<T>(label: string, fn: (attempt: number) => Promise<T>): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      console.error(`[clip-scout] ${label} attempt ${attempt} failed: ${describe(err)}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw new Error(`${label} failed after 3 attempts: ${describe(lastErr)}`);
}

async function transcribe(bytes: Uint8Array, filename: string): Promise<Transcript> {
  const form = new FormData();
  form.append('file', new Blob([bytes as unknown as BlobPart]), filename);

  const response = await withRetries('transcription', () =>
    fetch(WHISPER_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(780_000),
      keepalive: false,
    }),
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Transcription failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as Transcript;
}

async function pickClips(transcript: string, duration: number): Promise<string> {
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Recording length: ${stamp(duration)}.\n\nTranscript:\n${transcript}`,
      },
    ],
    max_tokens: 900,
    temperature: 0.4,
    chat_template_kwargs: { enable_thinking: false },
  });

  const response = await withRetries('clip selection', () =>
    fetch(VLLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', connection: 'close' },
      body,
      signal: AbortSignal.timeout(150_000),
      keepalive: false,
    }),
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Model request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const picks = payload.choices?.[0]?.message?.content?.trim();
  if (!picks) throw new Error('Model returned an empty response.');
  return picks;
}

export default async function handler(
  task: StartTaskMessage,
  ctx?: TaskContext,
): Promise<HandlerResult> {
  const part = task.requestParts?.[0];

  if (!part) {
    return {
      artifacts: [{ data: 'No recording received. Attach a video or audio file.', mimeType: 'text/markdown' }],
    };
  }

  ctx?.reportStatus('Reading the recording...');

  let bytes: Uint8Array | null = null;
  try {
    bytes = extractBytes(await ctx?.downloadInputArtifact(part));
  } catch (err) {
    console.error('[clip-scout] input download failed:', describe(err));
    return {
      artifacts: [{
        data: `Could not read the uploaded recording: ${describe(err)}`,
        mimeType: 'text/markdown',
      }],
    };
  }

  if (!bytes?.length) {
    return {
      artifacts: [{ data: 'The uploaded file was empty or unreadable.', mimeType: 'text/markdown' }],
    };
  }

  const filename = (part as { name?: string }).name ?? 'recording.mp4';
  console.log(`[clip-scout] ${filename}, ${(bytes.length / 1e6).toFixed(1)}MB`);

  ctx?.reportStatus('Transcribing...');
  let result: Transcript;
  try {
    result = await transcribe(bytes, filename);
  } catch (err) {
    console.error('[clip-scout] transcription failed:', describe(err));
    return {
      artifacts: [{
        data: `Could not transcribe that file. ${describe(err)}`,
        mimeType: 'text/markdown',
      }],
    };
  }

  const blocks = toBlocks(result.segments);
  const { text, trimmed } = renderTranscript(blocks);
  console.log(
    `[clip-scout] ${result.segments.length} segments -> ${blocks.length} blocks, ` +
      `${stamp(result.duration)} audio, ${text.length} chars${trimmed ? ' (trimmed)' : ''}`,
  );

  ctx?.reportStatus('Choosing the best moments...');
  const picks = enforceClipLength(
    await pickClips(text, result.duration),
    blocks,
    result.duration,
  );

  const note = trimmed
    ? '\n\n---\n\n_Recording was long enough that the middle was omitted before ranking. ' +
      'Split it if you want the middle considered._'
    : '';

  return {
    artifacts: [{ data: `${picks}${note}`, mimeType: 'text/markdown', outputId: 'clips' }],
  };
}
