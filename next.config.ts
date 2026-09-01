import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Copilot language server is spawned as a subprocess, never imported.
  // Without this the bundler tries to trace its internals and fails.
  serverExternalPackages: ['@github/copilot-language-server'],
};

export default nextConfig;
