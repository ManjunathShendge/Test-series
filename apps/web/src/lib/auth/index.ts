'use client';

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onIdTokenChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';

export { authErrorMessage } from './errors';
export { isAuthConfigured } from './config';

/**
 * Website sign-in adapter (DECISIONS D01, A1): verified email and Google. Pages call these
 * functions, never Firebase directly. The API decides who the user is and what they may do;
 * nothing here grants access by itself.
 */

export interface AuthUser {
  uid: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  provider: 'password' | 'google' | 'other';
}

export const MIN_PASSWORD = 8;

function toUser(user: User): AuthUser {
  const provider = user.providerData[0]?.providerId;
  return {
    uid: user.uid,
    email: user.email,
    name: user.displayName,
    emailVerified: user.emailVerified,
    provider: provider === 'password' ? 'password' : provider === 'google.com' ? 'google' : 'other',
  };
}

const continueUrl = (path: string) => ({ url: `${window.location.origin}${path}` });

export function onAuthChange(listener: (user: AuthUser | null) => void): () => void {
  return onIdTokenChanged(firebaseAuth(), (user) => listener(user ? toUser(user) : null));
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<AuthUser> {
  const { user } = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  await updateProfile(user, { displayName: name.trim() });
  await sendEmailVerification(user, continueUrl('/sign-in'));
  return toUser(user);
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  const { user } = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  return toUser(user);
}

function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/** Codes that mean the Google window never got going, so a full-page redirect is tried instead. */
const POPUP_UNAVAILABLE = new Set(['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported']);

/**
 * Google in a popup window; where the browser blocks popups it falls back to a full-page
 * redirect (the result arrives through onAuthChange when the page loads again). Returns null
 * when the person simply closed the Google window.
 */
export async function signInWithGoogle(): Promise<AuthUser | null> {
  try {
    const { user } = await signInWithPopup(firebaseAuth(), googleProvider());
    return toUser(user);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code ?? '';
    if (POPUP_UNAVAILABLE.has(code)) {
      await signInWithRedirect(firebaseAuth(), googleProvider());
      return null;
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') return null;
    throw error;
  }
}

/** Surfaces an error from a Google redirect sign-in, if one just happened. */
export async function completeGoogleRedirect(): Promise<void> {
  await getRedirectResult(firebaseAuth());
}

export async function resendVerificationEmail(): Promise<void> {
  const user = firebaseAuth().currentUser;
  if (user && !user.emailVerified) await sendEmailVerification(user, continueUrl('/sign-in'));
}

/**
 * Re-reads the account after the student clicks the link in their inbox. The ID token is
 * refreshed too, because the API reads `email_verified` from the token, not the browser.
 */
export async function refreshVerification(): Promise<boolean> {
  const user = firebaseAuth().currentUser;
  if (!user) return false;
  await reload(user);
  if (user.emailVerified) await user.getIdToken(true);
  return user.emailVerified;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth(), email.trim(), continueUrl('/sign-in'));
}

/** A fresh-enough ID token for the API, or null when signed out. Firebase refreshes it. */
export async function idToken(): Promise<string | null> {
  return (await firebaseAuth().currentUser?.getIdToken()) ?? null;
}

export async function signOutOfFirebase(): Promise<void> {
  await firebaseSignOut(firebaseAuth());
}
