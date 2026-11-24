'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Device, Profile } from '@exam-prep/contracts';
import { isAuthConfigured, onAuthChange, refreshVerification, signOutOfFirebase, type AuthUser } from '@/lib/auth';
import { ApiRequestError } from '@/lib/api/http';
import { createSession, deviceLimitDevices, revokeDevice } from '@/lib/api/identity';
import { setSignedInHint } from '@/lib/storage/device';

/**
 * Website session: Firebase says who the person is; the API session (POST /identity/session)
 * says whether they may use the product on this browser. Pages render from this state and
 * never decide access themselves; the API checks every request again.
 */
export type SessionState =
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'signed-out' }
  | { status: 'unverified'; user: AuthUser }
  | { status: 'device-limit'; user: AuthUser; devices: Device[] }
  | { status: 'error'; user: AuthUser | null; message: string; code: string }
  /** The API could not be reached; retried automatically with backoff. */
  | { status: 'offline'; user: AuthUser; attempt: number }
  | { status: 'ready'; user: AuthUser; profile: Profile };

interface AuthContextValue {
  state: SessionState;
  /** Re-runs the API session for the current Firebase user (after verifying email, for example). */
  retry: () => Promise<void>;
  /** Removes one of the account's devices, then signs this browser in. */
  removeDeviceAndContinue: (deviceId: string) => Promise<void>;
  setProfile: (profile: Profile) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const userRef = useRef<AuthUser | null>(null);
  // The uid whose API session is established, so hourly token refreshes do not re-register.
  const sessionUid = useRef<string | null>(null);

  const establish = useCallback(async (user: AuthUser) => {
    // Show progress at once; the form must never sit idle while the API session starts.
    setState((s) => (s.status === 'offline' ? s : { status: 'loading' }));
    if (!user.emailVerified) {
      setState({ status: 'unverified', user });
      return;
    }
    try {
      const session = await createSession();
      sessionUid.current = user.uid;
      setSignedInHint(true);
      setState({ status: 'ready', user, profile: session.profile });
    } catch (error) {
      sessionUid.current = null;
      const devices = deviceLimitDevices(error);
      if (devices) {
        setState({ status: 'device-limit', user, devices });
        return;
      }
      const code = error instanceof ApiRequestError ? error.code : 'UNKNOWN';
      if (code === 'NETWORK' || (error instanceof ApiRequestError && error.status >= 500)) {
        setState((s) => ({ status: 'offline', user, attempt: s.status === 'offline' ? s.attempt + 1 : 1 }));
        return;
      }
      const message = error instanceof ApiRequestError ? error.message : 'Something went wrong. Please try again.';
      // A second sign-in method for an existing email is never merged (invariant 10): sign
      // out so the student can use their original method.
      if (code === 'ACCOUNT_EXISTS_WITH_DIFFERENT_SIGN_IN' || code === 'ACCOUNT_BLOCKED') await signOutOfFirebase();
      setState({ status: 'error', user: code === 'ACCOUNT_BLOCKED' || code === 'ACCOUNT_EXISTS_WITH_DIFFERENT_SIGN_IN' ? null : user, message, code });
    }
  }, []);

  useEffect(() => {
    if (!isAuthConfigured()) {
      setState({ status: 'unconfigured' });
      return;
    }
    return onAuthChange((user) => {
      userRef.current = user;
      if (!user) {
        sessionUid.current = null;
        setSignedInHint(false);
        setState((s) => (s.status === 'error' && s.user === null ? s : { status: 'signed-out' }));
        return;
      }
      if (sessionUid.current === user.uid) return;
      void establish(user);
    });
  }, [establish]);

  // Server unreachable: try again on its own (2 s, 4 s, 8 s … up to 30 s) and when the tab regains focus.
  useEffect(() => {
    if (state.status !== 'offline') return;
    const user = state.user;
    const delay = Math.min(30000, 1000 * 2 ** state.attempt);
    const timer = setTimeout(() => void establish(user), delay);
    const onFocus = () => void establish(user);
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [state, establish]);

  // Waiting for email verification: notice the click in the inbox without any button press.
  useEffect(() => {
    if (state.status !== 'unverified') return;
    let stopped = false;
    const check = async () => {
      try {
        if (!stopped && (await refreshVerification()) && userRef.current) await establish({ ...userRef.current, emailVerified: true });
      } catch {
        // Offline or rate limited: the next tick tries again.
      }
    };
    const timer = setInterval(() => void check(), 4000);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [state.status, establish]);

  const retry = useCallback(async () => {
    const user = userRef.current;
    if (user) {
      setState({ status: 'loading' });
      await establish(user);
    }
  }, [establish]);

  const removeDeviceAndContinue = useCallback(
    async (deviceId: string) => {
      await revokeDevice(deviceId);
      await retry();
    },
    [retry],
  );

  const setProfile = useCallback((profile: Profile) => {
    setState((s) => (s.status === 'ready' ? { ...s, profile } : s));
  }, []);

  const signOut = useCallback(async () => {
    sessionUid.current = null;
    setSignedInHint(false);
    await signOutOfFirebase();
    setState({ status: 'signed-out' });
  }, []);

  const value = useMemo(() => ({ state, retry, removeDeviceAndContinue, setProfile, signOut }), [state, retry, removeDeviceAndContinue, setProfile, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** Only same-site paths are allowed as a post-sign-in destination (no open redirects). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

/**
 * Where a student goes when nothing else was requested: their first target exam, whose page
 * leads with a free test (PRD 6.1 step 3, until the home feed exists), or the exam list.
 */
export function homeFor(profile: Profile): string {
  const first = profile.targetExamIds[0];
  return first ? `/exams/${first}` : '/exams';
}

/** Staff areas do not need student onboarding (target exams, stage); the API authorizes each call. */
export function isStaffArea(path: string | null): boolean {
  return path === '/admin' || (path?.startsWith('/admin/') ?? false) || (path?.startsWith('/admin?') ?? false);
}

/** Examiner pages check the 18+ confirmation themselves and skip student onboarding. */
export function isExaminerArea(path: string | null): boolean {
  return path === '/examiner' || (path?.startsWith('/examiner/') ?? false) || (path?.startsWith('/examiner?') ?? false);
}

export function isStaff(profile: Profile): boolean {
  return profile.roles.includes('admin') || profile.roles.includes('qc_reviewer');
}
