/*
 * VEXCollab - what your code claims vs what is actually plugged in.
 * Licensed under AGPL-3.0-only.
 *
 * The single most useful thing a VEX editor can show: your code says PORT7 is
 * a Motor, the brain says port 7 is empty. That mismatch is behind a huge share
 * of "it worked yesterday" problems, and neither the code nor the brain alone
 * can tell you about it.
 *
 * And once the mismatch is visible, the obvious next thing is to fix it from
 * here — so a port the brain reports but the code has never heard of can be
 * assigned a variable without typing the declaration out.
 */
'use client';

import { useState } from 'react';
import type { DeclaredDevice } from '@/lib/editor/useAnalysis';
import type { SmartDeviceView } from '@/lib/vex/types';
import { wiresUsed } from '@/lib/vex/devices';
import { AssignDevice } from './AssignDevice';

interface Props {
  declared: DeclaredDevice[];
  actual: SmartDeviceView[];
  connected: boolean;
  onJump: (file: string, line: number) => void;
  /**
   * Writes a finished declaration into the project. Absent when there is no
   * document to write into, which is what hides the assign controls.
   */
  onAssign?: (declaration: string) => void;
}

/** Normalises "Motor"/"MOTOR"/"Motor 29" so the two sources can be compared. */
function sameKind(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const x = norm(a);
  const y = norm(b);
  return x.startsWith(y) || y.startsWith(x);
}

export function PortMap({ declared, actual, connected, onJump, onAssign }: Props) {
  // Which port's assign form is open: a smart port number, 'wire' for the
  // 3-wire form, or null for none.
  const [assigning, setAssigning] = useState<number | 'wire' | null>(null);

  const ports = new Map<number, { declared?: DeclaredDevice; actual?: SmartDeviceView }>();
  for (const device of declared) {
    if (device.port != null) ports.set(device.port, { ...ports.get(device.port), declared: device });
  }
  for (const device of actual) {
    // 22 and 23 are the ADI expander and the battery — internal, and never
    // something your code declares, so they would only ever read as "missing".
    if (device.port > 21) continue;
    ports.set(device.port, { ...ports.get(device.port), actual: device });
  }

  const rows = [...ports.entries()].sort((a, b) => a[0] - b[0]);
  const declaredPorts = declared.map((d) => d.port).filter((p): p is number => p != null);
  const takenNames = declared.map((d) => d.name);

  // 3-wire devices have no smart port, so they never reach `ports`. The brain
  // reports nothing per letter, so this list comes from the code alone.
  const wireDevices = declared
    .filter((d): d is DeclaredDevice & { wire: string } => d.wire != null)
    .sort((a, b) => a.wire.localeCompare(b.wire));
  const declaredWires = wireDevices.flatMap((d) => wiresUsed(d.type, d.wire));

  // A port to open the manual form on: the lowest one nothing is using yet.
  const firstFreePort = (() => {
    for (let port = 1; port <= 21; port += 1) if (!ports.has(port)) return port;
    return 1;
  })();

  const form = (port: number, bus: 'smart' | 'three-wire' = 'smart') => (
    <AssignDevice
      initialPort={port}
      initialBus={bus}
      reportedType={bus === 'smart' ? (ports.get(port)?.actual?.rawType ?? null) : null}
      declaredPorts={declaredPorts}
      declaredWires={declaredWires}
      takenNames={takenNames}
      onAssign={(declaration) => {
        onAssign?.(declaration);
        setAssigning(null);
      }}
      onCancel={() => setAssigning(null)}
    />
  );

  if (rows.length === 0 && wireDevices.length === 0) {
    return (
      <div>
        <p className="text-sm text-ink-dim">No devices declared yet.</p>
        {onAssign &&
          (assigning === null ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAssigning(firstFreePort)}
                className="rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge"
              >
                Declare a device…
              </button>
              <button
                type="button"
                onClick={() => setAssigning('wire')}
                className="rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge"
              >
                Declare a 3-wire device…
              </button>
            </div>
          ) : assigning === 'wire' ? (
            form(firstFreePort, 'three-wire')
          ) : (
            form(assigning)
          ))}
      </div>
    );
  }

  return (
    <div>
      <ul className="space-y-0.5">
        {rows.map(([port, entry]) => {
          const mismatch =
            connected &&
            entry.declared &&
            (!entry.actual || !sameKind(entry.actual.type, entry.declared.type));
          const unexpected = connected && entry.actual && !entry.declared;

          return (
            <li key={port}>
              <div
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

                {/* Assigning is offered exactly where it helps: hardware the
                    brain can see that the code has no name for. */}
                {onAssign && !entry.declared && entry.actual && assigning !== port && (
                  <button
                    type="button"
                    onClick={() => setAssigning(port)}
                    className="shrink-0 rounded bg-panel px-1.5 py-0.5 text-[10px] font-medium transition hover:bg-edge hover:text-vex"
                  >
                    Assign
                  </button>
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
              </div>

              {assigning === port && form(port)}
            </li>
          );
        })}
      </ul>

      {wireDevices.length > 0 && (
        <div className="mt-2">
          <h4 className="mb-0.5 px-1.5 text-[10px] uppercase tracking-[0.04em] text-ink-dim">
            3-wire
          </h4>
          <ul className="space-y-0.5">
            {wireDevices.map((device) => (
              <li
                key={`${device.file}:${device.line}`}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px]"
              >
                <span className="w-7 shrink-0 font-mono uppercase text-ink-dim">
                  {wiresUsed(device.type, device.wire).join('')}
                </span>
                <button
                  type="button"
                  onClick={() => onJump(device.file, device.line)}
                  className="flex-1 truncate text-left transition hover:text-vex"
                  title={`${device.file}:${device.line}`}
                >
                  {device.name}
                  <span className="ml-1 text-ink-dim">{device.type}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onAssign && assigning === null && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setAssigning(firstFreePort)}
            className="rounded-md bg-panel px-2.5 py-1 text-[11px] text-ink-dim transition hover:bg-edge hover:text-ink"
          >
            Declare a device on another port…
          </button>
          <button
            type="button"
            onClick={() => setAssigning('wire')}
            className="rounded-md bg-panel px-2.5 py-1 text-[11px] text-ink-dim transition hover:bg-edge hover:text-ink"
          >
            Declare a 3-wire device…
          </button>
        </div>
      )}

      {onAssign && assigning === 'wire' && form(firstFreePort, 'three-wire')}
      {onAssign && typeof assigning === 'number' && !ports.has(assigning) && form(assigning)}
    </div>
  );
}
