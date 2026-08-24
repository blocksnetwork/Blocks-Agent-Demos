import type { PrepareStage } from "@/lib/prepare";

const STAGE_TEXT: Record<PrepareStage, string> = {
  reading: "Reading the file off disk",
  decoding: "Decoding the audio track",
  encoding: "Dropping the video, downmixing to mono Opus",
};

interface PreparingProps {
  stage: PrepareStage;
  percent: number;
  /** "412 MB video", already formatted, because only the caller knows the kind. */
  sourceLabel: string;
  targetLabel: string;
}

export function Preparing({ stage, percent, sourceLabel, targetLabel }: PreparingProps) {
  return (
    <div className="animate-in flex w-full max-w-[720px] flex-col">
      <span className="label text-mute">Preparing in your browser</span>

      <span className="pt-[22px] pb-[30px] font-display text-[clamp(34px,7vw,52px)] leading-[1.05]">
        {sourceLabel} <span className="text-faint">→</span> {targetLabel}
      </span>

      <span className="relative block h-[3px] bg-rule-track">
        <span
          className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-200 ease-out"
          style={{ width: `${percent.toFixed(1)}%` }}
        />
      </span>

      <div className="mt-[14px] flex justify-between gap-5 font-mono text-[12px] text-mute">
        <span>{STAGE_TEXT[stage]}</span>
        <span>{Math.round(percent)}%</span>
      </div>
    </div>
  );
}
