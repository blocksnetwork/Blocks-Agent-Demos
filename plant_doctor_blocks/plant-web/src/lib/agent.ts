/**
 * Server-side helpers shared by the diagnose API routes. The routes are
 * stateless — the browser holds the taskId and every invocation opens a
 * fresh client — so everything here has to work from scratch on each call.
 */

import type { FailureKind } from "./protocol";

export const AGENT_NAME = "plant_doctor_blocks";

export function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Sorts a failure into one of the four the UI can speak to. The wording the
 * user sees is fixed per kind, so this only has to pick the right bucket.
 */
export function classify(reason: string): FailureKind {
  if (/could not reach the model|econnrefused|model request failed|vllm/i.test(reason)) {
    return "offline";
  }
  if (/timed? ?out|timeout|abort|deadline/i.test(reason)) return "timeout";
  if (/fetch failed|network|enotfound|econnreset|socket|dns|getaddrinfo/i.test(reason)) {
    return "network";
  }
  return "generic";
}

export function phaseOf(message: string | undefined | null): "reading" | "asking" | null {
  if (!message) return null;
  if (/reading/i.test(message)) return "reading";
  if (/asking|model/i.test(message)) return "asking";
  return null;
}
