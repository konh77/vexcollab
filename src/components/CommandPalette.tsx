/*
 * VEXCollab - command palette (Cmd/Ctrl-K).
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  disabled?: boolean;
  run: () => void;
}

interface Props {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}

/** Subsequence match, so "upl1" finds "Upload to slot 1". */
function score(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q);
  let qi = 0;
  let hits = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++;
      hits++;
    }
  }
  return qi === q.length ? hits : 0;
}

export function CommandPalette({ open, commands, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    return commands
      .map((command) => ({ command, s: score(query, `${command.group} ${command.label}`) }))
      .filter((entry) => entry.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  const choose = (command: Command) => {
    if (command.disabled) return;
    onClose();
    command.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[12vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-2xl bg-panel-raised shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIndex((i) => Math.min(i + 1, matches.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            }
            if (event.key === 'Enter' && matches[index]) choose(matches[index]);
          }}
          placeholder="Go to file, or run a command…"
          aria-label="Command"
          className="w-full border-b border-edge bg-transparent px-4 py-3.5 text-[15px] outline-none placeholder:text-ink-dim"
        />

        <div ref={listRef} className="vc-scroll max-h-[52vh] overflow-y-auto py-1.5">
          {matches.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-dim">Nothing matches.</p>
          )}
          {matches.map((command, i) => (
            <button
              key={command.id}
              type="button"
              data-active={i === index}
              disabled={command.disabled}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(command)}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] transition disabled:opacity-40 ${
                i === index ? 'bg-panel' : ''
              }`}
            >
              <span className="w-16 shrink-0 text-[11px] text-ink-dim">{command.group}</span>
              <span className="flex-1 truncate">{command.label}</span>
              {command.hint && <span className="text-[11px] text-ink-dim">{command.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
