/*
 * VEXCollab - the shared file list.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useState, type DragEvent } from 'react';
import type * as Y from 'yjs';
import { basename, createFile, deleteFile, dirname, moveFile } from '@/lib/collab/project';

/** Carries the dragged file's path, so a drop works even if React state lags. */
const DRAG_TYPE = 'application/x-vexcollab-path';

interface Props {
  doc: Y.Doc;
  paths: string[];
  active: string;
  onSelect: (path: string) => void;
  /** Called after a drag moves a file, so open tabs can follow it to its new path. */
  onMoved?: (from: string, to: string) => void;
}

export function FileSidebar({ doc, paths, active, onSelect, onMoved }: Props) {
  const [newPath, setNewPath] = useState('');
  const [adding, setAdding] = useState(false);
  // The file being dragged, and the directory ('' is the top level) it is over.
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The file whose "move to" choices are open. Dragging does not work on most
  // touch screens, so a tap has to be able to do the same job.
  const [moving, setMoving] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 4000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const drop = (from: string, toDir: string) => {
    const result = moveFile(doc, from, toDir);
    if (result.ok) {
      setNote(null);
      onMoved?.(from, result.path);
      return;
    }
    if (result.reason === 'entry') {
      setNote('main.py is the program\u2019s entry point, so it has to stay at the top level.');
    } else if (result.reason === 'exists') {
      setNote(`${toDir || 'The top level'} already has a file called ${basename(from)}.`);
    } else if (result.reason === 'missing') {
      setNote('That file was changed by someone else while you were dragging it.');
    }
  };

  /**
   * Handlers that make a spot in the list a place a file can be dropped.
   * Propagation is always stopped so the innermost target wins: a row inside
   * lib/ moves things to lib/, and only the empty space below the list means
   * "the top level". Without that, hovering a sibling in the same folder would
   * light up the top level instead.
   */
  const target = (dir: string) => ({
    onDragOver: (event: DragEvent) => {
      event.stopPropagation();
      if (dragging === null || dirname(dragging) === dir) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (over !== dir) setOver(dir);
    },
    onDragLeave: (event: DragEvent) => {
      // Moving between a row's own children fires leave; only clear on a real exit.
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setOver((current) => (current === dir ? null : current));
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const from = dragging ?? event.dataTransfer.getData(DRAG_TYPE);
      setOver(null);
      setDragging(null);
      if (from && dirname(from) !== dir) drop(from, dir);
    },
  });

  const add = () => {
    const path = newPath.trim();
    if (!path) {
      setAdding(false);
      return;
    }
    if (createFile(doc, path)) onSelect(path);
    setNewPath('');
    setAdding(false);
  };

  // Group by directory so `lib/drive.py` reads as a folder, not a long path.
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const slash = path.lastIndexOf('/');
    const dir = slash === -1 ? '' : path.slice(0, slash);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(path);
  }
  const dirs = [...groups.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-dim">Files</span>
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="New file"
          className="rounded-md px-1.5 text-xs leading-5 text-ink-dim transition hover:bg-edge hover:text-ink"
        >
          +
        </button>
      </div>

      <ul
        className={`vc-scroll flex-1 overflow-y-auto py-1 transition ${
          over === '' ? 'bg-vex/5 ring-1 ring-inset ring-vex/40' : ''
        }`}
        {...target('')}
      >
        {dirs.flatMap((dir) => [
          ...(dir
            ? [
                <li
                  key={`dir:${dir}`}
                  {...target(dir)}
                  className={`flex items-center gap-1.5 px-4 pb-0.5 pt-2 text-[11px] font-medium text-ink-dim transition ${
                    over === dir ? 'bg-vex/10 text-ink' : ''
                  }`}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                  </svg>
                  {dir}
                </li>,
              ]
            : []),
          ...groups.get(dir)!.map((path) => (
          <li
            key={path}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_TYPE, path);
              event.dataTransfer.effectAllowed = 'move';
              setDragging(path);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            {...target(dir)}
            className={`group flex flex-wrap items-center px-2 transition ${dir ? 'pl-4' : ''} ${
              dragging === path ? 'opacity-40' : ''
            } ${over === dir && dragging !== null ? 'bg-vex/10' : ''}`}
          >
            <button
              type="button"
              onClick={() => onSelect(path)}
              className={`flex-1 truncate rounded-md px-2 py-1.5 text-left text-[13px] transition [@media(pointer:coarse)]:py-2.5 ${
                path === active
                  ? 'bg-panel-raised font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                  : 'text-ink-dim hover:text-ink'
              }`}
            >
              {dir ? path.slice(dir.length + 1) : path}
            </button>
            {path !== 'main.py' && (
              <button
                type="button"
                aria-label={`Move ${path}`}
                aria-expanded={moving === path}
                onClick={() => setMoving((current) => (current === path ? null : path))}
                className="hidden px-1.5 py-1 text-xs text-ink-dim hover:text-ink [@media(hover:none)]:block"
              >
                Move
              </button>
            )}
            {path !== 'main.py' && (
              <button
                type="button"
                aria-label={`Delete ${path}`}
                onClick={() => {
                  deleteFile(doc, path);
                  if (path === active) onSelect('main.py');
                }}
                className="px-1.5 text-xs text-ink-dim opacity-0 transition group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:text-vex"
              >
                ✕
              </button>
            )}

            {moving === path && (
              <div className="flex basis-full flex-wrap gap-1.5 px-2 pb-2 pt-1">
                {dirs
                  .filter((candidate) => candidate !== dirname(path))
                  .map((candidate) => (
                    <button
                      key={candidate || '<top>'}
                      type="button"
                      onClick={() => {
                        setMoving(null);
                        drop(path, candidate);
                      }}
                      className="rounded-md bg-panel-raised px-2.5 py-1.5 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:text-vex"
                    >
                      {candidate ? `${candidate}/` : 'Top level'}
                    </button>
                  ))}
                {dirs.filter((candidate) => candidate !== dirname(path)).length === 0 && (
                  <span className="text-[11px] text-ink-dim">
                    No other folder yet. Name a file lib/new.py to make one.
                  </span>
                )}
              </div>
            )}
          </li>
          )),
        ])}

        {adding && (
          <li className="px-2 py-1">
            <input
              autoFocus
              value={newPath}
              onChange={(event) => setNewPath(event.target.value)}
              onBlur={add}
              onKeyDown={(event) => {
                if (event.key === 'Enter') add();
                if (event.key === 'Escape') {
                  setNewPath('');
                  setAdding(false);
                }
              }}
              placeholder="lib/auton.py"
              aria-label="New file name"
              className="w-full rounded-md border border-edge bg-panel-raised px-2 py-1 text-[13px] outline-none focus:border-vex"
            />
          </li>
        )}
      </ul>

      {note && (
        <p role="status" className="border-t border-edge px-3 py-2 text-[11px] leading-snug text-vex">
          {note}
        </p>
      )}
    </div>
  );
}
