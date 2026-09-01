/*
 * VEXCollab - room shell: files, editor, brain, terminal.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { useCollab } from '@/lib/collab/useCollab';
import { readFile } from '@/lib/collab/project';
import { useV5Session, useV5Terminal } from '@/lib/vex/useV5';
import { BrainPanel } from './BrainPanel';
import { FileSidebar } from './FileSidebar';
import { TerminalPane } from './TerminalPane';

// Monaco reaches for `window` as soon as it is imported, so the editor can only
// exist on the client.
const EditorPane = dynamic(() => import('./EditorPane').then((m) => m.EditorPane), {
  ssr: false,
  loading: () => <div className="p-4 text-sm text-ink-dim">Loading editor…</div>,
});

const PROGRAM_FILE = 'main.py';

export function Workspace({ roomId }: { roomId: string }) {
  const { provider, doc, connected, peers, paths } = useCollab(roomId);
  const { session, snapshot } = useV5Session();
  const { terminal, output, isOpen, clear } = useV5Terminal();

  const [active, setActive] = useState(PROGRAM_FILE);
  const [showTerminal, setShowTerminal] = useState(true);
  const [copied, setCopied] = useState(false);

  const getSource = useCallback(
    () => (doc ? readFile(doc, PROGRAM_FILE) : ''),
    [doc],
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied; the room code in the header is still readable.
    }
  };

  const activePath = paths.includes(active) ? active : (paths[0] ?? PROGRAM_FILE);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-edge bg-panel px-4 py-2">
        <a href="/" className="text-sm font-semibold">
          VEX<span className="text-vex">Collab</span>
        </a>

        <button
          type="button"
          onClick={copyLink}
          title="Copy the room link"
          className="rounded border border-edge bg-panel-raised px-2 py-1 font-mono text-xs text-ink-dim transition hover:text-ink"
        >
          {copied ? 'link copied' : roomId}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {peers.map((peer) => (
              <span
                key={peer.id}
                title={peer.name}
                style={{ backgroundColor: peer.color }}
                className="grid size-6 place-items-center rounded-full border-2 border-panel text-[10px] font-bold text-shell"
              >
                {peer.name.charAt(0).toUpperCase()}
              </span>
            ))}
          </div>
          <span className="text-xs text-ink-dim">
            {connected ? `${peers.length} here` : 'offline'}
          </span>
          <button
            type="button"
            onClick={() => setShowTerminal((value) => !value)}
            className="rounded border border-edge px-2 py-1 text-xs transition hover:border-ink-dim"
          >
            {showTerminal ? 'Hide terminal' : 'Show terminal'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-48 shrink-0 border-r border-edge bg-panel">
          {doc && (
            <FileSidebar doc={doc} paths={paths} active={activePath} onSelect={setActive} />
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {provider ? (
              <EditorPane provider={provider} path={activePath} />
            ) : (
              <div className="p-4 text-sm text-ink-dim">Joining room…</div>
            )}
          </div>

          {showTerminal && (
            <div className="h-56 shrink-0 border-t border-edge">
              <TerminalPane
                terminal={terminal}
                output={output}
                isOpen={isOpen}
                onClear={clear}
              />
            </div>
          )}
        </main>

        <aside className="w-80 shrink-0 border-l border-edge bg-panel">
          <BrainPanel
            session={session}
            snapshot={snapshot}
            getSource={getSource}
            sourcePath={PROGRAM_FILE}
          />
        </aside>
      </div>
    </div>
  );
}
