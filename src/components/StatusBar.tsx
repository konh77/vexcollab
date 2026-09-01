/*
 * VEXCollab - the bottom status strip.
 * Licensed under AGPL-3.0-only.
 */
'use client';

interface Props {
  path: string;
  cursor: { line: number; column: number };
  problems: number;
  peers: number;
  connected: boolean;
  brainState: string;
  copilot: 'off' | 'signed-out' | 'ready' | 'thinking';
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
  onOpenPalette,
}: Props) {
  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-edge bg-panel px-3 py-1 text-[11px] text-ink-dim">
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
