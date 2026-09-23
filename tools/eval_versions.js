#!/usr/bin/env node
'use strict';
/**
 * Paired whole-match comparison of the pre-improvement backup and this checkout.
 *
 * Both policies play the CURRENT mock arena, which keys ghost, seat, shop and food
 * draws by seed/match/round/roll. This isolates policy changes from the old mock's
 * single RNG stream. Each run starts with an empty opponent book. The default
 * 20 seeds x 50 matches/season and unlimited planner budget match the historical
 * whole-match sample size in docs/HISTORY.md. No network or rated games are used.
 *
 *   node tools/eval_versions.js [--before-tgz PATH | --before-dir PATH]
 *     [--games 50] [--seeds 101,103,...,197] [--season 1|2|3|both]
 *     [--budget Infinity] [--book-mode cold|snapshots] [--late-id] [--csv PATH]
 *     [--planner-options JSON_FILE]
 *
 * The old code is run with its own driver, planner, book, target, shop model and
 * simulator; the arena applies actions and fights using the current rules for
 * both arms. This measures the old policy as it would perform under those rules.
 * Season 3 uses the mock's public-replay trajectories, captain offers and item
 * economy assumptions. Its results are not rated-queue win-rate estimates.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_BACKUP = path.resolve(ROOT, '..', 'thursday-arena-before-improvements-20260920.tgz');
const mock = require('../test/mock_arena');

function parseArgs(argv) {
  const o = { beforeTgz: DEFAULT_BACKUP, beforeDir: null, games: 50,
    seeds: [101, 103, 107, 109, 113, 127, 131, 137, 139, 149,
      151, 157, 163, 167, 173, 179, 181, 191, 193, 197],
    season: 'both', budget: Infinity, bookMode: 'cold', lateId: false, csv: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} requires a value`);
      return argv[++i];
    };
    if (a === '--before-tgz') o.beforeTgz = path.resolve(value());
    else if (a === '--before-dir') o.beforeDir = path.resolve(value());
    else if (a === '--games') o.games = Number(value());
    else if (a === '--seeds') o.seeds = value().split(',').map(Number);
    else if (a === '--season') o.season = value();
    else if (a === '--budget') o.budget = Number(value());
    else if (a === '--book-mode') o.bookMode = value();
    else if (a === '--initial-book') o.initialBook = path.resolve(value());
    else if (a === '--scenarios') o.scenarios = JSON.parse(fs.readFileSync(path.resolve(value()), 'utf8'));
    else if (a === '--freeze-before') o.freezeBefore = true;
    else if (a === '--late-id') o.lateId = true;
    else if (a === '--csv') o.csv = path.resolve(value());
    else if (a === '--planner-options') {
      o.plannerOpts = JSON.parse(fs.readFileSync(path.resolve(value()), 'utf8'));
      if (!o.plannerOpts || typeof o.plannerOpts !== 'object' || Array.isArray(o.plannerOpts)) {
        throw new Error('planner options must be a JSON object');
      }
    }
    else throw new Error(`unknown flag: ${a}`);
  }
  if (!Number.isInteger(o.games) || o.games < 1 || !o.seeds.length ||
      o.seeds.some((s) => !Number.isInteger(s)) ||
      !['1', '2', '3', '4', 'both'].includes(o.season) || !(o.budget >= 0) ||
      !['cold', 'snapshots'].includes(o.bookMode)) {
    throw new Error('invalid games, seeds, season or budget');
  }
  return o;
}

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function score(result) { return result === 'win' ? 1 : result === 'draw' ? 0.5 : 0; }
function count(matches) {
  return matches.reduce((n, m) => { n[m.result]++; return n; }, { win: 0, loss: 0, draw: 0 });
}
function mean(v) { return v.reduce((a, b) => a + b, 0) / v.length; }
function interval(v) {
  const m = mean(v);
  const variance = v.length > 1 ? v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1) : 0;
  const h = 1.96 * Math.sqrt(variance / v.length);
  return [m - h, m + h];
}
function clusteredInterval(seedMeans) {
  if (seedMeans.length < 2) return [NaN, NaN];
  const critical = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306,
    2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110,
    2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056,
    2.052, 2.048, 2.045, 2.042];
  const df = seedMeans.length - 1;
  const t = critical[df] || 1.96;
  const m = mean(seedMeans);
  const variance = seedMeans.reduce((a, x) => a + (x - m) ** 2, 0) / df;
  const h = t * Math.sqrt(variance / seedMeans.length);
  return [m - h, m + h];
}
function csvCell(v) { return `"${String(v).replace(/"/g, '""')}"`; }

function extractBefore(tgz) {
  const listing = spawnSync('tar', ['-tzf', tgz], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (listing.status !== 0) throw new Error(`listing backup failed: ${listing.stderr || listing.error || listing.status}`);
  const members = new Set(listing.stdout.split('\n'));
  // S1/S2 backups predate equipment; S3 runtimes must load their own item catalog.
  const optional = members.has('./data/items.json') ? ['./data/items.json'] : [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-before-'));
  const result = spawnSync('tar', ['-xzf', tgz, '-C', dir,
    './lib', './driver', './data/catalog.json', './memory/book.json', ...optional], { encoding: 'utf8' });
  if (result.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`extracting backup failed: ${result.stderr || result.error || result.status}`);
  }
  return dir;
}

async function play(modules, season, seed, opt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-pair-'));
  try {
    const bookFile = path.join(dir, 'book.json');
    if (opt.initialBook || opt.bookMode === 'snapshots') {
      fs.copyFileSync(opt.initialBook || path.join(modules.root, 'memory/book.json'), bookFile);
    }
    const arena = mock.create({ seed, season, ghosts: opt.scenarios, ghostSequence: !!opt.scenarios });
    let scenarioIndex = 0, modelTime = Date.parse(opt.scenarios?.[0]?.ts);
    const now = () => Number.isFinite(modelTime) ? modelTime : Date.now();
    const starts = [];
    let promoted = false;
    let promoteOnObserve = false;
    const redact = (response) => {
      if (!opt.lateId || !response || !response.state) return response;
      const s = response.state;
      return { ...response, state: {
        ...s,
        matchId: promoted ? s.matchId : undefined,
        opponentHandle: s.phase && s.phase.round === 0 ? undefined : s.opponentHandle,
      } };
    };
    const act = arena.act.bind(arena);
    arena.act = async (action, version) => {
      if (action.type === 'start' || action.type === 'restart') scenarioIndex = arena.stats.matches.length;
      const response = await act(action, version);
      if (opt.scenarios?.[scenarioIndex]?.ts) modelTime = Date.parse(opt.scenarios[scenarioIndex].ts) +
        (response.state?.phase?.round ?? 3) * 1000;
      if (opt.lateId) {
        if (action.type === 'start' || action.type === 'restart') {
          promoted = false;
          promoteOnObserve = false;
        }
        if (action.type === 'endShop' && response.state &&
            response.state.phase && response.state.phase.kind === 'battle' &&
            response.state.phase.round === 1) promoteOnObserve = true;
      }
      if ((action.type === 'start' || action.type === 'restart') &&
          response.state && response.state.phase.kind === 'shop') {
        const s = response.state;
        starts.push(JSON.stringify({
          pets: s.shop.pets, food: s.shop.food, seats: s.seats,
          ...(season >= 3 ? { item: s.shop.item, captainOffer: s.captainOffer } : {}),
        }));
      }
      return redact(response);
    };
    if (opt.lateId) {
      const observe = arena.observe.bind(arena);
      arena.observe = async () => {
        const response = await observe();
        if (promoteOnObserve) { promoted = true; promoteOnObserve = false; }
        return redact(response);
      };
    }
    const book = modules.book.open(bookFile, { now, empty: opt.bookMode === 'cold' && !opt.initialBook });
    let bookRecords = 0;
    const record = book.record.bind(book);
    book.record = (row) => { bookRecords++; return opt.freezeBefore && modules.name === 'before' ? null
      : record(Number.isFinite(modelTime) ? { ...row, ts: now() } : row); };
    const telemetry = modules.telemetry.open({ dir: path.join(dir, 'log'), codeVersion: modules.name });
    let battleEvents = 0;
    let missingInputs = 0;
    let emptyGhosts = 0;
    const event = telemetry.event.bind(telemetry);
    telemetry.event = (type, payload) => {
      if (type === 'battle') {
        battleEvents++;
        if (payload.inputMissing) missingInputs++;
        if (!payload.them || !payload.them.length) emptyGhosts++;
      }
      return event(type, payload);
    };
    const out = await modules.loop.run({
      arena, planner: modules.planner, now,
      book, telemetry,
      start: true, games: opt.games, seed: seed * 13, timeBudgetMs: opt.budget,
      prevHandle: null, lastOpponentFile: path.join(dir, 'last.json'),
      plannerOpts: modules.name === 'current' ? opt.plannerOpts : undefined,
      targetOpts: modules.name === 'current' ? opt.targetOpts : undefined,
      history: opt.scenarios ? { poll: async () => ({ skipped: true }), report: () => ({ offline: true }), defenseTarget: (round) =>
        opt.scenarios[scenarioIndex].defenseTargets?.[round] || { entries: [] } } : undefined,
    });
    if (out.games !== opt.games || arena.stats.matches.length !== opt.games || starts.length !== opt.games) {
      throw new Error(`${modules.name} S${season} seed=${seed}: incomplete run: ` +
        `games=${out.games}, results=${arena.stats.matches.length}, starts=${starts.length}`);
    }
    return { out, stats: arena.stats, starts, bookRecords, battleEvents,
      missingInputs, emptyGhosts };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const transient = !opt.beforeDir;
  const beforeDir = opt.beforeDir || extractBefore(opt.beforeTgz);
  try {
    for (const rel of ['data/catalog.json', 'lib/planner.js', 'driver/play_loop.js']) {
      if (!fs.existsSync(path.join(beforeDir, rel))) throw new Error(`backup lacks ${rel}`);
    }
    const maxSeason = opt.season === 'both' ? 2 : Number(opt.season);
    const comparableCatalog = root => JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8')).filter(b => b.season <= maxSeason);
    if (!require('node:util').isDeepStrictEqual(comparableCatalog(beforeDir), comparableCatalog(ROOT))) {
      throw new Error('backup and current catalogs differ; common mock may not be comparable');
    }
    const old = { name: 'before', root: beforeDir, loop: require(path.join(beforeDir, 'driver/play_loop')),
      planner: require(path.join(beforeDir, 'lib/planner')),
      book: require(path.join(beforeDir, 'lib/book')),
      telemetry: require(path.join(beforeDir, 'lib/telemetry')) };
    const current = { name: 'current', root: ROOT, loop: require('../driver/play_loop'),
      planner: require('../lib/planner'), book: require('../lib/book'),
      telemetry: require('../lib/telemetry') };
    const seasons = opt.season === 'both' ? [1, 2] : [Number(opt.season)];
    const csv = ['season,seed,match,handle,before,current,before_score,current_score,delta'];
    console.log(`eval_versions games/seed=${opt.games} seeds=${opt.seeds.join(',')} ` +
      `season=${opt.season} budget=${opt.budget} mock=current book=${opt.bookMode}` +
      (opt.lateId ? ' lateId=through-R1-endShop' : ''));
    console.log(`before=${opt.beforeDir || opt.beforeTgz}`);
    if (opt.plannerOpts) console.log(`current planner options=${JSON.stringify(opt.plannerOpts)}`);
    for (const season of seasons) {
      const beforeMatches = []; const currentMatches = []; const delta = [];
      const seedMeans = [];
      let beforeIllegal = 0; let currentIllegal = 0;
      let beforeShort = 0; let currentShort = 0;
      let beforeBookRecords = 0; let currentBookRecords = 0;
      let beforeBattleEvents = 0; let currentBattleEvents = 0;
      let beforeRounds = 0; let currentRounds = 0;
      let beforeMissingInputs = 0; let currentMissingInputs = 0;
      let beforeEmptyGhosts = 0; let currentEmptyGhosts = 0;
      let improved = 0; let worsened = 0; let equal = 0;
      const started = Date.now();
      for (const seed of opt.seeds) {
        const a = await play(old, season, seed, opt);
        const b = await play(current, season, seed, opt);
        const seedDelta = [];
        beforeIllegal += a.stats.illegal; currentIllegal += b.stats.illegal;
        beforeBookRecords += a.bookRecords; currentBookRecords += b.bookRecords;
        beforeBattleEvents += a.battleEvents; currentBattleEvents += b.battleEvents;
        beforeRounds += a.stats.rounds.length; currentRounds += b.stats.rounds.length;
        beforeMissingInputs += a.missingInputs; currentMissingInputs += b.missingInputs;
        beforeEmptyGhosts += a.emptyGhosts; currentEmptyGhosts += b.emptyGhosts;
        const short = (stats) => stats.endShops.filter((s) => s.units < 3 && s.goldLeft >= s.cheapestOffer).length;
        beforeShort += short(a.stats); currentShort += short(b.stats);
        for (let i = 0; i < opt.games; i++) {
          const x = a.stats.matches[i], y = b.stats.matches[i];
          if (x.handle !== y.handle || a.starts[i] !== b.starts[i]) {
            throw new Error(`exogenous draw mismatch S${season} seed=${seed} match=${i + 1}`);
          }
          const d = score(y.result) - score(x.result);
          seedDelta.push(d);
          if (d > 0) improved++; else if (d < 0) worsened++; else equal++;
          beforeMatches.push(x); currentMatches.push(y); delta.push(d);
          csv.push([season, seed, i + 1, csvCell(x.handle), x.result, y.result,
            score(x.result), score(y.result), d].join(','));
        }
        seedMeans.push(mean(seedDelta));
        const ac = count(a.stats.matches), bc = count(b.stats.matches);
        console.log(`  S${season} seed=${seed}: before=${JSON.stringify(count(a.stats.matches))}` +
          ` current=${JSON.stringify(count(b.stats.matches))}` +
          ` score=${((ac.win + 0.5 * ac.draw) / opt.games).toFixed(3)}` +
          `/${((bc.win + 0.5 * bc.draw) / opt.games).toFixed(3)}` +
          ` pairedDelta=${mean(seedDelta).toFixed(4)} ` +
          `bookRecords=${a.bookRecords}/${b.bookRecords} rounds=${a.stats.rounds.length}/${b.stats.rounds.length} ` +
          `elapsed=${((Date.now() - started) / 1000).toFixed(1)}s`);
      }
      const bc = count(beforeMatches), cc = count(currentMatches);
      const bScore = mean(beforeMatches.map((m) => score(m.result)));
      const cScore = mean(currentMatches.map((m) => score(m.result)));
      const [lo, hi] = interval(delta);
      const [clusterLo, clusterHi] = clusteredInterval(seedMeans);
      console.log(`S${season} n=${delta.length}: before W${bc.win} L${bc.loss} D${bc.draw} ` +
        `winRate=${(bc.win / delta.length).toFixed(4)} matchScore=${bScore.toFixed(4)}; ` +
        `current W${cc.win} L${cc.loss} D${cc.draw} ` +
        `winRate=${(cc.win / delta.length).toFixed(4)} matchScore=${cScore.toFixed(4)}`);
      console.log(`  paired score delta current-before=${mean(delta).toFixed(4)} ` +
        `95% seed-clustered CI [${clusterLo.toFixed(4)}, ${clusterHi.toFixed(4)}] ` +
        `(exploratory match-level CI [${lo.toFixed(4)}, ${hi.toFixed(4)}]) ` +
        `better=${improved} worse=${worsened} same=${equal}`);
      console.log(`  illegal before=${beforeIllegal} current=${currentIllegal}; ` +
        `fillable short shops before=${beforeShort} current=${currentShort}`);
      if (opt.lateId) console.log(`  book records before=${beforeBookRecords}/${beforeRounds} rounds` +
        ` current=${currentBookRecords}/${currentRounds} rounds; ` +
        `battle events before=${beforeBattleEvents} current=${currentBattleEvents}; ` +
        `missing inputs before=${beforeMissingInputs} current=${currentMissingInputs}; ` +
        `empty ghosts before=${beforeEmptyGhosts} current=${currentEmptyGhosts}`);
    }
    if (opt.csv) {
      fs.mkdirSync(path.dirname(opt.csv), { recursive: true });
      fs.writeFileSync(opt.csv, csv.join('\n') + '\n');
      console.log(`paired CSV: ${opt.csv}`);
    }
  } finally {
    if (transient) fs.rmSync(beforeDir, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((e) => { console.error(e.stack || e.message); process.exitCode = 1; });

module.exports = { parseArgs, score, interval, clusteredInterval, extractBefore, play };
