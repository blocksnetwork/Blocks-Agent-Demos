export function Header({ mode }: { mode: string }) {
  return (
    <header className="mb-[72px] flex w-full max-w-[940px] items-baseline justify-between gap-5 border-b border-rule pt-[26px] pb-[14px]">
      <span className="label">Hook Finder</span>
      <span className="label tracking-[0.14em] text-mute">{mode}</span>
    </header>
  );
}
