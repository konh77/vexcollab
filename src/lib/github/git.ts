/*
 * VEXCollab - git operations against a GitHub repository.
 * Licensed under AGPL-3.0-only.
 */
import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** One checkout per room, under a directory fixed at startup. */
export const DATA_DIR = resolve(
  process.env.VEXCOLLAB_DATA_DIR ?? join(process.cwd(), '.vexcollab-data'),
);

const TEXT_EXTENSIONS = ['.py', '.md', '.txt', '.json', '.cfg', '.ini'];
const MAX_FILE_BYTES = 512 * 1024;

/** Room ids come from URLs, so they are never trusted as path segments. */
export function roomDir(roomId: string): string {
  const safe = roomId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!safe) throw new Error('Invalid room id');
  return join(DATA_DIR, 'rooms', safe);
}

/**
 * git asks for credentials through GIT_ASKPASS. Passing the token that way
 * keeps it out of argv (where `ps` would show it) and out of the remote URL
 * (where it would be written into .git/config).
 */
async function askpassScript(): Promise<string> {
  const path = join(DATA_DIR, 'askpass.sh');
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path, '#!/bin/sh\nprintf "%s" "$VEXCOLLAB_GIT_TOKEN"\n', { mode: 0o700 });
  await chmod(path, 0o700);
  return path;
}

async function git(args: string[], cwd: string, token?: string) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  if (token) {
    env.VEXCOLLAB_GIT_TOKEN = token;
    env.GIT_ASKPASS = await askpassScript();
  }
  const { stdout } = await run('git', args, { cwd, env, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

export interface RepoFile {
  path: string;
  contents: string;
}

async function collect(dir: string, base = dir): Promise<RepoFile[]> {
  const out: RepoFile[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collect(full, base)));
    } else if (TEXT_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      const contents = await readFile(full, 'utf8');
      if (contents.length <= MAX_FILE_BYTES) {
        out.push({ path: relative(base, full), contents });
      }
    }
  }
  return out;
}

/** Clones (or refreshes) a repo for a room and returns its text files. */
export async function openRepo(
  roomId: string,
  cloneUrl: string,
  token: string,
): Promise<{ files: RepoFile[]; branch: string }> {
  const dir = roomDir(roomId);
  await mkdir(join(dir, '..'), { recursive: true });

  if (existsSync(join(dir, '.git'))) {
    const current = await git(['remote', 'get-url', 'origin'], dir).catch(() => '');
    if (current !== cloneUrl) {
      // A different repo was opened here before; start clean rather than merge.
      await rm(dir, { recursive: true, force: true });
    }
  }

  if (!existsSync(join(dir, '.git'))) {
    await mkdir(dir, { recursive: true });
    await git(['clone', '--depth', '1', cloneUrl, '.'], dir, token);
  } else {
    await git(['fetch', '--depth', '1', 'origin'], dir, token);
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
    await git(['reset', '--hard', `origin/${branch}`], dir);
  }

  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir).catch(() => 'main');
  return { files: await collect(dir), branch };
}

/** Writes the room's files into the checkout, commits, and pushes. */
export async function saveRepo(
  roomId: string,
  files: RepoFile[],
  message: string,
  token: string,
  author: { name: string; email: string },
): Promise<{ committed: boolean; hash?: string; note?: string }> {
  const dir = roomDir(roomId);
  if (!existsSync(join(dir, '.git'))) throw new Error('Open a repository first');

  for (const file of files) {
    const target = resolve(dir, file.path);
    if (relative(dir, target).startsWith('..')) throw new Error(`Unsafe path: ${file.path}`);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, file.contents, 'utf8');
  }

  await git(['add', '-A'], dir);
  const staged = await git(['diff', '--cached', '--name-only'], dir);
  if (!staged) return { committed: false, note: 'Nothing changed' };

  await git(
    ['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`, 'commit', '-m', message],
    dir,
  );
  const hash = await git(['rev-parse', '--short', 'HEAD'], dir);
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
  await git(['push', 'origin', branch], dir, token);
  return { committed: true, hash };
}

export async function repoStatus(roomId: string) {
  const dir = roomDir(roomId);
  if (!existsSync(join(dir, '.git'))) return { open: false as const };
  const [remote, branch] = await Promise.all([
    git(['remote', 'get-url', 'origin'], dir).catch(() => ''),
    git(['rev-parse', '--abbrev-ref', 'HEAD'], dir).catch(() => 'main'),
  ]);
  return { open: true as const, remote, branch };
}
