import { TaskClient, decodeInlineArtifact } from "@blocks-network/sdk";

import { classify, describe, phaseOf } from "@/lib/agent";
import type { StatusResponse } from "@/lib/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 200 means an authoritative snapshot — including "the task failed". Any
 * other status is an infrastructure hiccup the browser should ride out,
 * never a verdict on the task.
 */
function snapshot(body: StatusResponse, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * One stateless look at a task. connect() pre-populates the session with the
 * task's history — progress messages, artifacts, terminal state — so a single
 * short call answers "where is it now?" without holding a connection open.
 */
export async function GET(request: Request): Promise<Response> {
  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!taskId) {
    return snapshot({ state: "failed", kind: "generic", message: "Missing taskId." }, 400);
  }

  const apiKey = process.env.BLOCKS_API_KEY;
  if (!apiKey) {
    return snapshot(
      { state: "failed", kind: "generic", message: "BLOCKS_API_KEY is not set on the server." },
      500,
    );
  }

  let client: TaskClient;
  try {
    client = await TaskClient.create({ billingMode: "free", apiKey });
  } catch (err) {
    return snapshot(
      { state: "failed", kind: classify(describe(err)), message: describe(err) },
      502,
    );
  }

  try {
    const session = await client.connect({ taskId });
    try {
      const events = session.listEvents();

      if (session.state === "completed") {
        const refs = session.listArtifacts();
        if (refs.length === 0) {
          return snapshot({
            state: "failed",
            kind: "generic",
            message: "The task finished without returning a diagnosis.",
          });
        }
        const ref = refs[refs.length - 1];
        const data =
          ref.kind === "inline" && ref.data
            ? decodeInlineArtifact(ref)
            : (await session.downloadArtifact(ref)).data;
        return snapshot({ state: "completed", markdown: new TextDecoder().decode(data) });
      }

      if (session.state === "failed") {
        const terminal = events.find((event) => event.type === "terminal") as
          | { error?: unknown; reason?: unknown }
          | undefined;
        const reason = String(terminal?.error ?? terminal?.reason ?? "The task failed.");
        return snapshot({ state: "failed", kind: classify(reason), message: reason });
      }

      if (session.state === "canceled") {
        return snapshot({ state: "canceled" });
      }

      let message: string | null = null;
      for (const event of events) {
        if (event.type === "progress" && typeof event.message === "string") {
          message = event.message;
        }
      }
      return snapshot({ state: "running", phase: phaseOf(message), message });
    } finally {
      session.close();
    }
  } catch (err) {
    return snapshot(
      { state: "failed", kind: classify(describe(err)), message: describe(err) },
      502,
    );
  } finally {
    client.destroy();
  }
}
