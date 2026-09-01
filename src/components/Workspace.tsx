/*
 * VEXCollab - room shell: files, editor, brain, terminal.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { useCollab } from '@/lib/collab/useCollab';
import { readAllFiles } from '@/lib/collab/project';
import { bundlePythonProject, countProgramFiles, detectLanguage, pythonPayload } from '@/lib/vex/program';
import { useV5Session, useV5Terminal } from '@/lib/vex/useV5';
import { BrainPanel } from './BrainPanel';
import { FileSidebar } from './FileSidebar';
import { GitPanel } from './GitPanel';
import { TerminalPane } from './TerminalPane';

// Monaco reaches for `window` as soon as it is imported, so the editor can only
// exist on the client.
const EditorPane = dynamic(() => import('./EditorPane').then((m) => m.EditorPane), {
  ssr: false,
  loading: () => <div className="p-4 text-sm text-ink-dim">Loading editor…</div>,
});

const PROGRAM_FILE = 'main.py';

export function Workspace({ roomId }: { roomId: string }) {
  const { provider, doc, connected, peers, paths, error } = useCollab(roomId);
  const { session, snapshot } = useV5Session();
  const { terminal, output, isOpen, clear } = useV5Terminal();

  const [active, setActive] = useState(PROGRAM_FILE);
  const [showTerminal, setShowTerminal] = useState(true);
  const [copied, setCopied] = useState(false);

  const language = detectLanguage(paths.map((path) => ({ path })));

  /**
   * Produces the bytes to write to a program slot. Python is bundled in the
   * browser; C++ has to be cross-compiled, which only the machine running the
   * server can do.
   */
  const prepareProgram = useCallback(async () => {
    if (!doc) throw new Error('Not connected to the room yet');
    const files = readAllFiles(doc);

    if (detectLanguage(files) === 'python') {
      return { payload: pythonPayload(bundlePythonProject(files, PROGRAM_FILE)) };
    }

    const response = await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    });
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Build failed');

    const binary = atob(result.binBase64);
    const payload = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) payload[i] = binary.charCodeAt(i);
    return { payload, log: result.log as string | undefined };
  }, [doc]);

  const programFileCount = countProgramFiles(paths.map((path) => ({ path, contents: '' })));

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
      <header className="vc-vibrancy z-10 flex items-center gap-3 border-b border-edge px-4 py-2">
        <a href="/" className="text-sm font-semibold">
          VEX<span className="text-vex">Collab</span>
        </a>

        <button
          type="button"
          onClick={copyLink}
          title="Copy the room link"
          className="rounded-md bg-panel px-2.5 py-1 font-mono text-[11px] text-ink-dim transition hover:text-ink"
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
                className="grid size-6 place-items-center rounded-full border-2 border-white text-[10px] font-semibold text-white"
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
            className="rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge"
          >
            {showTerminal ? 'Hide terminal' : 'Show terminal'}
          </button>
        </div>
      </header>

      {(error || !connected) && (
        <div className="flex items-center gap-2 border-b border-edge bg-warn/12 px-4 py-1.5 text-xs text-ink">
          <span className="size-1.5 shrink-0 rounded-full bg-warn" />
          <span>
            {error ??
              'Not connected — your changes are only on this screen until this reconnects.'}
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-48 shrink-0 flex-col border-r border-edge bg-panel">
          {doc && (
            <>
              <div className="min-h-0 flex-1">
                <FileSidebar doc={doc} paths={paths} active={activePath} onSelect={setActive} />
              </div>
              <GitPanel doc={doc} />
            </>
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

        <aside className="w-80 shrink-0 border-l border-edge bg-shell">
          <BrainPanel
            session={session}
            snapshot={snapshot}
            prepareProgram={prepareProgram}
            programFileCount={programFileCount}
            language={language}
          />
        </aside>
      </div>
    </div>
  );
}
