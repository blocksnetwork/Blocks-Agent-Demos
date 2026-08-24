import { TRANSPORT } from "@/components/styles";
import type { Clip } from "@/lib/clips";
import { stamp } from "@/lib/format";

interface ClipCardProps {
  clip: Clip;
  playing: boolean;
  copied: "range" | "caption" | null;
  onPlay: () => void;
  onCopyRange: () => void;
  onCopyCaption: () => void;
}

export function ClipCard({
  clip,
  playing,
  copied,
  onPlay,
  onCopyRange,
  onCopyCaption,
}: ClipCardProps) {
  return (
    <article className="grid grid-cols-[3px_1fr] gap-x-[26px] gap-y-5 border-t border-rule py-10 md:grid-cols-[3px_122px_1fr]">
      <span aria-hidden="true" className={playing ? "bg-accent" : "bg-transparent"} />

      <div className="flex flex-row items-center gap-5 md:flex-col md:items-start md:gap-4">
        <span
          className={`font-display text-[46px] leading-[0.9] ${
            playing ? "text-accent" : "text-ghost"
          }`}
        >
          {clip.rank}
        </span>

        <button
          type="button"
          onClick={onCopyRange}
          aria-label="Copy timestamp range"
          className="cursor-pointer self-start border-none border-b border-b-[rgb(17_24_21/0.18)] bg-transparent p-0 text-left font-mono text-[15px] whitespace-nowrap text-ink transition-colors duration-[180ms] hover:border-accent hover:text-accent-deep"
        >
          {copied === "range" ? "Copied" : `${stamp(clip.start)} – ${stamp(clip.end)}`}
        </button>

        <button
          type="button"
          onClick={onPlay}
          aria-label={`${playing ? "Stop" : "Play"} clip ${clip.rank}`}
          className={`${TRANSPORT} ${
            playing
              ? "border-accent bg-accent text-white"
              : "border-[rgb(17_24_21/0.22)] bg-transparent text-ink hover:border-accent hover:text-accent-deep"
          }`}
        >
          {playing ? "\u25a0" : "\u25b6"}
        </button>
      </div>

      <div className="flex flex-col gap-[22px]">
        <h3 className="m-0 font-display text-[clamp(28px,5vw,40px)] leading-[1.06] font-normal tracking-[-0.015em] text-pretty">
          {clip.title}
        </h3>

        {clip.quote && (
          <p className="m-0 max-w-[640px] text-[19px] leading-[1.62] text-body text-pretty">
            {clip.quote}
          </p>
        )}

        {clip.caption && (
          <div className="grid grid-cols-[92px_1fr_auto] items-baseline gap-5 border-t border-rule-soft pt-[22px]">
            <span className="label-sm text-mute">Caption</span>
            <span className="text-[16px] leading-[1.55]">{clip.caption}</span>
            <button
              type="button"
              onClick={onCopyCaption}
              className={`cursor-pointer border-none border-b border-b-accent bg-transparent p-0 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors duration-[180ms] hover:text-ink ${
                copied === "caption" ? "text-ink" : "text-accent-deep"
              }`}
            >
              {copied === "caption" ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        {clip.why && (
          <div className="grid grid-cols-[92px_1fr] items-baseline gap-5">
            <span className="label-sm text-mute">Why</span>
            <span className="max-w-[560px] text-[14px] leading-[1.6] text-mute">
              {clip.why}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
