/* VEXCollab - MicroPython 1.13 bytecode contract. AGPL-3.0-only. */

// V5 uses MicroPython 1.13 (MPY v5), with 31-bit small integers on its 32-bit CPU.
// Native-code emitters target a different ABI and are deliberately excluded.
export function isV5Bytecode(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x4d && bytes[1] === 5 &&
    bytes[2] === 2 && bytes[3] === 31;
}
