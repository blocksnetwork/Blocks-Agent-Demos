import { GHOST, PRIMARY } from "@/components/styles";
import type { Message } from "@/lib/messages";

interface FailureProps {
  label: string;
  message: Message;
  /** What actually went wrong, when the fixed copy above cannot name it. */
  detail?: string | null;
  onPrimary: () => void;
  onReset: () => void;
  resetLabel: string;
}

export function Failure({
  label,
  message,
  detail,
  onPrimary,
  onReset,
  resetLabel,
}: FailureProps) {
  return (
    <div className="animate-in flex w-full max-w-[620px] flex-col gap-6">
      <span className="label text-mute">{label}</span>

      <h2 className="m-0 font-display text-[clamp(30px,6vw,40px)] leading-[1.1] font-normal">
        {message.title}
      </h2>

      <p className="m-0 text-[16px] leading-[1.6] text-mute">{message.body}</p>

      {detail && (
        <p className="m-0 border-l-2 border-rule pl-4 font-mono text-[12px] leading-[1.6] text-faint">
          {detail}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-7">
        <button type="button" onClick={onPrimary} className={PRIMARY}>
          {message.primary}
        </button>
        <button type="button" onClick={onReset} className={GHOST}>
          {resetLabel}
        </button>
      </div>
    </div>
  );
}
