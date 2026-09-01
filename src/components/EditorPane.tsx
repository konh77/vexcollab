/*
 * VEXCollab - the collaborative Monaco editor.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import type * as Y from 'yjs';
import type { CollabProvider } from '@/lib/collab/provider';
import { getFiles } from '@/lib/collab/project';
import { languageForPath } from '@/lib/vex/program';

interface Props {
  provider: CollabProvider;
  path: string;
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

export function EditorPane({ provider, path }: Props) {
  const bindingRef = useRef<MonacoBinding | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  useRemoteCursorStyles(provider);

  const bind = (editor: MonacoEditor.IStandaloneCodeEditor) => {
    bindingRef.current?.destroy();
    bindingRef.current = null;

    const model = editor.getModel();
    const text = getFiles(provider.doc).get(path) as Y.Text | undefined;
    if (!model || !text) return;

    bindingRef.current = new MonacoBinding(
      text,
      model,
      new Set([editor]),
      provider.awareness,
    );
  };

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monaco.editor.defineTheme('vexcollab', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#11151f',
        'editorGutter.background': '#11151f',
        'editorLineNumber.foreground': '#4c556b',
        'editor.lineHighlightBackground': '#171c28',
      },
    });
    monaco.editor.setTheme('vexcollab');
    bind(editor);
  };

  // Switching tabs swaps the model, so the binding has to be rebuilt.
  useEffect(() => {
    if (editorRef.current) bind(editorRef.current);
    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, provider]);

  return (
    <Editor
      height="100%"
      theme="vs-dark"
      path={path}
      language={languageForPath(path)}
      onMount={handleMount}
      options={{
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: 4,
        renderWhitespace: 'selection',
        automaticLayout: true,
        padding: { top: 12 },
      }}
      loading={<div className="p-4 text-sm text-ink-dim">Loading editor…</div>}
    />
  );
}
