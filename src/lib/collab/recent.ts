/*
 * VEXCollab - rooms you have been in lately.
 * Licensed under AGPL-3.0-only.
 *
 * Kept in this browser only. Room codes are the only thing protecting a room,
 * so they never leave the machine that typed them.
 */
'use client';

const KEY = 'vexcollab.recent';
const LIMIT = 8;

export interface RecentRoom {
  id: string;
  label: string;
  lastSeen: number;
}

export function loadRecent(): RecentRoom[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as RecentRoom[]).slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberRoom(id: string, label?: string) {
  if (typeof window === 'undefined' || !id) return;
  try {
    const existing = loadRecent().filter((room) => room.id !== id);
    const next: RecentRoom[] = [
      { id, label: label || id, lastSeen: Date.now() },
      ...existing,
    ].slice(0, LIMIT);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private browsing; forgetting recent rooms is not worth an error.
  }
}

export function forgetRoom(id: string) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(loadRecent().filter((r) => r.id !== id)));
  } catch {
    // as above
  }
}
