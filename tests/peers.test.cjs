/* VEXCollab - who counts as "here". AGPL-3.0-only. */
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../room-peers.mjs');
const peer = (senderId, joinedAt, extra = {}) => ({ name: 'K', color: '#007aff', senderId, joinedAt, ...extra });

test('a tab that reconnected is one person, not two', async () => {
  const { visiblePeers } = await load();
  // The old connection has not been noticed as dead yet, so both are in the map.
  const peers = new Map([
    ['old-socket', peer('tab-1', 100)],
    ['new-socket', peer('tab-1', 900)],
  ]);
  const shown = visiblePeers(peers);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].id, 'new-socket', 'the newest connection is the live one');
});

test('different tabs are different people, in the order they arrived', async () => {
  const { visiblePeers } = await load();
  const peers = new Map([
    ['b', peer('tab-2', 500)],
    ['a', peer('tab-1', 100)],
    ['c', peer('tab-3', 900)],
  ]);
  assert.deepEqual(visiblePeers(peers).map((p) => p.senderId), ['tab-1', 'tab-2', 'tab-3']);
});

test('four connections from one tab show once, however many times it reconnected', async () => {
  const { visiblePeers } = await load();
  const peers = new Map(['a', 'b', 'c', 'd'].map((id, i) => [id, peer('same', i * 100)]));
  assert.equal(visiblePeers(peers).length, 1);
});

test('away is reported per tab and defaults to here', async () => {
  const { visiblePeers } = await load();
  const peers = new Map([
    ['a', peer('tab-1', 1, { idle: true })],
    ['b', peer('tab-2', 2)],
  ]);
  const shown = visiblePeers(peers);
  assert.equal(shown.find((p) => p.senderId === 'tab-1').idle, true);
  assert.equal(shown.find((p) => p.senderId === 'tab-2').idle, false);
});

test('an empty room has nobody in it, and a missing joinedAt does not throw', async () => {
  const { visiblePeers } = await load();
  assert.deepEqual(visiblePeers(new Map()), []);
  assert.equal(visiblePeers(new Map([['a', { name: 'x', color: '#000', senderId: 's' }]])).length, 1);
});

test('what is sent to browsers is only what the header needs', async () => {
  const { visiblePeers } = await load();
  const [shown] = visiblePeers(new Map([['s', peer('t', 1)]]));
  assert.deepEqual(Object.keys(shown).sort(), ['color', 'id', 'idle', 'name', 'senderId']);
});
