"use client";

import { percent } from "@/lib/format";
import type { Clip } from "@/lib/clips";

/** Wide enough to read as a waveform, sparse enough to stay a hairline drawing. */
const DRAWN_BARS = 180;

function condense(peaks: Float32Array | null): number[] {
  if (!peaks || peaks.length === 0) return [];

  const width = peaks.length / DRAWN_BARS;
  return Array.from({ length: DRAWN_BARS }, (_, bucket) => {
    const start = Math.floor(bucket * width);
    const end = Math.min(peaks.length, Math.floor((bucket + 1) * width));
    let peak = 0;
    for (let i = start; i < end; i++) if (peaks[i] > peak) peak = peaks[i];
    return peak;
  });
}

interface TimelineProps {
  clips: Clip[];
  length: number;
  position: number;
  playing: number | null;
  /** The source waveform, drawn behind the bands so the picks sit in context. */
  peaks: Float32Array | null;
  onSeek: (seconds: number) => void;
}

export function Timeline({
  clips,
  length,
  position,
  playing,
  peaks,
  onSeek,
}: TimelineProps) {
  const drawn = condense(peaks);

  return (
    <div className="relative mt-2.5 mb-6 h-[34px] border-y border-rule">
      {drawn.length > 0 && (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center gap-px opacity-25"
        >
          {drawn.map((peak, index) => (
            <span
              key={index}
              className="min-w-0 flex-[1_1_0] self-center bg-ink"
              style={{ height: Math.max(1, peak * 30) }}
            />
          ))}
        </span>
      )}

      {clips.map((clip, index) => (
        <span
          key={clip.rank}
          aria-hidden="true"
          className={`absolute inset-y-0 ${playing === index ? "bg-accent" : "bg-accent-band"}`}
          style={{
            left: `${percent(clip.start, length)}%`,
            width: `${percent(clip.end - clip.start, length)}%`,
          }}
        />
      ))}

      <button
        type="button"
        aria-label="Seek within the recording"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          if (box.width === 0) return;
          onSeek(Math.max(0, Math.min(length, ((event.clientX - box.left) / box.width) * length)));
        }}
        className="absolute inset-0 cursor-pointer border-none bg-transparent p-0"
      />

      {clips.map((clip) => (
        <span
          key={clip.rank}
          aria-hidden="true"
          className="absolute -bottom-[22px] font-mono text-[11px] text-mute"
          style={{ left: `${percent(clip.start, length)}%` }}
        >
          {clip.rank}
        </span>
      ))}

      <span
        aria-hidden="true"
        className="absolute -top-1.5 -bottom-1.5 w-px bg-ink transition-opacity duration-200"
        style={{
          left: `${percent(position, length)}%`,
          opacity: playing !== null || position > 0 ? 1 : 0,
        }}
      />
    </div>
  );
}
