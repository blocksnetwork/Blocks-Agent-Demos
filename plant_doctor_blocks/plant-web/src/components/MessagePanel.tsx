import { ANCHORS, FRAMES, Slot } from "./composition";
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

const TONES: Record<MessageTone, string> = {
  neutral: "bg-chip text-body",
  amber: "bg-amber-bg text-amber",
  coral: "bg-coral-bg text-coral",
};

interface MessagePanelProps {
  message: MessageSpec;
  onPrimary: () => void;
  onSecondary: () => void;
}

/** A refusal, a queue notice or a failure, in the treatment-plan frame. */
export function MessagePanel({
  message,
  onPrimary,
  onSecondary,
}: MessagePanelProps) {
  return (
    <Slot
      id="treatment-plan"
      frame={FRAMES.treatmentPlan}
      surface="solid"
      anchor={{ target: "progress-stream", at: ANCHORS.streamFoot }}
      className="treatment-slot"
      role="status"
    >
      <div className={`message-glyph ${TONES[message.tone]}`}>{message.glyph}</div>

      <h2 data-reveal className="panel-title">
        {message.title}
      </h2>
      <p className="text-[14px] leading-[1.6] text-pretty">{message.body}</p>

      {message.list.length > 0 && (
        <ul className="tip-list" data-reveal-group>
          {message.list.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap gap-2.5 pt-3">
        <PillButton onClick={onPrimary}>{message.primary}</PillButton>
        <PillButton variant="muted" onClick={onSecondary}>
          {message.secondary}
        </PillButton>
      </div>
    </Slot>
  );
}
