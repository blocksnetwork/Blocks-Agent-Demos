/**
 * The two jobs Qwen3.5-4B does here, over the same vLLM endpoint the
 * other demos use. At ingest time it looks at each reference image and
 * writes the vibe/tags/notes the bank indexes. At query time it turns the
 * matched references into a short, opinionated design direction — with a
 * deterministic fallback so a cold vLLM never kills a task.
 */

import type { BankEntry } from './bank.js';
import { claudeChat, claudeEnabled } from './claude.js';

const VLLM_URL = process.env.VLLM_URL ?? 'http://127.0.0.1:8000/v1/chat/completions';
const MODEL = process.env.VLLM_MODEL ?? 'Qwen/Qwen3.5-4B';

export type ImageTags = { vibe: string; tags: string[]; notes: string };

function describe(err: unknown): string {
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  const cause = e?.cause ? ` cause=${e.cause.code ?? ''} ${e.cause.message ?? ''}`.trim() : '';
  return `${e?.message ?? String(err)}${cause ? ` (${cause})` : ''}`;
}

export type ChatOpts = {
  /**
   * JSON Schema for vLLM guided decoding (`guided_json`) — syntactic
   * validity by construction instead of parse-and-pray. If the server
   * rejects the constraint (older vLLM), the call retries unguided.
   */
  guidedJson?: object;
  /** per-attempt timeout; long generations on a T4 need more than 120s */
  timeoutMs?: number;
  /** transport retries (default 3) — callers with their own retry loop pass 1 */
  attempts?: number;
};

/**
 * Best-effort JSON from a model reply: tolerate markdown fences (with
 * leading whitespace), then fall back to the outermost brace span.
 * Null when nothing parseable remains (e.g. truncated generations).
 */
export function parseJsonReply(reply: string): unknown | null {
  const cleaned = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function chat(messages: unknown[], maxTokens: number, opts: ChatOpts = {}): Promise<string | null> {
  // Hosted authoring model first (ANTHROPIC_API_KEY); the local 4B model
  // is the fallback for every call, so a missing key or a failed request
  // degrades to exactly the old behaviour.
  if (claudeEnabled()) {
    const reply = await claudeChat(messages, maxTokens, { schema: opts.guidedJson, timeoutMs: opts.timeoutMs });
    if (reply !== null) return reply;
    console.error('[design-blocks] Claude unavailable — falling back to local vLLM');
  }
  const bodyFor = (guided: boolean) =>
    JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.4,
      chat_template_kwargs: { enable_thinking: false },
      ...(guided && opts.guidedJson ? { guided_json: opts.guidedJson } : {}),
    });

  let guided = Boolean(opts.guidedJson);
  const maxAttempts = Math.max(1, opts.attempts ?? 3);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(VLLM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', connection: 'close' },
        body: bodyFor(guided),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
        keepalive: false,
      });
      if (!response.ok) {
        const detail = await response.text();
        // A 4xx while guided usually means the server can't take
        // guided_json — drop the constraint rather than the task.
        if (guided && response.status >= 400 && response.status < 500) {
          console.error(`[design-blocks] vLLM rejected guided_json (${response.status}) — retrying unguided`);
          guided = false;
          continue;
        }
        throw new Error(`vLLM returned ${response.status}: ${detail.slice(0, 200)}`);
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return payload.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      console.error(`[design-blocks] vLLM attempt ${attempt} failed: ${describe(err)}`);
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return null;
}

/** Ingest-time: describe one reference image for the index. */
export async function tagImage(bytes: Uint8Array, mimeType: string): Promise<ImageTags | null> {
  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
  const reply = await chat(
    [
      {
        role: 'system',
        content:
          'You describe reference designs for a searchable moodboard. Reply with ONLY a JSON object: ' +
          '{"vibe": "<3-6 words, e.g. dark glassy fintech>", ' +
          '"tags": ["<8-12 single words: industry, layout, mood, era, color family>"], ' +
          '"notes": "<2 sentences: what makes this design work, concretely>"}',
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: 'Describe this reference design.' },
        ],
      },
    ],
    300,
  );
  if (!reply) return null;
  try {
    const cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned) as Partial<ImageTags>;
    return {
      vibe: typeof parsed.vibe === 'string' ? parsed.vibe : 'unlabeled',
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === 'string') : [],
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    };
  } catch {
    console.error(`[design-blocks] tagger reply was not JSON: ${reply.slice(0, 80)}`);
    return null;
  }
}

/** Query-time: turn the matched references into a design direction. */
export async function writeDirection(
  brief: string,
  refs: BankEntry[],
  fonts: { display: string; body: string },
): Promise<string> {
  const refLines = refs
    .map((r, i) => `${i + 1}. vibe: ${r.vibe}; tags: ${r.tags.join(', ')}; notes: ${r.notes}`)
    .join('\n');

  const reply = refs.length
    ? await chat(
        [
          {
            role: 'system',
            content:
              'You are an art director briefing a coding agent that is about to build a web UI. ' +
              'From the brief and the matched reference designs, write a design direction in markdown: ' +
              'a two-sentence overall direction, then 5-7 bullet points of concrete, buildable guidance ' +
              '(layout shape, color usage, typography attitude, spacing feel, one signature detail to steal ' +
              'from the references). No preamble, no code blocks, under 220 words.',
          },
          {
            role: 'user',
            content: `Brief: ${brief}\nChosen fonts: ${fonts.display} for display, ${fonts.body} for body.\n\nMatched references:\n${refLines}`,
          },
        ],
        450,
      )
    : null;

  if (reply) return reply;

  // Deterministic fallback: the stored reference notes are direction too.
  const bullets = refs.slice(0, 5).map((r) => `- **${r.vibe}** — ${r.notes || r.tags.join(', ')}`);
  return [
    `Direction for: ${brief || 'your app'}.`,
    '',
    ...(bullets.length ? bullets : ['- The bank is empty — ingest some references to get real direction.']),
    `- Set headings in ${fonts.display}, body in ${fonts.body}; apply the theme tokens for color and spacing.`,
  ].join('\n');
}
