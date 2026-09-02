/*
 * VEXCollab - React bindings for the brain session and user terminal.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { V5Session } from './session';
import { V5Terminal } from './terminal';
import { EMPTY_SNAPSHOT, type BrainSnapshot } from './types';
import { ingest, type Series } from './telemetry';

const SERVER_SNAPSHOT: BrainSnapshot = EMPTY_SNAPSHOT;

export function useV5Session() {
  const session = useMemo(() => new V5Session(), []);
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    () => SERVER_SNAPSHOT,
  );

  useEffect(() => () => void session.disconnect(), [session]);

  return { session, snapshot };
}

const MAX_TERMINAL_CHARS = 200_000;

export function useV5Terminal() {
  const terminal = useMemo(() => new V5Terminal(), []);
  const [output, setOutput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [series, setSeries] = useState<Map<string, Series>>(new Map());
  const pending = useRef('');
  // Serial arrives in arbitrary chunks; telemetry is per line, so a partial
  // line is held back until its newline turns up.
  const partial = useRef('');

  useEffect(() => {
    // Batch on animation frames: a chatty program can emit faster than React
    // can re-render, and one setState per chunk locks the tab up.
    let frame = 0;
    const flush = () => {
      frame = 0;
      if (!pending.current) return;
      const chunk = pending.current;
      pending.current = '';
      setOutput((prev) => {
        const next = prev + chunk;
        return next.length > MAX_TERMINAL_CHARS ? next.slice(-MAX_TERMINAL_CHARS) : next;
      });
    };

    const offData = terminal.onData((chunk) => {
      pending.current += chunk;
      if (!frame) frame = requestAnimationFrame(flush);

      partial.current += chunk;
      const lines = partial.current.split('\n');
      partial.current = lines.pop() ?? '';
      if (lines.length) {
        setSeries((current) => {
          let next = current;
          for (const line of lines) next = ingest(next, line);
          return next;
        });
      }
    });
    const offState = terminal.onStateChange(setIsOpen);

    return () => {
      offData();
      offState();
      if (frame) cancelAnimationFrame(frame);
      void terminal.close();
    };
  }, [terminal]);

  return {
    terminal,
    output,
    isOpen,
    series,
    clear: () => {
      setOutput('');
      setSeries(new Map());
    },
  };
}
