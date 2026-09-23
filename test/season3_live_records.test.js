'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sim = require('../lib/sim');
const planner = require('../lib/planner');
const shop = require('../lib/shop_model');

// Exact server boards plus independently logged seats/captains. No rule metadata is
// inferred from the expected frames, and all input records remain immutable.
test('all 337 supplied live Season 3 battles replay frame for frame', () => {
  const records = fs.readFileSync(path.join(__dirname,
    '../data/corpus/s3_live_battles_2026-09-21.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 337);
  for (const r of records) {
    const before = JSON.stringify(r);
    const got = sim.simulate(r.us, r.them, r.options);
    const label = `${r.matchId} round ${r.round}`;
    assert.equal(got.winner === 'us' ? 'you' : got.winner, r.winner, label);
    assert.deepEqual(got.frames, r.frames, label);
    assert.equal(JSON.stringify(r), before, `${label}: mutated inputs`);
  }
});

test('a reduced target cannot end the recorded 12-token shop with an affordable improvement', () => {
  const { state, target } = require('./fixtures/live-shop-stop-2026-09-21.json');
  // Zero budget forces sample reduction deterministically, without wall-clock thresholds.
  const ctx = () => ({ target, timeBudgetMs: 0, rng: sim.mulberry32(123) });
  const old = planner.planStep(state, { ...ctx(), verifyStop: false, finishTies: false });
  assert.equal(old.done, true, 'the reduced sample reproduces the original false stop');
  const next = planner.planStep(state, ctx());
  assert.ok(next.actions.length > 0);
  assert.match(next.reason, /full-target stop check/);
  let after = state;
  for (const action of next.actions) {
    assert.equal(shop.legal(after, action), true);
    after = shop.apply(after, action);
  }
  const options = { season: state.season, round: state.round, seats: state.seats,
    ourCaptain: state.captain, theirCaptain: state.rivalCaptain,
    utility: planner.utility(state.round, state.series) };
  const beforeScore = planner.evaluate(shop.simUnits(state), target, options).score;
  const afterScore = shop.simUnitsOutcomes(after).reduce((s, x) =>
    s + x.p * planner.evaluate(x.units, target, options).score, 0);
  assert.ok(afterScore > beforeScore, `${afterScore} must improve ${beforeScore}`);
  assert.equal(next.value, beforeScore, 'reported scores use the full target');
});
