/**
 * Product understanding — the first half of design transfer.
 *
 * Before the agent can ask "what is the equivalent design move for THIS
 * product?", it needs to know what the product actually has to show: the
 * content that must exist, the data behind it and what each display is
 * FOR (progress? health? comparison?), and whether the domain offers a
 * strong visual subject that could carry the composition (a plant, a
 * topology graph, a garment, a map).
 *
 * The LLM writes this; a deterministic fallback keeps the pipeline alive
 * when vLLM is cold. Nothing here is layout — intent is WHAT, the
 * CompositionSpec decides HOW.
 */

import { chat } from './qwen.js';

/**
 * What a piece of data needs to COMMUNICATE — never which widget shows
 * it. "Four stat cards" is a decision the design planner makes later (or
 * refuses to make); the intent only records that, e.g., soil moisture is
 * a spatial condition of primary importance.
 */
export type DataDisplayIntent = {
  /** e.g. "communicate progress", "show spatial condition", "indicate system health" */
  intent: string;
  /** the entities measured: ["soil moisture", "light exposure"] */
  entities: string[];
  importance: 'primary' | 'secondary' | 'ambient';
};

export type ProductIntent = {
  /** free text: "plant-care journal", "AI infrastructure monitor" */
  productType: string;
  audience: string;
  /** content the page must carry, in priority order */
  contentInventory: string[];
  dataDisplays: DataDisplayIntent[];
  /**
   * A domain-specific visual subject that could act as a structural
   * object in the composition — null when the domain offers none.
   */
  primarySubject: string | null;
  /** text-to-image prompt seed for that subject (no text/letters/logos) */
  subjectImagePrompt: string | null;
  tone: string[];
};

const IMPORTANCE = new Set(['primary', 'secondary', 'ambient']);

function words(brief: string): string[] {
  return brief
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3);
}

/** Deterministic floor: enough intent to design from, straight off the brief. */
export function fallbackIntent(brief: string): ProductIntent {
  const w = words(brief);
  const subject = w[0] ?? null;
  return {
    productType: brief.split(/[—,.]/)[0].slice(0, 80) || 'web product',
    audience: 'people evaluating the product',
    contentInventory: ['headline and value proposition', 'primary action', 'supporting details', 'trust signals'],
    dataDisplays: [
      { intent: 'communicate the core value at a glance', entities: w.slice(0, 2), importance: 'primary' },
      { intent: 'show recent activity or momentum', entities: w.slice(2, 4), importance: 'secondary' },
    ],
    primarySubject: subject,
    subjectImagePrompt: subject
      ? `${subject}, single subject, studio lighting, plain solid background, high detail, no text, no letters, no watermark`
      : null,
    tone: w.slice(0, 3),
  };
}

function asStringArray(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0).slice(0, max)
    : [];
}

/** LLM-derived product intent, sanitized field by field; never throws. */
export async function deriveIntent(brief: string): Promise<ProductIntent> {
  const fallback = fallbackIntent(brief);

  const reply = await chat(
    [
      {
        role: 'system',
        content:
          'You analyze a product brief for a design planner. Reply with ONLY JSON: ' +
          '{"product_type": "<what this product is, 3-8 words>", ' +
          '"audience": "<who uses it>", ' +
          '"content_inventory": ["<4-7 pieces of content the page must carry, priority order>"], ' +
          '"data_displays": [{"intent": "<what this data must COMMUNICATE, e.g. communicate progress / show spatial condition / indicate system health / compare magnitudes / show change over time>", "entities": ["<what is measured>"], "importance": "primary|secondary|ambient"}] with 2-4 entries, ' +
          '"primary_subject": "<ONE concrete domain object that could be a large structural visual (a plant, a network topology, a running shoe, a city map) — or null if the domain has none>", ' +
          '"subject_image_prompt": "<text-to-image prompt for that subject on a plain background, or null. Never mention text, letters, or logos>", ' +
          '"tone": ["<3 adjectives>"]}',
      },
      { role: 'user', content: `Brief: ${brief}` },
    ],
    500,
  );
  if (!reply) return fallback;

  try {
    const cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const displays = Array.isArray(parsed.data_displays)
      ? (parsed.data_displays as Array<Record<string, unknown>>)
          .filter((d) => typeof d.intent === 'string')
          .slice(0, 4)
          .map((d) => ({
            intent: d.intent as string,
            entities: asStringArray(d.entities, 4),
            importance: IMPORTANCE.has(d.importance as string)
              ? (d.importance as DataDisplayIntent['importance'])
              : 'secondary',
          }))
      : [];
    // The model answering null is a DECISION ("this domain has no visual
    // subject") and must survive — only an absent/garbled field falls
    // back to the guess.
    const subjectRaw = parsed.primary_subject;
    const declinedSubject = subjectRaw === null || (typeof subjectRaw === 'string' && subjectRaw.toLowerCase() === 'null');
    const subject = typeof subjectRaw === 'string' && !declinedSubject ? subjectRaw : null;
    const subjectPrompt = declinedSubject
      ? null
      : typeof parsed.subject_image_prompt === 'string' && subject
        ? `${parsed.subject_image_prompt.replace(/\b(text|typography|letters?|words?|logo)\b/gi, 'shapes')}, no text, no letters, no watermark`
        : fallback.subjectImagePrompt;
    return {
      productType: typeof parsed.product_type === 'string' ? parsed.product_type : fallback.productType,
      audience: typeof parsed.audience === 'string' ? parsed.audience : fallback.audience,
      contentInventory: asStringArray(parsed.content_inventory, 7).length
        ? asStringArray(parsed.content_inventory, 7)
        : fallback.contentInventory,
      dataDisplays: displays.length ? displays : fallback.dataDisplays,
      primarySubject: declinedSubject ? null : (subject ?? fallback.primarySubject),
      subjectImagePrompt: subjectPrompt,
      tone: asStringArray(parsed.tone, 3).length ? asStringArray(parsed.tone, 3) : fallback.tone,
    };
  } catch {
    console.error(`[design-blocks] intent reply was not JSON: ${reply.slice(0, 80)}`);
    return fallback;
  }
}
