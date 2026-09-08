import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Copilot language server is spawned as a subprocess, never imported.
  // Without this the bundler tries to trace its internals and fails.
  //
  // Yjs is here for a different reason. `server.mjs` imports it through Node's
  // own ESM loader, and Next bundles a second copy into the server build when
  // it renders the room's client components — so the module is evaluated twice
  // and Yjs warns that "Yjs was already imported. This breaks constructor
  // checks". Externalising it makes the server build require the same instance
  // Node already loaded. Today the two halves only ever exchange encoded
  // updates, so nothing was visibly broken; the moment any Y type crosses that
  // boundary, `instanceof` would start lying.
  serverExternalPackages: ['@github/copilot-language-server', 'yjs'],
};

export default nextConfig;
