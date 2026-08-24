import type { HooksEvent } from "./protocol";

/**
 * Posts the prepared audio to the hooks route and replays the server-sent
 * events it writes back. Resolves when the stream ends; the caller decides what
 * the events mean.
 */
export async function streamHooks(
  audio: Blob,
  filename: string,
  signal: AbortSignal,
  onEvent: (event: HooksEvent) => void,
): Promise<void> {
  const form = new FormData();
  form.append("recording", audio, filename);

  const response = await fetch("/api/hooks", { method: "POST", body: form, signal });

  if (!response.ok || !response.body) {
    throw new Error(`The request failed (${response.status}).`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += value;

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const payload = frame.split("\n").find((line) => line.startsWith("data:"));
        if (payload) onEvent(JSON.parse(payload.slice(5).trim()) as HooksEvent);

        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
