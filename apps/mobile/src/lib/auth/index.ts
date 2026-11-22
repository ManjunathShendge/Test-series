import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';
import { signOutOfGoogle } from './google';
import { toUser, type AuthUser } from './user';

export { authErrorMessage } from './errors';
export { googleStatus, signInWithGoogle } from './google';
export type { GoogleSignInStatus } from './google-status';
export type { AuthUser } from './user';

/**
 * Sign-in adapter (DECISIONS D01, A1): verified email everywhere; Google in development
 * and store builds (not Expo Go). Sign in with Apple is deferred. Screens call these
 * functions, never Firebase or the Google module directly.
 */

export function currentUser(): AuthUser | null {
  const user = firebaseAuth().currentUser;
  return user ? toUser(user) : null;
}

export function onAuthChange(listener: (user: AuthUser | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth(), (user) => listener(user ? toUser(user) : null));
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<AuthUser> {
  const { user } = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  await updateProfile(user, { displayName: name.trim() });
  await sendEmailVerification(user);
  return toUser(user);
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  const { user } = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  return toUser(user);
}

export async function resendVerificationEmail(): Promise<void> {
  const user = firebaseAuth().currentUser;
  if (user && !user.emailVerified) await sendEmailVerification(user);
}

/**
 * Re-reads the account after the student taps the link in their inbox. The ID token is
 * refreshed too, because the API reads `email_verified` from the token, not the client.
 */
export async function refreshVerification(): Promise<boolean> {
  const user = firebaseAuth().currentUser;
  if (!user) return false;
  await reload(user);
  if (user.emailVerified) await user.getIdToken(true);
  return user.emailVerified;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth(), email.trim());
}

/** A fresh-enough ID token for the API, or null when signed out. */
export async function idToken(): Promise<string | null> {
  return (await firebaseAuth().currentUser?.getIdToken()) ?? null;
}

export async function signOutOfFirebase(): Promise<void> {
  await signOutOfGoogle();
  await signOut(firebaseAuth());
}
