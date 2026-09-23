#!/usr/bin/env node
'use strict';
// Recorded final-shop counterfactuals, with chronological training and later defensive checks.
// Inputs are produced by the archive audit; this tool only reads them. No network or live book.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const B = require('../lib/book'), P = require('../lib/planner'), S = require('../lib/shop_model'), sim = require('../lib/sim');
const points = w => w === 'you' || w === 'us' ? 1 : w === 'draw' ? .5 : 0;
const key = units => B.boardKey(B.normBoard(units));
const matchScore = winners => {
  const a = winners.filter(w => w === 'you' || w === 'us').length, b = winners.filter(w => w === 'them').length;
  return a > b ? 1 : a < b ? 0 : .5;
};
function evaluate(analysis, defenseDir) {
  const rows = JSON.parse(fs.readFileSync(path.join(analysis, 'shop-rows.json'))).filter(r => r.battle && r.finalState);
  const events = JSON.parse(fs.readFileSync(path.join(analysis, 'events.json')));
  const results = events.filter(e => e.type === 'result');
  const observations = events.filter(e => e.type === 'book' && e.source === 'defense_replay');
  const details = fs.readdirSync(defenseDir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(defenseDir, f))));
  const byId = new Map(details.map(d => [d.id, d]));
  const ratio = d => d.elo_delta ? Math.min(1, Math.abs(d.owner_elo_delta / d.elo_delta)) : 0;
  const known = observations.filter(e => e.seats && byId.has(e.matchId)).map(e => {
    const d = byId.get(e.matchId), series = { you: 0, them: 0 };
    for (const r of d.rounds.filter(r => r.round < e.round)) {
      if (r.winner === 'them') series.you++;
      if (r.winner === 'you') series.them++;
    }
    return { ...e, series, weight: ratio(d), available: Date.parse(e.ts), played: Date.parse(e.observedAt) };
  });
  // A defense is linked only when its posted board equals the last independently logged board
  // for that round and its complete trace agrees under the recorded/inferred metadata.
  const linked = [], sources = new Map();
  for (const d of details) for (const r of d.rounds) {
    const obs = known.find(e => e.matchId === d.id && e.round === r.round);
    if (!obs) continue;
    const prior = rows.filter(x => x.round === r.round && Date.parse(x.battle.ts) < Date.parse(d.played_at)).at(-1);
    if (!prior || key(prior.actualUnits) !== key(B.publicReplayBoard(r, 'them'))) continue;
    const attacker = B.publicReplayBoard(r, 'you');
    const opts = { season: 3, round: r.round, seats: obs.seats, ourCaptain: obs.captain, theirCaptain: prior.finalState.captain };
    const replay = sim.simulate(attacker, prior.actualUnits, opts);
    if (JSON.stringify(replay.frames) !== JSON.stringify(r.frames)) continue;
    const id = `${prior.matchId}:${prior.round}`;
    sources.set(id, prior); linked.push({ id, matchId: d.id, round: r.round, attacker, opts, before: r.winner });
  }
  const changed = new Map(), attacks = [];
  for (const [id, r] of sources) {
    const at = Date.parse(r.ts), cut = at - 3600000;
    const past = known.filter(e => e.available < at && e.played >= cut).sort((a, b) => b.played - a.played);
    const pastMatches = [...new Set(past.map(e => e.matchId))].map(id => byId.get(id));
    const attacksN = results.filter(e => Date.parse(e.ts) < at && Date.parse(e.ts) >= cut).length;
    const defenseTarget = { exposure: pastMatches.reduce((n, d) => n + ratio(d), 0) / (attacksN + 10),
      entries: past.filter(e => e.round === r.round).slice(0, 24).map(e => ({ board: e.board,
        seats: e.seats, theirCaptain: e.captain, series: e.series, weight: e.weight })) };
    let state = r.finalState, actions = [];
    assert.equal(key(S.simUnits(state)), key(r.actualUnits), id);
    const ctx = { target: r.target, futureTargets: r.futureTargets, defenseTarget,
      timeBudgetMs: Infinity, cache: new Map() };
    if (defenseTarget.exposure && defenseTarget.entries.length) {
      for (let i = 0; i < 16; i++) {
        const plan = P.planStep(state, ctx);
        if (!plan.actions.length) break;
        for (const a of plan.actions) { assert.equal(S.legal(state, a), true); state = S.apply(state, a); actions.push(a); }
        if (i === 15) throw Error('nonconvergent final shop');
      }
      for (const a of P.seatingActions(state, r.target, { defenseTarget })) { state = S.apply(state, a); actions.push(a); }
    }
    const units = S.simUnits(state), after = sim.outcome(units, r.exactThem, r.simOptions);
    changed.set(id, units);
    attacks.push({ id, round: r.round, actions, exposure: defenseTarget.exposure,
      before: points(r.battleResult), after: points(after) });
  }
  const defenses = linked.map(d => ({ ...d, attacker: undefined, opts: undefined,
    after: sim.outcome(d.attacker, changed.get(d.id), d.opts) }));
  const defensiveMatches = [...new Set(defenses.map(d => d.matchId))].map(id => {
    const detail = byId.get(id), replaced = new Map(defenses.filter(d => d.matchId === id).map(d => [d.round, d.after]));
    return { id, before: 1 - matchScore(detail.rounds.map(r => r.winner)),
      after: 1 - matchScore(detail.rounds.map(r => replaced.get(r.round) ?? r.winner)) };
  });
  const counts = a => ({ n: a.length, before: a.reduce((n, r) => n + r.before, 0),
    after: a.reduce((n, r) => n + r.after, 0), better: a.filter(r => r.after > r.before).length,
    worse: a.filter(r => r.after < r.before).length });
  return { summary: { linkedRounds: linked.length, shops: sources.size,
    changedShops: attacks.filter(r => r.actions.length).length, attacks: counts(attacks),
    defensiveRounds: counts(defenses.map(d => ({ before: 1 - points(d.before), after: 1 - points(d.after) }))),
    defensiveMatches: counts(defensiveMatches),
    limits: 'Fixed recorded final shops and subsequent attackers. Only exact-trace, latest-posted-board links and uniquely reconstructable seats qualify. Replaces linked rounds in the recorded match; it cannot recover unplayed rounds or an adaptive attacker. No matchmaking or Elo/win-rate estimate.' }, attacks, defenses, defensiveMatches };
}
if (require.main === module) {
  const [analysis, defenseDir, out] = process.argv.slice(2);
  if (!analysis || !defenseDir || !out) throw Error('Usage: eval_defense_objective.js ANALYSIS_DIR DEFENSE_DETAILS_DIR NEW_OUTPUT.json');
  const result = evaluate(analysis, defenseDir);
  fs.writeFileSync(out, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(result.summary, null, 2));
}
module.exports = { evaluate };
