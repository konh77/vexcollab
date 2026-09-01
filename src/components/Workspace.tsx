/*
 * VEXCollab - room shell: files, editor, brain, terminal.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCollab } from '@/lib/collab/useCollab';
import { readAllFiles } from '@/lib/collab/project';
import {
  bundlePythonProject,
  countProgramFiles,
  detectLanguage,
  pythonPayload,
} from '@/lib/vex/program';
import { useV5Session, useV5Terminal } from '@/lib/vex/useV5';
import { BrainPanel } from './BrainPanel';
import { CommandPalette, type Command } from './CommandPalette';
import { EditorTabs } from './EditorTabs';
import { FileSidebar } from './FileSidebar';
import { GitPanel } from './GitPanel';
import { StatusBar } from './StatusBar';
import { TerminalPane } from './TerminalPane';
import type { Problem } from './EditorPane';

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
  const [openTabs, setOpenTabs] = useState<string[]>([PROGRAM_FILE]);
  const [showTerminal, setShowTerminal] = useState(true);
  const [copied, setCopied] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [problemsByPath, setProblemsByPath] = useState<Record<string, number>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [copilot, setCopilot] = useState<'off' | 'signed-out' | 'ready' | 'thinking'>('off');

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
  const activePath = paths.includes(active) ? active : (paths[0] ?? PROGRAM_FILE);

  const openFile = useCallback((path: string) => {
    setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
    setActive(path);
  }, []);

  const closeTab = useCallback(
    (path: string) => {
      setOpenTabs((tabs) => {
        const next = tabs.filter((t) => t !== path);
        if (path === active) setActive(next[next.length - 1] ?? PROGRAM_FILE);
        return next.length ? next : [PROGRAM_FILE];
      });
    },
    [active],
  );

  // Copilot is optional and off unless the server was started with it.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    })
      .then((r) => r.json())
      .then((status: { enabled: boolean; signedIn: boolean }) => {
        if (cancelled) return;
        setCopilot(!status.enabled ? 'off' : status.signedIn ? 'ready' : 'signed-out');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied; the room code in the header is still readable.
    }
  };

  const commands = useMemo<Command[]>(() => {
    const fileCommands: Command[] = paths.map((path) => ({
      id: `file:${path}`,
      label: path,
      group: 'File',
      run: () => openFile(path),
    }));

    // Deliberately no upload or run here: those move a robot, and a command
    // palette is one keystroke away from an accident.
    const actions: Command[] = [
      {
        id: 'brain.connect',
        label: snapshot.connectionState === 'connected' ? 'Disconnect brain' : 'Connect brain over USB',
        group: 'Brain',
        run: () =>
          snapshot.connectionState === 'connected' ? void session.disconnect() : void session.connect(),
      },
      {
        id: 'brain.stop',
        label: 'Stop the running program',
        group: 'Brain',
        disabled: !snapshot.isRunningProgram,
        run: () => void session.stopProgram(),
      },
      {
        id: 'brain.screen',
        label: 'Capture the brain screen',
        group: 'Brain',
        disabled: snapshot.connectionState !== 'connected',
        run: () => void session.captureScreen(),
      },
      {
        id: 'view.terminal',
        label: showTerminal ? 'Hide the terminal' : 'Show the terminal',
        group: 'View',
        hint: '⌘J',
        run: () => setShowTerminal((v) => !v),
      },
      {
        id: 'terminal.port',
        label: isOpen ? 'Close the user serial port' : 'Open the user serial port',
        group: 'View',
        run: () => void (isOpen ? terminal.close() : terminal.open()),
      },
      {
        id: 'room.copy',
        label: 'Copy the room link',
        group: 'Room',
        run: () => void copyLink(),
      },
    ];

    if (copilot !== 'off') {
      actions.push({
        id: 'copilot.signin',
        label: copilot === 'ready' ? 'Copilot: signed in' : 'Copilot: sign in',
        group: 'Copilot',
        disabled: copilot === 'ready',
        run: () => {
          void fetch('/api/copilot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'signin' }),
          })
            .then((r) => r.json())
            .then((status: { userCode?: string; verificationUri?: string }) => {
              if (status.userCode) {
                window.prompt(
                  `Copy this code, then open ${status.verificationUri ?? 'https://github.com/login/device'} to finish signing in:`,
                  status.userCode,
                );
              }
            })
            .catch(() => undefined);
        },
      });
    }

    return [...actions, ...fileCommands];
  }, [paths, openFile, session, snapshot, showTerminal, isOpen, terminal, copilot]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (mod && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setShowTerminal((v) => !v);
      }
      // Everything is live-saved; stop the browser's save dialog.
      if (mod && event.key.toLowerCase() === 's') event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const problems = problemsByPath[activePath] ?? 0;

  const brainState =
    snapshot.connectionState === 'connected'
      ? snapshot.batteryPercent != null
        ? `Brain ${snapshot.batteryPercent}%`
        : 'Brain connected'
      : snapshot.connectionState === 'unsupported'
        ? 'USB unavailable'
        : 'No brain';

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

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="rounded-md bg-panel px-2.5 py-1 text-[11px] text-ink-dim transition hover:text-ink"
        >
          Search or run a command  ⌘K
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
          <span className="text-xs text-ink-dim">{connected ? `${peers.length} here` : 'offline'}</span>
          <button
            type="button"
            onClick={() => setShowTerminal((value) => !value)}
            className="rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge"
          >
            {showTerminal ? 'Hide terminal' : 'Show terminal'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-48 shrink-0 flex-col border-r border-edge bg-panel">
          {doc && (
            <>
              <div className="min-h-0 flex-1">
                <FileSidebar doc={doc} paths={paths} active={activePath} onSelect={openFile} />
              </div>
              <GitPanel doc={doc} />
            </>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <EditorTabs
            open={openTabs.filter((t) => paths.includes(t))}
            active={activePath}
            problemsByPath={problemsByPath}
            onSelect={setActive}
            onClose={closeTab}
          />

          <div className="min-h-0 flex-1">
            {provider ? (
              <EditorPane
                provider={provider}
                path={activePath}
                onCursorChange={setCursor}
                onProblemsChange={(list: Problem[]) =>
                  setProblemsByPath((prev) => ({ ...prev, [activePath]: list.length }))
                }
              />
            ) : (
              <div className="p-4 text-sm text-ink-dim">Joining room…</div>
            )}
          </div>

          {showTerminal && (
            <div className="h-56 shrink-0 border-t border-edge">
              <TerminalPane terminal={terminal} output={output} isOpen={isOpen} onClear={clear} />
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

      <StatusBar
        path={activePath}
        cursor={cursor}
        problems={problems}
        peers={peers.length}
        connected={connected}
        brainState={brainState}
        copilot={copilot}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
