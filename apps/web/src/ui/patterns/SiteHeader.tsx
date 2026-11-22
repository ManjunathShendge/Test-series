'use client';

import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AUTH_HINT_EVENT, getSignedInHint } from '@/lib/storage/device';
import { Logo } from '@/ui/primitives/Logo';
import styles from './SiteHeader.module.css';

const NAV = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/exams', label: 'Exams' },
  { href: '/#app', label: 'App' },
  { href: '/#examiners', label: 'For examiners' },
  { href: '/#faq', label: 'FAQ' },
] as const;

const LINES = {
  closed: ['M4 7h16', 'M4 17h16'],
  open: ['M6 6 18 18', 'M6 18 18 6'],
} as const;

/**
 * Floating glass navigation pill (owner's glassmorphism nav reference, 22 November 2026):
 * frosted white over the light hero, a little more opaque once the page scrolls; it never hides, so navigation stays reachable. The
 * phone menu is a disclosure that closes on Escape or on choosing a link.
 */
export function SiteHeader({ overHero = true }: { overHero?: boolean }) {
  const { scrollY } = useScroll();
  const reduced = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  // UI hint only (set by the sign-in flow); read after mount so server and client HTML match.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const sync = () => setSignedIn(getSignedInHint());
    sync();
    window.addEventListener(AUTH_HINT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_HINT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const solid = !overHero || scrolled || open;
  const lines = open ? LINES.open : LINES.closed;

  return (
    <header className={styles.header}>
      <div className={`container ${styles.wrap}`}>
        <div className={`${styles.pill} ${solid ? styles.pillSolid : ''}`}>
          <Logo priority compact />
          <nav aria-label="Main" className={styles.nav}>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={styles.link}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className={styles.actions}>
            {/* Log in and Start free share one glass segment, as in the owner's nav reference. */}
            <div className={styles.segment}>
              {signedIn ? (
                <Link href="/account" className={`btn btn-primary ${styles.segPrimary}`}>
                  My account
                </Link>
              ) : (
                <>
                  <Link href="/sign-in" className={`${styles.segLink} ${styles.login}`}>
                    Log in
                  </Link>
                  <Link href="/sign-in?mode=signup" className={`btn btn-primary ${styles.segPrimary}`}>
                    Start free
                  </Link>
                </>
              )}
            </div>
            <button
              type="button"
              className={styles.menuButton}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                {lines.map((d, i) => (
                  <motion.path
                    key={i}
                    initial={false}
                    animate={{ d }}
                    transition={{ duration: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
                ))}
              </svg>
            </button>
          </div>
        </div>
        <AnimatePresence>
          {open ? (
            <motion.nav
              id="mobile-menu"
              aria-label="Main menu"
              className={styles.sheet}
              initial={reduced ? false : { opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={styles.sheetLink} onClick={() => setOpen(false)}>
                  {n.label}
                </Link>
              ))}
              <Link href={signedIn ? '/account' : '/sign-in'} className={`btn btn-secondary btn-full ${styles.sheetLogin}`} onClick={() => setOpen(false)}>
                {signedIn ? 'My account' : 'Log in'}
              </Link>
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  );
}
