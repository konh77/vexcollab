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

export function templateById(id: string | null | undefined): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
