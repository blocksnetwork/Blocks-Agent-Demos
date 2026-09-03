import { arcPath, FRAMES, Slot, type Anchor } from "./composition";

/**
 * The two plane-3 annotations the blueprint pins onto the subject with leader
 * lines: `confidence-pin` (a leaderCallout carrying the confidence value) and
 * `anatomy-pin` (a ringSegment holding a magnified view of the photo). Both
 * float; both attach wherever the page tells them to — the leaf while idle,
 * the uploaded photo once there is one.
 */

interface ConfidencePinProps {
  value: string;
  caption?: string;
  anchor: Anchor;
}

export function ConfidencePin({ value, caption, anchor }: ConfidencePinProps) {
  return (
    <Slot
      id="confidence-pin"
      frame={FRAMES.confidencePin}
      surface="solid"
      anchor={anchor}
      float="2deg"
      className="pin-slot"
      ariaLabel={`Confidence: ${value}`}
    >
      <span className="value">{value}</span>
      <span className="label">Confidence</span>
      {caption && <span className="pin-caption">{caption}</span>}
    </Slot>
  );
}

const LENS = { cx: 115, cy: 104, r: 78, ring: 90, zoom: 2.6 };

interface EvidencePinProps {
  /** The photo the lens magnifies; the leaf cutout while nothing is loaded. */
  imageUrl: string | null;
  value: string;
  caption: string;
  /** How much of the ring is lit — 0 until there is a diagnosis. */
  fraction: number;
  anchor: Anchor;
}

export function EvidencePin({
  imageUrl,
  value,
  caption,
  fraction,
  anchor,
}: EvidencePinProps) {
  const side = LENS.r * 2 * LENS.zoom;

  return (
    <Slot
      id="anatomy-pin"
      frame={FRAMES.anatomyPin}
      surface="glass"
      anchor={anchor}
      float="-2deg"
      className="pin-slot"
      ariaLabel={`${value}: ${caption}`}
    >
      <svg className="viz" viewBox="0 0 230 264" aria-hidden="true">
        <defs>
          <clipPath id="evidence-lens">
            <circle cx={LENS.cx} cy={LENS.cy} r={LENS.r} />
          </clipPath>
        </defs>
        {imageUrl ? (
          <image
            href={imageUrl}
            x={LENS.cx - side / 2}
            y={LENS.cy - side / 2}
            width={side}
            height={side}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#evidence-lens)"
          />
        ) : (
          <circle
            cx={LENS.cx}
            cy={LENS.cy}
            r={LENS.r}
            fill="color-mix(in srgb, var(--design-primary) 10%, var(--design-surface))"
          />
        )}
        <circle
          cx={LENS.cx}
          cy={LENS.cy}
          r={LENS.ring}
          fill="none"
          stroke="var(--design-border)"
          strokeWidth="14"
          opacity="0.5"
        />
        <path
          d={arcPath(LENS.cx, LENS.cy, LENS.ring, fraction)}
          fill="none"
          stroke="var(--design-primary)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <text x="115" y="230" textAnchor="middle" className="ring-value">
          {value}
        </text>
        <text x="115" y="252" textAnchor="middle" className="ring-label">
          {caption}
        </text>
      </svg>
    </Slot>
  );
}
