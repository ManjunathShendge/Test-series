import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';

/**
 * Sign-in adapter (DECISIONS D01): verified email now; Google and Apple arrive with the
 * native development build. Screens call these functions, never Firebase directly.
 */

export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

const toUser = (user: User): AuthUser => ({ uid: user.uid, email: user.email, emailVerified: user.emailVerified });

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
  await signOut(firebaseAuth());
}

/** Plain-language messages for Firebase Auth error codes; unknown codes get a generic line. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match. Check them or reset your password.';
    case 'auth/email-already-in-use':
      return 'An account already uses this email. Sign in instead, or reset your password.';
    case 'auth/invalid-email':
      return 'Enter a valid email address, like name@example.com.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Choose a stronger password: at least 8 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
