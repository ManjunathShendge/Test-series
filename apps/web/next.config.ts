import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env['STANDALONE_BUILD'] === 'true' ? { output: 'standalone' as const } : {}),
  // Shared workspace packages ship TypeScript sources compiled by their own
  // build; transpiling here keeps a single engine implementation across clients.
  transpilePackages: ['@exam-prep/contracts', '@exam-prep/engine'],
  poweredByHeader: false,
  // The browser acceptance run (test/e2e/run.mjs) builds into its own folder with its own
  // tsconfig, so it never replaces a developer's build or edits the tracked tsconfig.
  ...(process.env['NEXT_DIST_DIR'] ? { distDir: process.env['NEXT_DIST_DIR'] } : {}),
  ...(process.env['NEXT_TSCONFIG'] ? { typescript: { tsconfigPath: process.env['NEXT_TSCONFIG'] } } : {}),
};

export default nextConfig;
