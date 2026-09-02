/*
 * VEXCollab - editor preferences.
 * Licensed under AGPL-3.0-only.
 *
 * Per-browser, not per-room: how you like your editor is yours, and shipping it
 * through the shared document would mean changing everyone's font at once.
 */
'use client';

import { useEffect, useState } from 'react';

export interface Prefs {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  fontSize: 13,
  wordWrap: false,
  minimap: true,
  lineNumbers: true,
};

const KEY = 'vexcollab.prefs';
const EVENT = 'vexcollab:prefs';

export function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(window.localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(next: Partial<Prefs>) {
  const merged = { ...loadPrefs(), ...next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Private browsing; the change still applies for this page's lifetime.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: merged }));
  applyTheme(merged.theme);
}

/** Resolves 'system' against the OS setting. */
export function resolveTheme(theme: Prefs['theme']): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Prefs['theme']) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolveTheme(theme);
}

export function usePrefs(): Prefs {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(loadPrefs());
    applyTheme(loadPrefs().theme);

    const onChange = (event: Event) => setPrefs((event as CustomEvent<Prefs>).detail);
    window.addEventListener(EVENT, onChange);

    // Follow the OS when set to system.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => {
      const current = loadPrefs();
      if (current.theme === 'system') applyTheme('system');
    };
    media.addEventListener('change', onMedia);

    return () => {
      window.removeEventListener(EVENT, onChange);
      media.removeEventListener('change', onMedia);
    };
  }, []);

  return prefs;
}
