'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Gives every page section a subtle fade-in as it scrolls into view. Classes are added
 * only after hydration, so without JavaScript (and for crawlers) every section is simply
 * visible. The first section (the hero) is skipped so it paints immediately. Under
 * reduced motion nothing is added.
 */
export function SectionFade() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>('main section')).filter(
      (s, i) => i > 0 && !s.parentElement?.closest('main section'),
    );
    const below = sections.filter((s) => s.getBoundingClientRect().top > window.innerHeight * 0.9);
    below.forEach((s) => s.classList.add('sf-init'));

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('sf-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );
    below.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
