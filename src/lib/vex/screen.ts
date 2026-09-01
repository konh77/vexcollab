/*
 * VEXCollab - V5 brain framebuffer decoding.
 * Licensed under AGPL-3.0-only.
 */
'use client';

/** Visible resolution of the V5 brain LCD. */
export const SCREEN_WIDTH = 480;
export const SCREEN_HEIGHT = 272;
/** The framebuffer is padded to a 512-pixel stride, 4 bytes per pixel. */
export const SCREEN_STRIDE = 512;
export const SCREEN_CAPTURE_BYTES = SCREEN_STRIDE * SCREEN_HEIGHT * 4;

/**
 * Converts a raw capture into a PNG data URL.
 *
 * Pixels arrive as 32-bit little-endian values, so the byte order on the wire
 * is B, G, R, unused. Rows are `SCREEN_STRIDE` pixels wide but only the first
 * `SCREEN_WIDTH` of each are on screen.
 */
export function decodeScreenCapture(raw: Uint8Array): string | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_WIDTH;
  canvas.height = SCREEN_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

  for (let y = 0; y < SCREEN_HEIGHT; y++) {
    for (let x = 0; x < SCREEN_WIDTH; x++) {
      const src = (y * SCREEN_STRIDE + x) * 4;
      const dst = (y * SCREEN_WIDTH + x) * 4;
      image.data[dst] = raw[src + 2] ?? 0; // R
      image.data[dst + 1] = raw[src + 1] ?? 0; // G
      image.data[dst + 2] = raw[src] ?? 0; // B
      image.data[dst + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
