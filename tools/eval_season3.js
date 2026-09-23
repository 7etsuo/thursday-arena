#!/usr/bin/env node
'use strict';
/**
 * Paired Season 3 local evaluation of the current planner against its older objective or ablations.
 *
 * Public complete-match ghost trajectories are split by opponent handle into balanced folds. Each
 * arm starts with the same book seeded from other public matches, excluding held-out match IDs and
 * handles. The arms use identical keyed mock draws and each learns only from its own played matches.
 * No rated API action is made.
 *
 *   node tools/eval_season3.js [--games 10] [--seeds 101,103,107,109,113]
 *     [--folds 5] [--budget Infinity] [--csv /path/to/results.csv]
 *     [--same-policy | --r0-weight 0 | --r0-match-off | --r1-match-on | --two-step-off | --latest-book | --stop-check]
 *
 * `--same-policy` is a deterministic pairing self-check. Mock item costs/odds beyond observed R0
 * commons are assumptions, and public replays lack captain and seat metadata. Scores are local mock
 * scores conditional on the 100-match public sample, not estimates of rated win rate.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const mock = require('../test/mock_arena');
const loop = require('../driver/play_loop');
const planner = require('../lib/planner');
const bookLib = require('../lib/book');
const telemetryLib = require('../lib/telemetry');
const { observationsFromMatch, readMatches, writeObservations, DEFAULT_INPUT } = require('./seed_s3_book');

function parseArgs(argv) {
  const o = { games: 10, seeds: [101, 103, 107, 109, 113], folds: 5,
    budget: Infinity, csv: null, samePolicy: false, r0Weight: null,
    r0MatchOff: false, r1MatchOn: false, twoStepOff: false, latestBook: false,
    stopCheck: false, input: DEFAULT_INPUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} requires a value`);
      return argv[++i];
    };
    if (a === '--games') o.games = Number(value());
    else if (a === '--seeds') o.seeds = value().split(',').map(Number);
    else if (a === '--folds') o.folds = Number(value());
    else if (a === '--budget') o.budget = Number(value());
    else if (a === '--csv') o.csv = path.resolve(value());
    else if (a === '--in') o.input = path.resolve(value());
    else if (a === '--same-policy') o.samePolicy = true;
    else if (a === '--r0-weight') o.r0Weight = Number(value());
    else if (a === '--r0-match-off') o.r0MatchOff = true;
    else if (a === '--r1-match-on') o.r1MatchOn = true;
    else if (a === '--two-step-off') o.twoStepOff = true;
    else if (a === '--latest-book') o.latestBook = true;
    else if (a === '--stop-check') o.stopCheck = true;
    else throw new Error(`unknown flag ${a}`);
  }
  if (!Number.isInteger(o.games) || o.games < 1 || !Number.isInteger(o.folds) ||
      o.folds < 2 || !o.seeds.length || o.seeds.some((s) => !Number.isInteger(s)) ||
      !(o.budget >= 0) || (o.r0Weight != null && !(o.r0Weight >= 0 && o.r0Weight <= 1)) ||
      [o.samePolicy, o.r0Weight != null, o.r0MatchOff, o.r1MatchOn, o.twoStepOff, o.latestBook, o.stopCheck]
        .filter(Boolean).length > 1) {
    throw new Error('invalid games, folds, seeds, budget or mode');
  }
  return o;
}

function foldsOf(ghosts, n) {
  const byHandle = new Map();
  for (const ghost of ghosts) {
    const rows = byHandle.get(ghost.handle) || [];
    rows.push(ghost);
    byHandle.set(ghost.handle, rows);
  }
  if (n > byHandle.size) throw new Error(`${n} folds exceed ${byHandle.size} distinct ghost handles`);
  const folds = Array.from({ length: n }, (_, index) => ({ index, ghosts: [], handles: new Set() }));
  const groups = [...byHandle].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [handle, rows] of groups) {
    const fold = folds.slice().sort((a, b) => a.ghosts.length - b.ghosts.length ||
      a.handles.size - b.handles.size || a.index - b.index)[0];
    fold.ghosts.push(...rows);
    fold.handles.add(handle);
  }
  for (const f of folds) f.ghosts.sort((a, b) => a.id.localeCompare(b.id));
  return folds;
}

function trainingObservations(matches, fold) {
  const ids = new Set(fold.ghosts.map((g) => g.id));
  return matches.filter((m) => !ids.has(m.id))
    .flatMap(observationsFromMatch)
    .filter((o) => !fold.handles.has(o.handle));
}

const score = (m) => m.result === 'win' ? 1 : m.result === 'draw' ? 0.5 : 0;
const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
function seedInterval(xs) {
  if (xs.length < 2) return [NaN, NaN];
  const m = mean(xs), df = xs.length - 1;
  const variance = xs.reduce((a, x) => a + (x - m) ** 2, 0) / df;
  const critical = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306,
    2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110,
    2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056,
    2.052, 2.048, 2.045, 2.042];
  const h = (critical[df] || 1.96) * Math.sqrt(variance / xs.length);
  return [m - h, m + h];
}

async function play({ fold, seed, games, budget, observations, plannerOpts, targetOpts }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-s3-pair-'));
  try {
    const bookFile = path.join(dir, 'book.json');
    writeObservations(observations, bookFile);
    const arena = mock.create({ season: 3, seed, ghosts: fold.ghosts });
    const starts = [];
    const act = arena.act.bind(arena);
    arena.act = async (action, version) => {
      const response = await act(action, version);
      if ((action.type === 'start' || action.type === 'restart') &&
          response.state?.phase?.kind === 'shop') {
        const s = response.state;
        starts.push(JSON.stringify({ pets: s.shop.pets, food: s.shop.food,
          item: s.shop.item, captainOffer: s.captainOffer, seats: s.seats }));
      }
      return response;
    };
    const result = await loop.run({ arena, planner,
      book: bookLib.open(bookFile),
      telemetry: telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 's3pair' }),
      start: true, games, seed: seed * 13, timeBudgetMs: budget, prevHandle: null,
      lastOpponentFile: path.join(dir, 'last.json'),
      plannerOpts,
      targetOpts,
    });
    if (result.games !== games || arena.stats.matches.length !== games || starts.length !== games) {
      throw new Error(`incomplete S3 run: fold=${fold.index} seed=${seed} ` +
        `result=${result.games} matches=${arena.stats.matches.length} starts=${starts.length}`);
    }
    return { matches: arena.stats.matches, starts, stats: arena.stats };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function count(matches) {
  return matches.reduce((n, m) => { n[m.result]++; return n; }, { win: 0, loss: 0, draw: 0 });
}
const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;

async function evaluate(opt) {
  const matches = readMatches(opt.input);
  const ghosts = mock.loadGhosts({ s3: true, file: opt.input });
  const folds = foldsOf(ghosts, opt.folds);
  const csv = ['fold,seed,match,handle,baseline,candidate,baseline_score,candidate_score,delta'];
  const allOld = [], allCurrent = [], seedDeltas = new Map();
  let improved = 0, worsened = 0, equal = 0, illegalOld = 0, illegalCurrent = 0;
  let shortOld = 0, shortCurrent = 0;
  const t0 = Date.now();
  const mode = opt.latestBook ? 'frequency vs latest opponent board' : opt.stopCheck
    ? 'full-target stopping check off vs on' : opt.samePolicy ? 'current self-check' : opt.r0Weight != null
    ? `current with R0 book weight ${opt.r0Weight}` : opt.r0MatchOff
      ? 'R0 match objective off, two-step on' : opt.r1MatchOn
        ? 'match objective on in R0 and R1' : opt.twoStepOff
          ? 'match objective on, two-step off' : 'one-round/one-step old objective';
  console.log(`S3 paired mock: ${ghosts.length} complete trajectories, ${folds.length} handle-disjoint folds, ` +
    `${opt.seeds.length} seeds × ${opt.games} games/fold; budget=${opt.budget}; ` +
    `baseline vs ${mode}`);
  for (const fold of folds) {
    const observations = trainingObservations(matches, fold);
    if (!observations.length) throw new Error(`fold ${fold.index} has no training boards`);
    console.log(`fold ${fold.index}: held-out ${fold.ghosts.length} trajectories / ` +
      `${fold.handles.size} handles; train ${observations.length} boards`);
    for (const seed of opt.seeds) {
      const a = await play({ fold, seed, games: opt.games, budget: opt.budget,
        observations, plannerOpts: !opt.samePolicy && opt.r0Weight == null &&
          !opt.r0MatchOff && !opt.r1MatchOn && !opt.twoStepOff && !opt.latestBook && !opt.stopCheck
          ? { matchLevel: false, twoStep: false } : { matchLevel: true, twoStep: true,
            ...(opt.stopCheck ? { verifyStop: false } : {}) },
        targetOpts: opt.latestBook ? { bookPolicy: 'frequency' } : undefined });
      const b = await play({ fold, seed, games: opt.games, budget: opt.budget,
        observations, plannerOpts: opt.r0MatchOff
          ? { matchLevel: false, twoStep: true } : opt.r1MatchOn
            ? { matchLevel: true, twoStep: true, matchRounds: [0, 1] }
            : opt.twoStepOff ? { matchLevel: true, twoStep: false }
            : { matchLevel: true, twoStep: true },
        targetOpts: opt.latestBook ? { bookPolicy: 'latest' }
          : opt.r0Weight == null ? undefined : { bookWeight0: opt.r0Weight } });
      if (JSON.stringify(a.starts) !== JSON.stringify(b.starts)) {
        throw new Error(`exogenous starting offers differ in fold ${fold.index}, seed ${seed}`);
      }
      illegalOld += a.stats.illegal; illegalCurrent += b.stats.illegal;
      const short = (s) => s.endShops.filter((e) => e.units < 3 && e.goldLeft >= e.cheapestOffer).length;
      shortOld += short(a.stats); shortCurrent += short(b.stats);
      for (let i = 0; i < opt.games; i++) {
        const x = a.matches[i], y = b.matches[i];
        if (x.handle !== y.handle) throw new Error(`opponent changed in fold ${fold.index}, seed ${seed}, match ${i + 1}`);
        const d = score(y) - score(x);
        if (d > 0) improved++; else if (d < 0) worsened++; else equal++;
        allOld.push(x); allCurrent.push(y);
        const sd = seedDeltas.get(seed) || [];
        sd.push(d); seedDeltas.set(seed, sd);
        csv.push([fold.index, seed, i + 1, csvCell(x.handle), x.result, y.result,
          score(x), score(y), d].join(','));
      }
    }
  }
  const before = count(allOld), after = count(allCurrent);
  const oldScore = mean(allOld.map(score)), currentScore = mean(allCurrent.map(score));
  const clusterMeans = [...seedDeltas.values()].map(mean);
  const [lo, hi] = seedInterval(clusterMeans);
  const result = { n: allOld.length, before, after, oldScore, currentScore,
    delta: currentScore - oldScore, interval: [lo, hi], seedDeltas: clusterMeans,
    improved, worsened, equal, illegalOld, illegalCurrent, shortOld, shortCurrent,
    seconds: (Date.now() - t0) / 1000 };
  console.log(`baseline W${before.win} L${before.loss} D${before.draw} score=${oldScore.toFixed(4)}; ` +
    `candidate W${after.win} L${after.loss} D${after.draw} score=${currentScore.toFixed(4)}`);
  console.log(`paired delta=${result.delta.toFixed(4)} seed-clustered 95% interval ` +
    `[${lo.toFixed(4)}, ${hi.toFixed(4)}] n=${result.n} ` +
    `better=${improved} worse=${worsened} same=${equal}`);
  console.log(`illegal ${illegalOld}/${illegalCurrent}; fillable-short shops ` +
    `${shortOld}/${shortCurrent}; ${result.seconds.toFixed(1)}s`);
  if (opt.csv) fs.writeFileSync(opt.csv, csv.join('\n') + '\n');
  return result;
}

if (require.main === module) {
  let opt;
  try { opt = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
  if (opt) evaluate(opt).catch((e) => { console.error(e.stack || e.message); process.exitCode = 1; });
}

module.exports = { parseArgs, foldsOf, trainingObservations, seedInterval, play, evaluate };
