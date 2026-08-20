type Variant = "primary" | "muted" | "white";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[linear-gradient(150deg,#6fcf4b,#4caf50)] text-white font-semibold shadow-leaf-sm hover:shadow-leaf-hover",
  muted: "bg-chip text-ink font-medium hover:bg-chip-hover",
  white:
    "bg-white text-leaf-deep font-semibold shadow-ghost hover:bg-mint",
};

interface PillButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: Variant;
}

export function PillButton({
  children,
  onClick,
  variant = "primary",
}: PillButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-full px-6 py-3.5 text-[15px] transition-shadow ${VARIANTS[variant]}`}
    >
      {children}
    </button>
  );
}
