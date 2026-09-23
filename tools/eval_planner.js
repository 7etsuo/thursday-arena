'use strict';
/*
 * Offline strategy evaluation: run lib/planner.js over the REAL pre-shop states in
 * data/corpus/shops.jsonl and score the board it ends up with against the enemy board that was
 * actually faced in that shop's battle.
 *
 * Historical corpus evaluator. `beforeTs` excludes later timestamps in retained book entries,
 * but later boards can evict earlier ones under the five-board cap. Use eval_recent.js for a true
 * chronological reconstruction on the new archive. At round 0 the handle is hidden, so only the
 * previous match's handle is passed.
 *
 * Reference numbers, from audit/strategy.md §2.3 and §3.1:
 *   recorded actual  R0 0.650 [0.637, 0.664]   R1/R2 0.758 [0.747, 0.770]
 *   the audit search  R0 0.873 (pool) / 0.933 (50-50 mix)   R1/R2 0.976 (75-25 mix)
 * The audit search is a heavier search than this planner (full R0 expectimax over a precomputed
 * 9,880-board table, 2 repetitions per shop); treat it as an upper bound.
 *
 * Usage:
 *   node tools/eval_planner.js [--limit N] [--round R] [--era S1early|S1late|S2] [--seed S]
 *                              [--jobs N] [--pool N] [--epsilon X] [--budget MS]
 *                              [--all] [--flat-utility] [--verbose]
 */
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const sim = require('../lib/sim');
const shopModel = require('../lib/shop_model');
const planner = require('../lib/planner');
const bookLib = require('../lib/book');
const targetLib = require('../lib/target');

const ROOT = path.join(__dirname, '..');
const SHOPS = path.join(ROOT, 'data', 'corpus', 'shops.jsonl');
const ERAS = ['S1early', 'S1late', 'S2'];
// Season 2 opened at 2026-09-19T07:00Z; the S1 pool visibly changed at 04:30Z (audit/strategy.md §1).
const S1_LATE_FROM = '2026-09-19T04:30';

function parseArgs(argv) {
  const o = { limit: 0, round: null, era: null, seed: 20260919, jobs: 1, pool: 40, epsilon: null, budget: null, all: false, flatUtility: false, verbose: false, shard: -1, shards: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const num = () => Number(argv[++i]);
    if (a === '--limit') o.limit = num();
    else if (a === '--round') o.round = num();
    else if (a === '--era') o.era = argv[++i];
    else if (a === '--seed') o.seed = num();
    else if (a === '--jobs') o.jobs = num();
    else if (a === '--pool') o.pool = num();
    else if (a === '--epsilon') o.epsilon = num();
    else if (a === '--budget') o.budget = num();
    else if (a === '--shard') o.shard = num();
    else if (a === '--shards') o.shards = num();
    else if (a === '--all') o.all = true;
    else if (a === '--flat-utility') o.flatUtility = true;
    else if (a === '--round-level') o.roundLevel = true;
    else if (a === '--one-step') o.oneStep = true;
    else if (a === '--verbose') o.verbose = true;
    else throw new Error(`unknown flag ${a}`);
  }
  if (o.era && !ERAS.includes(o.era)) throw new Error(`--era must be one of ${ERAS.join('|')}`);
  return o;
}

const eraOf = (r) => (r.s2 ? 'S2' : r.ts < S1_LATE_FROM ? 'S1early' : 'S1late');
const recorded = (w) => (w === 'you' ? 1 : w === 'draw' ? 0.5 : 0);
const scored = (w) => (w === 'us' ? 1 : w === 'draw' ? 0.5 : 0);

// One seeded stream per row, so a row's result never depends on the shard it landed in.
// sim.mulberry32 is the repo's single rng (review R3-7); it is bit-identical to the copy that was
// here, so these numbers stay comparable with earlier runs.
const rngFor = sim.mulberry32;
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** The rows, in timestamp order, each tagged with the handle of the PREVIOUS match. */
function loadRows() {
  const rows = fs.readFileSync(SHOPS, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  rows.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  let prevHandle = null;
  let prevMid = null;
  for (const r of rows) {
    if (r.mid !== prevMid) { r.prevHandle = prevHandle; prevMid = r.mid; }
    else r.prevHandle = prevHandle;
    if (r.handle) prevHandle = r.handle;
  }
  return rows;
}

/** The audit's slice: a clean, complete pre-shop snapshot (audit/strategy.md §2.3, §3.1). */
function usable(r, all) {
  if (!r.shop || !Array.isArray(r.shop.offers) || !Array.isArray(r.shop.board)) return false;
  if (!r.them || !r.them.length) return false;
  if (all) return true;
  if (r.round === 0) return r.shop.board.length === 0 && r.shop.offers.length === 3;
  return r.shop.gold === 10 && r.shop.board.length === 3;
}

function stateFrom(r) {
  if (r.season >= 3) throw new Error('eval_planner supports Season 1/2 shop records only; use eval_season3');
  return shopModel.normalize({
    phase: { round: r.round },
    gold: r.shop.gold,
    board: r.shop.board,
    wins: { you: (r.series || [0, 0])[0], them: (r.series || [0, 0])[1] },
    shop: { food: r.shop.food, pets: r.shop.offers },
    seats: r.seats || undefined,
  }, { season: r.s2 ? 2 : 1 });
}

function runRow(r, book, opt) {
  if (r.season >= 3) throw new Error('eval_planner supports Season 1/2 shop records only; use eval_season3');
  const season = r.s2 ? 2 : 1;
  const beforeTs = Date.parse(r.ts);
  const target = targetLib.build({
    book,
    season,
    round: r.round,
    handle: r.round === 0 ? null : r.handle,   // the R0 opponent is hidden during the shop
    prevHandle: r.prevHandle || null,
    seats: r.seats || null,
    limit: opt.pool,
    beforeTs,
    bookWeight: r.round === 0 ? opt.bookWeight0 : opt.bookWeight12,
    recencyHalfLifeMs: opt.recencyHalfLifeMs,
  });
  // future rounds for match-level valuation, exactly as driver/play_loop.js builds them
  const futureTargets = {};
  if (!opt.roundLevel) {
    const handle = r.round === 0 ? null : r.handle;
    for (let fr = r.round + 1; fr <= 2; fr++) {
      futureTargets[fr] = targetLib.build({
        book, season, round: fr, seats: r.seats || null, limit: opt.pool, beforeTs,
        handle: handle || r.prevHandle || null, prevHandle: r.prevHandle || null,
        bookWeight: handle ? opt.bookWeight12
          : opt.bookWeight0 == null ? targetLib.proxyBookWeight(season) : opt.bookWeight0,
        recencyHalfLifeMs: opt.recencyHalfLifeMs,
      });
    }
  }
  let S = stateFrom(r);
  const rowSeed = opt.seed ^ hash(`${r.mid}|${r.round}|${r.ts}`);
  const rng = rngFor(rowSeed ^ 0x6d2b79f5);
  // Planner lookahead consumes a variable number of draws. Keep realized rerolls on a separate
  // stream keyed by ordinal so target changes cannot silently change the test shop itself.
  let rerollOrdinal = 0;
  const cache = new Map();
  // --flat-utility: plan with W/D/L = 1/0.5/0 everywhere, i.e. WITHOUT the final-round objective.
  // The metric below also scores a draw as 0.5, so the R2 switch (at 1-0 a draw already wins the
  // match) deliberately trades measured score for match wins; this flag measures that trade.
  const util0 = opt.flatUtility ? { win: 1, draw: 0.5, loss: 0 } : planner.utility(r.round, { you: (r.series || [0, 0])[0], them: (r.series || [0, 0])[1] });
  // The time budget is OFF unless --budget says otherwise: this tool measures decision quality, and
  // a wall-clock budget makes the result depend on how many shards are competing for the cores.
  const ctx = { target, futureTargets, rng, cache, utility: util0, timeBudgetMs: opt.budget == null ? Infinity : opt.budget };
  if (opt.epsilon != null) ctx.epsilon = opt.epsilon;
  if (opt.roundLevel) ctx.matchLevel = false;     // --round-level: the old one-round objective
  if (opt.oneStep) ctx.twoStep = false;           // --one-step: the old greedy search

  const log = [];
  let steps = 0;
  for (; steps < 24; steps++) {
    const step = planner.planStep(S, ctx);
    if (step.done || !step.actions.length) break;
    log.push(step.reason);
    for (const a of step.actions) {
      S = a.type === 'reroll'
        ? shopModel.sampleReroll(S, rngFor(rowSeed ^ hash(`reroll:${rerollOrdinal++}`)))
        : shopModel.apply(S, a);
    }
  }
  // Score the concrete boards the planner itself averages over (a `bloom` onto a two-unit board
  // leaves the +1/+1 unresolved), never the fractional expected-value board.
  const worlds = shopModel.simUnitsOutcomes(S);
  let score = 0;
  let n = 0;
  for (const w of worlds) {
    const { order } = planner.evaluate(w.units, target, {
      round: r.round, seats: r.seats || null, utility: util0, cache,
    });
    n = order.length;
    score += w.p * scored(sim.outcome(order, r.them, { round: r.round, seats: r.seats || null }));
  }
  return {
    era: eraOf(r),
    round: r.round,
    n,
    score,
    actual: recorded(r.winner),
    gold: S.gold,
    steps,
    note: target.note,
    log: opt.verbose ? log : undefined,
  };
}

function work(opt) {
  const rows = loadRows().filter((r) => usable(r, opt.all)
    && (opt.round == null || r.round === opt.round)
    && (!opt.era || eraOf(r) === opt.era));
  const picked = opt.limit > 0 ? evenSample(rows, opt.limit) : rows;
  const book = bookLib.open();
  const out = [];
  for (let i = 0; i < picked.length; i++) {
    if (opt.shards > 1 && i % opt.shards !== opt.shard) continue;
    out.push(runRow(picked[i], book, opt));
  }
  return out;
}

/** --limit takes an evenly spread sample, not a prefix: a prefix is one era and one rating band. */
function evenSample(rows, limit) {
  if (rows.length <= limit) return rows;
  const out = [];
  for (let i = 0; i < limit; i++) out.push(rows[Math.floor((i * rows.length) / limit)]);
  return out;
}

// ------------------------------------------------------------------ reporting

function meanCI(xs) {
  const n = xs.length;
  if (!n) return { n: 0, mean: NaN, lo: NaN, hi: NaN };
  const m = xs.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, mean: m, lo: NaN, hi: NaN };
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
  const se = Math.sqrt(v / n);
  return { n, mean: m, lo: m - 1.96 * se, hi: m + 1.96 * se };
}

const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '  -  ');

function report(res, opt) {
  const groups = new Map();
  const add = (k, r) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); };
  for (const r of res) {
    add(`${r.era}|${r.round}`, r);
    add(`ALL|${r.round}`, r);
    add('ALL|*', r);
  }
  const keys = [];
  for (const e of ERAS) for (const rd of [0, 1, 2]) if (groups.has(`${e}|${rd}`)) keys.push(`${e}|${rd}`);
  for (const rd of [0, 1, 2]) if (groups.has(`ALL|${rd}`)) keys.push(`ALL|${rd}`);
  keys.push('ALL|*');

  console.log('');
  console.log(`eval_planner  seed=${opt.seed} pool=${opt.pool} rows=${res.length}`
    + `${opt.epsilon != null ? ` eps=${opt.epsilon}` : ''}${opt.budget != null ? ` budget=${opt.budget}ms` : ''}`
    + `${opt.all ? ' (--all: no pre-shop filter)' : ''}${opt.flatUtility ? ' flat-utility' : ''}`);
  console.log('era      R      n  planner  95% CI            actual   delta   short  gold');
  for (const k of keys) {
    const g = groups.get(k);
    const [era, rd] = k.split('|');
    const p = meanCI(g.map((x) => x.score));
    const a = meanCI(g.map((x) => x.actual));
    const d = meanCI(g.map((x) => x.score - x.actual));
    const short = g.filter((x) => x.n < 3).length;
    const gold = g.reduce((s, x) => s + x.gold, 0) / g.length;
    if (k === 'ALL|0') console.log('-'.repeat(72));
    console.log(
      `${era.padEnd(8)} ${rd.padStart(1)} ${String(p.n).padStart(6)}   `
      + `${f3(p.mean)}  [${f3(p.lo)}, ${f3(p.hi)}]   ${f3(a.mean)}  ${d.mean >= 0 ? '+' : '-'}${f3(Math.abs(d.mean))}`
      + `  ${String(short).padStart(5)} ${gold.toFixed(2).padStart(5)}`);
  }
  console.log('');
  console.log('reference (audit/strategy.md): recorded actual R0 0.650, R1/R2 0.758;'
    + ' audit search R0 0.873-0.933, R1/R2 0.976');
  if (opt.verbose) for (const r of res.slice(0, 20)) console.log(`  ${r.era} r${r.round} ${f3(r.score)} ${r.note} :: ${(r.log || []).join(' ; ')}`);
}

// ------------------------------------------------------------------ entry point

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.shard >= 0) {                       // worker: one shard, results back over IPC
    const res = work(opt);
    process.send(res);
    return;
  }
  const t0 = Date.now();
  if (opt.jobs <= 1) {
    const res = work(opt);
    report(res, opt);
    console.log(`\n${res.length} shops in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }
  const args = process.argv.slice(2).filter((a, i, arr) => a !== '--jobs' && arr[i - 1] !== '--jobs');
  let left = opt.jobs;
  const all = [];
  for (let i = 0; i < opt.jobs; i++) {
    const child = fork(__filename, [...args, '--shard', String(i), '--shards', String(opt.jobs)], { stdio: 'inherit' });
    child.on('message', (m) => all.push(...m));
    child.on('exit', (code) => {
      if (code) { console.error(`shard ${i} exited ${code}`); process.exitCode = 1; }
      if (--left === 0) {
        report(all, opt);
        console.log(`\n${all.length} shops in ${((Date.now() - t0) / 1000).toFixed(1)}s on ${opt.jobs} jobs`);
      }
    });
  }
}

if (require.main === module) main();
module.exports = { loadRows, usable, stateFrom, runRow, meanCI, eraOf };
