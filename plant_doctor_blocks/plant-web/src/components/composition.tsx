import type { CSSProperties, ReactNode } from "react";

/**
 * The winning composition from design_blocks task 9c964a89 ("Textured
 * Botanical", faithful reference-transfer). Frames are the resolved geometry
 * in design/composition-spec.json as percentages of the 1440 × 2722 canvas;
 * z values are composition.html's. Above 760px every element on the page is
 * placed from this table — nothing is laid out by flow.
 */
export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
  z: number;
}

export const FRAMES = {
  leafSubject: { left: -38, top: -25.86, width: 100, height: 80.82, z: 8 },
  navGhost: { left: 0, top: 0, width: 100, height: 2.42, z: 20 },
  footerLine: { left: 0, top: 15.36, width: 100, height: 1.62, z: 11 },
  confidencePin: { left: 69.18, top: 26.63, width: 14, height: 8.08, z: 32 },
  anatomyPin: { left: 8.07, top: 42.03, width: 16, height: 9.7, z: 34 },
  treatmentPlan: { left: 8.4, top: 47.27, width: 28, height: 36.37, z: 24 },
  progressStream: { left: -6, top: 51.64, width: 12, height: 46.88, z: 25 },
  headlineStream: { left: -6, top: 67.08, width: 12, height: 11.32, z: 26 },
  agentStatus: { left: 2.95, top: 70.87, width: 10, height: 6.47, z: 26 },
  severityBadge: { left: -6.56, top: 73.55, width: 28, height: 14.55, z: 27 },
} satisfies Record<string, Frame>;

/**
 * Where the pinned annotations attach, as percent points on their target.
 * The blueprint pins to the leaf subject; once a photo is loaded the same
 * pins attach to the photo itself, which is the evidence they describe.
 */
export const ANCHORS = {
  confidenceOnLeaf: [88, 50],
  anatomyOnLeaf: [28, 70],
  confidenceOnPhoto: [76, 34],
  anatomyOnPhoto: [46, 58],
  leafFoot: [0, 100],
  leafFootStream: [2, 100],
  streamFoot: [0, 100],
} as const;

export type Anchor = { target: string; at: readonly [number, number] };
export type Surface = "solid" | "glass" | "outline" | "none";

interface SlotProps {
  id: string;
  frame: Frame;
  surface?: Surface;
  anchor?: Anchor;
  /** Motion-kit drift; a string sets data-float-rotate. Plane 3+ only. */
  float?: boolean | string;
  reveal?: boolean;
  role?: string;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** One positioned element of the composition. */
export function Slot({
  id,
  frame,
  surface = "none",
  anchor,
  float,
  reveal,
  role,
  ariaLabel,
  className = "",
  style,
  children,
}: SlotProps) {
  const offLeft = frame.left < 0 ? -frame.left : 0;
  const floatAttrs = float
    ? {
        "data-float": "",
        ...(typeof float === "string" ? { "data-float-rotate": float } : {}),
      }
    : {};

  return (
    <div
      data-id={id}
      data-anchor-target={anchor?.target}
      data-anchor-at={anchor ? `${anchor.at[0]},${anchor.at[1]}` : undefined}
      {...floatAttrs}
      {...(reveal ? { "data-reveal": "" } : {})}
      role={role}
      aria-label={ariaLabel}
      className={`el surface-${surface} ${className}`}
      style={
        {
          left: `${frame.left}%`,
          top: `${frame.top}%`,
          width: `${frame.width}%`,
          height: `${frame.height}%`,
          zIndex: frame.z,
          "--off-left": `${offLeft}%`,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

/** A ring-segment arc from 12 o'clock, for the blueprint's ringSegment viz. */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  fraction: number,
): string {
  const f = Math.max(0.001, Math.min(0.9999, fraction));
  const end = -Math.PI / 2 + f * 2 * Math.PI;
  const ex = cx + r * Math.cos(end);
  const ey = cy + r * Math.sin(end);
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}
