/** Plain-language messages for Firebase Auth error codes; unknown codes get a generic line. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match. Check them or reset your password.';
    case 'auth/email-already-in-use':
      return 'An account already uses this email. Log in instead, or reset your password.';
    case 'auth/invalid-email':
      return 'Enter a valid email address, like name@example.com.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Choose a stronger password: at least 8 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support.';
    // Never merged on email alone (invariant 10); linking providers is not built yet.
    case 'auth/account-exists-with-different-credential':
      return 'This email already has an account with a password. Log in with your email and password instead.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was closed before it finished. Try again when you are ready.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'Google sign-in is not enabled for this web address yet. Use email for now.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled yet. Use another option.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
