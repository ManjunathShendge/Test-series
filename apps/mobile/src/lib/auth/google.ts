import Constants, { ExecutionEnvironment } from 'expo-constants';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { Platform } from 'react-native';
import { config } from '@/lib/config';
import { firebaseAuth } from './firebase';
import { googleSignInStatus, type GoogleSignInStatus } from './google-status';
import { toUser, type AuthUser } from './user';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let loaded: Promise<GoogleModule | null> | undefined;

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export function googleStatus(): GoogleSignInStatus {
  return googleSignInStatus({
    isExpoGo,
    platform: Platform.OS,
    webClientId: config.google.webClientId,
    iosClientId: config.google.iosClientId,
  });
}

/**
 * Loads and configures the native module once. It is imported lazily because evaluating it
 * in Expo Go throws (the native code is not there), and email sign-in must keep working.
 */
function google(): Promise<GoogleModule | null> {
  loaded ??= (async () => {
    if (googleStatus() !== 'ready') return null;
    try {
      const mod = await import('@react-native-google-signin/google-signin');
      mod.GoogleSignin.configure({
        webClientId: config.google.webClientId,
        ...(Platform.OS === 'ios' ? { iosClientId: config.google.iosClientId } : {}),
      });
      return mod;
    } catch {
      return null;
    }
  })();
  return loaded;
}

/**
 * Google account picker, then the Google ID token is exchanged for a Firebase session (the
 * documented React Native flow: native sign-in, Firebase `signInWithCredential`). Returns
 * null when the student closes the picker. The API then registers the device as for email.
 */
export async function signInWithGoogle(): Promise<AuthUser | null> {
  const mod = await google();
  if (!mod) throw Object.assign(new Error('Google sign-in unavailable'), { code: 'google/unavailable' });
  if (Platform.OS === 'android') await mod.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await mod.GoogleSignin.signIn();
  if (response.type !== 'success') return null;
  const token = response.data.idToken;
  if (!token) throw Object.assign(new Error('No Google ID token'), { code: 'google/no-id-token' });
  const { user } = await signInWithCredential(firebaseAuth(), GoogleAuthProvider.credential(token));
  return toUser(user);
}

/** Clears the cached Google account so the picker shows again after sign-out. Best effort. */
export async function signOutOfGoogle(): Promise<void> {
  const mod = await google();
  await mod?.GoogleSignin.signOut().catch(() => undefined);
}
