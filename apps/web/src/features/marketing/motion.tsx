'use client';

import { animate, motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Counts up to `value` once visible; reduced motion shows the final number at once. */
export function CountUp({ value, suffix = '', duration = 1.1 }: { value: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration, ease: EASE, onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [inView, reduced, value, duration]);

  return (
    <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {shown}
      {suffix}
    </span>
  );
}

/**
 * Score trend against the cutoff (the mobile Progress chart), drawn as a stroke once
 * visible. Decorative sample: the surrounding copy carries the meaning.
 */
export function TrendLine({ points, cutoff, width = 320, height = 140 }: { points: number[]; cutoff: number; width?: number; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();
  const pad = 12;
  // Scale to the data (with headroom) so the trend reads, as the mobile chart does.
  const lo = Math.max(0, Math.min(cutoff, ...points) - 10);
  const hi = Math.min(100, Math.max(cutoff, ...points) + 6);
  const x = (i: number) => pad + (i * (width - pad * 2)) / (points.length - 1);
  const y = (v: number) => height - pad - ((v - lo) / (hi - lo)) * (height - pad * 2);
  const d = points.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1] ?? 0;

  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${height}`} width="100%" aria-hidden="true">
      <line x1={pad} x2={width - pad} y1={y(cutoff)} y2={y(cutoff)} stroke="var(--steel-500)" strokeDasharray="5 5" strokeWidth="1.5" />
      <motion.path
        d={d}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: reduced ? 1 : 0 }}
        animate={{ pathLength: inView || reduced ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 1.4, ease: EASE }}
      />
      <motion.circle
        cx={x(points.length - 1)}
        cy={y(last)}
        r="5.5"
        fill="var(--brand)"
        stroke="var(--white)"
        strokeWidth="2.5"
        initial={{ scale: reduced ? 1 : 0 }}
        animate={{ scale: inView || reduced ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 1.3 }}
      />
    </svg>
  );
}
