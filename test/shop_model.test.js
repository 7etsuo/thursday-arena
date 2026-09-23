'use strict';
/**
 * lib/shop_model is the planner's model of the server's shop reducer, and lib/catalog is what it reads
 * the bots from. The rules under test are docs/ENGINE_SHOP.md §1; the last test replays real recorded
 * shops so the model is checked against boards the server actually fielded.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sim = require('../lib/sim');
const catalog = require('../lib/catalog');
const shop = require('../lib/shop_model');

const ROOT = path.join(__dirname, '..');
const rngFrom = sim.mulberry32;   // the repo's one seeded stream (review R3-7)
const idOf = (name) => catalog.byName(name).id;
const names = (S) => S.board.map((u) => u.name);

/** A raw arena state (the shape /api/arena returns) built from real bot ids. */
function state(over = {}) {
  const pet = (name, frozen) => {
    const b = catalog.byName(name);
    return { botId: b.id, atk: b.attack, hp: b.health, cost: b.cost, rarity: b.rarity, frozen: !!frozen };
  };
  const unit = (name, over2 = {}, uid) => {
    const b = catalog.byName(name);
    return { uid, botId: b.id, atk: b.attack, hp: b.health, tempAtk: 0, honey: false, ...over2 };
  };
  return {
    phase: { kind: 'shop', round: over.round == null ? 1 : over.round },
    gold: over.gold == null ? 10 : over.gold,
    board: (over.board || []).map((b, i) => (typeof b === 'string' ? unit(b, {}, i + 1) : unit(b.name, b, i + 1))),
    shop: {
      pets: (over.pets || [null, null, null]).map((p) => (typeof p === 'string' ? pet(p) : p && pet(p.name, p.frozen))),
      food: over.food === undefined ? null : over.food,
    },
    wins: over.wins || { you: 0, them: 0 },
    seats: over.seats,
    seatShop: over.seatShop,
    nextUid: 99,
  };
}

// ============================================================ lib/catalog
test('catalog: 279 bots, id and name lookup, price by rarity', () => {
  const all = catalog.getCatalog();
  assert.equal(all.length, 279);   // 179 prior bots and 100 Season 4 bots
  assert.equal(all.filter((b) => b.season === 2).length, 9);   // 8 at launch + DeckLens
  assert.equal(all.filter((b) => b.season === 3).length, 98);
  assert.equal(all.filter((b) => b.season <= 3 && b.rarity === 'mythic').length, 2);
  assert.equal(all.every((b) => !!b.crew), true);
  assert.equal(catalog.byName('Webby').kitId, 'bulk');
  assert.equal(catalog.byName('company docs q a').name, 'Company Docs Q&A');   // punctuation-insensitive
  assert.equal(catalog.byName('COMPANY DOCS Q&A').kitId, 'guard');
  assert.equal(catalog.byId(idOf('Webby')).name, 'Webby');
  assert.equal(catalog.byId('nope'), null);
  assert.equal(catalog.byName('nope'), null);
  assert.deepEqual(catalog.PRICES, { common: 3, uncommon: 4, rare: 5, epic: 6, legendary: 7, mythic: 8 });
  for (const b of all) assert.equal(b.cost, catalog.PRICES[b.rarity], b.name);
});

test('catalog: unlocked pools for all four seasons', () => {
  assert.deepEqual([0, 1, 2].map((r) => catalog.unlockedPool(r, 1).length), [36, 56, 72]);
  assert.deepEqual([0, 1, 2].map((r) => catalog.unlockedPool(r, 2).length), [38, 61, 81]);
  assert.deepEqual([0, 1, 2].map((r) => catalog.unlockedPool(r, 3).length), [70, 122, 179]);
  assert.deepEqual(catalog.unlockedPool(2), catalog.unlockedPool(2, 4));        // default = newest season
  for (const r of [0, 1, 2]) {
    for (const b of catalog.unlockedPool(r, 2)) assert.equal(b.unlockTurn <= r + 1, true, b.name);
  }
  assert.equal(catalog.unlockedPool(0, 2).every((b) => b.rarity === 'common'), true);
});

test('catalog: toSimUnit folds tempAtk into atk; unknown bots degrade and warn once', () => {
  const webby = catalog.byName('Webby');
  assert.deepEqual(catalog.toSimUnit({ botId: webby.id, atk: 3, hp: 5, tempAtk: 2, honey: true }), {
    name: 'Webby', kitId: 'bulk', atk: 5, hp: 5, honey: true,
  });
  assert.deepEqual(catalog.offerToSimUnit({ botId: webby.id, atk: 3, hp: 5 }), {
    name: 'Webby', kitId: 'bulk', atk: 3, hp: 5, honey: false,
  });
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));
  try {
    const u = catalog.toSimUnit({ botId: 'season3-bot', atk: 7, hp: 9, tempAtk: 0 });
    assert.deepEqual(u, { name: 'season3-bot', kitId: null, atk: 7, hp: 9, honey: false });
    catalog.toSimUnit({ botId: 'season3-bot', atk: 7, hp: 9 });
  } finally {
    console.warn = realWarn;
  }
  assert.equal(warnings.length, 1, `warned once, got ${warnings.length}`);
});

// ============================================================ normalize
test('normalize: reads the raw arena state', () => {
  const S = shop.normalize(state({
    round: 2,
    gold: 7,
    board: [{ name: 'Webby', honey: true }, { name: 'WTD', tempAtk: 2, potato: true }],
    pets: ['Imogen', { name: 'Cooper', frozen: true }, null],
    food: 'apple',
    wins: { you: 1, them: 0 },
  }), { season: 1 });
  assert.equal(S.round, 2);
  assert.equal(S.gold, 7);
  assert.deepEqual(names(S), ['Webby', 'WTD']);
  assert.deepEqual(S.board.map((u) => [u.kitId, u.atk, u.hp, u.tempAtk, u.honey, u.potato, u.cost, u.rarity]), [
    ['bulk', 3, 5, 0, true, false, 3, 'common'],
    ['hype', 3, 4, 2, false, true, 3, 'common'],
  ]);
  assert.deepEqual(S.offers.map((o) => o && o.name), ['Imogen', 'Cooper', null]);
  assert.deepEqual(S.frozen, [false, true, false]);
  assert.equal(S.food, 'apple');
  assert.deepEqual(S.series, { you: 1, them: 0 });
  assert.equal(S.season, 1);
  assert.equal(S.seats, null);
  assert.deepEqual(shop.simUnits(S), [
    { name: 'Webby', kitId: 'bulk', atk: 3, hp: 5, honey: true },
    { name: 'WTD', kitId: 'hype', atk: 5, hp: 4, honey: false },   // atk carries tempAtk
  ]);
  // an envelope works as well as a bare state
  assert.deepEqual(shop.normalize({ state: state({ gold: 4 }) }).gold, 4);
});

test('normalize: seat rules from state.seats or the revealed state.seatShop', () => {
  const a = shop.normalize(state({ seats: { front: 'hot_seat', middle: 'warm_up' } }));
  assert.deepEqual(a.seats, { front: 'hot_seat', middle: 'warm_up' });
  assert.equal(a.season, 2);                                       // seat rules only exist from S2 on
  const b = shop.normalize(state({
    seatShop: [
      { seat: 'front', revealed: true, name: 'Hard hat', text: 'takes 1 less' },
      { seat: 'middle', revealed: false, name: 'Encore', text: '' },
    ],
  }));
  assert.deepEqual(b.seats, { front: 'hard_hat' });                // display names map to rule ids
  assert.equal(shop.normalize(state({})).seats, null);
});

// ============================================================ actions
test('buy: appends to the end, costs the rarity price, empties the slot', () => {
  const S = shop.normalize(state({ gold: 10, board: ['Webby'], pets: ['Imogen', 'Alfred', null] }));
  assert.equal(shop.legal(S, { type: 'buy', shopIndex: 0 }), true);
  const B = shop.apply(S, { type: 'buy', shopIndex: 0 });
  assert.deepEqual(names(B), ['Webby', 'Imogen']);                 // appended, not unshifted
  assert.equal(B.gold, 7);
  assert.equal(B.offers[0], null);
  assert.deepEqual(B.board[1], {
    uid: 99, name: 'Imogen', kitId: 'bulk', atk: 2, hp: 6,        // uid comes from state.nextUid
    tempAtk: 0, honey: false, potato: false, cost: 3, rarity: 'common',
  });
  assert.equal(shop.apply(B, { type: 'buy', shopIndex: 1 }).gold, 7 - 6);   // Alfred is epic: 6 gold
  assert.deepEqual(names(S), ['Webby']);                           // the input state is untouched
  assert.equal(S.gold, 10);
});

test('buy: illegal without an offer, without gold, or with a full board', () => {
  const full = shop.normalize(state({ board: ['Webby', 'Imogen', 'Cooper'], pets: ['WTD', null, null] }));
  assert.equal(shop.legal(full, { type: 'buy', shopIndex: 0 }), 'board is full');
  assert.throws(() => shop.apply(full, { type: 'buy', shopIndex: 0 }), /illegal buy: board is full/);

  const broke = shop.normalize(state({ gold: 2, pets: ['WTD', null, null] }));
  assert.equal(shop.legal(broke, { type: 'buy', shopIndex: 0 }), 'not enough gold (2 < 3)');
  const empty = shop.normalize(state({ pets: [null, 'WTD', null] }));
  assert.equal(shop.legal(empty, { type: 'buy', shopIndex: 0 }), 'no offer in slot 0');
  assert.equal(shop.legal(empty, { type: 'buy', shopIndex: 5 }), 'no offer in slot 5');
  assert.equal(shop.legal(empty, { type: 'buy', shopIndex: 1 }), true);
});

test('sell: +1 gold and the later indices shift down', () => {
  const S = shop.normalize(state({ gold: 0, board: ['Webby', 'Imogen', 'Cooper'] }));
  const A = shop.apply(S, { type: 'sell', boardIndex: 0 });
  assert.deepEqual(names(A), ['Imogen', 'Cooper']);
  assert.equal(A.gold, 1);
  assert.equal(shop.legal(A, { type: 'sell', boardIndex: 2 }), 'no unit at 2');
  assert.deepEqual(names(S), ['Webby', 'Imogen', 'Cooper']);
});

test('reroll: -1 gold, refreshes every unfrozen slot AND the food', () => {
  const S = shop.normalize(state({ gold: 1, pets: ['Webby', { name: 'Cooper', frozen: true }, 'WTD'], food: 'apple' }));
  const R = shop.apply(S, { type: 'reroll' });
  assert.equal(R.gold, 0);
  assert.deepEqual(R.offers.map((o) => o && o.name), [null, 'Cooper', null]);   // frozen card stays
  assert.equal(R.food, null);                                                   // the food is re-rolled too
  assert.equal(R.rerolls, 1);
  assert.equal(shop.legal(R, { type: 'reroll' }), 'not enough gold (0 < 1)');
  assert.throws(() => shop.apply(R, { type: 'reroll' }), /illegal reroll/);
});

// Every feed test below feeds a NON-ZERO board index and asserts the other units are untouched:
// with `boardIndex: 0` everywhere, writing the fed unit to board[0] passed the whole unit suite and
// only the corpus replay caught it (review R3-3b).
test('feed: apple is permanent, potato is tempAtk for this battle, honey is a flag', () => {
  const base = state({ gold: 10, board: ['Cooper', 'Webby', 'Imogen'], food: 'apple' });
  const untouched = (S, i) => [S.board[i].name, S.board[i].atk, S.board[i].hp, S.board[i].tempAtk, S.board[i].honey, S.board[i].potato];
  const before = shop.normalize(base);

  const A = shop.apply(before, { type: 'feed', boardIndex: 1 });
  assert.equal(A.gold, 7);
  assert.equal(A.food, null);
  assert.equal(A.board[1].name, 'Webby');
  assert.deepEqual([A.board[1].atk, A.board[1].hp, A.board[1].tempAtk], [4, 6, 0]);
  assert.deepEqual(untouched(A, 0), untouched(before, 0));
  assert.deepEqual(untouched(A, 2), untouched(before, 2));

  const pBase = shop.normalize({ ...base, shop: { pets: [null, null, null], food: 'potato' } });
  const P = shop.apply(pBase, { type: 'feed', boardIndex: 2 });
  assert.equal(P.board[2].name, 'Imogen');
  assert.deepEqual([P.board[2].atk, P.board[2].hp, P.board[2].tempAtk, P.board[2].potato], [2, 6, 2, true]);
  assert.deepEqual(shop.simUnits(P)[2].atk, 4);
  assert.deepEqual(untouched(P, 0), untouched(pBase, 0));
  assert.deepEqual(untouched(P, 1), untouched(pBase, 1));

  const hBase = shop.normalize({ ...base, shop: { pets: [null, null, null], food: 'honey' } });
  const H = shop.apply(hBase, { type: 'feed', boardIndex: 1 });
  assert.deepEqual([H.board[1].name, H.board[1].atk, H.board[1].hp, H.board[1].honey], ['Webby', 3, 5, true]);
  assert.deepEqual(untouched(H, 0), untouched(hBase, 0));
  assert.deepEqual(untouched(H, 2), untouched(hBase, 2));
});

test('feed: honey and potato replace each other; apple keeps honey', () => {
  const S = shop.normalize(state({ gold: 10, board: ['Cooper', { name: 'Webby', honey: true }], food: 'potato' }));
  const P = shop.apply(S, { type: 'feed', boardIndex: 1 });
  assert.deepEqual([P.board[1].name, P.board[1].honey, P.board[1].potato, P.board[1].tempAtk], ['Webby', false, true, 2]);
  assert.deepEqual([P.board[0].name, P.board[0].potato, P.board[0].tempAtk], ['Cooper', false, 0]);

  const back = shop.apply({ ...P, food: 'honey', gold: 10 }, { type: 'feed', boardIndex: 1 });
  assert.deepEqual([back.board[1].honey, back.board[1].potato, back.board[1].tempAtk], [true, false, 0]);
  assert.equal(back.board[0].honey, false);

  const apple = shop.apply({ ...S, food: 'apple' }, { type: 'feed', boardIndex: 1 });
  assert.equal(apple.board[1].honey, true);
  assert.deepEqual([apple.board[0].atk, apple.board[0].hp], [S.board[0].atk, S.board[0].hp]);
});

test('feed: illegal without food or gold, a second honey, a second potato', () => {
  const noFood = shop.normalize(state({ board: ['Webby'] }));
  assert.equal(shop.legal(noFood, { type: 'feed', boardIndex: 0 }), 'no food');

  const poor = shop.normalize(state({ gold: 2, board: ['Webby'], food: 'apple' }));
  assert.equal(shop.legal(poor, { type: 'feed', boardIndex: 0 }), 'not enough gold (2 < 3)');

  const honeyed = shop.normalize(state({ board: [{ name: 'Webby', honey: true }], food: 'honey' }));
  assert.equal(shop.legal(honeyed, { type: 'feed', boardIndex: 0 }), 'already honeyed');
  assert.throws(() => shop.apply(honeyed, { type: 'feed', boardIndex: 0 }), /already honeyed/);

  const spud = shop.normalize(state({ board: [{ name: 'Webby', potato: true, tempAtk: 2 }], food: 'potato' }));
  assert.equal(shop.legal(spud, { type: 'feed', boardIndex: 0 }), 'already potatoed');
  assert.equal(shop.legal(spud, { type: 'feed', boardIndex: 1 }), 'no unit at 1');
  // apple is always allowed, on a honeyed or a potatoed unit
  assert.equal(shop.legal({ ...spud, food: 'apple' }, { type: 'feed', boardIndex: 0 }), true);
  assert.equal(shop.legal({ ...honeyed, food: 'apple' }, { type: 'feed', boardIndex: 0 }), true);
});

test('freeze toggles and costs nothing; move swaps with a neighbour', () => {
  const S = shop.normalize(state({ pets: ['Webby', null, 'WTD'], board: ['Imogen', 'Cooper'] }));
  const F = shop.apply(S, { type: 'freeze', shopIndex: 0 });
  assert.deepEqual(F.frozen, [true, false, false]);
  assert.equal(F.offers[0].frozen, true);
  assert.equal(F.gold, S.gold);
  assert.deepEqual(shop.apply(F, { type: 'freeze', shopIndex: 0 }).frozen, [false, false, false]);
  assert.equal(shop.legal(S, { type: 'freeze', shopIndex: 1 }), 'no offer in slot 1');

  const M = shop.apply(S, { type: 'move', boardIndex: 1, dir: -1 });
  assert.deepEqual(names(M), ['Cooper', 'Imogen']);
  assert.equal(M.gold, S.gold);
  assert.deepEqual(names(shop.apply(S, { type: 'move', boardIndex: 0, dir: 1 })), ['Cooper', 'Imogen']);
  assert.equal(shop.legal(S, { type: 'move', boardIndex: 0, dir: -1 }), 'no neighbour at -1');
  assert.equal(shop.legal(S, { type: 'move', boardIndex: 1, dir: 1 }), 'no neighbour at 2');
  assert.equal(shop.legal(S, { type: 'move', boardIndex: 0, dir: 2 }), 'dir must be 1 or -1');
  assert.equal(shop.legal(S, { type: 'nonsense' }), 'unknown action nonsense');
  assert.equal(shop.legal(S, null), 'no action');
});

test('season-2 shop kits are booked at their expected value', () => {
  // bloom "Buy: give a random friend +1/+1": one pick over the board minus the bought unit.
  const S = shop.normalize(state({ round: 2, board: ['Webby', 'Imogen'], pets: ['coffee companion', null, null] }));
  const B = shop.apply(S, { type: 'buy', shopIndex: 0 });
  assert.deepEqual(B.board.map((u) => [u.name, u.atk, u.hp]), [
    ['Webby', 3.5, 5.5], ['Imogen', 2.5, 6.5], ['coffee companion', 2, 3],
  ]);
  // hand_off "Sell: give two random friends +1/+1": two picks over the two units left, so both get it.
  const S2 = shop.normalize(state({ round: 2, board: ['Fondi', 'Webby', 'Imogen'] }));
  const H = shop.apply(S2, { type: 'sell', boardIndex: 0 });
  assert.deepEqual(H.board.map((u) => [u.name, u.atk, u.hp]), [['Webby', 4, 6], ['Imogen', 3, 7]]);
  // with nobody left there is nothing to buff
  assert.deepEqual(shop.apply(shop.normalize(state({ board: ['Fondi'] })), { type: 'sell', boardIndex: 0 }).board, []);
});

test('bloom onto a two-unit board keeps the two concrete outcomes, not half an HP', () => {
  // The EV board is what the reducer books, but sim.js has no 5.5-HP unit: hp 5.5 survives a
  // 5-damage hit that hp 5 does not, which changed the answer for 31.6% of these boards (R1-03).
  const S = shop.normalize(state({ round: 2, board: ['Webby', 'Imogen'], pets: ['coffee companion', null, null] }));
  const B = shop.apply(S, { type: 'buy', shopIndex: 0 });
  assert.equal(B.pendingBuff.length, 1);
  assert.deepEqual(B.pendingBuff[0].uids, [B.board[0].uid, B.board[1].uid]);
  assert.equal(B.pendingBuff[0].share, 0.5);

  const outs = shop.simUnitsOutcomes(B);
  assert.equal(outs.length, 2);
  assert.deepEqual(outs.map((o) => o.p), [0.5, 0.5]);
  assert.deepEqual(outs.map((o) => o.units.map((u) => [u.name, u.atk, u.hp])), [
    [['Webby', 4, 6], ['Imogen', 2, 6], ['coffee companion', 2, 3]],
    [['Webby', 3, 5], ['Imogen', 3, 7], ['coffee companion', 2, 3]],
  ]);
  for (const o of outs) for (const u of o.units) {
    assert.ok(Number.isInteger(u.atk) && Number.isInteger(u.hp), `${u.name} ${u.atk}/${u.hp}`);
  }
  // the EV board averages back to what the reducer stored
  assert.deepEqual(shop.simUnits(B).map((u) => [u.atk, u.hp]), [[3.5, 5.5], [2.5, 6.5], [2, 3]]);

  // an apple on a marked unit rides along in both worlds
  const F = shop.apply({ ...B, food: 'apple', gold: 10 }, { type: 'feed', boardIndex: 0 });
  assert.deepEqual(shop.simUnitsOutcomes(F).map((o) => o.units[0].hp), [7, 6]);

  // and a world whose winner has been sold still owns its probability
  const sold = shop.apply(B, { type: 'sell', boardIndex: 1 });
  const so = shop.simUnitsOutcomes(sold);
  assert.deepEqual(so.map((o) => [o.p, o.units[0].atk, o.units[0].hp]), [[0.5, 4, 6], [0.5, 3, 5]]);
});

test('two fractional buffs in one shop still resolve to integral boards', () => {
  // buy bloom (2 friends) -> sell it -> buy bloom again: two independent half-buffs on the same pair.
  // Keeping only the newest group would leave half-HP units in front of the simulator.
  let S = shop.normalize(state({ round: 2, gold: 10, board: ['Webby', 'Imogen'], pets: ['coffee companion', 'coffee companion', null] }));
  S = shop.apply(S, { type: 'buy', shopIndex: 0 });
  S = shop.apply(S, { type: 'sell', boardIndex: 2 });
  S = shop.apply(S, { type: 'buy', shopIndex: 1 });
  assert.equal(S.pendingBuff.length, 2);
  const outs = shop.simUnitsOutcomes(S);
  assert.equal(outs.length, 4);
  assert.ok(Math.abs(outs.reduce((a, o) => a + o.p, 0) - 1) < 1e-12, 'the worlds are a distribution');
  for (const o of outs) for (const u of o.units) {
    assert.ok(Number.isInteger(u.atk) && Number.isInteger(u.hp), `${u.name} ${u.atk}/${u.hp}`);
  }
  // and the worlds average back to the stored mean
  const mean = shop.simUnits(S).map((u) => [u.atk, u.hp]);
  for (let i = 0; i < mean.length; i++) {
    const a = outs.reduce((s2, o) => s2 + o.p * o.units[i].atk, 0);
    const h = outs.reduce((s2, o) => s2 + o.p * o.units[i].hp, 0);
    assert.ok(Math.abs(a - mean[i][0]) < 1e-12 && Math.abs(h - mean[i][1]) < 1e-12);
  }
});

test('an integral shop buff needs no outcome split', () => {
  // bloom with ONE friend, and hand_off at every board size, are exact already.
  const one = shop.normalize(state({ round: 2, board: ['Webby'], pets: ['coffee companion', null, null] }));
  const B = shop.apply(one, { type: 'buy', shopIndex: 0 });
  assert.equal(B.pendingBuff, null);
  assert.deepEqual(shop.simUnitsOutcomes(B), [{ units: shop.simUnits(B), p: 1 }]);
  assert.deepEqual(shop.simUnits(B).map((u) => [u.atk, u.hp]), [[4, 6], [2, 3]]);

  const H = shop.apply(shop.normalize(state({ round: 2, board: ['Fondi', 'Webby', 'Imogen'] })), { type: 'sell', boardIndex: 0 });
  assert.equal(H.pendingBuff, null);
  assert.equal(shop.simUnitsOutcomes(H).length, 1);
});

test('seasonOf: one rule, from the state or from the seat-rule side channel', () => {
  // driver/play_loop.js guessed 1 where lib/shop_model.js guessed 2, for the same state (R1-06).
  assert.equal(shop.seasonOf({ season: 1, seats: { front: 'hot_seat' } }), 1);   // explicit wins
  assert.equal(shop.seasonOf({ seats: { front: 'hot_seat' } }), 2);             // newest season with seat rules
  assert.equal(shop.seasonOf({ seatShop: [] }), 2);
  assert.equal(shop.seasonOf({}), 1);
  assert.equal(shop.seasonOf(null), 1);
  assert.equal(shop.seasonOf({ state: { seats: { back: 'encore' } } }), 2);     // an envelope works too
  assert.equal(shop.normalize(state({})).season, 1);
  assert.equal(shop.normalize(state({ seats: { front: 'hot_seat' } })).season, 2);
});

test('seatsFrom rejects a seat name the simulator does not have', () => {
  assert.equal(shop.seatsFrom({ seatShop: [{ seat: 'middle seat', revealed: true, name: 'Hot seat' }] }), null);
  assert.deepEqual(shop.seatsFrom({ seatShop: [{ seat: 2, revealed: true, name: 'Hot seat' }] }), { back: 'hot_seat' });
  assert.deepEqual(shop.SEAT_NAMES, sim.SEAT_NAMES);
});

test('offerFromBot builds the offer shop_model and the mock arena both deal', () => {
  const b = catalog.byName('Alfred');
  assert.deepEqual(shop.offerFromBot(b, 2), {
    shopIndex: 2, name: 'Alfred', kitId: b.kitId, atk: b.attack, hp: b.health,
    cost: catalog.PRICES[b.rarity], rarity: b.rarity, frozen: false,
  });
});

// ============================================================ sampleReroll
test('sampleReroll: pays the gold, keeps frozen slots, draws from the unlocked pool', () => {
  const S = shop.normalize(state({ round: 1, gold: 10, pets: ['Webby', { name: 'Cooper', frozen: true }, 'WTD'], food: 'apple' }));
  const rng = rngFrom(7);
  for (let i = 0; i < 200; i++) {
    const R = shop.sampleReroll(S, rng);
    assert.equal(R.gold, 9);
    assert.equal(R.offers[1].name, 'Cooper');
    assert.equal(R.rerolls, 1);
    for (const o of R.offers) {
      const b = catalog.byName(o.name);
      assert.equal(b.unlockTurn <= 2, true, `${o.name} is not offerable at round 1`);
      assert.equal(o.cost, catalog.PRICES[b.rarity]);
      assert.equal(o.frozen, o.shopIndex === 1);
    }
    assert.equal(['apple', 'honey', 'potato'].includes(R.food), true);
  }
  // the same seed gives the same shop
  assert.deepEqual(shop.sampleReroll(S, rngFrom(3)), shop.sampleReroll(S, rngFrom(3)));
  assert.throws(() => shop.sampleReroll({ ...S, gold: 0 }, rngFrom(1)), /illegal reroll/);
});

test('sampleReroll: round-0 offers are commons only; season 1 never draws a season-2 bot', () => {
  const rng = rngFrom(11);
  const S = shop.normalize(state({ round: 0, gold: 10 }), { season: 1 });
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    for (const o of shop.sampleReroll(S, rng).offers) {
      const b = catalog.byName(o.name);
      assert.equal(b.rarity, 'common');
      assert.equal(b.season, 1);
      seen.add(o.name);
    }
  }
  assert.equal(seen.size > 30, true, `saw ${seen.size} distinct commons`);
});

test('legendary bots have half the per-bot offer weight', () => {
  const common = { name: 'common', rarity: 'common' };
  const legendary = { name: 'legendary', rarity: 'legendary' };
  const pool = [common, legendary];
  assert.equal(shop.sampleOfferBot(pool, () => 0), common);
  assert.equal(shop.sampleOfferBot(pool, () => 2 / 3 - 1e-6), common);
  assert.equal(shop.sampleOfferBot(pool, () => 2 / 3 + 1e-6), legendary);
  assert.equal(shop.sampleOfferBot(pool, () => 0.999), legendary);

  const rng = rngFrom(20260920);
  let seenLegendary = 0;
  for (let i = 0; i < 30000; i++) if (shop.sampleOfferBot(pool, rng) === legendary) seenLegendary++;
  assert.ok(Math.abs(seenLegendary / 30000 - 1 / 3) < 0.01, seenLegendary);
  assert.throws(() => shop.sampleOfferBot([], rng), /empty offer pool/);
});

test('food odds: R0 is apple/honey 50:50, R1-R2 are honey 1/2, apple 1/3, potato 1/6', () => {
  const tally = (round) => {
    const rng = rngFrom(5);
    const c = { apple: 0, honey: 0, potato: 0 };
    for (let i = 0; i < 60000; i++) c[shop.sampleFood(round, rng)] += 1;
    return c;
  };
  const r0 = tally(0);
  assert.equal(r0.potato, 0);
  assert.equal(Math.abs(r0.apple / 60000 - 0.5) < 0.01, true, JSON.stringify(r0));
  for (const round of [1, 2]) {
    const c = tally(round);
    assert.equal(Math.abs(c.honey / 60000 - 1 / 2) < 0.01, true, JSON.stringify(c));
    assert.equal(Math.abs(c.apple / 60000 - 1 / 3) < 0.01, true, JSON.stringify(c));
    assert.equal(Math.abs(c.potato / 60000 - 1 / 6) < 0.01, true, JSON.stringify(c));
  }
});

// ============================================================ replay against recorded shops
// read off lib/sim.js's kit table via shop_model, so a new shop kit cannot be missed here (R3-8)
const SHOP_KITS = shop.SHOP_KITS;

/**
 * How a unit's (atk, hp, honey) can change inside one shop: a apples (+1/+1 each), at most one potato
 * (+2 ATK, clears honey) and at most one honey (a flag). Returns the feeds that explain the change, or
 * null if nothing does. Derived from the recorded numbers alone, not from lib/shop_model.
 */
function feedsFor(base, out) {
  const apples = out.hp - base.hp;
  const rest = out.atk - base.atk - apples;
  if (apples < 0 || !Number.isInteger(apples) || (rest !== 0 && rest !== 2)) return null;
  const feeds = new Array(apples).fill('apple');
  if (rest === 2) {
    if (out.honey) return null;                    // a potatoed unit cannot end up honeyed
    feeds.push('potato');
  } else if (out.honey && !base.honey) feeds.push('honey');
  else if (!out.honey && base.honey) return null;  // only a potato takes honey away
  return feeds;
}

test('replays real recorded shops: the model rebuilds the board the server fought', () => {
  const lines = fs.readFileSync(path.join(ROOT, 'data/corpus/shops.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 9730);
  const stat = { replayed: 0, mismatch: 0, skipped: 0, buys: 0, sells: 0, feeds: 0, moves: 0, alreadySeated: 0 };
  const failures = [];

  for (const line of lines) {
    const r = JSON.parse(line);
    const s = r.shop;
    if (!s || s.gold == null || !r.you || !r.you.length) { stat.skipped += 1; continue; }
    // bloom / hand_off buff a RANDOM friend, so a recorded board cannot be reconstructed exactly
    // (resolve through the catalog: the old logs carry season-2 bots as a raw id with no kit)
    const kitOf = (u) => u.kitId || ((catalog.lookup(u) || {}).kitId) || null;
    if ([...(s.board || []), ...(s.offers || []), ...r.you].filter(Boolean).some((u) => SHOP_KITS.has(kitOf(u)))) { stat.skipped += 1; continue; }

    // ---- derive the shop's actions from (pre-shop state -> the board the server fought)
    const pre = (s.board || []).map((u, i) => ({ u, i, used: false }));
    const offers = (s.offers || []).map((o, i) => ({ o, i, used: false }));
    const plan = [];
    let explained = true;
    for (const y of r.you) {
      const kept = pre.find((p) => !p.used && p.u.name === y.name && feedsFor(p.u, y));
      if (kept) { kept.used = true; plan.push({ from: 'board', idx: kept.i, feeds: feedsFor(kept.u, y) }); continue; }
      const bought = offers.find((p) => !p.used && p.o.name === y.name && feedsFor({ ...p.o, honey: false }, y));
      if (bought) { bought.used = true; plan.push({ from: 'offer', idx: bought.i, feeds: feedsFor({ ...bought.o, honey: false }, y) }); continue; }
      explained = false;                            // bought after a reroll we never saw
      break;
    }
    if (!explained) { stat.skipped += 1; continue; }

    // ---- replay them through the model
    let S = shop.normalize({
      phase: { round: r.round },
      gold: s.gold,
      board: (s.board || []).map((u, i) => ({ ...u, uid: i + 1 })),
      shop: { pets: s.offers || [], food: s.food },
      wins: { you: r.series[0], them: r.series[1] },
      seats: r.seats || undefined,
    }, { season: r.s2 ? 2 : 1 });

    const keep = new Set(plan.filter((p) => p.from === 'board').map((p) => p.idx));
    const uidOf = new Map();
    let sells = 0;
    try {
      for (let i = (s.board || []).length - 1; i >= 0; i--) {
        if (!keep.has(i)) { S = shop.apply(S, { type: 'sell', boardIndex: i }); sells += 1; }
      }
      plan.filter((p) => p.from === 'board').sort((a, b) => a.idx - b.idx)
        .forEach((p, k) => uidOf.set(p, S.board[k].uid));
      for (const p of plan.filter((q) => q.from === 'offer')) {
        S = shop.apply(S, { type: 'buy', shopIndex: p.idx });
        uidOf.set(p, S.board[S.board.length - 1].uid);
        stat.buys += 1;
      }
      for (const p of plan) {
        for (const f of p.feeds) {
          // the log keeps only the first food of the shop; a later feed means the bot rerolled for it,
          // so charge the reroll and plant the food the server dealt.
          if (S.food !== f) { S = shop.apply(S, { type: 'reroll' }); S = { ...S, food: f }; }
          S = shop.apply(S, { type: 'feed', boardIndex: S.board.findIndex((u) => u.uid === uidOf.get(p)) });
          stat.feeds += 1;
        }
      }
    } catch (e) {
      // the recorded pre-shop snapshot is not always the first action of the shop, so some rows cannot
      // be paid for out of the gold we can see
      assert.match(e.message, /not enough gold/, `unexpected illegal action: ${e.message}`);
      stat.skipped += 1;
      continue;
    }
    assert.equal(S.gold >= 0, true, 'gold went negative');
    stat.sells += sells;

    // buy appends, so the board is often already in the order that was fought
    const want = plan.map((p) => uidOf.get(p));
    if (S.board.map((u) => u.uid).join(',') === want.join(',')) stat.alreadySeated += 1;
    for (let i = 0; i < want.length; i++) {
      let j = S.board.findIndex((u) => u.uid === want[i]);
      while (j > i) { S = shop.apply(S, { type: 'move', boardIndex: j, dir: -1 }); j -= 1; stat.moves += 1; }
    }

    stat.replayed += 1;
    const got = shop.simUnits(S);
    const exp = r.you.map((u) => ({ name: u.name, kitId: u.kitId, atk: u.atk, hp: u.hp, honey: !!u.honey }));
    if (JSON.stringify(got) !== JSON.stringify(exp)) {
      stat.mismatch += 1;
      if (failures.length < 3) failures.push({ ts: r.ts, got, exp });
    }
  }

  assert.equal(stat.mismatch, 0, `mismatches: ${JSON.stringify(failures)}`);
  assert.equal(stat.replayed > 6000, true, `only ${stat.replayed} shops replayed`);
  assert.equal(stat.buys > 9000 && stat.sells > 3000 && stat.feeds > 6000 && stat.moves > 2000, true, JSON.stringify(stat));
  // buy appends: 72% of the replayed shops were fought in exactly the order the buys produced.
  // With an unshifting buy that share drops to 17% (measured), so this pins the rule to the data.
  assert.equal(stat.alreadySeated / stat.replayed > 0.7, true, JSON.stringify(stat));
});

test('every recorded offer obeys the price and unlock rules', () => {
  const lines = fs.readFileSync(path.join(ROOT, 'data/corpus/shops.jsonl'), 'utf8').trim().split('\n');
  let offers = 0;
  let onlyById = 0;
  for (const line of lines) {
    const r = JSON.parse(line);
    for (const o of (r.shop && r.shop.offers) || []) {
      // the old bot logged a season-2 bot as its raw botId, because its catalog stopped at 72 bots
      const b = catalog.byName(o.name) || catalog.byId(o.name);
      assert.ok(b, `offer ${o.name} is not in the catalog`);
      if (!catalog.byName(o.name)) { onlyById += 1; assert.equal(b.season, 2, o.name); }
      assert.equal(o.cost, catalog.PRICES[b.rarity], o.name);
      assert.deepEqual([o.atk, o.hp], [b.attack, b.health], o.name);
      if (o.unlockTurn != null) assert.equal(o.unlockTurn, b.unlockTurn, o.name);
      assert.equal(b.unlockTurn <= r.round + 1, true, `${o.name} offered at round ${r.round}`);
      assert.equal(catalog.unlockedPool(r.round, r.s2 ? 2 : 1).includes(b), true, o.name);
      offers += 1;
    }
  }
  assert.equal(offers > 28000, true, `${offers} offers checked`);
  assert.equal(onlyById, 99);                  // every one of them resolves now
});

// ---- keep last: it leaves the merged bot in this process's module cache.
// It writes to a TEMP catalog, never data/catalog.json: node --test runs test FILES concurrently in
// separate processes, and rewriting the shared catalog under them made `npm test` flaky -- 3 red
// runs in ~15, with a different test failing each time (review R1-01).
test('setCatalog merges live rows, persists them and resets the caches', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-catalog-'));
  const tmp = path.join(dir, 'catalog.json');
  const before = fs.readFileSync(catalog.CATALOG_PATH, 'utf8');
  fs.writeFileSync(tmp, before);
  const webbyId = idOf('Webby');
  try {
    assert.equal(catalog.setCatalogPath(tmp), tmp);
    assert.equal(catalog.catalogPath(), tmp);
    const merged = catalog.setCatalog([
      { id: 'test-only-bot', name: 'Test Only Bot', kitId: 'bulk', rarity: 'common', cost: 3, unlockTurn: 1, attack: 1, health: 1, season: 2 },
      { id: webbyId, health: 9 },                            // live rows win over the stored ones
    ]);
    assert.equal(merged.length, 280);
    assert.equal(catalog.byName('test only bot').kitId, 'bulk');
    assert.equal(catalog.byName('Webby').health, 9);
    assert.equal(catalog.unlockedPool(0, 2).length, 39);     // the pool cache was reset
    assert.equal(JSON.parse(fs.readFileSync(tmp, 'utf8')).length, 280);
    assert.deepEqual(fs.readdirSync(dir), ['catalog.json'], 'the tmp write was renamed away');
    assert.equal(fs.readFileSync(catalog.CATALOG_PATH, 'utf8'), before, 'the live catalog is untouched');
  } finally {
    catalog.setCatalogPath(null);
  }
  assert.equal(catalog.catalogPath(), catalog.CATALOG_PATH);
  assert.equal(catalog.getCatalog().length, 279, 'and the real catalog is back');
});

test('catalog: an unreadable catalog names itself instead of throwing a bare SyntaxError', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-catalog-'));
  const bad = path.join(dir, 'catalog.json');
  fs.writeFileSync(bad, '[{"id":"half');                     // a torn read looks exactly like this
  try {
    catalog.setCatalogPath(bad);
    assert.throws(() => catalog.getCatalog(), (e) => {
      assert.match(e.message, /^catalog: cannot read /);
      assert.ok(e.message.includes(bad));
      return true;
    });
  } finally {
    catalog.setCatalogPath(null);
  }
  assert.equal(catalog.getCatalog().length, 279);
});
