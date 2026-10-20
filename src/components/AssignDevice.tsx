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
  wireChoices,
  wiresUsed,
  type DeviceKind,
  type Location,
} from '@/lib/vex/devices';

const PORTS = Array.from({ length: 21 }, (_, i) => i + 1);

const SMART_KINDS = DEVICE_KINDS.filter((kind) => !kind.threeWire);
const WIRE_KINDS = DEVICE_KINDS.filter((kind) => kind.threeWire);

interface Props {
  /** Port the form opens on. Still editable — you may be declaring ahead of the hardware. */
  initialPort: number;
  /** Open on the 3-wire devices instead of the smart-port ones. */
  initialBus?: 'smart' | 'three-wire';
  /** Numeric SmartDeviceType the brain reports there, or null if nothing is plugged in. */
  reportedType: number | null;
  /** Ports that already have a declaration, so a clash can be pointed out. */
  declaredPorts: number[];
  /** 3-wire letters already taken, with the second letter of a pair counted. */
  declaredWires: string[];
  /** Variable names already in use across the project. */
  takenNames: string[];
  onAssign: (declaration: string) => void;
  onCancel: () => void;
}

/** First letter this kind fits on, or the first it is allowed on if none are free. */
function firstFreeWire(kind: DeviceKind, used: string[]): string {
  const choices = wireChoices(kind);
  return (
    choices.find((letter) => wiresUsed(kind.className, letter).every((w) => !used.includes(w))) ??
    choices[0]
  );
}

export function AssignDevice({
  initialPort,
  initialBus = 'smart',
  reportedType,
  declaredPorts,
  declaredWires,
  takenNames,
  onAssign,
  onCancel,
}: Props) {
  const suggested =
    initialBus === 'three-wire'
      ? WIRE_KINDS[0]
      : ((reportedType != null && kindForReportedType(reportedType)) || DEVICE_KINDS[0]);

  const [port, setPort] = useState(initialPort);
  const [wire, setWire] = useState(() => firstFreeWire(suggested, declaredWires));
  const [kind, setKind] = useState<DeviceKind>(suggested);
  const [values, setValues] = useState<Record<string, string>>({ ...suggested.defaults });
  const isWire = Boolean(kind.threeWire);
  const location: Location = isWire ? wire : port;
  const [name, setName] = useState(() =>
    suggestName(suggested, suggested.threeWire ? firstFreeWire(suggested, declaredWires) : initialPort, takenNames),
  );
  // Once the name has been typed in, stop overwriting it from under the user.
  const [renamed, setRenamed] = useState(false);

  const retitle = (nextKind: DeviceKind, nextLocation: Location) => {
    if (!renamed) setName(suggestName(nextKind, nextLocation, takenNames));
  };

  const problem = nameProblem(name, takenNames);
  const declaration = declarationFor(kind, name || 'device', location, values);
  const clash = isWire
    ? wiresUsed(kind.className, wire).some((letter) => declaredWires.includes(letter))
    : declaredPorts.includes(port);
  const mismatch =
    !isWire &&
    reportedType != null &&
    port === initialPort &&
    kindForReportedType(reportedType) !== undefined &&
    kindForReportedType(reportedType) !== kind;

  return (
    <div className="mt-1.5 space-y-2 rounded-lg bg-panel px-2.5 py-2.5">
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="block text-[10px] uppercase tracking-[0.04em] text-ink-dim">
            {isWire ? '3-wire' : 'Port'}
          </span>
          {isWire ? (
            <select
              value={wire}
              onChange={(event) => {
                setWire(event.target.value);
                retitle(kind, event.target.value);
              }}
              className="mt-0.5 w-full rounded-md border border-edge bg-panel-raised px-1.5 py-1 text-[12px]"
            >
              {wireChoices(kind).map((letter) => (
                <option key={letter} value={letter}>
                  {letter.toUpperCase()}
                </option>
              ))}
            </select>
          ) : (
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
          )}
        </label>

        <label className="flex-[2]">
          <span className="block text-[10px] uppercase tracking-[0.04em] text-ink-dim">Device</span>
          <select
            value={kind.className}
            onChange={(event) => {
              const next =
                DEVICE_KINDS.find((k) => k.className === event.target.value) ?? DEVICE_KINDS[0];
              // A pair device cannot start on B, D, F or H, so a letter that
              // was fine for a bumper may need to move when switching to one.
              const nextWire = next.threeWire
                ? wireChoices(next).includes(wire)
                  ? wire
                  : firstFreeWire(next, declaredWires)
                : wire;
              setKind(next);
              setWire(nextWire);
              setValues({ ...next.defaults });
              retitle(next, next.threeWire ? nextWire : port);
            }}
            className="mt-0.5 w-full rounded-md border border-edge bg-panel-raised px-1.5 py-1 text-[12px]"
          >
            <optgroup label="Smart port">
              {SMART_KINDS.map((option) => (
                <option key={option.className} value={option.className}>
                  {option.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="3-wire">
              {WIRE_KINDS.map((option) => (
                <option key={option.className} value={option.className}>
                  {option.label}
                </option>
              ))}
            </optgroup>
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
        <p className="text-[11px] text-warn">
          {isWire ? `3-wire port ${wire.toUpperCase()}` : `Port ${port}`} is already declared
          somewhere else.
        </p>
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
