import { PillButton } from "./PillButton";

export type MessageTone = "neutral" | "amber" | "coral";

export interface MessageSpec {
  glyph: string;
  tone: MessageTone;
  title: string;
  body: string;
  list: string[];
  primary: string;
  secondary: string;
}

const TONES: Record<MessageTone, { circle: string; ink: string; dot: string }> =
  {
    neutral: { circle: "bg-chip", ink: "text-body", dot: "bg-body" },
    amber: { circle: "bg-amber-bg", ink: "text-amber", dot: "bg-amber" },
    coral: { circle: "bg-coral-bg", ink: "text-coral", dot: "bg-coral" },
  };

interface MessagePanelProps {
  message: MessageSpec;
  onPrimary: () => void;
  onSecondary: () => void;
}

export function MessagePanel({
  message,
  onPrimary,
  onSecondary,
}: MessagePanelProps) {
  const tone = TONES[message.tone];

  return (
    <div
      role="status"
      className="flex animate-in flex-col gap-5 rounded-card bg-white px-8 py-9 shadow-card-soft"
    >
      <div
        className={`flex size-[76px] items-center justify-center rounded-full text-[26px] font-semibold ${tone.circle} ${tone.ink}`}
      >
        {message.glyph}
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-pretty">
          {message.title}
        </div>
        <p className="max-w-[44ch] text-[15px] leading-[1.6] text-pretty text-body">
          {message.body}
        </p>
      </div>

      {message.list.length > 0 && (
        <div className="flex flex-col gap-2">
          {message.list.map((item) => (
            <div
              key={item}
              className="flex items-start gap-[11px] text-[14px] leading-[1.55] text-ink"
            >
              <span
                className={`mt-[7px] size-1.5 flex-none rounded-full ${tone.dot}`}
              />
              {item}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2.5">
        <PillButton onClick={onPrimary}>{message.primary}</PillButton>
        <PillButton variant="muted" onClick={onSecondary}>
          {message.secondary}
        </PillButton>
      </div>
    </div>
  );
}
