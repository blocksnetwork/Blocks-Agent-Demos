import { PillButton } from "./PillButton";

export type ProgressStage =
  | "uploading"
  | "reading"
  | "asking"
  | "slow"
  | "timeout";

const STEP_LABELS = ["Reading the photo…", "Asking the model…"];

const STAGES: Record<
  ProgressStage,
  { title: string; step: number; note: string }
> = {
  uploading: { title: "Uploading your photo", step: -1, note: "" },
  reading: { title: "Reading the photo…", step: 0, note: "" },
  asking: {
    title: "Asking the model…",
    step: 1,
    note: "This is the long part. It usually takes 8 to 25 seconds.",
  },
  slow: {
    title: "Asking the model…",
    step: 1,
    note: "Still going. Long runs happen on bigger photos — nothing has failed. The agent gives up at 180 seconds.",
  },
  timeout: {
    title: "The model ran out of time",
    step: 1,
    note: "The agent stopped after 180 seconds without a reply. Your photo is still loaded, so you can send it again without re-uploading.",
  },
};

interface ProgressPanelProps {
  stage: ProgressStage;
  seconds: number;
  onRetry: () => void;
}

export function ProgressPanel({ stage, seconds, onRetry }: ProgressPanelProps) {
  const { title, step, note } = STAGES[stage];
  const failed = stage === "timeout";
  const showElapsed = failed || stage === "slow" || (stage === "asking" && seconds >= 10);

  return (
    <div
      role="status"
      className="flex animate-in flex-col gap-[26px] rounded-card bg-white p-8 shadow-card-soft"
    >
      <div className="flex flex-col gap-1.5">
        <div className="text-[22px] font-semibold tracking-[-0.025em]">
          {title}
        </div>
        {showElapsed && (
          <div className="text-[13px] text-body">
            {failed ? "Stopped at 180s" : `${seconds}s elapsed`}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {STEP_LABELS.map((label, index) => {
          const done = index < step || (failed && index === 0);
          const running = index === step && !failed;
          const stalled = failed && index === 1;

          const dot = done
            ? "bg-leaf"
            : stalled
              ? "bg-coral"
              : running
                ? "bg-leaf-light animate-pulse-step"
                : "bg-rail";

          return (
            <div
              key={label}
              className={`flex items-center gap-[13px] text-[15px] ${
                done || running || stalled ? "text-ink" : "text-mute"
              }`}
            >
              <span
                className={`flex size-[22px] flex-none items-center justify-center rounded-full text-[12px] text-white ${dot}`}
              >
                {done ? "✓" : stalled ? "!" : ""}
              </span>
              <span className={running ? "font-semibold" : "font-normal"}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {note && (
        <div
          className={`rounded-panel px-4.5 py-4 text-[13px] leading-[1.55] text-body ${
            failed ? "bg-coral-bg" : "bg-canvas"
          }`}
        >
          {note}
        </div>
      )}

      {failed && (
        <div className="self-start">
          <PillButton onClick={onRetry}>Try again</PillButton>
        </div>
      )}
    </div>
  );
}
