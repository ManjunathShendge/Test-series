import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Shared workspace packages ship TypeScript sources compiled by their own
  // build; transpiling here keeps a single engine implementation across clients.
  transpilePackages: ['@exam-prep/contracts', '@exam-prep/engine'],
  poweredByHeader: false,
};

export default nextConfig;
