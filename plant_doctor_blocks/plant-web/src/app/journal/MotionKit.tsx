"use client";

import { useEffect } from "react";

/**
 * The design-motion.js kit from design_blocks (task 20c2f567), ported to a
 * client effect so it re-wires on client-side navigation. Same selectors,
 * timings, and behavior as the delivered file.
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
      el.style.setProperty("--float-delay", i * 420 + "ms");
      const rotate = el.getAttribute("data-float-rotate");
      if (rotate) el.style.setProperty("--float-rotate", rotate);
    });

    const targets = document.querySelectorAll(
      "[data-reveal], [data-reveal-group]",
    );
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

    const nav = document.querySelector(".nav-scroll-edge");
    const onScroll = () =>
      nav?.classList.toggle("is-scrolled", scrollY > 40);
    if (nav) {
      addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    return () => {
      io?.disconnect();
      if (nav) removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
