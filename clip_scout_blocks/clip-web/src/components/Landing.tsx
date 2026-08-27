"use client";

import { useState } from "react";

import { GHOST } from "@/components/styles";
import { ACCEPT_ATTRIBUTE } from "@/lib/limits";

interface LandingProps {
  onFiles: (files: FileList | null) => void;
  onRecord: () => void;
}

export function Landing({ onFiles, onRecord }: LandingProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <div className="animate-in flex w-full max-w-[940px] flex-col">
      <h1 className="m-0 max-w-[780px] font-display text-[clamp(38px,7.5vw,68px)] leading-[1.02] font-normal tracking-[-0.02em] text-pretty">
        Three moments in your footage are worth posting.
      </h1>

      <p className="mt-[26px] max-w-[480px] text-[17px] leading-[1.6] text-mute">
        Drop the file. You get back the claim, the result and the number said out
        loud — each with a timestamp you can cut against.
      </p>

      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onFiles(event.dataTransfer.files);
        }}
        className={`relative mt-[68px] flex cursor-pointer flex-wrap items-center justify-between gap-8 border-y border-rule py-[54px] text-left transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] ${
          dragging ? "bg-accent-wash" : "bg-transparent"
        }`}
      >
        <span className="flex flex-col gap-3">
          <span className="label text-mute">
            {dragging ? "Release to load it" : "Drop audio or video here"}
          </span>
          <span className="font-display text-[clamp(28px,5vw,38px)] leading-none">
            Choose a file
          </span>
        </span>

        <span className="flex flex-col gap-1.5 text-right font-mono text-[12px] text-mute">
          <span>mp3 m4a wav mp4 mov webm</span>
          <span>the video track stays here</span>
          <span>over ~2h? split it</span>
        </span>

        <input
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          aria-label="Choose a recording to find hooks in"
          onChange={(event) => {
            onFiles(event.target.files);
            event.target.value = "";
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>

      <div className="mt-[30px] flex flex-wrap items-baseline gap-4">
        <span className="label text-faint">Nothing recorded yet?</span>
        <button type="button" onClick={onRecord} className={GHOST}>
          Record a take instead
        </button>
      </div>
    </div>
  );
}
