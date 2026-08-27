"use client";

import { ClipCard } from "@/components/ClipCard";
import { Note } from "@/components/Note";
import { Stage } from "@/components/Stage";
import { GHOST_LABEL } from "@/components/styles";
import { Timeline } from "@/components/Timeline";
import type { Clip } from "@/lib/clips";
import { stamp } from "@/lib/format";

export type MediaRef = (element: HTMLMediaElement | null) => void;

export interface ResultSource {
  name: string;
  url: string;
  duration: number;
  hasVideo: boolean;
  recorded: boolean;
  peaks: Float32Array | null;
}

export interface CopyState {
  index: number;
  what: "range" | "caption";
}

interface ResultsProps {
  clips: Clip[];
  note: string | null;
  shortfall: string | null;
  source: ResultSource;
  mediaRef: MediaRef;
  position: number;
  playing: number | null;
  copied: CopyState | null;
  onPlay: (index: number) => void;
  onSeek: (seconds: number) => void;
  onCopyRange: (index: number) => void;
  onCopyCaption: (index: number) => void;
  onReset: () => void;
}

const HEADINGS = [
  "Nothing held up",
  "One moment holds up",
  "Two moments hold up",
  "Three moments worth posting",
];

function heading(count: number): string {
  return HEADINGS[count] ?? `${count} moments worth posting`;
}

export function Results({
  clips,
  note,
  shortfall,
  source,
  mediaRef,
  position,
  playing,
  copied,
  onPlay,
  onSeek,
  onCopyRange,
  onCopyCaption,
  onReset,
}: ResultsProps) {
  return (
    <div className="animate-in flex w-full max-w-[940px] flex-col">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <h2 className="m-0 font-display text-[clamp(34px,6.5vw,52px)] leading-none font-normal tracking-[-0.02em]">
          {heading(clips.length)}
        </h2>
        <div className="flex items-center gap-[26px] font-mono text-[12px] text-mute">
          <span className="max-w-[42ch] truncate">
            {source.name} · {stamp(source.duration)}
          </span>
          <button type="button" onClick={onReset} className={GHOST_LABEL}>
            {source.recorded ? "New take" : "New file"}
          </button>
        </div>
      </div>

      <div className="mt-10 flex flex-col">
        {source.hasVideo ? (
          <Stage
            url={source.url}
            mediaRef={mediaRef}
            position={position}
            length={source.duration}
            label={playing !== null ? `Clip ${playing + 1}` : "Pick a clip"}
            onSeek={onSeek}
          />
        ) : (
          <audio ref={mediaRef} src={source.url} preload="metadata" className="hidden" />
        )}

        <div className="mt-[18px] flex items-baseline justify-between gap-5">
          <span className="label text-mute">
            Picks across {source.recorded ? "the take" : "your file"}
          </span>
          <span className="font-mono text-[12px] text-mute">
            {stamp(position)} / {stamp(source.duration)}
          </span>
        </div>

        <Timeline
          clips={clips}
          length={source.duration}
          position={position}
          playing={playing}
          peaks={source.peaks}
          onSeek={onSeek}
        />
      </div>

      <div className="mt-[54px] flex flex-col">
        {clips.map((clip, index) => (
          <ClipCard
            key={clip.rank}
            clip={clip}
            playing={playing === index}
            copied={copied?.index === index ? copied.what : null}
            onPlay={() => onPlay(index)}
            onCopyRange={() => onCopyRange(index)}
            onCopyCaption={() => onCopyCaption(index)}
          />
        ))}
        <span className="border-t border-rule" />
      </div>

      {shortfall && (
        <Note
          label="Note"
          title={
            clips.length === 1 ? "Only one moment qualified" : "Only two moments qualified"
          }
          body={shortfall}
        />
      )}

      {note && <Note label="Length" title="The middle was left out" body={note} />}
    </div>
  );
}
