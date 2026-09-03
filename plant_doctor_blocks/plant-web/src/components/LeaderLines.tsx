"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Leader lines drawn from LIVE geometry — composition.html's script, ported.
 * Every [data-anchor-target] gets a line from its centre to the anchor point
 * on its target, redrawn each frame so drifting pins stay attached through
 * floats, reveals and resizes. Skipped below 760px, where the canvas
 * linearises.
 */
export function LeaderLines({
  canvasRef,
}: {
  canvasRef: RefObject<HTMLElement | null>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const canvas = canvasRef.current;
    if (!svg || !canvas) return;

    const linear = matchMedia("(max-width: 760px)");
    let raf = 0;
    let last = "";

    const draw = () => {
      raf = requestAnimationFrame(draw);

      if (linear.matches) {
        if (last) {
          svg.replaceChildren();
          last = "";
        }
        return;
      }

      const box = canvas.getBoundingClientRect();
      const parts: string[] = [];

      canvas
        .querySelectorAll<HTMLElement>("[data-anchor-target]")
        .forEach((el) => {
          const target = canvas.querySelector<HTMLElement>(
            `[data-id="${el.dataset.anchorTarget}"]`,
          );
          if (!target) return;

          const [ax0, ay0] = (el.dataset.anchorAt ?? "50,50")
            .split(",")
            .map(Number);
          const t = target.getBoundingClientRect();
          const s = el.getBoundingClientRect();
          const ax = t.left - box.left + (ax0 / 100) * t.width;
          const ay = t.top - box.top + (ay0 / 100) * t.height;
          const sx = s.left - box.left + s.width / 2;
          const sy = s.top - box.top + s.height / 2;

          parts.push(
            `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}" stroke="var(--design-primary-strong)" stroke-width="2" opacity="0.85"/>`,
            `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="5" fill="var(--design-primary-strong)"/>`,
          );
        });

      const next = parts.join("");
      if (next !== last) {
        svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
        svg.innerHTML = next;
        last = next;
      }
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [canvasRef]);

  return <svg ref={svgRef} className="leaders" aria-hidden="true" />;
}
