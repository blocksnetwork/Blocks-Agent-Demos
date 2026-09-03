import { useEffect, useRef } from "react";

import { Panel } from "./Panel";

export type LogTone = "info" | "ok" | "warn" | "bad";

export interface LogEntry {
  id: number;
  /** Wall-clock HH:MM:SS when the line was written. */
  at: string;
  text: string;
  tone: LogTone;
}

export type StepState = "todo" | "active" | "done" | "failed";

export interface Step {
  label: string;
  state: StepState;
}

/** The four stages a run walks through, in order. */
export const STEP_LABELS = ["Upload", "Read", "Model", "Diagnosis"] as const;

interface AgentLogProps {
  entries: LogEntry[];
  steps: Step[];
  live: boolean;
  /** Right-hand meta: elapsed while running, total once landed. */
  meta: string;
}

/**
 * The agent's progress: the blueprint's dot field as a four-step tracker,
 * then every line the run produced as a timestamped monospace log, oldest
 * first, the latest emphasised. The rail's top panel.
 */
export function AgentLog({ entries, steps, live, meta }: AgentLogProps) {
  const bodyRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [entries.length]);

  const summary = steps.map((step) => `${step.label} ${step.state}`).join(", ");

  return (
    <Panel
      id="agent-stream"
      eyebrow="Agent stream"
      title={
        <span className="log-title">
          <span className={`live-dot ${live ? "is-live" : ""}`} aria-hidden="true" />
          plant_doctor_blocks
        </span>
      }
      meta={meta}
      className="log-panel"
      ariaLabel="Agent progress"
    >
      <ol className="steps" aria-label={`Run steps: ${summary}`}>
        {steps.map((step) => (
          <li key={step.label} className={`step is-${step.state}`}>
            <span className="step-dot" aria-hidden="true" />
            <span className="step-label">{step.label}</span>
          </li>
        ))}
      </ol>

      <ol className="log" ref={bodyRef} role="log" aria-live="polite">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            className={`log-line tone-${entry.tone} ${
              index === entries.length - 1 ? "is-latest" : ""
            }`}
          >
            <span className="log-at">{entry.at}</span>
            <span className="log-text">{entry.text}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
