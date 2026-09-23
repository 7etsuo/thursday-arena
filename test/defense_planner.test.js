'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const planner = require('../lib/planner'), sim = require('../lib/sim'), shop = require('../lib/shop_model');
const examples = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures/s3-defense-finishing.json.gz'))));

test('recorded finishing moves preserve the full match objective and converge legally', () => {
  let moves = 0;
  for (const { state, target, defenseTarget } of examples) {
    const opts = { season: state.season, round: state.round, seats: state.seats,
      ourCaptain: state.captain, theirCaptain: state.rivalCaptain, utility: planner.utility(state.round, state.series) };
    const baseline = planner.evaluate(shop.simUnits(state), target, opts).score;
    let S = state;
    for (let i = 0; i < 24; i++) {
      const move = planner.finishMove(S, { target, defenseTarget });
      if (!move) break;
      moves++;
      for (const a of move.actions) { assert.equal(shop.legal(S, a), true); S = shop.apply(S, a); }
      assert.ok(planner.evaluate(shop.simUnits(S), target, opts).score >= baseline - 1e-9);
      assert.ok(i < 23, 'must not spend forever on ties');
    }
    assert.equal(planner.finishMove(S, { target, defenseTarget }), null);
    assert.equal(planner.finishMove(state, { target, defenseTarget, finishTies: false }), null);
  }
  assert.ok(moves >= examples.length);
});

test('defense seating uses the attacker as you, honors their seats/captain, and preserves the attacking score', () => {
  let asymmetric = 0;
  for (const { state: S, target, defenseTarget } of examples.concat([require('./fixtures/s3-defense-orientation.json')])) {
    if (!defenseTarget.entries.length) continue;
    const chosen = planner.finishValue(S, target, defenseTarget);
    let reversed = 0, forward = 0;
    for (const e of defenseTarget.entries) {
      const opts = { season: 3, round: S.round, seats: e.seats, ourCaptain: e.theirCaptain, theirCaptain: S.captain };
      const w = sim.outcome(e.board, chosen.order, opts);
      reversed += w === 'them' ? 1 : w === 'draw' ? 0.5 : 0;
      const wrong = sim.outcome(chosen.order, e.board, { ...opts, ourCaptain: S.captain, theirCaptain: e.theirCaptain });
      forward += wrong === 'us' ? 1 : wrong === 'draw' ? 0.5 : 0;
    }
    assert.equal(chosen.defense, reversed / defenseTarget.entries.length);
    asymmetric += reversed !== forward;
    let seated = S;
    for (const a of planner.seatingActions(S, target, { defenseTarget })) seated = shop.apply(seated, a);
    assert.deepEqual(shop.simUnits(seated).map((u) => u.name), chosen.order.map((u) => u.name));
  }
  assert.ok(asymmetric > 0, 'fixture must detect accidentally simulating the defensive board as attacker');
});

test('extra tie spending is restricted to the final round of Season 3', () => {
  const { state, target, defenseTarget } = examples[0];
  for (const round of [0, 1]) assert.equal(planner.finishMove({ ...state, round }, { target, defenseTarget }), null);
  for (const season of [1, 2]) assert.equal(planner.finishMove({ ...state, season }, { target, defenseTarget }), null);
});

test('combined seating maximizes attack plus exposed defensive match points in the same order', () => {
  const { state: original, target, defenseTarget } = require('./fixtures/s3-defense-orientation.json');
  const S = { ...original, round: 2, series: { you: 1, them: 0 } };
  const defense = { ...defenseTarget, exposure: .4,
    entries: defenseTarget.entries.map(e => ({ ...e, series: { you: 1, them: 1 } })) };
  const objective = units => {
    const weight = target.entries.reduce((n, e) => n + e.weight, 0);
    let attack = 0;
    for (const e of target.entries) {
      const w = sim.outcome(units, e.board, { season: 3, round: 2, seats: S.seats,
        ourCaptain: S.captain, theirCaptain: S.rivalCaptain ?? e.theirCaptain });
      attack += e.weight / weight * (w === 'them' ? .5 : 1);
    }
    let d = 0;
    for (const e of defense.entries) {
      const w = sim.outcome(e.board, units, { season: 3, round: 2, seats: e.seats,
        ourCaptain: e.theirCaptain, theirCaptain: S.captain });
      d += w === 'them' ? 1 : w === 'draw' ? .5 : 0;
    }
    return attack + .4 * d / defense.entries.length;
  };
  let seated = S;
  for (const a of planner.seatingActions(S, target, { defenseTarget: defense })) seated = shop.apply(seated, a);
  const exact = Math.max(...sim.permutations(shop.simUnits(S)).map(objective));
  assert.ok(Math.abs(objective(shop.simUnits(seated)) - exact) < 1e-9);
  assert.deepEqual(planner.matchUtility(2, { you: 1, them: 0 }), { win: 1, draw: 1, loss: .5 });
  assert.equal(planner.defenseExposure(S, { defenseTarget: defense, defenseObjective: false }), 0);
});
