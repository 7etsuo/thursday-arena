'use strict';
/** A real anonymous Season 3 practice exchange, saved as a compact, auth-free fixture. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/season3-practice-seed-12345.json');
const shop = require('../lib/shop_model');
const sim = require('../lib/sim');
const catalog = require('../lib/catalog');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { isDeepStrictEqual } = require('node:util');
const { verifyBattle } = require('../tools/verify_live_practice');

const practiceRuns = ['2026-09-20', '2026-09-21'].flatMap((date) =>
  JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,
    `fixtures/season3-practice-full-matches-${date}.json.gz`)))).runs);
for (const run of practiceRuns) test(`complete official practice matches, seed ${run.report.seed}`, () => {
  let battles = 0, shopChecks = 0;
  for (const { before, action, after } of run.requests) {
    if (action.type === 'endShop') { verifyBattle(before, after); battles++; }
    if (before.phase.kind === 'shop' && !['endShop', 'reroll'].includes(action.type)) {
      const predicted = shop.apply(shop.normalize(before), action), actual = shop.normalize(after);
      for (const k of ['gold', 'food', 'captain', 'itemOffer']) assert.deepEqual(predicted[k], actual[k], k);
      assert.ok(shop.simUnitsOutcomes(predicted).some((w) =>
        isDeepStrictEqual(w.units, shop.simUnits(actual))), `${action.type} board`);
      shopChecks++;
    }
  }
  assert.equal(battles, run.report.summary.rounds);
  assert.equal(shopChecks, run.report.checks);
});

test('Season 3 practice actions: captain, purchase, and item match the server', () => {
  let state = shop.normalize(fixture.initial);
  assert.equal(state.season, 3);
  assert.equal(state.round, 0);
  assert.equal(state.gold, 10);
  assert.deepEqual(state.captainOffer, ['medic', 'drill', 'chef']);
  assert.deepEqual(state.itemOffer, { item: 'foamPad', cost: 2, rarity: 'common' });

  for (const { action, observed } of fixture.actions) {
    assert.equal(shop.legal(state, action), true, JSON.stringify(action));
    state = shop.apply(state, action);
    assert.equal(state.gold, observed.gold, JSON.stringify(action));
    assert.equal(state.captain, observed.captain, JSON.stringify(action));
    assert.equal(shop.foodCost(state), observed.shopCosts.food, JSON.stringify(action));
    assert.deepEqual(state.itemOffer, observed.shopItem, JSON.stringify(action));
    assert.equal(state.board.length, observed.board.length, JSON.stringify(action));
    for (let i = 0; i < state.board.length; i++) {
      const got = state.board[i], want = observed.board[i];
      assert.equal(got.name, catalog.byId(want.botId).name);
      for (const key of ['uid', 'atk', 'hp', 'tempAtk', 'honey']) assert.equal(got[key], want[key], key);
      assert.equal(got.item || null, want.item || null);
    }
  }

  assert.equal(shop.simUnits(state)[0].item, 'foamPad');
  assert.equal(shop.simUnits(state)[0].crew, 'builders');
});

test('Season 3 practice battle reproduces the observed frames and result', () => {
  let state = shop.normalize(fixture.initial);
  for (const { action } of fixture.actions) state = shop.apply(state, action);
  const enemy = fixture.enemyBoard.map(({ name, item }) => {
    const bot = catalog.byName(name);
    assert.ok(bot, name);
    return { name: bot.name, kitId: bot.kitId, atk: bot.attack, hp: bot.health,
      honey: false, crew: bot.crew, ...(item ? { item } : {}) };
  });
  const actual = sim.simulate(shop.simUnits(state), enemy, {
    round: 0, season: 3, seats: state.seats, ourCaptain: state.captain,
    theirCaptain: fixture.battle.rivalCaptain, frames: true,
  });
  assert.equal(actual.winner, fixture.battle.phase.winner);
  assert.deepEqual(actual.frames, fixture.battle.phase.frames);

  // The next shop keeps the permanent item and Chef's food discount.
  const next = shop.normalize({
    ...fixture.initial,
    phase: { kind: 'shop', round: fixture.nextShop.round },
    gold: fixture.nextShop.gold,
    board: fixture.nextShop.board,
    shop: { ...fixture.initial.shop, item: fixture.nextShop.shopItem },
    captain: 'chef', rivalCaptain: fixture.battle.rivalCaptain,
    shopCosts: fixture.nextShop.shopCosts,
  });
  assert.equal(next.rivalCaptain, 'drill');
  assert.equal(next.itemOffer.item, 'muteButton');
  assert.equal(next.board[0].item, 'foamPad');
  assert.equal(shop.foodCost(next), 2);
});
