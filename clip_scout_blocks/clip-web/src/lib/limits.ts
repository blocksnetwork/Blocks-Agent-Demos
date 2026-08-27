/**
 * What the browser will take in, and what the network will take out.
 *
 * These are two different lists on purpose. The user can hand us a 400MB
 * ScreenFlow export; the agent only ever receives the audio we render from it,
 * so `UPLOAD_TYPES` mirrors io.inputs[0].accept in the agent card while
 * `SOURCE_TYPES` is as wide as the browser's own decoders.
 */

/** Blocks caps a single task input at 25MB. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** What we are allowed to POST to the agent — a subset of its accept list. */
export const UPLOAD_TYPES = ["audio/ogg", "audio/webm", "audio/wav"];

export const AUDIO_SOURCE_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
];

export const VIDEO_SOURCE_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/x-m4v",
  "video/mpeg",
];

/**
 * Browsers are inconsistent about the `type` they report for media files —
 * Windows hands over an empty string for .mov often enough that extension is
 * the more reliable signal, so the picker accepts both spellings.
 */
export const ACCEPT_ATTRIBUTE = [
  ...AUDIO_SOURCE_TYPES,
  ...VIDEO_SOURCE_TYPES,
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".ogg",
  ".opus",
  ".flac",
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".m4v",
].join(",");

const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|mkv|m4v|avi|mpe?g)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|wav|ogg|opus|flac|wma|aiff?)$/i;

export function looksLikeMedia(file: File): boolean {
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) return true;
  return VIDEO_EXTENSIONS.test(file.name) || AUDIO_EXTENSIONS.test(file.name);
}

export function looksLikeVideo(file: File): boolean {
  return file.type.startsWith("video/") || VIDEO_EXTENSIONS.test(file.name);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / 1024 / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
