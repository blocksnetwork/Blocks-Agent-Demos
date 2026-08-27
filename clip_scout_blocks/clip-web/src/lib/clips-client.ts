/**
 * Runs one job against the polling API: start the task, then poll for
 * snapshots until it lands. This replaces the old SSE stream — on serverless
 * hosts no invocation may outlive the agent's fifteen-minute run, so the
 * browser owns the clock and the taskId instead of a held connection.
 */

import type { ClipsEvent, StartResponse, StatusResponse } from "./protocol";

const POLL_INTERVAL_MS = 3000;

/** How many consecutive unanswered polls mean the connection is gone. */
const MAX_MISSED_POLLS = 5;

/**
 * The handler reports "Reading the recording..." as soon as it picks a task
 * up. Total silence for this long means nothing is listening.
 */
const SILENCE_TIMEOUT_MS = 60_000;

/** The agent card's own ceiling — past this it would be killed mid-run anyway. */
const HARD_TIMEOUT_MS = 900_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(done, ms);
    function done() {
      clearTimeout(id);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

export async function runClips(
  audio: Blob,
  filename: string,
  signal: AbortSignal,
  onEvent: (event: ClipsEvent) => void,
): Promise<void> {
  const form = new FormData();
  form.append("recording", audio, filename);

  const response = await fetch("/api/clips/start", { method: "POST", body: form, signal });

  let started: StartResponse;
  try {
    started = (await response.json()) as StartResponse;
  } catch {
    throw new Error(`The start request failed (${response.status}).`);
  }

  if ("error" in started) {
    onEvent({ type: "error", ...started.error });
    return;
  }

  const { taskId, queued } = started;
  onEvent({ type: "accepted", taskId, queued });

  // The user starting over or closing the tab should not leave the task
  // running. keepalive lets the request outlive the page.
  const cancelTask = () => {
    void fetch("/api/clips/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
      keepalive: true,
    }).catch(() => {});
  };
  signal.addEventListener("abort", cancelTask);

  const finish = (event: ClipsEvent | null) => {
    signal.removeEventListener("abort", cancelTask);
    if (event) onEvent(event);
  };

  const startedAt = Date.now();
  let sawProgress = false;
  let missedPolls = 0;

  for (;;) {
    await sleep(POLL_INTERVAL_MS, signal);
    if (signal.aborted) {
      finish(null);
      return;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed >= HARD_TIMEOUT_MS) {
      finish({
        type: "error",
        kind: sawProgress ? "timeout" : "offline",
        message: sawProgress
          ? "The agent stopped after 15 minutes without a reply."
          : "The agent never picked the task up.",
      });
      return;
    }
    // A queued task is legitimately silent until the one ahead of it lands.
    if (!queued && !sawProgress && elapsed >= SILENCE_TIMEOUT_MS) {
      finish({
        type: "error",
        kind: "offline",
        message: "The agent never picked the task up.",
      });
      return;
    }

    let status: StatusResponse | null = null;
    try {
      const res = await fetch(`/api/clips/status?taskId=${encodeURIComponent(taskId)}`, {
        signal,
        cache: "no-store",
      });
      // Non-2xx snapshots are infrastructure hiccups, not task verdicts —
      // the route answers 200 for everything it actually knows.
      if (res.ok) status = (await res.json()) as StatusResponse;
    } catch {
      if (signal.aborted) {
        finish(null);
        return;
      }
    }

    if (!status) {
      missedPolls += 1;
      if (missedPolls >= MAX_MISSED_POLLS) {
        finish({
          type: "error",
          kind: "network",
          message: "The status endpoint stopped answering.",
        });
        return;
      }
      continue;
    }
    missedPolls = 0;

    switch (status.state) {
      case "running":
        if (status.message) sawProgress = true;
        if (status.phase) {
          onEvent({ type: "phase", phase: status.phase, message: status.message ?? "" });
        }
        break;
      case "completed":
        finish({ type: "result", markdown: status.markdown });
        return;
      case "failed":
        finish({ type: "error", kind: status.kind, message: status.message });
        return;
      case "canceled":
        finish({
          type: "error",
          kind: "generic",
          message: "The task was canceled before it finished.",
        });
        return;
    }
  }
}
