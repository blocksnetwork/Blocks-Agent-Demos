/** The wire format between the diagnose routes and the browser. */

export type FailureKind = "offline" | "network" | "timeout" | "generic";

/** What POST /api/diagnose/start returns. */
export type StartResponse =
  | { taskId: string; queued: boolean }
  | { error: { kind: FailureKind; message: string } };

/**
 * One GET /api/diagnose/status snapshot. Each poll reconnects to the task
 * from scratch, so a snapshot always carries everything the panel needs —
 * there is no event the browser can afford to miss between polls.
 */
export type StatusResponse =
  | { state: "running"; phase: "reading" | "asking" | null; message: string | null }
  | { state: "completed"; markdown: string }
  | { state: "canceled" }
  | { state: "failed"; kind: FailureKind; message: string };

/** What the polling client reports up to the page. */
export type DiagnoseEvent =
  | { type: "accepted"; taskId: string; queued: boolean }
  | { type: "phase"; phase: "reading" | "asking"; message: string }
  | { type: "result"; markdown: string }
  | { type: "error"; kind: FailureKind; message: string };
