/*
 * VEXCollab - VEX V5 Python API reference for editor intelligence.
 * Licensed under AGPL-3.0-only.
 *
 * A curated subset of the public VEXcode V5 Python API (api.vex.com), written
 * from the published documentation to drive completions and hovers. It is
 * deliberately not exhaustive — adding an entry here is the whole job of
 * teaching the editor a new call.
 */

/**
 * What kind of value belongs in a parameter slot. Knowing this is what lets the
 * editor offer PERCENT instead of every constant in the API when your caret is
 * in the units argument.
 */
export type ParamKind =
  | 'direction'
  | 'turnDirection'
  | 'velocityUnit'
  | 'rotationUnit'
  | 'timeUnit'
  | 'distanceUnit'
  | 'currentUnit'
  | 'brakeType'
  | 'boolean'
  | 'number'
  | 'port'
  | 'gearSetting'
  | 'text';

export interface ApiParam {
  name: string;
  kind: ParamKind;
  optional?: boolean;
}

export interface ApiMember {
  name: string;
  signature: string;
  detail: string;
  /** Insert text with ${n:placeholder} tab stops, Monaco snippet syntax. */
  snippet?: string;
  params?: ApiParam[];
}

/** The values that are valid for each parameter kind. */
export const PARAM_VALUES: Record<ParamKind, { label: string; detail: string }[]> = {
  direction: [
    { label: 'FORWARD', detail: 'Spin forwards' },
    { label: 'REVERSE', detail: 'Spin backwards' },
  ],
  turnDirection: [
    { label: 'LEFT', detail: 'Turn left' },
    { label: 'RIGHT', detail: 'Turn right' },
  ],
  velocityUnit: [
    { label: 'PERCENT', detail: '-100 to 100' },
    { label: 'RPM', detail: 'Revolutions per minute' },
    { label: 'DPS', detail: 'Degrees per second' },
  ],
  rotationUnit: [
    { label: 'DEGREES', detail: '360 per revolution' },
    { label: 'TURNS', detail: 'Whole revolutions' },
  ],
  timeUnit: [
    { label: 'MSEC', detail: 'Milliseconds' },
    { label: 'SECONDS', detail: 'Seconds' },
  ],
  distanceUnit: [
    { label: 'MM', detail: 'Millimetres' },
    { label: 'INCHES', detail: 'Inches' },
  ],
  currentUnit: [{ label: 'AMP', detail: 'Amps' }],
  brakeType: [
    { label: 'COAST', detail: 'Freewheel to a stop' },
    { label: 'BRAKE', detail: 'Stop, then release' },
    { label: 'HOLD', detail: 'Stop and actively hold position' },
  ],
  boolean: [
    { label: 'True', detail: 'boolean' },
    { label: 'False', detail: 'boolean' },
  ],
  number: [],
  port: Array.from({ length: 21 }, (_, i) => ({
    label: `Ports.PORT${i + 1}`,
    detail: 'Smart port',
  })),
  gearSetting: [
    { label: 'GearSetting.RATIO_36_1', detail: 'Red — 100 rpm, most torque' },
    { label: 'GearSetting.RATIO_18_1', detail: 'Green — 200 rpm, the usual choice' },
    { label: 'GearSetting.RATIO_6_1', detail: 'Blue — 600 rpm, fastest' },
  ],
  text: [],
};

export interface ApiClass {
  name: string;
  detail: string;
  constructor: string;
  constructorParams?: ApiParam[];
  members: ApiMember[];
}

const MOTOR_MEMBERS: ApiMember[] = [
  { name: 'spin', signature: 'spin(direction, velocity, units)', detail: 'Spin the motor continuously.', snippet: 'spin(${1:FORWARD}, ${2:50}, ${3:PERCENT})',
    params: [{ name: 'direction', kind: 'direction' }, { name: 'velocity', kind: 'number', optional: true }, { name: 'units', kind: 'velocityUnit', optional: true }] },
  { name: 'spin_for', signature: 'spin_for(direction, amount, units, wait=True)', detail: 'Spin a set distance, blocking by default.', snippet: 'spin_for(${1:FORWARD}, ${2:90}, ${3:DEGREES})',
    params: [{ name: 'direction', kind: 'direction' }, { name: 'amount', kind: 'number' }, { name: 'units', kind: 'rotationUnit' }, { name: 'wait', kind: 'boolean', optional: true }] },
  { name: 'spin_to_position', signature: 'spin_to_position(position, units, wait=True)', detail: 'Rotate to an absolute encoder position.', snippet: 'spin_to_position(${1:0}, ${2:DEGREES})' },
  { name: 'stop', signature: 'stop(mode=None)', detail: 'Stop the motor, optionally with COAST, BRAKE or HOLD.', snippet: 'stop()',
    params: [{ name: 'mode', kind: 'brakeType', optional: true }] },
  { name: 'set_velocity', signature: 'set_velocity(velocity, units)', detail: 'Default velocity for later moves.', snippet: 'set_velocity(${1:50}, ${2:PERCENT})',
    params: [{ name: 'velocity', kind: 'number' }, { name: 'units', kind: 'velocityUnit' }] },
  { name: 'set_stopping', signature: 'set_stopping(mode)', detail: 'COAST, BRAKE or HOLD when the motor stops.', snippet: 'set_stopping(${1:BRAKE})',
    params: [{ name: 'mode', kind: 'brakeType' }] },
  { name: 'set_position', signature: 'set_position(value, units)', detail: 'Redefine the current encoder position.', snippet: 'set_position(${1:0}, ${2:DEGREES})' },
  { name: 'set_timeout', signature: 'set_timeout(time, units)', detail: 'Give up on a blocking move after this long.', snippet: 'set_timeout(${1:2}, ${2:SECONDS})' },
  { name: 'position', signature: 'position(units) -> float', detail: 'Current encoder position.', snippet: 'position(${1:DEGREES})',
    params: [{ name: 'units', kind: 'rotationUnit' }] },
  { name: 'velocity', signature: 'velocity(units) -> float', detail: 'Current velocity.', snippet: 'velocity(${1:PERCENT})',
    params: [{ name: 'units', kind: 'velocityUnit' }] },
  { name: 'temperature', signature: 'temperature(units) -> float', detail: 'Motor temperature — worth checking mid-match.', snippet: 'temperature(${1:PERCENT})' },
  { name: 'current', signature: 'current(units) -> float', detail: 'Current draw.', snippet: 'current(${1:AMP})' },
  { name: 'is_spinning', signature: 'is_spinning() -> bool', detail: 'True while a move is in progress.', snippet: 'is_spinning()' },
  { name: 'is_done', signature: 'is_done() -> bool', detail: 'True when the last blocking move finished.', snippet: 'is_done()' },
];


const SENSOR_CALIBRATE: ApiMember[] = [
  { name: 'calibrate', signature: 'calibrate()', detail: 'Start calibration. Wait for it before using readings.', snippet: 'calibrate()' },
  { name: 'is_calibrating', signature: 'is_calibrating() -> bool', detail: 'True while calibrating.', snippet: 'is_calibrating()' },
  { name: 'installed', signature: 'installed() -> bool', detail: 'True when the sensor is actually plugged in.', snippet: 'installed()' },
];

export const SENSOR_CLASSES: ApiClass[] = [
  {
    name: 'Vision',
    detail: 'Vision sensor. Configure signatures in the VEX Vision Utility first.',
    constructor: 'Vision(${1:Ports.PORT11}, ${2:50}, ${3:SIG_1})',
    constructorParams: [{ name: 'port', kind: 'port' }, { name: 'brightness', kind: 'number', optional: true }],
    members: [
      { name: 'take_snapshot', signature: 'take_snapshot(signature, count=1) -> tuple', detail: 'Look now. Returns the objects seen, largest first.', snippet: 'take_snapshot(${1:SIG_1})' },
      { name: 'objects', signature: 'vision.objects', detail: 'Objects from the last snapshot.' },
      { name: 'object_count', signature: 'vision.object_count -> int', detail: 'How many objects the last snapshot found.' },
      { name: 'largest_object', signature: 'largest_object() -> VisionObject', detail: 'The biggest object from the last snapshot.', snippet: 'largest_object()' },
      { name: 'set_brightness', signature: 'set_brightness(percent)', detail: 'Camera brightness, 0..100.', snippet: 'set_brightness(${1:50})' },
      { name: 'set_signature', signature: 'set_signature(signature)', detail: 'Replace a stored signature.', snippet: 'set_signature(${1:SIG_1})' },
    ],
  },
  {
    name: 'Signature',
    detail: 'A colour signature. Copy these numbers out of the VEX Vision Utility.',
    constructor: 'Signature(${1:1}, ${2:0}, ${3:0}, ${4:0}, ${5:0}, ${6:0}, ${7:0}, ${8:3.0}, ${9:0})',
    members: [],
  },
  {
    name: 'Gps',
    detail: 'GPS sensor. Reports field position from the wall QR strips.',
    constructor: 'Gps(${1:Ports.PORT1}, ${2:0}, ${3:0}, ${4:MM}, ${5:180})',
    constructorParams: [{ name: 'port', kind: 'port' }, { name: 'origin_x', kind: 'number', optional: true }, { name: 'origin_y', kind: 'number', optional: true }, { name: 'units', kind: 'distanceUnit', optional: true }, { name: 'angle', kind: 'number', optional: true }],
    members: [
      ...SENSOR_CALIBRATE,
      { name: 'x_position', signature: 'x_position(units) -> float', detail: 'Field X. Origin is the field centre.', snippet: 'x_position(${1:MM})', params: [{ name: 'units', kind: 'distanceUnit' }] },
      { name: 'y_position', signature: 'y_position(units) -> float', detail: 'Field Y.', snippet: 'y_position(${1:MM})', params: [{ name: 'units', kind: 'distanceUnit' }] },
      { name: 'heading', signature: 'heading(units) -> float', detail: 'Field heading 0..360.', snippet: 'heading(${1:DEGREES})', params: [{ name: 'units', kind: 'rotationUnit' }] },
      { name: 'rotation', signature: 'rotation(units) -> float', detail: 'Cumulative rotation, unbounded.', snippet: 'rotation(${1:DEGREES})' },
      { name: 'quality', signature: 'quality() -> int', detail: 'Confidence 0..100. Below ~90 do not trust the position.', snippet: 'quality()' },
      { name: 'set_origin', signature: 'set_origin(x, y, units)', detail: 'Where the sensor sits relative to the robot centre.', snippet: 'set_origin(${1:0}, ${2:0}, ${3:MM})' },
      { name: 'set_location', signature: 'set_location(x, y, units, heading, rotation_units)', detail: 'Tell the sensor where the robot actually is.', snippet: 'set_location(${1:0}, ${2:0}, ${3:MM}, ${4:0}, ${5:DEGREES})' },
    ],
  },
  {
    name: 'Sonar',
    detail: 'Ultrasonic range finder on two adjacent 3-wire ports.',
    constructor: 'Sonar(${1:brain.three_wire_port.a})',
    members: [
      { name: 'distance', signature: 'distance(units) -> float', detail: 'Distance to whatever is in front.', snippet: 'distance(${1:MM})', params: [{ name: 'units', kind: 'distanceUnit' }] },
      { name: 'found', signature: 'found() -> bool', detail: 'True when an echo came back.', snippet: 'found()' },
    ],
  },
  {
    name: 'Bumper',
    detail: 'Bumper switch on a 3-wire port.',
    constructor: 'Bumper(${1:brain.three_wire_port.a})',
    members: [{ name: 'pressing', signature: 'pressing() -> bool', detail: 'True while pressed.', snippet: 'pressing()' }],
  },
  {
    name: 'Limit',
    detail: 'Limit switch on a 3-wire port.',
    constructor: 'Limit(${1:brain.three_wire_port.a})',
    members: [{ name: 'pressing', signature: 'pressing() -> bool', detail: 'True while pressed.', snippet: 'pressing()' }],
  },
  {
    name: 'Encoder',
    detail: 'Quadrature encoder on two adjacent 3-wire ports.',
    constructor: 'Encoder(${1:brain.three_wire_port.a})',
    members: [
      { name: 'position', signature: 'position(units) -> float', detail: 'Counted position.', snippet: 'position(${1:DEGREES})' },
      { name: 'velocity', signature: 'velocity(units) -> float', detail: 'Rotational velocity.', snippet: 'velocity(${1:RPM})' },
      { name: 'reset_position', signature: 'reset_position()', detail: 'Zero the count.', snippet: 'reset_position()' },
    ],
  },
  {
    name: 'Potentiometer',
    detail: 'Rotary potentiometer on a 3-wire port.',
    constructor: 'Potentiometer(${1:brain.three_wire_port.a})',
    members: [
      { name: 'angle', signature: 'angle(units) -> float', detail: 'Shaft angle.', snippet: 'angle(${1:DEGREES})' },
      { name: 'value', signature: 'value(units) -> int', detail: 'Raw reading.', snippet: 'value(PERCENT)' },
    ],
  },
  {
    name: 'Line',
    detail: 'Line tracker on a 3-wire port.',
    constructor: 'Line(${1:brain.three_wire_port.a})',
    members: [
      { name: 'reflectivity', signature: 'reflectivity(units) -> float', detail: 'How much light comes back, 0..100.', snippet: 'reflectivity(PERCENT)' },
      { name: 'value', signature: 'value(units) -> int', detail: 'Raw reading.', snippet: 'value(PERCENT)' },
    ],
  },
  {
    name: 'Light',
    detail: 'Ambient light sensor on a 3-wire port.',
    constructor: 'Light(${1:brain.three_wire_port.a})',
    members: [
      { name: 'brightness', signature: 'brightness(units) -> float', detail: 'Brightness 0..100.', snippet: 'brightness(PERCENT)' },
      { name: 'value', signature: 'value(units) -> int', detail: 'Raw reading.', snippet: 'value(PERCENT)' },
    ],
  },
  {
    name: 'Servo',
    detail: 'Hobby servo on a 3-wire port.',
    constructor: 'Servo(${1:brain.three_wire_port.a})',
    members: [
      { name: 'set_position', signature: 'set_position(value, units)', detail: 'Move to an angle.', snippet: 'set_position(${1:0}, ${2:DEGREES})' },
      { name: 'position', signature: 'position(units) -> float', detail: 'Where it currently is.', snippet: 'position(${1:DEGREES})' },
    ],
  },
  {
    name: 'Electromagnet',
    detail: 'Electromagnet. Pick things up and drop them.',
    constructor: 'Electromagnet(${1:Ports.PORT1})',
    constructorParams: [{ name: 'port', kind: 'port' }],
    members: [
      { name: 'pickup', signature: 'pickup(power)', detail: 'Energise to grab.', snippet: 'pickup(${1:50})' },
      { name: 'drop', signature: 'drop(power)', detail: 'Reverse to release.', snippet: 'drop(${1:50})' },
      { name: 'set_power', signature: 'set_power(power)', detail: 'Default strength 0..100.', snippet: 'set_power(${1:50})' },
    ],
  },
  {
    name: 'AddressableLed',
    detail: 'Addressable LED strip on a 3-wire port.',
    constructor: 'AddressableLed(${1:brain.three_wire_port.a})',
    members: [
      { name: 'set', signature: 'set(colours, offset=0)', detail: 'Write a list of colours to the strip.', snippet: 'set([${1:Color.RED}])' },
      { name: 'clear', signature: 'clear()', detail: 'All off.', snippet: 'clear()' },
    ],
  },
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
    constructorParams: [
      { name: 'port', kind: 'port' },
      { name: 'gears', kind: 'gearSetting', optional: true },
      { name: 'reversed', kind: 'boolean', optional: true },
    ],
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
  ...SENSOR_CLASSES,
];

/** Free functions available after `from vex import *`. */
export const API_FUNCTIONS: ApiMember[] = [
  { name: 'wait', signature: 'wait(time, units)', detail: 'Pause. Always put one in a while loop or the brain locks up.', snippet: 'wait(${1:20}, ${2:MSEC})',
    params: [{ name: 'time', kind: 'number' }, { name: 'units', kind: 'timeUnit' }] },
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
