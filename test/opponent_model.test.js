'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bookLib = require('../lib/book');
const model = require('../lib/opponent_model');
const target = require('../lib/target');
const sim = require('../lib/sim');
const zlib = require('node:zlib');
const unit = (n) => [{ name: `unit${n}`, kitId: null, atk: n + 1, hp: 5 }];

test('recent population survives board eviction and excludes incoming defenses', () => {
  const b = bookLib.open('/unused', { empty: true });
  for (let i = 0; i < 120; i++) b.record({ season: 3, round: 0, handle: i < 20 ? 'old' : 'active',
    board: unit(i), ts: i + 1, matchId: `m${i}`, role: 'attack' });
  for (let i = 0; i < 300; i++) b.record({ season: 3, round: 0, handle: 'attacker',
    board: unit(999), ts: 200 + i, matchId: `d${i}`, role: 'defense' });
  assert.equal(b.lookup(3, 'active', 0).length, 5);
  const pool = b.pool(3, 0, { policy: 'recent', limit: 100 });
  assert.equal(pool.length, 100);
  assert.ok(pool.every((r) => r.board[0].atk >= 21 && r.board[0].atk <= 120));
  assert.equal(b.data().outgoing.length, 120);
  assert.equal(b.pool(3, 0, { policy: 'recent', beforeTs: 11, limit: 100 }).length, 10);
});

test('outgoing sample is bounded, persisted, idempotent and merged on save', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-forecast-test-'));
  try {
    const file = path.join(dir, 'book.json'), b = bookLib.open(file, { now: () => 1000 });
    for (let i = 0; i < 430; i++) b.record({ season: 3, round: 0, handle: 'alice', board: unit(i),
      ts: i + 1, matchId: `m${i}`, role: 'attack', observationId: `a${i}` });
    b.save();
    const a = bookLib.open(file, { now: () => 1000 }), c = bookLib.open(file, { now: () => 1000 });
    const obs = { season: 3, round: 1, handle: 'alice', board: unit(1), ts: 900,
      matchId: 'new', role: 'attack', observationId: 'new:1' };
    a.record(obs); a.save(); c.record(obs); c.save();
    const loaded = bookLib.open(file);
    assert.equal(loaded.data().outgoing.length, 401);
    assert.equal(loaded.data().outgoing.filter((r) => r.matchId === 'new').length, 1);
    assert.equal(loaded.lookup(3, 'alice', 1)[0].n, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('recent queue expires after an hour and a single-handle queue does not revive stale opponents', () => {
  const b = bookLib.open('/unused', { empty: true });
  b.record({ season: 3, round: 0, handle: 'stale', board: unit(1), ts: 1 });
  b.record({ season: 3, round: 0, handle: 'active', board: unit(2), ts: 100, matchId: 'a', role: 'attack' });
  assert.deepEqual(b.pool(3, 0, { policy: 'recent', excludeHandle: 'active', beforeTs: 101 }), []);
  assert.equal(model.recent(b.data(), 3, 0, 3600101).length, 0);
});

test('confidence responds to prediction errors and recovers without future leakage', () => {
  const data = {};
  const add = (i, outcome) => model.append(data, { season: 3, round: 1, handle: 'alice',
    board: unit(1), ts: i + 1, matchId: String(i), outcome,
    forecast: { book: [1, 0, 0], pool: [0, 0, 1] } });
  for (let i = 0; i < 32; i++) add(i, 'them');
  const low = model.confidence(data, 3, 1, 'alice', .75);
  assert.ok(low < .15, String(low));
  for (let i = 32; i < 64; i++) add(i, 'you');
  assert.equal(model.confidence(data, 3, 1, 'alice', .75, 33), low);
  assert.ok(model.confidence(data, 3, 1, 'alice', .75) > .9);
});

test('zero-confidence components remain measurable so confidence can recover', () => {
  const b = bookLib.open('/unused', { empty: true });
  b.record({ season: 3, round: 0, handle: 'a', board: unit(3), ts: 1 });
  b.record({ season: 3, round: 0, handle: 'b', board: unit(1), ts: 2 });
  const t = target.build({ book: b, season: 3, round: 0, prevHandle: 'a', bookWeight: 0 });
  assert.equal(t.entries.some((e) => e.source === 'book'), false);
  assert.ok(model.validForecast(target.forecast(unit(2), t, { season: 3, round: 0 })));
});

test('all 7,250 September 22 fights replay with exact independently logged inputs', () => {
  const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures/s3-live-20260922.json.gz'))));
  assert.equal(rows.length, 7250);
  for (const r of rows) {
    const got = sim.simulate(r.us, r.them, r.options), label = `${r.matchId} r${r.round}`;
    assert.equal(got.winner === 'us' ? 'you' : got.winner, r.winner, label);
    assert.deepEqual(got.frames, r.frames, label);
  }
});
