/*
 * VEXCollab - starting points for a new room.
 * Licensed under AGPL-3.0-only.
 *
 * Every template is real, working V5 Python that passes the project's own
 * checks — a `wait()` in every loop, no duplicated ports, no name collisions.
 * A template that trips the linter on first open teaches the wrong thing.
 */

export interface Template {
  id: string;
  name: string;
  description: string;
  files: { path: string; contents: string }[];
}

const README = (title: string, body: string) => `# ${title}

${body}

Everyone with this room's link edits these files at the same time.

- \`main.py\` is what gets uploaded to the brain.
- Any other \`.py\` file is bundled in ahead of it, so its functions are usable
  from \`main.py\` with no import line.
- Connect a V5 over USB in the Brain panel, pick a slot, and hit Upload.
`;

export const TEMPLATES: Template[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Arcade drive split across two files. A good first look.',
    files: [
      {
        path: 'main.py',
        contents: `from vex import *

brain = Brain()
controller = Controller(PRIMARY)

left_drive = Motor(Ports.PORT1, GearSetting.RATIO_18_1, False)
right_drive = Motor(Ports.PORT10, GearSetting.RATIO_18_1, True)


def main():
    brain.screen.print("Hello from VEXCollab")
    while True:
        # arcade() lives in lib/drive.py and is bundled in automatically.
        arcade(left_drive, right_drive,
               controller.axis3.position(), controller.axis1.position())
        wait(20, MSEC)


main()
`,
      },
      {
        path: 'lib/drive.py',
        contents: `# Anything in a .py file here is bundled into the program ahead of main.py,
# so these functions are callable from main.py with no import line.

def arcade(left_motor, right_motor, forward, turn):
    """Both arguments are -100..100."""
    left_motor.spin(FORWARD, forward + turn, PERCENT)
    right_motor.spin(FORWARD, forward - turn, PERCENT)
`,
      },
      { path: 'README.md', contents: README('VEXCollab project', 'Arcade drive, split into two files.') },
    ],
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'One empty file. Nothing in your way.',
    files: [
      {
        path: 'main.py',
        contents: `from vex import *

brain = Brain()


def main():
    brain.screen.print("Ready")


main()
`,
      },
    ],
  },
  {
    id: 'competition',
    name: 'Competition',
    description: 'Autonomous and driver control, split the way a match runs.',
    files: [
      {
        path: 'main.py',
        contents: `from vex import *

brain = Brain()
controller = Controller(PRIMARY)

left_drive = Motor(Ports.PORT1, GearSetting.RATIO_18_1, False)
right_drive = Motor(Ports.PORT10, GearSetting.RATIO_18_1, True)
inertial = Inertial(Ports.PORT12)


def pre_autonomous():
    """Runs once before the match. Calibrate here, not in autonomous."""
    brain.screen.print("Calibrating")
    inertial.calibrate()
    while inertial.is_calibrating():
        wait(50, MSEC)
    brain.screen.clear_screen()
    brain.screen.print("Ready")


def autonomous():
    """The 15 seconds you cannot touch the controller."""
    drive_forward(300)
    turn_to(90)
    drive_forward(200)


def driver_control():
    while True:
        arcade(left_drive, right_drive,
               controller.axis3.position(), controller.axis1.position())
        wait(20, MSEC)


# The competition object calls these when the field switch says so. You can
# also drive it yourself from the Brain panel's match control.
competition = Competition(driver_control, autonomous)

pre_autonomous()
`,
      },
      {
        path: 'lib/drive.py',
        contents: `# Movement helpers, bundled ahead of main.py.

def arcade(left_motor, right_motor, forward, turn):
    """Both arguments are -100..100."""
    left_motor.spin(FORWARD, forward + turn, PERCENT)
    right_motor.spin(FORWARD, forward - turn, PERCENT)


def drive_forward(millimetres):
    """Rough distance drive. Replace with encoder counts once you measure."""
    left_drive.spin(FORWARD, 40, PERCENT)
    right_drive.spin(FORWARD, 40, PERCENT)
    wait(millimetres * 2, MSEC)
    left_drive.stop()
    right_drive.stop()


def turn_to(heading):
    """Turn until the inertial sensor reads the heading you asked for."""
    while abs(inertial.heading(DEGREES) - heading) > 2:
        error = heading - inertial.heading(DEGREES)
        speed = max(-30, min(30, error))
        left_drive.spin(FORWARD, speed, PERCENT)
        right_drive.spin(REVERSE, speed, PERCENT)
        wait(20, MSEC)
    left_drive.stop()
    right_drive.stop()
`,
      },
      {
        path: 'README.md',
        contents: README(
          'Competition project',
          'Autonomous and driver control, split the way a match runs.\n\nTest autonomous without a field switch using **match control** in the Brain panel.',
        ),
      },
    ],
  },
  {
    id: 'drivetrain',
    name: 'Drivetrain',
    description: "VEX's DriveTrain, so you can drive in millimetres and degrees.",
    files: [
      {
        path: 'main.py',
        contents: `from vex import *

brain = Brain()
controller = Controller(PRIMARY)

left_motor = Motor(Ports.PORT1, GearSetting.RATIO_18_1, False)
right_motor = Motor(Ports.PORT10, GearSetting.RATIO_18_1, True)

# Wheel travel, track width and wheel base in millimetres. Measure your robot
# and correct these — every distance below depends on them.
drivetrain = DriveTrain(left_motor, right_motor, 319.19, 295, 40, MM)


def square(side_mm):
    """Drives a square. A quick way to check your measurements are right."""
    for _ in range(4):
        drivetrain.drive_for(FORWARD, side_mm, MM)
        drivetrain.turn_for(RIGHT, 90, DEGREES)


def main():
    drivetrain.set_drive_velocity(40, PERCENT)
    drivetrain.set_turn_velocity(30, PERCENT)
    square(300)

    while True:
        drivetrain.drive(FORWARD, controller.axis3.position(), PERCENT)
        wait(20, MSEC)


main()
`,
      },
      {
        path: 'README.md',
        contents: README(
          'Drivetrain project',
          'Uses VEX\'s DriveTrain so you can move in millimetres and turn in degrees.\n\n**Measure your robot** and fix the three numbers in `DriveTrain(...)` before trusting any distance.',
        ),
      },
    ],
  },
];


const VISION_MAIN = [
  'from vex import *',
  '',
  'brain = Brain()',
  '',
  '# Set your signature numbers in the VEX Vision Utility, then paste them here.',
  '# The nine values are: index, uMin, uMax, uMean, vMin, vMax, vMean, range, type',
  'SIG_BLUE = Signature(1, -3000, -2000, -2500, 5000, 8000, 6500, 3.0, 0)',
  '',
  'vision = Vision(Ports.PORT11, 50, SIG_BLUE)',
  '',
  '',
  'def main():',
  '    while True:',
  '        objects = vision.take_snapshot(SIG_BLUE)',
  '',
  '        if objects and vision.object_count > 0:',
  '            target = vision.largest_object()',
  '            # Printed like this, VEXCollab charts each value live.',
  '            print("seen=1 cx=%d cy=%d w=%d h=%d" % (',
  '                target.centerX, target.centerY, target.width, target.height))',
  '        else:',
  '            print("seen=0 cx=0 cy=0 w=0 h=0")',
  '',
  '        wait(100, MSEC)',
  '',
  '',
  'main()',
  '',
].join('\n');

const VISION_README = [
  '# Vision sensor',
  '',
  "Configure the signature in VEX's Vision Utility first, then copy the nine",
  'numbers into SIG_BLUE at the top of main.py.',
  '',
  'The sensor is on PORT11. Change it if yours differs.',
  '',
  'Open the user port in the terminal panel and the printed values are charted',
  'live. cx tells you whether the object is left or right of centre: the frame',
  'is 0 to 315 wide, so 158 is the middle.',
  '',
].join('\n');

const GPS_MAIN = [
  'from vex import *',
  '',
  'brain = Brain()',
  '',
  "# Fourth argument is where the sensor sits relative to the robot's centre.",
  'gps = Gps(Ports.PORT1, 0, 0, MM, 180)',
  '',
  '',
  'def main():',
  '    gps.calibrate()',
  '    while gps.is_calibrating():',
  '        wait(50, MSEC)',
  '    brain.screen.print("GPS ready")',
  '',
  '    while True:',
  '        # x, y and heading on one line: VEXCollab pairs them up and draws',
  '        # the robot on a top-down field view.',
  '        print("x=%d y=%d heading=%d quality=%d" % (',
  '            gps.x_position(MM),',
  '            gps.y_position(MM),',
  '            gps.heading(DEGREES),',
  '            gps.quality()))',
  '',
  '        wait(100, MSEC)',
  '',
  '',
  'main()',
  '',
].join('\n');

const GPS_README = [
  '# GPS sensor',
  '',
  'Prints field position every 100 ms. Open the user port in the terminal panel',
  'and the field map in the Brain rail draws where the robot is, with a trail',
  'behind it.',
  '',
  'The field is 3.6 m square and the GPS reports millimetres from the centre, so',
  'values run about -1800 to 1800 on each axis.',
  '',
  'Watch quality. Below about 90 the sensor cannot see enough of the wall strips',
  'and the position should not be trusted.',
  '',
].join('\n');

TEMPLATES.push(
  {
    id: 'vision',
    name: 'Vision sensor',
    description: 'Track a colour signature and print what it sees.',
    files: [
      {
        path: 'main.py',
        contents: VISION_MAIN,
      },
      {
        path: 'README.md',
        contents: VISION_README,
      },
    ],
  },
  {
    id: 'gps',
    name: 'GPS sensor',
    description: 'Print field position — VEXCollab draws it on a field map.',
    files: [
      {
        path: 'main.py',
        contents: GPS_MAIN,
      },
      {
        path: 'README.md',
        contents: GPS_README,
      },
    ],
  },
);

export function templateById(id: string | null | undefined): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
