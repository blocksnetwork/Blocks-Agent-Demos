/**
 * Just enough of WebCodecs to encode Opus.
 *
 * These are declared locally and reached through `globalThis` rather than
 * relying on the ambient DOM types: browser support for `AudioEncoder` arrived
 * well after the TypeScript lib files described it, so a project that compiles
 * against one version of `lib.dom` should not stop compiling against another.
 */

export interface EncodedChunk {
  readonly byteLength: number;
  readonly timestamp: number;
  readonly duration: number | null;
  copyTo(destination: ArrayBufferView | ArrayBuffer): void;
}

export interface AudioEncoderConfig {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  bitrate?: number;
  opus?: {
    frameDuration?: number;
    complexity?: number;
    usedtx?: boolean;
    useinbandfec?: boolean;
  };
}

export interface AudioDataInit {
  format: "f32-planar" | "f32";
  sampleRate: number;
  numberOfFrames: number;
  numberOfChannels: number;
  timestamp: number;
  data: ArrayBufferView | ArrayBuffer;
}

export interface AudioDataHandle {
  close(): void;
}

export interface AudioEncoderHandle {
  readonly encodeQueueSize: number;
  configure(config: AudioEncoderConfig): void;
  encode(data: AudioDataHandle): void;
  flush(): Promise<void>;
  close(): void;
}

interface AudioEncoderConstructor {
  new (init: {
    output: (chunk: EncodedChunk, metadata?: unknown) => void;
    error: (error: DOMException) => void;
  }): AudioEncoderHandle;
  isConfigSupported(config: AudioEncoderConfig): Promise<{ supported?: boolean }>;
}

type AudioDataConstructor = new (init: AudioDataInit) => AudioDataHandle;

const globals = globalThis as unknown as {
  AudioEncoder?: AudioEncoderConstructor;
  AudioData?: AudioDataConstructor;
};

export function audioEncoderAvailable(): boolean {
  return typeof globals.AudioEncoder === "function" && typeof globals.AudioData === "function";
}

export async function encoderSupports(config: AudioEncoderConfig): Promise<boolean> {
  const ctor = globals.AudioEncoder;
  if (!ctor) return false;
  try {
    const result = await ctor.isConfigSupported(config);
    return result?.supported === true;
  } catch {
    // Firefox throws rather than resolving false for configs it cannot parse.
    return false;
  }
}

export function createAudioEncoder(init: {
  output: (chunk: EncodedChunk) => void;
  error: (error: DOMException) => void;
}): AudioEncoderHandle {
  const ctor = globals.AudioEncoder;
  if (!ctor) throw new Error("AudioEncoder is not available in this browser.");
  return new ctor(init);
}

export function createAudioData(init: AudioDataInit): AudioDataHandle {
  const ctor = globals.AudioData;
  if (!ctor) throw new Error("AudioData is not available in this browser.");
  return new ctor(init);
}
