import {
  TaskClient,
  decodeInlineArtifact,
  filePart,
  type ArtifactEvent,
  type ProgressEvent,
  type TaskSession,
  type TerminalEvent,
} from "@blocks-network/sdk";

import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/limits";
import type { DiagnoseEvent, FailureKind } from "@/lib/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AGENT_NAME = "plant_doctor_blocks";

/** The agent card's own ceiling — past this it would be killed mid-run anyway. */
const HARD_TIMEOUT_MS = 180_000;

/**
 * The handler reports "Reading the photo..." within a second of picking a task
 * up. Total silence for this long means nothing is listening on the other end.
 */
const SILENCE_TIMEOUT_MS = 45_000;

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Sorts a failure into one of the four the UI can speak to. The wording the
 * user sees is fixed per kind, so this only has to pick the right bucket.
 */
function classify(reason: string): FailureKind {
  if (/could not reach the model|econnrefused|model request failed|vllm/i.test(reason)) {
    return "offline";
  }
  if (/timed? ?out|timeout|abort|deadline/i.test(reason)) return "timeout";
  if (/fetch failed|network|enotfound|econnreset|socket|dns|getaddrinfo/i.test(reason)) {
    return "network";
  }
  return "generic";
}

function phaseOf(message: string | undefined): "reading" | "asking" | null {
  if (!message) return null;
  if (/reading/i.test(message)) return "reading";
  if (/asking|model/i.test(message)) return "asking";
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

      const send = (event: DiagnoseEvent) => {
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

      // The browser closing the tab mid-run should not leave the task running.
      request.signal.addEventListener("abort", () => {
        if (settled) return;
        settled = true;
        session?.cancel().catch(() => {});
        teardown();
        close();
      });

      const apiKey = process.env.BLOCKS_API_KEY;
      if (!apiKey) {
        fail("generic", "BLOCKS_API_KEY is not set on the server.");
        return;
      }

      let photo: File;
      try {
        const form = await request.formData();
        const field = form.get("photo");
        if (!(field instanceof File)) {
          fail("generic", "No photo was attached to the request.");
          return;
        }
        photo = field;
      } catch (err) {
        fail("network", describe(err));
        return;
      }

      if (!ACCEPTED_TYPES.includes(photo.type)) {
        fail("generic", `${photo.type || "That file type"} is not a supported image.`);
        return;
      }
      if (photo.size > MAX_UPLOAD_BYTES) {
        fail("generic", "That photo is over the 10 MB limit.");
        return;
      }

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await photo.arrayBuffer());
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
              partId: "photo",
              contentType: photo.type,
              fileName: photo.name || "photo",
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
        fail("generic", "The task finished without returning a diagnosis.");
      });

      // A queued task is legitimately silent until the one ahead of it lands.
      if (!queued) {
        timers.push(
          setTimeout(() => {
            if (!sawProgress) {
              fail("offline", "The agent never picked the task up.");
            }
          }, SILENCE_TIMEOUT_MS),
        );
      }

      timers.push(
        setTimeout(() => {
          fail(
            sawProgress ? "timeout" : "offline",
            sawProgress
              ? "The agent stopped after 180 seconds without a reply."
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
