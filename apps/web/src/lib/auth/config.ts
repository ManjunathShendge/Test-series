/**
 * Public Firebase web config. Literal `process.env.NEXT_PUBLIC_*` reads so Next inlines them
 * into the browser bundle. They identify the project and are not secrets (API_CONTRACTS:
 * the API verifies every ID token itself).
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
};

export const isAuthConfigured = () => Object.values(firebaseConfig).every(Boolean);

/** The API as the browser reaches it. */
export const browserApiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/v1').replace(/\/$/, '');
