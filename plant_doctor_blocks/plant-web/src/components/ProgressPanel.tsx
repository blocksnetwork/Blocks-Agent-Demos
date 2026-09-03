import { ANCHORS, arcPath, FRAMES, Slot } from "./composition";
import { PillButton } from "./PillButton";

export type ProgressStage =
  | "uploading"
  | "reading"
  | "asking"
  | "slow"
  | "timeout";

export type StepState = "todo" | "active" | "done" | "failed";

export interface Step {
  label: string;
  state: StepState;
}

/** The four nodes on the blueprint's flow line, in the order the agent walks them. */
export const STEP_LABELS = [
  "Upload",
  "Reading the photo",
  "Asking the model",
  "Diagnosis",
] as const;

export function stepsForStage(stage: ProgressStage): Step[] {
  if (stage === "timeout") {
    return STEP_LABELS.map((label, index) => ({
      label,
      state: index < 2 ? "done" : index === 2 ? "failed" : "todo",
    }));
  }
  const reached = stage === "uploading" ? 0 : stage === "reading" ? 1 : 2;
  return STEP_LABELS.map((label, index) => ({
    label,
    state: index < reached ? "done" : index === reached ? "active" : "todo",
  }));
}

export function stepsUpTo(done: number, then: StepState = "todo"): Step[] {
  return STEP_LABELS.map((label, index) => ({
    label,
    state: index < done ? "done" : index === done ? then : "todo",
  }));
}

const STAGES: Record<ProgressStage, { title: string; note: string }> = {
  uploading: { title: "Uploading your photo", note: "" },
  reading: { title: "Reading the photo…", note: "" },
  asking: {
    title: "Asking the model…",
    note: "This is the long part. It usually takes 8 to 25 seconds.",
  },
  slow: {
    title: "Asking the model…",
    note: "Still going. Long runs happen on bigger photos — nothing has failed. The agent gives up at 180 seconds.",
  },
  timeout: {
    title: "The model ran out of time",
    note: "The agent stopped after 180 seconds without a reply. Your photo is still loaded, so you can send it again without re-uploading.",
  },
};

const NODE_X = 128;
const NODE_Y = [150, 470, 790, 1110];

function nodeColor(state: StepState): string {
  switch (state) {
    case "done":
      return "var(--design-primary-strong)";
    case "active":
      return "var(--design-primary)";
    case "failed":
      return "#b4483c";
    default:
      return "var(--design-border)";
  }
}

function stateWord(state: StepState): string {
  return state === "todo" ? "pending" : state;
}

/**
 * `progress-stream` — the blueprint's flowLine viz: a vertical dotted line
 * with one node per step, running down the left edge of the canvas. The one
 * accent carrier on the page. Below 760px the SVG hands over to a plain list.
 */
export function FlowLine({ steps }: { steps: Step[] }) {
  const summary = steps
    .map((step) => `${step.label} ${stateWord(step.state)}`)
    .join(", ");

  return (
    <Slot
      id="progress-stream"
      frame={FRAMES.progressStream}
      surface="glass"
      anchor={{ target: "leafSubject", at: ANCHORS.leafFootStream }}
      className="stream-slot"
    >
      <svg
        className="viz"
        viewBox="0 0 173 1276"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Diagnosis steps: ${summary}`}
      >
        <path
          d={`M ${NODE_X} ${NODE_Y[0]} L ${NODE_X} ${NODE_Y[3]}`}
          fill="none"
          stroke="var(--design-border)"
          strokeWidth="2.5"
          strokeDasharray="1 7"
          strokeLinecap="round"
        />
        {steps.map((step, index) => {
          const y = NODE_Y[index];
          const on = step.state !== "todo";
          return (
            <g key={step.label}>
              {step.state === "active" && (
                <circle
                  cx={NODE_X}
                  cy={y}
                  r="15"
                  fill="var(--design-primary)"
                  opacity="0.18"
                />
              )}
              <circle
                cx={NODE_X}
                cy={y}
                r={on ? 7 : 5}
                fill={nodeColor(step.state)}
              />
              <text
                x={NODE_X - 18}
                y={y}
                transform={`rotate(-90 ${NODE_X - 18} ${y})`}
                textAnchor="middle"
                className={`flow-label ${on ? "is-on" : ""}`}
              >
                {step.label}
              </text>
            </g>
          );
        })}
      </svg>

      <ol className="step-list" aria-hidden="true">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-3 text-[14px]">
            <span
              className="size-[10px] flex-none rounded-full"
              style={{ background: nodeColor(step.state) }}
            />
            <span className={step.state === "todo" ? "text-body" : "text-ink font-medium"}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </Slot>
  );
}

/** `agent-status` — the blueprint's status ring, pinned to the flow line's foot. */
export function StatusRing({
  value,
  fraction,
}: {
  value: string;
  fraction: number;
}) {
  return (
    <Slot
      id="agent-status"
      frame={FRAMES.agentStatus}
      surface="solid"
      anchor={{ target: "progress-stream", at: ANCHORS.streamFoot }}
      className="status-slot"
      role="status"
      ariaLabel={`Agent status: ${value}`}
    >
      <svg className="viz" viewBox="0 0 144 176" aria-hidden="true">
        <circle
          cx="72"
          cy="88"
          r="62"
          fill="none"
          stroke="var(--design-border)"
          strokeWidth="9.92"
          opacity="0.5"
        />
        <path
          d={arcPath(72, 88, 62, fraction)}
          fill="none"
          stroke="var(--design-primary)"
          strokeWidth="9.92"
          strokeLinecap="round"
        />
        <text x="72" y="88" textAnchor="middle" className="ring-value">
          {value}
        </text>
        <text x="72" y="108" textAnchor="middle" className="ring-label">
          Status
        </text>
      </svg>
    </Slot>
  );
}

interface ProgressPanelProps {
  stage: ProgressStage;
  seconds: number;
  onRetry: () => void;
}

/**
 * The live progress: the flow line and status ring follow the agent, and the
 * treatment-plan frame carries the stage title, elapsed time and note until
 * there is a diagnosis to put there.
 */
export function ProgressPanel({ stage, seconds, onRetry }: ProgressPanelProps) {
  const { title, note } = STAGES[stage];
  const failed = stage === "timeout";
  const showElapsed =
    failed || stage === "slow" || (stage === "asking" && seconds >= 10);

  return (
    <>
      <FlowLine steps={stepsForStage(stage)} />
      <StatusRing
        value={failed ? "Stalled" : "Active"}
        fraction={failed ? 0.62 : 1}
      />
      <Slot
        id="treatment-plan"
        frame={FRAMES.treatmentPlan}
        surface="solid"
        anchor={{ target: "progress-stream", at: ANCHORS.streamFoot }}
        role="status"
        className="treatment-slot"
      >
        <span className="label">Agent progress</span>
        <h2 data-reveal className="panel-title">
          {title}
        </h2>
        {showElapsed && (
          <div className="text-[13px] text-body">
            {failed ? "Stopped at 180s" : `${seconds}s elapsed`}
          </div>
        )}
        {note && (
          <div className={`note ${failed ? "note-coral" : ""}`}>{note}</div>
        )}
        {failed && (
          <div className="mt-auto self-start pt-2">
            <PillButton onClick={onRetry}>Try again</PillButton>
          </div>
        )}
      </Slot>
    </>
  );
}
