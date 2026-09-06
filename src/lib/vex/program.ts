/*
 * VEXCollab - turning an editor project into something the brain can store.
 * Licensed under AGPL-3.0-only.
 *
 * The starter files used to be duplicated here as well as in templates.ts.
 * They are not any more: one copy, in templates.ts, which is the only thing
 * that reads them. Two copies of the same Python is how a fix lands in the
 * one nobody opens.
 */

export interface ProjectFile {
  path: string;
  contents: string;
}

/** `from vex import *` (and friends) only need to run once in a bundle. */
const VEX_IMPORT = /^\s*from\s+vex\s+import\s+\*\s*$/;

/**
 * The V5 has no module system for user code — a program is a single payload,
 * so `import drive` cannot resolve on the brain. To let a team organise code
 * into folders anyway, every .py file is concatenated into one program at
 * upload time: modules first (path order), the entry file last, sharing one
 * global namespace.
 *
 * That means a function defined in `lib/drive.py` is callable from `main.py`
 * with no import line at all. It also means names are global, so two files
 * defining `reset()` will collide — the last one wins.
 */
export function bundlePythonProject(
  files: ReadonlyArray<ProjectFile>,
  entry = 'main.py',
): string {
  const modules = files
    .filter((f) => f.path.endsWith('.py') && f.path !== entry)
    .sort((a, b) => a.path.localeCompare(b.path));
  const main = files.find((f) => f.path === entry);

  const usesVex = files.some((f) => f.contents.split('\n').some((l) => VEX_IMPORT.test(l)));

  const strip = (source: string) =>
    source
      .split('\n')
      .filter((line) => !VEX_IMPORT.test(line))
      .join('\n')
      .trim();

  const parts: string[] = ['# Bundled by VEXCollab. Edit the source files, not this.'];
  if (usesVex) parts.push('from vex import *');

  for (const module of modules) {
    const body = strip(module.contents);
    if (!body) continue;
    parts.push(`\n# --- ${module.path} ${'-'.repeat(Math.max(0, 60 - module.path.length))}`);
    parts.push(body);
  }

  if (main) {
    parts.push(`\n# --- ${entry} ${'-'.repeat(Math.max(0, 60 - entry.length))}`);
    parts.push(strip(main.contents));
  }

  return `${parts.join('\n')}\n`;
}

/** How many .py files a bundle will pull in, for showing in the UI. */
export function countProgramFiles(files: ReadonlyArray<{ path: string }>): number {
  return files.filter((f) => f.path.endsWith('.py')).length;
}

export function languageForPath(path: string): string {
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.cpp') || path.endsWith('.h') || path.endsWith('.hpp')) return 'cpp';
  if (path.endsWith('.txt')) return 'plaintext';
  return 'plaintext';
}
