import type { StartTaskMessage, TaskContext, HandlerResult } from '@blocks-network/sdk';

const WHISPER_URL = process.env.WHISPER_URL ?? 'http://127.0.0.1:8001/transcribe';
const VLLM_URL = process.env.VLLM_URL ?? 'http://127.0.0.1:8000/v1/chat/completions';
const MODEL = process.env.VLLM_MODEL ?? 'Qwen/Qwen3.5-4B';

// Qwen3.5-4B is served with a 16k window. Reserve room for the prompt and the
// reply, then trim the transcript from the middle if it is still too long.
const MAX_TRANSCRIPT_CHARS = 34_000;

const SYSTEM_PROMPT = `You pick short-form clips out of long recordings.

You are given a timestamped transcript. Choose the THREE strongest moments that
would stand alone as a vertical short. A strong moment makes a claim, shows a
result, reacts to something, or says a number out loud. Ignore setup, throat
clearing, and anything that only makes sense with prior context.

Reply in markdown. For each pick, in rank order:

### 1. <title, max 8 words>
**Timestamp** - MM:SS to MM:SS (aim for 20-45 seconds)
**Quote** - the single best sentence, verbatim from the transcript
**Caption** - one line to post it with, no hashtags
**Why** - one sentence on why this holds attention

Use only timestamps that exist in the transcript. Never invent a quote: every
quote must appear verbatim. If the recording has fewer than three usable
moments, return only the ones that qualify and say why the rest fall short.`;

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

/** Render segments as "MM:SS text", dropping the middle if it overruns. */
function renderTranscript(segments: Segment[]): { text: string; trimmed: boolean } {
  const lines = segments.map((s) => `${stamp(s.start)} ${s.text}`);
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

async function withRetries<T>(label: string, fn: (attempt: number) => Promise<T>): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      console.error(`[hook-finder] ${label} attempt ${attempt} failed: ${describe(err)}`);
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
    console.error('[hook-finder] input download failed:', describe(err));
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
  console.log(`[hook-finder] ${filename}, ${(bytes.length / 1e6).toFixed(1)}MB`);

  ctx?.reportStatus('Transcribing...');
  let result: Transcript;
  try {
    result = await transcribe(bytes, filename);
  } catch (err) {
    console.error('[hook-finder] transcription failed:', describe(err));
    return {
      artifacts: [{
        data: `Could not transcribe that file. ${describe(err)}`,
        mimeType: 'text/markdown',
      }],
    };
  }

  const { text, trimmed } = renderTranscript(result.segments);
  console.log(
    `[hook-finder] ${result.segments.length} segments, ${stamp(result.duration)} audio, ` +
      `${text.length} chars${trimmed ? ' (trimmed)' : ''}`,
  );

  ctx?.reportStatus('Choosing the best moments...');
  const picks = await pickClips(text, result.duration);

  const note = trimmed
    ? '\n\n---\n\n_Recording was long enough that the middle was omitted before ranking. ' +
      'Split it if you want the middle considered._'
    : '';

  return {
    artifacts: [{ data: `${picks}${note}`, mimeType: 'text/markdown', outputId: 'clips' }],
  };
}
