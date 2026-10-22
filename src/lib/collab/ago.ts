/*
 * VEXCollab - "3 min ago", coarsely.
 * Licensed under AGPL-3.0-only.
 */

/** "just now", "3 min ago": coarse on purpose, so it only needs to tick now and then. */
export function ago(from: number | null, now: number): string {
  if (!from) return 'not yet';
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 20) return 'just now';
  if (seconds < 90) return 'a minute ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
