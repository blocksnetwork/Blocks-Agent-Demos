"use client";

import { useEffect } from "react";

/**
 * public/design-motion.js runs once on load (deferred). This is the same
 * logic as a client effect so that panels mounted by a later state change —
 * the diagnosis, the treatment plan — still get their reveal. Key it on the
 * phase so it re-wires whenever the screen changes shape.
 */
export function MotionKit() {
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.querySelectorAll("[data-reveal-group]").forEach((group) => {
      [...group.children].forEach((child, i) =>
        (child as HTMLElement).style.setProperty("--i", String(i)),
      );
    });
    document.querySelectorAll<HTMLElement>("[data-float]").forEach((el, i) => {
      el.style.setProperty("--float-delay", `${i * 420}ms`);
      const rotate = el.getAttribute("data-float-rotate");
      if (rotate) el.style.setProperty("--float-rotate", rotate);
    });

    const targets = document.querySelectorAll("[data-reveal], [data-reveal-group]");
    let io: IntersectionObserver | undefined;
    if (reduced) {
      targets.forEach((el) => el.classList.add("is-visible"));
    } else {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              io?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
      );
      targets.forEach((el) => io?.observe(el));
    }

    return () => io?.disconnect();
  }, []);

  return null;
}
