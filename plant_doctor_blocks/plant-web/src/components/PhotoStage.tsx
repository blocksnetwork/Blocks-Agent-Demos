import { ACCEPT_ATTRIBUTE } from "@/lib/limits";
import type { EvidencePoint } from "@/lib/evidence";
import type { Photo } from "@/lib/photo";

/**
 * Where the numbered pins sit on the photo, as percentages of its box, and
 * which side the label extends to so it never leaves the visible frame.
 * Positions are a fixed spread — the model reports no coordinates.
 */
const PIN_SPOTS: { x: number; y: number; side: "left" | "right" }[] = [
  { x: 24, y: 34, side: "right" },
  { x: 62, y: 74, side: "left" },
  { x: 71, y: 28, side: "left" },
];

interface PhotoStageProps {
  photo: Photo | null;
  dragging: boolean;
  busy: boolean;
  onDraggingChange: (dragging: boolean) => void;
  onFiles: (files: FileList | null) => void;
  markers: EvidencePoint[];
  showMarkers: boolean;
  heroAlt: string;
}

/**
 * The subject: the uploaded photo as the largest region on the screen, with
 * the evidence markers pinned inside its container. Before a photo exists
 * the same frame is the drop zone, over the curated leaf photograph.
 */
export function PhotoStage({
  photo,
  dragging,
  busy,
  onDraggingChange,
  onFiles,
  markers,
  showMarkers,
  heroAlt,
}: PhotoStageProps) {
  const dragHandlers = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      onDraggingChange(true);
    },
    onDragLeave: (event: React.DragEvent) => {
      event.preventDefault();
      onDraggingChange(false);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      onDraggingChange(false);
      onFiles(event.dataTransfer.files);
    },
  };

  if (!photo) {
    return (
      <label
        {...dragHandlers}
        className={`stage stage-drop ${dragging ? "is-dragging" : ""}`}
        data-id="subject"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero.png" alt={heroAlt} className="stage-img" />
        <div className="stage-veil" aria-hidden="true" />

        <div className="drop-copy">
          <span className="eyebrow drop-eyebrow">
            {dragging ? "Release to load" : "No photo loaded"}
          </span>
          <span className="drop-title">
            {dragging ? "Drop it here" : "Drop a photo of the plant"}
          </span>
          <span className="drop-body">
            One clear shot in daylight, the affected leaves in frame. JPEG, PNG
            or WebP up to 10 MB. Drag it in, paste it, or choose a file.
          </span>
          <span className="btn btn-primary drop-btn">Choose a photo</span>
        </div>

        <input
          id="photo-input"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          capture="environment"
          aria-label="Choose a plant photo to diagnose"
          onChange={(event) => {
            onFiles(event.target.files);
            event.target.value = "";
          }}
          className="stage-input"
        />
      </label>
    );
  }

  return (
    <div
      {...dragHandlers}
      className={`stage ${dragging ? "is-dragging" : ""} ${photo.hasAlpha ? "checkerboard" : ""}`}
      data-id="subject"
    >
      {/* A blob URL from the user's own disk — nothing for next/image to do. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={
          markers.length > 0
            ? "The uploaded plant photo with numbered evidence markers"
            : "The uploaded plant photo"
        }
        className="stage-img"
        style={{ objectFit: photo.tiny ? "none" : photo.extremeAspect ? "contain" : "cover" }}
      />

      {busy ? (
        <span className="chip chip-live" data-float>
          <span className="live-dot is-live" aria-hidden="true" />
          Diagnosing…
        </span>
      ) : (
        <span className="chip chip-meta">
          {photo.width} × {photo.height}
          {markers.length > 0 && showMarkers ? ` · ${markers.length} markers` : ""}
        </span>
      )}

      {showMarkers &&
        markers.map((point, index) => {
          const spot = PIN_SPOTS[index] ?? PIN_SPOTS[PIN_SPOTS.length - 1];
          return (
            <div
              key={point.n}
              className={`marker side-${spot.side}`}
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            >
              <svg className="marker-leader" width="48" height="2" aria-hidden="true">
                <line
                  x1="0"
                  y1="1"
                  x2="48"
                  y2="1"
                  stroke="var(--design-primary-strong)"
                  strokeWidth="2"
                />
              </svg>
              <span className="marker-num" aria-hidden="true">
                {point.n}
              </span>
              <span className="marker-label">
                <span className="marker-value">{point.label}</span>
                <span className="marker-caption">Evidence {point.n} of {markers.length}</span>
              </span>
            </div>
          );
        })}
    </div>
  );
}
