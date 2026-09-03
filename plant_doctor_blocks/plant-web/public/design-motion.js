/* Design Blocks motion kit — dependency-free. Load with: <script src="design-motion.js" defer></script> */
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
