'use client';

import { useEffect, useState } from 'react';
import { DELETION_GRACE_DAYS, type Profile } from '@exam-prep/contracts';
import { hasAnalyticsConsent, setAnalyticsConsent } from '@/lib/analytics';
import { accountApi, getMe } from '@/lib/api/identity';
import { ApiRequestError } from '@/lib/api/http';
import { authErrorMessage, reauthenticate, signInMethod } from '@/lib/auth';
import { useAuth } from '@/features/auth/AuthProvider';
import { Alert, BusyButton, Notice } from '@/features/auth/ui';
import styles from '@/features/auth/auth.module.css';

const CONFIRM_WORD = 'DELETE';
const DAY_MS = 86_400_000;
const date = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'long' }).format(new Date(Date.parse(iso) + DELETION_GRACE_DAYS * DAY_MS));

/**
 * Account page: data export and account deletion (docs/SECURITY.md "Privacy and deletion
 * workflow"). Deletion needs typed confirmation plus a fresh sign-in, then runs after a
 * cancellable grace period. Financial records are kept as the law requires. The usage-data
 * choice is per browser and off until the student opts in.
 */
export function PrivacyPanel({ profile }: { profile: Profile }) {
  const { setProfile } = useAuth();
  const method = signInMethod();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = profile.deletionRequestedAt ?? null;
  // Read after mount: localStorage is not available while the page renders on the server.
  const [consent, setConsent] = useState(false);
  useEffect(() => setConsent(hasAnalyticsConsent()), []);
  const changeConsent = (granted: boolean) => {
    setAnalyticsConsent(granted);
    setConsent(hasAnalyticsConsent());
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const download = () =>
    run('export', async () => {
      const data = await accountApi.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-exam-prep-data.json';
      a.click();
      URL.revokeObjectURL(url);
      setNotice('Your data was downloaded as a JSON file.');
    });

  const remove = () =>
    run('delete', async () => {
      if (!(await reauthenticate(password))) return;
      await accountApi.requestDeletion();
      setProfile(await getMe());
      setOpen(false);
    });

  const cancel = () =>
    run('cancel', async () => {
      await accountApi.cancelDeletion();
      setProfile(await getMe());
      setNotice('Deletion cancelled. Your account stays as it is.');
    });

  const ready = typed.trim().toUpperCase() === CONFIRM_WORD && (method !== 'password' || password.length > 0);

  return (
    <section className={styles.panel} aria-labelledby="privacy-title">
      <div className={styles.panelHead}>
        <h2 id="privacy-title" className="t-title">
          Your data
        </h2>
        <p className="t-small t-secondary">Download what we hold about you, or delete your account.</p>
      </div>

      <label className={styles.check}>
        <input type="checkbox" checked={consent} onChange={(e) => changeConsent(e.target.checked)} aria-describedby="analytics-help" />
        <span>
          Share anonymous usage data
          <span id="analytics-help" className="t-small t-secondary" style={{ display: 'block' }}>
            Helps us see which pages confuse people. Never includes questions, answers, your email or payment details. Applies to this
            browser only.
          </span>
        </span>
      </label>

      <BusyButton busy={busy === 'export'} className="btn btn-secondary btn-full" onClick={() => void download()} type="button">
        Download my data
      </BusyButton>

      {pending ? (
        <div className={styles.field}>
          <Alert>Your account will be deleted on {date(pending)}. Cancel before then to keep it.</Alert>
          <BusyButton busy={busy === 'cancel'} className="btn btn-primary btn-full" onClick={() => void cancel()} type="button">
            Cancel deletion
          </BusyButton>
        </div>
      ) : open ? (
        <form
          className={styles.field}
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) void remove();
          }}
        >
          <p className="t-small">
            After {DELETION_GRACE_DAYS} days we remove your profile, sign-in, devices, follows and saved questions, and your attempts stop being linked to
            you. Access to purchased tests ends. Invoices and payment records are kept as long as tax law requires; refunds are not automatic.
          </p>
          {method === 'password' ? (
            <label className={styles.field}>
              <span className={styles.label}>Your password</span>
              <input className={styles.input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          ) : null}
          <label className={styles.field}>
            <span className={styles.label}>Type {CONFIRM_WORD} to confirm</span>
            <input className={styles.input} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <BusyButton busy={busy === 'delete'} disabled={!ready} className="btn btn-primary btn-full" type="submit">
            {method === 'google' ? 'Confirm with Google and delete' : 'Confirm and delete'}
          </BusyButton>
          <button type="button" className="btn btn-ghost btn-full" onClick={() => setOpen(false)}>
            Keep my account
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-full" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      )}

      <div aria-live="polite">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Notice>{notice}</Notice> : null}
      </div>
    </section>
  );
}
