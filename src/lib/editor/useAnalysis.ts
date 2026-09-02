/*
 * VEXCollab - project analysis, refreshed as you type.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useState } from 'react';

export interface DeclaredDevice {
  name: string;
  type: string;
  port: number | null;
  file: string;
  line: number;
}

export interface Warning {
  file: string;
  line: number;
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface Analysis {
  available: boolean;
  devices: DeclaredDevice[];
  warnings: Warning[];
  functions: { name: string; file: string; line: number }[];
  edges: { from: string; to: string }[];
}

const EMPTY: Analysis = { available: false, devices: [], warnings: [], functions: [], edges: [] };

/**
 * @param signature changes whenever the project's text changes; analysis is
 *        re-run on a trailing debounce rather than on every keystroke.
 */
export function useAnalysis(
  getFiles: () => { path: string; contents: string }[],
  signature: string,
): Analysis {
  const [analysis, setAnalysis] = useState<Analysis>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: getFiles() }),
        });
        const data = (await response.json()) as Analysis;
        if (!cancelled) setAnalysis({ ...EMPTY, ...data });
      } catch {
        // Analysis is advisory; a failure must never interrupt editing.
      }
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [signature, getFiles]);

  return analysis;
}
