import { Scrubber } from "@/components/Scrubber";
import { GHOST, PRIMARY_WIDE, TRANSPORT } from "@/components/styles";
import { stamp } from "@/lib/format";

interface ReviewProps {
  length: number;
  position: number;
  playing: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onAnalyze: () => void;
  onDiscard: () => void;
}

export function Review({
  length,
  position,
  playing,
  onTogglePlay,
  onSeek,
  onAnalyze,
  onDiscard,
}: ReviewProps) {
  return (
    <div className="animate-in flex w-full max-w-[720px] flex-col">
      <div className="flex items-baseline justify-between border-b border-rule pb-[14px]">
        <span className="label text-mute">Take recorded</span>
        <span className="font-mono text-[14px]">{stamp(length)}</span>
      </div>

      <div className="flex items-center gap-5 border-b border-rule py-[30px]">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing ? "Pause take" : "Play take"}
          className={`${TRANSPORT} border-[rgb(17_24_21/0.22)] bg-transparent text-ink hover:border-accent hover:text-accent-deep`}
        >
          {playing ? "\u25a0" : "\u25b6"}
        </button>
        <Scrubber
          position={position}
          length={length}
          onSeek={onSeek}
          label="Seek within the take"
        />
        <span className="font-mono text-[13px] text-mute">{stamp(position)}</span>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-7">
        <button type="button" onClick={onAnalyze} className={`flex-1 ${PRIMARY_WIDE}`}>
          Find the hooks
        </button>
        <button type="button" onClick={onDiscard} className={GHOST}>
          Discard and re-record
        </button>
      </div>

      <p className="mt-[26px] mb-0 text-[14px] text-mute">
        Nothing is sent anywhere until you choose to analyze.
      </p>
    </div>
  );
}
