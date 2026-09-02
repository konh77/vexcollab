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
