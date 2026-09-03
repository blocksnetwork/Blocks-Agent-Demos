import type { ReactNode } from "react";

interface PanelProps {
  id?: string;
  /** Uppercase meta label above the title. */
  eyebrow: string;
  /** One line; shorten copy rather than wrap. */
  title: ReactNode;
  /** Right-aligned meta on the eyebrow line (a count, a time). */
  meta?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: string;
  ariaLabel?: string;
  ariaLive?: "polite" | "off";
}

/**
 * Every panel on the screen shares this anatomy: eyebrow, title, content,
 * optional footer meta — same padding, same corner, same hairline border.
 */
export function Panel({
  id,
  eyebrow,
  title,
  meta,
  footer,
  children,
  className = "",
  role,
  ariaLabel,
  ariaLive,
}: PanelProps) {
  return (
    <section
      id={id}
      className={`panel ${className}`}
      role={role}
      aria-label={ariaLabel}
      aria-live={ariaLive}
    >
      <header className="panel-head">
        <span className="eyebrow">{eyebrow}</span>
        {meta !== undefined && <span className="panel-meta">{meta}</span>}
      </header>
      <h2 className="panel-title" data-reveal>
        {title}
      </h2>
      <div className="panel-body">{children}</div>
      {footer && <footer className="panel-foot">{footer}</footer>}
    </section>
  );
}
