/*
 * VEXCollab - the shared file list.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useState } from 'react';
import type * as Y from 'yjs';
import { createFile, deleteFile } from '@/lib/collab/project';

interface Props {
  doc: Y.Doc;
  paths: string[];
  active: string;
  onSelect: (path: string) => void;
}

export function FileSidebar({ doc, paths, active, onSelect }: Props) {
  const [newPath, setNewPath] = useState('');
  const [adding, setAdding] = useState(false);

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

      <ul className="vc-scroll flex-1 overflow-y-auto py-1">
        {paths.map((path) => (
          <li key={path} className="group flex items-center px-2">
            <button
              type="button"
              onClick={() => onSelect(path)}
              className={`flex-1 truncate rounded-md px-2 py-1.5 text-left text-[13px] transition ${
                path === active
                  ? 'bg-panel-raised font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                  : 'text-ink-dim hover:text-ink'
              }`}
            >
              {path}
            </button>
            {path !== 'main.py' && (
              <button
                type="button"
                aria-label={`Delete ${path}`}
                onClick={() => {
                  deleteFile(doc, path);
                  if (path === active) onSelect('main.py');
                }}
                className="px-1.5 text-xs text-ink-dim opacity-0 transition group-hover:opacity-100 hover:text-vex"
              >
                ✕
              </button>
            )}
          </li>
        ))}

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
              placeholder="auton.py"
              aria-label="New file name"
              className="w-full rounded-md border border-edge bg-panel-raised px-2 py-1 text-[13px] outline-none focus:border-vex"
            />
          </li>
        )}
      </ul>
    </div>
  );
}
