/*
 * VEXCollab - VEX V5 Python API reference for editor intelligence.
 * Licensed under AGPL-3.0-only.
 *
 * A curated subset of the public VEXcode V5 Python API (api.vex.com), written
 * from the published documentation to drive completions and hovers. It is
 * deliberately not exhaustive — adding an entry here is the whole job of
 * teaching the editor a new call.
 */

export interface ApiMember {
  name: string;
  signature: string;
  detail: string;
  /** Insert text with ${n:placeholder} tab stops, Monaco snippet syntax. */
  snippet?: string;
}

export interface ApiClass {
  name: string;
  detail: string;
  constructor: string;
  members: ApiMember[];
}

const MOTOR_MEMBERS: ApiMember[] = [
  { name: 'spin', signature: 'spin(direction, velocity, units)', detail: 'Spin the motor continuously.', snippet: 'spin(${1:FORWARD}, ${2:50}, ${3:PERCENT})' },
  { name: 'spin_for', signature: 'spin_for(direction, amount, units, wait=True)', detail: 'Spin a set distance, blocking by default.', snippet: 'spin_for(${1:FORWARD}, ${2:90}, ${3:DEGREES})' },
  { name: 'spin_to_position', signature: 'spin_to_position(position, units, wait=True)', detail: 'Rotate to an absolute encoder position.', snippet: 'spin_to_position(${1:0}, ${2:DEGREES})' },
  { name: 'stop', signature: 'stop(mode=None)', detail: 'Stop the motor, optionally with COAST, BRAKE or HOLD.', snippet: 'stop()' },
  { name: 'set_velocity', signature: 'set_velocity(velocity, units)', detail: 'Default velocity for later moves.', snippet: 'set_velocity(${1:50}, ${2:PERCENT})' },
  { name: 'set_stopping', signature: 'set_stopping(mode)', detail: 'COAST, BRAKE or HOLD when the motor stops.', snippet: 'set_stopping(${1:BRAKE})' },
  { name: 'set_position', signature: 'set_position(value, units)', detail: 'Redefine the current encoder position.', snippet: 'set_position(${1:0}, ${2:DEGREES})' },
  { name: 'set_timeout', signature: 'set_timeout(time, units)', detail: 'Give up on a blocking move after this long.', snippet: 'set_timeout(${1:2}, ${2:SECONDS})' },
  { name: 'position', signature: 'position(units) -> float', detail: 'Current encoder position.', snippet: 'position(${1:DEGREES})' },
  { name: 'velocity', signature: 'velocity(units) -> float', detail: 'Current velocity.', snippet: 'velocity(${1:PERCENT})' },
  { name: 'temperature', signature: 'temperature(units) -> float', detail: 'Motor temperature — worth checking mid-match.', snippet: 'temperature(${1:PERCENT})' },
  { name: 'current', signature: 'current(units) -> float', detail: 'Current draw.', snippet: 'current(${1:AMP})' },
  { name: 'is_spinning', signature: 'is_spinning() -> bool', detail: 'True while a move is in progress.', snippet: 'is_spinning()' },
  { name: 'is_done', signature: 'is_done() -> bool', detail: 'True when the last blocking move finished.', snippet: 'is_done()' },
];

export const API_CLASSES: ApiClass[] = [
  {
    name: 'Brain',
    detail: 'The V5 brain: screen, timer, battery, SD card.',
    constructor: 'Brain()',
    members: [
      { name: 'screen', signature: 'brain.screen', detail: 'The brain LCD.' },
      { name: 'timer', signature: 'brain.timer', detail: 'Match timer.' },
      { name: 'battery', signature: 'brain.battery', detail: 'Battery capacity, voltage, current.' },
      { name: 'sdcard', signature: 'brain.sdcard', detail: 'SD card access.' },
    ],
  },
  {
    name: 'Controller',
    detail: 'A V5 controller. Controller(PRIMARY) or Controller(PARTNER).',
    constructor: 'Controller(${1:PRIMARY})',
    members: [
      { name: 'axis1', signature: 'controller.axis1', detail: 'Right stick, horizontal.' },
      { name: 'axis2', signature: 'controller.axis2', detail: 'Right stick, vertical.' },
      { name: 'axis3', signature: 'controller.axis3', detail: 'Left stick, vertical.' },
      { name: 'axis4', signature: 'controller.axis4', detail: 'Left stick, horizontal.' },
      { name: 'buttonL1', signature: 'controller.buttonL1', detail: 'Left shoulder, top.' },
      { name: 'buttonL2', signature: 'controller.buttonL2', detail: 'Left shoulder, bottom.' },
      { name: 'buttonR1', signature: 'controller.buttonR1', detail: 'Right shoulder, top.' },
      { name: 'buttonR2', signature: 'controller.buttonR2', detail: 'Right shoulder, bottom.' },
      { name: 'buttonA', signature: 'controller.buttonA', detail: 'A button.' },
      { name: 'buttonB', signature: 'controller.buttonB', detail: 'B button.' },
      { name: 'buttonX', signature: 'controller.buttonX', detail: 'X button.' },
      { name: 'buttonY', signature: 'controller.buttonY', detail: 'Y button.' },
      { name: 'rumble', signature: 'rumble(pattern)', detail: 'Vibrate with a pattern of . and -', snippet: 'rumble("${1:..}")' },
    ],
  },
  {
    name: 'Motor',
    detail: 'A smart motor. Motor(port, gears, reversed)',
    constructor: 'Motor(${1:Ports.PORT1}, ${2:GearSetting.RATIO_18_1}, ${3:False})',
    members: MOTOR_MEMBERS,
  },
  {
    name: 'MotorGroup',
    detail: 'Several motors driven as one.',
    constructor: 'MotorGroup(${1:motor_a}, ${2:motor_b})',
    members: MOTOR_MEMBERS,
  },
  {
    name: 'DriveTrain',
    detail: 'A two-motor drivetrain with distance-aware moves.',
    constructor: 'DriveTrain(${1:left}, ${2:right}, ${3:319.19}, ${4:295}, ${5:40}, ${6:MM})',
    members: [
      { name: 'drive', signature: 'drive(direction, velocity, units)', detail: 'Drive continuously.', snippet: 'drive(${1:FORWARD})' },
      { name: 'drive_for', signature: 'drive_for(direction, distance, units, wait=True)', detail: 'Drive a set distance.', snippet: 'drive_for(${1:FORWARD}, ${2:200}, ${3:MM})' },
      { name: 'turn', signature: 'turn(direction, velocity, units)', detail: 'Turn continuously.', snippet: 'turn(${1:RIGHT})' },
      { name: 'turn_for', signature: 'turn_for(direction, angle, units, wait=True)', detail: 'Turn a set angle.', snippet: 'turn_for(${1:RIGHT}, ${2:90}, ${3:DEGREES})' },
      { name: 'stop', signature: 'stop(mode=None)', detail: 'Stop the drivetrain.', snippet: 'stop()' },
      { name: 'set_drive_velocity', signature: 'set_drive_velocity(velocity, units)', detail: 'Default driving speed.', snippet: 'set_drive_velocity(${1:50}, ${2:PERCENT})' },
      { name: 'set_turn_velocity', signature: 'set_turn_velocity(velocity, units)', detail: 'Default turning speed.', snippet: 'set_turn_velocity(${1:50}, ${2:PERCENT})' },
    ],
  },
  {
    name: 'Inertial',
    detail: 'Inertial sensor — heading, rotation, acceleration.',
    constructor: 'Inertial(${1:Ports.PORT1})',
    members: [
      { name: 'calibrate', signature: 'calibrate()', detail: 'Calibrate. Do this before autonomous, and wait for it.', snippet: 'calibrate()' },
      { name: 'is_calibrating', signature: 'is_calibrating() -> bool', detail: 'True while calibrating.', snippet: 'is_calibrating()' },
      { name: 'heading', signature: 'heading(units) -> float', detail: 'Heading 0..360.', snippet: 'heading(${1:DEGREES})' },
      { name: 'rotation', signature: 'rotation(units) -> float', detail: 'Cumulative rotation, unbounded.', snippet: 'rotation(${1:DEGREES})' },
      { name: 'set_heading', signature: 'set_heading(value, units)', detail: 'Redefine the current heading.', snippet: 'set_heading(${1:0}, ${2:DEGREES})' },
      { name: 'set_rotation', signature: 'set_rotation(value, units)', detail: 'Redefine cumulative rotation.', snippet: 'set_rotation(${1:0}, ${2:DEGREES})' },
    ],
  },
  {
    name: 'Distance',
    detail: 'Distance sensor.',
    constructor: 'Distance(${1:Ports.PORT1})',
    members: [
      { name: 'object_distance', signature: 'object_distance(units) -> float', detail: 'Distance to the nearest object.', snippet: 'object_distance(${1:MM})' },
      { name: 'is_object_detected', signature: 'is_object_detected() -> bool', detail: 'True when something is in range.', snippet: 'is_object_detected()' },
    ],
  },
  {
    name: 'Optical',
    detail: 'Optical sensor — colour, brightness, gestures.',
    constructor: 'Optical(${1:Ports.PORT1})',
    members: [
      { name: 'color', signature: 'color() -> Color', detail: 'Detected colour.', snippet: 'color()' },
      { name: 'hue', signature: 'hue() -> float', detail: 'Hue 0..360.', snippet: 'hue()' },
      { name: 'brightness', signature: 'brightness() -> float', detail: 'Brightness percentage.', snippet: 'brightness()' },
      { name: 'is_near_object', signature: 'is_near_object() -> bool', detail: 'True when an object is close.', snippet: 'is_near_object()' },
      { name: 'set_light', signature: 'set_light(state)', detail: 'Turn the built-in LED on or off.', snippet: 'set_light(${1:LedStateType.ON})' },
    ],
  },
  {
    name: 'Rotation',
    detail: 'Rotation sensor.',
    constructor: 'Rotation(${1:Ports.PORT1})',
    members: [
      { name: 'angle', signature: 'angle(units) -> float', detail: 'Absolute angle 0..360.', snippet: 'angle(${1:DEGREES})' },
      { name: 'position', signature: 'position(units) -> float', detail: 'Cumulative position.', snippet: 'position(${1:DEGREES})' },
      { name: 'velocity', signature: 'velocity(units) -> float', detail: 'Rotational velocity.', snippet: 'velocity(${1:RPM})' },
      { name: 'reset_position', signature: 'reset_position()', detail: 'Zero the position.', snippet: 'reset_position()' },
    ],
  },
  {
    name: 'Pneumatic',
    detail: 'Pneumatic solenoid on a 3-wire port.',
    constructor: 'Pneumatic(${1:brain.three_wire_port.a})',
    members: [
      { name: 'open', signature: 'open()', detail: 'Extend.', snippet: 'open()' },
      { name: 'close', signature: 'close()', detail: 'Retract.', snippet: 'close()' },
    ],
  },
];

/** Free functions available after `from vex import *`. */
export const API_FUNCTIONS: ApiMember[] = [
  { name: 'wait', signature: 'wait(time, units)', detail: 'Pause. Always put one in a while loop or the brain locks up.', snippet: 'wait(${1:20}, ${2:MSEC})' },
  { name: 'print', signature: 'print(*values)', detail: 'Print to the terminal — shows in the VEXCollab terminal panel.', snippet: 'print(${1:value})' },
];

/** Constants and enums that autocomplete as plain identifiers. */
export const API_CONSTANTS: { name: string; detail: string }[] = [
  { name: 'FORWARD', detail: 'Direction' },
  { name: 'REVERSE', detail: 'Direction' },
  { name: 'LEFT', detail: 'Turn direction' },
  { name: 'RIGHT', detail: 'Turn direction' },
  { name: 'PERCENT', detail: 'Velocity units' },
  { name: 'RPM', detail: 'Velocity units' },
  { name: 'DPS', detail: 'Degrees per second' },
  { name: 'DEGREES', detail: 'Rotation units' },
  { name: 'TURNS', detail: 'Rotation units' },
  { name: 'SECONDS', detail: 'Time units' },
  { name: 'MSEC', detail: 'Time units' },
  { name: 'MM', detail: 'Distance units' },
  { name: 'INCHES', detail: 'Distance units' },
  { name: 'PRIMARY', detail: 'Controller id' },
  { name: 'PARTNER', detail: 'Controller id' },
  { name: 'COAST', detail: 'Brake type' },
  { name: 'BRAKE', detail: 'Brake type' },
  { name: 'HOLD', detail: 'Brake type' },
  { name: 'AMP', detail: 'Current units' },
  { name: 'VOLT', detail: 'Voltage units' },
];

export const PORT_NAMES = Array.from({ length: 21 }, (_, i) => `Ports.PORT${i + 1}`);

export const GEAR_SETTINGS = [
  { name: 'GearSetting.RATIO_36_1', detail: 'Red cartridge — 100 rpm, most torque' },
  { name: 'GearSetting.RATIO_18_1', detail: 'Green cartridge — 200 rpm, the usual choice' },
  { name: 'GearSetting.RATIO_6_1', detail: 'Blue cartridge — 600 rpm, fastest' },
];
