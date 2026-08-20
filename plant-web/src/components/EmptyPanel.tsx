const BLOCKS = [
  "Diagnosis — what is wrong",
  "Confidence — how sure, and why",
  "Why — the evidence in your photo",
  "Fix — the steps to take",
];

export function EmptyPanel() {
  return (
    <div className="flex flex-col gap-5 rounded-card bg-white p-8 shadow-card-softer">
      <div className="text-[20px] font-semibold tracking-[-0.02em]">
        Your diagnosis appears here
      </div>
      <p className="text-[14px] leading-[1.6] text-pretty text-body">
        Add one clear photo of the plant. You get a named problem, how sure the
        model is, the visual evidence behind it, and the steps to fix it.
      </p>
      <div className="flex flex-col gap-2.5">
        {BLOCKS.map((block) => (
          <div
            key={block}
            className="flex items-center gap-3 rounded-block bg-canvas px-4 py-3.5"
          >
            <span className="size-[7px] flex-none rounded-full bg-dot" />
            <span className="text-[14px] font-medium text-body">{block}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
