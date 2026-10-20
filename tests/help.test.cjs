/* VEXCollab - the Help box's data: search, lookup under the cursor, examples. AGPL-3.0-only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  helpEntries, searchHelp, entryAtCursor, exampleFor, insertionFor, resolveSnippet, entryById,
  sameNameElsewhere, constantGroups, HELP_CATEGORIES,
} = require('../src/lib/vex/help.ts');
const { RECIPES, PITFALLS } = require('../src/lib/vex/cheatsheets.ts');

const declared = [
  { name: 'left_drive', type: 'Motor' },
  { name: 'drivetrain', type: 'DriveTrain' },
  { name: 'imu', type: 'Inertial' },
];

test('snippets resolve to the code a person would type', () => {
  assert.equal(resolveSnippet('spin(${1:FORWARD}, ${2:50}, ${3:PERCENT})'), 'spin(FORWARD, 50, PERCENT)');
  assert.equal(resolveSnippet('stop()'), 'stop()');
  assert.equal(resolveSnippet('go(${1:x})$0'), 'go(x)');
});

test('every entry is addressable, and no snippet leaves a tab stop behind', () => {
  const entries = helpEntries();
  assert.ok(entries.length > 100);
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length, 'ids are unique');
  for (const entry of entries) {
    assert.ok(HELP_CATEGORIES.includes(entry.category), `${entry.id} has a known category`);
    if (entry.snippet) assert.doesNotMatch(resolveSnippet(entry.snippet), /\$\{|\$\d/, entry.id);
    assert.equal(entryById(entry.id), entry);
  }
});

test('search puts the exact name first and still finds by description', () => {
  const spin = searchHelp('spin');
  assert.equal(spin[0].name, 'spin');
  assert.ok(spin.some((e) => e.id === 'Motor.spin_for'));
  const byWords = searchHelp('encoder position');
  assert.ok(byWords.length > 0 && byWords.every((e) => /position|encoder/i.test(`${e.name} ${e.className} ${e.detail} ${e.signature}`)));
  assert.deepEqual(searchHelp('zzzzqqqq'), []);
  assert.equal(searchHelp('').length, helpEntries().length);
});

test('the call under the cursor is found through the project\'s own variables', () => {
  const line = '    left_drive.spin(FORWARD, 50, PERCENT)';
  assert.equal(entryAtCursor(line, line.indexOf('spin') + 2, declared).id, 'Motor.spin');
  assert.equal(entryAtCursor(line, line.indexOf('left') + 1, declared).id, 'Motor.spin', 'on the variable too');
  assert.equal(entryAtCursor('drivetrain.turn_for(RIGHT, 90, DEGREES)', 14, declared).id, 'DriveTrain.turn_for');
  assert.equal(entryAtCursor('x = unknown.spin(1)', 12, declared), null, 'an undeclared receiver is not guessed');
  assert.equal(entryAtCursor('    wait(20, MSEC)', 6, declared).id, 'fn.wait');
  assert.equal(entryAtCursor('m = Motor(Ports.PORT1)', 6, declared).id, 'class.Motor');
  assert.equal(entryAtCursor('# nothing here', 3, declared), null);
});

test('examples and insertions use the names the project already has', () => {
  const spin = entryById('Motor.spin');
  assert.equal(exampleFor(spin, declared), 'left_drive.spin(FORWARD, 50, PERCENT)');
  assert.equal(insertionFor(spin, declared).text, 'left_drive.spin(${1:FORWARD}, ${2:50}, ${3:PERCENT})');
  assert.equal(insertionFor(spin, declared).snippet, true);
  // No Inertial-less project: a neutral stand-in rather than a made-up variable.
  assert.equal(exampleFor(entryById('Distance.object_distance'), declared), 'distance.object_distance(MM)');
  assert.equal(exampleFor(entryById('fn.wait'), declared), 'wait(20, MSEC)');
  assert.match(exampleFor(entryById('class.Motor'), declared), /^motor = Motor\(Ports\.PORT1, /);
});

test('a property reads as owner.name and returns are taken from the signature', () => {
  const objects = entryById('Vision.objects');
  assert.equal(exampleFor(objects, declared), 'vision.objects');
  assert.equal(insertionFor(objects, declared).snippet, false);
  assert.equal(entryById('Motor.position').returns, 'float');
  assert.equal(entryById('Motor.spin').returns, null);
});

test('parameters carry the values they accept', () => {
  const spin = entryById('Motor.spin');
  const direction = spin.params.find((p) => p.name === 'direction');
  assert.deepEqual(direction.values.map((v) => v.label), ['FORWARD', 'REVERSE']);
  assert.equal(spin.params.find((p) => p.name === 'velocity').optional, true);
});

test('the same method on several classes is listed, not merged', () => {
  const stop = entryById('Motor.stop');
  const others = sameNameElsewhere(stop).map((e) => e.className);
  assert.ok(others.includes('DriveTrain'));
  assert.ok(!others.includes('Motor'));
});

test('constants are grouped by what they are for', () => {
  const groups = constantGroups();
  const direction = groups.find((g) => g.label === 'Direction');
  assert.deepEqual(direction.items.map((i) => i.name), ['FORWARD', 'REVERSE']);
});

test('cheat sheets are complete and unambiguous', () => {
  assert.equal(new Set(RECIPES.map((r) => r.id)).size, RECIPES.length);
  for (const recipe of RECIPES) {
    assert.ok(recipe.title && recipe.blurb && recipe.code.trim(), recipe.id);
    assert.ok(recipe.needs.length > 0, recipe.id);
    assert.doesNotMatch(recipe.code, /\t/, 'indented with spaces');
  }
  assert.ok(PITFALLS.length >= 5 && PITFALLS.every((p) => p.title && p.body));
});
