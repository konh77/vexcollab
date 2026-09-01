/*
 * VEXCollab - Git for the room's files.
 * Licensed under AGPL-3.0-only.
 *
 * VEXCollab runs on your own machine, so it can shell out to the real `git`
 * with your real credentials (whatever your credential helper or SSH agent
 * already provides). Nothing here stores or asks for a token.
 *
 * The room itself stays in memory; this writes a snapshot of it to a working
 * directory and commits that. The directory is fixed at startup via
 * VEXCOLLAB_PROJECT_DIR so a request can never choose where to write.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

const run = promisify(execFile);

const PROJECT_DIR = resolve(
  process.env.VEXCOLLAB_PROJECT_DIR ?? join(process.cwd(), 'vex-project'),
);

const TEXT_EXTENSIONS = ['.py', '.md', '.txt', '.json', '.cfg', '.ini'];

async function git(args: string[]) {
  const { stdout } = await run('git', args, { cwd: PROJECT_DIR, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}

/** Rejects absolute paths, traversal, and anything outside the project dir. */
function safeTarget(path: string): string | null {
  if (!path || path.startsWith('/') || path.includes('\0')) return null;
  const target = resolve(PROJECT_DIR, path);
  const rel = relative(PROJECT_DIR, target);
  if (rel.startsWith('..') || resolve(PROJECT_DIR, rel) !== target) return null;
  return target;
}

async function collectFiles(dir: string, base = dir): Promise<{ path: string; contents: string }[]> {
  const out: { path: string; contents: string }[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectFiles(full, base)));
    } else if (TEXT_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      out.push({ path: relative(base, full), contents: await readFile(full, 'utf8') });
    }
  }
  return out;
}

async function status() {
  const isRepo = existsSync(join(PROJECT_DIR, '.git'));
  if (!isRepo) return { dir: PROJECT_DIR, isRepo: false };

  const [branch, dirty, remote] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'main'),
    git(['status', '--porcelain']).catch(() => ''),
    git(['remote', 'get-url', 'origin']).catch(() => ''),
  ]);

  return {
    dir: PROJECT_DIR,
    isRepo: true,
    branch,
    remote: remote || null,
    changed: dirty ? dirty.split('\n').map((l) => l.trim()) : [],
  };
}

export async function POST(request: Request) {
  let body: { action?: string; message?: string; files?: { path: string; contents: string }[]; remote?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 });
  }

  try {
    switch (body.action) {
      case 'status':
        return NextResponse.json(await status());

      case 'init': {
        await mkdir(PROJECT_DIR, { recursive: true });
        if (!existsSync(join(PROJECT_DIR, '.git'))) {
          await git(['init', '-b', 'main']);
        }
        if (body.remote) {
          await git(['remote', 'remove', 'origin']).catch(() => {});
          await git(['remote', 'add', 'origin', body.remote]);
        }
        return NextResponse.json(await status());
      }

      case 'commit': {
        await mkdir(PROJECT_DIR, { recursive: true });
        for (const file of body.files ?? []) {
          const target = safeTarget(file.path);
          if (!target) {
            return NextResponse.json({ error: `Unsafe path: ${file.path}` }, { status: 400 });
          }
          await mkdir(join(target, '..'), { recursive: true });
          await writeFile(target, file.contents, 'utf8');
        }
        await git(['add', '-A']);
        const staged = await git(['diff', '--cached', '--name-only']);
        if (!staged) {
          return NextResponse.json({ ...(await status()), committed: false, note: 'Nothing changed' });
        }
        await git(['commit', '-m', body.message?.trim() || 'Update from VEXCollab']);
        const hash = await git(['rev-parse', '--short', 'HEAD']);
        return NextResponse.json({ ...(await status()), committed: true, hash });
      }

      case 'push': {
        const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
        const out = await git(['push', '-u', 'origin', branch]);
        return NextResponse.json({ ...(await status()), output: out || 'Pushed' });
      }

      case 'pull': {
        const out = await git(['pull', '--ff-only']);
        return NextResponse.json({
          ...(await status()),
          output: out || 'Up to date',
          files: await collectFiles(PROJECT_DIR),
        });
      }

      case 'load':
        if (!existsSync(PROJECT_DIR)) return NextResponse.json({ files: [] });
        return NextResponse.json({ files: await collectFiles(PROJECT_DIR) });

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (error) {
    // git writes the useful part to stderr.
    const err = error as { stderr?: string; message?: string };
    return NextResponse.json(
      { error: (err.stderr || err.message || 'git failed').trim() },
      { status: 500 },
    );
  }
}
