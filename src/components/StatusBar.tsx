/*
 * VEXCollab - the bottom status strip.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useState } from 'react';
import type { PinnedStatus } from '@/lib/collab/provider';
import { ago } from '@/lib/collab/ago';

function PinnedChip({ status }: { status: PinnedStatus }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (status.state === 'conflict' || status.state === 'error') {
    return (
      <span className="text-vex" title={status.message ?? undefined}>
        {status.state === 'conflict' ? 'Save paused — conflict' : 'Not saving'}
      </span>
    );
  }
  if (!status.pushing) {
    return <span title={status.message ?? 'Kept on the server; no repository is connected'}>Pinned</span>;
  }
  if (status.state === 'syncing' || status.state === 'starting') return <span>Saving…</span>;
  return (
    <span className="text-ok" title="Changes are committed to the repository automatically">
      Saved {ago(status.lastPushAt ?? status.lastSyncAt, now)}
    </span>
  );
}

interface Props {
  path: string;
  cursor: { line: number; column: number };
  problems: number;
  peers: number;
  connected: boolean;
  brainState: string;
  copilot: 'off' | 'signed-out' | 'ready' | 'thinking';
  /** Present only in a pinned room. */
  pinned?: PinnedStatus | null;
  onOpenPalette: () => void;
}

export function StatusBar({
  path,
  cursor,
  problems,
  peers,
  connected,
  brainState,
  copilot,
  pinned = null,
  onOpenPalette,
}: Props) {
  return (
    <div className="flex shrink-0 items-center gap-4 overflow-x-auto whitespace-nowrap border-t border-edge bg-panel px-3 py-1 text-[11px] text-ink-dim [scrollbar-width:none] [&>*]:shrink-0 [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={onOpenPalette}
        className="rounded px-1.5 py-0.5 transition hover:bg-edge hover:text-ink"
        title="Command palette"
      >
        ⌘K
      </button>

      <span className={problems > 0 ? 'text-vex' : ''}>
        {problems === 0 ? 'No problems' : `${problems} problem${problems === 1 ? '' : 's'}`}
      </span>

      <span>Ln {cursor.line}, Col {cursor.column}</span>

      <span className="ml-auto flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${connected ? 'bg-ok' : 'bg-ink-dim'}`} />
        {connected ? `${peers} editing` : 'offline'}
      </span>

      {pinned && <PinnedChip status={pinned} />}

      <span>{brainState}</span>

      {copilot !== 'off' && (
        <span className={copilot === 'ready' ? 'text-ok' : copilot === 'thinking' ? 'text-warn' : ''}>
          Copilot {copilot === 'signed-out' ? 'sign-in needed' : copilot}
        </span>
      )}

      <span className="font-mono">{path.endsWith('.py') ? 'Python' : path.split('.').pop()}</span>
    </div>
  );
}
