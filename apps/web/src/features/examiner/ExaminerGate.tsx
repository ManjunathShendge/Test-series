'use client';

import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { RequireSession } from '@/features/auth/RequireSession';
import { Waiting } from '@/features/auth/ui';
import { State } from '@/features/admin/ui';
import styles from '@/features/admin/admin.module.css';

export function ExaminerGate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Waiting label="Checking your sign-in…" />}>
      <RequireSession>
        {(profile) => (
          <main className={styles.main}>
            <div className={styles.pageHead}>
              <div>
                <p className="eyebrow eyebrow-static">MakeMePrepare</p>
                <p className="t-small t-secondary">{profile.fullName}</p>
              </div>
              <nav className={styles.actions} aria-label="Examiner">
                <Link className="btn btn-secondary" href="/examiner">
                  Authoring
                </Link>
                <Link className="btn btn-secondary" href="/examiner/apply">
                  Application
                </Link>
              </nav>
            </div>
            {children}
          </main>
        )}
      </RequireSession>
    </Suspense>
  );
}

export function ExaminerOnlyMessage({ children }: { children: ReactNode }) {
  return <State title="Examiner access required">{children}</State>;
}
