type Variant = "primary" | "muted" | "white";

/* The kit styles `.btn` (pill radius, primary fill); variants are its tints. */
const VARIANTS: Record<Variant, string> = {
  primary: "btn",
  muted: "btn btn-muted",
  white: "btn btn-white",
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
    <button type="button" onClick={onClick} className={VARIANTS[variant]}>
      {children}
    </button>
  );
}
