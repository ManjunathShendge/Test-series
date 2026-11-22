export type GoogleSignInStatus = 'ready' | 'needs-dev-build' | 'not-configured';

export interface GoogleSignInEnv {
  /** Running inside Expo Go, which cannot load the native Google Sign-In module. */
  isExpoGo: boolean;
  platform: string;
  webClientId: string;
  iosClientId: string;
}

/**
 * Whether the Google button can work here. The web client ID is what makes Google return
 * an ID token Firebase accepts; iOS also needs its own client ID (no GoogleService-Info.plist,
 * because Firebase runs as the JS SDK, not natively).
 */
export function googleSignInStatus(env: GoogleSignInEnv): GoogleSignInStatus {
  if (env.isExpoGo) return 'needs-dev-build';
  if (!env.webClientId) return 'not-configured';
  if (env.platform === 'ios' && !env.iosClientId) return 'not-configured';
  return 'ready';
}
