/*
 * VEXCollab - turning an editor project into something the brain can store.
 * Licensed under AGPL-3.0-only.
 */

/** The V5 brain runs Python on-board, so "building" is just encoding text. */
export function pythonPayload(source: string): Uint8Array {
  // A trailing newline keeps the on-brain parser happy with the last statement.
  const normalized = source.endsWith('\n') ? source : `${source}\n`;
  return new TextEncoder().encode(normalized);
}

export const STARTER_MAIN_PY = `# ---------------------------------------------------------------------------
#
#   Project:      VEXCollab starter
#   Description:  Edit me with your team, then upload straight from the browser.
#
# ---------------------------------------------------------------------------
from vex import *

brain = Brain()
controller = Controller(PRIMARY)

left_drive = Motor(Ports.PORT1, GearSetting.RATIO_18_1, False)
right_drive = Motor(Ports.PORT10, GearSetting.RATIO_18_1, True)


def main():
    brain.screen.print("Hello from VEXCollab")
    while True:
        # arcade() lives in lib/drive.py and is bundled in automatically.
        arcade(left_drive, right_drive,
               controller.axis3.position(), controller.axis1.position())
        wait(20, MSEC)


main()
`;

export const STARTER_README_MD = `# VEXCollab project

Everyone with this room's link edits these files at the same time.

- \`main.py\` is what gets uploaded to the brain.
- Connect a V5 over USB in the **Brain** panel, pick a slot, and hit Upload.
- Anything your program prints shows up in the **Terminal** tab.
`;

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

export interface StarterFile {
  path: string;
  contents: string;
}

export const STARTER_DRIVE_PY = `# Anything in a .py file here is bundled into the program ahead of main.py,
# so these functions are callable from main.py with no import line.

def arcade(left_motor, right_motor, forward, turn):
    \"\"\"Both arguments are -100..100.\"\"\"
    left_motor.spin(FORWARD, forward + turn, PERCENT)
    right_motor.spin(FORWARD, forward - turn, PERCENT)
`;

export function starterProject(): StarterFile[] {
  return [
    { path: 'main.py', contents: STARTER_MAIN_PY },
    { path: 'lib/drive.py', contents: STARTER_DRIVE_PY },
    { path: 'README.md', contents: STARTER_README_MD },
  ];
}

export function languageForPath(path: string): string {
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.cpp') || path.endsWith('.h') || path.endsWith('.hpp')) return 'cpp';
  if (path.endsWith('.txt')) return 'plaintext';
  return 'plaintext';
}
