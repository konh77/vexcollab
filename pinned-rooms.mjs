/*
 * VEXCollab - pinned rooms.
 * Copyright (C) 2026 VEXCOLLAB contributors
 * Licensed under AGPL-3.0-only. See LICENSE.
 *
 * An ordinary room is memory-only and is gone once its last person leaves. A
 * pinned room is the opposite, for a team's own long-lived workspace:
 *
 *   - it never closes: not when everyone leaves, not when it is idle, and not
 *     when the server restarts (its state is snapshotted to disk);
 *   - it needs a passcode to enter, checked on the server;
 *   - it keeps itself committed to a Git repository, pushing on its own.
 *
 * Which rooms exist, their passcodes and their repositories come from a config
 * file on the machine running the server -- never from this repository. The
 * code here is generic; everything specific to one team lives next to the
 * secrets it needs.
 */
import { execFile } from 'node:child_process';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import * as Y from 'yjs';

const run = promisify(execFile);
const deriveKey = promisify(scrypt);

/** Origin tag for document changes this module makes, so they can be relayed. */
export const PINNED_ORIGIN = 'vexcollab-pinned';

const FILES_KEY = 'files';

// What may be pulled from a repository into a room. The room is a source-file
// editor, not a file host: binaries are left alone in the repository and never
// shown, edited or deleted from here.
const MAX_FILES = 500;
const MAX_FILE_BYTES = 256 * 1024;
const SKIP_DIRS = new Set(['.git', 'node_modules']);

// --- passcodes ---------------------------------------------------------------

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

/**
 * `scrypt$N$r$p$salt$hash`. Only this is ever stored, so the config file can be
 * read by an operator without it revealing the passcode, and a leaked copy
 * cannot be replayed -- it has to be ground against, slowly.
 */
export async function hashPasscode(passcode) {
  const salt = randomBytes(16);
  const hash = await deriveKey(passcode, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPasscode(stored, attempt) {
  if (typeof stored !== 'string' || typeof attempt !== 'string' || attempt.length > 256) return false;
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, 'base64');
    const actual = await deriveKey(attempt, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// --- configuration -----------------------------------------------------------

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Reads the pinned-room config. A missing file is normal (most installs have no
 * pinned rooms) and yields none; a malformed entry is skipped with a message
 * rather than taking the whole server down.
 */
export function loadPinnedConfig(file, log = console.log) {
  if (!file || !existsSync(file)) return [];

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    log(`  Pinned rooms: could not read ${file}: ${error.message}`);
    return [];
  }

  const rooms = [];
  for (const entry of parsed?.rooms ?? []) {
    const id = String(entry?.id ?? '').toLowerCase();
    if (!ID.test(id)) {
      log(`  Pinned rooms: skipped an entry with an invalid id (${JSON.stringify(entry?.id)}).`);
      continue;
    }
    if (typeof entry.passcodeHash !== 'string' || !entry.passcodeHash.startsWith('scrypt$')) {
      log(`  Pinned room "${id}": skipped, it needs a passcodeHash. Make one with scripts/hash-passcode.mjs.`);
      continue;
    }
    if (entry.repo != null && !REPO.test(String(entry.repo)) && !entry.remote) {
      log(`  Pinned room "${id}": skipped, "repo" must look like owner/name.`);
      continue;
    }

    let token = null;
    try {
      if (entry.tokenFile) token = readFileSync(entry.tokenFile, 'utf8').trim() || null;
      else if (entry.token) token = String(entry.token).trim() || null;
    } catch (error) {
      log(`  Pinned room "${id}": cannot read its token file (${error.code ?? error.message}). Pushing is off.`);
    }

    rooms.push({
      id,
      passcodeHash: entry.passcodeHash,
      repo: entry.repo ? String(entry.repo) : null,
      // An explicit remote wins; it exists so the Git logic can be exercised
      // against a local repository without touching the network.
      remote: entry.remote ? String(entry.remote) : null,
      branch: String(entry.branch ?? 'main'),
      token,
      author: {
        name: String(entry.author?.name ?? 'VEXCollab'),
        email: String(entry.author?.email ?? 'vexcollab@localhost'),
      },
      debounceMs: Math.max(1, Number(entry.debounceSeconds ?? 20)) * 1000,
      maxDelayMs: Math.max(1, Number(entry.maxDelaySeconds ?? 120)) * 1000,
      pollMs: Math.max(5, Number(entry.pollSeconds ?? 300)) * 1000,
    });
  }
  return rooms;
}

// --- files <-> room ----------------------------------------------------------

/** A path that cannot leave the working tree. Null if it is not acceptable. */
export function safeRelative(path) {
  if (typeof path !== 'string' || !path || path.length > 200) return null;
  if (path.includes('\\') || path.includes('\0')) return null;
  const parts = path.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..' || SKIP_DIRS.has(part))) {
    return null;
  }
  return parts.join('/');
}

/**
 * Whether a value in the files map is a document text. Duck-typed on purpose:
 * `instanceof` fails when two copies of Yjs are loaded, which Yjs itself warns
 * about, and a file would then silently vanish from the room.
 */
const isText = (value) =>
  Boolean(value) &&
  typeof value.toString === 'function' &&
  typeof value.insert === 'function' &&
  typeof value.delete === 'function';

export function readRoomFiles(doc) {
  const files = new Map();
  doc.getMap(FILES_KEY).forEach((text, path) => {
    if (isText(text)) files.set(path, text.toString());
  });
  return files;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

/** Every text file in a working tree the room is able to hold. */
async function readTree(root) {
  const found = new Map();
  let bytes = 0;

  async function walk(dir, prefix) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (found.size >= MAX_FILES) return;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Symlinks are never followed: one pointing outside the tree would let a
      // repository make the server read, or write, an arbitrary file.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(join(dir, entry.name), relative);
        continue;
      }
      if (!entry.isFile() || !safeRelative(relative)) continue;

      const buffer = await readFile(join(dir, entry.name));
      if (buffer.length > MAX_FILE_BYTES || buffer.includes(0)) continue;
      bytes += buffer.length;
      if (bytes > 2 * 1024 * 1024) return;
      try {
        found.set(relative, decoder.decode(buffer));
      } catch {
        // Not valid UTF-8: not a source file this editor can hold.
      }
    }
  }

  await walk(root, '');
  return found;
}

// --- the pinned room ---------------------------------------------------------

export class PinnedRoom {
  /**
   * @param {object} options
   * @param {ReturnType<typeof loadPinnedConfig>[number]} options.config
   * @param {string} options.dataDir where snapshots and the working tree live
   * @param {Y.Doc} options.doc the room's authoritative document
   * @param {(update: Uint8Array) => void} [options.onChange] a change made here
   * @param {(status: object) => void} [options.onStatus]
   * @param {(line: string) => void} [options.log]
   */
  constructor({ config, dataDir, doc, onChange, onStatus, log = console.log }) {
    this.config = config;
    this.doc = doc;
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.log = log;

    this.base = join(dataDir, 'pinned', config.id);
    this.repoDir = join(this.base, 'repo');
    this.snapshotFile = join(this.base, 'state.ystate');

    this.ready = false;
    this.state = 'starting';
    this.message = null;
    this.lastPushAt = null;
    this.lastSyncAt = null;

    this.dirty = false;
    this.dirtySince = null;
    this.lastEditAt = 0;
    this.lastCycleAt = 0;
    /** The cycle in flight, if any. Others wait their turn rather than overlap. */
    this.current = null;
    /**
     * Files both the room and the repository changed since they last agreed, and
     * so cannot be merged without guessing. They are left exactly as each side
     * has them -- never written over -- until the two match again.
     */
    this.held = new Set();
    this.stopped = false;
    this.timer = null;
    this.snapshotTimer = null;
  }

  get status() {
    return {
      state: this.state,
      message: this.message,
      lastPushAt: this.lastPushAt,
      lastSyncAt: this.lastSyncAt,
      pushing: Boolean(this.config.repo || this.config.remote),
      ready: this.ready,
    };
  }

  setState(state, message = null) {
    if (this.state === state && this.message === message) return;
    this.state = state;
    this.message = message;
    this.onStatus?.(this.status);
  }

  /** Brings the room up. Resolves once it is usable; keeps retrying if it cannot be. */
  async start() {
    await mkdir(this.base, { recursive: true, mode: 0o700 });

    let restored = false;
    if (existsSync(this.snapshotFile)) {
      try {
        Y.applyUpdate(this.doc, new Uint8Array(await readFile(this.snapshotFile)), PINNED_ORIGIN);
        restored = true;
      } catch (error) {
        this.log(`  Pinned room "${this.config.id}": snapshot unreadable (${error.message}); starting from the repository.`);
      }
    }

    this.doc.on('update', (update, origin) => {
      // Our own imports are not "someone editing" -- counting them would make
      // every pull schedule a push of what was just pulled.
      if (origin === PINNED_ORIGIN) {
        this.onChange?.(update);
      } else {
        this.markDirty();
      }
      this.scheduleSnapshot();
    });

    if (!this.hasRemote()) {
      this.ready = true;
      this.setState('local', 'Kept on this server only; no repository is connected.');
      this.beginTimer();
      return;
    }

    const attempt = async () => {
      if (this.stopped) return;
      try {
        await this.prepareRepo();
        if (!restored) await this.importFresh();
        this.ready = true;
        this.setState('idle');
        this.beginTimer();
        void this.cycle();
      } catch (error) {
        this.setState('error', this.scrub(error));
        this.log(`  Pinned room "${this.config.id}": ${this.scrub(error)}`);
        // With a snapshot the room is usable without Git; without one, opening
        // it empty would let people seed a starter project that the repository
        // then collides with. Stay closed and keep trying instead.
        if (restored) {
          this.ready = true;
          this.beginTimer();
        } else {
          setTimeout(attempt, 60_000).unref?.();
        }
      }
    };
    await attempt();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    await this.saveSnapshot().catch(() => {});
  }

  markDirty() {
    const now = Date.now();
    this.dirty = true;
    this.dirtySince ??= now;
    this.lastEditAt = now;
  }

  hasRemote() {
    return Boolean(this.config.remote || this.config.repo);
  }

  remoteUrl() {
    return this.config.remote ?? `https://github.com/${this.config.repo}.git`;
  }

  // --- persistence -----------------------------------------------------------

  scheduleSnapshot() {
    if (this.snapshotTimer || this.stopped) return;
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      void this.saveSnapshot().catch((error) =>
        this.log(`  Pinned room "${this.config.id}": could not save its state (${error.message}).`),
      );
    }, 2000);
    this.snapshotTimer.unref?.();
  }

  async saveSnapshot() {
    const temporary = `${this.snapshotFile}.${process.pid}.tmp`;
    await writeFile(temporary, Y.encodeStateAsUpdate(this.doc), { mode: 0o600 });
    await rename(temporary, this.snapshotFile);
  }

  // --- git -------------------------------------------------------------------

  /** Credentials travel in the environment of one child process, never in argv. */
  gitEnv() {
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: this.config.author.name,
      GIT_AUTHOR_EMAIL: this.config.author.email,
      GIT_COMMITTER_NAME: this.config.author.name,
      GIT_COMMITTER_EMAIL: this.config.author.email,
      // The service has no home directory worth reading a gitconfig from.
      HOME: this.base,
      GIT_CONFIG_NOSYSTEM: '1',
    };
    if (this.config.token && this.remoteUrl().startsWith('https://')) {
      const basic = Buffer.from(`x-access-token:${this.config.token}`).toString('base64');
      env.GIT_CONFIG_COUNT = '1';
      env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
      env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${basic}`;
    }
    return env;
  }

  scrub(error) {
    let text = String(error?.stderr || error?.message || error);
    for (const secret of [this.config.token]) {
      if (secret) text = text.split(secret).join('***');
    }
    text = text.replace(/Authorization: Basic [A-Za-z0-9+/=]+/g, 'Authorization: ***');
    return text.trim().split('\n').slice(-3).join(' ').slice(0, 300);
  }

  async git(args, { allowFailure = false } = {}) {
    try {
      const { stdout } = await run('git', args, {
        cwd: this.repoDir,
        env: this.gitEnv(),
        timeout: 90_000,
        maxBuffer: 16 * 1024 * 1024,
      });
      return { ok: true, stdout: stdout.trim() };
    } catch (error) {
      if (allowFailure) return { ok: false, stdout: '', error };
      throw new Error(this.scrub(error));
    }
  }

  async prepareRepo() {
    if (!existsSync(join(this.repoDir, '.git'))) {
      await rm(this.repoDir, { recursive: true, force: true });
      await mkdir(dirname(this.repoDir), { recursive: true, mode: 0o700 });
      try {
        await run('git', ['clone', '--no-tags', this.remoteUrl(), this.repoDir], {
          env: this.gitEnv(),
          timeout: 180_000,
          maxBuffer: 16 * 1024 * 1024,
        });
      } catch (error) {
        throw new Error(`Could not clone the repository: ${this.scrub(error)}`);
      }
    }

    await this.git(['config', 'core.autocrlf', 'false']);
    await this.git(['config', 'advice.detachedHead', 'false']);

    const branch = this.config.branch;
    await this.git(['fetch', '--prune', 'origin'], { allowFailure: true });
    if ((await this.git(['rev-parse', '--verify', '-q', `origin/${branch}`], { allowFailure: true })).ok) {
      await this.git(['checkout', '-B', branch, `origin/${branch}`]);
    } else {
      // A repository with no such branch yet: point an unborn HEAD at it and
      // let the first push create it.
      await this.git(['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
    }
  }

  /** First start with no snapshot: the repository is the source of truth. */
  async importFresh() {
    const tree = await readTree(this.repoDir);
    const files = this.doc.getMap(FILES_KEY);
    this.doc.transact(() => {
      for (const [path, contents] of tree) {
        const text = new Y.Text();
        text.insert(0, contents);
        files.set(path, text);
      }
    }, PINNED_ORIGIN);
  }

  /**
   * One round trip with the repository.
   *
   * The room is the working copy and Git is the history behind it: the room is
   * written into the tree and committed, the remote is fetched, anything new on
   * it is rebased under that commit and carried back into the room, and the
   * result is pushed. It never force-pushes, and a rebase that conflicts is
   * aborted and reported rather than resolved by guessing -- both sides survive
   * untouched and a person decides.
   */
  async cycle() {
    if (!this.ready || this.stopped || !this.hasRemote()) return;
    // One at a time: two would fight over the working tree. A caller that
    // arrives mid-cycle waits for it and then gets a full pass of its own, so
    // whatever it changed just before calling is included.
    while (this.current) await this.current.catch(() => {});
    this.current = this.runCycle().finally(() => {
      this.current = null;
    });
    return this.current;
  }

  async runCycle() {
    this.dirty = false;
    this.dirtySince = null;
    this.lastCycleAt = Date.now();
    this.setState('syncing');

    try {
      const snapshot = readRoomFiles(this.doc);
      await this.releaseResolved(snapshot);
      await this.writeTree(snapshot);

      await this.git(['add', '-A']);
      const changes = await this.git(['status', '--porcelain']);
      if (changes.stdout) {
        await this.git(['commit', '-q', '-m', 'VEXCollab autosave']);
      }

      const branch = this.config.branch;
      const fetched = await this.git(['fetch', '--prune', 'origin'], { allowFailure: true });
      if (!fetched.ok) throw new Error(`Could not reach the repository: ${this.scrub(fetched.error)}`);

      const remoteRef = `origin/${branch}`;
      const remoteExists = (
        await this.git(['rev-parse', '--verify', '-q', remoteRef], { allowFailure: true })
      ).ok;
      const hasHead = (await this.git(['rev-parse', '--verify', '-q', 'HEAD'], { allowFailure: true })).ok;

      if (remoteExists && hasHead) {
        const behind = Number((await this.git(['rev-list', '--count', `HEAD..${remoteRef}`])).stdout);
        if (behind > 0) {
          const ahead = Number((await this.git(['rev-list', '--count', `${remoteRef}..HEAD`])).stdout);
          const merged = ahead > 0
            ? await this.git(['rebase', remoteRef], { allowFailure: true })
            : await this.git(['merge', '--ff-only', remoteRef], { allowFailure: true });
          if (!merged.ok) {
            await this.git(['rebase', '--abort'], { allowFailure: true });
            this.setState(
              'conflict',
              'The repository and this room both changed the same lines. Nothing was overwritten. Resolve it in the repository, or copy your changes aside and re-save.',
            );
            return;
          }
          await this.importChanges(snapshot);
        }
      } else if (remoteExists && !hasHead) {
        await this.git(['checkout', '-B', branch, remoteRef]);
        await this.importChanges(snapshot);
      }

      if (hasHead || (await this.git(['rev-parse', '--verify', '-q', 'HEAD'], { allowFailure: true })).ok) {
        const ahead = remoteExists
          ? Number((await this.git(['rev-list', '--count', `${remoteRef}..HEAD`])).stdout)
          : 1;
        if (ahead > 0) {
          const pushed = await this.git(['push', 'origin', `HEAD:refs/heads/${branch}`], { allowFailure: true });
          if (!pushed.ok) throw new Error(`Could not push: ${this.scrub(pushed.error)}`);
          this.lastPushAt = Date.now();
        }
      }

      this.lastSyncAt = Date.now();
      if (this.held.size > 0) {
        const names = [...this.held].slice(0, 3).join(', ');
        const more = this.held.size > 3 ? ` and ${this.held.size - 3} more` : '';
        this.setState(
          'conflict',
          `${names}${more} changed in both the room and the repository. Neither was overwritten. Make them match to continue saving it.`,
        );
      } else {
        this.setState('idle');
      }
    } catch (error) {
      this.setState('error', this.scrub(error));
      this.log(`  Pinned room "${this.config.id}": ${this.scrub(error)}`);
    }
  }

  /** A held file is released once the room and the repository agree about it again. */
  async releaseResolved(snapshot) {
    if (this.held.size === 0) return;
    const tree = await readTree(this.repoDir);
    for (const path of [...this.held]) {
      if ((snapshot.get(path) ?? null) === (tree.get(path) ?? null)) this.held.delete(path);
    }
  }

  /** Makes the working tree match the room, for the files the room can hold. */
  async writeTree(snapshot) {
    const root = resolve(this.repoDir);

    for (const [path, contents] of snapshot) {
      if (this.held.has(path)) continue;
      const relative = safeRelative(path);
      if (!relative) {
        this.log(`  Pinned room "${this.config.id}": ignored a file with an unusable name (${JSON.stringify(path)}).`);
        continue;
      }
      const target = resolve(root, relative);
      if (!target.startsWith(root + sep)) continue;

      const existing = await lstat(target).catch(() => null);
      if (existing?.isSymbolicLink()) continue;
      if (existing?.isFile() && (await readFile(target, 'utf8').catch(() => null)) === contents) continue;

      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }

    // A file the room can hold but no longer has was deleted in the room. A
    // file it could never hold -- a binary, a very large file -- is not the
    // room's to remove.
    for (const path of await readTree(root).then((tree) => [...tree.keys()])) {
      if (!snapshot.has(path) && !this.held.has(path)) await rm(resolve(root, path), { force: true });
    }
  }

  /**
   * Carries what changed in the repository into the room. Only files nobody has
   * touched in the room since the snapshot are replaced; one that has been
   * edited meanwhile is left for the next cycle rather than clobbered.
   */
  async importChanges(snapshot) {
    const tree = await readTree(this.repoDir);
    const files = this.doc.getMap(FILES_KEY);

    this.doc.transact(() => {
      for (const [path, contents] of tree) {
        const current = files.get(path);
        if (!snapshot.has(path)) {
          if (!current) {
            const text = new Y.Text();
            text.insert(0, contents);
            files.set(path, text);
          } else if (!isText(current) || current.toString() !== contents) {
            this.held.add(path); // made in the room meanwhile, and differently
          }
        } else if (snapshot.get(path) !== contents) {
          if (isText(current) && current.toString() === snapshot.get(path)) {
            current.delete(0, current.length);
            current.insert(0, contents);
          } else {
            this.held.add(path); // edited in the room since the snapshot
          }
        }
      }
      for (const [path, before] of snapshot) {
        if (tree.has(path)) continue;
        const current = files.get(path);
        if (isText(current) && current.toString() === before) files.delete(path);
        else if (current) this.held.add(path); // edited in the room, deleted in the repository
      }
    }, PINNED_ORIGIN);
  }

  beginTimer() {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => {
      if (!this.ready || this.current || !this.hasRemote()) return;
      const now = Date.now();
      const quiet = now - this.lastEditAt >= this.config.debounceMs;
      const overdue = this.dirtySince != null && now - this.dirtySince >= this.config.maxDelayMs;
      const polling = now - this.lastCycleAt >= this.config.pollMs;
      if ((this.dirty && (quiet || overdue)) || polling) void this.cycle();
    }, Math.min(10_000, this.config.debounceMs));
    this.timer.unref?.();
  }
}
