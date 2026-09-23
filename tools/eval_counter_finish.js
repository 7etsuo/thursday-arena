#!/usr/bin/env node
'use strict';
/** Chronological defensive-policy counterfactuals. The enemy is fixed as recorded.
 * Both arms start with the same team/remaining offers and use the corrected simulator.
 * This does not estimate whole-match win rate or an adaptive attacker's response.
 * Usage: node tools/eval_counter_finish.js ANALYSIS_DIR NEW_OUTPUT.json
 */
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const planner = require('../lib/planner'), shop = require('../lib/shop_model'), sim = require('../lib/sim');
const history = require('../lib/public_history'), book = require('../lib/book');
const counter = require('./research_counter_finish');
const score = w => w === 'us' ? 1 : w === 'draw' ? 0.5 : 0;
const key = b => book.boardKey(book.normBoard(b));

function evaluate(dir) {
  const rows = JSON.parse(fs.readFileSync(path.join(dir, 'shop-rows.json'))).filter(r => r.finalState && r.battle);
  const defenseRows = JSON.parse(fs.readFileSync(path.join(dir, 'defense-rounds.json')));
  const events = JSON.parse(fs.readFileSync(path.join(dir, 'events.json')));
  const observed = events.filter(e => e.type === 'book' && e.source === 'defense_replay' && e.seats)
    .map(e => ({ ...e, available: Date.parse(e.ts), played: Date.parse(e.observedAt) }));
  const saved = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '../test/fixtures/s3-defense-history-20260921.json.gz'))));
  const old = saved.history.filter(r => saved.details[r.id]).flatMap(raw => {
    const row = history.rowOf(raw, 'tetsuoai', 3);
    return history.replayInputs(saved.details[row.id], row, 'tetsuoai', 3).filter(r => r.seats)
      .map(r => ({ ...r, available: row.ts + 60000, played: row.ts, matchId: row.id }));
  });
  const training = observed.length ? observed : old;
  const ledger = fs.existsSync(path.join(dir, 'public-history.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, 'public-history.json'))).map(raw => history.rowOf(raw, 'tetsuoai', 3)).filter(Boolean)
    : [];
  const results = [];
  const finish = (initial, ctx) => {
    let S = initial;
    for (let i = 0; i < 24; i++) {
      const move = planner.finishMove(S, ctx);
      if (!move) return S;
      for (const a of move.actions) S = shop.apply(S, a);
    }
    throw new Error('baseline finish did not converge');
  };
  for (const r of rows) {
    const at = Date.parse(r.ts), past = training.filter(e => e.available < at && e.round === r.round)
      .sort((a, b) => b.played - a.played).slice(0, 24);
    const defenses = { entries: past.map(e => ({ board: e.board, seats: e.seats,
      theirCaptain: e.captain, weight: 1, source: 'defense' })) };
    const recent = ledger.filter(e => e.ts < at - 60000 && e.ts >= at - 3600000);
    const attacks = recent.filter(e => e.role === 'attacker').length;
    const ctx = { target: r.target, defenseTarget: defenses, robustDefense: true,
      defenseWeight: attacks ? Math.min(1, recent.filter(e => e.role === 'ghost').length / attacks) : 0 };
    const baseState = finish(r.finalState, ctx), base = planner.finishValue(baseState, r.target, defenses);
    let candidate = baseState, actions = [];
    if (r.round === 2) for (let i = 0; i < 24; i++) {
      const move = counter.counterFinishMove(candidate, ctx);
      if (!move) break;
      actions.push(...move.actions);
      for (const a of move.actions) candidate = shop.apply(candidate, a);
      if (i === 23) throw new Error('counter finish did not converge');
    }
    const chosen = r.round === 2 ? counter.counterFinishValue(candidate, ctx) || base : base;
    const incoming = [];
    for (const d of defenseRows.filter(d => d.round === r.round && d.lastOwnSource?.matchId === r.matchId && key(d.defender) === key(r.actualUnits))) {
      let observed = d.options;
      if (!observed) {
        const raw = saved.history.find(x => x.id === d.matchId);
        if (!raw) continue;
        const mr = history.rowOf(raw, 'tetsuoai', 3);
        const rr = history.replayInputs(saved.details[d.matchId], mr, 'tetsuoai', 3).find(x => x.round === r.round);
        if (!rr?.seats) continue;
        observed = { season: 3, round: r.round, seats: rr.seats, ourCaptain: rr.captain, theirCaptain: candidate.captain };
      }
      incoming.push({ matchId: d.matchId,
        before: 1 - score(sim.outcome(d.attacker, base.order, observed)),
        after: 1 - score(sim.outcome(d.attacker, chosen.order, observed)) });
    }
    results.push({ matchId: r.matchId, round: r.round, actions, defenseWeight: ctx.defenseWeight,
      before: score(sim.outcome(base.order, r.exactThem, r.simOptions)),
      after: score(sim.outcome(chosen.order, r.exactThem, r.simOptions)),
      certificate: chosen.certificate || null, incoming });
    if (results.length % 250 === 0) console.error(`${results.length}/${rows.length}`);
  }
  const counts = rs => ({ n: rs.length, before: rs.reduce((s, r) => s + r.before, 0),
    after: rs.reduce((s, r) => s + r.after, 0), improved: rs.filter(r => r.after > r.before).length,
    worsened: rs.filter(r => r.after < r.before).length });
  return { summary: { shops: results.length, changedPurchases: results.filter(r => r.actions.length).length,
    attacks: counts(results), defenses: counts(results.flatMap(r => r.incoming)),
    certificateViolations: results.filter(r => r.certificate && r.certificate.worstGain < -0.05 - 1e-9).length,
    limits: 'Final-shop counterfactual, fixed subsequent attackers. No changed earlier purchases, matching, future learning or whole-match outcomes. Public history exposure uses a 60-second availability lag; defense boards use logged availability when present, otherwise the same lag. Repeated incoming attacks on a saved team are correlated.' }, results };
}
if (require.main === module) {
  const [dir, out] = process.argv.slice(2);
  if (!dir || !out) throw new Error('Usage: node tools/eval_counter_finish.js ANALYSIS_DIR NEW_OUTPUT.json');
  const result = evaluate(path.resolve(dir));
  fs.writeFileSync(out, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(result.summary, null, 2));
}
module.exports = { evaluate };
