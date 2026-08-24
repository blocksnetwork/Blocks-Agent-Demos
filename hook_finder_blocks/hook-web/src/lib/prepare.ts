/**
 * Turns whatever the user dropped into speech the agent can afford to receive.
 *
 * Blocks caps a task input at 25MB, and a screen recording is routinely twenty
 * times that. But the picture contributes nothing — the transcript is what gets
 * ranked — so the video track is discarded here, in the tab, and only mono
 * Opus is uploaded. That is also why video is worth supporting at all: the
 * audio was always the payload, and the frames stay local for playback.
 */

import { OggOpusWriter } from "./ogg";
import {
  audioEncoderAvailable,
  createAudioData,
  createAudioEncoder,
  encoderSupports,
  type AudioEncoderConfig,
  type EncodedChunk,
} from "./webcodecs";

/** Wideband speech. Opus is transparent enough here that Whisper cannot tell. */
const OPUS_BITRATE = 24_000;

/**
 * 16kHz is what Whisper resamples to internally anyway, and decoding straight
 * to it keeps a long recording's PCM inside a few hundred megabytes.
 */
const PREFERRED_RATE = 16_000;
const FALLBACK_RATE = 48_000;

/** Half-second slices: small enough that the progress bar moves, large enough
 *  that the per-call overhead stays invisible. */
const SLICE_SECONDS = 0.5;

export const PEAK_BUCKETS = 900;

export type PrepareStage = "reading" | "decoding" | "encoding";

export interface PrepareProgress {
  stage: PrepareStage;
  /** 0–100 across the whole job, not the current stage. */
  percent: number;
  /** Bytes of audio produced so far, once encoding starts. */
  outputBytes: number;
}

export interface Prepared {
  blob: Blob;
  filename: string;
  codec: "opus" | "wav";
  /** Seconds of audio actually encoded, which beats the container's metadata. */
  duration: number;
  /** Normalised 0–1 amplitude buckets, for drawing the source waveform. */
  peaks: Float32Array;
}

export interface SourceInfo {
  duration: number;
  width: number;
  height: number;
  hasVideo: boolean;
}

export class PrepareError extends Error {
  constructor(
    message: string,
    readonly kind: "decode" | "encode" | "toobig" | "silent",
  ) {
    super(message);
    this.name = "PrepareError";
  }
}

/**
 * Reads duration and frame size without decoding anything, by letting the
 * media element parse the container headers.
 */
export function probeSource(url: string): Promise<SourceInfo> {
  return new Promise((resolve, reject) => {
    const element = document.createElement("video");
    element.preload = "metadata";
    element.muted = true;

    const settle = (info: SourceInfo) => {
      cleanup();
      resolve(info);
    };

    const cleanup = () => {
      element.onloadedmetadata = null;
      element.onerror = null;
      element.ondurationchange = null;
      element.removeAttribute("src");
      element.load();
    };

    element.onerror = () => {
      cleanup();
      reject(new PrepareError("This browser could not open that file.", "decode"));
    };

    element.onloadedmetadata = () => {
      const info: SourceInfo = {
        duration: element.duration,
        width: element.videoWidth,
        height: element.videoHeight,
        hasVideo: element.videoWidth > 0,
      };

      // Streamed WebM and MediaRecorder output often ship without a duration.
      // Seeking past the end forces the element to work it out from the cues.
      if (!Number.isFinite(info.duration)) {
        element.ondurationchange = () => {
          if (Number.isFinite(element.duration)) {
            settle({ ...info, duration: element.duration });
          }
        };
        element.currentTime = 1e6;
        return;
      }

      settle(info);
    };

    element.src = url;
  });
}

const EMPTY = new Uint8Array(0);

/** Streams the source so a 400MB drop reports real progress instead of hanging. */
async function readBytes(
  source: Blob,
  onProgress: (fraction: number) => void,
): Promise<ArrayBuffer> {
  const reader = source.stream().getReader();
  const parts: Uint8Array[] = [];
  let read = 0;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value);
    read += value.byteLength;
    onProgress(source.size > 0 ? read / source.size : 1);
  }

  const merged = new Uint8Array(read);
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    merged.set(parts[i], offset);
    offset += parts[i].byteLength;
    // Dropping each reference as it is copied lets the collector reclaim the
    // chunk, rather than holding two full copies of a large file at once.
    parts[i] = EMPTY;
  }

  return merged.buffer;
}

function downmix(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);

  const length = buffer.length;
  const mixed = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) mixed[i] += data[i];
  }
  const scale = 1 / buffer.numberOfChannels;
  for (let i = 0; i < length; i++) mixed[i] *= scale;
  return mixed;
}

/**
 * Linear resample, used only when the platform ignored the context's rate.
 * Safari has historically decoded at the file's own rate regardless.
 */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;

  const length = Math.max(1, Math.round((input.length * to) / from));
  const output = new Float32Array(length);
  const ratio = from / to;

  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const weight = position - left;
    output[i] = input[left] * (1 - weight) + input[right] * weight;
  }

  return output;
}

async function decodeToMono(
  bytes: ArrayBuffer,
  rate: number,
  seconds: number,
): Promise<Float32Array> {
  // decodeAudioData resamples to the context's rate, so the context is where
  // the downsample happens — one pass, no second buffer.
  const frames = Math.max(rate, Math.ceil((seconds || 1) * rate));
  const context = new OfflineAudioContext(1, frames, rate);

  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(bytes);
  } catch {
    throw new PrepareError(
      "That file has no audio track this browser can decode.",
      "decode",
    );
  }

  return resample(downmix(buffer), buffer.sampleRate, rate);
}

export function computePeaks(samples: Float32Array, buckets = PEAK_BUCKETS): Float32Array {
  const peaks = new Float32Array(buckets);
  if (samples.length === 0) return peaks;

  const width = samples.length / buckets;
  let loudest = 0;

  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = Math.floor(bucket * width);
    const end = Math.min(samples.length, Math.floor((bucket + 1) * width));
    let peak = 0;
    for (let i = start; i < end; i++) {
      const value = samples[i] < 0 ? -samples[i] : samples[i];
      if (value > peak) peak = value;
    }
    peaks[bucket] = peak;
    if (peak > loudest) loudest = peak;
  }

  // Normalising against the loudest moment means a quietly recorded take still
  // draws as a waveform rather than a flat line.
  if (loudest > 0) {
    for (let i = 0; i < buckets; i++) peaks[i] = peaks[i] / loudest;
  }

  return peaks;
}

function opusConfig(rate: number): AudioEncoderConfig {
  return {
    codec: "opus",
    sampleRate: rate,
    numberOfChannels: 1,
    bitrate: OPUS_BITRATE,
    opus: { frameDuration: 20_000, usedtx: false },
  };
}

/** The rate to decode at, chosen by what the platform's encoder will take. */
async function chooseRate(): Promise<number | null> {
  if (!audioEncoderAvailable()) return null;
  if (await encoderSupports(opusConfig(PREFERRED_RATE))) return PREFERRED_RATE;
  if (await encoderSupports(opusConfig(FALLBACK_RATE))) return FALLBACK_RATE;
  return null;
}

async function encodeOpus(
  samples: Float32Array,
  rate: number,
  onProgress: (fraction: number, bytes: number) => void,
): Promise<{ blob: Blob; duration: number }> {
  const writer = new OggOpusWriter(1, rate);
  let bytes = 0;
  let failure: DOMException | null = null;

  const encoder = createAudioEncoder({
    output: (chunk: EncodedChunk) => {
      const packet = new Uint8Array(chunk.byteLength);
      chunk.copyTo(packet);
      writer.add(packet);
      bytes += packet.length;
    },
    error: (error) => {
      failure = error;
    },
  });

  encoder.configure(opusConfig(rate));

  const slice = Math.max(1, Math.round(rate * SLICE_SECONDS));

  for (let offset = 0; offset < samples.length; offset += slice) {
    if (failure) break;

    const length = Math.min(slice, samples.length - offset);
    const data = createAudioData({
      format: "f32-planar",
      sampleRate: rate,
      numberOfFrames: length,
      numberOfChannels: 1,
      timestamp: Math.round((offset / rate) * 1e6),
      // A view, not a copy — the encoder reads it before this call returns.
      data: samples.subarray(offset, offset + length),
    });

    encoder.encode(data);
    data.close();

    onProgress((offset + length) / samples.length, bytes);

    // Yield often enough for the progress bar to paint, and back off entirely
    // when the encoder's queue starts building.
    if (encoder.encodeQueueSize > 8) {
      while (encoder.encodeQueueSize > 2) {
        await new Promise((resolve) => setTimeout(resolve, 4));
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  try {
    await encoder.flush();
  } finally {
    encoder.close();
  }

  if (failure) {
    throw new PrepareError(
      `The browser's Opus encoder failed: ${(failure as DOMException).message}`,
      "encode",
    );
  }

  const blob = writer.finish();
  return { blob, duration: writer.samples / 48_000 };
}

/** 16-bit PCM in a RIFF wrapper — the fallback when WebCodecs is missing. */
function encodeWav(samples: Float32Array, rate: number): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const dataBytes = samples.length * 2;

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);

  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  return new Blob([header, pcm.buffer] as BlobPart[], { type: "audio/wav" });
}

function baseName(name: string): string {
  const stripped = name.replace(/\.[^.]+$/, "");
  return stripped.trim() || "recording";
}

/**
 * The whole client-side job: read the file, decode its audio, throw the picture
 * away, and hand back something under the upload cap.
 */
export async function prepareUpload(
  source: Blob,
  name: string,
  seconds: number,
  maxBytes: number,
  onProgress: (progress: PrepareProgress) => void,
): Promise<Prepared> {
  const rate = await chooseRate();
  const decodeRate = rate ?? PREFERRED_RATE;

  onProgress({ stage: "reading", percent: 0, outputBytes: 0 });
  const bytes = await readBytes(source, (fraction) => {
    onProgress({ stage: "reading", percent: fraction * 30, outputBytes: 0 });
  });

  onProgress({ stage: "decoding", percent: 30, outputBytes: 0 });
  const samples = await decodeToMono(bytes, decodeRate, seconds);

  if (samples.length < decodeRate * 0.5) {
    throw new PrepareError("That file is under half a second of audio.", "silent");
  }

  onProgress({ stage: "encoding", percent: 55, outputBytes: 0 });
  const peaks = computePeaks(samples);

  if (rate === null) {
    // No WebCodecs: PCM is the only encoder left, and it is ~13 minutes to the
    // cap. Say so plainly rather than uploading a file that will be rejected.
    const blob = encodeWav(samples, decodeRate);
    if (blob.size > maxBytes) {
      throw new PrepareError(
        "This browser cannot compress audio, and uncompressed this recording is over the 25MB limit. Chrome, Edge, Safari 18 and Firefox 130 can all compress it — or extract the audio yourself with ffmpeg.",
        "toobig",
      );
    }
    onProgress({ stage: "encoding", percent: 100, outputBytes: blob.size });
    return {
      blob,
      filename: `${baseName(name)}.wav`,
      codec: "wav",
      duration: samples.length / decodeRate,
      peaks,
    };
  }

  const { blob, duration } = await encodeOpus(samples, decodeRate, (fraction, produced) => {
    onProgress({ stage: "encoding", percent: 55 + fraction * 45, outputBytes: produced });
  });

  if (blob.size > maxBytes) {
    throw new PrepareError(
      "Even compressed, this recording is over the 25MB limit — that is roughly two and a half hours of speech. Split it and run the halves separately.",
      "toobig",
    );
  }

  onProgress({ stage: "encoding", percent: 100, outputBytes: blob.size });

  return {
    blob,
    filename: `${baseName(name)}.ogg`,
    codec: "opus",
    duration: duration || samples.length / decodeRate,
    peaks,
  };
}
