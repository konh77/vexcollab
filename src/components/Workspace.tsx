/*
 * VEXCollab - room shell: files, editor, brain, terminal.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCollab } from '@/lib/collab/useCollab';
import { rememberRoom } from '@/lib/collab/recent';
import { applyIncomingFiles, readAllFiles, readFile } from '@/lib/collab/project';
import { useAnalysis } from '@/lib/editor/useAnalysis';
import { bundlePythonProject, countProgramFiles } from '@/lib/vex/program';
import { useV5Session, useV5Terminal } from '@/lib/vex/useV5';
import { BrainPanel } from './BrainPanel';
import { ChatPanel } from './ChatPanel';
import { CommandPalette, type Command } from './CommandPalette';
import { SearchPanel } from './SearchPanel';
import { Settings } from './Settings';
import { EditorTabs } from './EditorTabs';
import { FileSidebar } from './FileSidebar';
import { GitHubPanel } from './GitHubPanel';
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

export function Workspace({
  roomId,
  template = null,
  repo = null,
}: {
  roomId: string;
  template?: string | null;
  repo?: string | null;
}) {
  const { provider, doc, connected, peers, paths } = useCollab(roomId, template);
  const { session, snapshot } = useV5Session();
  const { terminal, output, isOpen, series, clear } = useV5Terminal();

  const [active, setActive] = useState(PROGRAM_FILE);
  const [openTabs, setOpenTabs] = useState<string[]>([PROGRAM_FILE]);
  const [showTerminal, setShowTerminal] = useState(true);
  const [copied, setCopied] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [problemsByPath, setProblemsByPath] = useState<Record<string, number>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [copilot, setCopilot] = useState<'off' | 'signed-out' | 'ready' | 'thinking'>('off');
  const [showSettings, setShowSettings] = useState(false);
  const [rail, setRail] = useState<'brain' | 'chat'>('brain');
  const [searchOpen, setSearchOpen] = useState(false);
  const [reveal, setReveal] = useState<{ line: number; nonce: number } | null>(null);

  const getProgram = useCallback(
    () => (doc ? bundlePythonProject(readAllFiles(doc), PROGRAM_FILE) : ''),
    [doc],
  );

  // A cheap signature of the whole project: changes whenever any file's text
  // does, which is what re-triggers analysis.
  const projectSignature = doc
    ? readAllFiles(doc).map((f) => `${f.path}:${f.contents.length}`).join('|')
    : '';
  const getAllFiles = useCallback(() => (doc ? readAllFiles(doc) : []), [doc]);
  const analysis = useAnalysis(getAllFiles, projectSignature);

  const programFileCount = countProgramFiles(paths.map((path) => ({ path, contents: '' })));
  const activePath = paths.includes(active) ? active : (paths[0] ?? PROGRAM_FILE);

  const openFile = useCallback((path: string) => {
    setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
    setActive(path);
  }, []);

  /** Opens a file and, when a line is given, scrolls to it. */
  const jumpTo = useCallback(
    (file: string, line?: number) => {
      openFile(file);
      if (line) setReveal({ line, nonce: Date.now() });
    },
    [openFile],
  );

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

  useEffect(() => {
    rememberRoom(roomId);
  }, [roomId]);

  // A room started from a repo clones it once, as soon as the document is up.
  const clonedRef = useRef(false);
  useEffect(() => {
    if (!repo || !doc || clonedRef.current) return;
    clonedRef.current = true;
    void fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open', roomId, cloneUrl: repo }),
    })
      .then((r) => r.json())
      .then((result) => {
        if (Array.isArray(result.files)) applyIncomingFiles(doc, result.files);
      })
      .catch(() => undefined);
  }, [repo, doc, roomId]);

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
        id: 'view.search',
        label: 'Search in all files',
        group: 'View',
        hint: '⌘⇧F',
        run: () => setSearchOpen(true),
      },
      {
        id: 'view.chat',
        label: rail === 'chat' ? 'Show the brain panel' : 'Ask Copilot about this code',
        group: 'View',
        run: () => setRail((r) => (r === 'chat' ? 'brain' : 'chat')),
      },
      {
        id: 'app.settings',
        label: 'Open settings',
        group: 'App',
        hint: '⌘,',
        run: () => setShowSettings(true),
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
  }, [paths, openFile, session, snapshot, showTerminal, isOpen, terminal, copilot, rail]);

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
      if (mod && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
      }
      // Cmd-, is the macOS convention for preferences.
      if (mod && event.key === ',') {
        event.preventDefault();
        setShowSettings(true);
      }
      // Everything is live-saved; stop the browser's save dialog.
      if (mod && event.key.toLowerCase() === 's') event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const problems =
    (problemsByPath[activePath] ?? 0) +
    analysis.warnings.filter((w) => w.file === activePath).length;

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
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
            className="flex items-center gap-1.5 rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge"
          >
            {/* A drawn icon, not the ⚙ emoji: at this size the glyph renders
                almost invisibly on some systems and nobody finds the button. */}
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.43.53.77.6H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
          <button
            type="button"
            onClick={() => {
              // A full navigation, so the socket and any open serial port are
              // closed by teardown rather than left dangling.
              window.location.href = '/';
            }}
            className="rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge"
          >
            Leave room
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
              <GitHubPanel doc={doc} roomId={roomId} />
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
                reveal={reveal}
                findings={analysis.warnings
                  .filter((w) => w.file === activePath)
                  .map((w) => ({ line: w.line, message: w.message, severity: w.severity }))}
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
              <TerminalPane
                terminal={terminal}
                output={output}
                isOpen={isOpen}
                series={series}
                onClear={clear}
                onJump={jumpTo}
              />
            </div>
          )}
        </main>

        <aside className="flex w-80 shrink-0 flex-col border-l border-edge bg-shell">
          <div className="flex shrink-0 gap-1 border-b border-edge bg-panel p-1">
            {(['brain', 'chat'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setRail(tab)}
                className={`flex-1 rounded-md px-2 py-1 text-[12px] font-medium capitalize transition ${
                  rail === tab ? 'bg-panel-raised shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-ink-dim hover:text-ink'
                }`}
              >
                {tab === 'brain' ? 'Brain' : 'Chat'}
              </button>
            ))}
          </div>

          <div className={`min-h-0 flex-1 ${rail === 'brain' ? '' : 'hidden'}`}>
          <BrainPanel
            session={session}
            snapshot={snapshot}
            getProgram={getProgram}
            programFileCount={programFileCount}
            declaredDevices={analysis.devices}
            findings={analysis.warnings}
            telemetry={series}
            onJump={jumpTo}
          />
          </div>

          {/* Kept mounted so the conversation survives switching tabs. */}
          <div className={`min-h-0 flex-1 ${rail === 'chat' ? '' : 'hidden'}`}>
            <ChatPanel
              getContext={() =>
                doc ? { path: activePath, contents: readFile(doc, activePath) } : null
              }
            />
          </div>
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
      <SearchPanel
        open={searchOpen}
        files={doc ? readAllFiles(doc) : []}
        onClose={() => setSearchOpen(false)}
        onJump={jumpTo}
      />
      <Settings open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
