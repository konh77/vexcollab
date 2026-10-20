/* VEXCollab - upload regression checks. AGPL-3.0-only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProgramFile, inferProgramName, findEmptySlot, MAX_PROGRAM_BYTES } = require('../src/lib/vex/upload.ts');
const { V5Session } = require('../src/lib/vex/session.ts');

test('file selection rejects source, empty files, and oversized binaries', () => {
  for (const file of [
    { name: 'main.py', size: 10 }, { name: 'empty.bin', size: 0 },
    { name: 'big.bin', size: MAX_PROGRAM_BYTES + 1 }, { name: 'bad.bin', size: NaN },
  ]) assert.equal(typeof validateProgramFile(file), 'string');
  assert.equal(validateProgramFile({ name: 'PROGRAM.BIN', size: MAX_PROGRAM_BYTES }), null);
});

test('suggested names fit the descriptor and slot choice preserves occupied slots', () => {
  assert.equal(inferProgramName('Autonomous.BIN'), 'Autonomous');
  assert.equal(inferProgramName('"\n.bin'), 'VEXCollab');
  assert.equal(inferProgramName('a'.repeat(50) + '.bin').length, 23);
  assert.equal(findEmptySlot([]), 1);
  assert.equal(findEmptySlot([1, 2, 3, 4].map(slot => ({ slot }))), 5);
  assert.equal(findEmptySlot([1, 2, 3, 4, 5, 6, 7, 8].map(slot => ({ slot }))), null);
});

const request = () => ({ slot: 5, name: 'Test', description: 'Check', payload: new Uint8Array([1, 2, 3]) });
function mockSession(result = true) {
  const session = new V5Session();
  const calls = [];
  session.device = { isConnected: true, brain: {
    uploadProgram: async (ini, bytes, cold, progress) => {
      calls.push({ kind: 'program', ini, bytes, cold });
      progress('BIN', 1, 3);
      if (result instanceof Error) throw result;
      return result;
    },
    listProgram: async () => [],
  } };
  session.connection = {
    stopProgram: async () => { calls.push({ kind: 'stop' }); },
    uploadFileToDevice: async file => { calls.push({ kind: 'file', file }); return result; },
  };
  return { session, calls };
}

test('successful upload stops first, never autoruns, and clears progress', async () => {
  const { session, calls } = mockSession();
  assert.equal(await session.upload({ ...request(), name: 'A"\nB', description: 'C\r\nD' }), true);
  assert.deepEqual(calls.map(c => c.kind), ['stop', 'program']);
  assert.equal(calls[1].ini.autorun, false);
  assert.equal(calls[1].ini.program.slot, 4);
  assert.equal(calls[1].ini.baseName, 'slot_5');
  assert.equal(calls[1].ini.program.name, 'A  B');
  assert.equal(calls[1].ini.program.description, 'C  D');
  assert.equal(session.getSnapshot().transfer, null);
  assert.equal(session.getSnapshot().lastError, null);
  assert.equal(session.getSnapshot().programsLoaded, true);
});

test('vendor uploads also leave the program stopped', async () => {
  const { session, calls } = mockSession();
  assert.equal(await session.upload({ ...request(), vendor: 1 }), true);
  const files = calls.filter(c => c.kind === 'file').map(c => c.file);
  assert.deepEqual(files.map(f => [f.filename, f.autoRun]), [['slot_5.ini', false], ['slot_5.bin', false]]);
});

test('failed transfers report an error and release progress for retry', async () => {
  for (const result of [false, undefined, new Error('USB removed')]) {
    const { session } = mockSession(result);
    // Passing undefined intentionally tests the vendor no-result case.
    if (result === undefined) session.device.brain.uploadProgram = async () => undefined;
    assert.equal(await session.upload(request()), false);
    assert.equal(typeof session.getSnapshot().lastError, 'string');
    assert.equal(session.getSnapshot().transfer, null);
    session.device.brain.uploadProgram = async () => true;
    assert.equal(await session.upload(request()), true);
    assert.equal(session.getSnapshot().lastError, null);
  }
});

test('invalid requests never stop the robot or write files', async () => {
  for (const invalid of [
    { slot: 0 }, { slot: 9 }, { slot: 1.5 },
    { payload: new Uint8Array() }, { payload: new Uint8Array(MAX_PROGRAM_BYTES + 1) },
    { coldPayload: new Uint8Array() },
  ]) {
    const { session, calls } = mockSession();
    assert.equal(await session.upload({ ...request(), ...invalid }), false);
    assert.equal(calls.length, 0);
  }
  const session = new V5Session();
  assert.equal(await session.upload(request()), false);
  assert.match(session.getSnapshot().lastError, /Connect/);
});

test('missing or ambiguous slot listings never mark a brain ready for upload', async () => {
  for (const programs of [undefined, [{ slot: -1 }], [{ slot: 8 }]]) {
    const { session } = mockSession();
    session.device.brain.listProgram = async () => programs;
    await session.refreshPrograms();
    assert.equal(session.getSnapshot().programsLoaded, false);
    assert.equal(typeof session.getSnapshot().lastError, 'string');
  }
});

test('uploads are serialized, including while the first transfer is pending', async () => {
  const { session } = mockSession();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const order = [];
  session.device.brain.uploadProgram = async ini => {
    order.push(ini.program.name);
    if (ini.program.name === 'First') await gate;
    order.push('done');
    return true;
  };
  const first = session.upload({ ...request(), name: 'First' });
  const second = session.upload({ ...request(), name: 'Second' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['First']);
  release();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(order, ['First', 'done', 'Second', 'done']);
});

test('Python upload checks the installed runtime before stopping or writing', async () => {
  const { session, calls } = mockSession();
  session.device.brain.listFiles = async () => [];
  assert.equal(await session.upload({ ...request(), format: 'mpy', payload: new Uint8Array([77, 5, 2, 31, 0]) }), false);
  assert.match(session.getSnapshot().lastError, /runtime not found/);
  assert.equal(calls.length, 0);
});

test('Python bytecode links to the existing VM and never overwrites or starts it', async () => {
  const { session, calls } = mockSession();
  session.device.brain.listFiles = async vendor => {
    assert.equal(vendor, 64);
    return [{ filename: 'python_vm.bin', size: 197520, loadAddress: 0x03800000 }];
  };
  const payload = new Uint8Array([77, 5, 2, 31, 0]);
  assert.equal(await session.upload({ ...request(), format: 'mpy', payload }), true);
  const files = calls.filter(c => c.kind === 'file').map(c => c.file);
  assert.deepEqual(files.map(f => f.filename), ['slot_5.ini', 'slot_5.bin']);
  const program = files[1];
  assert.equal(program.vendor, 1);
  assert.equal(program.loadAddress, 0x07000000);
  assert.equal(program.linkedFile.filename, 'python_vm.bin');
  assert.equal(program.linkedFile.vendor, 64);
  assert.equal(program.autoRun, false);
  assert.deepEqual(program.buf, payload);
});
