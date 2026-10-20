/* VEXCollab - server-side MicroPython compilation. AGPL-3.0-only. */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isV5Bytecode } from './bytecode';

export const MAX_SOURCE_BYTES = 500_000;
let activeBuilds = 0;

export class CompileError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

export async function compilePython(source: string): Promise<Uint8Array> {
  if (!source.trim()) throw new CompileError('Add Python code before compiling.');
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    throw new CompileError('This program exceeds the 500 KB compile limit.', 413);
  }
  if (activeBuilds >= 2) throw new CompileError('The compiler is busy. Try again shortly.', 503);
  activeBuilds++;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), 'vexcollab-compile-'));
    await writeFile(join(directory, 'main.py'), source, { mode: 0o600 });
    const executable = process.env.VEXCOLLAB_MPY_CROSS ||
      join(process.cwd(), '.vexcollab-tools', 'mpy-cross');
    await new Promise<void>((resolve, reject) => {
      // No shell, imports, or user code execution: mpy-cross only emits bytecode.
      execFile(executable, ['-msmall-int-bits=31', '-s', 'main.py', '-o', 'program.mpy', 'main.py'],
        { cwd: directory, timeout: 10_000, maxBuffer: 64 * 1024 }, (error, stdout, stderr) => {
          if (!error) return resolve();
          if (error.code === 'ENOENT') return reject(new CompileError(
            'The Python compiler is not installed on this server. Run npm run setup:compiler on the server, then retry.', 503));
          if (error.killed) return reject(new CompileError('Compilation took too long. Simplify the program and retry.'));
          reject(new CompileError((stderr || stdout || 'Compilation failed.').trim().slice(0, 8000)));
        });
    });
    const bytes = await readFile(join(directory, 'program.mpy'));
    if (!isV5Bytecode(bytes)) throw new CompileError(
      'The compiler produced incompatible bytecode. Install the pinned MicroPython 1.13 compiler.', 503);
    return new Uint8Array(bytes);
  } finally {
    activeBuilds--;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
