import { ACCEPT_ATTRIBUTE } from "@/lib/limits";

interface DropZoneProps {
  dragging: boolean;
  onFiles: (files: FileList | null) => void;
  onDraggingChange: (dragging: boolean) => void;
}

/** The glass drop panel that fills the subject stage until a photo lands. */
export function DropZone({
  dragging,
  onFiles,
  onDraggingChange,
}: DropZoneProps) {
  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        onDraggingChange(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        onDraggingChange(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDraggingChange(false);
        onFiles(event.dataTransfer.files);
      }}
      className={`drop-zone ${dragging ? "is-dragging" : ""}`}
    >
      <div className="drop-inner">
        <div className="drop-icon">
          <svg
            width="46"
            height="46"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 16.5V8.5A2.5 2.5 0 0 1 6.5 6h1.1a1.5 1.5 0 0 0 1.3-.75l.5-.9A1.5 1.5 0 0 1 10.7 3.6h2.6a1.5 1.5 0 0 1 1.3.75l.5.9A1.5 1.5 0 0 0 16.4 6h1.1A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5Z" />
            <circle cx="12" cy="12.4" r="3.4" />
          </svg>
        </div>

        <h1 data-reveal className="drop-title">
          {dragging ? "Drop it here" : "Show me the plant"}
        </h1>
        <p className="drop-body">
          {dragging
            ? "Release to load this photo."
            : "One clear photo in daylight, the whole plant in frame. Nothing else to fill in."}
        </p>

        <span className="btn">Choose a photo</span>

        <span className="text-[12px] text-mute">
          Or drag one in, or paste from the clipboard
        </span>
      </div>

      <input
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        capture="environment"
        aria-label="Choose a plant photo to diagnose"
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}
