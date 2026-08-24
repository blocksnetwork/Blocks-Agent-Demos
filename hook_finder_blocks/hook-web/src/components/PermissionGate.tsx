import { GHOST, PRIMARY } from "@/components/styles";

export type GateReason = "ask" | "denied" | "unsupported";

const COPY: Record<GateReason, { title: string; body: string; primary: string }> = {
  ask: {
    title: "Your browser will ask next.",
    body: "Audio stays in this tab until you choose to analyze it. Nothing uploads on its own.",
    primary: "Allow microphone",
  },
  denied: {
    title: "The browser said no.",
    body: "Microphone access is blocked for this site. Allow it in the address bar and try again, or upload a file instead.",
    primary: "Ask again",
  },
  unsupported: {
    title: "This browser cannot record.",
    body: "It has no microphone capture this page can use. Record the take in another app and upload the file — that path needs nothing special from the browser.",
    primary: "Try anyway",
  },
};

interface PermissionGateProps {
  reason: GateReason;
  onGrant: () => void;
  onBack: () => void;
}

export function PermissionGate({ reason, onGrant, onBack }: PermissionGateProps) {
  const copy = COPY[reason];

  return (
    <div className="animate-in flex w-full max-w-[620px] flex-col gap-6">
      <span className="label text-mute">Microphone</span>

      <h2 className="m-0 font-display text-[clamp(30px,6vw,40px)] leading-[1.1] font-normal">
        {copy.title}
      </h2>

      <p className="m-0 text-[16px] leading-[1.6] text-mute">{copy.body}</p>

      <div className="mt-2 flex flex-wrap items-center gap-7">
        <button type="button" onClick={onGrant} className={PRIMARY}>
          {copy.primary}
        </button>
        <button type="button" onClick={onBack} className={GHOST}>
          {reason === "ask" ? "Back" : "Upload a file"}
        </button>
      </div>
    </div>
  );
}
