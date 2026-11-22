import { readdir, readFile } from 'node:fs/promises';

// Firebase web config values identify the project; they are not secrets (access is
// enforced by the API verifying ID tokens and by Firebase Auth settings).
const allowed = new Set([
  'NEXT_PUBLIC_API_BASE_URL',
  // Canonical public origin for metadata, sitemap and structured data; a public URL.
  'NEXT_PUBLIC_SITE_URL',
  // Firebase web config for the website's sign-in (same project as the app).
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  // Google OAuth client IDs are public identifiers, like the Firebase web config.
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
]);
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.next', '.expo', 'dist', 'android', 'ios', '.turbo'].includes(entry.name))
      continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await inspect(path);
      continue;
    }
    if (!/\.(?:tsx?|mjs|json)$/.test(entry.name) && entry.name !== '.env.example') continue;
    const text = await readFile(path, 'utf8');
    for (const [name] of text.matchAll(/(?:NEXT|EXPO)_PUBLIC_[A-Z0-9_]+/g)) {
      if (!allowed.has(name))
        throw new Error(`Unreviewed public environment variable ${name} in ${path}`);
    }
  }
}
await inspect('apps/web');
await inspect('apps/mobile');
console.log('Client public environment allowlist passed (not a general secret scanner).');
