/*
 * VEXCollab - making brain tracebacks navigable.
 * Licensed under AGPL-3.0-only.
 *
 * When a V5 Python program crashes it prints a normal Python traceback over
 * serial. Parsing the frames turns a wall of text into something you can click.
 *
 * One wrinkle specific to VEXCollab: the brain runs the *bundled* program, so
 * its line numbers refer to the bundle, not to the file you were editing. The
 * bundler writes `# --- <path> ---` banners, which is what lets a bundle line
 * be mapped back to the file and line you actually wrote.
 */
'use client';

const FRAME = /^\s*File "([^"]+)", line (\d+)(?:, in (.+))?/;

export interface Frame {
  file: string;
  line: number;
  fn?: string;
}

export function parseFrame(line: string): Frame | null {
  const match = FRAME.exec(line);
  if (!match) return null;
  return { file: match[1], line: Number(match[2]), fn: match[3] };
}

export function isTracebackHeader(line: string): boolean {
  return /^Traceback \(most recent call last\)/.test(line);
}

/** `NameError: name 'x' is not defined` and friends. */
export function isExceptionLine(line: string): boolean {
  return /^[A-Z]\w*(Error|Exception|Interrupt|Warning)\b/.test(line);
}

export interface SourceMapEntry {
  path: string;
  /** 1-based line in the bundle where this file's contents begin. */
  bundleStart: number;
}

/** Reads the `# --- path ---` banners the bundler emits. */
export function mapBundle(bundled: string): SourceMapEntry[] {
  const entries: SourceMapEntry[] = [];
  const lines = bundled.split('\n');
  lines.forEach((line, index) => {
    const match = /^# --- (\S+) -+$/.exec(line);
    if (match) entries.push({ path: match[1], bundleStart: index + 2 });
  });
  return entries;
}

/** Turns a line number in the uploaded bundle back into file + line. */
export function resolveBundleLine(
  map: SourceMapEntry[],
  bundleLine: number,
): { file: string; line: number } | null {
  let chosen: SourceMapEntry | null = null;
  for (const entry of map) {
    if (entry.bundleStart <= bundleLine) chosen = entry;
    else break;
  }
  if (!chosen) return null;
  return { file: chosen.path, line: bundleLine - chosen.bundleStart + 1 };
}
