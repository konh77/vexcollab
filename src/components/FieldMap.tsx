/*
 * VEXCollab - a top-down field view driven by GPS telemetry.
 * Licensed under AGPL-3.0-only.
 *
 * A V5 exposes no live sensor readings over USB — the protocol carries files,
 * program slots and device presence, nothing else. The only channel out of a
 * running program is what it prints. So this draws the robot from printed
 * telemetry: `x=`, `y=` and `heading=` become a position on the field.
 *
 * The field is 3.6 m square (12 ft), and a GPS reports millimetres from the
 * centre, so the drawing space is -1800..1800 on both axes.
 */
'use client';

import type { Series } from '@/lib/vex/telemetry';

const FIELD_MM = 3600;
const HALF = FIELD_MM / 2;
const SIZE = 260;

/** Field millimetres to SVG pixels, with Y flipped so up is away from you. */
function toSvg(xMm: number, yMm: number) {
  return {
    x: ((xMm + HALF) / FIELD_MM) * SIZE,
    y: SIZE - ((yMm + HALF) / FIELD_MM) * SIZE,
  };
}

function pick(series: Map<string, Series>, names: string[]): Series | null {
  for (const [key, value] of series) {
    if (names.includes(key.toLowerCase().trim())) return value;
  }
  return null;
}

export function FieldMap({ series }: { series: Map<string, Series> }) {
  const xs = pick(series, ['x', 'gps_x', 'x_position', 'posx']);
  const ys = pick(series, ['y', 'gps_y', 'y_position', 'posy']);
  const heading = pick(series, ['heading', 'gps_heading', 'theta', 'angle']);
  const quality = pick(series, ['quality', 'gps_quality']);

  if (!xs || !ys) {
    return (
      <div className="text-[11px] leading-relaxed text-ink-dim">
        <p className="mb-1">Print your GPS position and the robot appears here:</p>
        <pre className="overflow-x-auto rounded-md bg-panel px-2 py-1.5 font-mono text-[10px]">
{`print("x=%d y=%d heading=%d" % (
    gps.x_position(MM),
    gps.y_position(MM),
    gps.heading(DEGREES)))`}
        </pre>
      </div>
    );
  }

  // Pair the two series by index — they are printed on the same line, so their
  // samples line up.
  const count = Math.min(xs.points.length, ys.points.length);
  const trail = Array.from({ length: count }, (_, i) => toSvg(xs.points[i].v, ys.points[i].v));
  const here = trail[trail.length - 1];
  const facing = heading?.last ?? 0;
  const weak = quality != null && quality.last < 90;

  return (
    <div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" className="rounded-lg border border-edge">
        <rect width={SIZE} height={SIZE} className="fill-panel" />
        {[1, 2, 3, 4, 5].map((i) => (
          <g key={i} className="stroke-edge" strokeWidth="0.5">
            <line x1={(SIZE / 6) * i} y1="0" x2={(SIZE / 6) * i} y2={SIZE} />
            <line x1="0" y1={(SIZE / 6) * i} x2={SIZE} y2={(SIZE / 6) * i} />
          </g>
        ))}
        <line x1={SIZE / 2} y1="0" x2={SIZE / 2} y2={SIZE} className="stroke-ink-dim" strokeWidth="0.75" />
        <line x1="0" y1={SIZE / 2} x2={SIZE} y2={SIZE / 2} className="stroke-ink-dim" strokeWidth="0.75" />

        {trail.length > 1 && (
          <polyline
            points={trail.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            className="stroke-vex"
            strokeWidth="1.5"
            strokeOpacity="0.45"
          />
        )}

        {here && (
          <g transform={`translate(${here.x} ${here.y}) rotate(${facing})`}>
            {/* A wedge, so which way it is pointing is unambiguous. */}
            <polygon points="0,-9 6,7 0,3 -6,7" className="fill-vex" />
          </g>
        )}
      </svg>

      <div className="mt-1.5 grid grid-cols-3 gap-1 font-mono text-[10px] text-ink-dim">
        <span>x {Math.round(xs.last)}</span>
        <span>y {Math.round(ys.last)}</span>
        <span>{heading ? `θ ${Math.round(heading.last)}°` : ''}</span>
      </div>
      {weak && (
        <p className="mt-1 text-[10px] text-warn">
          GPS quality {Math.round(quality!.last)} — below 90 the position is unreliable.
        </p>
      )}
    </div>
  );
}
