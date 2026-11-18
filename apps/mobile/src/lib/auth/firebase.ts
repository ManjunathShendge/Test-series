import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import Storage from 'expo-sqlite/kv-store';
import { config } from '@/lib/config';

let instance: Auth | undefined;

/**
 * The Firebase Auth client (JS SDK, which runs in Expo Go and development builds). The
 * signed-in session persists in the app's SQLite key-value store, so students stay signed
 * in across restarts. Only this adapter imports Firebase (docs/MOBILE.md).
 */
export function firebaseAuth(): Auth {
  if (instance) return instance;
  const app = getApps().length ? getApp() : initializeApp(config.firebase);
  try {
    instance = initializeAuth(app, { persistence: getReactNativePersistence(Storage) });
  } catch {
    // Fast refresh re-runs modules; Auth may already be initialised for this app.
    instance = getAuth(app);
  }
  return instance;
}
