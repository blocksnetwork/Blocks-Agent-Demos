"use client";

import { percent } from "@/lib/format";

interface ScrubberProps {
  position: number;
  length: number;
  onSeek: (seconds: number) => void;
  label: string;
}

/** A hairline track that can be clicked or arrowed to seek. */
export function Scrubber({ position, length, onSeek, label }: ScrubberProps) {
  const clamp = (seconds: number) => Math.max(0, Math.min(length, seconds));

  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        if (box.width === 0) return;
        onSeek(clamp(((event.clientX - box.left) / box.width) * length));
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onSeek(clamp(position - 5));
        else if (event.key === "ArrowRight") onSeek(clamp(position + 5));
        else return;
        event.preventDefault();
      }}
      className="relative h-[2px] flex-1 cursor-pointer border-none bg-rule-track p-0"
    >
      <span
        className="absolute inset-y-0 left-0 bg-accent"
        style={{ width: `${percent(position, length)}%` }}
      />
    </button>
  );
}
