/*
 * VEXCollab - change a shared text in place, touching as little as possible.
 * Licensed under AGPL-3.0-only. See LICENSE.
 */

const isHigh = (code) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Turns `before` into `after` by replacing only the part in the middle that differs.
 * Deleting the whole text and inserting it again would move every person's cursor to the
 * top of the file and cancel keystrokes that are in flight; changing only the span that
 * differs leaves the rest of the text, and the people editing it, where they were.
 */
export function replaceMinimal(text, before, after) {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
  // Never cut a character that is stored as two UTF-16 units in half.
  if (start > 0 && isHigh(before.charCodeAt(start - 1))) start -= 1;

  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)
  ) {
    endBefore -= 1;
    endAfter -= 1;
  }
  if (endBefore < before.length && isLow(before.charCodeAt(endBefore))) {
    endBefore += 1;
    endAfter += 1;
  }

  if (endBefore > start) text.delete(start, endBefore - start);
  if (endAfter > start) text.insert(start, after.slice(start, endAfter));
}
