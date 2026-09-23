#!/usr/bin/env node
'use strict';
/** Isolate known-offer purchase search on chronological recorded final-round shops.
 * Rerolls are disabled in both arms because their counterfactual contents were not observed.
 * Complete games with sampled shops are tested separately by eval_versions.js.
 * node tools/eval_observed_shops.js ANALYSIS_DIR NEW_OUTPUT.json [--limit N]
 */
const fs = require('node:fs'), path = require('node:path');
const planner = require('../lib/planner'), shop = require('../lib/shop_model'), sim = require('../lib/sim');
function play(initial, ctx) {
  let S = initial; const actions = [];
  for (let step = 0; step < 32; step++) {
    const next = planner.planStep(S, ctx);
    if (!next.actions.length) {
      for (const a of planner.seatingActions(S, ctx.target, ctx)) S = shop.apply(S, a);
      return { state: S, actions };
    }
    for (const a of next.actions) {
      if (shop.legal(S, a) !== true) throw new Error('illegal counterfactual action');
      S = shop.apply(S, a);
      if (shop.simUnitsOutcomes(S).length !== 1) return null;
      actions.push(a);
    }
  }
  throw new Error('shop policy did not converge');
}
function evaluate(dir, limit = Infinity) {
  const rows = JSON.parse(fs.readFileSync(path.join(dir, 'shop-rows.json')))
    .filter(r => r.round === 2 && r.battle && r.state.board.length === 3).slice(0, limit);
  const result = [], examples = [];
  for (const r of rows) {
    const ctx = deepShop => ({ target: r.target, futureTargets: r.futureTargets,
      deepShop, timeBudgetMs: Infinity, rng: null, cache: new Map() });
    const a = play(r.state, ctx(false)), b = play(r.state, ctx(true));
    if (!a || !b) continue;
    const points = w => w === 'us' ? 1 : w === 'draw' ? 0.5 : 0;
    const utility = planner.utility(2, r.state.series);
    const opts = { ...r.simOptions, theirCaptain: r.state.rivalCaptain, utility };
    const modelA = planner.evaluate(shop.simUnits(a.state), r.target, opts).score;
    const modelB = planner.evaluate(shop.simUnits(b.state), r.target, opts).score;
    const before = points(sim.outcome(shop.simUnits(a.state), r.exactThem, r.simOptions));
    const after = points(sim.outcome(shop.simUnits(b.state), r.exactThem, r.simOptions));
    const out = { matchId: r.matchId, round: 2, before, after, modelBefore: modelA, modelAfter: modelB,
      actionsBefore: a.actions, actionsAfter: b.actions };
    result.push(out);
    if (modelB > modelA + 1e-9 && examples.length < 8) examples.push({ state: r.state, target: r.target, ...out });
    if (result.length % 50 === 0) console.error(`${result.length}/${rows.length}`);
  }
  const summary = { eligible: rows.length, evaluated: result.length, stochasticExcluded: rows.length - result.length,
    before: result.reduce((s, r) => s + r.before, 0), after: result.reduce((s, r) => s + r.after, 0),
    improved: result.filter(r => r.after > r.before).length, worsened: result.filter(r => r.after < r.before).length,
    modelImproved: result.filter(r => r.modelAfter > r.modelBefore + 1e-9).length,
    modelWorsened: result.filter(r => r.modelAfter < r.modelBefore - 1e-9).length,
    limits: 'Recorded R2 starting teams and initial offers; rerolls disabled equally; unresolved random shop branches excluded. No changed earlier rounds, captain, matchmaking, learning, or defense. These round scores are not whole-policy win rates.' };
  return { summary, results: result, examples };
}
if (require.main === module) {
  const [dir, out, ...args] = process.argv.slice(2);
  if (!dir || !out) throw new Error('Usage: node tools/eval_observed_shops.js ANALYSIS_DIR NEW_OUTPUT.json [--limit N]');
  const i = args.indexOf('--limit'), limit = i < 0 ? Infinity : Number(args[i + 1]);
  if (!(limit > 0)) throw new Error('invalid limit');
  const result = evaluate(path.resolve(dir), limit);
  fs.writeFileSync(out, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(result.summary, null, 2));
}
module.exports = { evaluate, play };
