/* VEXCollab - upload validation and defaults. AGPL-3.0-only. */
import type { SlotNumber } from '@/lib/v5-serial-protocol/Vex';

// The current uploader writes QSPI, whose per-file limit is 2 MiB.
export const MAX_PROGRAM_BYTES = 0x200000;

export function validateProgramFile(file: { name: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith('.bin')) {
    return 'Choose a compiled .bin file. Build Python or C++ in VEXcode first.';
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return 'This file is empty. Choose a compiled program.';
  if (file.size > MAX_PROGRAM_BYTES) return 'This program is larger than the 2 MiB upload limit.';
  return null;
}

export function inferProgramName(filename: string): string {
  return filename.replace(/\.bin$/i, '').replace(/[\r\n"\x00-\x1f]/g, ' ').trim().slice(0, 23) || 'VEXCollab';
}

export function findEmptySlot(programs: ReadonlyArray<{ slot: number }>): SlotNumber | null {
  for (const slot of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    if (!programs.some(program => program.slot === slot)) return slot;
  }
  return null;
}
