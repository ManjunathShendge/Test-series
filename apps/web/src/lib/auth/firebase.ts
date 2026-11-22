'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from 'firebase/auth';
import { firebaseConfig } from './config';

let instance: Auth | undefined;

/**
 * The Firebase Auth client for the browser. The session persists in local storage, so a
 * student stays signed in across visits. Only src/lib/auth imports Firebase.
 */
export function firebaseAuth(): Auth {
  if (instance) return instance;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  instance = getAuth(app);
  void setPersistence(instance, browserLocalPersistence);
  return instance;
}
