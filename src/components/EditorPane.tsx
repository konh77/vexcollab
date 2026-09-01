/*
 * VEXCollab - the collaborative Monaco editor.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import type * as Y from 'yjs';
import type { CollabProvider } from '@/lib/collab/provider';
import { getFiles } from '@/lib/collab/project';
import { registerVexPython } from '@/lib/editor/vex-language';
import { languageForPath } from '@/lib/vex/program';

export interface Problem {
  line: number;
  column: number;
  message: string;
}

interface Props {
  provider: CollabProvider;
  path: string;
  onCursorChange?: (position: { line: number; column: number }) => void;
  onProblemsChange?: (problems: Problem[]) => void;
  onEditorReady?: (editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => void;
}

/**
 * Paints each collaborator's cursor in their own colour. y-monaco only emits
 * `yRemoteSelection-<clientID>` class names, so the colours have to be written
 * into a stylesheet as people come and go.
 */
function useRemoteCursorStyles(provider: CollabProvider) {
  useEffect(() => {
    const style = document.createElement('style');
    document.head.append(style);

    const render = () => {
      const rules: string[] = [];
      provider.awareness.getStates().forEach((state, clientId) => {
        if (clientId === provider.doc.clientID) return;
        const user = (state as { user?: { name: string; color: string } }).user;
        if (!user) return;
        const safeName = user.name.replace(/["\\]/g, '');
        rules.push(
          `.yRemoteSelection-${clientId}{background-color:${user.color}40;}`,
          `.yRemoteSelectionHead-${clientId}{border-color:${user.color};}`,
          `.yRemoteSelectionHead-${clientId}::after{content:"${safeName}";background-color:${user.color};}`,
        );
      });
      style.textContent = rules.join('\n');
    };

    render();
    provider.awareness.on('change', render);
    return () => {
      provider.awareness.off('change', render);
      style.remove();
    };
  }, [provider]);
}

export function EditorPane({
  provider,
  path,
  onCursorChange,
  onProblemsChange,
  onEditorReady,
}: Props) {
  const bindingRef = useRef<MonacoBinding | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  // Monaco loads asynchronously. Refs do not re-trigger effects, so mounting
  // has to flip real state or the language features below never attach.
  const [ready, setReady] = useState(false);

  useRemoteCursorStyles(provider);

  const bind = (editor: MonacoEditor.IStandaloneCodeEditor) => {
    bindingRef.current?.destroy();
    bindingRef.current = null;

    const model = editor.getModel();
    const text = getFiles(provider.doc).get(path) as Y.Text | undefined;
    if (!model || !text) return;

    bindingRef.current = new MonacoBinding(text, model, new Set([editor]), provider.awareness);
  };

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Xcode's light palette: the most Apple-native syntax colouring there is.
    monaco.editor.defineTheme('vexcollab', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '707F8C' },
        { token: 'keyword', foreground: 'AD3DA4' },
        { token: 'string', foreground: 'D12F1B' },
        { token: 'number', foreground: '272AD8' },
        { token: 'type', foreground: '3900A0' },
        { token: 'type.identifier', foreground: '3900A0' },
        { token: 'identifier', foreground: '1D1D1F' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editorGutter.background': '#ffffff',
        'editorLineNumber.foreground': '#b8b8bf',
        'editorLineNumber.activeForeground': '#6e6e73',
        'editor.lineHighlightBackground': '#f5f5f7',
        'editor.selectionBackground': '#b3d7ff',
        'editorIndentGuide.background1': '#eeeef0',
      },
    });
    monaco.editor.setTheme('vexcollab');

    editor.onDidChangeCursorPosition((event) =>
      onCursorChange?.({ line: event.position.lineNumber, column: event.position.column }),
    );

    bind(editor);
    onEditorReady?.(editor, monaco);
    setReady(true);
  };

  // Language intelligence is global to Monaco, not per-editor, so it is
  // registered once and disposed when this pane goes away.
  useEffect(() => {
    if (!ready || !monacoRef.current) return;
    return registerVexPython(monacoRef.current);
  }, [ready]);

  // Switching tabs swaps the model, so the binding has to be rebuilt.
  useEffect(() => {
    if (editorRef.current) bind(editorRef.current);
    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, provider, ready]);

  // Debounced syntax check, rendered as squiggles.
  useEffect(() => {
    if (!ready) return;
    if (!path.endsWith('.py')) {
      onProblemsChange?.([]);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const check = async () => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const model = editor?.getModel();
      if (!editor || !monaco || !model) return;
      try {
        const response = await fetch('/api/lint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: model.getValue() }),
        });
        const { problems = [] } = (await response.json()) as { problems: Problem[] };
        if (cancelled) return;
        monaco.editor.setModelMarkers(
          model,
          'vexcollab',
          problems.map((p) => ({
            severity: monaco.MarkerSeverity.Error,
            message: p.message,
            startLineNumber: p.line,
            startColumn: p.column,
            endLineNumber: p.line,
            endColumn: p.column + 1,
          })),
        );
        onProblemsChange?.(problems);
      } catch {
        // Linting is a convenience; a failed check must not break editing.
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(check, 600);
    };

    const model = editorRef.current?.getModel();
    const listener = model?.onDidChangeContent(schedule);
    schedule();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      listener?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ready]);

  return (
    <Editor
      height="100%"
      theme="light"
      path={path}
      language={languageForPath(path)}
      onMount={handleMount}
      options={{
        fontSize: 13,
        fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
        fontLigatures: true,
        minimap: { enabled: true, renderCharacters: false, maxColumn: 80 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorSmoothCaretAnimation: 'on',
        cursorBlinking: 'smooth',
        tabSize: 4,
        insertSpaces: true,
        renderWhitespace: 'selection',
        automaticLayout: true,
        padding: { top: 12 },
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        stickyScroll: { enabled: true },
        suggestOnTriggerCharacters: true,
        quickSuggestions: { other: true, comments: false, strings: false },
        acceptSuggestionOnEnter: 'on',
        tabCompletion: 'on',
        wordBasedSuggestions: 'currentDocument',
        formatOnPaste: true,
        linkedEditing: true,
        occurrencesHighlight: 'singleFile',
        renderLineHighlight: 'line',
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
      loading={<div className="p-4 text-sm text-ink-dim">Loading editor…</div>}
    />
  );
}
