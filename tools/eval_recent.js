#!/usr/bin/env node
'use strict';
/**
 * Paired, chronological evaluation on the supplied live records.
 *
 * Usage: node tools/eval_recent.js [--records-dir EXTRACTED_ROOT | --archive FILE]
 *   [--from ISO] [--to ISO] [--limit N] [--seeds 3,7,11] [--budget MS|Infinity]
 *   [--candidate-r0 X] [--candidate-r12 X] [--candidate-half-life-hours H]
 *
 * The book is rebuilt from observations before each shop. The saved book plus `beforeTs` is not
 * sufficient: its five-board retention cap lets later observations evict earlier boards.
 * Each policy sees identical first offers and realized reroll streams. The final enemy board is
 * used only for scoring, never for choosing a shop action. This is an isolated-shop counterfactual;
 * changes to R0 carryover are measured separately by tools/eval_matches.js.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const bookLib = require('../lib/book');
const evalPlanner = require('./eval_planner');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ARCHIVE = '/home/tetsuo/Downloads/thursday-arena-records-all.tgz';
const DEFAULT_FROM = '2026-09-20T05:35:00.000Z';

function argsOf(argv) {
  const o = { archive: DEFAULT_ARCHIVE, recordsDir: null, from: DEFAULT_FROM, to: null,
    limit: 100, seeds: [3, 7, 11], budget: Infinity, candidateR0: 0.10,
    candidateR12: 0.50, candidateHalfLifeHours: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => argv[++i];
    if (a === '--archive') o.archive = value();
    else if (a === '--records-dir') o.recordsDir = value();
    else if (a === '--from') o.from = value();
    else if (a === '--to') o.to = value();
    else if (a === '--limit') o.limit = Number(value());
    else if (a === '--seeds') o.seeds = value().split(',').map(Number);
    else if (a === '--budget') o.budget = Number(value());
    else if (a === '--candidate-r0') o.candidateR0 = Number(value());
    else if (a === '--candidate-r12') o.candidateR12 = Number(value());
    else if (a === '--candidate-half-life-hours') o.candidateHalfLifeHours = Number(value());
    else throw new Error(`unknown flag ${a}`);
  }
  if (!Number.isFinite(Date.parse(o.from)) || (o.to && !Number.isFinite(Date.parse(o.to)))) throw new Error('invalid date');
  if (!Number.isInteger(o.limit) || o.limit < 0 || !o.seeds.length || o.seeds.some((n) => !Number.isFinite(n))) throw new Error('invalid limit or seeds');
  for (const w of [o.candidateR0, o.candidateR12]) if (!(w >= 0 && w <= 1)) throw new Error('candidate weights must be 0..1');
  return o;
}

function readLogs(opt) {
  if (opt.recordsDir) {
    const dir = path.join(opt.recordsDir, 'data', 'log');
    return fs.readdirSync(dir).filter((n) => /^\d{4}-\d\d-\d\d\.jsonl$/.test(n)).sort()
      .flatMap((n) => fs.readFileSync(path.join(dir, n), 'utf8').split('\n').filter(Boolean));
  }
  const names = cp.execFileSync('tar', ['-tzf', opt.archive], { encoding: 'utf8', maxBuffer: 2 ** 20 })
    // Exclude historical `snapshots/*/data/log` trees in the bundle. Only the live top-level log
    // matches; including a snapshot silently counted older rated matches twice.
    .split('\n').filter((n) => /^(?:[^/]+\/)?data\/log\/\d{4}-\d\d-\d\d\.jsonl$/.test(n)).sort();
  if (!names.length) throw new Error('archive contains no daily telemetry logs');
  return names.flatMap((n) => cp.execFileSync('tar', ['-xOzf', opt.archive, n],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).split('\n').filter(Boolean));
}

function boardKey(board) { return bookLib.boardKey(bookLib.normBoard(board)); }
function seasonOf(r) { return r.season || (r.s2 ? 2 : 1); }

function loadRecords(opt) {
  const sessions = new Map();
  for (const line of readLogs(opt)) {
    const e = JSON.parse(line);
    if (!['session_start', 'match_start', 'shop', 'battle', 'result'].includes(e.type)) continue;
    let list = sessions.get(e.session);
    if (!list) sessions.set(e.session, (list = []));
    list.push(e);
  }
  const rows = [], battles = [], matches = [];
  for (const [session, events] of sessions) {
    events.sort((a, b) => a.seq - b.seq);
    let dry = false;
    let episode = [];
    let ordinal = 0;
    for (const e of events) {
      if (e.type === 'session_start') { dry = !!e.dry; continue; }
      if (e.type !== 'result') { episode.push(e); continue; }
      // Older telemetry omitted `rated`; a non-null Elo delta is its rated evidence. The 194
      // Sep-19 result rows without either marker were observational and not rated matches.
      if (dry || e.ai || !e.opponent || e.rated === false
        || (e.rated !== true && e.eloDelta == null)) { episode = []; continue; }
      const handle = e.opponent;
      const starts = episode.filter((x) => x.type === 'match_start');
      const first = starts[0];
      if (seasonOf(first || {}) >= 3) {
        throw new Error('eval_recent/loss_audit support Season 1/2 telemetry only; Season 3 needs item and captain reconstruction. Use eval_season3 for the public-replay mock comparison.');
      }
      const prevHandle = first ? first.prevHandle || null : null;
      const known = episode.find((x) => x.handle === handle);
      const knownAt = known ? known.ts : e.ts;
      const byRound = new Map();
      for (const b of episode.filter((x) => x.type === 'battle' && Array.isArray(x.us) && x.us.length && Array.isArray(x.them) && x.them.length)) {
        if (!byRound.has(b.round)) byRound.set(b.round, b);
      }
      const id = `${session}:${ordinal++}:${e.matchId}`;
      const match = { id, session, result: e.result, opponent: handle, prevHandle,
        ts: e.ts, rounds: [...byRound.values()].sort((a, b) => a.round - b.round) };
      matches.push(match);
      for (const b of byRound.values()) {
        // Re-infer from frames using the current parser; older logs sometimes lost honey after
        // the server changed its opening caption. If frames are missing, retain the logged board.
        const inferred = b.frames && b.frames.length
          ? bookLib.inferGhost({ frames: b.frames, ourUnits: b.us, round: b.round, seats: b.seats })
          : [];
        const them = inferred.length ? inferred : b.them;
        battles.push({ ts: Math.max(Date.parse(b.ts), Date.parse(knownAt)), obsTs: Date.parse(b.ts),
          season: seasonOf(first || {}),
          handle, round: b.round, board: them, seats: b.seats || null,
          matchId: e.matchId, source: `log:${id}:${b.round}` });
        b.correctedThem = them;
      }
      for (const s of episode.filter((x) => x.type === 'shop')) {
        const b = byRound.get(s.round);
        if (!b || !s.offers || !s.board) continue;
        rows.push({ ts: s.ts, mid: id, round: s.round, s2: seasonOf(first || {}) >= 2,
          seats: s.seats || null, winner: b.winner, them: b.correctedThem,
          shop: { gold: s.gold, food: s.food, offers: s.offers, board: s.board },
          series: [(s.series && s.series.you) || 0, (s.series && s.series.them) || 0],
          handle: s.round === 0 ? s.handle || null : handle, prevHandle,
          result: e.result, us: b.us, battleTs: b.ts });
      }
      episode = [];
    }
  }
  // Seed observations were in the bot's book before the recent evaluation window. The corpus
  // overlaps the archive by time; exact duplicate observations are suppressed below.
  const corpus = fs.readFileSync(path.join(ROOT, 'data', 'corpus', 'battles.jsonl'), 'utf8');
  for (const line of corpus.split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (!r.handle || !r.them || !r.them.length) continue;
    battles.push({ ts: Date.parse(r.ts), obsTs: Date.parse(r.ts), season: seasonOf(r), handle: r.handle, round: r.round,
      board: r.them, seats: r.seats || null, matchId: r.mid,
      source: `corpus:${r.mid}:${r.round}` });
  }
  const seen = new Set();
  const unique = battles.filter((b) => {
    // The seeded corpus and copied live log overlap from Sep-19 17:34 to 19:15. In this archive
    // 346 observations occur in BOTH sources with exactly the same timestamp and board.
    const key = `${b.obsTs}|${b.season}|${b.handle}|${b.round}|${boardKey(b.board)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.ts - b.ts);
  rows.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  matches.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return { rows, battles: unique, matches };
}

function pickRows(rows, opt) {
  const from = Date.parse(opt.from), to = opt.to ? Date.parse(opt.to) : Infinity;
  const usable = rows.filter((r) => Date.parse(r.ts) >= from && Date.parse(r.ts) < to && evalPlanner.usable(r, false));
  if (!opt.limit || usable.length <= opt.limit) return usable;
  return Array.from({ length: opt.limit }, (_, i) => usable[Math.floor((i * usable.length) / opt.limit)]);
}

function score(records, opt, onRow) {
  const picked = pickRows(records.rows, opt);
  const book = bookLib.open(path.join('/tmp', `eval-recent-unused-${process.pid}.json`), { empty: true });
  let j = 0;
  for (const row of picked) {
    const t = Date.parse(row.ts);
    while (j < records.battles.length && records.battles[j].ts < t) {
      const b = records.battles[j++];
      book.record({ ...b, ts: b.obsTs == null ? b.ts : b.obsTs });
    }
    onRow(row, book);
  }
  return picked.length;
}

function pairedCI(values) {
  if (!values.length) return { mean: NaN, lo: NaN, hi: NaN };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (values.length < 2) return { mean, lo: NaN, hi: NaN };
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  const delta = 1.96 * Math.sqrt(variance / values.length);
  return { mean, lo: mean - delta, hi: mean + delta };
}

function main() {
  const opt = argsOf(process.argv.slice(2));
  const records = loadRecords(opt);
  const out = [];
  const n = score(records, opt, (row, book) => {
    for (const seed of opt.seeds) {
      const common = { seed, pool: 40, budget: opt.budget, roundLevel: false };
      const baseline = evalPlanner.runRow(row, book, common);
      const candidate = evalPlanner.runRow(row, book, {
        ...common, bookWeight0: opt.candidateR0, bookWeight12: opt.candidateR12,
        recencyHalfLifeMs: opt.candidateHalfLifeHours == null ? undefined : opt.candidateHalfLifeHours * 3600000,
      });
      out.push({ mid: row.mid, round: row.round, baseline: baseline.score,
        candidate: candidate.score, delta: candidate.score - baseline.score });
    }
  });
  console.log(`rated matches=${records.matches.length} selected shops=${n} simulations=${out.length}`);
  console.log(`window ${opt.from} to ${opt.to || 'archive end'}; budget=${opt.budget}ms`);
  const fmt = (v) => Number.isFinite(v) ? v.toFixed(4) : '-';
  for (const round of [0, 1, 2, null]) {
    const xs = out.filter((x) => round == null || x.round === round);
    const byMatch = new Map();
    for (const x of xs) { let a = byMatch.get(x.mid); if (!a) byMatch.set(x.mid, (a = [])); a.push(x); }
    const matchMean = (a, field) => a.reduce((p, q) => p + q[field], 0) / a.length;
    const ci = pairedCI([...byMatch.values()].map((a) => matchMean(a, 'delta')));
    const avg = (field) => byMatch.size
      ? [...byMatch.values()].reduce((s, a) => s + matchMean(a, field), 0) / byMatch.size : NaN;
    console.log(`${round == null ? 'ALL' : `R${round}`} n=${xs.length} matches=${byMatch.size}`
      + ` baseline=${fmt(avg('baseline'))} candidate=${fmt(avg('candidate'))}`
      + ` pairedDelta=${fmt(ci.mean)} [${fmt(ci.lo)}, ${fmt(ci.hi)}]`);
  }
}

if (require.main === module) main();
module.exports = { argsOf, loadRecords, pickRows, score, pairedCI };
