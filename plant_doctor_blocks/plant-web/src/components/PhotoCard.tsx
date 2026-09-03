import type { Photo } from "@/lib/photo";

interface PhotoCardProps {
  photo: Photo;
  busy: boolean;
  canRemove: boolean;
  showDiagnose: boolean;
  onRemove: () => void;
  onDiagnose: () => void;
}

/** One line explaining whatever is unusual about how this photo is displayed. */
function frameNote(photo: Photo): string | null {
  if (photo.hasAlpha) return "Checkered backdrop for transparency";
  if (photo.rotation) return `Rotated upright from EXIF`;
  if (photo.extremeAspect) return "Contained, not cropped";
  if (photo.tiny) return "Shown at native size";
  return null;
}

/**
 * The uploaded photo, filling the subject stage so the pins attach to it.
 * The action bar sits on top because the blueprint's annotations and the
 * treatment plan overlap the bottom of the subject.
 */
export function PhotoCard({
  photo,
  busy,
  canRemove,
  showDiagnose,
  onRemove,
  onDiagnose,
}: PhotoCardProps) {
  const note = frameNote(photo);

  return (
    <div className="photo-card">
      <div className="photo-bar">
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <div className="truncate text-[14px] font-medium text-ink">
            {photo.name}
          </div>
          <div className="text-[12px] text-mute">{photo.meta}</div>
        </div>

        {canRemove && (
          <button type="button" onClick={onRemove} className="btn btn-muted">
            Remove
          </button>
        )}

        {showDiagnose && (
          <button type="button" onClick={onDiagnose} className="btn">
            Diagnose
          </button>
        )}
      </div>

      <div className={`photo-frame ${photo.hasAlpha ? "checkerboard" : ""}`}>
        {/* A blob URL from the user's own disk — nothing for next/image to do. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt="The plant photo you uploaded, awaiting diagnosis"
          style={{ objectFit: photo.tiny ? "none" : "cover" }}
          className="photo-img"
        />

        {busy && (
          <div className="photo-busy">
            <span className="chip chip-live" data-float>
              Diagnosing…
            </span>
          </div>
        )}

        {note && (
          <div className="photo-note">
            <span className="chip">{note}</span>
          </div>
        )}
      </div>
    </div>
  );
}
