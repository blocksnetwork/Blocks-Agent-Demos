import { ANCHORS, FRAMES, Slot } from "./composition";
import { PillButton } from "./PillButton";

interface RawPanelProps {
  text: string;
  onReset: () => void;
}

/** A reply that did not parse, shown verbatim in the treatment-plan frame. */
export function RawPanel({ text, onReset }: RawPanelProps) {
  return (
    <Slot
      id="treatment-plan"
      frame={FRAMES.treatmentPlan}
      surface="solid"
      anchor={{ target: "progress-stream", at: ANCHORS.streamFoot }}
      className="treatment-slot"
    >
      <span className="label">Model response</span>
      <h2 data-reveal className="panel-title">
        Shown as written
      </h2>
      <p className="text-[13px] leading-[1.55]">
        This reply did not follow the usual four sections, so it is shown
        exactly as it came back.
      </p>

      <div className="raw-box">{text}</div>

      <div className="mt-auto self-start pt-3">
        <PillButton onClick={onReset}>Diagnose another photo</PillButton>
      </div>
    </Slot>
  );
}
