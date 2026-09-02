/*
 * VEXCollab - turning print() output into live plots.
 * Licensed under AGPL-3.0-only.
 *
 * A V5 brain has no debugger — the only channel out of a running program is
 * whatever it prints. So the print stream is the telemetry: any line shaped
 * like `heading=12.4` or `left rpm: 200` becomes a series you can watch move
 * while the robot drives.
 */
'use client';

/** `name=value`, `name: value`, with optional units, one or many per line. */
const PAIR = /([A-Za-z_][\w .-]{0,23}?)\s*[=:]\s*(-?\d+(?:\.\d+)?)/g;

export interface Series {
  name: string;
  points: { t: number; v: number }[];
  last: number;
  min: number;
  max: number;
}

const MAX_POINTS = 240;

export function parseTelemetry(line: string): { name: string; value: number }[] {
  const out: { name: string; value: number }[] = [];
  for (const match of line.matchAll(PAIR)) {
    const name = match[1].trim();
    const value = Number(match[2]);
    if (name && Number.isFinite(value)) out.push({ name, value });
  }
  return out;
}

/** Folds new readings into the running series, keeping a bounded window. */
export function ingest(
  series: Map<string, Series>,
  line: string,
  now = Date.now(),
): Map<string, Series> {
  const readings = parseTelemetry(line);
  if (readings.length === 0) return series;

  const next = new Map(series);
  for (const { name, value } of readings) {
    const existing = next.get(name);
    const points = [...(existing?.points ?? []), { t: now, v: value }].slice(-MAX_POINTS);
    next.set(name, {
      name,
      points,
      last: value,
      min: Math.min(existing?.min ?? value, value),
      max: Math.max(existing?.max ?? value, value),
    });
  }
  return next;
}

/** An SVG path for a sparkline, normalised to the series' own range. */
export function sparkline(series: Series, width: number, height: number): string {
  const { points, min, max } = series;
  if (points.length < 2) return '';
  const span = max - min || 1;
  const step = width / (points.length - 1);
  return points
    .map((p, i) => {
      const x = i * step;
      const y = height - ((p.v - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
