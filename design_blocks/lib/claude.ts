/**
 * Optional hosted authoring model. When ANTHROPIC_API_KEY is set, every
 * `chat()` call in lib/qwen.ts is routed here first — Claude writes the
 * composition specs, intents, critiques and directions instead of the
 * local 4B model, which stays as the fallback (and as the only path when
 * the key is absent, so the open-weights story still holds).
 *
 * The translation is deliberately narrow: OpenAI-style messages (as the
 * rest of the code speaks) become Anthropic messages, `image_url` data
 * URLs become base64 image blocks, and a vLLM `guided_json` schema becomes
 * a structured-output format. If the API rejects a schema (400), the same
 * request is retried as plain text and the caller's parse-and-validate
 * loop takes over — exactly what happens with an older vLLM.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlockParam, ImageBlockParam, MessageParam } from '@anthropic-ai/sdk/resources/messages';

const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5';

type LoosePart = { type?: string; text?: string; image_url?: { url?: string } };
type LooseMessage = { role?: string; content?: string | LoosePart[] };

let client: Anthropic | null = null;
/** schemas the API refused once — never send them again this process */
const rejectedSchemas = new WeakSet<object>();

export function claudeEnabled(): boolean {
  return API_KEY.length > 0 && process.env.DESIGN_LLM !== 'local';
}

export function claudeModel(): string {
  return MODEL;
}

function describe(err: unknown): string {
  const e = err as { message?: string; status?: number };
  return `${e?.status ? `HTTP ${e.status} ` : ''}${e?.message ?? String(err)}`.slice(0, 200);
}

function imageBlock(dataUrl: string): ImageBlockParam | null {
  const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  return {
    type: 'image',
    source: { type: 'base64', media_type: match[1] as ImageBlockParam['source'] extends { media_type: infer M } ? M : never, data: match[2] },
  };
}

function toBlocks(content: string | LoosePart[] | undefined): ContentBlockParam[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  const blocks: ContentBlockParam[] = [];
  for (const part of content ?? []) {
    if (part.type === 'image_url' && part.image_url?.url) {
      const block = imageBlock(part.image_url.url);
      if (block) blocks.push(block);
    } else if (typeof part.text === 'string') {
      blocks.push({ type: 'text', text: part.text });
    }
  }
  return blocks;
}

function plainText(content: string | LoosePart[] | undefined): string {
  if (typeof content === 'string') return content;
  return (content ?? []).map((p) => p.text ?? '').filter(Boolean).join('\n');
}

export type ClaudeOpts = {
  schema?: object;
  timeoutMs?: number;
};

/**
 * One completion, or null when Claude is disabled or unreachable — the
 * caller then falls through to the local model. Never throws.
 */
export async function claudeChat(messages: unknown[], maxTokens: number, opts: ClaudeOpts = {}): Promise<string | null> {
  if (!claudeEnabled()) return null;
  client ??= new Anthropic({ apiKey: API_KEY, maxRetries: 2 });

  const loose = messages as LooseMessage[];
  const system = loose.filter((m) => m.role === 'system').map((m) => plainText(m.content)).join('\n\n');
  const turns: MessageParam[] = loose
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: toBlocks(m.content) }));
  if (turns.length === 0 || turns[0].role !== 'user') turns.unshift({ role: 'user', content: 'Begin.' });

  // Callers size max_tokens for the 4B model; thinking shares the budget
  // here, so give the hosted model real headroom.
  const budget = Math.max(4096, maxTokens * 2);
  const useSchema = Boolean(opts.schema) && !rejectedSchemas.has(opts.schema!);

  const run = (withSchema: boolean) =>
    client!.messages.create(
      {
        model: MODEL,
        max_tokens: budget,
        ...(system ? { system } : {}),
        messages: turns,
        ...(withSchema && opts.schema
          ? { output_config: { format: { type: 'json_schema' as const, schema: opts.schema as Record<string, unknown> } } }
          : {}),
      },
      { timeout: opts.timeoutMs ?? 180_000 },
    );

  try {
    let response;
    try {
      response = await run(useSchema);
    } catch (err) {
      if (useSchema && err instanceof Anthropic.BadRequestError) {
        rejectedSchemas.add(opts.schema!);
        console.error(`[design-blocks] Claude rejected the JSON schema (${describe(err)}) — retrying as text`);
        response = await run(false);
      } else {
        throw err;
      }
    }
    const text = response.content
      .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (response.stop_reason === 'max_tokens') {
      console.error(`[design-blocks] Claude hit max_tokens (${budget}) — reply may be truncated`);
    }
    return text.length ? text : null;
  } catch (err) {
    console.error(`[design-blocks] Claude call failed: ${describe(err)}`);
    return null;
  }
}
