#!/usr/bin/env node
/*
 * VEXCollab launcher.
 * Licensed under AGPL-3.0-only.
 *
 * Builds on first run, then starts the server. This is what makes
 *   npx github:ponpon77/vexcollab
 * a single working command on a machine that has only Node installed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  vexcollab - collaborative VEX V5 Python editor

    npx github:ponpon77/vexcollab                    start on port 3000
    npx github:ponpon77/vexcollab --port 4000        use another port
    npx github:ponpon77/vexcollab --password pit22   require a password

  Teammates on the same Wi-Fi open the http://<your-ip>:<port> line printed
  at startup. The brain can only be used from the computer with the cable.
`);
  process.exit(0);
}

const env = { ...process.env, NODE_ENV: 'production' };
const port = flag('--port');
const password = flag('--password');
if (port) env.PORT = port;
if (password) env.VEXCOLLAB_PASSWORD = password;
if (process.env.VEXCOLLAB_PASSWORD) env.VEXCOLLAB_PASSWORD = process.env.VEXCOLLAB_PASSWORD;

// A git install has no build output; produce one before the first start.
if (!existsSync(join(root, '.next', 'BUILD_ID'))) {
  console.log('\n  First run - building VEXCollab. This takes a minute.\n');
  // Must be the Next that was installed alongside us. `npx next build` would
  // resolve a *different* next from the registry when we are ourselves running
  // under npx, which fails with a confusing "Next.js version: 0.0.0" panic.
  const require = createRequire(import.meta.url);
  const nextBin = join(dirname(require.resolve('next/package.json')), 'dist', 'bin', 'next');
  const build = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  if (build.status !== 0) {
    console.error('\n  Build failed. Please report this with the output above.\n');
    process.exit(build.status ?? 1);
  }
}

const server = spawnSync(process.execPath, [join(root, 'server.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env,
});
process.exit(server.status ?? 0);
