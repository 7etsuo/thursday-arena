'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const planner = require('../lib/planner'), shop = require('../lib/shop_model'), sim = require('../lib/sim');
const { state, target } = require('./fixtures/s3-combination-search.json');

test('alternative reroll estimates share draws and remain deterministic with a fixed work budget', () => {
  const original = shop.sampleReroll, streams = new Map();
  shop.sampleReroll = (S, rng) => {
    const next = original(S, rng), samples = streams.get(rng) || [];
    samples.push({ offers: next.offers, food: next.food, item: next.itemOffer });
    streams.set(rng, samples);
    return next;
  };
  const plan = () => planner.planStep(state, { target, timeBudgetMs: Infinity,
    pairedRerolls: true, rng: sim.mulberry32(887), deepShop: false });
  try {
    const first = plan();
    assert.ok(streams.size > 1, 'compare multiple reroll alternatives');
    const samples = [...streams.values()];
    for (const row of samples.slice(1)) assert.deepEqual(row[0], samples[0][0],
      'unfrozen alternatives use identical first sampled offers, food and equipment');
    assert.deepEqual(plan(), first);
  } finally {
    shop.sampleReroll = original;
  }
});
