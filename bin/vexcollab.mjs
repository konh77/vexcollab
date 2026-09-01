#!/usr/bin/env node
/*
 * VEXCollab launcher.
 * Licensed under AGPL-3.0-only.
 *
 * Makes `npx github:ponpon77/vexcollab` a single working command.
 *
 * The wrinkle: npm installs us into node_modules/vexcollab, and Next refuses to
 * compile an app whose source sits inside node_modules — Turbopack skips those
 * paths, so the build dies with an opaque "Expected process result to be a
 * module". So on first run we copy ourselves out to ~/.vexcollab/app, install
 * there, build, and run from there. Subsequent runs reuse it.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

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

  Teammates on the same Wi-Fi open the http://<your-ip>:<port> line printed at
  startup. The brain can only be used from the computer with the cable.
`);
  process.exit(0);
}

const env = { ...process.env, NODE_ENV: 'production' };
const port = flag('--port');
const password = flag('--password');
if (port) env.PORT = port;
if (password) env.VEXCOLLAB_PASSWORD = password;

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit', env: { ...env } });
  if (result.status !== 0) {
    console.error(`\n  Step failed: ${command} ${commandArgs.join(' ')}\n`);
    process.exit(result.status ?? 1);
  }
}

/** npm itself, however we were invoked. */
const npm = process.env.npm_execpath
  ? { cmd: process.execPath, pre: [process.env.npm_execpath] }
  : { cmd: 'npm', pre: [] };

let appDir = pkgRoot;

if (pkgRoot.includes(`${sep}node_modules${sep}`)) {
  appDir = join(homedir(), '.vexcollab', 'app');

  const manifest = readFileSync(join(pkgRoot, 'package.json'), 'utf8');
  const stamp = createHash('sha256').update(manifest).digest('hex').slice(0, 16);
  const stampFile = join(appDir, '.vexcollab-stamp');
  const upToDate =
    existsSync(stampFile) &&
    readFileSync(stampFile, 'utf8').trim() === stamp &&
    existsSync(join(appDir, 'node_modules'));

  if (!upToDate) {
    console.log(`\n  First run - setting up in ${appDir}\n  This takes a couple of minutes, once.\n`);
    mkdirSync(appDir, { recursive: true });
    cpSync(pkgRoot, appDir, {
      recursive: true,
      // Match on the path *relative* to the package: pkgRoot itself lives under
      // node_modules, so testing the absolute path rejects everything.
      filter: (src) => {
        const rel = src.slice(pkgRoot.length);
        return !rel.includes(`${sep}node_modules`) && !rel.includes(`${sep}.next`);
      },
    });
    if (!existsSync(join(appDir, 'package.json'))) {
      console.error(`\n  Copy to ${appDir} produced no package.json - cannot continue.\n`);
      process.exit(1);
    }
    run(npm.cmd, [...npm.pre, 'install', '--omit=dev', '--no-audit', '--no-fund'], appDir);
    writeFileSync(stampFile, stamp);
  }
}

if (!existsSync(join(appDir, '.next', 'BUILD_ID'))) {
  console.log('\n  Building VEXCollab...\n');
  run(npm.cmd, [...npm.pre, 'exec', '--', 'next', 'build'], appDir);
}

const server = spawnSync(process.execPath, [join(appDir, 'server.mjs')], {
  cwd: appDir,
  stdio: 'inherit',
  env,
});
process.exit(server.status ?? 0);
