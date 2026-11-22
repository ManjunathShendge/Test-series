'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Entrance directions. Distances stay small so motion reads as polish, not spectacle. */
export type RevealVariant = 'up' | 'left' | 'right' | 'scale';

const FROM: Record<RevealVariant, Record<string, number>> = {
  up: { opacity: 0, y: 24 },
  left: { opacity: 0, x: -40 },
  right: { opacity: 0, x: 40 },
  scale: { opacity: 0, scale: 0.94 },
};

function itemVariants(variant: RevealVariant): Variants {
  return {
    hidden: { ...FROM[variant], transition: { duration: 0.35, ease: EASE } },
    shown: { opacity: 1, x: 0, y: 0, scale: 1, transition: { duration: 0.56, ease: EASE } },
  };
}

const group: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.08 } },
};

interface RevealProps {
  children: ReactNode;
  className?: string | undefined;
  /** Stagger direct RevealItem children instead of moving as one block. */
  stagger?: boolean;
  delay?: number;
  as?: 'div' | 'section' | 'ul' | 'ol' | 'li' | 'header';
  variant?: RevealVariant;
  /**
   * Play once (default) or every time: with `once={false}` items slide back out when they
   * leave the viewport and in again on return, in either scroll direction.
   */
  once?: boolean;
}

/**
 * Fades and slides content in as it scrolls into view. Content is server-rendered, so
 * crawlers read it, but it starts at opacity 0 until hydration; keep it off the hero (the
 * LCP element), which uses CSS animation instead. With reduced motion it renders in place.
 */
export function Reveal({ children, className, stagger = false, delay = 0, as = 'div', variant = 'up', once = true }: RevealProps) {
  const reduced = useReducedMotion();
  const Tag = motion[as];
  if (reduced) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once, amount: 0.2 }}
      variants={stagger ? group : itemVariants(variant)}
      {...(delay ? { transition: { delay } } : {})}
    >
      {children}
    </Tag>
  );
}

/** A child of a staggered Reveal; picks its own direction. */
export function RevealItem({ children, className, as = 'div', variant = 'up' }: Omit<RevealProps, 'stagger' | 'delay' | 'once'>) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={itemVariants(variant)}>
      {children}
    </Tag>
  );
}
