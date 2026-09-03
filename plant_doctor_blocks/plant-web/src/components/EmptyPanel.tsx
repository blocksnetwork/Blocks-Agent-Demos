import { ANCHORS, FRAMES, Slot } from "./composition";

const BLOCKS = [
  "Diagnosis — what is wrong",
  "Confidence — how sure, and why",
  "Why — the evidence in your photo",
  "Fix — the steps to take",
];

/** What the treatment-plan frame holds before there is anything to treat. */
export function EmptyPanel() {
  return (
    <Slot
      id="treatment-plan"
      frame={FRAMES.treatmentPlan}
      surface="solid"
      anchor={{ target: "progress-stream", at: ANCHORS.streamFoot }}
      className="treatment-slot"
    >
      <span className="label">Treatment plan</span>
      <h2 data-reveal className="panel-title">
        Your diagnosis appears here
      </h2>
      <p className="text-[14px] leading-[1.6] text-pretty">
        Add one clear photo of the plant. You get a named problem, how sure the
        model is, the visual evidence behind it, and the steps to fix it.
      </p>
      <ul className="empty-rows" data-reveal-group>
        {BLOCKS.map((block) => (
          <li key={block} className="empty-row">
            {block}
          </li>
        ))}
      </ul>
    </Slot>
  );
}
