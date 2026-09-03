import Link from "next/link";

export type StatusTone = "idle" | "live" | "ok" | "warn" | "bad";

interface TopBarProps {
  status: { label: string; tone: StatusTone };
}

/** The 64px app shell: product name, nav, and the agent status slot. */
export function TopBar({ status }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20v-7" />
              <path d="M12 13c0-4.4 3.1-8 7-8 0 4.4-3.1 8-7 8Z" />
              <path d="M12 15c-3.3 0-6-2.7-6-6 3.3 0 6 2.7 6 6Z" />
            </svg>
          </span>
          <span className="brand-name">Plant Doctor</span>
        </div>

        <nav className="topnav" aria-label="Primary">
          <span aria-current="page" className="topnav-link is-current">
            Diagnose
          </span>
          <Link href="/journal" className="topnav-link">
            Journal
          </Link>
          <a
            href="https://github.com/blocksnetwork/Blocks-Agent-Demos"
            className="topnav-link"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </nav>

        <div className={`status-slot tone-${status.tone}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          <span className="status-agent">plant_doctor_blocks</span>
          <span className="status-label">{status.label}</span>
        </div>
      </div>
    </header>
  );
}
