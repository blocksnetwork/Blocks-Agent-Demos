import type { Phase } from "@/lib/protocol";

/** In the order the handler reports them. */
const STEPS: Array<{ phase: Phase; label: string }> = [
  { phase: "reading", label: "Reading the recording" },
  { phase: "transcribing", label: "Transcribing" },
  { phase: "ranking", label: "Choosing the best moments" },
];

export const PHASE_INDEX: Record<Phase, number> = {
  reading: 0,
  transcribing: 1,
  ranking: 2,
};

/** Before this, saying how long it has been would be noise. */
const ELAPSED_AFTER_SECONDS = 15;

interface WorkingProps {
  phase: Phase;
  seconds: number;
}

export function Working({ phase, seconds }: WorkingProps) {
  const current = PHASE_INDEX[phase];

  return (
    <div className="animate-in flex w-full max-w-[720px] flex-col">
      {STEPS.map((step, index) => (
        <div
          key={step.phase}
          className="flex items-baseline gap-6 border-b border-rule py-[26px]"
        >
          <span
            className={`min-w-[26px] font-mono text-[12px] ${
              index <= current ? "text-ink" : "text-faint"
            }`}
          >
            0{index + 1}
          </span>
          <span
            className={`flex-1 font-display text-[clamp(24px,5vw,30px)] leading-[1.15] ${
              index < current ? "text-mute" : index === current ? "text-ink" : "text-faint"
            }`}
          >
            {step.label}
          </span>
          <span
            aria-hidden="true"
            className={`size-2 self-center ${
              index < current
                ? "bg-accent"
                : index === current
                  ? "animate-live bg-accent-mark"
                  : "bg-transparent"
            }`}
          />
        </div>
      ))}

      {seconds > ELAPSED_AFTER_SECONDS && (
        <span className="pt-[18px] font-mono text-[12px] text-mute">
          {seconds}s elapsed · transcription runs about 20x realtime
        </span>
      )}
    </div>
  );
}
