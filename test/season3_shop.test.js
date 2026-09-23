'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../lib/catalog');
const shop = require('../lib/shop_model');

const row = (name) => catalog.byName(name);
const pet = (name) => {
  const b = row(name);
  return { botId: b.id, atk: b.attack, hp: b.health, cost: b.cost, rarity: b.rarity };
};
const unit = (name, extra = {}) => {
  const b = row(name);
  return { botId: b.id, atk: b.attack, hp: b.health, ...extra };
};
const state = (over = {}) => ({
  season: 3, phase: { kind: 'shop', round: 0 }, gold: 10, board: [],
  shop: { pets: [pet('Webby'), pet('Imogen'), pet('WTD')], food: 'apple', item: { item: 'foamPad', cost: 2, rarity: 'common' } },
  captainOffer: ['medic', 'drill', 'chef'], seats: { front: 'hotSeat' },
  ...over,
});

test('Season 3 public bot and item catalogs are complete and typed', () => {
  assert.equal(catalog.getCatalog().filter(b => b.season <= 3).length, 179);
  assert.equal(catalog.getItems().filter(i => i.season <= 3).length, 19);
  assert.equal(catalog.itemById('foamPad').type, 'armor');
  assert.equal(catalog.itemById('killSwitch').rarity, 'mythic');
  assert.equal(catalog.itemById('unknown'), null);
  assert.equal(catalog.newestSeason(), 4);
  assert.equal(catalog.unlockedPool(2, 3).filter((b) => b.rarity === 'mythic').length, 2);
});

test('Season 3 can be identified without reclassifying Season 2 seat states', () => {
  assert.equal(shop.seasonOf({ seats: { front: 'hotSeat' } }), 2);
  assert.equal(shop.seasonOf({ captainOffer: ['drill'] }), 3);
  assert.equal(shop.seasonOf({ board: [unit('INDEXX')] }), 3);
  assert.equal(shop.seasonOf({ shop: { item: { item: 'foamPad', cost: 2 } } }), 3);
  assert.equal(shop.seasonOf({ season: 1, captain: 'chef' }), 1);
});

test('real practice state shape: pick captain, buy and equip an item', () => {
  const S = shop.normalize(state());
  assert.equal(S.season, 3);
  assert.equal(S.captain, null);
  assert.deepEqual(S.captainOffer, ['medic', 'drill', 'chef']);
  assert.deepEqual(S.itemOffer, { item: 'foamPad', cost: 2, rarity: 'common' });
  assert.equal(shop.legal(S, { type: 'pickCaptain', captain: 'banker' }), 'captain not offered');
  const C = shop.apply(S, { type: 'pickCaptain', captain: 'chef' });
  assert.equal(C.captain, 'chef');
  assert.equal(shop.foodCost(C), 2);
  const B = shop.apply(C, { type: 'buy', shopIndex: 0 });
  assert.equal(B.gold, 7);
  assert.equal(B.board[0].crew, row('Webby').crew);
  assert.equal(shop.legal(B, { type: 'equip', boardIndex: 0 }), true);
  const E = shop.apply(B, { type: 'equip', boardIndex: 0 });
  assert.equal(E.gold, 5);
  assert.equal(E.itemOffer, null);
  assert.equal(E.board[0].item, 'foamPad');
  assert.equal(shop.simUnits(E)[0].item, 'foamPad');
  assert.equal(shop.simUnits(E)[0].crew, row('Webby').crew);
  const replacement = shop.apply({ ...E, itemOffer: { item: 'laserPointer', cost: 2, rarity: 'common' } },
    { type: 'equip', boardIndex: 0 });
  assert.equal(replacement.board[0].item, 'laserPointer');
  assert.equal(replacement.gold, 3);
  const F = shop.apply({ ...E, food: 'apple' }, { type: 'feed', boardIndex: 0 });
  assert.equal(F.gold, 3);
});

test('observed shopCosts, free Scout reroll and frozen item offer', () => {
  const S = shop.normalize(state({
    captain: 'scout', captainOffer: undefined, freeRerolls: 1,
    shopCosts: { reroll: 0, food: 3 }, gold: 0,
  }));
  assert.equal(shop.rerollCost(S), 0);
  assert.equal(shop.legal(S, { type: 'reroll' }), true);
  const F = shop.apply(S, { type: 'freezeItem' });
  const R = shop.apply(F, { type: 'reroll' });
  assert.equal(R.gold, 0);
  assert.equal(R.freeRerolls, 0);
  assert.equal(shop.rerollCost(R), 1);
  assert.equal(R.itemOffer.item, 'foamPad');
  assert.equal(R.itemOffer.frozen, true);
  assert.equal(shop.legal(R, { type: 'reroll' }), 'not enough gold (0 < 1)');
  assert.equal(shop.apply(S, { type: 'reroll' }).itemOffer, null);
  assert.ok(shop.sampleReroll(S, () => 0.5).itemOffer, 'hypothetical reroll samples an item too');
});

test('Recruiter pick immediately adds a token, as in practice response', () => {
  const S = shop.normalize(state({ captainOffer: ['recruiter', 'chef', 'scout'] }));
  const R = shop.apply(S, { type: 'pickCaptain', captain: 'recruiter' });
  assert.equal(R.gold, 11);
  assert.deepEqual(R.shopCosts, { reroll: 1, food: 3 });
  assert.equal(R.freeRerolls, 0);
});

test('mythic costs 8, appears in round 3 at quarter weight, one per board', () => {
  const mythic = row('INDEXX');
  assert.equal(mythic.rarity, 'mythic');
  assert.equal(mythic.cost, 8);
  assert.equal(catalog.unlockedPool(1, 3).includes(mythic), false);
  assert.equal(catalog.unlockedPool(2, 3).includes(mythic), true);
  const C = { rarity: 'common' }, L = { rarity: 'legendary' }, M = { rarity: 'mythic' };
  const pool = [C, L, M]; // total weight 1.75
  assert.equal(shop.sampleOfferBot(pool, () => 0.1), C);
  assert.equal(shop.sampleOfferBot(pool, () => 0.7), L);
  assert.equal(shop.sampleOfferBot(pool, () => 0.95), M);
  const S = shop.normalize(state({ phase: { kind: 'shop', round: 2 }, board: [unit('Multi-model consensus')],
    shop: { pets: [pet('INDEXX'), null, null], food: 'apple' },
  }));
  assert.equal(shop.legal(S, { type: 'buy', shopIndex: 0 }), 'only one mythic bot allowed');
  assert.equal(shop.legal({ ...S, board: [] }, { type: 'buy', shopIndex: 0 }), true);
});

test('old seasons do not activate crew and item fields', () => {
  const old = shop.normalize({ phase: { round: 1 }, gold: 10, board: [unit('Webby')],
    shop: { pets: [pet('Imogen')], food: 'apple' }, seats: { front: 'hotSeat' } });
  assert.equal(old.season, 2);
  assert.equal(Object.hasOwn(old.board[0], 'crew'), false);
  assert.equal(Object.hasOwn(shop.simUnits(old)[0], 'crew'), false);
});

test('future shops restore income, preserve frozen offers and permanent gains, and consume temporary boosts', () => {
  const S = shop.normalize(state({ captain: 'banker', gold: 7,
    board: [unit('Webby', { atk: 9, hp: 12, tempAtk: 2, potato: true, item: 'energyDrink' })],
    shop: { pets: [pet('Imogen'), null, null], food: 'apple' } }));
  S.frozen[0] = true;
  const before = JSON.stringify(S), next = shop.sampleNextShop(S, 1, () => .1);
  assert.equal(next.gold, 15);
  assert.equal(next.board[0].atk, 9);
  assert.equal(next.board[0].hp, 12);
  assert.equal(next.board[0].tempAtk, 0);
  assert.equal(next.board[0].potato, false);
  assert.equal(next.board[0].item, null);
  assert.deepEqual(next.offers[0], S.offers[0]);
  assert.equal(shop.sampleNextShop({ ...S, captain: 'recruiter' }, 1, () => .1).gold, 11);
  assert.equal(shop.sampleNextShop({ ...S, captain: 'scout' }, 1, () => .1).freeRerolls, 1);
  assert.equal(JSON.stringify(S), before);
});
