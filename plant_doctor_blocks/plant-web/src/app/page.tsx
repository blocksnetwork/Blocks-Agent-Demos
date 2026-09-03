"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AgentLog,
  STEP_LABELS,
  type LogEntry,
  type LogTone,
  type Step,
} from "@/components/AgentLog";
import { Button, FileButton } from "@/components/Button";
import { ConfidenceRing, type RingState } from "@/components/ConfidenceRing";
import { Differential } from "@/components/Differential";
import { MotionKit } from "@/components/MotionKit";
import { Panel } from "@/components/Panel";
import { PhotoStage } from "@/components/PhotoStage";
import { TopBar, type StatusTone } from "@/components/TopBar";
import { TreatmentPlan } from "@/components/TreatmentPlan";
import { runDiagnosis } from "@/lib/diagnose-client";
import { parseDiagnosis, type Diagnosis, type ResultLevel } from "@/lib/diagnosis";
import { evidenceFrom } from "@/lib/evidence";
import { ACCEPT_ATTRIBUTE } from "@/lib/limits";
import {
  FAILURE_MESSAGES,
  QUEUED_MESSAGE,
  noPlantMessage,
  notDiagnosableMessage,
  unreadableMessage,
  type MessageSpec,
  type MessageTone,
} from "@/lib/messages";
import { analyzePhoto, formatBytes, typeLabel, type Photo, type PhotoRejection } from "@/lib/photo";
import type { FailureKind } from "@/lib/protocol";
import kit from "../../design/design-kit.json";

/* Built to design/design-blueprint.md from design_blocks task 231582df
   ("Night Lab", faithful reference-transfer). Taken from the comp: a 64px
   app bar; a verdict band of screen title · diagnosis panel · confidence
   instrument overlapping it; a control strip; then the rail (agent stream
   over the differential) beside the photo, which bleeds off the right edge
   with the evidence markers pinned inside it; the treatment plan across the
   full width; a provenance line. Below 760px it linearises in that order.
   The upload → poll → parse flow (analyzePhoto, runDiagnosis,
   parseDiagnosis) is unchanged. */

/** How long "Asking the model" runs before the log admits it is taking a while. */
const SLOW_AFTER_SECONDS = 40;

/** The stage photograph is a licensed bank photo; its credit stays on screen. */
const HERO_CREDIT = kit.winner.heroCredit;
const HERO_ALT =
  "Macro photograph of a leaf beaded with water — the stage until you drop a photo";

const AGENT = "plant_doctor_blocks";

/** The file input lives in the control strip; every "choose" button opens it. */
const PHOTO_INPUT_ID = "photo-input";

type Phase =
  | { name: "idle" }
  | { name: "ready" }
  | { name: "running"; stage: "uploading" | "reading" | "asking" }
  | { name: "queued" }
  | { name: "done"; diagnosis: Diagnosis }
  | { name: "failed"; kind: FailureKind };

/** Something to say about the photo just chosen, or the one turned away. */
interface Notice {
  tone: MessageTone;
  title: string;
  body: string;
}

/** What a verdict button does; the page maps it to the handler when clicked. */
type Intent = "run" | "reset" | "keepWaiting";

type Action =
  | { kind: "button"; label: string; intent: Intent; variant?: "primary" | "muted" | "ghost" }
  | { kind: "file"; label: string; variant?: "primary" | "muted" | "ghost" };

/** What the diagnosis panel shows in every phase. */
interface Verdict {
  eyebrow: string;
  title: string;
  body: string;
  tone: "neutral" | "ok" | "warn" | "bad";
  chip?: string;
  actions: Action[];
}

const LEVELS: Record<ResultLevel, { word: string; urgency: string; tone: Verdict["tone"] }> = {
  good: {
    word: "Healthy",
    urgency: "Nothing urgent. Keep the current care and re-check in two weeks.",
    tone: "ok",
  },
  ok: {
    word: "Manageable",
    urgency: "Start the plan this week; most of these turn around within a month.",
    tone: "ok",
  },
  warn: {
    word: "Watch closely",
    urgency: "Act now, then re-photograph in ten days to compare.",
    tone: "warn",
  },
};

const RUNNING_COPY: Record<"uploading" | "reading" | "asking", { title: string; body: string }> = {
  uploading: {
    title: "Uploading the photo",
    body: "Large photos are re-encoded in the browser first, so nothing over 4 MB goes over the wire.",
  },
  reading: {
    title: "Reading the photo",
    body: "The agent has the image and is looking at the leaves, the soil and the light.",
  },
  asking: {
    title: "Asking the model",
    body: "This is the long part. Most runs answer in 8 to 25 seconds.",
  },
};

const SHOOT_TIPS = [
  "Daylight, no flash — leaf colour is most of the evidence",
  "The affected leaves in focus and filling the frame",
  "One plant per photo; JPEG, PNG or WebP under 10 MB",
];

const CHECK_TIPS = [
  "Identifies the plant and the part of it in view",
  "Reads leaf colour, texture, spots and edges for symptoms",
  "Names the likeliest cause, rates its certainty, writes the plan",
];

function clock(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function shortTask(taskId: string): string {
  return taskId.slice(0, 8);
}

function rejectionNotice(rejection: PhotoRejection, file: File): Notice {
  if (rejection.reason === "badtype") {
    return { tone: "coral", title: "That file type will not work", body: rejection.detail };
  }
  if (rejection.reason === "toobig") {
    return { tone: "coral", title: "That photo is too large", body: rejection.detail };
  }
  return {
    tone: "coral",
    title: "That image could not be opened",
    body: `The file says it is a ${typeLabel(file.type)} but the data is incomplete. Re-export it, or pick another photo.`,
  };
}

function acceptedNotice(photo: Photo, dropped: number): Notice | null {
  if (dropped > 1) {
    return {
      tone: "amber",
      title: "Only the first photo was used",
      body: `You dropped ${dropped} files. Plant Doctor diagnoses one photo at a time, so ${photo.name} was kept.`,
    };
  }
  if (photo.tiny) {
    return {
      tone: "amber",
      title: "This photo is very small",
      body: `${photo.width} × ${photo.height} px. The model can still look at it, but detail this coarse often lowers confidence.`,
    };
  }
  return null;
}

function noticeTone(tone: MessageTone): Verdict["tone"] {
  return tone === "coral" ? "bad" : tone === "amber" ? "warn" : "neutral";
}

/** The four dots in the agent stream, from the phase alone. */
function stepsFor(phase: Phase): Step[] {
  const mark = (done: number, then: Step["state"] = "todo"): Step[] =>
    STEP_LABELS.map((label, index) => ({
      label,
      state: index < done ? "done" : index === done ? then : "todo",
    }));

  switch (phase.name) {
    case "idle":
    case "ready":
      return mark(0);
    case "running":
      return mark(
        phase.stage === "uploading" ? 0 : phase.stage === "reading" ? 1 : 2,
        "active",
      );
    case "queued":
      return mark(1, "active");
    case "done":
      return mark(4);
    case "failed":
      return phase.kind === "timeout" ? mark(2, "failed") : mark(1, "failed");
  }
}

function statusFor(
  phase: Phase,
  finishedIn: string | null,
  parsed: boolean,
): { label: string; tone: StatusTone } {
  switch (phase.name) {
    case "idle":
      return { label: "idle", tone: "idle" };
    case "ready":
      return { label: "ready", tone: "idle" };
    case "running":
      return { label: phase.stage === "asking" ? "model running" : phase.stage, tone: "live" };
    case "queued":
      return { label: "queued", tone: "warn" };
    case "done":
      return { label: finishedIn ? `done in ${finishedIn}` : "done", tone: parsed ? "ok" : "warn" };
    case "failed":
      return { label: "failed", tone: "bad" };
  }
}

interface VerdictInput {
  phase: Phase;
  notice: Notice | null;
  seconds: number;
}

function fromMessage(message: MessageSpec, primary: Action): Verdict {
  return {
    eyebrow: "Diagnosis",
    title: message.title,
    body: message.body,
    tone: noticeTone(message.tone),
    actions: [primary, { kind: "button", label: message.secondary, intent: "reset", variant: "ghost" }],
  };
}

/** The diagnosis panel's copy and actions for every phase the screen can be in. */
function verdictFor({ phase, notice, seconds }: VerdictInput): Verdict {
  const retry: Action = { kind: "button", label: "Retry", intent: "run" };
  const startOver: Action = { kind: "button", label: "Start over", intent: "reset", variant: "ghost" };

  if (phase.name === "idle" && notice) {
    return {
      eyebrow: "Photo rejected",
      title: notice.title,
      body: notice.body,
      tone: noticeTone(notice.tone),
      actions: [{ kind: "file", label: "Choose another photo", variant: "primary" }],
    };
  }

  switch (phase.name) {
    case "idle":
      return {
        eyebrow: "Diagnosis",
        title: "Awaiting a photo",
        body: "Drop one photo of the plant. The diagnosis, its evidence and the treatment plan land here.",
        tone: "neutral",
        actions: [{ kind: "file", label: "Choose a photo", variant: "primary" }],
      };
    case "ready":
      return {
        eyebrow: notice ? "Note" : "Ready",
        title: notice ? notice.title : "Ready to diagnose",
        body: notice
          ? notice.body
          : "Press Run diagnosis. The agent reads the photo and answers in about ten seconds.",
        tone: notice ? noticeTone(notice.tone) : "neutral",
        actions: [{ kind: "button", label: "Run diagnosis", intent: "run" }],
      };
    case "running": {
      const copy = RUNNING_COPY[phase.stage];
      return {
        eyebrow: "Diagnosing",
        title: copy.title,
        body:
          phase.stage === "asking" && seconds >= SLOW_AFTER_SECONDS
            ? "Still going. Long runs happen on bigger photos — nothing has failed. The agent gives up at 180 seconds."
            : copy.body,
        tone: "neutral",
        actions: [{ kind: "button", label: "Cancel", intent: "reset", variant: "ghost" }],
      };
    }
    case "queued":
      return fromMessage(
        QUEUED_MESSAGE,
        { kind: "button", label: QUEUED_MESSAGE.primary, intent: "keepWaiting" },
      );
    case "failed":
      if (phase.kind === "timeout") {
        return {
          eyebrow: "No reply",
          title: "The model ran out of time",
          body: "The agent stopped after 180 seconds without a reply. Your photo is still loaded, so you can send it again without re-uploading.",
          tone: "bad",
          actions: [{ ...retry, label: "Try again" }, startOver],
        };
      }
      return fromMessage(
        FAILURE_MESSAGES[phase.kind],
        { ...retry, label: FAILURE_MESSAGES[phase.kind].primary },
      );
    case "done": {
      const result = phase.diagnosis;
      switch (result.kind) {
        case "parsed": {
          const level = LEVELS[result.level];
          return {
            eyebrow: "Primary diagnosis",
            title: result.diagnosis,
            body: level.urgency,
            tone: level.tone,
            chip: level.word,
            actions: [],
          };
        }
        case "raw":
          return {
            eyebrow: "Diagnosis",
            title: "Unstructured reply",
            body: "The model answered, but not in its usual four sections. The reply is shown below as received.",
            tone: "warn",
            actions: [{ ...retry, label: "Run again" }, startOver],
          };
        case "noplant": {
          const message = noPlantMessage(result);
          return fromMessage(message, { kind: "file", label: message.primary, variant: "primary" });
        }
        case "notdiagnosable": {
          const message = notDiagnosableMessage(result);
          return fromMessage(message, { kind: "file", label: message.primary, variant: "primary" });
        }
        case "unreadable": {
          const message = unreadableMessage(result.text);
          return fromMessage(message, { ...retry, label: message.primary });
        }
      }
    }
  }
}

export default function Home() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loadedAt, setLoadedAt] = useState<string>("");
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dragging, setDragging] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [finishedIn, setFinishedIn] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showMarkers, setShowMarkers] = useState(true);

  const photoRef = useRef<Photo | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const runStartRef = useRef(0);
  const logIdRef = useRef(0);
  const lastLineRef = useRef("");

  const appendLog = useCallback((text: string, tone: LogTone = "info") => {
    // The status route repeats the latest agent message on every poll.
    if (lastLineRef.current === text) return;
    lastLineRef.current = text;
    logIdRef.current += 1;
    const entry: LogEntry = { id: logIdRef.current, at: clock(), text, tone };
    setLog((current) => [...current, entry]);
  }, []);

  const elapsedLabel = useCallback(
    () => `${((Date.now() - runStartRef.current) / 1000).toFixed(1)}s`,
    [],
  );

  const replacePhoto = useCallback((next: Photo | null) => {
    const previous = photoRef.current;
    if (previous && previous !== next) URL.revokeObjectURL(previous.url);
    photoRef.current = next;
    setPhoto(next);
    setLoadedAt(next ? clock().slice(0, 5) : "");
  }, []);

  const run = useCallback(async () => {
    const current = photoRef.current;
    if (!current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    runStartRef.current = Date.now();
    setSeconds(0);
    setFinishedIn(null);
    setNotice(null);
    setPhase({ name: "running", stage: "uploading" });
    appendLog(`Uploading ${current.name} (${formatBytes(current.file.size)})`);

    try {
      await runDiagnosis(current.file, controller.signal, (event) => {
        switch (event.type) {
          case "accepted":
            if (event.queued) {
              setPhase({ name: "queued" });
              appendLog(`Task ${shortTask(event.taskId)} accepted · queued behind another photo`, "warn");
            } else {
              appendLog(`Task ${shortTask(event.taskId)} accepted by ${AGENT}`);
            }
            break;
          case "phase":
            setPhase({ name: "running", stage: event.phase });
            appendLog(
              event.message.trim() ||
                (event.phase === "reading" ? "Reading the photo…" : "Asking the model…"),
            );
            break;
          case "result": {
            const diagnosis = parseDiagnosis(event.markdown);
            const took = elapsedLabel();
            setFinishedIn(took);
            setPhase({ name: "done", diagnosis });
            switch (diagnosis.kind) {
              case "parsed":
                appendLog(`Diagnosis received in ${took}: ${diagnosis.diagnosis}`, "ok");
                break;
              case "noplant":
                appendLog(`Reply in ${took}: no plant found in the photo`, "warn");
                break;
              case "notdiagnosable":
                appendLog(`Reply in ${took}: the photo could not be read`, "warn");
                break;
              case "unreadable":
                appendLog(`Reply in ${took}: the agent could not open the image`, "bad");
                break;
              case "raw":
                appendLog(`Reply in ${took}, not in the usual four sections`, "warn");
                break;
            }
            break;
          }
          case "error":
            setFinishedIn(elapsedLabel());
            setPhase({ name: "failed", kind: event.kind });
            appendLog(event.message, "bad");
            break;
        }
      });
    } catch {
      if (controller.signal.aborted) return;
      setFinishedIn(elapsedLabel());
      setPhase({ name: "failed", kind: "network" });
      appendLog("The connection dropped before the agent answered", "bad");
    }
  }, [appendLog, elapsedLabel]);

  const choose = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      abortRef.current?.abort();
      const first = files[0];
      const outcome = await analyzePhoto(first);

      if (!outcome.ok) {
        const rejected = rejectionNotice(outcome, first);
        replacePhoto(null);
        setPhase({ name: "idle" });
        setNotice(rejected);
        appendLog(`Rejected ${first.name}: ${rejected.title.toLowerCase()}`, "bad");
        return;
      }

      replacePhoto(outcome.photo);
      setPhase({ name: "ready" });
      setFinishedIn(null);
      setShowMarkers(true);
      const accepted = acceptedNotice(outcome.photo, files.length);
      setNotice(accepted);
      appendLog(`Loaded ${outcome.photo.name} · ${outcome.photo.meta}`);
      if (accepted) appendLog(accepted.title, "warn");
    },
    [appendLog, replacePhoto],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    replacePhoto(null);
    setPhase({ name: "idle" });
    setNotice(null);
    setSeconds(0);
    setFinishedIn(null);
    appendLog("Cleared. Drop another photo to start again.");
  }, [appendLog, replacePhoto]);

  const startRun = useCallback(() => void run(), [run]);
  const keepWaiting = useCallback(
    () => setPhase({ name: "running", stage: "uploading" }),
    [],
  );

  const act = useCallback(
    (intent: Intent) => {
      if (intent === "run") startRun();
      else if (intent === "reset") reset();
      else keepWaiting();
    },
    [startRun, reset, keepWaiting],
  );

  useEffect(() => {
    appendLog("Ready. Drop a photo of the plant to start.");
  }, [appendLog]);

  useEffect(() => {
    busyRef.current = phase.name === "running" || phase.name === "queued";
  }, [phase.name]);

  useEffect(() => {
    if (phase.name !== "running" && phase.name !== "queued") return;
    const id = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [phase.name]);

  useEffect(() => {
    if (phase.name === "running" && phase.stage === "asking" && seconds === SLOW_AFTER_SECONDS) {
      appendLog("Still working — long runs happen on bigger photos; the agent gives up at 180s", "warn");
    }
  }, [phase, seconds, appendLog]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (busyRef.current) return;
      const files = event.clipboardData?.files;
      if (files && files.length > 0) void choose(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [choose]);

  // The verdict band is at the top; bring it back into view when the run lands.
  useEffect(() => {
    if (phase.name !== "done" && phase.name !== "failed") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [phase.name]);

  useEffect(
    () => () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
      abortRef.current?.abort();
    },
    [],
  );

  const busy = phase.name === "running" || phase.name === "queued";
  const diagnosis = phase.name === "done" ? phase.diagnosis : null;
  const parsed = diagnosis?.kind === "parsed" ? diagnosis : null;
  const refusal =
    diagnosis?.kind === "noplant" || diagnosis?.kind === "notdiagnosable" ? diagnosis : null;

  const evidence = useMemo(() => (parsed ? evidenceFrom(parsed.why) : []), [parsed]);

  const status = statusFor(phase, finishedIn, parsed !== null);
  const steps = stepsFor(phase);
  const verdict = verdictFor({ phase, notice, seconds });

  /* ---- Confidence instrument ---- */
  const ringState: RingState = parsed
    ? "result"
    : busy
      ? "working"
      : phase.name === "failed"
        ? "failed"
        : "idle";
  const ringContext = parsed
    ? parsed.confidenceNote ||
      `Rated ${parsed.confidence ?? "without a level"} by the model. ${evidence.length} evidence ${
        evidence.length === 1 ? "point is" : "points are"
      } pinned to the photo.`
    : busy
      ? "The model rates its own certainty once it has read the photo."
      : phase.name === "failed" || refusal
        ? "No rating — this run did not return a diagnosis."
        : "Arrives with the diagnosis: the model's own rating of how sure it is.";

  /* ---- The rail's lower panel ---- */
  const tips = refusal
    ? {
        eyebrow: "Before you re-shoot",
        title: "What would help",
        list: (refusal.kind === "noplant" ? noPlantMessage(refusal) : notDiagnosableMessage(refusal))
          .list,
      }
    : busy
      ? { eyebrow: "While it runs", title: "What the agent checks", list: CHECK_TIPS }
      : { eyebrow: "Before you shoot", title: "What the agent needs", list: SHOOT_TIPS };

  const screenTitle = photo ? "Plant scan" : "New scan";
  const specimen = photo
    ? `${photo.name} · ${loadedAt} · ${photo.width} × ${photo.height}`
    : "Drop a photo to begin · JPEG, PNG or WebP";

  return (
    <div className="doctor">
      <TopBar status={status} />

      <main className="screen" aria-label="Plant Doctor">
        {/* Verdict band: screen title · diagnosis · certainty instrument */}
        <div className="verdict">
          <div className="screen-head">
            <span className="eyebrow">Plant Doctor</span>
            <h1 className="screen-title">{screenTitle}</h1>
            <span className="specimen">{specimen}</span>
          </div>

          <Panel
            eyebrow={verdict.eyebrow}
            title={verdict.title}
            meta={
              verdict.chip && (
                <span className={`level-chip ${verdict.tone === "warn" ? "is-warn" : ""}`}>
                  {verdict.chip}
                </span>
              )
            }
            className={`verdict-panel tone-${verdict.tone}`}
            role="status"
            ariaLive="polite"
          >
            <p className="verdict-body">{verdict.body}</p>
            {verdict.actions.length > 0 && (
              <div className="verdict-actions">
                {verdict.actions.map((action) =>
                  action.kind === "file" ? (
                    <FileButton key={action.label} htmlFor={PHOTO_INPUT_ID} variant={action.variant}>
                      {action.label}
                    </FileButton>
                  ) : (
                    <Button key={action.label} onClick={() => act(action.intent)} variant={action.variant}>
                      {action.label}
                    </Button>
                  ),
                )}
              </div>
            )}
          </Panel>

          <ConfidenceRing
            state={ringState}
            confidence={parsed?.confidence ?? null}
            context={ringContext}
          />
        </div>

        {/* Control strip between the verdict band and the exhibit */}
        <div className="controls">
          <div className="controls-file">
            <span className="controls-name">{photo ? photo.name : "No photo loaded"}</span>
            <span className="controls-meta">
              {photo ? photo.meta : "JPEG, PNG or WebP · up to 10 MB"}
            </span>
          </div>
          <div className="controls-tools">
            <button
              type="button"
              className="toggle"
              aria-pressed={showMarkers && evidence.length > 0}
              disabled={evidence.length === 0}
              onClick={() => setShowMarkers((value) => !value)}
            >
              <span className="toggle-dot" aria-hidden="true" />
              Markers{evidence.length > 0 ? ` · ${evidence.length}` : ""}
            </button>
            {photo && !busy && (
              <FileButton htmlFor={PHOTO_INPUT_ID}>Replace photo</FileButton>
            )}
            {phase.name === "ready" && <Button onClick={startRun}>Run diagnosis</Button>}
            {busy && (
              <Button variant="muted" onClick={reset}>
                Cancel
              </Button>
            )}
            {(phase.name === "done" || phase.name === "failed") && (
              <Button onClick={startRun}>Run again</Button>
            )}
          </div>
          {/* The one file input on the page; the drop zone's own input is
              inside the stage, this one serves every button. */}
          {photo && (
            <input
              id={PHOTO_INPUT_ID}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              tabIndex={-1}
              aria-hidden="true"
              className="hidden-input"
              onChange={(event) => {
                void choose(event.target.files);
                event.target.value = "";
              }}
            />
          )}
        </div>

        {/* The rail: agent stream over the differential */}
        <div className="rail">
          <AgentLog
            entries={log}
            steps={steps}
            live={busy}
            meta={busy ? `${seconds}s` : finishedIn ? `run ${finishedIn}` : "idle"}
          />

          {parsed ? (
            <Differential
              diagnosis={parsed.diagnosis}
              confidence={parsed.confidence}
              evidence={evidence}
            />
          ) : (
            <Panel eyebrow={tips.eyebrow} title={tips.title} className="tips-panel">
              <ol className="tip-list" data-reveal-group>
                {tips.list.map((tip, index) => (
                  <li key={tip} className="tip-row">
                    <span className="tip-num">{index + 1}</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>

        {/* The subject */}
        <div className="exhibit">
          <PhotoStage
            photo={photo}
            dragging={dragging}
            busy={busy}
            onDraggingChange={setDragging}
            onFiles={(files) => void choose(files)}
            markers={evidence}
            showMarkers={showMarkers}
            heroAlt={HERO_ALT}
          />
        </div>

        {/* The plan, full width, once there is one */}
        {parsed && parsed.fix.length > 0 && (
          <div className="plan-area">
            <TreatmentPlan steps={parsed.fix} onReset={reset} onRerun={startRun} />
          </div>
        )}
        {diagnosis?.kind === "raw" && (
          <div className="plan-area">
            <Panel
              eyebrow="Reply"
              title="The reply, as received"
              meta={`${diagnosis.text.length} characters`}
            >
              <pre className="raw-reply">{diagnosis.text}</pre>
            </Panel>
          </div>
        )}

        <div className="provenance">
          <span>
            agent {AGENT} on the Blocks network
            {finishedIn ? ` · model run ${finishedIn}` : " · one photo at a time"}
          </span>
          <span>
            Stage photograph: <span dangerouslySetInnerHTML={{ __html: HERO_CREDIT }} />
          </span>
        </div>
      </main>

      <MotionKit key={`${phase.name}-${photo ? "photo" : "empty"}-${evidence.length}`} />
    </div>
  );
}
