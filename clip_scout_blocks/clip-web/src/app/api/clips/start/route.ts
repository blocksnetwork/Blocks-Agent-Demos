import { TaskClient, filePart } from "@blocks-network/sdk";

import { AGENT_NAME, classify, describe } from "@/lib/agent";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "@/lib/limits";
import type { FailureKind, StartResponse } from "@/lib/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(kind: FailureKind, message: string, status = 502): Response {
  const body: StartResponse = { error: { kind, message } };
  return Response.json(body, { status });
}

/**
 * Hands the recording to the agent and returns the taskId immediately. The
 * task keeps running on the Blocks network after this invocation exits; the
 * browser follows it via GET /api/clips/status. Keeping every invocation
 * seconds long is what lets this app run on serverless hosts.
 */
export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.BLOCKS_API_KEY;
  if (!apiKey) {
    return failure(
      "config",
      "BLOCKS_API_KEY is not set. Copy .env.example to .env.local and restart.",
      500,
    );
  }

  let recording: File;
  try {
    const form = await request.formData();
    const field = form.get("recording");
    if (!(field instanceof File)) {
      return failure("generic", "No recording was attached to the request.", 400);
    }
    recording = field;
  } catch (err) {
    return failure("network", describe(err), 400);
  }

  // The browser already stripped the video and compressed the audio, so
  // anything outside this list means the client-side pipeline was skipped.
  if (!UPLOAD_TYPES.includes(recording.type)) {
    return failure("generic", `${recording.type || "That file type"} is not an audio upload.`, 415);
  }
  if (recording.size > MAX_UPLOAD_BYTES) {
    return failure("generic", "That recording is over the 25MB limit.", 413);
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await recording.arrayBuffer());
  } catch (err) {
    return failure("generic", describe(err), 400);
  }

  let client: TaskClient;
  try {
    client = await TaskClient.create({ billingMode: "free", apiKey });
  } catch (err) {
    return failure(classify(describe(err)), describe(err));
  }

  try {
    const session = await client.sendMessage({
      agentName: AGENT_NAME,
      requestParts: [
        filePart(bytes, {
          partId: "recording",
          contentType: recording.type,
          fileName: recording.name || "recording",
        }),
      ],
    });

    const body: StartResponse = {
      taskId: session.taskId,
      queued: Boolean(session.queued),
    };

    // Closing drops this invocation's subscription only — the task itself
    // keeps running on the network.
    session.close();
    return Response.json(body);
  } catch (err) {
    return failure(classify(describe(err)), describe(err));
  } finally {
    client.destroy();
  }
}
