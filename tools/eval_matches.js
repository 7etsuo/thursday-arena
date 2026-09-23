#!/usr/bin/env node
'use strict';
/**
 * Whole-match evaluation against the mock arena (real shop reducer, real sim, recorded ghosts):
 * the only offline measure of MATCH-level planning, since tools/eval_planner.js scores one round.
 *
 *   node tools/eval_matches.js [--games 30] [--seeds 3,7,11,19,23] [--season 1|2|both] [--old]
 *   [--r0-book-weight X] [--r12-book-weight X] [--half-life-hours H] [--csv FILE]
 *
 * --old plays with the previous objective (one-round value, one-step greedy). Target flags run
 * baseline and candidate on the same seeds and optionally write a paired per-match CSV.
 * Exogenous ghost, seat-rule, offer and food draws are keyed by match and shop roll, so different
 * reroll counts do not change later matches or fresh shops.
 * Cold book: the loop learns each opponent inside the run, as it does live against a new pool.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const mock = require('../test/mock_arena');
const loop = require('../driver/play_loop');
const bookLib = require('../lib/book');
const telemetryLib = require('../lib/telemetry');
const planner = require('../lib/planner');
const targetLib = require('../lib/target');

function parseArgs(argv) {
  const o = { games: 30, seeds: [3, 7, 11, 19, 23], season: 'both', old: false, budget: Infinity,
    r0BookWeight: null, r12BookWeight: null, halfLifeHours: null, csv: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') o.games = Number(argv[++i]);
    else if (a === '--seeds') o.seeds = argv[++i].split(',').map(Number);
    else if (a === '--season') o.season = argv[++i];
    else if (a === '--budget') o.budget = Number(argv[++i]);
    else if (a === '--old') o.old = true;
    else if (a === '--no-two-step') o.noTwoStep = true;
    else if (a === '--no-match-level') o.noMatchLevel = true;
    else if (a === '--match-rounds') o.matchRounds = argv[++i].split(',').map(Number);
    else if (a === '--future-blend') o.futureBlend = Number(argv[++i]);
    else if (a === '--r0-book-weight') o.r0BookWeight = Number(argv[++i]);
    else if (a === '--r12-book-weight') o.r12BookWeight = Number(argv[++i]);
    else if (a === '--half-life-hours') o.halfLifeHours = Number(argv[++i]);
    else if (a === '--csv') o.csv = argv[++i];
    else throw new Error(`unknown flag ${a}`);
  }
  for (const n of [o.r0BookWeight, o.r12BookWeight]) if (n != null && !(n >= 0 && n <= 1)) throw new Error('book weights must be 0..1');
  if (o.halfLifeHours != null && !(o.halfLifeHours > 0)) throw new Error('half-life must be positive');
  return o;
}

function wilson(k, n, z = 1.96) {
  if (!n) return [NaN, NaN];
  const p = k / n; const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const seasons = opt.season === 'both' ? [1, 2] : [Number(opt.season)];
  const plannerOpts = {
    matchLevel: !(opt.old || opt.noMatchLevel),
    twoStep: !(opt.old || opt.noTwoStep),
  };
  if (opt.matchRounds) plannerOpts.matchRounds = opt.matchRounds;
  if (opt.futureBlend != null) plannerOpts.futureBlend = opt.futureBlend;
  console.log(`eval_matches  matchLevel=${plannerOpts.matchLevel}${opt.matchRounds ? ' rounds=' + opt.matchRounds.join('/') : ''}${opt.futureBlend != null ? ' blend=' + opt.futureBlend : ''} twoStep=${plannerOpts.twoStep}  games/seed=${opt.games}  seeds=${opt.seeds.join(',')}`);
  const comparing = opt.r0BookWeight != null || opt.r12BookWeight != null || opt.halfLifeHours != null;
  const candidateOpts = comparing ? {
    bookWeight0: opt.r0BookWeight == null ? targetLib.R0_BOOK_WEIGHT : opt.r0BookWeight,
    bookWeight12: opt.r12BookWeight == null ? targetLib.R12_BOOK_WEIGHT : opt.r12BookWeight,
    recencyHalfLifeMs: opt.halfLifeHours == null ? null : opt.halfLifeHours * 3600000,
  } : null;
  const csv = ['season,seed,match,handle,baseline,candidate,baseline_score,candidate_score,delta'];
  const score = (result) => result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  async function playOne(season, seed, targetOpts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalm-'));
    try {
      const arena = mock.create({ seed, season });
      const out = await loop.run({
        arena, planner, targetOpts,
        book: bookLib.open(path.join(dir, 'book.json'), { empty: true }),
        telemetry: telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'evalmatch123' }),
        start: true, games: opt.games, seed: seed * 13, timeBudgetMs: opt.budget, prevHandle: null,
        lastOpponentFile: path.join(dir, 'last.json'), plannerOpts,
      });
      return { arena, out };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  for (const season of seasons) {
    let W = 0; let L = 0; let D = 0; let elo = 0; let shops = 0; let short = 0; let illegal = 0;
    const rounds = [[0, 0], [0, 0], [0, 0]];
    const t0 = Date.now();
    const paired = [];
    const candidateTotals = { wins: 0, losses: 0, draws: 0, illegal: 0, short: 0 };
    for (const seed of opt.seeds) {
      const { arena, out } = await playOne(season, seed, null);
      W += out.wins; L += out.losses; D += out.draws; elo += out.elo;
      for (const s of arena.stats.endShops) { shops++; if (s.units < 3 && s.goldLeft >= s.cheapestOffer) short++; }
      illegal += arena.stats.illegal;
      for (const r of arena.stats.rounds) { rounds[r.round][1]++; rounds[r.round][0] += r.winner === 'you' ? 1 : r.winner === 'them' ? 0 : 0.5; }
      if (comparing) {
        const other = await playOne(season, seed, candidateOpts);
        candidateTotals.wins += other.out.wins;
        candidateTotals.losses += other.out.losses;
        candidateTotals.draws += other.out.draws;
        candidateTotals.illegal += other.arena.stats.illegal;
        candidateTotals.short += other.arena.stats.endShops.filter((s) => s.units < 3 && s.goldLeft >= s.cheapestOffer).length;
        if (arena.stats.matches.length !== other.arena.stats.matches.length) throw new Error('paired match count differs');
        for (let i = 0; i < arena.stats.matches.length; i++) {
          const a = arena.stats.matches[i], b = other.arena.stats.matches[i];
          if (a.handle !== b.handle) throw new Error(`exogenous opponent changed at season ${season}, seed ${seed}, match ${i + 1}`);
          const d = score(b.result) - score(a.result);
          paired.push(d);
          const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
          csv.push([season, seed, i + 1, esc(a.handle), a.result, b.result,
            score(a.result), score(b.result), d].join(','));
        }
      }
    }
    const n = W + L + D;
    const ms = (W + 0.5 * D) / n;
    const [lo, hi] = wilson(W + 0.5 * D, n);
    console.log(`S${season}  ${n} matches: W${W} L${L} D${D}  matchScore=${ms.toFixed(3)} [${lo.toFixed(3)}, ${hi.toFixed(3)}]  elo=${elo}  winRate=${(W / n).toFixed(3)}`);
    console.log(`     per-round: ${rounds.map((r, i) => `R${i} ${r[1] ? (r[0] / r[1]).toFixed(3) : '-'} (n=${r[1]})`).join('  ')}`);
    console.log(`     shops=${shops} unjustified-short=${short} illegal=${illegal}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (comparing) {
      const mean = paired.reduce((a, b) => a + b, 0) / paired.length;
      const variance = paired.length > 1 ? paired.reduce((a, b) => a + (b - mean) ** 2, 0) / (paired.length - 1) : 0;
      const half = 1.96 * Math.sqrt(variance / paired.length);
      console.log(`     candidate W${candidateTotals.wins} L${candidateTotals.losses} D${candidateTotals.draws}`
        + ` unjustified-short=${candidateTotals.short} illegal=${candidateTotals.illegal}`);
      console.log(`     paired candidate delta=${mean.toFixed(4)} [${(mean - half).toFixed(4)}, ${(mean + half).toFixed(4)}] n=${paired.length}`);
    }
  }
  if (opt.csv) {
    fs.writeFileSync(opt.csv, csv.join('\n') + '\n');
  }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
