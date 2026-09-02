/*
 * VEXCollab - editor colour schemes and typefaces.
 * Licensed under AGPL-3.0-only.
 *
 * Themes are defined here rather than pulled from a theme package so they can
 * be tuned against the app's own tokens — an editor that does not match the
 * chrome around it looks broken, however nice the colours are on their own.
 */
import type { Monaco } from '@monaco-editor/react';

export interface EditorTheme {
  id: string;
  name: string;
  /** Which app appearance it belongs with, or both. */
  appearance: 'light' | 'dark';
}

export const EDITOR_THEMES: EditorTheme[] = [
  { id: 'vexcollab', name: 'Xcode Light', appearance: 'light' },
  { id: 'vexcollab-paper', name: 'Paper', appearance: 'light' },
  { id: 'vexcollab-github', name: 'GitHub Light', appearance: 'light' },
  { id: 'vexcollab-dark', name: 'Xcode Dark', appearance: 'dark' },
  { id: 'vexcollab-midnight', name: 'Midnight', appearance: 'dark' },
  { id: 'vexcollab-forest', name: 'Forest', appearance: 'dark' },
];

export interface FontChoice {
  id: string;
  name: string;
  stack: string;
}

/**
 * System faces only. A webfont would mean the editor waits on the network to
 * render text, which is the wrong trade for a tool used in a pit with bad Wi-Fi.
 */
export const EDITOR_FONTS: FontChoice[] = [
  { id: 'system', name: 'System mono', stack: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace" },
  { id: 'menlo', name: 'Menlo', stack: "Menlo, Monaco, 'Courier New', monospace" },
  { id: 'monaco', name: 'Monaco', stack: "Monaco, Menlo, monospace" },
  { id: 'jetbrains', name: 'JetBrains Mono', stack: "'JetBrains Mono', ui-monospace, Menlo, monospace" },
  { id: 'fira', name: 'Fira Code', stack: "'Fira Code', ui-monospace, Menlo, monospace" },
  { id: 'plex', name: 'IBM Plex Mono', stack: "'IBM Plex Mono', ui-monospace, Menlo, monospace" },
  { id: 'cascadia', name: 'Cascadia Code', stack: "'Cascadia Code', Consolas, ui-monospace, monospace" },
  { id: 'courier', name: 'Courier', stack: "'Courier New', Courier, monospace" },
];

export function fontStack(id: string): string {
  return (EDITOR_FONTS.find((f) => f.id === id) ?? EDITOR_FONTS[0]).stack;
}

/** Picks a sensible theme when the user has chosen "match the app". */
export function autoTheme(appearance: 'light' | 'dark'): string {
  return appearance === 'dark' ? 'vexcollab-dark' : 'vexcollab';
}

type Rule = { token: string; foreground: string; fontStyle?: string };

function theme(
  base: 'vs' | 'vs-dark',
  rules: Rule[],
  colors: Record<string, string>,
): Parameters<Monaco['editor']['defineTheme']>[1] {
  return { base, inherit: true, rules, colors };
}

/** Registers every theme once; Monaco keeps them globally by name. */
export function registerThemes(monaco: Monaco) {
  monaco.editor.defineTheme(
    'vexcollab',
    theme(
      'vs',
      [
        { token: 'comment', foreground: '707F8C' },
        { token: 'keyword', foreground: 'AD3DA4' },
        { token: 'string', foreground: 'D12F1B' },
        { token: 'number', foreground: '272AD8' },
        { token: 'type', foreground: '3900A0' },
        { token: 'type.identifier', foreground: '3900A0' },
        { token: 'identifier', foreground: '1D1D1F' },
      ],
      {
        'editor.background': '#ffffff',
        'editorGutter.background': '#ffffff',
        'editorLineNumber.foreground': '#b8b8bf',
        'editorLineNumber.activeForeground': '#6e6e73',
        'editor.lineHighlightBackground': '#f5f5f7',
        'editor.selectionBackground': '#b3d7ff',
        'editorIndentGuide.background1': '#eeeef0',
      },
    ),
  );

  monaco.editor.defineTheme(
    'vexcollab-paper',
    theme(
      'vs',
      [
        { token: 'comment', foreground: '9A8F80', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'A6423A' },
        { token: 'string', foreground: '5E7A3E' },
        { token: 'number', foreground: '9A6E3A' },
        { token: 'type', foreground: '3C6E8F' },
        { token: 'identifier', foreground: '3B342C' },
      ],
      {
        'editor.background': '#faf7f2',
        'editorGutter.background': '#faf7f2',
        'editorLineNumber.foreground': '#c8bfb2',
        'editor.lineHighlightBackground': '#f2ede4',
        'editor.selectionBackground': '#e3d9c6',
      },
    ),
  );

  monaco.editor.defineTheme(
    'vexcollab-github',
    theme(
      'vs',
      [
        { token: 'comment', foreground: '6A737D' },
        { token: 'keyword', foreground: 'D73A49' },
        { token: 'string', foreground: '032F62' },
        { token: 'number', foreground: '005CC5' },
        { token: 'type', foreground: '6F42C1' },
        { token: 'identifier', foreground: '24292E' },
      ],
      {
        'editor.background': '#ffffff',
        'editorGutter.background': '#ffffff',
        'editorLineNumber.foreground': '#c6cbd1',
        'editor.lineHighlightBackground': '#f6f8fa',
        'editor.selectionBackground': '#c8e1ff',
      },
    ),
  );

  monaco.editor.defineTheme(
    'vexcollab-dark',
    theme(
      'vs-dark',
      [
        { token: 'comment', foreground: '7F8C98' },
        { token: 'keyword', foreground: 'FF7AB2' },
        { token: 'string', foreground: 'FF8170' },
        { token: 'number', foreground: 'D9C97C' },
        { token: 'type', foreground: 'DABAFF' },
        { token: 'type.identifier', foreground: 'DABAFF' },
        { token: 'identifier', foreground: 'F2F2F7' },
      ],
      {
        'editor.background': '#1c1c1e',
        'editorGutter.background': '#1c1c1e',
        'editorLineNumber.foreground': '#48484a',
        'editorLineNumber.activeForeground': '#8e8e93',
        'editor.lineHighlightBackground': '#242426',
        'editor.selectionBackground': '#2f5d8c',
      },
    ),
  );

  monaco.editor.defineTheme(
    'vexcollab-midnight',
    theme(
      'vs-dark',
      [
        { token: 'comment', foreground: '5C6773', fontStyle: 'italic' },
        { token: 'keyword', foreground: '82AAFF' },
        { token: 'string', foreground: 'C3E88D' },
        { token: 'number', foreground: 'F78C6C' },
        { token: 'type', foreground: 'FFCB6B' },
        { token: 'identifier', foreground: 'D6DEEB' },
      ],
      {
        'editor.background': '#0f1420',
        'editorGutter.background': '#0f1420',
        'editorLineNumber.foreground': '#3b4457',
        'editor.lineHighlightBackground': '#182032',
        'editor.selectionBackground': '#2a3f66',
      },
    ),
  );

  monaco.editor.defineTheme(
    'vexcollab-forest',
    theme(
      'vs-dark',
      [
        { token: 'comment', foreground: '5F7A62', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'E39A5C' },
        { token: 'string', foreground: 'A3C293' },
        { token: 'number', foreground: 'D6B86A' },
        { token: 'type', foreground: '8FBCBB' },
        { token: 'identifier', foreground: 'E4E9E3' },
      ],
      {
        'editor.background': '#16211a',
        'editorGutter.background': '#16211a',
        'editorLineNumber.foreground': '#3e5244',
        'editor.lineHighlightBackground': '#1e2d23',
        'editor.selectionBackground': '#2f4a38',
      },
    ),
  );
}
