/*
 * VEXCollab - the shared file set inside a room's Y.Doc.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import * as Y from 'yjs';
import { templateById } from '@/lib/vex/templates';

export const FILES_KEY = 'files';

export function getFiles(doc: Y.Doc): Y.Map<Y.Text> {
  return doc.getMap<Y.Text>(FILES_KEY);
}

export function listPaths(doc: Y.Doc): string[] {
  return [...getFiles(doc).keys()].sort((a, b) => {
    // main.py is the program that actually ships, so it leads.
    if (a === 'main.py') return -1;
    if (b === 'main.py') return 1;
    return a.localeCompare(b);
  });
}

/**
 * Seeds a brand-new room from a template. Runs inside a transaction and
 * re-checks emptiness so two people opening the link at the same instant
 * cannot double-seed.
 *
 * A room opened from a GitHub repo is seeded with nothing — the clone fills it,
 * and template files would only have to be deleted again.
 */
export function ensureStarterFiles(doc: Y.Doc, templateId?: string | null) {
  const files = getFiles(doc);
  if (files.size > 0) return;
  if (templateId === 'none') return;

  doc.transact(() => {
    if (files.size > 0) return;
    for (const file of templateById(templateId).files) {
      const text = new Y.Text();
      text.insert(0, file.contents);
      files.set(file.path, text);
    }
  });
}

export function createFile(doc: Y.Doc, path: string, contents = '') {
  const files = getFiles(doc);
  if (files.has(path)) return false;
  doc.transact(() => {
    const text = new Y.Text();
    if (contents) text.insert(0, contents);
    files.set(path, text);
  });
  return true;
}

export function deleteFile(doc: Y.Doc, path: string) {
  doc.transact(() => getFiles(doc).delete(path));
}

/** Every file in the room, for bundling into one program. */
export function readAllFiles(doc: Y.Doc): { path: string; contents: string }[] {
  return listPaths(doc).map((path) => ({ path, contents: readFile(doc, path) }));
}

/**
 * Applies files pulled from Git into the room. Existing files are rewritten in
 * place inside one transaction so collaborators see a single change, not a
 * flicker of empty documents.
 */
export function applyIncomingFiles(doc: Y.Doc, incoming: { path: string; contents: string }[]) {
  const files = getFiles(doc);
  doc.transact(() => {
    for (const file of incoming) {
      const existing = files.get(file.path);
      if (existing) {
        if (existing.toString() === file.contents) continue;
        existing.delete(0, existing.length);
        existing.insert(0, file.contents);
      } else {
        const text = new Y.Text();
        text.insert(0, file.contents);
        files.set(file.path, text);
      }
    }
  });
}

export function readFile(doc: Y.Doc, path: string): string {
  return getFiles(doc).get(path)?.toString() ?? '';
}

/** A module-level `name = Class(...)` — what a device declaration looks like. */
const DECLARATION = /^[A-Za-z_]\w*\s*=\s*[A-Z]\w*\s*\(/;
const IMPORT = /^\s*(from\s+\S+\s+import\b|import\s+\S+)/;

/**
 * Puts a device declaration where a person would have typed it: under the
 * other declarations if the file has any, otherwise under the imports,
 * otherwise at the top. Returns the 1-based line it landed on, so the caller
 * can scroll there.
 *
 * Only module-level declarations count as anchors — an indented
 * `motor = Motor(...)` inside a function is somebody's local variable, and
 * appending a global next to it would put it out of scope.
 */
export function insertDeclaration(doc: Y.Doc, path: string, declaration: string): number | null {
  const text = getFiles(doc).get(path);
  if (!text) return null;

  const source = text.toString();
  const lines = source.split('\n');

  let anchor = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (DECLARATION.test(lines[i])) anchor = i;
  }
  if (anchor === -1) {
    for (let i = 0; i < lines.length; i += 1) {
      if (IMPORT.test(lines[i])) anchor = i;
    }
  }

  const at = anchor + 1;

  doc.transact(() => {
    if (at >= lines.length) {
      const prefix = source.length === 0 || source.endsWith('\n') ? '' : '\n';
      text.insert(source.length, `${prefix}${declaration}\n`);
      return;
    }

    let offset = 0;
    for (let i = 0; i < at; i += 1) offset += lines[i].length + 1;

    // Keep a blank line between the new declaration and whatever follows,
    // unless what follows is another declaration it belongs beside.
    const next = lines[at];
    const suffix = next.trim() !== '' && !DECLARATION.test(next) ? '\n\n' : '\n';
    text.insert(offset, `${declaration}${suffix}`);
  });

  return at + 1;
}

/** The entry file is found by this exact name when a program is bundled. */
const ENTRY_FILE = 'main.py';

export type MoveResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'entry' | 'missing' | 'exists' | 'same' };

/** `lib/auton/path.py` -> `path.py` */
export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** `lib/auton/path.py` -> `lib/auton`, and '' for a file at the top level. */
export function dirname(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/**
 * Moves a file into a directory ('' is the top level), keeping its name.
 *
 * A room's files are a flat map keyed by path -- a folder only exists because a
 * file's key says so -- so a move is a rename: the same text under a new key.
 * A Y.Text cannot be re-parented, so the contents are copied into a fresh one,
 * and the whole swap happens in one transaction so collaborators see the file
 * leave one place and arrive in the other, never both or neither.
 *
 * Refuses to overwrite: dropping a file onto a folder that already has one by
 * that name must not silently destroy somebody's work.
 */
export function moveFile(doc: Y.Doc, from: string, toDir: string): MoveResult {
  const files = getFiles(doc);
  const source = files.get(from);
  if (!source) return { ok: false, reason: 'missing' };

  // main.py is what the program is built around, and is looked up by this exact
  // path. Moved into a folder it would stop being the entry point.
  if (from === ENTRY_FILE) return { ok: false, reason: 'entry' };

  const target = toDir ? `${toDir}/${basename(from)}` : basename(from);
  if (target === from) return { ok: false, reason: 'same' };
  if (target === ENTRY_FILE || files.has(target)) return { ok: false, reason: 'exists' };

  doc.transact(() => {
    const moved = new Y.Text();
    moved.insert(0, source.toString());
    files.set(target, moved);
    files.delete(from);
  });
  return { ok: true, path: target };
}
