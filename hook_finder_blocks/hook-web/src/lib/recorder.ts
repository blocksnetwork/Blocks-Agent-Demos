/**
 * Microphone capture.
 *
 * A take recorded here needs none of the work an uploaded file does: the
 * browser is already handing back mono Opus in a container the agent accepts,
 * so it goes straight up rather than through a decode-and-re-encode round trip
 * that could only lose quality.
 */

/** Opus at this rate is comfortably transparent for one voice. */
const BITS_PER_SECOND = 32_000;

/** 100 minutes at 32kbps lands just inside the 25MB task input cap. */
export const MAX_TAKE_SECONDS = 6000;

/** When the remaining-time readout appears. */
export const TAKE_WARNING_SECONDS = 4800;

const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/ogg",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/** `audio/webm;codecs=opus` is not a value the upload allowlist knows. */
export function baseMimeType(type: string): string {
  return type.split(";")[0].trim() || "audio/webm";
}

export interface InputDevice {
  id: string;
  label: string;
}

export async function listInputs(): Promise<InputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({
      id: device.deviceId,
      // Labels are empty until permission is granted, which is why the device
      // list is only ever shown after the gate.
      label: device.label || `Microphone ${index + 1}`,
    }));
}

export interface Take {
  blob: Blob;
  type: string;
  seconds: number;
}

/**
 * One microphone session. Holds the stream open across takes so that
 * re-recording after a discard does not re-prompt or re-negotiate the device.
 */
export class Session {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private readonly analyser: AnalyserNode;
  private readonly context: AudioContext;
  private readonly frame: Float32Array<ArrayBuffer>;

  private constructor(
    readonly stream: MediaStream,
    readonly deviceId: string | null,
  ) {
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.context.createMediaStreamSource(stream).connect(this.analyser);
    this.frame = new Float32Array(this.analyser.fftSize);
  }

  static async open(deviceId?: string): Promise<Session> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId
        ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true },
    });
    return new Session(stream, deviceId ?? null);
  }

  /** Current input loudness as 0–1, scaled so speech sits in the upper half. */
  level(): number {
    this.analyser.getFloatTimeDomainData(this.frame);
    let sum = 0;
    for (let i = 0; i < this.frame.length; i++) sum += this.frame[i] * this.frame[i];
    const rms = Math.sqrt(sum / this.frame.length);
    // Conversational speech peaks around -18dBFS, which is an RMS near 0.12.
    return Math.min(1, rms * 6);
  }

  start(): void {
    const mimeType = pickMimeType();
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: BITS_PER_SECOND,
    });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    // A one-second timeslice keeps each chunk small, so a tab that is killed
    // mid-take has not been buffering the whole thing in one allocation.
    this.recorder.start(1000);
  }

  pause(): void {
    if (this.recorder?.state === "recording") this.recorder.pause();
  }

  resume(): void {
    if (this.recorder?.state === "paused") this.recorder.resume();
  }

  stop(seconds: number): Promise<Take> {
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new Error("Nothing is recording."));

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const type = baseMimeType(recorder.mimeType || this.chunks[0]?.type || "audio/webm");
        resolve({ blob: new Blob(this.chunks, { type }), type, seconds });
        this.recorder = null;
        this.chunks = [];
      };
      recorder.stop();
    });
  }

  close(): void {
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      // Already stopped.
    }
    this.recorder = null;
    this.chunks = [];
    this.stream.getTracks().forEach((track) => track.stop());
    void this.context.close().catch(() => {});
  }
}
