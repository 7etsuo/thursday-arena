'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const model = require('../lib/counter_model'), sim = require('../lib/sim');

test('robust expectation agrees with exhaustive distributions on a probability grid', () => {
  // Independent discrete optimization. Weights/radii are multiples of 1/4, so an LP vertex
  // of this transport problem lies on this grid; no implementation recurrence is reused.
  for (const values of [[0, 0.5, 1], [-1, 0.5, 0], [0.5, 0.5, 0.5], [1, -1, 1]]) {
    for (const p of [[0.25, 0.5, 0.25], [1, 0, 0], [0, 0.75, 0.25]]) {
      for (const radius of [0, 0.25, 0.5, 1]) {
        let best = Infinity;
        for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4 - a; b++) {
          const q = [a / 4, b / 4, (4 - a - b) / 4];
          if (q.reduce((s, w, i) => s + Math.abs(w - p[i]), 0) / 2 <= radius) {
            best = Math.min(best, q.reduce((s, w, i) => s + w * values[i], 0));
          }
        }
        const got = model.worstExpectation(values, p, radius);
        assert.ok(Math.abs(got.value - best) < 1e-10);
        assert.ok(got.moved <= radius + 1e-10);
        assert.ok(Math.abs(got.weights.reduce((s, w) => s + w, 0) - 1) < 1e-10);
      }
    }
  }
  assert.throws(() => model.worstExpectation([1], [0], 0));
  assert.throws(() => model.worstExpectation([1], [1], 2));
  assert.throws(() => model.weightsOf([{ weight: Number.MAX_VALUE }, { weight: Number.MAX_VALUE }]));
});

test('safety is measured on payoff differences, not two separately minimized scores', () => {
  const base = { values: [0, 1], weights: [0.5, 0.5], scenarioKey: 'same' };
  const opposite = { values: [1, 0], weights: [0.5, 0.5], scenarioKey: 'same' };
  assert.equal(model.compare(opposite, base, 0).expectedGain, 0);
  assert.equal(model.compare(opposite, base, 0.5).worstGain, -1);
  assert.throws(() => model.compare({ ...opposite, scenarioKey: 'different' }, base));
});

test('counter profiles honor defensive orientation and scenario captain/seat context', () => {
  const { state: S, target, defenseTarget } = require('./fixtures/s3-defense-orientation.json');
  const board = require('../lib/shop_model').simUnits(S);
  const e = { ...defenseTarget.entries[0], role: 'defense' };
  const opts = { season: S.season, round: S.round, seats: S.seats, ourCaptain: S.captain };
  const w = sim.outcome(e.board, board, { ...opts, seats: e.seats,
    ourCaptain: e.theirCaptain, theirCaptain: S.captain });
  assert.equal(model.payoff(board, e, opts), w === 'them' ? 1 : w === 'draw' ? 0.5 : 0);
  const ranked = model.rank(board, target.entries, { ...opts, baseline: board, radius: 1 });
  assert.ok(ranked.length);
  assert.ok(ranked.every(r => r.certificate.perScenario.every(d => d >= 0)));
  assert.throws(() => model.compare(model.profile(board, target.entries, { ...opts, seed: 123 }),
    model.profile(board, target.entries, { ...opts, seed: 456 })), /same ordered scenarios/);
  assert.equal(model.payoff(board, e, { ...opts, ourCaptain: undefined, captains: { you: S.captain } }),
    model.payoff(board, e, opts));
  assert.throws(() => model.payoff(board, { ...e, role: 'unknown' }, opts), /invalid scenario role/);
});

test('all 1,358 new complete-input fights reproduce server frames and winners', () => {
  const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures/s3-live-afternoon-20260921.json.gz'))));
  assert.equal(rows.length, 1358);
  for (const r of rows) {
    const got = sim.simulate(r.us, r.them, r.options);
    const label = `${r.matchId} round ${r.round}`;
    assert.equal(got.winner === 'us' ? 'you' : got.winner, r.winner, label);
    assert.deepEqual(got.frames, r.frames, label);
  }
});
