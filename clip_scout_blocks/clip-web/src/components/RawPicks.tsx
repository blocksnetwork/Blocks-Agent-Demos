import { GHOST_LABEL } from "@/components/styles";

interface RawPicksProps {
  text: string;
  onReset: () => void;
}

/**
 * The escape hatch for a reply whose timestamps could not be read.
 *
 * The answer is still in there and still useful, so it is shown as written
 * rather than forced into a layout built around seeking to a range that was
 * never parsed.
 */
export function RawPicks({ text, onReset }: RawPicksProps) {
  return (
    <div className="animate-in flex w-full max-w-[720px] flex-col">
      <div className="flex items-baseline justify-between gap-5 border-b border-rule pb-[14px]">
        <span className="label text-mute">Unparsed reply</span>
        <button type="button" onClick={onReset} className={GHOST_LABEL}>
          Start over
        </button>
      </div>

      <p className="mt-[26px] mb-0 max-w-[560px] text-[15px] leading-[1.6] text-mute">
        The agent answered, but not with timestamps this page could seek to.
        Here it is as written.
      </p>

      <pre className="mt-[26px] overflow-x-auto border-y border-rule py-[26px] font-mono text-[13px] leading-[1.7] whitespace-pre-wrap text-body">
        {text}
      </pre>
    </div>
  );
}
