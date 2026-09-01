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


def drive(forward, turn):
    """Simple arcade drive. Both arguments are -100..100."""
    left_drive.spin(FORWARD, forward + turn, PERCENT)
    right_drive.spin(FORWARD, forward - turn, PERCENT)


def main():
    brain.screen.print("Hello from VEXCollab")
    while True:
        drive(controller.axis3.position(), controller.axis1.position())
        wait(20, MSEC)


main()
`;

export const STARTER_README_MD = `# VEXCollab project

Everyone with this room's link edits these files at the same time.

- \`main.py\` is what gets uploaded to the brain.
- Connect a V5 over USB in the **Brain** panel, pick a slot, and hit Upload.
- Anything your program prints shows up in the **Terminal** tab.
`;

export interface StarterFile {
  path: string;
  contents: string;
}

export function starterProject(): StarterFile[] {
  return [
    { path: 'main.py', contents: STARTER_MAIN_PY },
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
