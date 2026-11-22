'use client';

import 'lenis/dist/lenis.css';
import { ReactLenis } from 'lenis/react';
import { useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Lenis smoothing for the public pages only. Off when the visitor prefers reduced motion,
 * so native scrolling, find-in-page and keyboard scrolling behave exactly as the browser's.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <ReactLenis root options={{ lerp: 0.12, smoothWheel: true, anchors: { offset: -72 } }}>
      {children}
    </ReactLenis>
  );
}
