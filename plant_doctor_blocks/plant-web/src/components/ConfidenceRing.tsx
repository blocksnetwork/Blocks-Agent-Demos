import type { Confidence } from "@/lib/diagnosis";

export type RingState = "idle" | "working" | "result" | "failed";

/** How far the ring closes for each rating the model gives. */
export const RING_FRACTION: Record<Confidence, number> = {
  high: 0.9,
  medium: 0.62,
  low: 0.34,
};

interface ConfidenceRingProps {
  state: RingState;
  confidence: Confidence | null;
  /** The line under the value: where the rating came from, or why there is none. */
  context: string;
}

const R = 54;
const CIRCUMFERENCE = 2 * Math.PI * R;

function word(confidence: Confidence | null): string {
  if (!confidence) return "—";
  return confidence[0].toUpperCase() + confidence.slice(1);
}

/**
 * The certainty instrument from the blueprint: an open ring with the value
 * set large inside it and a context caption beside it. It floats over the
 * verdict band, so it carries the second elevation level.
 */
export function ConfidenceRing({ state, confidence, context }: ConfidenceRingProps) {
  const fraction =
    state === "result" && confidence ? RING_FRACTION[confidence] : 0;
  const value = state === "result" ? word(confidence) : state === "working" ? "…" : "—";
  const dash = CIRCUMFERENCE * fraction;

  return (
    <section
      className={`confidence ring-${state}`}
      aria-label={`Confidence: ${state === "result" ? word(confidence) : "not yet rated"}`}
    >
      <div className="ring">
        <svg viewBox="0 0 128 128" width="128" height="128" aria-hidden="true">
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke="var(--design-border)"
            strokeWidth="8"
          />
          <circle
            className="ring-arc"
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke="var(--design-primary)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={
              state === "working"
                ? `${CIRCUMFERENCE * 0.22} ${CIRCUMFERENCE}`
                : `${dash} ${CIRCUMFERENCE}`
            }
            transform="rotate(-90 64 64)"
          />
        </svg>
        <div className="ring-text">
          <span className="ring-value">{value}</span>
          <span className="ring-label">confidence</span>
        </div>
      </div>
      <div className="confidence-copy">
        <span className="eyebrow">Certainty</span>
        <p className="confidence-context">{context}</p>
      </div>
    </section>
  );
}
