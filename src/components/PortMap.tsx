/*
 * VEXCollab - what your code claims vs what is actually plugged in.
 * Licensed under AGPL-3.0-only.
 *
 * The single most useful thing a VEX editor can show: your code says PORT7 is
 * a Motor, the brain says port 7 is empty. That mismatch is behind a huge share
 * of "it worked yesterday" problems, and neither the code nor the brain alone
 * can tell you about it.
 */
'use client';

import type { DeclaredDevice } from '@/lib/editor/useAnalysis';
import type { SmartDeviceView } from '@/lib/vex/types';

interface Props {
  declared: DeclaredDevice[];
  actual: SmartDeviceView[];
  connected: boolean;
  onJump: (file: string, line: number) => void;
}

/** Normalises "Motor"/"MOTOR"/"Motor 29" so the two sources can be compared. */
function sameKind(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const x = norm(a);
  const y = norm(b);
  return x.startsWith(y) || y.startsWith(x);
}

export function PortMap({ declared, actual, connected, onJump }: Props) {
  const ports = new Map<number, { declared?: DeclaredDevice; actual?: SmartDeviceView }>();
  for (const device of declared) {
    if (device.port != null) ports.set(device.port, { ...ports.get(device.port), declared: device });
  }
  for (const device of actual) {
    ports.set(device.port, { ...ports.get(device.port), actual: device });
  }

  const rows = [...ports.entries()].sort((a, b) => a[0] - b[0]);
  if (rows.length === 0) {
    return <p className="text-sm text-ink-dim">No devices declared yet.</p>;
  }

  return (
    <ul className="space-y-0.5">
      {rows.map(([port, entry]) => {
        const mismatch =
          connected &&
          entry.declared &&
          (!entry.actual || !sameKind(entry.actual.type, entry.declared.type));
        const unexpected = connected && entry.actual && !entry.declared;

        return (
          <li
            key={port}
            className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] ${
              mismatch ? 'bg-vex/8' : ''
            }`}
          >
            <span className="w-7 shrink-0 font-mono text-ink-dim">{port}</span>

            {entry.declared ? (
              <button
                type="button"
                onClick={() => onJump(entry.declared!.file, entry.declared!.line)}
                className="flex-1 truncate text-left transition hover:text-vex"
                title={`${entry.declared.file}:${entry.declared.line}`}
              >
                {entry.declared.name}
                <span className="ml-1 text-ink-dim">{entry.declared.type}</span>
              </button>
            ) : (
              <span className="flex-1 truncate text-ink-dim">
                {unexpected ? `${entry.actual!.type} (not in code)` : '—'}
              </span>
            )}

            {connected && (
              <span
                className={`shrink-0 text-[10px] ${
                  mismatch ? 'text-vex' : entry.actual ? 'text-ok' : 'text-ink-dim'
                }`}
                title={
                  mismatch
                    ? entry.actual
                      ? `Brain reports ${entry.actual.type}`
                      : 'Brain reports nothing on this port'
                    : undefined
                }
              >
                {mismatch ? (entry.actual ? 'wrong type' : 'missing') : entry.actual ? 'ok' : ''}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
