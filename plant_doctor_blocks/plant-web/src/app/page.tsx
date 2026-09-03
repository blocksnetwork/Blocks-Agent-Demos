"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, type AlertTone } from "@/components/Alert";
import { DropZone } from "@/components/DropZone";
import { EmptyPanel } from "@/components/EmptyPanel";
import { Header } from "@/components/Header";
import { LeaderLines } from "@/components/LeaderLines";
import { MessagePanel } from "@/components/MessagePanel";
import { PhotoCard } from "@/components/PhotoCard";
import { ConfidencePin, EvidencePin } from "@/components/Pins";
import {
  FlowLine,
  ProgressPanel,
  StatusRing,
  stepsUpTo,
  type ProgressStage,
} from "@/components/ProgressPanel";
import { RawPanel } from "@/components/RawPanel";
import { ResultPanel } from "@/components/ResultPanel";
import { ANCHORS, FRAMES, Slot } from "@/components/composition";
import { parseDiagnosis, type Diagnosis } from "@/lib/diagnosis";
import {
  FAILURE_MESSAGES,
  QUEUED_MESSAGE,
  noPlantMessage,
  notDiagnosableMessage,
  unreadableMessage,
} from "@/lib/messages";
import { analyzePhoto, typeLabel, type Photo, type PhotoRejection } from "@/lib/photo";
import type { FailureKind } from "@/lib/protocol";
import { runDiagnosis } from "@/lib/diagnose-client";
import { MotionKit } from "./journal/MotionKit";
import kit from "../../design/design-kit.json";

/* Built to design/design-blueprint.md from design_blocks task 9c964a89
   ("Textured Botanical", faithful reference-transfer): one 1440 × 2722
   canvas, the leaf subject as a top-left mass bleeding off two edges, a
   credit strip crossing it, confidence and evidence pinned onto the photo
   with live leader lines, and the flow line · headline · status ring ·
   severity · treatment plan stacked down the left edge on plane 2. Below
   760px the canvas linearises in DOM order. The diagnose flow — DropZone →
   ProgressPanel → ResultPanel over /api/diagnose — is unchanged. */

/** How long "Asking the model…" runs before we admit it is taking a while. */
const SLOW_AFTER_SECONDS = 40;

/** The hero is a licensed bank photograph; its credit stays visible near it. */
const HERO_CREDIT = kit.winner.heroCredit;

type Phase =
  | { name: "idle" }
  | { name: "ready" }
  | { name: "running"; stage: "uploading" | "reading" | "asking" }
  | { name: "queued" }
  | { name: "done"; diagnosis: Diagnosis }
  | { name: "failed"; kind: FailureKind };

interface AlertState {
  tone: AlertTone;
  title: string;
  body: string;
}

function rejectionAlert(rejection: PhotoRejection, file: File): AlertState {
  if (rejection.reason === "badtype") {
    return {
      tone: "coral",
      title: "That file type will not work",
      body: rejection.detail,
    };
  }
  if (rejection.reason === "toobig") {
    return {
      tone: "coral",
      title: "That photo is too large",
      body: rejection.detail,
    };
  }
  return {
    tone: "coral",
    title: "That image could not be opened",
    body: `The file says it is a ${typeLabel(file.type)} but the data is incomplete. Re-export it, or pick another photo.`,
  };
}

function acceptedAlert(photo: Photo, dropped: number): AlertState | null {
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

export default function Home() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const photoRef = useRef<Photo | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const canvasRef = useRef<HTMLElement | null>(null);

  const replacePhoto = useCallback((next: Photo | null) => {
    const previous = photoRef.current;
    if (previous && previous !== next) URL.revokeObjectURL(previous.url);
    photoRef.current = next;
    setPhoto(next);
  }, []);

  const run = useCallback(async () => {
    const current = photoRef.current;
    if (!current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSeconds(0);
    setPhase({ name: "running", stage: "uploading" });

    try {
      await runDiagnosis(current.file, controller.signal, (event) => {
        switch (event.type) {
          case "accepted":
            if (event.queued) setPhase({ name: "queued" });
            break;
          case "phase":
            setPhase({ name: "running", stage: event.phase });
            break;
          case "result":
            setPhase({ name: "done", diagnosis: parseDiagnosis(event.markdown) });
            break;
          case "error":
            setPhase({ name: "failed", kind: event.kind });
            break;
        }
      });
    } catch {
      if (controller.signal.aborted) return;
      setPhase({ name: "failed", kind: "network" });
    }
  }, []);

  const choose = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      abortRef.current?.abort();
      const first = files[0];
      const outcome = await analyzePhoto(first);

      if (!outcome.ok) {
        replacePhoto(null);
        setPhase({ name: "idle" });
        setAlert(rejectionAlert(outcome, first));
        return;
      }

      replacePhoto(outcome.photo);
      setPhase({ name: "ready" });
      setAlert(acceptedAlert(outcome.photo, files.length));
    },
    [replacePhoto],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    replacePhoto(null);
    setPhase({ name: "idle" });
    setAlert(null);
    setSeconds(0);
  }, [replacePhoto]);

  useEffect(() => {
    busyRef.current = phase.name === "running";
  }, [phase.name]);

  useEffect(() => {
    if (phase.name !== "running") return;
    const id = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [phase.name]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (busyRef.current) return;
      const files = event.clipboardData?.files;
      if (files && files.length > 0) void choose(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [choose]);

  // The progress and the diagnosis live in the lower-left frames of the
  // composition; bring them into view when the agent starts and when it lands.
  useEffect(() => {
    if (phase.name !== "running" && phase.name !== "done") return;
    document
      .querySelector('[data-id="treatment-plan"]')
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [phase.name]);

  useEffect(
    () => () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
      abortRef.current?.abort();
    },
    [],
  );

  const busy = phase.name === "running";
  const timedOut = phase.name === "failed" && phase.kind === "timeout";

  const stage: ProgressStage = timedOut
    ? "timeout"
    : phase.name === "running" &&
        phase.stage === "asking" &&
        seconds >= SLOW_AFTER_SECONDS
      ? "slow"
      : phase.name === "running"
        ? phase.stage
        : "uploading";

  const resultShown =
    phase.name === "done" && phase.diagnosis.kind === "parsed";

  return (
    <div className="doctor-theme min-h-screen">
      <main ref={canvasRef} className="doctor-canvas" aria-label="Plant Doctor">
        {/* nav-ghost — plane 2, full width, 66px. */}
        <Slot id="nav-ghost" frame={FRAMES.navGhost} surface="outline" className="nav-slot">
          <Header />
        </Slot>

        {/* headline-in-flow — the vertical flow line carries the headline
            down the left edge; display type fills the frame. */}
        <Slot
          id="headline-stream"
          frame={FRAMES.headlineStream}
          surface="solid"
          anchor={{ target: "leafSubject", at: ANCHORS.leafFoot }}
          className="headline-slot"
        >
          <h1 data-reveal>
            Plant
            <br />
            Doctor
          </h1>
          <p>drop a photo of a sick plant and an AI agent names what is wrong</p>
        </Slot>

        {/* leafSubject — the focal mass, plane 1, bleeding off the top and
            left. The hero cutout fills the frame; the on-canvas part is the
            stage where the drop zone and then the uploaded photo live, so
            the pins attach to real imagery. */}
        <Slot id="leafSubject" frame={FRAMES.leafSubject} className="subject-slot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/doctor-hero.png"
            alt=""
            className="subject-hero"
            width={1024}
            height={1024}
          />
          <div className="subject-stage">
            {alert && (
              <div className="stage-alert">
                <Alert tone={alert.tone} title={alert.title} body={alert.body} />
              </div>
            )}

            <div className="subject-media" data-id="subject-photo">
              {photo ? (
                <PhotoCard
                  photo={photo}
                  busy={busy}
                  canRemove={phase.name === "ready"}
                  showDiagnose={phase.name === "ready"}
                  onRemove={reset}
                  onDiagnose={() => void run()}
                />
              ) : (
                <DropZone
                  dragging={dragging}
                  onFiles={(files) => void choose(files)}
                  onDraggingChange={setDragging}
                />
              )}
            </div>
          </div>
        </Slot>

        {/* footer-text — the strip that crosses the leaf; carries the hero
            credit so it stays visible beside the image it belongs to. */}
        <Slot id="footer-line" frame={FRAMES.footerLine} surface="solid" className="credit-slot">
          <span className="font-display font-semibold text-ink">Plant Doctor</span>
          <span>Clinical diagnosis guidance from an agent on the Blocks network.</span>
          <span aria-hidden="true">·</span>
          <span>
            Leaf: <span dangerouslySetInnerHTML={{ __html: HERO_CREDIT }} />
          </span>
        </Slot>

        {/* Floating sticker at plane 3, on the leaf's right edge. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/stickers/doctor-mini.svg"
          alt=""
          width={250}
          height={84}
          data-float
          data-float-rotate="-3deg"
          className="sticker"
          style={{ left: "61%", top: "17.6%", width: "17.4%", zIndex: 33 }}
        />

        <RightPanel
          phase={phase}
          stage={stage}
          seconds={seconds}
          photoUrl={photo?.url ?? null}
          onRetry={() => void run()}
          onReset={reset}
          onKeepWaiting={() =>
            setPhase({ name: "running", stage: "uploading" })
          }
        />

        {!resultShown && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/stickers/doctor-stat.svg"
            alt=""
            width={220}
            height={96}
            data-float
            data-float-rotate="3deg"
            className="sticker"
            style={{ left: "24%", top: "76.5%", width: "15.3%", zIndex: 35 }}
          />
        )}

        <LeaderLines canvasRef={canvasRef} />
      </main>

      {/* The journal's port of design-motion.js; keyed on the phase so reveals
          and float phases re-wire whenever a new frame mounts. */}
      <MotionKit key={`${phase.name}-${photo ? "photo" : "empty"}`} />
    </div>
  );
}

interface RightPanelProps {
  phase: Phase;
  stage: ProgressStage;
  seconds: number;
  photoUrl: string | null;
  onRetry: () => void;
  onReset: () => void;
  onKeepWaiting: () => void;
}

/** `severity-badge` before there is a diagnosis to put in it. */
function SeverityNote({ title, body }: { title: string; body: string }) {
  return (
    <Slot
      id="severity-badge"
      frame={FRAMES.severityBadge}
      surface="solid"
      anchor={{ target: "progress-stream", at: ANCHORS.streamFoot }}
      className="severity-slot"
    >
      <span className="label">Diagnosis</span>
      <h2 data-reveal className="diagnosis-title">
        {title}
      </h2>
      <div className="severity-note">{body}</div>
    </Slot>
  );
}

/**
 * Everything that follows the agent: the flow line, the status ring, the two
 * pins and the severity and treatment frames — each phase fills the same
 * frames with what it has.
 */
function RightPanel({
  phase,
  stage,
  seconds,
  photoUrl,
  onRetry,
  onReset,
  onKeepWaiting,
}: RightPanelProps) {
  // The pins always point at the on-canvas subject: the drop zone before a
  // photo exists, the photo itself afterwards.
  const target = "subject-photo";
  const confidenceAt = ANCHORS.confidenceOnPhoto;
  const anatomyAt = ANCHORS.anatomyOnPhoto;

  const pins = (value: string, caption: string) => (
    <>
      <ConfidencePin
        value={value}
        caption={caption}
        anchor={{ target, at: confidenceAt }}
      />
      <EvidencePin
        imageUrl={photoUrl ?? "/doctor-hero.png"}
        value="Evidence"
        caption="pinned once diagnosed"
        fraction={0}
        anchor={{ target, at: anatomyAt }}
      />
    </>
  );

  if (phase.name === "running") {
    return (
      <>
        {pins("…", "diagnosing")}
        <SeverityNote
          title="Diagnosing…"
          body="The agent is reading your photo. The name, the level and the plan land here."
        />
        <ProgressPanel stage={stage} seconds={seconds} onRetry={onRetry} />
      </>
    );
  }

  if (phase.name === "queued") {
    return (
      <>
        <FlowLine steps={stepsUpTo(1, "active")} />
        <StatusRing value="Queued" fraction={0.4} />
        {pins("…", "queued")}
        <SeverityNote
          title="Waiting in line"
          body="The model finishes the photo ahead of yours first."
        />
        <MessagePanel
          message={QUEUED_MESSAGE}
          onPrimary={onKeepWaiting}
          onSecondary={onReset}
        />
      </>
    );
  }

  if (phase.name === "failed") {
    // A timeout is a run that got all the way to the model and stalled there,
    // so it stays in the progress panel with the second step marked failed.
    if (phase.kind === "timeout") {
      return (
        <>
          {pins("—", "no reply")}
          <SeverityNote
            title="No diagnosis yet"
            body="The model ran out of time. Send the same photo again."
          />
          <ProgressPanel stage="timeout" seconds={seconds} onRetry={onRetry} />
        </>
      );
    }
    return (
      <>
        <FlowLine steps={stepsUpTo(2, "failed")} />
        <StatusRing value="Failed" fraction={0.62} />
        {pins("—", "no reply")}
        <SeverityNote
          title="No diagnosis yet"
          body="The request did not make it back. Retry with the photo already loaded."
        />
        <MessagePanel
          message={FAILURE_MESSAGES[phase.kind]}
          onPrimary={onRetry}
          onSecondary={onReset}
        />
      </>
    );
  }

  if (phase.name === "done") {
    const { diagnosis } = phase;
    const finished = (
      <>
        <FlowLine steps={stepsUpTo(4)} />
        <StatusRing value="Done" fraction={1} />
      </>
    );

    switch (diagnosis.kind) {
      case "parsed":
        return (
          <>
            {finished}
            <ResultPanel result={diagnosis} onReset={onReset} photoUrl={photoUrl} />
          </>
        );
      case "raw":
        return (
          <>
            {finished}
            {pins("n/a", "reply did not parse")}
            <SeverityNote
              title="Unstructured reply"
              body="The model answered, but not in its usual four sections."
            />
            <RawPanel text={diagnosis.text} onReset={onReset} />
          </>
        );
      case "noplant":
        return (
          <>
            {finished}
            {pins("—", "nothing to rate")}
            <SeverityNote
              title="No plant found"
              body="The model saw no plant to diagnose in this photo."
            />
            <MessagePanel
              message={noPlantMessage(diagnosis)}
              onPrimary={onReset}
              onSecondary={onReset}
            />
          </>
        );
      case "notdiagnosable":
        return (
          <>
            {finished}
            {pins("—", "nothing to rate")}
            <SeverityNote
              title="Not diagnosable"
              body="The photo did not carry enough detail for a diagnosis."
            />
            <MessagePanel
              message={notDiagnosableMessage(diagnosis)}
              onPrimary={onReset}
              onSecondary={onReset}
            />
          </>
        );
      case "unreadable":
        return (
          <>
            {finished}
            {pins("—", "nothing to rate")}
            <SeverityNote
              title="Photo not received"
              body="The agent could not open the image it was sent."
            />
            <MessagePanel
              message={unreadableMessage(diagnosis.text)}
              onPrimary={onRetry}
              onSecondary={onReset}
            />
          </>
        );
    }
  }

  const ready = phase.name === "ready";
  return (
    <>
      <FlowLine steps={stepsUpTo(0, ready ? "active" : "todo")} />
      <StatusRing value={ready ? "Ready" : "Idle"} fraction={ready ? 0.25 : 0.06} />
      {pins("—", ready ? "press Diagnose" : "after diagnosis")}
      <SeverityNote
        title={ready ? "Ready when you are" : "Awaiting a photo"}
        body={
          ready
            ? "Press Diagnose above the photo. The name, the level and the plan land here."
            : "Drop one photo of the plant. The diagnosis name and its level land here."
        }
      />
      <EmptyPanel />
    </>
  );
}
