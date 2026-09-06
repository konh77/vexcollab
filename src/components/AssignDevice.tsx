/*
 * VEXCollab - assigning a smart port to a variable in your code.
 * Licensed under AGPL-3.0-only.
 *
 * The brain already knows a Rotation sensor is on port 4. Typing
 * `rotation_4 = Rotation(Ports.PORT4)` by hand is the step where the port
 * number gets transposed, so this writes it instead.
 */
'use client';

import { useState } from 'react';
import {
  DEVICE_KINDS,
  declarationFor,
  kindForReportedType,
  nameProblem,
  suggestName,
  type DeviceKind,
} from '@/lib/vex/devices';

const PORTS = Array.from({ length: 21 }, (_, i) => i + 1);

interface Props {
  /** Port the form opens on. Still editable — you may be declaring ahead of the hardware. */
  initialPort: number;
  /** Numeric SmartDeviceType the brain reports there, or null if nothing is plugged in. */
  reportedType: number | null;
  /** Ports that already have a declaration, so a clash can be pointed out. */
  declaredPorts: number[];
  /** Variable names already in use across the project. */
  takenNames: string[];
  onAssign: (declaration: string) => void;
  onCancel: () => void;
}

export function AssignDevice({
  initialPort,
  reportedType,
  declaredPorts,
  takenNames,
  onAssign,
  onCancel,
}: Props) {
  const suggested = (reportedType != null && kindForReportedType(reportedType)) || DEVICE_KINDS[0];

  const [port, setPort] = useState(initialPort);
  const [kind, setKind] = useState<DeviceKind>(suggested);
  const [values, setValues] = useState<Record<string, string>>({ ...suggested.defaults });
  const [name, setName] = useState(() => suggestName(suggested, initialPort, takenNames));
  // Once the name has been typed in, stop overwriting it from under the user.
  const [renamed, setRenamed] = useState(false);

  const retitle = (nextKind: DeviceKind, nextPort: number) => {
    if (!renamed) setName(suggestName(nextKind, nextPort, takenNames));
  };

  const problem = nameProblem(name, takenNames);
  const declaration = declarationFor(kind, name || 'device', port, values);
  const clash = declaredPorts.includes(port);
  const mismatch =
    reportedType != null &&
    port === initialPort &&
    kindForReportedType(reportedType) !== undefined &&
    kindForReportedType(reportedType) !== kind;

  return (
    <div className="mt-1.5 space-y-2 rounded-lg bg-panel px-2.5 py-2.5">
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="block text-[10px] uppercase tracking-[0.04em] text-ink-dim">Port</span>
          <select
            value={port}
            onChange={(event) => {
              const next = Number(event.target.value);
              setPort(next);
              retitle(kind, next);
            }}
            className="mt-0.5 w-full rounded-md border border-edge bg-panel-raised px-1.5 py-1 text-[12px]"
          >
            {PORTS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="flex-[2]">
          <span className="block text-[10px] uppercase tracking-[0.04em] text-ink-dim">Device</span>
          <select
            value={kind.className}
            onChange={(event) => {
              const next =
                DEVICE_KINDS.find((k) => k.className === event.target.value) ?? DEVICE_KINDS[0];
              setKind(next);
              setValues({ ...next.defaults });
              retitle(next, port);
            }}
            className="mt-0.5 w-full rounded-md border border-edge bg-panel-raised px-1.5 py-1 text-[12px]"
          >
            {DEVICE_KINDS.map((option) => (
              <option key={option.className} value={option.className}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.04em] text-ink-dim">Name</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setRenamed(true);
          }}
          spellCheck={false}
          className="mt-0.5 w-full rounded-md border border-edge bg-panel-raised px-1.5 py-1 font-mono text-[12px] outline-none focus:border-vex"
        />
      </label>

      {kind.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {kind.options.map((option) => (
            <label key={option.key} className="min-w-[calc(50%-0.25rem)] flex-1">
              <span className="block text-[10px] uppercase tracking-[0.04em] text-ink-dim">
                {option.label}
              </span>
              {option.type === 'choice' ? (
                <select
                  value={values[option.key] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [option.key]: event.target.value }))
                  }
                  className="mt-0.5 w-full rounded-md border border-edge bg-panel-raised px-1.5 py-1 text-[12px]"
                >
                  {option.choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[option.key] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [option.key]: event.target.value }))
                  }
                  inputMode="decimal"
                  placeholder={option.hint}
                  className="mt-0.5 w-full rounded-md border border-edge bg-panel-raised px-1.5 py-1 font-mono text-[12px] outline-none focus:border-vex"
                />
              )}
            </label>
          ))}
        </div>
      )}

      <pre className="overflow-x-auto rounded-md bg-panel-raised px-2 py-1.5 font-mono text-[11px] leading-relaxed">
        {declaration}
      </pre>

      {problem && <p className="text-[11px] text-vex">{problem}</p>}
      {!problem && clash && (
        <p className="text-[11px] text-warn">Port {port} is already declared somewhere else.</p>
      )}
      {!problem && !clash && mismatch && (
        <p className="text-[11px] text-warn">
          The brain reports something else on port {port}. Declaring this anyway is fine — the
          port map will keep flagging the difference.
        </p>
      )}
      {!problem && kind.note && <p className="text-[11px] text-ink-dim">{kind.note}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={Boolean(problem)}
          onClick={() => onAssign(declaration)}
          className="flex-1 rounded-md bg-vex px-2.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-vex-soft disabled:opacity-50"
        >
          Add to the code
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md bg-panel-raised px-2.5 py-1.5 text-[12px] transition hover:bg-edge"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
