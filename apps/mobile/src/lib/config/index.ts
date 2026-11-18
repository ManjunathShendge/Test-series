/**
 * Public build-time configuration. Expo inlines EXPO_PUBLIC_* only when read as literal
 * `process.env.<name>` expressions, so each is spelled out. These values are not
 * secrets (the Firebase web config ships in every client); privileged keys never live here.
 */
export const config = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  },
};

/** Names of required variables that are empty, for the setup screen. */
export function missingConfig(): string[] {
  const required: [string, string][] = [
    ['EXPO_PUBLIC_API_BASE_URL', config.apiBaseUrl],
    ['EXPO_PUBLIC_FIREBASE_API_KEY', config.firebase.apiKey],
    ['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', config.firebase.authDomain],
    ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', config.firebase.projectId],
    ['EXPO_PUBLIC_FIREBASE_APP_ID', config.firebase.appId],
  ];
  return required.filter(([, value]) => !value).map(([name]) => name);
}
