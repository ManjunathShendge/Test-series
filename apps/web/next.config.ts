import type { NextConfig } from 'next';

// Applied to every page. The CSP covers framing, plugins, base and form targets only: script and
// connect sources (Firebase, Razorpay, PostHog) are left open so sign-in and checkout keep working.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  // Browsers ignore HSTS over plain http, so this is harmless locally.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env['STANDALONE_BUILD'] === 'true' ? { output: 'standalone' as const } : {}),
  // Shared workspace packages ship TypeScript sources compiled by their own
  // build; transpiling here keeps a single engine implementation across clients.
  transpilePackages: ['@exam-prep/contracts', '@exam-prep/engine'],
  poweredByHeader: false,
  headers: async () => [{ source: '/:path*', headers: securityHeaders }],
  // The browser acceptance run (test/e2e/run.mjs) builds into its own folder with its own
  // tsconfig, so it never replaces a developer's build or edits the tracked tsconfig.
  ...(process.env['NEXT_DIST_DIR'] ? { distDir: process.env['NEXT_DIST_DIR'] } : {}),
  ...(process.env['NEXT_TSCONFIG'] ? { typescript: { tsconfigPath: process.env['NEXT_TSCONFIG'] } } : {}),
};

export default nextConfig;
