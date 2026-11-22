/**
 * Plain-language messages for Firebase Auth and Google Sign-In error codes; unknown codes
 * get a generic line. Google's codes are the library's `statusCodes` string values.
 */
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
    // Never merged on email alone (invariant 10); linking Google to it is not built yet.
    case 'auth/account-exists-with-different-credential':
      return 'This email already has an account with a password. Sign in with your email and password instead.';
    case 'IN_PROGRESS':
      return 'Google sign-in is already open. Finish it there.';
    case 'PLAY_SERVICES_NOT_AVAILABLE':
      return 'Google Play services are missing or out of date on this phone. Update them and try again.';
    case 'google/unavailable':
      return 'Google sign-in is not available in this version of the app. Use email for now.';
    case 'google/no-id-token':
      return 'Google did not confirm your account. Please try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
