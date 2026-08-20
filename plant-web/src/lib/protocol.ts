/** The wire format between the diagnose route and the browser. */

export type FailureKind = "offline" | "network" | "timeout" | "generic";

export type DiagnoseEvent =
  | { type: "accepted"; taskId: string; queued: boolean }
  | { type: "phase"; phase: "reading" | "asking"; message: string }
  | { type: "result"; markdown: string }
  | { type: "error"; kind: FailureKind; message: string };
