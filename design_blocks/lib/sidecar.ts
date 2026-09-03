/**
 * Client for the embedding sidecar (deploy/embed): CLIP ViT-B/32 on CPU
 * for text/image embeddings, plus PIL-powered palette extraction,
 * thumbnails, and contact sheets. Every call degrades to null — the
 * sidecar being down makes results worse, never absent.
 */

const EMBED_URL = process.env.EMBED_URL ?? 'http://127.0.0.1:8798';

async function post(path: string, body: BodyInit, headers?: Record<string, string>): Promise<Response | null> {
  try {
    const response = await fetch(`${EMBED_URL}${path}`, {
      method: 'POST',
      body,
      headers,
      signal: AbortSignal.timeout(30_000),
      keepalive: false,
    });
    if (!response.ok) {
      console.error(`[design-blocks] sidecar ${path} returned ${response.status}`);
      return null;
    }
    return response;
  } catch (err) {
    console.error(`[design-blocks] sidecar ${path} unreachable: ${(err as Error).message}`);
    return null;
  }
}

export async function embedText(text: string): Promise<number[] | null> {
  const response = await post('/embed_text', JSON.stringify({ text }), {
    'Content-Type': 'application/json',
  });
  if (!response) return null;
  const payload = (await response.json()) as { embedding?: number[] };
  return Array.isArray(payload.embedding) ? payload.embedding : null;
}

function fileForm(bytes: Uint8Array, name = 'image'): FormData {
  const form = new FormData();
  form.append('file', new Blob([bytes as unknown as BlobPart]), name);
  return form;
}

export async function embedImage(bytes: Uint8Array): Promise<number[] | null> {
  const response = await post('/embed_image', fileForm(bytes));
  if (!response) return null;
  const payload = (await response.json()) as { embedding?: number[] };
  return Array.isArray(payload.embedding) ? payload.embedding : null;
}

export async function extractPalette(bytes: Uint8Array): Promise<string[] | null> {
  const response = await post('/palette', fileForm(bytes));
  if (!response) return null;
  const payload = (await response.json()) as { colors?: string[] };
  return Array.isArray(payload.colors) ? payload.colors : null;
}

export async function makeThumb(bytes: Uint8Array): Promise<Uint8Array | null> {
  const response = await post('/thumb', fileForm(bytes));
  if (!response) return null;
  return new Uint8Array(await response.arrayBuffer());
}

/** Stitch reference thumbnails into one JPEG contact sheet. */
export async function makeSheet(thumbs: Uint8Array[]): Promise<Uint8Array | null> {
  if (thumbs.length === 0) return null;
  const form = new FormData();
  for (let i = 0; i < thumbs.length; i++) {
    form.append('files', new Blob([thumbs[i] as unknown as BlobPart]), `thumb-${i}.jpg`);
  }
  const response = await post('/sheet', form);
  if (!response) return null;
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Background-removed RGBA PNG, so a generated subject can act as a
 * foreground cutout instead of a rectangle. Returns null when the
 * sidecar is down OR when too little background was actually removed —
 * a failed cutout composited as if it were transparent looks broken, so
 * callers fall back to a contained image treatment instead.
 */
export async function cutoutSubject(bytes: Uint8Array): Promise<Uint8Array | null> {
  const response = await post('/cutout', fileForm(bytes));
  if (!response) return null;
  const alphaFraction = Number(response.headers.get('x-cutout-alpha') ?? '0');
  if (alphaFraction < 0.08) {
    console.error(`[design-blocks] cutout removed only ${(alphaFraction * 100).toFixed(1)}% — treating as failed`);
    return null;
  }
  return new Uint8Array(await response.arrayBuffer());
}
