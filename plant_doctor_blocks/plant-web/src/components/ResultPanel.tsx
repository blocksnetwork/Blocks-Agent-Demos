import { useState } from "react";

import { confidenceBadge, type ParsedDiagnosis, type ResultLevel } from "@/lib/diagnosis";
import { PillButton } from "./PillButton";

const TONES: Record<ResultLevel, { hero: string; badge: string }> = {
  good: {
    hero: "bg-[linear-gradient(160deg,#eaf7e3,#f6fcf2)]",
    badge: "bg-leaf/14 text-leaf-dark",
  },
  ok: { hero: "bg-white", badge: "bg-leaf/14 text-leaf-dark" },
  warn: { hero: "bg-white", badge: "bg-amber-bg text-amber" },
};

interface ResultPanelProps {
  result: ParsedDiagnosis;
  onReset: () => void;
}

export function ResultPanel({ result, onReset }: ResultPanelProps) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const tone = TONES[result.level];
  const badge = confidenceBadge(result.confidence);

  return (
    <div className="flex animate-in-slow flex-col gap-4">
      <div
        className={`flex flex-col gap-[18px] rounded-card p-8 shadow-card-soft ${tone.hero}`}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-body">
            DIAGNOSIS
          </span>
          {badge && (
            <span
              className={`inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[12px] font-semibold ${tone.badge}`}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {badge}
            </span>
          )}
        </div>

        <div className="text-[38px] leading-[1.05] font-bold tracking-[-0.04em] text-pretty">
          {result.diagnosis}
        </div>

        {result.confidenceNote && (
          <p className="max-w-[46ch] text-[14px] leading-[1.6] text-pretty text-body">
            {result.confidenceNote}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-card bg-white px-8 py-7 shadow-card-softer">
        <div className="text-[11px] font-semibold tracking-[0.12em] text-mute">
          WHY
        </div>
        <p className="text-[15px] leading-[1.65] text-pretty text-ink">
          {result.why}
        </p>
      </div>

      {result.fix.length > 0 && (
        <div className="flex flex-col gap-4 rounded-card bg-white px-8 pt-7 pb-6 shadow-card-softer">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[11px] font-semibold tracking-[0.12em] text-mute">
              FIX
            </div>
            <div className="text-[12px] text-mute">
              {result.fix.length} {result.fix.length === 1 ? "step" : "steps"}
            </div>
          </div>

          <ol className="flex list-none flex-col gap-1 p-0">
            {result.fix.map((step, index) => {
              const checked = Boolean(done[index]);

              return (
                <li key={step}>
                  <button
                    type="button"
                    onClick={() =>
                      setDone((current) => ({
                        ...current,
                        [index]: !current[index],
                      }))
                    }
                    className={`flex w-full cursor-pointer items-start gap-3.5 py-3 text-left ${
                      index === 0 ? "" : "border-t border-line"
                    }`}
                  >
                    <span
                      className={`flex size-[26px] flex-none items-center justify-center rounded-full text-[13px] font-semibold ${
                        checked ? "bg-leaf text-white" : "bg-chip text-body"
                      }`}
                    >
                      {checked ? "✓" : index + 1}
                    </span>
                    <span
                      className={`text-[15px] leading-[1.55] ${
                        checked ? "text-mute line-through" : "text-ink"
                      }`}
                    >
                      {step}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="self-start">
        <PillButton variant="white" onClick={onReset}>
          Diagnose another photo
        </PillButton>
      </div>
    </div>
  );
}
