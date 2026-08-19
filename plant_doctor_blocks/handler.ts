import type { StartTaskMessage, TaskContext, HandlerResult } from '@blocks-network/sdk';

const VLLM_URL = process.env.VLLM_URL ?? 'http://localhost:8000/v1/chat/completions';
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
    return {
      artifacts: [{
        data: `Could not read the uploaded image: ${(err as Error).message}`,
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

  ctx?.reportStatus('Asking the model...');

  const response = await fetch(VLLM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
      // Qwen3.5 emits chain-of-thought unless this is off, which leaks
      // raw reasoning into the artifact.
      chat_template_kwargs: { enable_thinking: false },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Model request failed (${response.status}): ${detail.slice(0, 400)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const diagnosis = payload.choices?.[0]?.message?.content?.trim();

  if (!diagnosis) {
    throw new Error('Model returned an empty response.');
  }

  return {
    artifacts: [{ data: diagnosis, mimeType: 'text/markdown', outputId: 'diagnosis' }],
  };
}
