"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { categories } from "@/lib/ideas";

const COUNT = categories.length;
const ITEM_HEIGHT = 84;
const THETA = 360 / COUNT;
const VISIBLE_ROWS = 7;
const DRUM_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
/** Cylinder radius that makes each row exactly ITEM_HEIGHT tall on the front face. */
const RADIUS = Math.round(ITEM_HEIGHT / (2 * Math.tan(Math.PI / COUNT)));

/** Fades the drum into the page instead of painting a background over it. */
const FADE = "linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)";
const SPIN_EASE = "transform 4.4s cubic-bezier(0.16, 1, 0.3, 1)";
const SNAP_EASE = "transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1)";

type Mode = "idle" | "spin" | "snap";

type PickerProps = {
  busy: boolean;
  onSpinStart: () => void;
  onLand: (index: number) => void;
};

export default function Picker({ busy, onSpinStart, onLand }: PickerProps) {
  const [rotation, setRotation] = useState(0);
  const [mode, setMode] = useState<Mode>("idle");
  const [dragging, setDragging] = useState(false);
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ startY: number; startRotation: number; moved: boolean } | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** Row i sits at the front when rotation is -i * THETA. */
  const indexAt = (value: number) => ((Math.round(-value / THETA) % COUNT) + COUNT) % COUNT;

  function land(index: number) {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = null;
    setMode("idle");
    onLand(index);
  }

  /**
   * Landing on the current row means a whole-turn rotation, which computes to an
   * identical matrix, so the browser never fires transitionend. Land on a timer too.
   */
  function arm(index: number, ms: number) {
    pending.current = index;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (pending.current !== null) land(pending.current);
    }, ms);
  }

  function spin() {
    if (mode !== "idle") return;
    const index = Math.floor(Math.random() * COUNT);
    const offset = (((rotation + index * THETA) % 360) + 360) % 360;

    arm(index, 4600);
    setRotation(rotation - 360 * 3 - offset);
    setMode("spin");
    onSpinStart();
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode === "spin") return;
    drag.current = { startY: event.clientY, startRotation: rotation, moved: false };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dy = event.clientY - drag.current.startY;
    if (Math.abs(dy) > 3) drag.current.moved = true;
    setRotation(drag.current.startRotation + (dy / ITEM_HEIGHT) * THETA);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const { moved } = drag.current;
    drag.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!moved) return;

    const snapped = Math.round(rotation / THETA) * THETA;
    const index = indexAt(snapped);
    onSpinStart();

    if (Math.abs(snapped - rotation) < 0.001) {
      land(index);
      return;
    }
    arm(index, 500);
    setRotation(snapped);
    setMode("snap");
  }

  const transition = dragging
    ? "none"
    : mode === "spin"
      ? SPIN_EASE
      : mode === "snap"
        ? SNAP_EASE
        : "none";

  return (
    <div className="w-full max-w-[520px]">
      <div className="relative">
        {/* Selection band sits outside the mask so it stays at full strength. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2"
          style={{ height: ITEM_HEIGHT }}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-accent/40" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-accent/40" />
        </div>

        {/* Mask lives outside the perspective context so it cannot flatten the 3D. */}
        <div style={{ maskImage: FADE, WebkitMaskImage: FADE }}>
          <div
            className="relative touch-none overflow-hidden select-none"
            style={{ height: DRUM_HEIGHT, perspective: 1500 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div
              className="absolute inset-0"
              style={{
                transformStyle: "preserve-3d",
                transform: `translateZ(${-RADIUS}px) rotateX(${rotation}deg)`,
                transition,
              }}
              onTransitionEnd={(event) => {
                if (event.propertyName !== "transform" || event.target !== event.currentTarget) {
                  return;
                }
                if (pending.current !== null) land(pending.current);
              }}
            >
              {categories.map((category, index) => (
                <div
                  key={category.id}
                  className="absolute inset-x-0 flex items-center justify-center gap-4"
                  style={{
                    height: ITEM_HEIGHT,
                    top: "50%",
                    marginTop: -ITEM_HEIGHT / 2,
                    transform: `rotateX(${index * THETA}deg) translateZ(${RADIUS}px)`,
                    backfaceVisibility: "hidden",
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-[40px] leading-none font-semibold tracking-tight text-fg">
                    {category.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={spin}
        disabled={busy || mode !== "idle"}
        className="mt-8 w-full rounded-full bg-accent py-4 text-sm font-semibold tracking-[0.08em] text-ink uppercase transition hover:bg-[#d4fa6a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-40 active:scale-[0.98]"
      >
        {mode === "spin" ? "Spinning" : "Spin"}
      </button>
    </div>
  );
}
