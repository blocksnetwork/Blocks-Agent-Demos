import {
  TaskClient,
  decodeInlineArtifact,
  filePart,
  type ArtifactEvent,
  type ProgressEvent,
  type TaskSession,
  type TerminalEvent,
} from "@blocks-network/sdk";

import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "@/lib/limits";
import type { FailureKind, HooksEvent, Phase } from "@/lib/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

const AGENT_NAME = "hook_finder_blocks";

/** The agent card's own ceiling — past this it would be killed mid-run anyway. */
const HARD_TIMEOUT_MS = 900_000;

/**
 * The handler reports "Reading the recording..." as soon as it picks a task up.
 * Total silence for this long means nothing is listening on the other end.
 */
const SILENCE_TIMEOUT_MS = 60_000;

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Sorts a failure into one of the kinds the UI can speak to. The wording the
 * user sees is fixed per kind, so this only has to pick the right bucket.
 */
function classify(reason: string): FailureKind {
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
function phaseOf(message: string | undefined): Phase | null {
  if (!message) return null;
  if (/reading/i.test(message)) return "reading";
  if (/transcrib/i.test(message)) return "transcribing";
  if (/moment|choosing|rank/i.test(message)) return "ranking";
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamOpen = true;
      let settled = false;
      let sawProgress = false;
      let client: TaskClient | null = null;
      let session: TaskSession | null = null;
      const timers: Array<ReturnType<typeof setTimeout>> = [];

      const send = (event: HooksEvent) => {
        if (!streamOpen) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const teardown = () => {
        timers.forEach(clearTimeout);
        timers.length = 0;
        try {
          session?.close();
        } catch {
          // Already closed by the terminal event.
        }
        client?.destroy();
        session = null;
        client = null;
      };

      const close = () => {
        if (!streamOpen) return;
        streamOpen = false;
        controller.close();
      };

      const fail = (kind: FailureKind, message: string) => {
        if (settled) return;
        settled = true;
        send({ type: "error", kind, message });
        teardown();
        close();
      };

      const succeed = (markdown: string) => {
        if (settled) return;
        settled = true;
        send({ type: "result", markdown });
        teardown();
        close();
      };

      // Closing the tab mid-run should not leave the task running on the box.
      request.signal.addEventListener("abort", () => {
        if (settled) return;
        settled = true;
        session?.cancel().catch(() => {});
        teardown();
        close();
      });

      const apiKey = process.env.BLOCKS_API_KEY;
      if (!apiKey) {
        fail(
          "config",
          "BLOCKS_API_KEY is not set. Copy .env.example to .env.local and restart.",
        );
        return;
      }

      let recording: File;
      try {
        const form = await request.formData();
        const field = form.get("recording");
        if (!(field instanceof File)) {
          fail("generic", "No recording was attached to the request.");
          return;
        }
        recording = field;
      } catch (err) {
        fail("network", describe(err));
        return;
      }

      // The browser already stripped the video and compressed the audio, so
      // anything outside this list means the client-side pipeline was skipped.
      if (!UPLOAD_TYPES.includes(recording.type)) {
        fail("generic", `${recording.type || "That file type"} is not an audio upload.`);
        return;
      }
      if (recording.size > MAX_UPLOAD_BYTES) {
        fail("generic", "That recording is over the 25MB limit.");
        return;
      }

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await recording.arrayBuffer());
      } catch (err) {
        fail("generic", describe(err));
        return;
      }

      try {
        client = await TaskClient.create({ billingMode: "free", apiKey });
      } catch (err) {
        fail(classify(describe(err)), describe(err));
        return;
      }

      try {
        session = await client.sendMessage({
          agentName: AGENT_NAME,
          requestParts: [
            filePart(bytes, {
              partId: "recording",
              contentType: recording.type,
              fileName: recording.name || "recording",
            }),
          ],
        });
      } catch (err) {
        fail(classify(describe(err)), describe(err));
        return;
      }

      const active = session;
      const queued = Boolean(active.queued);
      send({ type: "accepted", taskId: active.taskId, queued });

      // onTerminal can fire while the artifact download is still in flight,
      // so hold the artifact work and drain it before deciding the outcome.
      const pending: Array<Promise<void>> = [];

      active.onProgress((event: ProgressEvent) => {
        sawProgress = true;
        const phase = phaseOf(event.message);
        if (phase) send({ type: "phase", phase, message: event.message ?? "" });
      });

      active.onArtifact((event: ArtifactEvent) => {
        pending.push(
          (async () => {
            const ref = event.artifactRef;
            const data =
              ref.kind === "inline" && ref.data
                ? decodeInlineArtifact(ref)
                : (await active.downloadArtifact(ref)).data;
            succeed(new TextDecoder().decode(data));
          })().catch((err) => fail("generic", describe(err))),
        );
      });

      active.onTerminal(async (event: TerminalEvent) => {
        await Promise.allSettled(pending);
        if (settled) return;

        if (event.state === "failed") {
          const reason = String(event.error ?? event.reason ?? "The task failed.");
          fail(classify(reason), reason);
          return;
        }
        if (event.state === "canceled") {
          fail("generic", "The task was canceled before it finished.");
          return;
        }
        fail("generic", "The task finished without returning any clips.");
      });

      // A queued task is legitimately silent until the one ahead of it lands.
      if (!queued) {
        timers.push(
          setTimeout(() => {
            if (!sawProgress) fail("offline", "The agent never picked the task up.");
          }, SILENCE_TIMEOUT_MS),
        );
      }

      timers.push(
        setTimeout(() => {
          fail(
            sawProgress ? "timeout" : "offline",
            sawProgress
              ? "The agent stopped after 15 minutes without a reply."
              : "The agent never picked the task up.",
          );
        }, HARD_TIMEOUT_MS),
      );
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
