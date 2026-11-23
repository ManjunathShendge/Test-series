'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TemplateStatus } from '@exam-prep/contracts';
import { ApiRequestError } from '@/lib/api/http';
import { Waiting } from '@/features/auth/ui';
import styles from './admin.module.css';

/** A readable message for any failed call; validation issues are joined. */
export function messageOf(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return 'Something went wrong. Please try again.';
  const issues = (error.details as { issues?: ({ message?: string } | string)[] } | undefined)?.issues;
  if (error.code === 'VALIDATION_FAILED' && issues?.length) {
    return issues.map((i) => (typeof i === 'string' ? i : i.message)).filter(Boolean).join(' ');
  }
  return error.message;
}

export const isCode = (error: unknown, code: string) => error instanceof ApiRequestError && error.code === code;

type Load<T> = { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: T };

/** Loads data once (and on `reload`); keeps the last good data while reloading quietly. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const live = useRef(true);
  // Only the newest request may update state, so a slow earlier response never wins.
  const latest = useRef(0);
  const loader = useCallback(load, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(
    async (quiet = false) => {
      const request = ++latest.current;
      if (!quiet) setState({ status: 'loading' });
      try {
        const data = await loader();
        if (live.current && request === latest.current) setState({ status: 'ready', data });
      } catch (error) {
        if (live.current && request === latest.current) setState({ status: 'error', error });
      }
    },
    [loader],
  );
  useEffect(() => {
    live.current = true;
    void reload();
    return () => {
      live.current = false;
    };
  }, [reload]);
  const set = useCallback((data: T) => setState({ status: 'ready', data }), []);
  return { state, reload, set };
}

/** Loading, permission, not-found and connection states for a whole page. */
export function LoadGate<T>({ state, reload, what, children }: { state: Load<T>; reload: () => void; what: string; children: (data: T) => ReactNode }) {
  if (state.status === 'loading') return <Waiting label={`Loading ${what}…`} />;
  if (state.status === 'ready') return <>{children(state.data)}</>;
  const { error } = state;
  if (isCode(error, 'FORBIDDEN')) {
    return (
      <State title="You do not have access to this">
        Exams and templates need an admin account with the operations permission. Ask a super admin to grant it.
      </State>
    );
  }
  if (isCode(error, 'NOT_FOUND')) {
    return (
      <State title={`This ${what} does not exist`} action={<Link className="btn btn-secondary" href="/admin/exams">Back to exams</Link>}>
        It may have been deleted, or the link is wrong.
      </State>
    );
  }
  return (
    <State title={`Could not load ${what}`} action={<button className="btn btn-primary" onClick={reload}>Try again</button>}>
      {messageOf(error)}
    </State>
  );
}

export function State({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.state} role="status">
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: TemplateStatus | 'shown' | 'hidden' }) {
  const map = {
    published: [styles.badgeOn, 'Published'],
    shown: [styles.badgeOn, 'On website'],
    draft: [styles.badgeDraft, 'Draft'],
    retired: [styles.badgeOff, 'Retired'],
    hidden: [styles.badgeOff, 'Hidden'],
  } as const;
  const [cls, label] = map[status];
  return <span className={`${styles.badge} ${cls}`}>{label}</span>;
}

/** A modal confirmation (native <dialog>: focus trap, Escape and focus return built in). */
export function Confirm({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="confirm-title">
      <div className={styles.dialogBody}>
        <h2 id="confirm-title">{title}</h2>
        <div className="t-secondary">{children}</div>
        <div className={styles.dialogActions}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-primary ${danger ? styles.btnDanger : ''}`}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** "SSC CGL Tier 1" → "ssc-cgl-tier-1". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '');
}

export const minutes = (seconds: number) => Math.round((seconds / 60) * 100) / 100;

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

/** Warns before leaving a page with unsaved changes. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
