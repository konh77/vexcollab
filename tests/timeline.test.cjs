/* VEXCollab - a pinned room's edit timeline: who changed what, and taking a change back. AGPL-3.0-only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

let Y;
let EditTimeline;
let restoreEntry;
let PinnedRoom;
let PINNED_ORIGIN;
test.before(async () => {
  Y = await import('yjs');
  ({ EditTimeline, restoreEntry } = await import('../edit-timeline.mjs'));
  ({ PinnedRoom, PINNED_ORIGIN } = await import('../pinned-rooms.mjs'));
});

const ADA = { name: 'Ada', color: '#ff0000', senderId: 'ada' };
const BO = { name: 'Bo', color: '#0000ff', senderId: 'bo' };

function room(files = { 'main.py': 'print("hi")\n' }, options = {}) {
  const doc = new Y.Doc();
  const map = doc.getMap('files');
  for (const [path, contents] of Object.entries(files)) {
    const text = new Y.Text();
    text.insert(0, contents);
    map.set(path, text);
  }
  let clock = 1_000_000;
  const seen = [];
  const timeline = new EditTimeline(doc, { now: () => clock, onChange: (entry, isNew) => seen.push([entry.id, isNew]), ...options });
  timeline.start();
  return {
    doc, timeline, seen, map,
    as: (actor, fn) => doc.transact(fn, { actor }),
    advance: (ms) => { clock += ms; },
  };
}

test('what is in the room when it starts is not a change', () => {
  const r = room();
  assert.deepEqual(r.timeline.entries, []);
});

test('an edit is recorded with who made it, where, and how much', () => {
  const r = room();
  r.as(ADA, () => r.map.get('main.py').insert(0, '# robot\n'));
  assert.equal(r.timeline.entries.length, 1);
  const [entry] = r.timeline.entries;
  assert.equal(entry.kind, 'edit');
  assert.equal(entry.path, 'main.py');
  assert.equal(entry.who.name, 'Ada');
  assert.equal(entry.added, 8);
  assert.equal(entry.removed, 0);
  assert.equal(entry.restorable, true);
  assert.deepEqual(r.timeline.versionOf(entry.id), { path: 'main.py', kind: 'edit', text: 'print("hi")\n' });
});

test('typing in a burst is one entry, and keeps how the file looked before the first keystroke', () => {
  const r = room();
  const text = r.map.get('main.py');
  for (const ch of 'abc') {
    r.as(ADA, () => text.insert(text.length, ch));
    r.advance(2000);
  }
  r.as(ADA, () => text.delete(0, 5));
  assert.equal(r.timeline.entries.length, 1);
  assert.equal(r.timeline.entries[0].added, 3);
  assert.equal(r.timeline.entries[0].removed, 5);
  assert.equal(r.timeline.versionOf(1).text, 'print("hi")\n');
  assert.deepEqual(r.seen.map(([, isNew]) => isNew), [true, false, false, false]);
});

test('a different person, a different file, or a long pause starts a new entry', () => {
  const r = room({ 'main.py': 'a\n', 'lib/x.py': 'b\n' });
  r.as(ADA, () => r.map.get('main.py').insert(0, '1'));
  r.advance(1000);
  r.as(BO, () => r.map.get('main.py').insert(0, '2'));
  r.as(BO, () => r.map.get('lib/x.py').insert(0, '3'));
  r.advance(31_000);
  r.as(BO, () => r.map.get('lib/x.py').insert(0, '4'));
  assert.deepEqual(r.timeline.entries.map((e) => [e.who.name, e.path]), [
    ['Ada', 'main.py'], ['Bo', 'main.py'], ['Bo', 'lib/x.py'], ['Bo', 'lib/x.py'],
  ]);
});

test('creating and deleting a file are entries, and a deleted file can come back', () => {
  const r = room();
  r.as(ADA, () => {
    const text = new Y.Text();
    text.insert(0, 'speed = 50\n');
    r.map.set('auton.py', text);
  });
  r.as(BO, () => r.map.delete('auton.py'));
  const [created, deleted] = r.timeline.entries;
  assert.equal(created.kind, 'create');
  assert.equal(created.added, 11);
  assert.equal(created.restorable, false);
  assert.equal(deleted.kind, 'delete');
  assert.equal(deleted.who.name, 'Bo');
  assert.equal(r.timeline.versionOf(deleted.id).text, 'speed = 50\n');

  const back = restoreEntry(r.doc, r.timeline, deleted.id, ADA);
  assert.deepEqual(back, { ok: true, path: 'auton.py', created: true });
  assert.equal(r.map.get('auton.py').toString(), 'speed = 50\n');
});

test('restoring puts the file back as it was, as a new edit that can itself be undone', () => {
  const r = room();
  r.as(BO, () => {
    const text = r.map.get('main.py');
    text.delete(0, text.length);
    text.insert(0, 'oops\n');
  });
  const bad = r.timeline.entries[0];
  r.advance(60_000);
  const out = restoreEntry(r.doc, r.timeline, bad.id, ADA);
  assert.equal(out.ok, true);
  assert.equal(out.created, false);
  assert.equal(r.map.get('main.py').toString(), 'print("hi")\n');

  const restore = r.timeline.entries.at(-1);
  assert.equal(restore.who.name, 'Ada');
  assert.equal(r.timeline.versionOf(restore.id).text, 'oops\n');
  assert.equal(restoreEntry(r.doc, r.timeline, restore.id, BO).ok, true);
  assert.equal(r.map.get('main.py').toString(), 'oops\n');
});

test('a version that was not kept cannot be restored', () => {
  const r = room({ 'big.py': 'x'.repeat(70 * 1024) });
  r.as(ADA, () => r.map.get('big.py').insert(0, '#'));
  assert.equal(r.timeline.entries[0].restorable, false);
  assert.deepEqual(restoreEntry(r.doc, r.timeline, r.timeline.entries[0].id, ADA), { ok: false, error: 'That version was not kept.' });
  assert.equal(restoreEntry(r.doc, r.timeline, 999, ADA).ok, false);
});

test('changes with no named author are attributed to "Someone", and git syncs to "Git sync"', () => {
  const r = room();
  r.doc.transact(() => r.map.get('main.py').insert(0, 'x'));
  assert.equal(r.timeline.entries[0].who.name, 'Someone');
});

test('only the newest entries are kept, and the oldest saved versions go first when they take too much room', () => {
  const r = room({ 'main.py': 'seed\n' }, { coalesceMs: 0 });
  const text = r.map.get('main.py');
  for (let i = 0; i < 320; i += 1) {
    r.advance(10);
    r.as(i % 2 ? ADA : BO, () => text.insert(0, 'x'));
  }
  assert.equal(r.timeline.entries.length, 300);
  assert.equal(r.timeline.versions.size, 300);
  assert.equal(r.timeline.entries[0].id, 21);

  const big = room({ 'a.py': 'y'.repeat(60 * 1024) }, { coalesceMs: 0 });
  const a = big.map.get('a.py');
  for (let i = 0; i < 120; i += 1) {
    big.advance(10);
    big.as(ADA, () => a.insert(0, 'z'));
  }
  assert.ok(big.timeline.versionBytes <= 6 * 1024 * 1024);
  assert.equal(big.timeline.entries.length, 120, 'entries stay');
  assert.equal(big.timeline.entries[0].restorable, false, 'the oldest version was let go');
  assert.equal(big.timeline.entries.at(-1).restorable, true);
});

test('a saved timeline reads back, and anything malformed in it is ignored', () => {
  const r = room();
  r.as(ADA, () => r.map.get('main.py').insert(0, 'one'));
  r.advance(60_000);
  r.as(BO, () => r.map.get('main.py').insert(0, 'two'));
  const saved = JSON.parse(JSON.stringify(r.timeline));

  const other = room({ 'main.py': 'twoone' + 'print("hi")\n' });
  other.timeline.load(saved);
  assert.deepEqual(other.timeline.entries.map((e) => e.who.name), ['Ada', 'Bo']);
  assert.equal(other.timeline.versionOf(2).text, 'oneprint("hi")\n');
  other.as(ADA, () => other.map.get('main.py').insert(0, '!'));
  assert.equal(other.timeline.entries.at(-1).id, 3, 'ids carry on');

  const hostile = room();
  hostile.timeline.load({ v: 1, nextId: 'x', entries: [null, { id: 'a' }, { id: 1, at: 1, kind: 'wipe', path: 'x', who: { name: 'n', senderId: 's' }, added: 0, removed: 0 }, saved.entries[0]], versions: { 1: 5, 2: 'ok' } });
  assert.equal(hostile.timeline.entries.length, 1);
  assert.equal(hostile.timeline.load({ v: 2 }), undefined);
});

test('a pinned room keeps its timeline across a restart, and records pulls as the repository', async () => {
  const data = mkdtempSync(join(tmpdir(), 'vc-timeline-'));
  const config = { id: 'team', remote: null, repo: null, branch: 'main', token: null, author: { name: 'konh', email: 'k@x' }, debounceMs: 1000, maxDelayMs: 1000, pollMs: 5000, passcodeHash: 'x' };
  const live = [];

  const doc1 = new Y.Doc();
  const first = new PinnedRoom({ config, dataDir: data, doc: doc1, log: () => {}, onTimeline: (entry, isNew) => live.push([entry.id, isNew]) });
  await first.start();
  const text = new Y.Text();
  text.insert(0, 'v1\n');
  doc1.transact(() => doc1.getMap('files').set('main.py', text), { actor: ADA });
  doc1.transact(() => doc1.getMap('files').get('main.py').insert(0, '# '), { actor: BO });
  doc1.transact(() => doc1.getMap('files').get('main.py').insert(0, 'repo '), PINNED_ORIGIN);
  assert.deepEqual(first.timeline.entries.map((e) => [e.kind, e.who.name]), [['create', 'Ada'], ['edit', 'Bo'], ['edit', 'Git sync']]);
  assert.ok(live.length >= 3);
  await first.stop();

  const second = new PinnedRoom({ config, dataDir: data, doc: new Y.Doc(), log: () => {} });
  await second.start();
  assert.deepEqual(second.timeline.entries.map((e) => e.who.name), ['Ada', 'Bo', 'Git sync']);
  assert.equal(second.timeline.versionOf(2).text, 'v1\n');
  await second.stop();
});
