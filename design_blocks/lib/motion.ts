/**
 * The motion kit: the micro-animations that separate "styled" from
 * "designed". A small vocabulary — staggered scroll reveals, hover lift
 * and tilt, floating drift, underline draw, scrolled-nav state —
 * parameterized by the direction's energy, delivered as one CSS file and
 * one dependency-free JS file wired entirely through data-attributes.
 * Honors prefers-reduced-motion throughout.
 */

import type { Genome } from './pagespec.js';
import type { DesignTokens } from './tokens.js';

type Energy = Genome['motionEnergy'];

const PARAMS: Record<Energy, { duration: number; stagger: number; distance: number; ease: string; drift: number; lift: number }> = {
  calm: { duration: 700, stagger: 110, distance: 20, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', drift: 8, lift: 4 },
  lively: { duration: 500, stagger: 80, distance: 28, ease: 'cubic-bezier(0.34, 1.3, 0.64, 1)', drift: 12, lift: 6 },
  snappy: { duration: 320, stagger: 55, distance: 32, ease: 'cubic-bezier(0.16, 1, 0.3, 1)', drift: 10, lift: 8 },
};

export function buildMotionCss(genome: Genome, tokens: DesignTokens): string {
  const p = PARAMS[genome.motionEnergy];
  return `/* Design Blocks motion kit — energy: ${genome.motionEnergy}. Link after design-theme.css. */

:root {
  --motion-duration: ${p.duration}ms;
  --motion-stagger: ${p.stagger}ms;
  --motion-ease: ${p.ease};
}

/* Scroll reveals: add data-reveal to a single element, or
   data-reveal-group to a parent whose children should stagger in. */
[data-reveal],
[data-reveal-group] > * {
  opacity: 0;
  transform: translateY(${p.distance}px);
  transition:
    opacity var(--motion-duration) var(--motion-ease),
    transform var(--motion-duration) var(--motion-ease);
  transition-delay: calc(var(--i, 0) * var(--motion-stagger));
}
[data-reveal].is-visible,
[data-reveal-group].is-visible > * {
  opacity: 1;
  transform: none;
}

/* Floating drift for stickers/chips: each element gets its own phase via
   --float-delay (set automatically by motion.js). */
@keyframes design-float {
  0%, 100% { transform: translateY(0) rotate(var(--float-rotate, 0deg)); }
  50% { transform: translateY(-${p.drift}px) rotate(var(--float-rotate, 0deg)); }
}
[data-float] {
  animation: design-float ${Math.round(p.duration * 6)}ms ease-in-out infinite;
  animation-delay: var(--float-delay, 0ms);
  will-change: transform;
}

/* Hover lift for cards. */
.hover-lift {
  transition: transform 220ms var(--motion-ease), box-shadow 220ms var(--motion-ease);
}
.hover-lift:hover {
  transform: translateY(-${p.lift}px);
  box-shadow: 0 ${p.lift * 3}px ${p.lift * 6}px rgba(15, 15, 20, 0.10);
}

/* Pointer tilt for collage cards: add data-tilt. */
[data-tilt] {
  transition: transform 180ms var(--motion-ease);
  will-change: transform;
}

/* Underline draw for links: wrap link text in .underline-draw. */
.underline-draw {
  background-image: linear-gradient(currentColor, currentColor);
  background-size: 0% 2px;
  background-position: 0 100%;
  background-repeat: no-repeat;
  transition: background-size 260ms var(--motion-ease);
  padding-bottom: 2px;
}
.underline-draw:hover,
a:hover > .underline-draw {
  background-size: 100% 2px;
}

/* Nav gains its edge only after scroll (motion.js toggles .is-scrolled). */
.nav-scroll-edge {
  border-bottom: 1px solid transparent;
  transition: border-color 240ms var(--motion-ease), background-color 240ms var(--motion-ease);
}
.nav-scroll-edge.is-scrolled {
  border-bottom-color: ${tokens.border};
}

/* Button press: tiny, everywhere. */
button:active, .btn:active, [type='submit']:active {
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  [data-reveal], [data-reveal-group] > * { opacity: 1; transform: none; transition: none; }
  [data-float] { animation: none; }
  [data-tilt], .hover-lift { transition: none; }
}
`;
}

export function buildMotionJs(): string {
  return `/* Design Blocks motion kit — dependency-free. Load with: <script src="design-motion.js" defer></script> */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Stagger indices for grouped reveals, phase offsets for floats.
  document.querySelectorAll('[data-reveal-group]').forEach((group) => {
    [...group.children].forEach((child, i) => child.style.setProperty('--i', i));
  });
  document.querySelectorAll('[data-float]').forEach((el, i) => {
    el.style.setProperty('--float-delay', (i * 420) + 'ms');
    const rotate = el.getAttribute('data-float-rotate');
    if (rotate) el.style.setProperty('--float-rotate', rotate);
  });

  // Scroll reveals.
  const targets = document.querySelectorAll('[data-reveal], [data-reveal-group]');
  if (reduced) {
    targets.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    targets.forEach((el) => io.observe(el));
  }

  // Nav edge on scroll.
  const nav = document.querySelector('.nav-scroll-edge');
  if (nav) {
    const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 40);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Pointer tilt.
  if (!reduced) {
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(700px) rotateY(' + (x * 6) + 'deg) rotateX(' + (y * -6) + 'deg)';
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }
})();
`;
}
