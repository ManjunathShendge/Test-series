'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  authErrorMessage,
  completeGoogleRedirect,
  MIN_PASSWORD,
  refreshVerification,
  resendVerificationEmail,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/lib/auth';
import { ApiRequestError } from '@/lib/api/http';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import { homeFor, safeNext, useAuth } from './AuthProvider';
import { DeviceRows } from './DeviceRows';
import { Alert, BusyButton, Field, GoogleMark, Notice, Waiting } from './ui';
import styles from './auth.module.css';

type Mode = 'login' | 'signup';
type Busy = null | 'google' | 'email' | 'verify' | 'resend' | string;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Log in and sign up (DECISIONS D01, A1): Google or email with a verified address, each one click.
 * The 18+ confirmation (PRD 12) is asked once, in onboarding, and recorded by the server. After Firebase
 * signs the person in, AuthProvider registers this browser with the API; this view then shows
 * the verification, device-limit or error step, or continues to `next`.
 */
export function SignInView() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = safeNext(params.get('next'));
  const { state, retry, removeDeviceAndContinue, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'password', string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [cooldown, setCooldown] = useState(0);
  const alertRef = useRef<HTMLDivElement>(null);

  // Signed in and registered: continue, through onboarding the first time.
  useEffect(() => {
    if (state.status !== 'ready') return;
    if (state.profile.onboarded) router.replace(requested ?? homeFor(state.profile));
    else router.replace(`/onboarding${requested ? `?next=${encodeURIComponent(requested)}` : ''}`);
  }, [state, requested, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Firebase can take ~9 s to notice a closed Google window (Google's COOP blocks the check).
  // When the person is back on this page and no sign-in arrived, free the button at once;
  // a second click simply replaces the old popup request.
  useEffect(() => {
    if (busy !== 'google') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setBusy((b) => (b === 'google' ? null : b)), 1200);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [busy]);

  // A Google redirect sign-in (used when popups are blocked) reports failures here.
  useEffect(() => {
    completeGoogleRedirect().catch((e: unknown) => setFormError(authErrorMessage(e)));
  }, []);

  // Move focus to the error summary so keyboard and screen-reader users hear it.
  useEffect(() => {
    if (formError) alertRef.current?.querySelector<HTMLElement>('[role=alert]')?.focus();
  }, [formError]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setErrors({});
    setFormError(null);
    setNotice(null);
    const url = new URL(window.location.href);
    if (m === 'signup') url.searchParams.set('mode', 'signup');
    else url.searchParams.delete('mode');
    window.history.replaceState(null, '', url);
  };

  const google = async () => {
    setFormError(null);
    setNotice(null);
    setBusy('google');
    try {
      // null: the Google window was closed, or the page is moving to Google; nothing to report.
      await signInWithGoogle();
    } catch (e) {
      setFormError(authErrorMessage(e));
    } finally {
      setBusy((b) => (b === 'google' ? null : b));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    const found: typeof errors = {};
    if (mode === 'signup' && !name.trim()) found.name = 'Enter your name as you want it on your results.';
    if (!EMAIL.test(email.trim())) found.email = 'Enter a valid email address, like name@example.com.';
    if (mode === 'signup' && password.length < MIN_PASSWORD) found.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (mode === 'login' && !password) found.password = 'Enter your password.';
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError('Please fix the highlighted fields.');
      return;
    }
    setBusy('email');
    try {
      if (mode === 'signup') await signUpWithEmail(name, email, password);
      else await signInWithEmail(email, password);
    } catch (e) {
      setFormError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const checkVerified = async () => {
    setBusy('verify');
    setFormError(null);
    try {
      if (await refreshVerification()) await retry();
      else setFormError('Your email is not verified yet. Open the link we sent, then try again.');
    } catch (e) {
      setFormError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    setBusy('resend');
    setFormError(null);
    try {
      await resendVerificationEmail();
      setNotice('We sent a new link. It can take a minute to arrive; check spam too.');
      setCooldown(60);
    } catch (e) {
      setFormError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const removeDevice = async (id: string) => {
    setBusy(id);
    setFormError(null);
    try {
      await removeDeviceAndContinue(id);
    } catch (e) {
      setFormError(e instanceof ApiRequestError ? e.message : 'Could not remove that device. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const messages = (
    <div ref={alertRef} aria-live="polite">
      {formError ? <Alert>{formError}</Alert> : null}
      {notice ? <Notice>{notice}</Notice> : null}
    </div>
  );

  let panel: React.ReactNode;
  if (state.status === 'loading' || state.status === 'ready') {
    panel = <Waiting label={state.status === 'ready' ? 'Signed in. Taking you there…' : 'Signing you in…'} />;
  } else if (state.status === 'offline') {
    panel = (
      <>
        <div className={styles.panelHead}>
          <h1 className="t-title">Connecting to MakeMePrepare</h1>
          <p className="t-secondary">You are signed in, but we cannot reach our server right now. We keep trying automatically.</p>
        </div>
        <Waiting label="Reconnecting…" />
        <button type="button" className="btn btn-secondary btn-full" onClick={() => void retry()}>
          Try now
        </button>
        <button type="button" className={styles.textButton} onClick={() => void signOut()}>
          Sign out
        </button>
      </>
    );
  } else if (state.status === 'unconfigured') {
    panel = <Alert>Sign-in is not set up on this website yet. Please try again later.</Alert>;
  } else if (state.status === 'unverified') {
    panel = (
      <>
        <div className={styles.panelHead}>
          <h1 className="t-title">Check your inbox</h1>
          <p className="t-secondary">
            We sent a link to <strong>{state.user.email}</strong>. Click it and this page continues on its own.
          </p>
        </div>
        <Waiting label="Waiting for you to verify…" />
        <BusyButton busy={busy === 'verify'} className="btn btn-secondary btn-full" onClick={() => void checkVerified()}>
          I have verified, continue
        </BusyButton>
        <div className={styles.linkRow}>
          <button type="button" className={styles.textButton} disabled={cooldown > 0 || busy !== null} onClick={() => void resend()}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the email'}
          </button>
          {/* Disabled while sign-up is still saving the name and sending the email. */}
          <button type="button" className={styles.textButton} disabled={busy !== null} onClick={() => void signOut()}>
            Use a different account
          </button>
        </div>
        {messages}
      </>
    );
  } else if (state.status === 'device-limit') {
    panel = (
      <>
        <div className={styles.panelHead}>
          <h1 className="t-title">Two devices already in use</h1>
          <p className="t-secondary">
            Your account works on up to two devices. Remove one to sign in on this browser. It is signed out straight away.
          </p>
        </div>
        <DeviceRows devices={state.devices} busyId={busy} onRemove={(id) => void removeDevice(id)} />
        <button type="button" className={styles.textButton} onClick={() => void signOut()}>
          Cancel and sign out
        </button>
        {messages}
      </>
    );
  } else {
    const showError = state.status === 'error' ? state.message : null;
    panel = (
      <>
        <div className={styles.switch} role="group" aria-label="Choose log in or sign up">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>
            Log in
          </button>
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => switchMode('signup')}>
            Sign up
          </button>
        </div>
        <div className={styles.panelHead}>
          <h1 className="t-title">{mode === 'signup' ? 'Create your free account' : 'Welcome back'}</h1>
          <p className="t-secondary">
            {mode === 'signup' ? 'Your first mock test is free. No card needed.' : 'Log in to continue your practice.'}
          </p>
        </div>
        {showError ? <Alert>{showError}</Alert> : null}

        <BusyButton busy={busy === 'google'} className={`btn btn-secondary btn-lg btn-full ${styles.google}`} onClick={() => void google()} type="button">
          {busy === 'google' ? null : <GoogleMark />}
          Continue with Google
        </BusyButton>
        <div className={styles.divider}>or with email</div>

        <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
          {mode === 'signup' ? (
            <Field
              label="Your name"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors(({ name: _n, ...rest }) => rest);
              }}
              error={errors.name}
            />
          ) : null}
          <Field
            label="Email address"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors(({ email: _e, ...rest }) => rest);
            }}
            error={errors.email}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            revealable
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors(({ password: _p, ...rest }) => rest);
            }}
            helper={mode === 'signup' ? `At least ${MIN_PASSWORD} characters. We will email you a link to verify your address.` : undefined}
            error={errors.password}
          />
          {mode === 'login' ? (
            <div className={styles.linkRow}>
              <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim())}` : ''}`} className="u-link" style={{ color: 'var(--brand)', fontWeight: 600 }}>
                Forgot password?
              </Link>
            </div>
          ) : null}
          <BusyButton busy={busy === 'email'} type="submit">
            {mode === 'signup' ? 'Create account' : 'Log in'}
            {busy === 'email' ? null : <Glyph name="arrow" size={18} />}
          </BusyButton>
        </form>
        {messages}
        <p className={styles.legal}>
          By continuing you agree to our <Link href="/terms">Terms of use</Link> and <Link href="/privacy">Privacy policy</Link>.
        </p>
      </>
    );
  }

  return <div className={styles.panel}>{panel}</div>;
}
