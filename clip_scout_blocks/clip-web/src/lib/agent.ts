/**
 * Server-side helpers shared by the clips API routes. The routes are
 * stateless — the browser holds the taskId and every invocation opens a
 * fresh client — so everything here has to work from scratch on each call.
 */

import type { FailureKind, Phase } from "./protocol";

export const AGENT_NAME = "hook_finder_blocks";

export function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Sorts a failure into one of the kinds the UI can speak to. The wording the
 * user sees is fixed per kind, so this only has to pick the right bucket.
 */
export function classify(reason: string): FailureKind {
  // A rejected or absent key never reaches the GPU box, so it must not be
  // reported as though the box were the problem.
  if (
    /api[- ]?key|unauthor|forbidden\b|\b40[13]\b|organization for this|not logged in|invalid token/i.test(
      reason,
    )
  ) {
    return "config";
  }
  if (/agent .*not found|unknown agent|no such agent|not registered/i.test(reason)) {
    return "config";
  }
  if (/no speech found|could not decode media/i.test(reason)) return "nospeech";
  if (/context length|too many tokens|maximum context/i.test(reason)) return "toolong";
  if (
    /could not reach the model|econnrefused|model request failed|transcription failed|vllm|whisper/i.test(
      reason,
    )
  ) {
    return "offline";
  }
  if (/timed? ?out|timeout|abort|deadline/i.test(reason)) return "timeout";
  if (/fetch failed|network|enotfound|econnreset|socket|dns|getaddrinfo/i.test(reason)) {
    return "network";
  }
  return "generic";
}

/** Maps the handler's three status lines onto the three steps the page draws. */
export function phaseOf(message: string | undefined | null): Phase | null {
  if (!message) return null;
  if (/reading/i.test(message)) return "reading";
  if (/transcrib/i.test(message)) return "transcribing";
  if (/moment|choosing|rank/i.test(message)) return "ranking";
  return null;
}
