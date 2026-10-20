/* VEXCollab - real compiler regression tests. AGPL-3.0-only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { compilePython, MAX_SOURCE_BYTES } = require('../src/lib/vex/compiler.ts');
const { isV5Bytecode } = require('../src/lib/vex/bytecode.ts');
const { bundlePythonProject } = require('../src/lib/vex/program.ts');
const installed = existsSync(process.env.VEXCOLLAB_MPY_CROSS || join(__dirname, '../.vexcollab-tools/mpy-cross'));

test('bytecode validation rejects native emitters, wrong versions, and 64-bit integers', () => {
  assert.equal(isV5Bytecode(new Uint8Array([77, 5, 2, 31, 0])), true);
  for (const header of [[77, 6, 2, 31, 0], [77, 5, 6, 31, 0], [77, 5, 2, 63, 0], [77, 5]]) {
    assert.equal(isV5Bytecode(new Uint8Array(header)), false);
  }
});

test('source limits apply before starting a compiler', async () => {
  await assert.rejects(compilePython('   '), /Add Python/);
  await assert.rejects(compilePython('#' + 'a'.repeat(MAX_SOURCE_BYTES)), /500 KB/);
});

test('real compiler produces V5 bytecode and rebuilds changed editor contents', { skip: !installed && 'Run npm run setup:compiler' }, async () => {
  const source = message => bundlePythonProject([
    { path: 'lib/message.py', contents: `def message():\n    return ${JSON.stringify(message)}` },
    { path: 'main.py', contents: 'from vex import *\nbrain = Brain()\nbrain.screen.print(message())\n' },
  ]);
  const before = await compilePython(source('before'));
  const after = await compilePython(source('after'));
  assert.equal(isV5Bytecode(before), true);
  assert.equal(isV5Bytecode(after), true);
  assert.notDeepEqual(before, after);
  assert.deepEqual(before, await compilePython(source('before')));
});

test('compiler catches syntax errors and never executes the submitted program', { skip: !installed && 'Run npm run setup:compiler' }, async () => {
  await assert.rejects(compilePython('def broken(:\n    pass\n'), /SyntaxError/);
  const sentinel = join(tmpdir(), `vexcollab-must-not-execute-${process.pid}`);
  assert.equal(existsSync(sentinel), false);
  const bytes = await compilePython(`open(${JSON.stringify(sentinel)}, 'w').write('executed')\n`);
  assert.equal(isV5Bytecode(bytes), true);
  assert.equal(existsSync(sentinel), false);
});
