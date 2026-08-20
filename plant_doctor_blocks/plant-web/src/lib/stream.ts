import type { DiagnoseEvent } from "./protocol";

/**
 * Posts the photo to the diagnose route and replays the server-sent events it
 * writes back. Resolves when the stream ends; the caller decides what the
 * events mean.
 */
export async function streamDiagnosis(
  file: File,
  signal: AbortSignal,
  onEvent: (event: DiagnoseEvent) => void,
): Promise<void> {
  const form = new FormData();
  form.append("photo", file, file.name || "photo");

  const response = await fetch("/api/diagnose", {
    method: "POST",
    body: form,
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`The diagnose request failed (${response.status}).`);
  }

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .getReader();

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

        const payload = frame
          .split("\n")
          .find((line) => line.startsWith("data:"));

        if (payload) {
          onEvent(JSON.parse(payload.slice(5).trim()) as DiagnoseEvent);
        }

        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
