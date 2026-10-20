/* VEXCollab - optional print-only compile/upload/run check. AGPL-3.0-only. */
const assert = require('node:assert/strict');
const { compilePython } = require('../src/lib/vex/compiler.ts');
const { findEmptySlot } = require('../src/lib/vex/upload.ts');
const { V5Terminal } = require('../src/lib/vex/terminal.ts');

module.exports = async function pythonSmoke(session, report) {
  const slot = findEmptySlot(session.getSnapshot().programs);
  assert(slot, 'The Python test requires an empty program slot.');
  const files = await session.exclusive(() => session.device.brain.listFiles());
  const runtimeFiles = await session.exclusive(() => session.device.brain.listFiles(64));
  const names = [`slot_${slot}.ini`, `slot_${slot}.bin`];
  assert(files && !files.some(file => names.includes(file.filename)), 'Test slot contains files; leaving them unchanged.');
  const payload = await compilePython('from vex import *\nbrain = Brain()\nbrain.screen.print("VEXCollab compiled OK")\nfor i in range(5):\n    print("VEXCOLLAB_MPY_TEST_OK")\n    wait(100, MSEC)\n');
  report(`Compiled ${payload.length} bytes; testing empty slot ${slot}. This stops the previous program and runs print-only code.`);
  const terminal = new V5Terminal();
  let output = '';
  let timer;
  let started = false;
  try {
    assert.equal(await session.upload({ slot, name: 'VEXCollab compile test', description: 'Temporary print-only test', payload, format: 'mpy' }), true, session.getSnapshot().lastError);
    const readback = await session.exclusive(() => session.device.brain.readFile(names[1]));
    assert.deepEqual(readback, payload, 'Bytecode readback differs');
    report('PASS: compiled bytecode uploaded and read back exactly.');
    assert.equal(await terminal.open(), true, 'Could not open the user port');
    const received = new Promise(resolve => {
      terminal.onData(chunk => {
        output += chunk;
        if (output.includes('VEXCOLLAB_MPY_TEST_OK')) resolve(true);
      });
      timer = setTimeout(() => resolve(false), 8000);
    });
    started = true;
    await session.runProgram(slot);
    const ok = await received;
    report(`Brain terminal: ${output.trim()}`);
    assert.equal(ok, true, 'The Brain did not print the compiled test marker');
    report('PASS: the real V5 Brain executed the compiled Python program.');
  } finally {
    clearTimeout(timer);
    await terminal.close();
    if (started) await session.stopProgram();
    await session.exclusive(async () => {
      const brain = session.device?.brain;
      if (!brain) throw new Error(`Reconnect and remove temporary test slot ${slot}.`);
      // Removing one slot file can also remove its companion on the Brain.
      for (const name of names) {
        const current = await brain.listFiles();
        if (current?.some(file => file.filename === name)) await brain.removeFile(name);
      }
      const fingerprint = list => list.map(file => [file.filename, file.size, file.crc32]).sort((a, b) => a[0].localeCompare(b[0]));
      assert.deepEqual(fingerprint(await brain.listFiles()), fingerprint(files));
      assert.deepEqual(fingerprint(await brain.listFiles(64)), fingerprint(runtimeFiles));
      report('PASS: test slot removed; existing programs and Python runtime retained.');
    });
  }
};
