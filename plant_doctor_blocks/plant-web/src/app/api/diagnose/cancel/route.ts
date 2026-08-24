import { TaskClient } from "@blocks-network/sdk";

import { describe } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Best-effort cleanup: the browser fires this (with keepalive) when the user
 * abandons a running task, so closing the tab does not leave the agent
 * working on a diagnosis nobody will read.
 */
export async function POST(request: Request): Promise<Response> {
  let taskId: unknown;
  try {
    ({ taskId } = (await request.json()) as { taskId?: unknown });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (typeof taskId !== "string" || !taskId) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const apiKey = process.env.BLOCKS_API_KEY;
  if (!apiKey) return Response.json({ ok: false }, { status: 500 });

  let client: TaskClient;
  try {
    client = await TaskClient.create({ billingMode: "free", apiKey });
  } catch {
    return Response.json({ ok: false }, { status: 502 });
  }

  try {
    await client.cancelTask(taskId);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, message: describe(err) }, { status: 502 });
  } finally {
    client.destroy();
  }
}
