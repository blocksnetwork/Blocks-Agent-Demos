import type { Confidence } from "@/lib/diagnosis";
import type { EvidencePoint } from "@/lib/evidence";
import { RING_FRACTION } from "./ConfidenceRing";
import { Panel } from "./Panel";

interface DifferentialProps {
  diagnosis: string;
  confidence: Confidence | null;
  evidence: EvidencePoint[];
}

/**
 * The ranked differential: a row per condition with a hairline likelihood
 * bar and the rating at the row end, then the numbered evidence that the
 * pins on the photo point at. The agent returns one condition per run, so
 * the list says so rather than inventing runners-up.
 */
export function Differential({ diagnosis, confidence, evidence }: DifferentialProps) {
  const fraction = confidence ? RING_FRACTION[confidence] : 0.2;
  const rating = confidence ?? "unrated";

  return (
    <Panel
      id="differential"
      eyebrow="Differential"
      title="Ranked conditions"
      meta={`1 condition · ${evidence.length} evidence`}
      className="differential-panel"
      ariaLabel="Ranked conditions and evidence"
    >
      <ol className="rank-list">
        <li className="rank-row">
          <span className="rank-num">1</span>
          <div className="rank-main">
            <span className="rank-name">{diagnosis}</span>
            <span className="rank-bar" aria-hidden="true">
              <span className="rank-fill" style={{ width: `${fraction * 100}%` }} />
            </span>
          </div>
          <span className="rank-score">{rating}</span>
        </li>
        <li className="rank-row is-empty">
          <span className="rank-num">2</span>
          <div className="rank-main">
            <span className="rank-name">No competing condition reported</span>
            <span className="rank-sub">The agent names one cause per run.</span>
          </div>
          <span className="rank-score">—</span>
        </li>
      </ol>

      <span className="eyebrow evidence-head">Evidence on the photo</span>
      <ol className="evidence-list" data-reveal-group>
        {evidence.map((point) => (
          <li key={point.n} className="evidence-row">
            <span className="marker-num" aria-hidden="true">
              {point.n}
            </span>
            <span className="evidence-text">{point.text}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
