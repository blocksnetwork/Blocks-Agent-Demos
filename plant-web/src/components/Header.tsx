export function Header() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-[38px] flex-none items-center justify-center rounded-full bg-[linear-gradient(150deg,#6fcf4b,#4caf50)]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20v-7" />
            <path d="M12 13c0-4.4 3.1-8 7-8 0 4.4-3.1 8-7 8Z" />
            <path d="M12 15c-3.3 0-6-2.7-6-6 3.3 0 6 2.7 6 6Z" />
          </svg>
        </div>
        <div className="flex flex-col gap-px">
          <div className="text-[17px] font-semibold tracking-[-0.02em]">
            Plant Doctor
          </div>
          <div className="text-[12px] text-body">One photo, one diagnosis.</div>
        </div>
      </div>
      <div className="text-[12px] text-mute">
        JPEG, PNG or WebP · up to 10 MB
      </div>
    </header>
  );
}
