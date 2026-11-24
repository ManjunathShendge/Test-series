'use client';

import Link from 'next/link';
import { Suspense, useState, type FormEvent, type ReactNode } from 'react';
import { ApiRequestError } from '@/lib/api/http';
import { updateMe } from '@/lib/api/identity';
import { useAuth } from '@/features/auth/AuthProvider';
import { RequireSession } from '@/features/auth/RequireSession';
import { Alert, Waiting } from '@/features/auth/ui';
import { State } from '@/features/admin/ui';
import styles from '@/features/admin/admin.module.css';

/**
 * Examiner pages need a signed-in account and an 18+ confirmation on record, not the student
 * onboarding (target exams, preparation stage), which has no meaning for an examiner.
 */
export function ExaminerGate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Waiting label="Checking your sign-in…" />}>
      <RequireSession allowIncompleteOnboarding>
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
            {profile.ageConfirmed ? children : <AgeConfirmation />}
          </main>
        )}
      </RequireSession>
    </Suspense>
  );
}

function AgeConfirmation() {
  const { setProfile } = useAuth();
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!adult) return setError('Examiners must be 18 or older. Confirm to continue.');
    setBusy(true);
    setError(null);
    try {
      setProfile(await updateMe({ ageConfirmed: true }));
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save. Please try again.');
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="age-title">
      <h1 id="age-title">Confirm your age</h1>
      <p>MakeMePrepare examiners must be 18 or older. We record this once for your account.</p>
      {error ? <Alert>{error}</Alert> : null}
      <form onSubmit={(event) => void submit(event)} noValidate>
        <label>
          <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} /> I am 18 or older
        </label>
        <div className={styles.actions} style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy || undefined}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function ExaminerOnlyMessage({ children }: { children: ReactNode }) {
  return <State title="Examiner access required">{children}</State>;
}
