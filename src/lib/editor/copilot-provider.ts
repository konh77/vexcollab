/*
 * VEXCollab - Copilot ghost text in Monaco.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import type { Monaco } from '@monaco-editor/react';

export function registerCopilot(
  monaco: Monaco,
  onBusy: (busy: boolean) => void,
): () => void {
  const provider = monaco.languages.registerInlineCompletionsProvider('python', {
    async provideInlineCompletions(model, position, _context, token) {
      onBusy(true);
      try {
        const response = await fetch('/api/copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete',
            uri: model.uri.toString(),
            text: model.getValue(),
            // LSP is 0-based; Monaco is 1-based.
            line: position.lineNumber - 1,
            character: position.column - 1,
          }),
        });
        if (token.isCancellationRequested) return { items: [] };
        const { items = [] } = (await response.json()) as {
          items: {
            insertText: string;
            range?: {
              start: { line: number; character: number };
              end: { line: number; character: number };
            };
          }[];
        };

        return {
          items: items.map((item) => ({
            insertText: item.insertText,
            range: item.range
              ? new monaco.Range(
                  item.range.start.line + 1,
                  item.range.start.character + 1,
                  item.range.end.line + 1,
                  item.range.end.character + 1,
                )
              : undefined,
          })),
        };
      } catch {
        return { items: [] };
      } finally {
        onBusy(false);
      }
    },
    freeInlineCompletions() {
      // Nothing retained per suggestion.
    },
  });

  return () => provider.dispose();
}
