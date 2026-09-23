'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { repair } = require('../tools/repair_book_archive');

const board = (honey = false) => [{ name: 'Event Producer', kitId: 'spite', atk: 3, hp: 3, honey }];
const row = (b, stamps) => ({ board: b, seats: null, n: stamps.length,
  firstTs: stamps[0], lastTs: stamps[stamps.length - 1], ts: stamps.slice(), matchId: 'local_1' });

test('historical repair refuses Season 3 records before changing item-aware observations', () => {
  const data = { format: 1, entries: { '3|other|1': [row([{ ...board()[0], item: 'stapler' }], [1000])] } };
  const before = JSON.stringify(data);
  assert.throws(() => repair(data, { full: [{ season: 3 }], pairs: [], empty: 0 }), /Season 1\/2 records only/);
  assert.equal(JSON.stringify(data), before);
});

test('archive repair removes only the uniquely identified duplicate stamp', () => {
  const original = { ts: new Date(1000).toISOString(), session: 's', handle: 'Other',
    round: 1, season: 2, them: board(), us: board(), frames: [] };
  const duplicate = { ...original, ts: new Date(1250).toISOString(), us: [] };
  const data = { format: 1, entries: { '2|other|1': [row(board(), [1000, 1251, 9000])] } };
  const stats = repair(data, { full: [], pairs: [{ original, duplicate }], empty: 1 });
  assert.equal(stats.duplicateStampsRemoved, 1);
  assert.deepEqual(data.entries['2|other|1'][0].ts, [1000, 9000]);
  assert.equal(data.entries['2|other|1'][0].n, 2);
});

test('archive repair leaves ambiguous and evicted observations alone', () => {
  const original = { ts: new Date(1000).toISOString(), session: 's', handle: 'Other',
    round: 1, season: 2, them: board(), us: board(), frames: [] };
  const duplicate = { ...original, ts: new Date(1250).toISOString(), us: [] };
  const data = { format: 1, entries: { '2|other|1': [row(board(), [1000, 1250, 1251])] } };
  const stats = repair(data, { full: [], pairs: [{ original, duplicate }], empty: 1 });
  assert.equal(stats.duplicateStampsRemoved, 0);
  assert.equal(stats.duplicateStampsAbsentOrAmbiguous, 1);
  assert.deepEqual(data.entries['2|other|1'][0].ts, [1000, 1250, 1251]);
});
