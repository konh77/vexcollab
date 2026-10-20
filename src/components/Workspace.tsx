/*
 * VEXCollab - room shell: files, editor, brain, terminal.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useCollab } from '@/lib/collab/useCollab';
import { rememberRoom } from '@/lib/collab/recent';
import { applyIncomingFiles, insertDeclaration, readAllFiles, readFile } from '@/lib/collab/project';
import { useAnalysis } from '@/lib/editor/useAnalysis';
import { bundlePythonProject, countProgramFiles } from '@/lib/vex/program';
import { entryAtCursor, resolveSnippet } from '@/lib/vex/help';
import { useV5Session, useV5Terminal } from '@/lib/vex/useV5';
import { BrainPanel } from './BrainPanel';
import { ChatPanel } from './ChatPanel';
import { CommandPalette, type Command } from './CommandPalette';
import { SearchPanel } from './SearchPanel';
import { Settings } from './Settings';
import { EditorTabs } from './EditorTabs';
import { FileSidebar } from './FileSidebar';
import { GitHubPanel } from './GitHubPanel';
import { HelpPanel } from './HelpPanel';
import { PasscodeGate } from './PasscodeGate';
import { MarkdownPreview } from './MarkdownPreview';
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
  const { provider, doc, connected, peers, paths, error, passcode, pinned, messages, selfId } = useCollab(roomId, template);
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
  // Markdown files open as a rendered page; Edit switches to the source.
  const [markdownView, setMarkdownView] = useState<'preview' | 'edit'>('preview');
  const [rail, setRail] = useState<'brain' | 'help' | 'chat'>('brain');
  // Below 1024px there is room for one thing at a time, so this says which. On a
  // desktop every pane is visible regardless and this only picks the right rail.
  const [pane, setPane] = useState<'files' | 'code' | 'output' | 'brain' | 'help' | 'chat'>('code');
  // The live editor, so the Help box can put code into it. Null while a rendered
  // Markdown page is showing, since there is no editor then.
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  // A ref changing does not re-render, so the Help box's "can I insert" would
  // stay false until something else did. This makes the editor arriving a render.
  const [, setEditorArrived] = useState(0);
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
  const isMarkdown = /\.(md|markdown)$/i.test(activePath);
  const showPreview = isMarkdown && markdownView === 'preview';

  const openFile = useCallback((path: string) => {
    setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
    setActive(path);
    // Picking a file from the file list, a search hit or a traceback means "show
    // me that" -- on a phone that is the editor, not the list it was chosen from.
    setPane((current) => (current === 'files' || current === 'output' ? 'code' : current));
  }, []);

  /** Opens a file and, when a line is given, scrolls to it. */
  const jumpTo = useCallback(
    (file: string, line?: number) => {
      openFile(file);
      if (line) setReveal({ line, nonce: Date.now() });
    },
    [openFile],
  );

  /**
   * Writes a device declaration from the port map into the project. It joins
   * the other declarations wherever they already live, rather than always
   * landing in main.py — a project that keeps its hardware in robot_config.py
   * should stay that way.
   */
  const assignDevice = useCallback(
    (declaration: string) => {
      if (!doc) return;
      const withDevices = analysis.devices.at(-1)?.file;
      // Falls back through main.py to any Python file at all, so a room whose
      // main.py was renamed or deleted still gets the declaration somewhere
      // instead of silently dropping it.
      const target =
        (withDevices && paths.includes(withDevices) ? withDevices : null) ??
        (paths.includes(PROGRAM_FILE) ? PROGRAM_FILE : null) ??
        paths.find((path) => path.endsWith('.py'));
      if (!target) return;

      // A 3-wire device hangs off the Brain object, so its line only works if
      // the project has one — under whatever name it was given.
      let text = declaration;
      if (declaration.includes('.three_wire_port.')) {
        const owner = readAllFiles(doc)
          .map((file) => /^([A-Za-z_]\w*)\s*=\s*Brain\s*\(/m.exec(file.contents)?.[1])
          .find(Boolean);
        if (owner) text = declaration.replace('brain.three_wire_port', `${owner}.three_wire_port`);
        else insertDeclaration(doc, target, 'brain = Brain()');
      }

      const line = insertDeclaration(doc, target, text);
      if (line != null) jumpTo(target, line);
    },
    [doc, analysis.devices, paths, jumpTo],
  );

  /**
   * Puts text from the Help box into the editor. A snippet goes in through
   * Monaco's own snippet controller so its tab stops work; a block (a whole
   * recipe) goes on a new line below the cursor so it never splits one. Returns
   * whether anything went in, so the button can say so.
   */
  const insertIntoEditor = useCallback(
    (text: string, kind: 'snippet' | 'text' | 'block') => {
      const editor = editorRef.current;
      if (!editor || showPreview) return false;
      try {
        editor.focus();
        if (kind === 'snippet') {
          const snippets = editor.getContribution('snippetController2') as
            | { insert?: (snippet: string) => void }
            | null;
          if (snippets?.insert) {
            snippets.insert(text);
            setPane((current) => (current === 'help' ? 'code' : current));
            return true;
          }
          text = resolveSnippet(text);
        }
        if (kind === 'block') {
          const model = editor.getModel();
          const position = editor.getPosition();
          if (!model || !position) return false;
          const column = model.getLineMaxColumn(position.lineNumber);
          editor.executeEdits('vexcollab-help', [
            {
              range: {
                startLineNumber: position.lineNumber,
                startColumn: column,
                endLineNumber: position.lineNumber,
                endColumn: column,
              },
              text: `\n${text}\n`,
              forceMoveMarkers: true,
            },
          ]);
        } else {
          const selection = editor.getSelection();
          if (!selection) return false;
          editor.executeEdits('vexcollab-help', [{ range: selection, text, forceMoveMarkers: true }]);
        }
        setPane((current) => (current === 'help' ? 'code' : current));
        return true;
      } catch {
        return false; // the editor was torn down between the click and here
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showPreview],
  );

  /** The documented call the cursor is on, for the Help box to offer. */
  const helpAtCursor = useMemo(() => {
    if (!activePath.endsWith('.py') || showPreview) return null;
    const model = editorRef.current?.getModel();
    if (!model || cursor.line > model.getLineCount()) return null;
    return entryAtCursor(model.getLineContent(cursor.line), cursor.column, analysis.devices);
  }, [cursor, activePath, showPreview, analysis.devices]);

  // --- unread chat ------------------------------------------------------------
  // "Seen" means the chat was actually on screen: its tab chosen, and -- below
  // 1024px, where only one pane shows -- the Chat screen up as well.
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const chatVisible = rail === 'chat' && (desktop || pane === 'chat');
  const lastMessageId = messages.at(-1)?.id ?? 0;
  const [seenThrough, setSeenThrough] = useState<number | null>(null);

  useEffect(() => {
    // The first look at a room is not "unread": history that was already there
    // when you arrived is not news.
    if (selfId === null) return;
    if (seenThrough === null || chatVisible) setSeenThrough(lastMessageId);
  }, [selfId, chatVisible, lastMessageId, seenThrough]);

  const unread =
    seenThrough === null
      ? 0
      : messages.filter((message) => message.id > seenThrough && message.senderId !== selfId).length;

  /**
   * Show or hide the terminal. Beside the editor on a desktop that is a toggle;
   * below 1024px it is its own screen, so "show it" means go there.
   */
  const toggleTerminal = useCallback(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setShowTerminal((value) => !value);
    } else {
      setPane((current) => (current === 'output' ? 'code' : 'output'));
    }
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

    // Deliberately no upload or run here: these need their full controls, and a command
    // palette is one keystroke away from an accident.
    const actions: Command[] = [
      {
        id: 'brain.connect',
        label: snapshot.connectionState === 'connected' ? 'Disconnect brain' : 'Connect brain over USB',
        group: 'Brain',
        disabled: Boolean(snapshot.transfer) || snapshot.connectionState === 'connecting',
        run: () =>
          snapshot.transfer ? undefined : snapshot.connectionState === 'connected' ? void session.disconnect() : void session.connect(),
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
        run: toggleTerminal,
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
        id: 'view.help',
        label: 'Open the help and cheat sheets',
        group: 'View',
        hint: '⌘/',
        run: () => {
          setRail('help');
          setPane('help');
        },
      },
      {
        id: 'view.chat',
        label: rail === 'chat' ? 'Show the brain panel' : 'Open the team chat',
        group: 'View',
        run: () => {
          const next = rail === 'chat' ? 'brain' : 'chat';
          setRail(next);
          setPane(next);
        },
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
        toggleTerminal();
      }
      // Cmd-/ opens the Help box, or closes it again.
      if (mod && event.key === '/') {
        event.preventDefault();
        setRail((current) => (current === 'help' ? 'brain' : 'help'));
        setPane((current) => (current === 'help' ? 'code' : 'help'));
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
    <div className="flex h-dvh flex-col">
      <header className="vc-vibrancy z-10 flex items-center gap-2 border-b border-edge px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4">
        <a href="/" className="text-sm font-semibold">
          VEX<span className="text-vex">Collab</span>
        </a>

        <button
          type="button"
          onClick={copyLink}
          title="Copy the room link"
          className="max-w-[34vw] truncate rounded-md bg-panel px-2.5 py-1 font-mono text-[11px] text-ink-dim transition hover:text-ink sm:max-w-none"
        >
          {copied ? 'link copied' : roomId}
        </button>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="rounded-md bg-panel px-2.5 py-1 text-[11px] text-ink-dim transition hover:text-ink"
        >
          <span className="hidden lg:inline">Search or run a command  ⌘K</span>
          <span className="lg:hidden">Search</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden -space-x-1.5 sm:flex">
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
          <span className="hidden text-xs text-ink-dim sm:inline">{connected ? `${peers.length} here` : 'offline'}</span>
          <button
            type="button"
            onClick={() => setShowTerminal((value) => !value)}
            className="hidden rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge lg:inline-flex"
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
            <span className="hidden sm:inline">Settings</span>
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
            <span className="hidden sm:inline">Leave room</span>
            <span className="sm:hidden">Leave</span>
          </button>
        </div>
      </header>

      {error && !passcode && (
        <div role="alert" className="shrink-0 border-b border-edge bg-vex/10 px-3 py-1.5 text-xs text-vex">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${
            pane === 'files' ? 'flex w-full' : 'hidden'
          } shrink-0 flex-col border-r border-edge bg-panel md:flex md:w-48`}
        >
          {doc && (
            <>
              <div className="min-h-0 flex-1">
                <FileSidebar
                  doc={doc}
                  paths={paths}
                  active={activePath}
                  onSelect={openFile}
                  onMoved={(from, to) => {
                    // A moved file keeps its tab: follow it to the new path
                    // instead of letting the tab vanish and focus jump.
                    setOpenTabs((tabs) => tabs.map((tab) => (tab === from ? to : tab)));
                    setActive((current) => (current === from ? to : current));
                  }}
                />
              </div>
              {/* A pinned room commits itself to its repository, so a place to paste
                  a personal token here would only be a second, worse way to do it. */}
              {!pinned && <GitHubPanel doc={doc} roomId={roomId} />}
            </>
          )}
        </aside>

        <main
          className={`${
            pane === 'code' || pane === 'output'
              ? 'flex'
              : pane === 'files'
                ? 'hidden md:flex'
                : 'hidden lg:flex'
          } min-w-0 flex-1 flex-col`}
        >
          <EditorTabs
            open={openTabs.filter((t) => paths.includes(t))}
            active={activePath}
            problemsByPath={problemsByPath}
            onSelect={setActive}
            onClose={closeTab}
          />

          {isMarkdown && (
            <div className="flex shrink-0 items-center gap-1 border-b border-edge bg-panel px-2 py-1">
              <span className="mr-auto text-[11px] text-ink-dim">Markdown</span>
              {(['preview', 'edit'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={markdownView === view}
                  onClick={() => setMarkdownView(view)}
                  className={`rounded-md px-2.5 py-0.5 text-[11px] font-medium capitalize transition ${
                    markdownView === view
                      ? 'bg-panel-raised shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                      : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  {view === 'preview' ? 'Preview' : 'Edit'}
                </button>
              ))}
            </div>
          )}

          <div className={`min-h-0 flex-1 ${pane === 'output' ? 'hidden lg:block' : ''}`}>
            {showPreview && doc ? (
              <MarkdownPreview doc={doc} path={activePath} paths={paths} onOpenFile={openFile} />
            ) : provider ? (
              <EditorPane
                provider={provider}
                path={activePath}
                reveal={reveal}
                findings={analysis.warnings
                  .filter((w) => w.file === activePath)
                  .map((w) => ({ line: w.line, message: w.message, severity: w.severity }))}
                onCursorChange={setCursor}
                onEditorReady={(editor) => {
                  editorRef.current = editor;
                  setEditorArrived((count) => count + 1);
                }}
                onProblemsChange={(list: Problem[]) =>
                  setProblemsByPath((prev) => ({ ...prev, [activePath]: list.length }))
                }
              />
            ) : (
              <div className="p-4 text-sm text-ink-dim">Joining room…</div>
            )}
          </div>

          {/* Beside the editor on a desktop; its own screen below 1024px. */}
          <div
            className={`${
              pane === 'output' ? 'min-h-0 flex-1' : 'hidden'
            } border-t border-edge lg:h-56 lg:flex-none lg:shrink-0 ${
              showTerminal ? 'lg:block' : 'lg:hidden'
            }`}
          >
            <TerminalPane
              terminal={terminal}
              output={output}
              isOpen={isOpen}
              series={series}
              onClear={clear}
              onJump={jumpTo}
            />
          </div>
        </main>

        <aside
          className={`${
            pane === 'brain' || pane === 'help' || pane === 'chat' ? 'flex min-w-0 flex-1' : 'hidden'
          } flex-col border-l border-edge bg-shell lg:flex lg:w-80 lg:flex-none lg:shrink-0`}
        >
          <div className="hidden shrink-0 gap-1 border-b border-edge bg-panel p-1 lg:flex">
            {(['brain', 'help', 'chat'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setRail(tab)}
                className={`flex-1 rounded-md px-2 py-1 text-[12px] font-medium capitalize transition ${
                  rail === tab ? 'bg-panel-raised shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-ink-dim hover:text-ink'
                }`}
              >
                {tab === 'brain' ? 'Brain' : tab === 'help' ? 'Help' : 'Chat'}
                {tab === 'chat' && unread > 0 && (
                  <span className="ml-1.5 rounded-full bg-vex px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
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
            onJump={jumpTo}
            onAssignDevice={doc ? assignDevice : undefined}
          />
          </div>

          <div className={`min-h-0 flex-1 ${rail === 'help' ? '' : 'hidden'}`}>
            <HelpPanel
              declared={analysis.devices}
              atCursor={helpAtCursor}
              canInsert={Boolean(editorRef.current) && !showPreview}
              onInsert={insertIntoEditor}
            />
          </div>

          {/* Kept mounted so the conversation survives switching tabs. */}
          <div className={`min-h-0 flex-1 ${rail === 'chat' ? '' : 'hidden'}`}>
            <ChatPanel
              messages={messages}
              selfId={selfId}
              connected={connected}
              people={peers.length}
              kept={Boolean(pinned)}
              onSend={(text) => (provider ? provider.sendChat(text) : Promise.resolve('Not connected yet.'))}
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
        pinned={pinned}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      {/* Below 1024px only one pane fits, so this is how you move between them. */}
      <nav
        aria-label="Sections"
        className="flex shrink-0 border-t border-edge bg-panel pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {(
          [
            { id: 'files', label: 'Files', phoneOnly: true },
            { id: 'code', label: 'Code' },
            { id: 'output', label: 'Output' },
            { id: 'brain', label: 'Brain' },
            { id: 'help', label: 'Help' },
            { id: 'chat', label: 'Chat' },
          ] as const
        ).map((item) => {
          // On a tablet the file list is always beside the editor, so "Files"
          // would just be a second way to reach what is already on screen.
          const current = pane === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={current ? 'page' : undefined}
              onClick={() => {
                setPane(item.id);
                if (item.id === 'brain' || item.id === 'help' || item.id === 'chat') setRail(item.id);
              }}
              className={`min-h-12 flex-1 px-1 text-[12px] font-medium transition ${
                'phoneOnly' in item && item.phoneOnly ? 'md:hidden' : ''
              } ${current ? 'text-vex' : 'text-ink-dim'} ${
                // Files-as-a-screen only exists on a phone; on a tablet that
                // state is simply the editor beside the file list.
                item.id === 'code' && pane === 'files' ? 'md:text-vex' : ''
              }`}
            >
              {item.label}
              {item.id === 'chat' && unread > 0 && (
                <span className="ml-1 rounded-full bg-vex px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {passcode && provider && (
        <PasscodeGate
          reason={passcode}
          roomId={roomId}
          onSubmit={(attempt) => provider.submitPasscode(attempt)}
        />
      )}

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      <SearchPanel
        open={searchOpen}
        files={doc ? readAllFiles(doc) : []}
        onClose={() => setSearchOpen(false)}
        onJump={jumpTo}
      />
      <Settings
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onIdentityChange={(identity) => provider?.setUser(identity)}
      />
    </div>
  );
}
