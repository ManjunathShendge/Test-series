'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authErrorMessage, sendPasswordReset } from '@/lib/auth';
import { Alert, BusyButton, Field, Notice } from './ui';
import styles from './auth.module.css';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Password reset by email. The confirmation never says whether an account exists for the
 * address, so the form cannot be used to discover who has an account.
 */
export function ForgotPasswordView() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!EMAIL.test(email.trim())) {
      setError('Enter a valid email address, like name@example.com.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      // Unknown addresses are treated as sent, so the page does not reveal accounts.
      if (code === 'auth/user-not-found') setSent(true);
      else setFormError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h1 className="t-title">Reset your password</h1>
        <p className="t-secondary">Enter the email you signed up with. We will send you a link to choose a new password.</p>
      </div>
      {sent ? (
        <>
          <Notice>If an account uses {email.trim()}, a reset link is on its way. Check spam if it does not arrive in a few minutes.</Notice>
          <Link href="/sign-in" className="btn btn-primary btn-lg btn-full">
            Back to log in
          </Link>
        </>
      ) : (
        <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
          <Field
            label="Email address"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(undefined);
            }}
            error={error}
          />
          {formError ? <Alert>{formError}</Alert> : null}
          <BusyButton busy={busy} type="submit">
            Send reset link
          </BusyButton>
          <Link href="/sign-in" className="u-link" style={{ justifySelf: 'center', color: 'var(--brand)', fontWeight: 600 }}>
            Back to log in
          </Link>
        </form>
      )}
    </div>
  );
}
