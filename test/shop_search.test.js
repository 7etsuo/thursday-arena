'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const planner = require('../lib/planner'), shop = require('../lib/shop_model');
const search = require('../lib/shop_search').search;
const { play } = require('../tools/eval_observed_shops');
const fixture = require('./fixtures/s3-combination-search.json');

test('bounded combination search escapes a recorded final-shop local optimum with legal actions', () => {
  const S = structuredClone(fixture.state), target = fixture.target;
  const original = structuredClone(S);
  const ctx = deepShop => ({ target, deepShop, timeBudgetMs: Infinity, rng: null });
  const before = play(S, ctx(false)), after = play(S, ctx(true));
  assert.deepEqual(before.actions, [], 'the previous policy stops at this position');
  assert.ok(after.actions.length >= 3);
  let state = S;
  for (const action of after.actions) {
    assert.equal(shop.legal(state, action), true);
    state = shop.apply(state, action);
    assert.equal(shop.simUnitsOutcomes(state).length, 1);
  }
  const value = s => planner.evaluate(shop.simUnits(s), target, { season: S.season,
    round: S.round, seats: S.seats, ourCaptain: S.captain, theirCaptain: S.rivalCaptain,
    utility: planner.utility(S.round, S.series) }).score;
  assert.ok(value(after.state) > value(before.state) + 0.03);
  assert.deepEqual(S, original, 'search never mutates the observed state');
  assert.deepEqual(play(S, ctx(true)), after, 'fixed search work is reproducible');
  assert.deepEqual(play(S, { target, timeBudgetMs: Infinity, rng: null }), before,
    'experimental deeper search is opt-in until whole-policy validation establishes a gain');
});

test('combination search respects its node limit and rejects unresolved random branches', () => {
  const S = structuredClone(fixture.state);
  const limited = search(S, { moves: planner.singleMoves, value: s => ({ score: s.gold }), maxNodes: 1 });
  assert.equal(limited.expanded, 1);
  assert.equal(limited.truncated, true);
  const expired = search(S, { moves: planner.singleMoves, value: () => ({ score: 0 }), deadline: 0 });
  assert.equal(expired.expanded, 0);
  assert.deepEqual(expired.actions, []);
  const uncertain = { ...S, pendingBuff: [{ uids: S.board.map(u => u.uid) }] };
  assert.ok(shop.simUnitsOutcomes(uncertain).length > 1);
  const blocked = search(uncertain, { moves: () => [{ actions: [{ type: 'feed', boardIndex: 0 }] }],
    value: s => ({ score: -s.gold }) });
  assert.deepEqual(blocked.actions, [], 'must observe which unit was buffed before committing a chain');
});
