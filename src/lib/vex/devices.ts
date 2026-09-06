/*
 * VEXCollab - turning a port on the brain into a line of Python.
 * Licensed under AGPL-3.0-only.
 *
 * The brain tells us a smart port holds an IMU. The code has to say
 * `inertial_7 = Inertial(Ports.PORT7)`. This file is the bridge: which class
 * each reported device type corresponds to, what its constructor takes, and
 * what a sensible default declaration looks like.
 *
 * Class names and argument orders come from the published VEXcode V5 Python
 * API (api.vex.com) — the same source as `api-reference.ts`, which they are
 * deliberately kept consistent with.
 */

/** A constructor argument the user gets to decide, after the port. */
export type DeviceOption =
  | {
      key: string;
      label: string;
      type: 'choice';
      choices: { value: string; label: string }[];
    }
  | {
      key: string;
      label: string;
      type: 'number';
      hint?: string;
    };

export interface DeviceKind {
  /** The class as written in Python. */
  className: string;
  label: string;
  /** Stem for a suggested variable name: "motor" gives motor_7. */
  stem: string;
  /**
   * SmartDeviceType values the brain reports for this class. Empty means the
   * device exists but is never reported on a smart port by this name.
   */
  reportedAs: number[];
  /** Constructor arguments after the port, in order. */
  options: DeviceOption[];
  /** Default for each option, keyed by option key. */
  defaults: Record<string, string>;
  note?: string;
}

const GEAR_CHOICES = [
  { value: 'GearSetting.RATIO_18_1', label: 'Green — 200 rpm' },
  { value: 'GearSetting.RATIO_36_1', label: 'Red — 100 rpm' },
  { value: 'GearSetting.RATIO_6_1', label: 'Blue — 600 rpm' },
];

const REVERSED_CHOICES = [
  { value: 'False', label: 'Forward' },
  { value: 'True', label: 'Reversed' },
];

/**
 * Everything that can be declared against a smart port. Three-wire devices
 * (Bumper, Limit, Sonar, Pneumatic…) are deliberately absent: they hang off
 * `brain.three_wire_port`, not a numbered port, so the brain never reports one
 * and there is no port here to assign them to.
 */
export const DEVICE_KINDS: DeviceKind[] = [
  {
    className: 'Motor',
    label: 'Motor',
    stem: 'motor',
    // 2 = MOTOR, 5 = CR_MOTOR. Both are declared as a Motor.
    reportedAs: [2, 5],
    options: [
      { key: 'gear', label: 'Cartridge', type: 'choice', choices: GEAR_CHOICES },
      { key: 'reversed', label: 'Direction', type: 'choice', choices: REVERSED_CHOICES },
    ],
    defaults: { gear: 'GearSetting.RATIO_18_1', reversed: 'False' },
  },
  {
    className: 'Inertial',
    label: 'Inertial (IMU)',
    stem: 'inertial',
    reportedAs: [6],
    options: [],
    defaults: {},
    note: 'Call calibrate() and wait for is_calibrating() to clear before using it.',
  },
  {
    className: 'Distance',
    label: 'Distance sensor',
    stem: 'distance',
    reportedAs: [7],
    options: [],
    defaults: {},
  },
  {
    className: 'Optical',
    label: 'Optical sensor',
    stem: 'optical',
    reportedAs: [16],
    options: [],
    defaults: {},
  },
  {
    className: 'Rotation',
    label: 'Rotation sensor',
    stem: 'rotation',
    reportedAs: [4],
    options: [{ key: 'reversed', label: 'Direction', type: 'choice', choices: REVERSED_CHOICES }],
    defaults: { reversed: 'False' },
  },
  {
    className: 'Vision',
    label: 'Vision sensor',
    stem: 'vision',
    reportedAs: [11],
    options: [{ key: 'brightness', label: 'Brightness', type: 'number', hint: '0–100' }],
    defaults: { brightness: '50' },
    note: 'Add Signature objects as extra arguments once you have tuned them.',
  },
  {
    className: 'Gps',
    label: 'GPS sensor',
    stem: 'gps',
    reportedAs: [20],
    options: [
      { key: 'origin_x', label: 'Offset X', type: 'number', hint: 'from robot centre' },
      { key: 'origin_y', label: 'Offset Y', type: 'number', hint: 'from robot centre' },
      {
        key: 'units',
        label: 'Units',
        type: 'choice',
        choices: [
          { value: 'MM', label: 'Millimetres' },
          { value: 'INCHES', label: 'Inches' },
        ],
      },
      { key: 'angle', label: 'Mounting angle', type: 'number', hint: 'degrees' },
    ],
    defaults: { origin_x: '0', origin_y: '0', units: 'MM', angle: '180' },
  },
  {
    className: 'Electromagnet',
    label: 'Electromagnet',
    stem: 'magnet',
    reportedAs: [17],
    options: [],
    defaults: {},
  },
];

export function kindByClassName(className: string): DeviceKind | undefined {
  return DEVICE_KINDS.find((kind) => kind.className === className);
}

/**
 * What the brain reported on a port, mapped to the class you would declare.
 * `rawType` is the numeric SmartDeviceType, which is the only reliable
 * identifier — the display name is derived from the same enum and would just
 * be a lossy round trip.
 */
export function kindForReportedType(rawType: number): DeviceKind | undefined {
  return DEVICE_KINDS.find((kind) => kind.reportedAs.includes(rawType));
}

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

/** Null when the name is usable, otherwise why it is not. */
export function nameProblem(name: string, taken: string[]): string | null {
  if (!name) return 'Give it a name.';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return 'Letters, digits and underscores only, and not starting with a digit.';
  }
  if (PYTHON_KEYWORDS.has(name)) return `"${name}" is a Python keyword.`;
  if (taken.includes(name)) return `Something else in this project is already called "${name}".`;
  return null;
}

/** A free variable name for this kind of device on this port. */
export function suggestName(kind: DeviceKind, port: number, taken: string[]): string {
  const base = `${kind.stem}_${port}`;
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    if (!taken.includes(`${base}_${n}`)) return `${base}_${n}`;
  }
  return base;
}

/**
 * The finished line, e.g.
 * `left_drive = Motor(Ports.PORT1, GearSetting.RATIO_18_1, False)`.
 *
 * Trailing arguments that still hold their default are kept rather than
 * trimmed: VEX's own examples spell them out, and a beginner reading the line
 * back learns more from `False` than from its absence.
 */
export function declarationFor(
  kind: DeviceKind,
  name: string,
  port: number,
  values: Record<string, string>,
): string {
  const args = [`Ports.PORT${port}`];
  for (const option of kind.options) {
    const raw = (values[option.key] ?? kind.defaults[option.key] ?? '').trim();
    // A number field left empty falls back to the default rather than
    // producing `Gps(Ports.PORT1, , 0, MM, 180)`.
    args.push(raw || kind.defaults[option.key] || '0');
  }
  return `${name} = ${kind.className}(${args.join(', ')})`;
}
