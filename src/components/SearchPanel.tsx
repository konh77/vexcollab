/*
 * VEXCollab - search across every file in the room.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchHit {
  file: string;
  line: number;
  text: string;
  start: number;
  end: number;
}

interface Props {
  open: boolean;
  files: { path: string; contents: string }[];
  onClose: () => void;
  onJump: (file: string, line: number) => void;
}

const MAX_HITS = 200;

function search(
  files: { path: string; contents: string }[],
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): SearchHit[] {
  if (query.length < 2) return [];
  const hits: SearchHit[] = [];
  const needle = caseSensitive ? query : query.toLowerCase();

  for (const file of files) {
    const lines = file.contents.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const hay = caseSensitive ? raw : raw.toLowerCase();
      let from = 0;
      for (;;) {
        const at = hay.indexOf(needle, from);
        if (at === -1) break;
        const before = at === 0 ? '' : hay[at - 1];
        const after = hay[at + needle.length] ?? '';
        const isWord = !/\w/.test(before) && !/\w/.test(after);
        if (!wholeWord || isWord) {
          hits.push({
            file: file.path,
            line: i + 1,
            text: raw,
            start: at,
            end: at + needle.length,
          });
          if (hits.length >= MAX_HITS) return hits;
        }
        from = at + needle.length;
      }
    }
  }
  return hits;
}

export function SearchPanel({ open, files, onClose, onJump }: Props) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(
    () => search(files, query.trim(), caseSensitive, wholeWord),
    [files, query, caseSensitive, wholeWord],
  );

  useEffect(() => {
    if (open) setIndex(0);
  }, [open, query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  const choose = (hit: SearchHit) => {
    onJump(hit.file, hit.line);
    onClose();
  };

  const byFile = hits.reduce<Record<string, SearchHit[]>>((acc, hit) => {
    (acc[hit.file] ??= []).push(hit);
    return acc;
  }, {});

  let flat = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[12vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[640px] max-w-[92vw] overflow-hidden rounded-2xl bg-panel-raised shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Search in files"
      >
        <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setIndex((i) => Math.min(i + 1, hits.length - 1));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (event.key === 'Enter' && hits[index]) choose(hits[index]);
            }}
            placeholder="Search every file…"
            aria-label="Search"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-dim"
          />
          <button
            type="button"
            onClick={() => setCaseSensitive((v) => !v)}
            title="Match case"
            className={`rounded px-2 py-1 font-mono text-[11px] transition ${
              caseSensitive ? 'bg-vex text-white' : 'text-ink-dim hover:bg-panel'
            }`}
          >
            Aa
          </button>
          <button
            type="button"
            onClick={() => setWholeWord((v) => !v)}
            title="Whole word"
            className={`rounded px-2 py-1 font-mono text-[11px] transition ${
              wholeWord ? 'bg-vex text-white' : 'text-ink-dim hover:bg-panel'
            }`}
          >
            ab
          </button>
        </div>

        <div ref={listRef} className="vc-scroll max-h-[54vh] overflow-y-auto py-1">
          {query.trim().length >= 2 && hits.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-dim">No matches.</p>
          )}
          {query.trim().length < 2 && (
            <p className="px-4 py-6 text-center text-sm text-ink-dim">
              Type at least two characters.
            </p>
          )}

          {Object.entries(byFile).map(([file, fileHits]) => (
            <div key={file}>
              <div className="px-4 pb-0.5 pt-2 text-[11px] font-medium text-ink-dim">
                {file}
                <span className="ml-1.5 text-ink-dim">{fileHits.length}</span>
              </div>
              {fileHits.map((hit) => {
                const active = flat++ === index;
                return (
                  <button
                    key={`${hit.file}:${hit.line}:${hit.start}`}
                    type="button"
                    data-active={active}
                    onClick={() => choose(hit)}
                    className={`flex w-full gap-3 px-4 py-1 text-left font-mono text-[12px] transition ${
                      active ? 'bg-panel' : ''
                    }`}
                  >
                    <span className="w-8 shrink-0 text-right text-ink-dim">{hit.line}</span>
                    <span className="truncate">
                      {hit.text.slice(0, hit.start)}
                      <mark className="rounded-sm bg-warn/40 text-ink">
                        {hit.text.slice(hit.start, hit.end)}
                      </mark>
                      {hit.text.slice(hit.end)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {hits.length > 0 && (
          <div className="border-t border-edge px-4 py-1.5 text-[11px] text-ink-dim">
            {hits.length === MAX_HITS ? `first ${MAX_HITS} matches` : `${hits.length} matches`} in{' '}
            {Object.keys(byFile).length} file{Object.keys(byFile).length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}
