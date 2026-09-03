import type { ReactNode } from "react";

type Variant = "primary" | "muted" | "ghost";

interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: Variant;
  disabled?: boolean;
  ariaPressed?: boolean;
}

/** The one accent goes on the primary button; the others stay on surface. */
export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  ariaPressed,
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ariaPressed}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  );
}

interface FileButtonProps {
  children: ReactNode;
  /** The id of the file input this opens. */
  htmlFor: string;
  variant?: Variant;
}

/** A button-styled label that opens the file picker without touching refs. */
export function FileButton({ children, htmlFor, variant = "muted" }: FileButtonProps) {
  return (
    <label htmlFor={htmlFor} className={`btn btn-${variant}`} tabIndex={0}>
      {children}
    </label>
  );
}
