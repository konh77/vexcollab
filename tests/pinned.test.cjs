/* VEXCollab - pinned rooms: persistence, passcodes and the Git round trip. AGPL-3.0-only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const load = () => import('../pinned-rooms.mjs');
// The module is ESM and loads its own copy of Yjs. Mixing in a CommonJS copy
// would make every type belong to a different library, so use the same one.
let Y;
test.before(async () => { Y = await import('yjs'); });
const quiet = () => {};
const AUTHOR = { name: 'konh', email: '145883269+konh77@users.noreply.github.com' };

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'other', GIT_AUTHOR_EMAIL: 'o@x', GIT_COMMITTER_NAME: 'other', GIT_COMMITTER_EMAIL: 'o@x' },
  }).trim();
}

/** A bare repository standing in for GitHub, optionally seeded with files. */
function remote(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vc-pinned-'));
  const bare = join(root, 'remote.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', bare);
  if (Object.keys(files).length) {
    const seed = join(root, 'seed');
    git(root, 'clone', '-q', bare, seed);
    git(seed, 'checkout', '-q', '-B', 'main');
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(join(seed, path, '..'), { recursive: true });
      writeFileSync(join(seed, path), contents);
    }
    git(seed, 'add', '-A');
    git(seed, 'commit', '-q', '-m', 'seed');
    git(seed, 'push', '-q', 'origin', 'main');
  }
  return { root, bare };
}

/** Another person working in the repository directly, not through the room. */
function colleague(env) {
  const dir = join(env.root, `colleague-${Math.random().toString(36).slice(2)}`);
  git(env.root, 'clone', '-q', env.bare, dir);
  return {
    dir,
    pull: () => git(dir, 'pull', '-q', '--rebase', 'origin', 'main'),
    write: (path, contents) => {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), contents);
    },
    remove: (path) => rmSync(join(dir, path)),
    push: (message) => {
      git(dir, 'add', '-A');
      git(dir, 'commit', '-q', '-m', message);
      git(dir, 'push', '-q', 'origin', 'main');
    },
  };
}

async function room(env, { files, doc = new Y.Doc(), dataDir } = {}) {
  const { PinnedRoom } = await load();
  const data = dataDir ?? mkdtempSync(join(tmpdir(), 'vc-data-'));
  const changes = [];
  if (files) {
    for (const [path, contents] of Object.entries(files)) {
      const text = new Y.Text();
      text.insert(0, contents);
      doc.getMap('files').set(path, text);
    }
  }
  const pinned = new PinnedRoom({
    config: {
      id: 'team', remote: env.bare, repo: null, branch: 'main', token: null, author: AUTHOR,
      debounceMs: 60_000, maxDelayMs: 60_000, pollMs: 60_000, passcodeHash: 'x',
    },
    dataDir: data,
    doc,
    onChange: (u) => changes.push(u),
    log: quiet,
  });
  await pinned.start();
  // start() kicks off a first sync in the background; settle it so a test's own
  // edits are what the next cycle sees, not a race against that one.
  await pinned.current?.catch(() => {});
  return { pinned, doc, data, changes };
}

const read = (doc, path) => doc.getMap('files').get(path)?.toString();
const edit = (doc, path, contents) => {
  const text = doc.getMap('files').get(path);
  doc.transact(() => { text.delete(0, text.length); text.insert(0, contents); }, 'client');
};
const add = (doc, path, contents) => {
  const text = new Y.Text(); text.insert(0, contents);
  doc.transact(() => doc.getMap('files').set(path, text), 'client');
};

test('a passcode is stored as a salted hash, and only the right one verifies', async () => {
  const { hashPasscode, verifyPasscode } = await load();
  const a = await hashPasscode('correct horse battery');
  const b = await hashPasscode('correct horse battery');
  assert.notEqual(a, b, 'salted, so two hashes of one passcode differ');
  assert.equal(a.includes('correct horse battery'), false);
  assert.equal(await verifyPasscode(a, 'correct horse battery'), true);
  assert.equal(await verifyPasscode(a, 'correct horse BATTERY'), false);
  assert.equal(await verifyPasscode(a, ''), false);
  assert.equal(await verifyPasscode('plaintext', 'plaintext'), false);
  assert.equal(await verifyPasscode(a, 'x'.repeat(5000)), false);
});

test('config: a missing file is none, a bad entry is skipped, ids are lowercased', async () => {
  const { loadPinnedConfig, hashPasscode } = await load();
  const dir = mkdtempSync(join(tmpdir(), 'vc-cfg-'));
  assert.deepEqual(loadPinnedConfig(join(dir, 'nope.json'), quiet), []);
  const file = join(dir, 'rooms.json');
  const hash = await hashPasscode('p');
  writeFileSync(join(dir, 'tok'), 'secret-token\n');
  writeFileSync(file, JSON.stringify({ rooms: [
    { id: 'Team', passcodeHash: hash, repo: 'o/r', tokenFile: join(dir, 'tok') },
    { id: '../bad', passcodeHash: hash },
    { id: 'nohash' },
    { id: 'badrepo', passcodeHash: hash, repo: 'not a repo' },
  ] }));
  const rooms = loadPinnedConfig(file, quiet);
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].id, 'team');
  assert.equal(rooms[0].token, 'secret-token');
});

test('the room is autosaved to the repository under the configured author', async () => {
  const env = remote();
  const { pinned, doc } = await room(env, { files: { 'main.py': 'print(1)\n', 'lib/a.py': 'a\n' } });
  await pinned.cycle();
  const check = join(env.root, 'check');
  git(env.root, 'clone', '-q', env.bare, check);
  assert.equal(readFileSync(join(check, 'main.py'), 'utf8'), 'print(1)\n');
  assert.equal(readFileSync(join(check, 'lib/a.py'), 'utf8'), 'a\n');
  assert.equal(git(check, 'log', '-1', '--format=%an <%ae>'), `${AUTHOR.name} <${AUTHOR.email}>`);
  assert.equal(pinned.status.state, 'idle');
  assert.ok(pinned.status.lastPushAt);

  edit(doc, 'main.py', 'print(2)\n');
  await pinned.cycle();
  git(check, 'pull', '-q');
  assert.equal(readFileSync(join(check, 'main.py'), 'utf8'), 'print(2)\n');
  await pinned.stop();
});

test('a room opened with no snapshot starts from the repository', async () => {
  const env = remote({ 'main.py': 'from repo\n', 'README.md': '# hi\n' });
  const { pinned, doc } = await room(env);
  assert.equal(read(doc, 'main.py'), 'from repo\n');
  assert.equal(read(doc, 'README.md'), '# hi\n');
  assert.equal(pinned.status.ready, true);
  await pinned.stop();
});

test("someone else's push reaches the room, and is announced to connected clients", async () => {
  const env = remote({ 'main.py': 'one\n' });
  const { pinned, doc, changes } = await room(env);
  const them = colleague(env);
  them.write('main.py', 'two\n');
  them.write('new.py', 'brand new\n');
  them.push('from the repo');
  await pinned.cycle();
  assert.equal(read(doc, 'main.py'), 'two\n');
  assert.equal(read(doc, 'new.py'), 'brand new\n');
  assert.ok(changes.length > 0, 'the change is relayed so open editors update');
  await pinned.stop();
});

test('both sides editing different files merges, and both survive', async () => {
  const env = remote({ 'a.py': 'a\n', 'b.py': 'b\n' });
  const { pinned, doc } = await room(env);
  edit(doc, 'a.py', 'a from room\n');
  const them = colleague(env);
  them.write('b.py', 'b from repo\n');
  them.push('repo edit');
  await pinned.cycle();
  assert.equal(read(doc, 'a.py'), 'a from room\n');
  assert.equal(read(doc, 'b.py'), 'b from repo\n');
  const check = join(env.root, 'check2');
  git(env.root, 'clone', '-q', env.bare, check);
  assert.equal(readFileSync(join(check, 'a.py'), 'utf8'), 'a from room\n');
  assert.equal(readFileSync(join(check, 'b.py'), 'utf8'), 'b from repo\n');
  await pinned.stop();
});

test('a real conflict stops, overwrites nothing on either side, and never force-pushes', async () => {
  const env = remote({ 'main.py': 'shared line\n' });
  const { pinned, doc } = await room(env);
  edit(doc, 'main.py', 'room version\n');
  const them = colleague(env);
  them.write('main.py', 'repo version\n');
  them.push('conflicting edit');
  const before = git(env.root, '--git-dir', env.bare, 'rev-parse', 'main');
  await pinned.cycle();
  assert.equal(pinned.status.state, 'conflict');
  assert.equal(read(doc, 'main.py'), 'room version\n', 'the room keeps its text');
  assert.equal(git(env.root, '--git-dir', env.bare, 'rev-parse', 'main'), before, 'the remote is untouched');
  assert.ok(!existsSync(join(pinned.repoDir, '.git', 'rebase-merge')), 'no half-finished rebase left behind');
  await pinned.stop();
});

test('deleting a file in the room deletes it in the repository', async () => {
  const env = remote({ 'keep.py': 'k\n', 'drop.py': 'd\n' });
  const { pinned, doc } = await room(env);
  doc.transact(() => doc.getMap('files').delete('drop.py'), 'client');
  await pinned.cycle();
  const check = join(env.root, 'check3');
  git(env.root, 'clone', '-q', env.bare, check);
  assert.equal(existsSync(join(check, 'drop.py')), false);
  assert.equal(existsSync(join(check, 'keep.py')), true);
  await pinned.stop();
});

test('a file deleted in the repository leaves the room', async () => {
  const env = remote({ 'keep.py': 'k\n', 'gone.py': 'g\n' });
  const { pinned, doc } = await room(env);
  const them = colleague(env);
  them.remove('gone.py');
  them.push('remove');
  await pinned.cycle();
  assert.equal(read(doc, 'gone.py'), undefined);
  assert.equal(read(doc, 'keep.py'), 'k\n');
  await pinned.stop();
});

test('restarting keeps unpushed work, and does not bring back a deleted file', async () => {
  const env = remote({ 'main.py': 'one\n', 'old.py': 'o\n' });
  const first = await room(env);
  edit(first.doc, 'main.py', 'unpushed edit\n');
  first.doc.transact(() => first.doc.getMap('files').delete('old.py'), 'client');
  await first.pinned.stop(); // writes the snapshot, no push

  const second = await room(env, { dataDir: first.data });
  assert.equal(read(second.doc, 'main.py'), 'unpushed edit\n');
  assert.equal(read(second.doc, 'old.py'), undefined, 'a deleted file stays deleted across a restart');
  await second.pinned.cycle();
  assert.equal(read(second.doc, 'old.py'), undefined);
  await second.pinned.stop();
});

test('binary and oversized repository files are never imported or deleted', async () => {
  const env = remote();
  const seed = colleague(env);
  seed.write('main.py', 'x\n');
  writeFileSync(join(seed.dir, 'logo.png'), Buffer.from([137, 80, 78, 71, 0, 1, 2, 3]));
  writeFileSync(join(seed.dir, 'huge.txt'), 'a'.repeat(300 * 1024));
  seed.push('mixed');
  const { pinned, doc } = await room(env);
  assert.equal(read(doc, 'main.py'), 'x\n');
  assert.equal(read(doc, 'logo.png'), undefined);
  assert.equal(read(doc, 'huge.txt'), undefined);
  doc.transact(() => doc.getMap('files').delete('main.py'), 'client');
  await pinned.cycle();
  const check = join(env.root, 'check4');
  git(env.root, 'clone', '-q', env.bare, check);
  assert.equal(existsSync(join(check, 'logo.png')), true, 'the binary survives');
  assert.equal(existsSync(join(check, 'huge.txt')), true);
  assert.equal(existsSync(join(check, 'main.py')), false);
  await pinned.stop();
});

test('a room cannot write outside the working tree, or through a symlink', async () => {
  const env = remote({ 'main.py': 'x\n' });
  const { pinned, doc } = await room(env);
  const victim = join(env.root, 'victim.txt');
  writeFileSync(victim, 'untouched');
  add(doc, '../victim.txt', 'pwned');
  add(doc, '/etc/passwd', 'pwned');
  add(doc, 'a/../../victim.txt', 'pwned');
  add(doc, '.git/config', 'pwned');
  symlinkSync(victim, join(pinned.repoDir, 'link.py'));
  add(doc, 'link.py', 'pwned');
  await pinned.cycle();
  assert.equal(readFileSync(victim, 'utf8'), 'untouched');
  assert.equal(readFileSync(join(pinned.repoDir, '.git', 'config'), 'utf8').includes('pwned'), false);
  await pinned.stop();
});

test('with no repository the room is kept locally and says so', async () => {
  const { PinnedRoom } = await load();
  const doc = new Y.Doc();
  const pinned = new PinnedRoom({
    config: { id: 'solo', remote: null, repo: null, branch: 'main', token: null, author: AUTHOR, debounceMs: 1000, maxDelayMs: 1000, pollMs: 5000, passcodeHash: 'x' },
    dataDir: mkdtempSync(join(tmpdir(), 'vc-solo-')), doc, log: quiet,
  });
  await pinned.start();
  assert.equal(pinned.status.ready, true);
  assert.equal(pinned.status.state, 'local');
  assert.equal(pinned.status.pushing, false);
  await pinned.stop();
});

test('a repository that cannot be reached keeps the room closed instead of opening it empty', async () => {
  const { PinnedRoom } = await load();
  const doc = new Y.Doc();
  const pinned = new PinnedRoom({
    config: { id: 'lost', remote: join(tmpdir(), 'does-not-exist.git'), repo: null, branch: 'main', token: null, author: AUTHOR, debounceMs: 1000, maxDelayMs: 1000, pollMs: 5000, passcodeHash: 'x' },
    dataDir: mkdtempSync(join(tmpdir(), 'vc-lost-')), doc, log: quiet,
  });
  await pinned.start();
  assert.equal(pinned.status.ready, false, 'not joinable, so nobody seeds a starter that the repo then collides with');
  assert.equal(pinned.status.state, 'error');
  await pinned.stop();
});

test('an edit made in the room mid-sync is held, never written over the repository\'s change', async () => {
  const { PinnedRoom } = await load();
  const env = remote({ 'main.py': 'shared\n', 'other.py': 'o\n' });

  // Edits the room in the gap between the snapshot and the import, which is the
  // window a real person's typing can land in.
  class Racy extends PinnedRoom {
    async importChanges(snapshot) {
      if (this.racing) edit(this.doc, 'main.py', 'typed during the sync\n');
      return super.importChanges(snapshot);
    }
  }
  const doc = new Y.Doc();
  const data = mkdtempSync(join(tmpdir(), 'vc-data-'));
  const racy = new Racy({
    config: { id: 'team', remote: env.bare, repo: null, branch: 'main', token: null, author: AUTHOR, debounceMs: 60000, maxDelayMs: 60000, pollMs: 60000, passcodeHash: 'x' },
    dataDir: data, doc, log: quiet,
  });
  await racy.start();
  await racy.current?.catch(() => {});

  const them = colleague(env);
  them.write('main.py', 'changed in the repo\n');
  them.push('repo edit');
  const remoteBefore = git(env.root, '--git-dir', env.bare, 'rev-parse', 'main');

  racy.racing = true;
  await racy.cycle();
  racy.racing = false;

  assert.equal(racy.status.state, 'conflict');
  assert.ok(racy.held.has('main.py'));
  assert.equal(read(doc, 'main.py'), 'typed during the sync\n', 'the room keeps what was typed');

  await racy.cycle(); // the next pass must not push the room's text over the repo's
  assert.equal(git(env.root, '--git-dir', env.bare, 'rev-parse', 'main'), remoteBefore, 'the repository was never overwritten');
  const check = join(env.root, 'check5');
  git(env.root, 'clone', '-q', env.bare, check);
  assert.equal(readFileSync(join(check, 'main.py'), 'utf8'), 'changed in the repo\n');

  // Once a person makes the two match, saving resumes.
  edit(doc, 'main.py', 'changed in the repo\n');
  await racy.cycle();
  assert.equal(racy.held.size, 0);
  assert.equal(racy.status.state, 'idle');
  await racy.stop();
});
