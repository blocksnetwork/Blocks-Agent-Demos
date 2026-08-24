"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, type AlertTone } from "@/components/Alert";
import { DropZone } from "@/components/DropZone";
import { EmptyPanel } from "@/components/EmptyPanel";
import { Header } from "@/components/Header";
import { MessagePanel } from "@/components/MessagePanel";
import { PhotoCard } from "@/components/PhotoCard";
import { ProgressPanel, type ProgressStage } from "@/components/ProgressPanel";
import { RawPanel } from "@/components/RawPanel";
import { ResultPanel } from "@/components/ResultPanel";
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

/** How long "Asking the model…" runs before we admit it is taking a while. */
const SLOW_AFTER_SECONDS = 40;

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

  return (
    <div className="flex min-h-screen flex-col items-center px-8 pt-10 pb-24">
      <div className="flex w-full max-w-[1100px] flex-col gap-8">
        <Header />

        <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] items-start gap-7">
          <section className="flex min-w-0 flex-col gap-4">
            {alert && (
              <Alert tone={alert.tone} title={alert.title} body={alert.body} />
            )}

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
          </section>

          <section aria-live="polite" className="flex min-w-0 flex-col gap-4">
            <RightPanel
              phase={phase}
              stage={stage}
              seconds={seconds}
              onRetry={() => void run()}
              onReset={reset}
              onKeepWaiting={() =>
                setPhase({ name: "running", stage: "uploading" })
              }
            />
          </section>
        </div>
      </div>
    </div>
  );
}

interface RightPanelProps {
  phase: Phase;
  stage: ProgressStage;
  seconds: number;
  onRetry: () => void;
  onReset: () => void;
  onKeepWaiting: () => void;
}

function RightPanel({
  phase,
  stage,
  seconds,
  onRetry,
  onReset,
  onKeepWaiting,
}: RightPanelProps) {
  if (phase.name === "running") {
    return <ProgressPanel stage={stage} seconds={seconds} onRetry={onRetry} />;
  }

  if (phase.name === "queued") {
    return (
      <MessagePanel
        message={QUEUED_MESSAGE}
        onPrimary={onKeepWaiting}
        onSecondary={onReset}
      />
    );
  }

  if (phase.name === "failed") {
    // A timeout is a run that got all the way to the model and stalled there,
    // so it stays in the progress panel with the second step marked failed.
    if (phase.kind === "timeout") {
      return (
        <ProgressPanel stage="timeout" seconds={seconds} onRetry={onRetry} />
      );
    }
    return (
      <MessagePanel
        message={FAILURE_MESSAGES[phase.kind]}
        onPrimary={onRetry}
        onSecondary={onReset}
      />
    );
  }

  if (phase.name === "done") {
    const { diagnosis } = phase;

    switch (diagnosis.kind) {
      case "parsed":
        return <ResultPanel result={diagnosis} onReset={onReset} />;
      case "raw":
        return <RawPanel text={diagnosis.text} onReset={onReset} />;
      case "noplant":
        return (
          <MessagePanel
            message={noPlantMessage(diagnosis)}
            onPrimary={onReset}
            onSecondary={onReset}
          />
        );
      case "notdiagnosable":
        return (
          <MessagePanel
            message={notDiagnosableMessage(diagnosis)}
            onPrimary={onReset}
            onSecondary={onReset}
          />
        );
      case "unreadable":
        return (
          <MessagePanel
            message={unreadableMessage(diagnosis.text)}
            onPrimary={onRetry}
            onSecondary={onReset}
          />
        );
    }
  }

  return <EmptyPanel />;
}
