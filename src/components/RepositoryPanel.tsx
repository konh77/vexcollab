/*
 * VEXCollab - pull and push for a pinned room's repository.
 * Licensed under AGPL-3.0-only.
 *
 * A pinned room already saves itself -- after you stop typing, and by checking
 * the repository every few minutes. This is for when you do not want to wait:
 * you just pushed from VEXcode and want it here now, or you want what is in the
 * room in the repository before you close the laptop.
 */
'use client';

import { useEffect, useState } from 'react';
import type { PinnedStatus } from '@/lib/collab/provider';
import { ago } from '@/lib/collab/ago';

type Action = 'pull' | 'push';

export function RepositoryPanel({
  status,
  onSync,
}: {
  status: PinnedStatus;
  onSync: (action: Action) => Promise<{ ok: boolean; summary: string }>;
}) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // A room with no repository has nothing to pull from or push to.
  if (!status.pushing) return null;

  const working = busy !== null || status.state === 'syncing' || status.state === 'starting';

  const run = async (action: Action) => {
    if (working) return;
    setBusy(action);
    setResult(null);
    const outcome = await onSync(action);
    setBusy(null);
    setResult({ ok: outcome.ok, text: outcome.summary });
  };

  const problem = status.state === 'conflict' || status.state === 'error';

  return (
    <div className="border-t border-edge px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-dim">GitHub</span>
        {status.repo && (
          <span className="truncate font-mono text-[10px] text-ink-dim" title={status.repo}>
            {status.repo}
          </span>
        )}
      </div>

      <p className={`mb-2 text-[11px] leading-snug ${problem ? 'text-vex' : 'text-ink-dim'}`}>
        {problem
          ? (status.message ?? 'Saving is paused.')
          : working
            ? 'Working…'
            : `Saved ${ago(status.lastPushAt ?? status.lastSyncAt, now)}. It also saves by itself.`}
      </p>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void run('pull')}
          disabled={working}
          title="Bring changes from the repository into this room"
          className="flex-1 rounded-md bg-panel-raised px-2 py-1.5 text-[12px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:text-vex disabled:opacity-50 [@media(pointer:coarse)]:py-2.5"
        >
          {busy === 'pull' ? 'Pulling…' : '↓ Pull'}
        </button>
        <button
          type="button"
          onClick={() => void run('push')}
          disabled={working}
          title="Save this room to the repository now"
          className="flex-1 rounded-md bg-vex px-2 py-1.5 text-[12px] font-medium text-white transition hover:bg-vex-soft disabled:opacity-50 [@media(pointer:coarse)]:py-2.5"
        >
          {busy === 'push' ? 'Pushing…' : '↑ Push'}
        </button>
      </div>

      {result && (
        <p
          role="status"
          className={`mt-2 text-[11px] leading-snug ${result.ok ? 'text-ok' : 'text-vex'}`}
        >
          {result.text}
        </p>
      )}
    </div>
  );
}
