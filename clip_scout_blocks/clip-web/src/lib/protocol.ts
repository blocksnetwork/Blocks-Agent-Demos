/** The wire format between the clips routes and the browser. */

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

/** What POST /api/clips/start returns. */
export type StartResponse =
  | { taskId: string; queued: boolean }
  | { error: { kind: FailureKind; message: string } };

/**
 * One GET /api/clips/status snapshot. Each poll reconnects to the task from
 * scratch, so a snapshot always carries everything the panel needs — there
 * is no event the browser can afford to miss between polls.
 */
export type StatusResponse =
  | { state: "running"; phase: Phase | null; message: string | null }
  | { state: "completed"; markdown: string }
  | { state: "canceled" }
  | { state: "failed"; kind: FailureKind; message: string };

/** What the polling client reports up to the page. */
export type ClipsEvent =
  | { type: "accepted"; taskId: string; queued: boolean }
  | { type: "phase"; phase: Phase; message: string }
  | { type: "result"; markdown: string }
  | { type: "error"; kind: FailureKind; message: string };
