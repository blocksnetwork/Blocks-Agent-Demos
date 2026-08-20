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

function frameHeight(photo: Photo): string {
  if (photo.extremeAspect) return "520px";
  if (photo.tiny) return "210px";
  return "340px";
}

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
    <div className="flex animate-in flex-col gap-[18px] rounded-card bg-white p-5 shadow-card">
      <div
        className={`relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-frame ${
          photo.hasAlpha ? "checkerboard" : "bg-mint"
        }`}
      >
        {/* A blob URL from the user's own disk — nothing for next/image to do. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt="The plant photo you uploaded, awaiting diagnosis"
          style={{ height: frameHeight(photo) }}
          className="w-full object-contain"
        />

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/72">
            <span className="size-[38px] animate-spin-ring rounded-full border-[3px] border-leaf/22 border-t-leaf" />
          </div>
        )}

        {note && (
          <div className="absolute bottom-3.5 left-3.5 rounded-full bg-white/92 px-[13px] py-[7px] text-[12px] font-medium text-ink shadow-pill">
            {note}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="truncate text-[15px] font-medium">{photo.name}</div>
          <div className="text-[12px] text-mute">{photo.meta}</div>
        </div>

        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="cursor-pointer rounded-full bg-chip px-[18px] py-[11px] text-[14px] font-medium text-body transition-colors hover:bg-chip-hover hover:text-ink"
          >
            Remove
          </button>
        )}
      </div>

      {showDiagnose && (
        <button
          type="button"
          onClick={onDiagnose}
          className="w-full cursor-pointer rounded-full bg-[linear-gradient(150deg,#6fcf4b,#4caf50)] p-4 text-[16px] font-semibold text-white shadow-leaf-lg transition-shadow hover:shadow-leaf-hover"
        >
          Diagnose
        </button>
      )}
    </div>
  );
}
