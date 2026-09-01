/*
 * VEXCollab - commit the room to Git.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { applyIncomingFiles, readAllFiles } from '@/lib/collab/project';

interface GitStatus {
  dir: string;
  isRepo: boolean;
  branch?: string;
  remote?: string | null;
  changed?: string[];
  error?: string;
}

async function call(action: string, extra: Record<string, unknown> = {}) {
  const response = await fetch('/api/git', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  return (await response.json()) as GitStatus & Record<string, unknown>;
}

export function GitPanel({ doc }: { doc: Y.Doc }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [message, setMessage] = useState('');
  const [remote, setRemote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await call('status'));
    } catch {
      setStatus({ dir: '', isRepo: false, error: 'Server unreachable' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (label: string, fn: () => Promise<GitStatus & Record<string, unknown>>) => {
    setBusy(label);
    setNote(null);
    try {
      const result = await fn();
      if (result.error) {
        setNote(result.error);
      } else {
        setStatus(result);
        if (typeof result.hash === 'string') setNote(`Committed ${result.hash}`);
        else if (typeof result.output === 'string') setNote(result.output);
        else if (typeof result.note === 'string') setNote(result.note);
        setMessage('');
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Failed');
    } finally {
      setBusy(null);
    }
  };

  const commit = () =>
    act('commit', () => call('commit', { message, files: readAllFiles(doc) }));

  const pull = () =>
    act('pull', async () => {
      const result = await call('pull');
      if (Array.isArray(result.files)) {
        applyIncomingFiles(doc, result.files as { path: string; contents: string }[]);
      }
      return result;
    });

  if (!status) {
    return <div className="border-t border-edge px-3 py-2 text-[11px] text-ink-dim">Git…</div>;
  }

  return (
    <div className="border-t border-edge px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">Git</span>
        {status.isRepo && (
          <span className="truncate rounded bg-panel-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-dim">
            {status.branch}
          </span>
        )}
      </div>

      {!status.isRepo ? (
        <div className="space-y-1.5">
          <p className="text-[11px] leading-relaxed text-ink-dim">
            No repo yet in <span className="font-mono">{status.dir.split('/').pop()}</span>.
          </p>
          <input
            value={remote}
            onChange={(event) => setRemote(event.target.value)}
            placeholder="git@github.com:you/repo.git"
            aria-label="Remote URL"
            className="w-full rounded-md border border-edge bg-panel-raised px-2 py-1 text-[11px] outline-none focus:border-vex"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act('init', () => call('init', { remote: remote.trim() || undefined }))}
            className="w-full rounded-md bg-panel-raised px-2 py-1.5 text-[11px] font-medium transition hover:bg-edge disabled:opacity-50"
          >
            {busy === 'init' ? 'Creating…' : 'Create repository'}
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] text-ink-dim">
            {status.changed?.length
              ? `${status.changed.length} change${status.changed.length === 1 ? '' : 's'} on disk`
              : 'Working tree clean'}
          </p>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Commit message"
            aria-label="Commit message"
            className="w-full rounded-md border border-edge bg-panel-raised px-2 py-1 text-[11px] outline-none focus:border-vex"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={commit}
              disabled={busy !== null}
              className="flex-1 rounded-md bg-panel-raised px-2 py-1.5 text-[11px] font-medium transition hover:bg-edge disabled:opacity-50"
            >
              {busy === 'commit' ? 'Saving…' : 'Commit'}
            </button>
            <button
              type="button"
              onClick={() => act('push', () => call('push'))}
              disabled={busy !== null || !status.remote}
              title={status.remote ?? 'No remote configured'}
              className="flex-1 rounded-md bg-panel-raised px-2 py-1.5 text-[11px] font-medium transition hover:bg-edge disabled:opacity-50"
            >
              {busy === 'push' ? 'Pushing…' : 'Push'}
            </button>
            <button
              type="button"
              onClick={pull}
              disabled={busy !== null || !status.remote}
              className="flex-1 rounded-md bg-panel-raised px-2 py-1.5 text-[11px] font-medium transition hover:bg-edge disabled:opacity-50"
            >
              {busy === 'pull' ? 'Pulling…' : 'Pull'}
            </button>
          </div>
        </div>
      )}

      {note && <p className="mt-1.5 break-words text-[10px] leading-relaxed text-ink-dim">{note}</p>}
    </div>
  );
}
