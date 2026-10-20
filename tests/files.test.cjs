/* VEXCollab - moving files between directories in a room. AGPL-3.0-only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Y = require('yjs');
const { createFile, moveFile, getFiles, readFile, basename, dirname } = require('../src/lib/collab/project.ts');

function room(files) {
  const doc = new Y.Doc();
  for (const [path, contents] of Object.entries(files)) createFile(doc, path, contents);
  return doc;
}
const keys = (doc) => [...getFiles(doc).keys()].sort();

test('moving a file keeps its contents and changes only where it lives', () => {
  const doc = room({ 'main.py': 'm', 'drive.py': 'print(1)', 'lib/util.py': 'u' });
  assert.deepEqual(moveFile(doc, 'drive.py', 'lib'), { ok: true, path: 'lib/drive.py' });
  assert.deepEqual(keys(doc), ['lib/drive.py', 'lib/util.py', 'main.py']);
  assert.equal(readFile(doc, 'lib/drive.py'), 'print(1)');
  assert.equal(getFiles(doc).has('drive.py'), false);
});

test('a file can come back out to the top level', () => {
  const doc = room({ 'main.py': 'm', 'lib/drive.py': 'x' });
  assert.deepEqual(moveFile(doc, 'lib/drive.py', ''), { ok: true, path: 'drive.py' });
  assert.deepEqual(keys(doc), ['drive.py', 'main.py']);
});

test('a move never overwrites a file that is already there', () => {
  const doc = room({ 'main.py': 'm', 'drive.py': 'top', 'lib/drive.py': 'lib' });
  assert.deepEqual(moveFile(doc, 'drive.py', 'lib'), { ok: false, reason: 'exists' });
  assert.equal(readFile(doc, 'drive.py'), 'top');
  assert.equal(readFile(doc, 'lib/drive.py'), 'lib');
});

test('main.py stays put, and nothing can take its name', () => {
  const doc = room({ 'main.py': 'm', 'lib/other.py': 'o' });
  assert.deepEqual(moveFile(doc, 'main.py', 'lib'), { ok: false, reason: 'entry' });
  assert.deepEqual(moveFile(doc, 'lib/other.py', ''), { ok: true, path: 'other.py' });
  const second = room({ 'main.py': 'm', 'lib/main.py': 'imposter' });
  assert.deepEqual(moveFile(second, 'lib/main.py', ''), { ok: false, reason: 'exists' });
  assert.equal(readFile(second, 'main.py'), 'm');
});

test('dropping on the folder a file is already in, or a missing file, changes nothing', () => {
  const doc = room({ 'main.py': 'm', 'lib/a.py': 'a' });
  assert.deepEqual(moveFile(doc, 'lib/a.py', 'lib'), { ok: false, reason: 'same' });
  assert.deepEqual(moveFile(doc, 'nope.py', 'lib'), { ok: false, reason: 'missing' });
  assert.deepEqual(keys(doc), ['lib/a.py', 'main.py']);
});

test('the move reaches a collaborator as one change', () => {
  const a = room({ 'main.py': 'm', 'x.py': 'content' });
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const seen = [];
  getFiles(b).observe(() => seen.push([...getFiles(b).keys()].sort().join(',')));
  moveFile(a, 'x.py', 'lib');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  assert.deepEqual(seen, ['lib/x.py,main.py']);
  assert.equal(readFile(b, 'lib/x.py'), 'content');
});

test('path helpers', () => {
  assert.equal(basename('a/b/c.py'), 'c.py');
  assert.equal(basename('c.py'), 'c.py');
  assert.equal(dirname('a/b/c.py'), 'a/b');
  assert.equal(dirname('c.py'), '');
});
