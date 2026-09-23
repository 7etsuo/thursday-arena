#!/usr/bin/env node
'use strict';
/** Chronological final-shop counterfactual. Requires the extracted evidence/analysis directory
 * from docs/results/log-review-2026-09-21/evidence.tgz. No network or writes to learned memory.
 * Training uses defensive replays at least 60 seconds older than each shop. Held-out defenses
 * are scored only when their original board matches that shop's recorded saved board exactly.
 */
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const history = require('../lib/public_history'), planner = require('../lib/planner');
const shop = require('../lib/shop_model'), sim = require('../lib/sim'), book = require('../lib/book');
const key = (b) => book.boardKey(book.normBoard(b));
const sc = (w) => w === 'us' ? 1 : w === 'draw' ? 0.5 : 0;
function evaluate(dir) {
  const rows = JSON.parse(fs.readFileSync(path.join(dir, 'shop-rows.json'))).filter((r) => r.finalState && r.exactThem && r.battle);
  const saved = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '../test/fixtures/s3-defense-history-20260921.json.gz'))));
  const attacks = saved.history.filter((r) => saved.details[r.id]).map((raw) => {
    const row = history.rowOf(raw, 'tetsuoai', 3), detail = saved.details[row.id];
    return { ...row, rounds: history.replayInputs(detail, row, 'tetsuoai', 3), detail };
  }).sort((a, b) => b.ts - a.ts);
  const defenseRows = JSON.parse(fs.readFileSync(path.join(dir, 'defense-rounds.json')));
  const results = [], examples = [];
  for (const r of rows) {
    const S = r.finalState;
    const training = attacks.filter((a) => a.ts < Date.parse(r.ts) - 60000)
      .flatMap((a) => a.rounds.filter((x) => x.round === r.round && x.seats).map((x) => ({ ...x, weight: 1, theirCaptain: x.captain, source: 'defense' }))).slice(0, 24);
    const context = { target: r.target, defenseTarget: { entries: training } };
    const baseline = planner.evaluate(shop.simUnits(S), r.target, { ...r.simOptions,
      ourCaptain: S.captain, theirCaptain: S.rivalCaptain, utility: planner.utility(S.round, S.series) });
    const beforeFinish = planner.finishValue(S, r.target, context.defenseTarget);
    let after = S, actions = [];
    for (let step = 0; step < 24; step++) {
      const move = planner.finishMove(after, context);
      if (!move) break;
      actions.push(...move.actions);
      for (const a of move.actions) after = shop.apply(after, a);
      if (step === 23) throw new Error('Finishing search did not converge');
    }
    const choice = planner.finishValue(after, r.target, context.defenseTarget);
    if (choice.score < baseline.score - 1e-9) throw new Error('Primary objective regressed');
    const beforeAttack = sc(sim.outcome(baseline.order, r.exactThem, r.simOptions));
    const afterAttack = sc(sim.outcome(choice.order, r.exactThem, r.simOptions));
    const defenses = [];
    for (const incoming of defenseRows.filter((d) => d.round === r.round && d.lastOwnSource?.matchId === r.matchId && key(d.defender) === key(r.actualUnits))) {
      const match = attacks.find((a) => a.id === incoming.matchId), observed = match?.rounds.find((x) => x.round === r.round);
      if (!observed?.seats) continue;
      const opts = { season: 3, round: r.round, seats: observed.seats, ourCaptain: observed.captain, theirCaptain: S.captain };
      defenses.push({ id: incoming.matchId, before: 1 - sc(sim.outcome(observed.board, baseline.order, opts)),
        after: 1 - sc(sim.outcome(observed.board, choice.order, opts)) });
    }
    results.push({ matchId: r.matchId, round: r.round, ts: r.ts, trainedDefenses: training.length, actions,
      targetBefore: baseline.score, targetAfter: choice.score, beforeAttack, afterAttack,
      neutralBefore: beforeFinish.neutral, neutralAfter: choice.neutral,
      defenseBefore: beforeFinish.defense, defenseAfter: choice.defense, defenses });
    if (actions.length && examples.length < 16) examples.push({ state: S, ...context });
  }
  const sum = (rs, k) => rs.reduce((s, r) => s + r[k], 0);
  const held = results.flatMap((r) => r.defenses);
  const summary = { shops: results.length, withPastDefenses: results.filter((r) => r.trainedDefenses).length,
    shopsWithExtraMoves: results.filter((r) => r.actions.length).length,
    currentTargetRegressions: results.filter((r) => r.targetAfter < r.targetBefore - 1e-9).length,
    attack: { beforeScore: sum(results, 'beforeAttack'), afterScore: sum(results, 'afterAttack'),
      improved: results.filter((r) => r.afterAttack > r.beforeAttack).length, worse: results.filter((r) => r.afterAttack < r.beforeAttack).length },
    defense: { rounds: held.length, distinctSourceRounds: results.filter((r) => r.defenses.length).length,
      beforeScore: sum(held, 'before'), afterScore: sum(held, 'after'),
      improved: held.filter((r) => r.after > r.before).length, worse: held.filter((r) => r.after < r.before).length },
    limits: 'Final-shop counterfactuals, not whole-match play. Incoming attackers stay as recorded; repeated defenses of one saved board are correlated. Public replay availability is approximated with a 60-second lag. No future defensive board is used for planning.' };
  return { summary, results, examples };
}
if (require.main === module) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node tools/eval_defense_logs.js ANALYSIS_DIR NEW_OUTPUT.json');
  const result = evaluate(path.resolve(process.argv[2]));
  fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(result.summary, null, 2));
}
module.exports = { evaluate };
