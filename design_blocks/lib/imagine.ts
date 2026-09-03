/**
 * Client for the image-generation sidecar (deploy/imagine): Sana 600M
 * under diffusers, one generation at a time behind the sidecar's own GPU
 * lock. The sidecar gradient-maps each image onto the direction's exact
 * hex ramp before returning it, so brand color is enforced in post — a
 * diffusion prompt can't be trusted with a hex code, a LUT can.
 *
 * Null on any failure: the caller falls back to a procedural hero and
 * the pipeline never stalls on the GPU.
 */

const IMAGINE_URL = process.env.IMAGINE_URL ?? 'http://127.0.0.1:8797';

export async function generateHero(
  prompt: string,
  palette: string[],
  width = 1024,
  height = 1024,
): Promise<Uint8Array | null> {
  try {
    const response = await fetch(`${IMAGINE_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, palette, width, height }),
      signal: AbortSignal.timeout(90_000),
      keepalive: false,
    });
    if (!response.ok) {
      console.error(`[design-blocks] imagine returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > 1000 ? bytes : null;
  } catch (err) {
    console.error(`[design-blocks] imagine unreachable: ${(err as Error).message}`);
    return null;
  }
}

export async function imagineHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${IMAGINE_URL}/health`, { signal: AbortSignal.timeout(4_000) });
    return response.ok;
  } catch {
    return false;
  }
}
