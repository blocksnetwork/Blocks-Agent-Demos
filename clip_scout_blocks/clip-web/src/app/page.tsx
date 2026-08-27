"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Armed } from "@/components/Armed";
import { Failure } from "@/components/Failure";
import { Header } from "@/components/Header";
import { Landing } from "@/components/Landing";
import { PermissionGate, type GateReason } from "@/components/PermissionGate";
import { Preparing } from "@/components/Preparing";
import { RawPicks } from "@/components/RawPicks";
import { RecordingScreen } from "@/components/RecordingScreen";
import { Results, type CopyState } from "@/components/Results";
import { Review } from "@/components/Review";
import { Working } from "@/components/Working";
import { clampClips, parsePicks, type Clip } from "@/lib/clips";
import { stamp } from "@/lib/format";
import { formatBytes, looksLikeMedia, MAX_UPLOAD_BYTES } from "@/lib/limits";
import {
  agentMessage,
  FAILURE_MESSAGES,
  preparationMessage,
  QUEUED_MESSAGE,
  type Message,
} from "@/lib/messages";
import {
  computePeaks,
  prepareUpload,
  probeSource,
  PrepareError,
  type PrepareProgress,
} from "@/lib/prepare";
import { SHOW_DETAIL, type Phase } from "@/lib/protocol";
import {
  listInputs,
  MAX_TAKE_SECONDS,
  Session,
  type InputDevice,
} from "@/lib/recorder";
import { runClips } from "@/lib/clips-client";

/** The meter and the take clock both run off this. */
const TICK_MS = 100;

/** Bars in the live waveform — about ten seconds of history at TICK_MS. */
const WAVE_BARS = 96;

type Screen =
  | { name: "landing" }
  | { name: "perm"; reason: GateReason }
  | { name: "armed" }
  | { name: "recording" }
  | { name: "review" }
  | { name: "preparing" }
  | { name: "working" }
  | { name: "queued" }
  | { name: "results"; clips: Clip[]; note: string | null; shortfall: string | null }
  | { name: "raw"; text: string }
  | {
      name: "failed";
      label: string;
      message: Message;
      detail?: string | null;
      retry: "run" | "prepare" | "reset";
    };

interface Source {
  url: string;
  name: string;
  bytes: number;
  duration: number;
  hasVideo: boolean;
  recorded: boolean;
  peaks: Float32Array | null;
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function modeLabel(screen: Screen["name"], recorded: boolean): string {
  if (screen === "landing") return "Upload — find where to cut";
  if (recorded) return "Recorded take — what to say";
  return "Uploaded file — where to cut";
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>({ name: "landing" });
  const [source, setSource] = useState<Source | null>(null);
  const [announce, setAnnounce] = useState("");

  const [prepare, setPrepare] = useState<PrepareProgress>({
    stage: "reading",
    percent: 0,
    outputBytes: 0,
  });
  const [phase, setPhase] = useState<Phase>("reading");
  const [jobSeconds, setJobSeconds] = useState(0);

  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState<number | null>(null);
  const [reviewPlaying, setReviewPlaying] = useState(false);
  const [copied, setCopied] = useState<CopyState | null>(null);

  const [devices, setDevices] = useState<InputDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);

  /**
   * The media element, held in a ref because playback is driven by mutating it
   * — `currentTime`, `play`, `pause` — which is not something a render-owned
   * value should be doing. `mediaEpoch` only exists so that the listener effect
   * re-runs when a screen change swaps one element for another.
   */
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [mediaEpoch, setMediaEpoch] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const sourceRef = useRef<Source | null>(null);
  /** Every object URL minted, so a reset can hand them all back at once. */
  const urlsRef = useRef<string[]>([]);
  /** What prepareAndRun should work on, kept out of state so a retry can reuse it. */
  const pendingRef = useRef<{ blob: Blob; name: string; seconds: number } | null>(null);
  /** The prepared upload, so a failed run can be retried without re-encoding. */
  const uploadRef = useRef<{ blob: Blob; filename: string } | null>(null);
  /** Where the current clip should stop. Null while playing freely. */
  const clipEndRef = useRef<number | null>(null);

  const startedAtRef = useRef(0);
  const pausedForRef = useRef(0);
  const pauseAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const takePeaksRef = useRef<number[]>([]);

  const say = useCallback((message: string) => setAnnounce(message), []);

  const setMedia = useCallback((element: HTMLMediaElement | null) => {
    mediaRef.current = element;
    setMediaEpoch((epoch) => epoch + 1);
  }, []);

  const mintUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urlsRef.current.push(url);
    return url;
  }, []);

  const putSource = useCallback((next: Source | null) => {
    sourceRef.current = next;
    setSource(next);
  }, []);

  const releaseUrls = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = [];
  }, []);

  // ── The run itself ────────────────────────────────────────────────────────

  const land = useCallback(
    (markdown: string) => {
      const picks = parsePicks(markdown);

      if (picks.kind === "message") {
        setScreen({
          name: "failed",
          label: "Nothing to rank",
          message: agentMessage(picks.text),
          retry: "reset",
        });
        return;
      }

      if (picks.kind === "raw") {
        say("The agent replied without timestamps");
        setScreen({ name: "raw", text: picks.text });
        return;
      }

      const clips = clampClips(picks.clips, sourceRef.current?.duration ?? 0);
      if (clips.length === 0) {
        setScreen({ name: "raw", text: markdown });
        return;
      }

      say(clips.length === 1 ? "One moment found" : `${clips.length} moments found`);
      setPosition(0);
      setPlaying(null);
      setScreen({
        name: "results",
        clips,
        note: picks.note,
        shortfall: picks.shortfall,
      });
    },
    [say],
  );

  const runJob = useCallback(
    async (blob: Blob, filename: string) => {
      uploadRef.current = { blob, filename };

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setJobSeconds(0);
      setPhase("reading");
      setScreen({ name: "working" });
      say("Reading the recording");

      try {
        await runClips(blob, filename, controller.signal, (event) => {
          switch (event.type) {
            case "accepted":
              if (event.queued) setScreen({ name: "queued" });
              break;
            case "phase":
              setPhase(event.phase);
              setScreen({ name: "working" });
              say(event.message);
              break;
            case "result":
              land(event.markdown);
              break;
            case "error":
              setScreen({
                name: "failed",
                label: event.kind === "config" ? "Not configured" : "Run failed",
                message: FAILURE_MESSAGES[event.kind],
                detail: SHOW_DETAIL.has(event.kind) ? event.message : null,
                retry: "run",
              });
              break;
          }
        });
      } catch {
        if (controller.signal.aborted) return;
        setScreen({
          name: "failed",
          label: "Run failed",
          message: FAILURE_MESSAGES.network,
          retry: "run",
        });
      }
    },
    [land, say],
  );

  const prepareAndRun = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;

    setPrepare({ stage: "reading", percent: 0, outputBytes: 0 });
    setScreen({ name: "preparing" });
    say("Preparing the audio in your browser");

    try {
      const prepared = await prepareUpload(
        pending.blob,
        pending.name,
        pending.seconds,
        MAX_UPLOAD_BYTES,
        setPrepare,
      );

      const current = sourceRef.current;
      if (current) {
        // A recorded take plays back from the prepared file: MediaRecorder's
        // WebM has no cues, so seeking into it is unreliable, and the Ogg we
        // just wrote is seekable and the same audio.
        putSource({
          ...current,
          url: current.recorded ? mintUrl(prepared.blob) : current.url,
          duration: Number.isFinite(current.duration) && current.duration > 0
            ? current.duration
            : prepared.duration,
          peaks: prepared.peaks,
        });
      }

      await runJob(prepared.blob, prepared.filename);
    } catch (err) {
      // A recorded take is already mono Opus in a container the agent accepts,
      // so a failed re-encode is a detour, not a dead end.
      if (sourceRef.current?.recorded && !(err instanceof PrepareError && err.kind === "toobig")) {
        await runJob(pending.blob, pending.name);
        return;
      }

      setScreen({
        name: "failed",
        label: "Preparation",
        message: preparationMessage(describe(err)),
        retry: "reset",
      });
    }
  }, [mintUrl, putSource, runJob, say]);

  // ── Uploading ─────────────────────────────────────────────────────────────

  const choose = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;

      abortRef.current?.abort();

      if (!looksLikeMedia(file)) {
        setScreen({
          name: "failed",
          label: "Wrong file",
          message: preparationMessage(
            `${file.name} is not audio or video. Clip Scout reads what was said, so it needs a recording.`,
          ),
          retry: "reset",
        });
        return;
      }

      releaseUrls();
      const url = mintUrl(file);

      let info;
      try {
        info = await probeSource(url);
      } catch (err) {
        putSource(null);
        setScreen({
          name: "failed",
          label: "Wrong file",
          message: preparationMessage(
            `${describe(err)} If it plays elsewhere, re-export it as MP4 or M4A.`,
          ),
          retry: "reset",
        });
        return;
      }

      putSource({
        url,
        name: file.name,
        bytes: file.size,
        duration: info.duration,
        hasVideo: info.hasVideo,
        recorded: false,
        peaks: null,
      });

      pendingRef.current = { blob: file, name: file.name, seconds: info.duration };
      await prepareAndRun();
    },
    [mintUrl, prepareAndRun, putSource, releaseUrls],
  );

  // ── Recording ─────────────────────────────────────────────────────────────

  const grant = useCallback(async () => {
    // Checked here rather than up front: on the server there is no navigator,
    // and asking during render would mean a hydration mismatch on the one
    // screen where the answer does not yet matter.
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setScreen({ name: "perm", reason: "unsupported" });
      return;
    }

    try {
      sessionRef.current?.close();
      const session = await Session.open(deviceId ?? undefined);
      sessionRef.current = session;
      setDevices(await listInputs());
      say("Microphone ready");
      setScreen({ name: "armed" });
    } catch {
      setScreen({ name: "perm", reason: "denied" });
    }
  }, [deviceId, say]);

  const startRecording = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    startedAtRef.current = Date.now();
    pausedForRef.current = 0;
    elapsedRef.current = 0;
    takePeaksRef.current = [];
    setElapsed(0);
    setPaused(false);
    setHistory([]);
    session.start();
    say("Recording started");
    setScreen({ name: "recording" });
  }, [say]);

  const stopRecording = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;

    const seconds = Math.max(0.5, elapsedRef.current);
    let take;
    try {
      take = await session.stop(seconds);
    } catch {
      setScreen({ name: "armed" });
      return;
    }

    releaseUrls();
    putSource({
      url: mintUrl(take.blob),
      name: "Recorded take",
      bytes: take.blob.size,
      duration: seconds,
      hasVideo: false,
      recorded: true,
      // The level history is a real envelope of the take, so the timeline can
      // draw a waveform without decoding the file a second time.
      peaks: computePeaks(Float32Array.from(takePeaksRef.current)),
    });

    pendingRef.current = { blob: take.blob, name: "take.webm", seconds };
    setPosition(0);
    setReviewPlaying(false);
    say("Recording stopped. Review your take.");
    setScreen({ name: "review" });
  }, [mintUrl, putSource, releaseUrls, say]);

  const togglePause = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    setPaused((wasPaused) => {
      if (wasPaused) {
        pausedForRef.current += (Date.now() - pauseAtRef.current) / 1000;
        session.resume();
        say("Recording resumed");
        return false;
      }
      pauseAtRef.current = Date.now();
      session.pause();
      say("Recording paused");
      return true;
    });
  }, [say]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    sessionRef.current?.close();
    sessionRef.current = null;
    releaseUrls();
    putSource(null);
    pendingRef.current = null;
    uploadRef.current = null;
    clipEndRef.current = null;
    setPlaying(null);
    setPosition(0);
    setReviewPlaying(false);
    setElapsed(0);
    setHistory([]);
    setJobSeconds(0);
    setScreen({ name: "landing" });
  }, [putSource, releaseUrls]);

  // ── Playback ──────────────────────────────────────────────────────────────

  const seek = useCallback((seconds: number) => {
    const media = mediaRef.current;
    if (!media) return;
    clipEndRef.current = null;
    setPlaying(null);
    media.currentTime = seconds;
    setPosition(seconds);
  }, []);

  const playClip = useCallback(
    (index: number) => {
      const media = mediaRef.current;
      if (!media || screen.name !== "results") return;

      if (playing === index) {
        media.pause();
        clipEndRef.current = null;
        setPlaying(null);
        say("Paused");
        return;
      }

      const clip = screen.clips[index];
      media.currentTime = clip.start;
      clipEndRef.current = clip.end;
      setPosition(clip.start);
      setPlaying(index);
      say(`Playing clip ${clip.rank}`);
      void media.play().catch(() => {
        clipEndRef.current = null;
        setPlaying(null);
      });
    },
    [playing, say, screen],
  );

  const toggleReview = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (reviewPlaying) {
      media.pause();
      setReviewPlaying(false);
      return;
    }
    setReviewPlaying(true);
    void media.play().catch(() => setReviewPlaying(false));
  }, [reviewPlaying]);

  const copy = useCallback(
    (index: number, what: CopyState["what"], text: string) => {
      navigator.clipboard?.writeText(text).catch(() => {});
      setCopied({ index, what });
      say(`${what === "range" ? "Timestamps" : "Caption"} copied`);
    },
    [say],
  );

  // ── Timers and listeners ──────────────────────────────────────────────────

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  // The meter while armed, and the clock plus envelope while recording.
  useEffect(() => {
    if (screen.name !== "armed" && screen.name !== "recording") return;
    const recording = screen.name === "recording";

    const id = setInterval(() => {
      const session = sessionRef.current;
      if (!session) return;

      const reading = session.level();
      setLevel(reading);
      if (!recording || paused) return;

      const next = (Date.now() - startedAtRef.current) / 1000 - pausedForRef.current;
      elapsedRef.current = next;
      takePeaksRef.current.push(reading);
      setHistory((previous) => [...previous, reading].slice(-WAVE_BARS));
      setElapsed(next);

      // 100 minutes at 32kbps is where the take stops fitting the upload cap.
      if (next >= MAX_TAKE_SECONDS) {
        say("Take limit reached");
        void stopRecording();
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, [paused, say, screen.name, stopRecording]);

  useEffect(() => {
    if (screen.name !== "working" && screen.name !== "queued") return;
    const id = setInterval(() => setJobSeconds((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [screen.name]);

  // timeupdate alone fires about four times a second, which reads as a
  // stuttering playhead, so the position is polled while something is playing.
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const stopAtClipEnd = () => {
      const end = clipEndRef.current;
      if (end !== null && media.currentTime >= end) {
        media.pause();
        clipEndRef.current = null;
        setPlaying(null);
        say("Clip finished");
        return true;
      }
      return false;
    };

    const onEnded = () => {
      clipEndRef.current = null;
      setPlaying(null);
      setReviewPlaying(false);
    };

    const onTime = () => {
      if (!stopAtClipEnd()) setPosition(media.currentTime);
    };

    const onPause = () => setReviewPlaying(false);

    media.addEventListener("timeupdate", onTime);
    media.addEventListener("ended", onEnded);
    media.addEventListener("pause", onPause);

    let frame = requestAnimationFrame(function poll() {
      if (!media.paused && !stopAtClipEnd()) setPosition(media.currentTime);
      frame = requestAnimationFrame(poll);
    });

    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("timeupdate", onTime);
      media.removeEventListener("ended", onEnded);
      media.removeEventListener("pause", onPause);
    };
  }, [mediaEpoch, say]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && screen.name === "recording") {
        void stopRecording();
        return;
      }
      if (event.code !== "Space") return;
      if (screen.name !== "armed" && screen.name !== "recording") return;

      const target = event.target as HTMLElement | null;
      if (target && /^(BUTTON|SELECT|INPUT|TEXTAREA)$/.test(target.tagName)) return;

      event.preventDefault();
      if (screen.name === "armed") startRecording();
      else void stopRecording();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [screen.name, startRecording, stopRecording]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      sessionRef.current?.close();
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const targetBytes =
    prepare.outputBytes > 0
      ? prepare.outputBytes
      : // 24kbps mono until the encoder reports something real.
        Math.round(((source?.duration ?? 0) * 24_000) / 8);

  return (
    <div className="flex min-h-screen flex-col items-center px-6 pb-[120px] sm:px-8">
      <div
        aria-live="polite"
        role="status"
        className="absolute size-px overflow-hidden [clip-path:inset(50%)]"
      >
        {announce}
      </div>

      <Header mode={modeLabel(screen.name, source?.recorded ?? false)} />

      {screen.name === "landing" && (
        <Landing
          onFiles={(files) => void choose(files)}
          onRecord={() => setScreen({ name: "perm", reason: "ask" })}
        />
      )}

      {screen.name === "perm" && (
        <PermissionGate
          reason={screen.reason}
          onGrant={() => void grant()}
          onBack={reset}
        />
      )}

      {screen.name === "armed" && (
        <Armed
          level={level}
          devices={devices}
          deviceId={deviceId}
          onDeviceChange={(id) => {
            setDeviceId(id);
            void grant();
          }}
          onStart={startRecording}
          onBack={reset}
        />
      )}

      {screen.name === "recording" && (
        <RecordingScreen
          elapsed={elapsed}
          paused={paused}
          history={history}
          onStop={() => void stopRecording()}
          onTogglePause={togglePause}
        />
      )}

      {screen.name === "review" && source && (
        <>
          <audio ref={setMedia} src={source.url} preload="metadata" className="hidden" />
          <Review
            length={source.duration}
            position={position}
            playing={reviewPlaying}
            onTogglePlay={toggleReview}
            onSeek={seek}
            onAnalyze={() => void prepareAndRun()}
            onDiscard={() => {
              releaseUrls();
              putSource(null);
              setScreen({ name: "armed" });
            }}
          />
        </>
      )}

      {screen.name === "preparing" && (
        <Preparing
          stage={prepare.stage}
          percent={prepare.percent}
          sourceLabel={`${formatBytes(source?.bytes ?? 0)} ${
            source?.hasVideo ? "video" : "audio"
          }`}
          targetLabel={`${formatBytes(targetBytes)} audio`}
        />
      )}

      {screen.name === "working" && <Working phase={phase} seconds={jobSeconds} />}

      {screen.name === "queued" && (
        <Failure
          label="Queued"
          message={QUEUED_MESSAGE}
          onPrimary={() => setScreen({ name: "working" })}
          onReset={reset}
          resetLabel="Start over"
        />
      )}

      {screen.name === "results" && source && (
        <Results
          clips={screen.clips}
          note={screen.note}
          shortfall={screen.shortfall}
          source={source}
          mediaRef={setMedia}
          position={position}
          playing={playing}
          copied={copied}
          onPlay={playClip}
          onSeek={seek}
          onCopyRange={(index) => {
            const clip = screen.clips[index];
            copy(index, "range", `${stamp(clip.start)} - ${stamp(clip.end)}`);
          }}
          onCopyCaption={(index) =>
            copy(index, "caption", screen.clips[index].caption)
          }
          onReset={reset}
        />
      )}

      {screen.name === "raw" && <RawPicks text={screen.text} onReset={reset} />}

      {screen.name === "failed" && (
        <Failure
          label={screen.label}
          message={screen.message}
          detail={screen.detail}
          onPrimary={() => {
            if (screen.retry === "run" && uploadRef.current) {
              void runJob(uploadRef.current.blob, uploadRef.current.filename);
            } else if (screen.retry === "prepare") {
              void prepareAndRun();
            } else {
              reset();
            }
          }}
          onReset={reset}
          resetLabel="Start over"
        />
      )}
    </div>
  );
}
