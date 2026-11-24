/*
 * VEXCollab - the edit timeline of a pinned room.
 * Licensed under AGPL-3.0-only. See LICENSE.
 *
 * Who changed which file, and when, newest first -- and, for most changes, how the
 * file looked just before, so a change can be taken back.
 *
 * Only pinned rooms have one. An ordinary room forgets everything the moment its last
 * person leaves, and that promise would not survive a log of what each person typed.
 * A pinned room already keeps its files and its chat; this is the same kind of memory.
 *
 * It watches the room's document rather than the people. Every change reaches the
 * document through a transaction, and the transaction says where it came from (a
 * person's connection, an AI agent, a Git sync), so one place sees all of them.
 */

import * as Y from 'yjs';
import { replaceMinimal } from './text-diff.mjs';

const FILES_KEY = 'files';

/** A burst of typing in one file by one person is one entry, not one per keystroke. */
const COALESCE_MS = 30_000;
const MAX_ENTRIES = 300;
/** A version of a file is kept only if it is no bigger than this... */
const MAX_VERSION_BYTES = 64 * 1024;
/** ...and the oldest are dropped when the versions together pass this. */
const MAX_TOTAL_BYTES = 6 * 1024 * 1024;

const UNKNOWN = { name: 'Someone', color: '#888888', senderId: 'unknown' };

/** @typedef {{ name: string, color: string, senderId: string }} Actor */
/**
 * @typedef {{
 *   id: number, at: number, who: Actor, kind: 'edit' | 'create' | 'delete', path: string,
 *   added: number, removed: number, restorable: boolean,
 * }} TimelineEntry
 */

/**
 * Who a transaction's origin says made it. An origin that carries an `actor` is a
 * person or an agent; anything else is something the server did on its own.
 */
export function defaultActor(origin) {
  const actor = origin && typeof origin === 'object' ? origin.actor : null;
  if (actor && typeof actor.name === 'string' && typeof actor.senderId === 'string') {
    return {
      name: actor.name.slice(0, 40),
      color: typeof actor.color === 'string' ? actor.color.slice(0, 9) : UNKNOWN.color,
      senderId: actor.senderId.slice(0, 40),
    };
  }
  return UNKNOWN;
}

const isText = (value) =>
  Boolean(value) && typeof value.toString === 'function' && typeof value.insert === 'function';

export class EditTimeline {
  /**
   * @param {import('yjs').Doc} doc
   * @param {object} [options]
   * @param {(origin: unknown) => Actor} [options.actorOf] who made a transaction
   * @param {(entry: TimelineEntry, isNew: boolean) => void} [options.onChange]
   * @param {() => number} [options.now]
   */
  constructor(doc, { actorOf = defaultActor, onChange, now = Date.now, coalesceMs = COALESCE_MS } = {}) {
    this.doc = doc;
    this.actorOf = actorOf;
    this.onChange = onChange;
    this.now = now;
    this.coalesceMs = coalesceMs;

    /** @type {TimelineEntry[]} oldest first */
    this.entries = [];
    /** What a file looked like just before an entry's change. @type {Map<number, string>} */
    this.versions = new Map();
    this.versionBytes = 0;
    this.nextId = 1;

    /** Each file as it stood after the last change seen: what "before" was, next time. */
    this.shadow = new Map();
    this.observer = null;
  }

  /** Starts watching. Whatever is in the room now is the starting point, not a change. */
  start() {
    if (this.observer) return;
    const files = this.doc.getMap(FILES_KEY);
    this.shadow.clear();
    for (const [path, text] of files.entries()) {
      if (isText(text)) this.shadow.set(path, text.toString());
    }
    this.observer = (events, transaction) => this.handle(events, transaction, files);
    files.observeDeep(this.observer);
  }

  stop() {
    if (!this.observer) return;
    this.doc.getMap(FILES_KEY).unobserveDeep(this.observer);
    this.observer = null;
  }

  handle(events, transaction, files) {
    const who = this.actorOf(transaction.origin);

    for (const event of events) {
      if (event.target === files) {
        for (const [path, change] of event.changes.keys) {
          if (change.action === 'delete') {
            const before = this.shadow.get(path) ?? '';
            this.shadow.delete(path);
            this.record(who, 'delete', path, { added: 0, removed: before.length, before });
          } else {
            const current = files.get(path);
            const after = isText(current) ? current.toString() : '';
            const before = change.action === 'update' ? (this.shadow.get(path) ?? '') : null;
            this.shadow.set(path, after);
            if (before === null) {
              this.record(who, 'create', path, { added: after.length, removed: 0, before: null });
            } else if (before !== after) {
              this.record(who, 'edit', path, { added: after.length, removed: before.length, before });
            }
          }
        }
        continue;
      }

      // A change inside one file's text.
      const path = event.path?.[0];
      if (typeof path !== 'string' || !isText(event.target)) continue;
      let added = 0;
      let removed = 0;
      for (const op of event.delta ?? []) {
        if (typeof op.insert === 'string') added += op.insert.length;
        else if (op.delete) removed += op.delete;
      }
      const after = event.target.toString();
      const before = this.shadow.get(path) ?? '';
      this.shadow.set(path, after);
      if (added === 0 && removed === 0) continue;
      this.record(who, 'edit', path, { added, removed, before });
    }
  }

  record(who, kind, path, { added, removed, before }) {
    const at = this.now();
    const last = this.entries.at(-1);

    // Typing in the same file by the same person soon after is the same piece of work.
    if (
      kind === 'edit' && last && last.kind === 'edit' && last.path === path &&
      last.who.senderId === who.senderId && at - last.at <= this.coalesceMs
    ) {
      last.at = at;
      last.added += added;
      last.removed += removed;
      this.onChange?.(last, false);
      return last;
    }

    const entry = { id: this.nextId, at, who, kind, path, added, removed, restorable: false };
    this.nextId += 1;
    this.entries.push(entry);

    if (before !== null && before !== undefined && Buffer.byteLength(before) <= MAX_VERSION_BYTES) {
      this.versions.set(entry.id, before);
      this.versionBytes += Buffer.byteLength(before);
      entry.restorable = true;
    }
    this.trim();
    this.onChange?.(entry, true);
    return entry;
  }

  /** Forgets the oldest entries, and the oldest saved versions once those take too much room. */
  trim() {
    while (this.entries.length > MAX_ENTRIES) this.drop(this.entries.shift());

    if (this.versionBytes > MAX_TOTAL_BYTES) {
      for (const entry of this.entries) {
        if (this.versionBytes <= MAX_TOTAL_BYTES) break;
        const text = this.versions.get(entry.id);
        if (text === undefined) continue;
        this.versionBytes -= Buffer.byteLength(text);
        this.versions.delete(entry.id);
        entry.restorable = false;
      }
    }
  }

  drop(entry) {
    const text = this.versions.get(entry.id);
    if (text !== undefined) {
      this.versionBytes -= Buffer.byteLength(text);
      this.versions.delete(entry.id);
    }
  }

  /** What `path` looked like just before entry `id`'s change, or null if that was not kept. */
  versionOf(id) {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry?.restorable) return null;
    const text = this.versions.get(id);
    return text === undefined ? null : { path: entry.path, kind: entry.kind, text };
  }

  /** The entries as people see them, newest last (the panel reverses them). */
  get publicEntries() {
    return this.entries;
  }

  toJSON() {
    return {
      v: 1,
      nextId: this.nextId,
      entries: this.entries,
      versions: Object.fromEntries(this.versions),
    };
  }

  /** Reads back what toJSON wrote. Anything malformed is skipped: the file is read into a live room. */
  load(saved) {
    if (!saved || saved.v !== 1 || !Array.isArray(saved.entries)) return;
    const entries = [];
    for (const entry of saved.entries) {
      const ok =
        entry && Number.isInteger(entry.id) && Number.isFinite(entry.at) &&
        ['edit', 'create', 'delete'].includes(entry.kind) && typeof entry.path === 'string' &&
        entry.who && typeof entry.who.name === 'string' && typeof entry.who.senderId === 'string' &&
        Number.isFinite(entry.added) && Number.isFinite(entry.removed);
      if (!ok) continue;
      const text = saved.versions?.[entry.id];
      entries.push({
        id: entry.id,
        at: entry.at,
        who: {
          name: entry.who.name.slice(0, 40),
          color: typeof entry.who.color === 'string' ? entry.who.color.slice(0, 9) : UNKNOWN.color,
          senderId: entry.who.senderId.slice(0, 40),
        },
        kind: entry.kind,
        path: entry.path.slice(0, 200),
        added: entry.added,
        removed: entry.removed,
        restorable: typeof text === 'string',
      });
      if (typeof text === 'string') {
        this.versions.set(entry.id, text);
        this.versionBytes += Buffer.byteLength(text);
      }
    }
    this.entries = entries.slice(-MAX_ENTRIES);
    this.nextId = Math.max(Number(saved.nextId) || 1, ...this.entries.map((entry) => entry.id + 1), 1);
    this.trim();
  }
}

/**
 * Puts a file back as it was just before the change an entry describes, as an ordinary
 * edit by `actor` (so it shows in the timeline too, and can itself be taken back).
 * Everything done to that file since the entry is undone with it; the caller says so.
 *
 * @returns {{ ok: true, path: string, created: boolean } | { ok: false, error: string }}
 */
export function restoreEntry(doc, timeline, id, actor) {
  const version = timeline.versionOf(id);
  if (!version) return { ok: false, error: 'That version was not kept.' };

  const files = doc.getMap(FILES_KEY);
  let created = false;
  doc.transact(() => {
    const current = files.get(version.path);
    if (isText(current)) {
      replaceMinimal(current, current.toString(), version.text);
    } else {
      const text = new Y.Text();
      if (version.text) text.insert(0, version.text);
      files.set(version.path, text);
      created = true;
    }
  }, { actor });
  return { ok: true, path: version.path, created };
}
