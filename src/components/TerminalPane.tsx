/*
 * VEXCollab - the V5 user serial console.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { sparkline, type Series } from '@/lib/vex/telemetry';
import { isExceptionLine, isTracebackHeader, parseFrame } from '@/lib/vex/traceback';
import type { V5Terminal } from '@/lib/vex/terminal';

interface Props {
  terminal: V5Terminal;
  output: string;
  isOpen: boolean;
  series: Map<string, Series>;
  onClear: () => void;
  /** Jump to a frame's file and line. */
  onJump: (file: string, line: number) => void;
}

function TelemetryStrip({ series }: { series: Map<string, Series> }) {
  const items = [...series.values()].slice(0, 6);
  if (items.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto border-b border-edge px-3 py-2">
      {items.map((s) => (
        <div key={s.name} className="min-w-[104px] shrink-0 rounded-lg bg-panel px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[10px] text-ink-dim">{s.name}</span>
            <span className="font-mono text-[11px] font-medium">{s.last}</span>
          </div>
          <svg viewBox="0 0 96 20" width="96" height="20" className="mt-0.5 text-vex" aria-hidden>
            <path d={sparkline(s, 96, 20)} fill="none" stroke="currentColor" strokeWidth="1.25" />
          </svg>
        </div>
      ))}
    </div>
  );
}

export function TerminalPane({ terminal, output, isOpen, series, onClear, onJump }: Props) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Only the tail is rendered as elements; the rest would be thousands of nodes.
  const lines = useMemo(() => output.split('\n').slice(-500), [output]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && pinnedToBottom.current) element.scrollTop = element.scrollHeight;
  }, [output]);

  return (
    <div className="flex h-full flex-col bg-shell">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-dim">Terminal</span>
        <span className={`size-1.5 rounded-full ${isOpen ? 'bg-ok' : 'bg-ink-dim'}`} aria-hidden />
        {series.size > 0 && (
          <span className="text-[10px] text-ink-dim">{series.size} tracked</span>
        )}
        <button
          type="button"
          onClick={() => (isOpen ? terminal.close() : terminal.open())}
          className="ml-auto rounded-md border border-edge bg-panel-raised px-2.5 py-1 text-[11.5px] transition hover:bg-panel"
        >
          {isOpen ? 'Close port' : 'Open user port'}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-edge bg-panel-raised px-2.5 py-1 text-[11.5px] transition hover:bg-panel"
        >
          Clear
        </button>
      </div>

      <TelemetryStrip series={series} />

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="vc-scroll flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {output === '' ? (
          <span className="text-ink-dim">
            {isOpen
              ? 'Listening. Anything your program prints shows up here.'
              : 'Open the user port to see program output.'}
          </span>
        ) : (
          lines.map((line, index) => {
            const frame = parseFrame(line);
            if (frame) {
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onJump(frame.file, frame.line)}
                  className="block w-full truncate text-left text-vex transition hover:underline"
                  title="Jump to this line"
                >
                  {line}
                </button>
              );
            }
            const isError = isExceptionLine(line) || isTracebackHeader(line);
            return (
              <div
                key={index}
                className={isError ? 'font-medium text-vex' : undefined}
              >
                {line || ' '}
              </div>
            );
          })
        )}
      </div>

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
          className="min-w-0 flex-1 rounded-md border border-edge bg-panel-raised px-2.5 py-1.5 font-mono text-xs outline-none placeholder:text-ink-dim focus:border-vex disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isOpen}
          className="rounded-md bg-panel px-3 py-1.5 text-xs transition hover:bg-edge disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
