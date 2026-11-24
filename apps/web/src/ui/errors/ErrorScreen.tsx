'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ApiRequestError } from '@/lib/api/http';
import { ErrorArt, type ErrorKind } from './ErrorArt';
import styles from './errors.module.css';

export type { ErrorKind } from './ErrorArt';

/** Default words for each kind; pages pass their own when they know more. */
export const ERROR_COPY: Record<ErrorKind, { code: string; title: string; body: string }> = {
  'not-found': {
    code: '404',
    title: 'We can’t find that page',
    body: 'The link may be old, or the page has moved or been retired. Check the address, or head back.',
  },
  server: {
    code: '500',
    title: 'Something went wrong on our side',
    body: 'This is our fault, not yours. Your answers and purchases are safe. Please try again in a moment.',
  },
  offline: {
    code: 'Offline',
    title: 'You’re not connected',
    body: 'We couldn’t reach MakeMePrepare. Check your internet connection, then try again.',
  },
  forbidden: {
    code: '403',
    title: 'You don’t have access to this',
    body: 'Your account can’t open this page. If you think it should, ask the person who manages your access.',
  },
  'signed-out': {
    code: '401',
    title: 'Please sign in again',
    body: 'Your session ended or this device was signed out. Sign in to carry on where you left off.',
  },
  blocked: {
    code: 'Account',
    title: 'This account can’t be used',
    body: 'The account has been blocked. If you think this is a mistake, contact support.',
  },
  unavailable: {
    code: '503',
    title: 'This is briefly unavailable',
    body: 'A service we rely on isn’t responding right now. Please try again in a few minutes.',
  },
  'rate-limit': {
    code: '429',
    title: 'Slow down a little',
    body: 'Too many requests came from this device in a short time. Wait a moment, then try again.',
  },
};

/** The kind of error to show for any failed call. */
export function errorKind(error: unknown): ErrorKind {
  if (!(error instanceof ApiRequestError)) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    return 'server';
  }
  if (error.code === 'NETWORK') return 'offline';
  if (error.code === 'ACCOUNT_BLOCKED') return 'blocked';
  if (error.status === 401 || error.code === 'UNAUTHENTICATED' || error.code === 'DEVICE_NOT_REGISTERED') return 'signed-out';
  if (error.status === 403) return 'forbidden';
  if (error.status === 404) return 'not-found';
  if (error.status === 429) return 'rate-limit';
  if (error.status === 503) return 'unavailable';
  return 'server';
}

/** Home of the area the visitor is in, so "home" never throws a reviewer out to the website. */
export function areaHome(pathname: string | null): { href: string; label: string } {
  if (pathname?.startsWith('/admin')) return { href: '/admin', label: 'Admin home' };
  if (pathname?.startsWith('/examiner')) return { href: '/examiner', label: 'Examiner home' };
  if (pathname?.startsWith('/review')) return { href: '/review', label: 'Review queue' };
  return { href: '/', label: 'Go to home' };
}

interface Props {
  kind: ErrorKind;
  title?: string | undefined;
  children?: ReactNode;
  /** Shows "Try again" as the main action. */
  onRetry?: () => void;
  /** Extra actions (for example "Sign in" or a section link), shown before Back and Home. */
  action?: ReactNode;
  home?: { href: string; label: string };
  /** Full page (route errors) or inside a page (failed loads). */
  variant?: 'page' | 'inline';
  /** Heading level: `h1` on full pages, `h2` inside a page that already has one. */
  as?: 'h1' | 'h2';
}

/**
 * Every error the visitor sees: a drawing that says what happened, a plain explanation, and a way
 * out (try again, go back, or go home). Never a framework error page.
 */
export function ErrorScreen({ kind, title, children, onRetry, action, home, variant = 'inline', as }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const copy = ERROR_COPY[kind];
  const target = home ?? areaHome(pathname);
  const Heading = as ?? (variant === 'page' ? 'h1' : 'h2');

  function back() {
    // A visitor who arrived straight on this URL has no page to go back to inside the site.
    const sameSite = typeof document !== 'undefined' && document.referrer.startsWith(window.location.origin);
    if (sameSite && window.history.length > 1) router.back();
    else router.push(target.href);
  }

  return (
    <section className={`${styles.screen} ${variant === 'page' ? styles.page : styles.inline}`} role="alert" aria-live="polite">
      <ErrorArt kind={kind} className={styles.art} />
      <p className={styles.code}>{copy.code}</p>
      <Heading className={styles.title}>{title ?? copy.title}</Heading>
      <div className={styles.body}>{children ?? <p>{copy.body}</p>}</div>
      <div className={styles.actions}>
        {onRetry ? (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        {action}
        <button type="button" className="btn btn-secondary" onClick={back}>
          Go back
        </button>
        <Link href={target.href} className={`btn ${onRetry || action ? 'btn-secondary' : 'btn-primary'}`}>
          {target.label}
        </Link>
      </div>
    </section>
  );
}
