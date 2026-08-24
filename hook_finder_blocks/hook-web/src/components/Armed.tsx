import { Bars } from "@/components/Bars";
import { GHOST, PRIMARY_WIDE } from "@/components/styles";
import type { InputDevice } from "@/lib/recorder";

/**
 * A fixed jitter per bar. Re-rolling it every frame — 10 times a second — reads
 * as noise rather than as level, so the shape stays put and only the lit count
 * follows the microphone.
 */
const JITTER = Array.from({ length: 36 }, (_, i) => {
  const noise = Math.sin(i * 12.9898) * 43758.5453;
  return 0.55 + 0.45 * (noise - Math.floor(noise));
});

interface ArmedProps {
  level: number;
  devices: InputDevice[];
  deviceId: string | null;
  onDeviceChange: (id: string) => void;
  onStart: () => void;
  onBack: () => void;
}

export function Armed({
  level,
  devices,
  deviceId,
  onDeviceChange,
  onStart,
  onBack,
}: ArmedProps) {
  const values = JITTER.map((jitter, i) => (i / JITTER.length < level ? jitter : 0.12));

  return (
    <div className="animate-in flex w-full max-w-[720px] flex-col">
      <div className="flex items-baseline justify-between gap-5 border-b border-rule pb-[14px]">
        <span className="label text-mute">Input</span>
        {devices.length > 0 ? (
          <select
            aria-label="Microphone input"
            value={deviceId ?? devices[0]?.id}
            onChange={(event) => onDeviceChange(event.target.value)}
            className="cursor-pointer border-none bg-transparent text-right text-[16px] text-ink"
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[16px] text-mute">Default microphone</span>
        )}
      </div>

      <div className="flex items-center gap-5 border-b border-rule py-[26px]">
        <span className="label min-w-[54px] text-mute">Level</span>
        <Bars
          values={values}
          height={28}
          activeClass="bg-accent"
          restClass="bg-accent"
        />
      </div>

      <p className="mt-5 mb-0 text-[15px] text-mute">
        Say something — the meter should move before you spend a take.
      </p>

      <button type="button" onClick={onStart} className={`mt-[44px] ${PRIMARY_WIDE}`}>
        Start recording
      </button>

      <div className="mt-[14px] flex items-baseline justify-between gap-5">
        <span className="font-mono text-[12px] text-mute">
          space to start · esc to stop
        </span>
        <button type="button" onClick={onBack} className={GHOST}>
          Upload a file instead
        </button>
      </div>
    </div>
  );
}
