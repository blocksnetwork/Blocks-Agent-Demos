import { Bars } from "@/components/Bars";
import { GHOST, PRIMARY_DARK } from "@/components/styles";
import { stamp } from "@/lib/format";
import { MAX_TAKE_SECONDS, TAKE_WARNING_SECONDS } from "@/lib/recorder";

const WAVE_BARS = 96;
const LIVE_HEAD = 12;

interface RecordingScreenProps {
  elapsed: number;
  paused: boolean;
  /** Newest-last level history. Shorter than the meter until the take fills it. */
  history: number[];
  onStop: () => void;
  onTogglePause: () => void;
}

export function RecordingScreen({
  elapsed,
  paused,
  history,
  onStop,
  onTogglePause,
}: RecordingScreenProps) {
  const values =
    history.length > 0 ? history : Array.from({ length: WAVE_BARS }, () => 0.03);

  // The last stretch is drawn solid and everything behind it faded, so the
  // write head is visible without moving anything.
  const activeFrom = Math.max(0, values.length - LIVE_HEAD);

  return (
    <div className="animate-in flex w-full max-w-[720px] flex-col">
      <div className="flex items-center gap-3 border-b border-rule pb-5">
        <span
          className={`size-[9px] ${paused ? "bg-mute" : "animate-live bg-live"}`}
          aria-hidden="true"
        />
        <span className="label tracking-[0.18em]">
          {paused ? "Paused" : "Recording"}
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[12px] text-mute">
          {elapsed > TAKE_WARNING_SECONDS
            ? `${stamp(MAX_TAKE_SECONDS - elapsed)} left in this take`
            : ""}
        </span>
      </div>

      <span className="pt-[34px] pb-6 font-mono text-[clamp(56px,14vw,92px)] font-normal tracking-[-0.04em] tabular-nums">
        {stamp(elapsed)}
      </span>

      <div className="border-y border-rule py-[22px]">
        <Bars
          values={values}
          height={86}
          activeFrom={activeFrom}
          activeClass="bg-accent"
          restClass="bg-accent-rest"
        />
      </div>

      <div className="mt-10 flex items-center gap-7">
        <button type="button" onClick={onStop} className={PRIMARY_DARK}>
          Stop
        </button>
        <button type="button" onClick={onTogglePause} className={GHOST}>
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
    </div>
  );
}
