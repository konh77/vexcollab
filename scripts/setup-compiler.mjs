/* VEXCollab - build the pinned MIT MicroPython compiler. AGPL-3.0-only. */
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const revision = 'b0932fcf2e2f9a81abf7737ed4b2573bd9ad4a49'; // MicroPython v1.13
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), 'vexcollab-toolchain-'));
const run = (command, args, cwd = temporary) => execFileSync(command, args,
  { cwd, stdio: 'inherit', timeout: 180_000 });
try {
  run('git', ['init', '--quiet']);
  run('git', ['fetch', '--depth', '1', 'https://github.com/micropython/micropython.git', revision]);
  run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
  // Modern compilers add warnings to this older release; keep those warnings
  // visible without treating them as build failures.
  const flags = [`CFLAGS_EXTRA=-Wno-error${process.platform === 'darwin' ? ' -D__unix__' : ''}`];
  // v1.13 predates Apple Silicon; enable its POSIX file writer on modern macOS.
  run('make', ['-C', 'mpy-cross', '-j2', ...flags]);
  const destination = join(root, '.vexcollab-tools');
  await mkdir(destination, { recursive: true });
  await copyFile(join(temporary, 'mpy-cross', 'mpy-cross'), join(destination, 'mpy-cross'));
  await chmod(join(destination, 'mpy-cross'), 0o755);
  await copyFile(join(temporary, 'LICENSE'), join(destination, 'MICROPYTHON-LICENSE'));
  console.log('MicroPython 1.13 compiler installed. Compile code in the Brain panel.');
} finally { await rm(temporary, { recursive: true, force: true }); }
