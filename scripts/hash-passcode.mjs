/*
 * VEXCollab - make the passcodeHash for a pinned room.
 * Licensed under AGPL-3.0-only.
 *
 *   printf %s 'the passcode' | node scripts/hash-passcode.mjs
 *
 * Reads the passcode from standard input, so it never appears in the process
 * list, and prints the hash to paste into the room's config. Only the hash is
 * ever stored.
 */
import { hashPasscode } from '../pinned-rooms.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const passcode = input.replace(/[\r\n]+$/, '');

if (!passcode) {
  console.error('Pipe the passcode in: printf %s "the passcode" | node scripts/hash-passcode.mjs');
  process.exit(1);
}
console.log(await hashPasscode(passcode));
