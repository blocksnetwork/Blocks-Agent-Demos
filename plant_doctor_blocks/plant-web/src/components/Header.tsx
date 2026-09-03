import Link from "next/link";

/** `nav-ghost` — the 66px navigation band across the top of the canvas. */
export function Header() {
  return (
    <header className="flex h-full flex-wrap items-center justify-between gap-x-6 gap-y-1">
      <div className="flex items-center gap-3">
        <span className="brand-mark">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20v-7" />
            <path d="M12 13c0-4.4 3.1-8 7-8 0 4.4-3.1 8-7 8Z" />
            <path d="M12 15c-3.3 0-6-2.7-6-6 3.3 0 6 2.7 6 6Z" />
          </svg>
        </span>
        <div className="flex flex-col gap-px">
          <div className="font-display text-[17px] font-bold tracking-[-0.01em]">
            Plant Doctor
          </div>
          <div className="text-[12px] text-body">One photo, one diagnosis.</div>
        </div>
      </div>

      <nav className="flex items-center gap-6 text-[13px]" aria-label="Primary">
        <span className="hidden text-mute md:inline">
          JPEG, PNG or WebP · up to 10 MB
        </span>
        <span aria-current="page" className="font-semibold text-ink">
          Diagnose
        </span>
        <Link href="/journal" className="nav-link">
          <span className="underline-draw">Journal</span>
        </Link>
      </nav>
    </header>
  );
}
