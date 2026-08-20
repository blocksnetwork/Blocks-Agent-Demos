/**
 * Everything the upload panel needs to know about a chosen file, worked out
 * in the browser before a byte is sent. Rejections happen here so the user
 * hears about a 14 MB HEIC immediately rather than after an upload.
 */

import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from "./limits";

export interface Photo {
  file: File;
  url: string;
  name: string;
  meta: string;
  width: number;
  height: number;
  /** Too coarse for the model to read fine detail from. */
  tiny: boolean;
  /** Tall or wide enough that it has to be letterboxed in the frame. */
  extremeAspect: boolean;
  hasAlpha: boolean;
  /** Degrees the browser rotated it by, from the JPEG's EXIF tag. 0 if none. */
  rotation: number;
}

export type PhotoRejection =
  | { ok: false; reason: "badtype"; detail: string }
  | { ok: false; reason: "toobig"; detail: string }
  | { ok: false; reason: "corrupt" };

export type PhotoResult = { ok: true; photo: Photo } | PhotoRejection;

const TINY_EDGE_PX = 400;
const EXTREME_ASPECT_RATIO = 2.5;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function typeLabel(type: string): string {
  if (type === "image/jpeg") return "JPEG";
  if (type === "image/png") return "PNG";
  if (type === "image/webp") return "WebP";
  return type.split("/")[1]?.toUpperCase() ?? "Image";
}

/** A name for a file we are turning away, for the alert copy. */
function rejectedTypeLabel(file: File): string {
  const subtype = file.type.split("/")[1];
  if (subtype) return subtype.replace("svg+xml", "svg").toUpperCase();
  const extension = file.name.includes(".") ? file.name.split(".").pop() : null;
  return extension ? extension.toUpperCase() : "file of an unknown type";
}

/**
 * EXIF orientation from a JPEG's APP1 segment. The browser has already
 * applied it by the time the image renders, so this only exists to tell the
 * user why their photo looks different from the one in their camera roll.
 */
function readExifRotation(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);

  try {
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 0;

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00) return 0;
      if (marker === 0xffda) return 0; // Start of scan; no EXIF ahead of it.

      const segmentLength = view.getUint16(offset + 2);

      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
        const tiff = offset + 10;
        const littleEndian = view.getUint16(tiff) === 0x4949;
        const directory = tiff + view.getUint32(tiff + 4, littleEndian);
        const entries = view.getUint16(directory, littleEndian);

        for (let i = 0; i < entries; i += 1) {
          const entry = directory + 2 + i * 12;
          if (view.getUint16(entry, littleEndian) === 0x0112) {
            const orientation = view.getUint16(entry + 8, littleEndian);
            return { 3: 180, 6: 90, 8: 270 }[orientation] ?? 0;
          }
        }
        return 0;
      }

      offset += 2 + segmentLength;
    }
  } catch {
    // A truncated header is not worth failing the upload over.
  }

  return 0;
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode failed"));
    image.src = url;
  });
}

function detectAlpha(image: HTMLImageElement): boolean {
  const width = Math.min(image.naturalWidth, 64);
  const height = Math.min(image.naturalHeight, 64);
  if (width === 0 || height === 0) return false;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;

  context.drawImage(image, 0, 0, width, height);

  try {
    const { data } = context.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return true;
    }
  } catch {
    // Tainted canvas cannot happen for a local file, but never block on it.
  }

  return false;
}

export async function analyzePhoto(file: File): Promise<PhotoResult> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return {
      ok: false,
      reason: "badtype",
      detail: `Plant Doctor reads JPEG, PNG and WebP. The file you chose is a ${rejectedTypeLabel(file)}.`,
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: "toobig",
      detail: `The limit is 10 MB. ${file.name} is ${formatBytes(file.size)} — try a smaller export or a screenshot.`,
    };
  }

  const url = URL.createObjectURL(file);

  let image: HTMLImageElement;
  try {
    image = await load(url);
  } catch {
    URL.revokeObjectURL(url);
    return { ok: false, reason: "corrupt" };
  }

  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (width === 0 || height === 0) {
    URL.revokeObjectURL(url);
    return { ok: false, reason: "corrupt" };
  }

  const hasAlpha = file.type !== "image/jpeg" && detectAlpha(image);
  const rotation =
    file.type === "image/jpeg" ? readExifRotation(await file.arrayBuffer()) : 0;

  const longEdge = Math.max(width, height);
  const aspect = longEdge / Math.min(width, height);

  return {
    ok: true,
    photo: {
      file,
      url,
      name: file.name,
      meta: `${typeLabel(file.type)}${hasAlpha ? " with transparency" : ""} · ${formatBytes(file.size)} · ${width} × ${height}`,
      width,
      height,
      tiny: longEdge < TINY_EDGE_PX,
      extremeAspect: aspect >= EXTREME_ASPECT_RATIO,
      hasAlpha,
      rotation,
    },
  };
}
