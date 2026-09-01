/*
 * VEXCollab - the V5 user serial console.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import type { V5Terminal } from '@/lib/vex/terminal';

interface Props {
  terminal: V5Terminal;
  output: string;
  isOpen: boolean;
  onClear: () => void;
}

export function TerminalPane({ terminal, output, isOpen, onClear }: Props) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLPreElement>(null);
  const pinnedToBottom = useRef(true);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && pinnedToBottom.current) element.scrollTop = element.scrollHeight;
  }, [output]);

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-dim">Terminal</span>
        <span className={`size-1.5 rounded-full ${isOpen ? 'bg-ok' : 'bg-ink-dim'}`} aria-hidden />
        <button
          type="button"
          onClick={() => (isOpen ? terminal.close() : terminal.open())}
          className="ml-auto rounded border border-edge px-2 py-0.5 text-xs transition hover:border-ink-dim"
        >
          {isOpen ? 'Close port' : 'Open user port'}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-edge px-2 py-0.5 text-xs transition hover:border-ink-dim"
        >
          Clear
        </button>
      </div>

      <pre
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="vc-scroll flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-ink"
      >
        {output ||
          (isOpen
            ? 'Listening. Anything your program prints shows up here.\n'
            : 'Open the user port to see program output.\n')}
      </pre>

      <form
        className="flex gap-2 border-t border-edge px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isOpen || !input) return;
          void terminal.write(`${input}\n`);
          setInput('');
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={!isOpen}
          placeholder={isOpen ? 'Send to the program…' : 'Port closed'}
          aria-label="Terminal input"
          className="min-w-0 flex-1 rounded border border-edge bg-panel-raised px-2 py-1 font-mono text-xs outline-none placeholder:text-ink-dim focus:border-vex disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isOpen}
          className="rounded border border-edge px-3 py-1 text-xs transition hover:border-ink-dim disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
