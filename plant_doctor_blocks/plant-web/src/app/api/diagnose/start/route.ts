import { TaskClient, filePart } from "@blocks-network/sdk";

import { AGENT_NAME, classify, describe } from "@/lib/agent";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/limits";
import type { FailureKind, StartResponse } from "@/lib/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(kind: FailureKind, message: string, status = 502): Response {
  const body: StartResponse = { error: { kind, message } };
  return Response.json(body, { status });
}

/**
 * Hands the photo to the agent and returns the taskId immediately. The task
 * keeps running on the Blocks network after this invocation exits; the
 * browser follows it via GET /api/diagnose/status. Keeping every invocation
 * seconds long is what lets this app run on serverless hosts.
 */
export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.BLOCKS_API_KEY;
  if (!apiKey) {
    return failure("generic", "BLOCKS_API_KEY is not set on the server.", 500);
  }

  let photo: File;
  try {
    const form = await request.formData();
    const field = form.get("photo");
    if (!(field instanceof File)) {
      return failure("generic", "No photo was attached to the request.", 400);
    }
    photo = field;
  } catch (err) {
    return failure("network", describe(err), 400);
  }

  if (!ACCEPTED_TYPES.includes(photo.type)) {
    return failure("generic", `${photo.type || "That file type"} is not a supported image.`, 415);
  }
  if (photo.size > MAX_UPLOAD_BYTES) {
    return failure("generic", "That photo is over the 10 MB limit.", 413);
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await photo.arrayBuffer());
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
          partId: "photo",
          contentType: photo.type,
          fileName: photo.name || "photo",
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
