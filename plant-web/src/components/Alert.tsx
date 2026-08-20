export type AlertTone = "amber" | "coral";

const TONES: Record<AlertTone, { panel: string; dot: string; title: string }> = {
  amber: { panel: "bg-amber-bg", dot: "bg-amber", title: "text-amber" },
  coral: { panel: "bg-coral-bg", dot: "bg-coral", title: "text-coral" },
};

interface AlertProps {
  tone: AlertTone;
  title: string;
  body: string;
}

export function Alert({ tone, title, body }: AlertProps) {
  const styles = TONES[tone];

  return (
    <div
      role="alert"
      className={`flex animate-in gap-3 rounded-panel px-4.5 py-4 ${styles.panel}`}
    >
      <span
        className={`flex size-[22px] flex-none items-center justify-center rounded-full text-[13px] font-semibold text-white ${styles.dot}`}
      >
        !
      </span>
      <div className="flex flex-col gap-[3px]">
        <div className={`text-[14px] font-semibold ${styles.title}`}>
          {title}
        </div>
        <div className="text-[13px] leading-[1.5] text-body">{body}</div>
      </div>
    </div>
  );
}
