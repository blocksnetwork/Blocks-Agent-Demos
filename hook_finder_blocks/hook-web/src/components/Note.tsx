interface NoteProps {
  label: string;
  title: string;
  body: string;
}

/** The labelled aside the design uses for anything the model qualified. */
export function Note({ label, title, body }: NoteProps) {
  return (
    <div className="mt-[34px] grid grid-cols-[1fr] gap-[26px] md:grid-cols-[151px_1fr]">
      <span className="label-sm text-mute">{label}</span>
      <div className="flex max-w-[640px] flex-col gap-2">
        <span className="font-display text-[26px] leading-[1.15]">{title}</span>
        <span className="text-[15px] leading-[1.6] text-mute">{body}</span>
      </div>
    </div>
  );
}
