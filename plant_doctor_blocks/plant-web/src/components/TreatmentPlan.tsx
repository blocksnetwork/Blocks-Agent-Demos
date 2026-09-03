import { useState } from "react";

import { Button } from "./Button";
import { Panel } from "./Panel";

interface TreatmentPlanProps {
  steps: string[];
  onReset: () => void;
  onRerun: () => void;
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
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

/** The numbered plan across the full width, each step checkable as it is done. */
export function TreatmentPlan({ steps, onReset, onRerun }: TreatmentPlanProps) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <Panel
      id="treatment"
      eyebrow="Treatment plan"
      title="Do this next"
      meta={`${steps.length} ${steps.length === 1 ? "step" : "steps"} · ${doneCount} done`}
      className="plan-panel"
      ariaLabel="Treatment plan"
      footer={
        <div className="plan-actions">
          <Button variant="muted" onClick={onRerun}>
            Run again
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Diagnose another photo
          </Button>
        </div>
      }
    >
      <ol className="plan-list" data-reveal-group>
        {steps.map((step, index) => {
          const checked = Boolean(done[index]);
          return (
            <li key={`${index}-${step}`}>
              <button
                type="button"
                aria-pressed={checked}
                onClick={() =>
                  setDone((current) => ({ ...current, [index]: !current[index] }))
                }
                className={`plan-step ${checked ? "is-done" : ""}`}
              >
                <span className="plan-num">{checked ? <CheckIcon /> : index + 1}</span>
                <span className="plan-text">{step}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
