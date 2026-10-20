/*
 * VEXCollab - cheat sheets: short recipes for the things a robot does most.
 * Licensed under AGPL-3.0-only.
 *
 * Written for this project, from the public VEXcode V5 Python API. Each recipe
 * is plain code that assumes the usual setup at the top of main.py -- a Brain,
 * a Controller and motors with the names used below -- and every one is run
 * against a stand-in for the V5 API as part of the tests, so none of them is
 * code nobody has executed.
 */

export interface Recipe {
  id: string;
  title: string;
  /** One line on when to reach for it. */
  blurb: string;
  /** Names it expects to exist, so the card can say what to declare first. */
  needs: string[];
  code: string;
}

export const RECIPES: Recipe[] = [
  {
    id: 'arcade',
    title: 'Drive with the sticks',
    blurb: 'Arcade drive: left stick forward and back, right stick to turn.',
    needs: ['controller', 'left_drive', 'right_drive'],
    code: `def arcade(left_motor, right_motor, forward, turn):
    left = forward + turn
    right = forward - turn
    # Both sticks at full asks for 200%, and the brain clips each side on its
    # own, which loses the turn. Scaling together keeps it.
    largest = max(abs(left), abs(right), 100)
    left_motor.spin(FORWARD, left * 100 / largest, PERCENT)
    right_motor.spin(FORWARD, right * 100 / largest, PERCENT)


while True:
    arcade(left_drive, right_drive,
           controller.axis3.position(), controller.axis1.position())
    wait(20, MSEC)`,
  },
  {
    id: 'tank',
    title: 'Tank drive',
    blurb: 'One stick for each side.',
    needs: ['controller', 'left_drive', 'right_drive'],
    code: `while True:
    left_drive.spin(FORWARD, controller.axis3.position(), PERCENT)
    right_drive.spin(FORWARD, controller.axis2.position(), PERCENT)
    wait(20, MSEC)`,
  },
  {
    id: 'drive-turn',
    title: 'Drive a distance, then turn',
    blurb: 'A DriveTrain moves in millimetres and degrees. Measure your robot first.',
    needs: ['drivetrain'],
    code: `drivetrain.set_drive_velocity(50, PERCENT)
drivetrain.set_turn_velocity(30, PERCENT)

drivetrain.drive_for(FORWARD, 300, MM)
drivetrain.turn_for(RIGHT, 90, DEGREES)
drivetrain.drive_for(REVERSE, 150, MM)`,
  },
  {
    id: 'turn-to',
    title: 'Turn to a heading',
    blurb: 'Uses the inertial sensor and takes the short way round.',
    needs: ['inertial', 'left_drive', 'right_drive'],
    code: `def turn_to(heading, timeout_msec=3000):
    elapsed = 0
    while elapsed < timeout_msec:
        # heading() reads 0..360, so wrap the error into -180..180 or a turn
        # from 350 to 90 goes nearly all the way round the wrong way.
        error = (heading - inertial.heading(DEGREES) + 180) % 360 - 180
        if abs(error) <= 2:
            break
        speed = max(-30, min(30, error))
        # Proportional speed shrinks to nothing near the target; keep a floor.
        if abs(speed) < 8:
            speed = 8 if speed > 0 else -8
        left_drive.spin(FORWARD, speed, PERCENT)
        right_drive.spin(REVERSE, speed, PERCENT)
        wait(20, MSEC)
        elapsed += 20
    left_drive.stop()
    right_drive.stop()


turn_to(90)`,
  },
  {
    id: 'calibrate',
    title: 'Calibrate the inertial sensor',
    blurb: 'Do this once before the match starts, and wait for it.',
    needs: ['inertial'],
    code: `inertial.calibrate()
while inertial.is_calibrating():
    wait(50, MSEC)`,
  },
  {
    id: 'competition',
    title: 'Autonomous and driver control',
    blurb: 'The competition object runs the right one when the field switch says so.',
    needs: ['controller', 'left_drive', 'right_drive'],
    code: `def autonomous():
    # The 15 seconds nobody touches the controller.
    left_drive.spin_for(FORWARD, 720, DEGREES, False)
    right_drive.spin_for(FORWARD, 720, DEGREES)


def driver_control():
    while True:
        left_drive.spin(FORWARD, controller.axis3.position(), PERCENT)
        right_drive.spin(FORWARD, controller.axis2.position(), PERCENT)
        wait(20, MSEC)


competition = Competition(driver_control, autonomous)`,
  },
  {
    id: 'buttons',
    title: 'Run a mechanism from buttons',
    blurb: 'Hold one button to raise, another to lower, and let go to stop.',
    needs: ['controller', 'lift'],
    code: `lift.set_stopping(HOLD)

while True:
    if controller.buttonL1.pressing():
        lift.spin(FORWARD, 100, PERCENT)
    elif controller.buttonL2.pressing():
        lift.spin(REVERSE, 100, PERCENT)
    else:
        lift.stop()
    wait(20, MSEC)`,
  },
  {
    id: 'stop-on-distance',
    title: 'Stop when something is close',
    blurb: 'Drive until the distance sensor sees an object.',
    needs: ['distance', 'drivetrain'],
    code: `drivetrain.drive(FORWARD)
while distance.object_distance(MM) > 200:
    wait(20, MSEC)
drivetrain.stop()`,
  },
  {
    id: 'vision',
    title: 'Find the biggest coloured object',
    blurb: 'Take a snapshot and read where the largest match is.',
    needs: ['vision', 'SIG_1'],
    code: `vision.take_snapshot(SIG_1)
if vision.object_count > 0:
    target = vision.largest_object()
    # centerX runs 0 to 315, so about 158 is straight ahead.
    print("cx=%d cy=%d w=%d h=%d" % (
        target.centerX, target.centerY, target.width, target.height))`,
  },
  {
    id: 'print-chart',
    title: 'Chart a value live',
    blurb: 'Print name=value pairs; the terminal plots each one as it arrives.',
    needs: ['left_drive', 'right_drive'],
    code: `while True:
    print("left=%d right=%d" % (
        left_drive.velocity(PERCENT), right_drive.velocity(PERCENT)))
    wait(100, MSEC)`,
  },
  {
    id: 'screen',
    title: 'Write on the brain screen',
    blurb: 'Clear it, put the cursor where you want, then print.',
    needs: ['brain'],
    code: `brain.screen.clear_screen()
brain.screen.set_cursor(1, 1)
brain.screen.print("Battery: %d%%" % brain.battery.capacity())`,
  },
];

/** The mistakes that cost the most time, each with the reason. */
export const PITFALLS: { title: string; body: string }[] = [
  {
    title: 'A loop with no wait()',
    body: 'while True: with no wait(20, MSEC) inside starves the brain until it needs a power cycle. VEXCollab flags it before you upload.',
  },
  {
    title: 'Using a sensor before it is ready',
    body: 'Inertial and GPS sensors need calibrate(), then a wait until is_calibrating() is False. Readings before that are wrong.',
  },
  {
    title: 'Both sides driving the same way',
    body: 'Motors on opposite sides face opposite ways. Reverse one: Motor(Ports.PORT10, GearSetting.RATIO_18_1, True).',
  },
  {
    title: 'Moves that block',
    body: 'drive_for and spin_for wait until they finish. Pass False as the last argument to start the move and carry on.',
  },
  {
    title: 'Importing between your own files',
    body: 'Every .py file is joined into one program with main.py last, so there is nothing to import — a function in lib/drive.py is already callable. It also means two files defining the same name collide, and the last one wins.',
  },
  {
    title: 'Ports that are not what you think',
    body: 'Smart ports are 1–21. 3-wire devices use letters A–H, and an Encoder or Sonar takes two adjacent ones, so it must start on A, C, E or G. The Ports panel compares your code with what the brain reports.',
  },
  {
    title: 'Speeds out of range',
    body: 'Percent speed and stick positions both run from −100 to 100. Adding the two for arcade drive can reach 200, which the brain clips per side and so changes the turn.',
  },
];
