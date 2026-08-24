/** The wire format between the hooks route and the browser. */

export type FailureKind =
  | "config"
  | "offline"
  | "network"
  | "timeout"
  | "nospeech"
  | "toolong"
  | "generic";

/**
 * Kinds whose fixed copy cannot name the cause, so the underlying reason is
 * worth showing verbatim. For the rest it would only repeat what the page
 * already says in better words.
 */
export const SHOW_DETAIL: ReadonlySet<FailureKind> = new Set<FailureKind>([
  "config",
  "generic",
]);

/** The three status updates the handler reports, in the order it reports them. */
export type Phase = "reading" | "transcribing" | "ranking";

export type HooksEvent =
  | { type: "accepted"; taskId: string; queued: boolean }
  | { type: "phase"; phase: Phase; message: string }
  | { type: "result"; markdown: string }
  | { type: "error"; kind: FailureKind; message: string };
