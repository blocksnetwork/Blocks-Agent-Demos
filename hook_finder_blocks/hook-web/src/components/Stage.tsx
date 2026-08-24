"use client";

import { Scrubber } from "@/components/Scrubber";
import { stamp } from "@/lib/format";

interface StageProps {
  url: string;
  mediaRef: (element: HTMLVideoElement | null) => void;
  position: number;
  length: number;
  label: string;
  onSeek: (seconds: number) => void;
}

/**
 * The frames the upload never sent.
 *
 * Only the audio went to the agent, so the picture it is describing is still
 * sitting in this tab as an object URL — which means a pick can be watched
 * where it happens instead of read as a pair of numbers.
 */
export function Stage({ url, mediaRef, position, length, label, onSeek }: StageProps) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[2px] bg-stage">
      <video
        ref={mediaRef}
        src={url}
        playsInline
        preload="metadata"
        className="size-full object-contain"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-4 bg-[linear-gradient(180deg,rgb(17_24_21/0),rgb(17_24_21/0.55))] px-[18px] py-4">
        <span className="font-mono text-[12px] text-white">{stamp(position)}</span>
        <span className="pointer-events-auto flex flex-1">
          <Scrubber
            position={position}
            length={length}
            onSeek={onSeek}
            label="Seek within the recording"
          />
        </span>
        <span className="font-mono text-[12px] tracking-[0.1em] text-white/85 uppercase">
          {label}
        </span>
      </div>
    </div>
  );
}
