import { PillButton } from "./PillButton";

interface RawPanelProps {
  text: string;
  onReset: () => void;
}

export function RawPanel({ text, onReset }: RawPanelProps) {
  return (
    <div className="flex animate-in flex-col gap-4 rounded-card bg-white px-8 py-7 shadow-card-softer">
      <div className="flex flex-col gap-1.5">
        <div className="text-[20px] font-semibold tracking-[-0.02em]">
          Model response
        </div>
        <div className="text-[13px] leading-[1.55] text-body">
          This reply did not follow the usual four sections, so it is shown
          exactly as written.
        </div>
      </div>

      <div className="rounded-panel bg-canvas p-5 text-[14px] leading-[1.7] whitespace-pre-wrap text-ink">
        {text}
      </div>

      <div className="self-start">
        <PillButton onClick={onReset}>Diagnose another photo</PillButton>
      </div>
    </div>
  );
}
