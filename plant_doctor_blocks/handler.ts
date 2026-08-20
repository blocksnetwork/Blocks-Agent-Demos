import type { StartTaskMessage, TaskContext, HandlerResult } from '@blocks-network/sdk';

const VLLM_URL = process.env.VLLM_URL ?? 'http://127.0.0.1:8000/v1/chat/completions';
const MODEL = process.env.VLLM_MODEL ?? 'Qwen/Qwen3.5-4B';

const SYSTEM_PROMPT = `You are Plant Doctor, an experienced horticulturist.

Look at the photo and reply in markdown with exactly these sections:

**Diagnosis** - the single most likely problem, named plainly.
**Confidence** - high, medium, or low, and what would raise it.
**Why** - the visual evidence in the photo that led you there.
**Fix** - numbered steps the owner can do this week.

If the photo does not show a plant, say so in one line and stop.
Never invent detail you cannot see. If the leaves are out of focus or
cropped out, say the photo is not diagnosable and describe what to
re-shoot.`;

function extractBytes(downloaded: unknown): Uint8Array | null {
  if (!downloaded) return null;
  if (downloaded instanceof Uint8Array) return downloaded;
  const data = (downloaded as { data?: unknown }).data;
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return Buffer.from(data, 'base64');
  return null;
}

function describe(err: unknown): string {
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  const cause = e?.cause ? ` cause=${e.cause.code ?? ''} ${e.cause.message ?? ''}`.trim() : '';
  return `${e?.message ?? String(err)}${cause ? ` (${cause})` : ''}`;
}

async function askModel(body: string, attempt: number): Promise<Response> {
  return fetch(VLLM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', connection: 'close' },
    body,
    signal: AbortSignal.timeout(150_000),
    // A pooled keep-alive socket that vLLM has already closed surfaces as
    // a bare "fetch failed", so each attempt uses a fresh connection.
    keepalive: false,
  }).catch((err) => {
    console.error(`[plant-doctor] model fetch attempt ${attempt} failed: ${describe(err)}`);
    throw err;
  });
}

export default async function handler(
  task: StartTaskMessage,
  ctx?: TaskContext,
): Promise<HandlerResult> {
  const part = task.requestParts?.[0];

  if (!part) {
    return {
      artifacts: [{ data: 'No photo received. Attach an image of the plant.', mimeType: 'text/markdown' }],
    };
  }

  ctx?.reportStatus('Reading the photo...');

  let bytes: Uint8Array | null = null;
  try {
    bytes = extractBytes(await ctx?.downloadInputArtifact(part));
  } catch (err) {
    console.error('[plant-doctor] input download failed:', describe(err));
    return {
      artifacts: [{
        data: `Could not read the uploaded image: ${describe(err)}`,
        mimeType: 'text/markdown',
      }],
    };
  }

  if (!bytes?.length) {
    return {
      artifacts: [{ data: 'The uploaded file was empty or unreadable.', mimeType: 'text/markdown' }],
    };
  }

  const mimeType = (part as { mimeType?: string }).mimeType ?? 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;

  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: 'Diagnose this plant.' },
        ],
      },
    ],
    max_tokens: 700,
    temperature: 0.3,
    chat_template_kwargs: { enable_thinking: false },
  });

  ctx?.reportStatus('Asking the model...');
  console.log(`[plant-doctor] image ${bytes.length}B, body ${body.length}B -> ${VLLM_URL}`);

  let response: Response | null = null;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await askModel(body, attempt);
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  if (!response) {
    throw new Error(`Could not reach the model after 3 attempts: ${describe(lastErr)}`);
  }

  if (!response.ok) {
    const detail = await response.text();
    console.error(`[plant-doctor] model returned ${response.status}: ${detail.slice(0, 300)}`);
    throw new Error(`Model request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const diagnosis = payload.choices?.[0]?.message?.content?.trim();

  if (!diagnosis) {
    throw new Error('Model returned an empty response.');
  }

  console.log(`[plant-doctor] ok, ${diagnosis.length} chars`);

  return {
    artifacts: [{ data: diagnosis, mimeType: 'text/markdown', outputId: 'diagnosis' }],
  };
}
