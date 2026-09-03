import { useState } from "react";

import {
  confidenceBadge,
  type Confidence,
  type ParsedDiagnosis,
  type ResultLevel,
} from "@/lib/diagnosis";
import { ANCHORS, FRAMES, Slot } from "./composition";
import { ConfidencePin, EvidencePin } from "./Pins";
import { PillButton } from "./PillButton";

const LEVELS: Record<
  ResultLevel,
  { word: string; urgency: string; tone: string }
> = {
  good: { word: "Healthy", urgency: "Nothing urgent", tone: "level-good" },
  ok: { word: "Manageable", urgency: "Start the plan this week", tone: "level-ok" },
  warn: { word: "Watch closely", urgency: "Act now, then re-check", tone: "level-warn" },
};

const RING: Record<Confidence, number> = { high: 0.92, medium: 0.62, low: 0.34 };

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

interface ResultPanelProps {
  result: ParsedDiagnosis;
  onReset: () => void;
  /** The uploaded photo, so the evidence lens magnifies it and the pins attach to it. */
  photoUrl?: string | null;
}

/**
 * The diagnosis, laid across the blueprint's frames: confidence and evidence
 * pinned onto the photo, the diagnosis name and level in `severity-badge`,
 * the why and the numbered plan in `treatment-plan`.
 */
export function ResultPanel({ result, onReset, photoUrl = null }: ResultPanelProps) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const level = LEVELS[result.level];
  const badge = confidenceBadge(result.confidence);
  const confidenceWord = result.confidence
    ? result.confidence[0].toUpperCase() + result.confidence.slice(1)
    : "n/a";
  const target = photoUrl ? "subject-photo" : "leafSubject";

  return (
    <>
      <ConfidencePin
        value={confidenceWord}
        caption={badge ? "the model's own rating" : "not stated by the model"}
        anchor={{
          target,
          at: photoUrl ? ANCHORS.confidenceOnPhoto : ANCHORS.confidenceOnLeaf,
        }}
      />
      <EvidencePin
        imageUrl={photoUrl}
        value="Evidence"
        caption="pinned to the photo"
        fraction={RING[result.confidence ?? "low"]}
        anchor={{
          target,
          at: photoUrl ? ANCHORS.anatomyOnPhoto : ANCHORS.anatomyOnLeaf,
        }}
      />

      <Slot
        id="severity-badge"
        frame={FRAMES.severityBadge}
        surface="solid"
        anchor={{ target: "progress-stream", at: ANCHORS.streamFoot }}
        className={`severity-slot ${level.tone}`}
        role="status"
        ariaLabel="Diagnosis"
      >
        <span className="label">Diagnosis</span>
        <h2 data-reveal className="diagnosis-title">
          {result.diagnosis}
        </h2>
        <div className="severity-row">
          <span className="value">{level.word}</span>
          <span className="severity-urgency">{level.urgency}</span>
        </div>
        {result.confidenceNote && (
          <div className="severity-note">{result.confidenceNote}</div>
        )}
      </Slot>

      <Slot
        id="treatment-plan"
        frame={FRAMES.treatmentPlan}
        surface="solid"
        anchor={{ target: "progress-stream", at: ANCHORS.streamFoot }}
        className="treatment-slot"
        ariaLabel="Evidence and treatment plan"
      >
        <span className="label">Why</span>
        <div className="why-text">{result.why}</div>

        {result.fix.length > 0 && (
          <>
            <div className="plan-head">
              <span className="label">Treatment plan</span>
              <span className="text-[12px] text-mute">
                {result.fix.length} {result.fix.length === 1 ? "step" : "steps"}
              </span>
            </div>

            <ol className="fix-list" data-reveal-group>
              {result.fix.map((step, index) => {
                const checked = Boolean(done[index]);

                return (
                  <li key={step}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      onClick={() =>
                        setDone((current) => ({
                          ...current,
                          [index]: !current[index],
                        }))
                      }
                      className="fix-step"
                    >
                      <span className="fix-num">
                        {checked ? <CheckIcon /> : index + 1}
                      </span>
                      <span className="fix-text">{step}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <div className="mt-auto self-start pt-3">
          <PillButton variant="white" onClick={onReset}>
            Diagnose another photo
          </PillButton>
        </div>
      </Slot>
    </>
  );
}
