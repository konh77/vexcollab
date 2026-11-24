/*
 * VEXCollab - who changed which file, in a pinned room.
 * Licensed under AGPL-3.0-only.
 *
 * A pinned room keeps a timeline of changes. This lists them, newest first, and puts a
 * file back as it was before a change. Putting back is itself an edit, so it shows up
 * here too and can be taken back the same way.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TimelineEntry } from '@/lib/collab/provider';
import { ago } from '@/lib/collab/ago';

/** How much a change did, in a few characters. */
function size(entry: TimelineEntry): string {
  if (entry.kind === 'create') return 'new file';
  if (entry.kind === 'delete') return 'deleted';
  const parts = [];
  if (entry.added) parts.push(`+${entry.added}`);
  if (entry.removed) parts.push(`−${entry.removed}`);
  return parts.join(' ') || 'changed';
}

export function HistoryPanel({
  entries,
  selfId,
  onRestore,
}: {
  entries: TimelineEntry[];
  selfId: string | null;
  onRestore: (id: number) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [asking, setAsking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const newestFirst = useMemo(() => [...entries].reverse(), [entries]);

  const restore = async (entry: TimelineEntry) => {
    if (busy) return;
    setBusy(true);
    const problem = await onRestore(entry.id);
    setBusy(false);
    setAsking(null);
    setResult(
      problem
        ? { ok: false, text: problem }
        : { ok: true, text: `${entry.path} is back as it was before that change.` },
    );
  };

  return (
    <div className="border-t border-edge">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-2 px-3 py-2.5 text-left [@media(pointer:coarse)]:py-3"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-dim">History</span>
        <span className="text-[10px] text-ink-dim">
          {entries.length === 0 ? 'nothing yet' : `${entries.length} change${entries.length === 1 ? '' : 's'}`}
          <span aria-hidden className="ml-1.5">{open ? '▾' : '▸'}</span>
        </span>
      </button>

      {open && (
        <div className="px-3 pb-2.5">
          {entries.length === 0 ? (
            <p className="text-[11px] leading-snug text-ink-dim">
              Changes to files will be listed here, with who made them.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto pr-0.5">
              {newestFirst.map((entry) => {
                const mine = entry.who.senderId === selfId;
                const confirming = asking === entry.id;
                return (
                  <li key={entry.id} className="rounded-md bg-panel px-2 py-1.5">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.who.color }}
                      />
                      <span className="truncate font-medium">{mine ? 'You' : entry.who.name}</span>
                      <span className="ml-auto shrink-0 text-ink-dim">{ago(entry.at, now)}</span>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-[11px]" title={entry.path}>
                        {entry.path}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-dim">{size(entry)}</span>
                    </div>

                    {entry.restorable && !confirming && (
                      <button
                        type="button"
                        onClick={() => {
                          setResult(null);
                          setAsking(entry.id);
                        }}
                        className="mt-1 text-[10px] text-ink-dim underline-offset-2 transition hover:text-vex hover:underline [@media(pointer:coarse)]:py-1.5"
                      >
                        {entry.kind === 'delete' ? 'Bring the file back' : 'Put it back as it was'}
                      </button>
                    )}

                    {confirming && (
                      <div className="mt-1.5 rounded-md bg-shell p-2">
                        <p className="text-[11px] leading-snug">
                          {entry.kind === 'delete'
                            ? `Bring ${entry.path} back as it was just before it was deleted?`
                            : `Put ${entry.path} back as it was just before this change? Anything changed in it after that is undone too.`}
                        </p>
                        <div className="mt-1.5 flex gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void restore(entry)}
                            className="flex-1 rounded-md bg-vex px-2 py-1 text-[11px] font-medium text-white transition hover:bg-vex-soft disabled:opacity-50 [@media(pointer:coarse)]:py-2"
                          >
                            {busy ? 'Restoring…' : 'Restore'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setAsking(null)}
                            className="flex-1 rounded-md bg-panel-raised px-2 py-1 text-[11px] font-medium transition hover:text-vex disabled:opacity-50 [@media(pointer:coarse)]:py-2"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {result && (
            <p role="status" className={`mt-2 text-[11px] leading-snug ${result.ok ? 'text-ok' : 'text-vex'}`}>
              {result.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
