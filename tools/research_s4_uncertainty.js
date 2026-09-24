#!/usr/bin/env node
'use strict';
/**
 * Read-only, chronological research for Season 4 opponent uncertainty.
 *
 * It replays book events before each shop, then compares the shipped latest-only
 * same-handle component with broader recent snapshots.  September 23 is warm-up;
 * September 24 is split by code version into the 432-match development cohort and
 * the 177-match holdout cohort.  No arena request or memory write is made.
 *
 * Usage:
 *   node tools/research_s4_uncertainty.js [--old-log FILE] [--new-log FILE] [--out FILE]
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bookLib = require('../lib/book');
const targetLib = require('../lib/target');
const sim = require('../lib/sim');
const planner = require('../lib/planner');
const shopModel = require('../lib/shop_model');

const DEFAULT_OLD = '/tmp/arena-log-review-20260924-000457/records/data/log/2026-09-23.jsonl';
const DEFAULT_NEW = '/tmp/arena-log-review-20260924-133808/records/data/log/2026-09-24.jsonl';
const DEV_CODE = '889c4750a726';
const HOLDOUT_CODE = '5073bd7ec189';

function args(argv) {
  const o = { oldLog: DEFAULT_OLD, newLog: DEFAULT_NEW, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--old-log') o.oldLog = path.resolve(argv[++i]);
    else if (argv[i] === '--new-log') o.newLog = path.resolve(argv[++i]);
    else if (argv[i] === '--out') o.out = path.resolve(argv[++i]);
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return o;
}

const read = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const ms = (x) => Date.parse(x);
const normHandle = (x) => String(x || '').trim().toLowerCase();
const actualIndex = (outcome) => outcome === 'you' ? 0 : outcome === 'draw' ? 1 : 2;
const scoreOutcome = (outcome) => outcome === 'us' || outcome === 'you' ? 1 : outcome === 'draw' ? 0.5 : 0;
const brier = (p, y) => p.reduce((s, x, i) => s + (x - (i === y ? 1 : 0)) ** 2, 0);
const logLoss = (p, y) => -Math.log(Math.max(1e-9, p[y]));
const mix = (a, book, pool) => book.map((x, i) => a * x + (1 - a) * pool[i]);
const mean = (xs) => xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null;

function boardVisibleKey(board) {
  return (board || []).map((u) => `${u.name}/${u.atk}/${u.hp}`).join(';');
}

function names(board) {
  return (board || []).map((u) => String(u.name));
}

function multisetDice(a, b) {
  const counts = new Map();
  for (const x of names(a)) counts.set(x, (counts.get(x) || 0) + 1);
  let hit = 0;
  for (const x of names(b)) if ((counts.get(x) || 0) > 0) {
    hit++; counts.set(x, counts.get(x) - 1);
  }
  return a.length + b.length ? 2 * hit / (a.length + b.length) : 0;
}

function boardSimilarity(a, b) {
  const dice = multisetDice(a, b);
  if (!a.length || !b.length) return dice;
  // Stats are a weak tiebreak after composition. Match equal names greedily.
  const used = new Set(); let delta = 0, matched = 0;
  for (const x of a) {
    let best = -1, d = Infinity;
    for (let i = 0; i < b.length; i++) if (!used.has(i) && b[i].name === x.name) {
      const z = Math.abs(Number(x.atk) - Number(b[i].atk)) + Math.abs(Number(x.hp) - Number(b[i].hp));
      if (z < d) { d = z; best = i; }
    }
    if (best >= 0) { used.add(best); delta += d; matched++; }
  }
  const stats = matched ? Math.exp(-delta / (4 * matched)) : 0;
  return 0.85 * dice + 0.15 * stats;
}

const VARIANTS = [
  // recent1 is a negative control: it must reproduce the shipped latest-only component.
  { id: 'recent1_control', n: 1, halfLife: Infinity, control: true },
  // Small uncertainty tails retain most mass on the latest sighting.  These were added after the
  // development cohort showed that equal-weight widening changed too many seat decisions.
  { id: 'tail2_95', n: 2, latestShare: 0.95 },
  { id: 'tail2_90', n: 2, latestShare: 0.90 },
  { id: 'tail3_90', n: 3, latestShare: 0.90 },
  { id: 'tail5_90', n: 5, latestShare: 0.90 },
  { id: 'tail5_80', n: 5, latestShare: 0.80 },
  { id: 'decay5_h05', n: 5, halfLife: 0.5 },
  { id: 'recent2', n: 2, halfLife: Infinity },
  { id: 'decay5_h1', n: 5, halfLife: 1 },
  // Conditioning screens requested by the audit.  They remain controls unless development wins.
  { id: 'captain5', n: 5, halfLife: Infinity, captain: true },
  { id: 'trajectory5', n: 5, halfLife: Infinity, trajectory: true },
];

function confidence(rows, round, handle, prior, beforeTs) {
  const recent = rows.filter((r) => r.ts < beforeTs && r.ts >= beforeTs - 3600000 && r.round === round)
    .slice(-128);
  const fit = (sample, center, strength) => {
    let num = strength * center, den = strength;
    for (const r of sample) {
      for (let i = 0; i < 3; i++) {
        const d = r.book[i] - r.pool[i];
        num += d * ((i === r.actual ? 1 : 0) - r.pool[i]);
        den += d * d;
      }
    }
    return Math.max(0, Math.min(1, num / den));
  };
  if (round === 0 || !handle) return fit(recent, prior, 8);
  const global = fit(recent.filter((r) => r.handle !== handle), prior, 8);
  return fit(recent.filter((r) => r.handle === handle).slice(-32), global, 8);
}

function weightedEntries(observations, variant, shop, previousBoard, byMatchRound) {
  let rows = observations.slice().sort((a, b) => b.observedMs - a.observedMs || b.ingested - a.ingested);
  if (variant.captain && shop.rivalCaptain) {
    const exact = rows.filter((r) => r.captain === shop.rivalCaptain);
    if (exact.length) rows = exact;
  }
  rows = rows.slice(0, variant.n);
  if (!rows.length) return [];

  const similarities = new Map();
  if (variant.trajectory && previousBoard) {
    for (const r of rows) {
      const prev = byMatchRound.get(`${r.matchId}:${shop.round - 1}`);
      similarities.set(r, prev ? boardSimilarity(previousBoard, prev.board) : 0);
    }
    // If at least one historical trajectory is linked, retain broad support but strongly favor
    // candidates whose already-seen previous-round board resembles this match.
    if (![...similarities.values()].some((x) => x > 0)) similarities.clear();
  }

  const agg = new Map();
  rows.forEach((r, rank) => {
    let recency;
    if (variant.latestShare != null) {
      recency = rank === 0 ? variant.latestShare : (1 - variant.latestShare) / (rows.length - 1);
    } else recency = Number.isFinite(variant.halfLife) ? 2 ** (-rank / variant.halfLife) : 1;
    const trajectory = similarities.size ? Math.exp(3 * similarities.get(r)) : 1;
    const weight = recency * trajectory;
    const key = bookLib.boardKey(r.board, r.captain, r.relics);
    const old = agg.get(key);
    if (old) old.weight += weight;
    else agg.set(key, { board: r.board, weight, theirCaptain: r.captain, theirRelics: r.relics });
  });
  const out = [...agg.values()];
  const total = out.reduce((s, x) => s + x.weight, 0);
  return out.map((x) => ({ ...x, weight: x.weight / total, seats: shop.seats, source: 'book' }));
}

function probabilities(us, entries, options) {
  const p = [0, 0, 0];
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (!total) return null;
  for (const e of entries) {
    const outcome = sim.outcome(us, e.board, {
      ...options,
      theirCaptain: options.theirCaptain ?? e.theirCaptain,
      theirRelics: options.theirRelics ?? e.theirRelics,
    });
    p[outcome === 'us' ? 0 : outcome === 'draw' ? 1 : 2] += e.weight / total;
  }
  return p;
}

function combineTarget(book, pool, alpha, seats) {
  const out = [];
  for (const e of book) out.push({ ...e, weight: e.weight * alpha, seats });
  for (const e of pool) out.push({ ...e, weight: e.weight * (1 - alpha), seats });
  return out.filter((e) => e.weight > 0);
}

function summarize(rows, variant) {
  const eligible = rows.filter((r) => r.variants[variant]?.candidate);
  const values = (field) => eligible.map((r) => r.variants[variant][field]);
  const losses = eligible.filter((r) => r.actual === 2);
  const sodium = eligible.filter((r) => r.handle === 'sodiumhyrdride');
  const changed = eligible.filter((r) => r.variants[variant].seatChanged);
  const seatBetter = changed.filter((r) => r.variants[variant].seatDelta > 0).length;
  const seatWorse = changed.filter((r) => r.variants[variant].seatDelta < 0).length;
  const reliability = (field) => {
    const bins = Array.from({ length: 5 }, (_, i) => ({ lo: i / 5, hi: (i + 1) / 5,
      n: 0, predicted: 0, observed: 0 }));
    for (const r of eligible) {
      const p = r.variants[variant][field][0];
      const b = bins[Math.min(4, Math.floor(p * 5))];
      b.n++; b.predicted += p; b.observed += r.actual === 0 ? 1 : 0;
    }
    for (const b of bins) {
      b.predicted = b.n ? b.predicted / b.n : null;
      b.observed = b.n ? b.observed / b.n : null;
    }
    return bins;
  };
  const currentCalibration = reliability('pCurrent');
  const latestCalibration = reliability('pLatest');
  const candidateCalibration = reliability('pCandidate');
  const ece = (bins) => bins.reduce((s, b) => s + (b.n ? b.n / eligible.length *
    Math.abs(b.predicted - b.observed) : 0), 0);
  const handleCounts = (which) => Object.fromEntries([...losses.reduce((m, r) => {
    if (r.variants[variant][which][0] < 1 - 1e-9) return m;
    m.set(r.handle, (m.get(r.handle) || 0) + 1); return m;
  }, new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  return {
    rows: eligible.length,
    brierLoggedBaseline: mean(values('brierCurrent')),
    brierLatestCorrected: mean(values('brierLatest')),
    brierCandidateCurrentWeight: mean(values('brierCandidateFixed')),
    brierCandidateRecalibrated: mean(values('brierCandidateAdaptive')),
    pairedBrierDeltaVsLogged: mean(values('brierDeltaVsLogged')),
    pairedBrierDeltaVsLatest: mean(values('brierDeltaVsLatest')),
    pairedBrierDeltaAdaptiveVsLogged: mean(values('brierDeltaAdaptiveVsLogged')),
    logLossDeltaVsLogged: mean(values('logLossDeltaVsLogged')),
    logLossDeltaVsLatest: mean(values('logLossDeltaVsLatest')),
    winCalibrationEceCurrent: ece(currentCalibration),
    winCalibrationEceLatest: ece(latestCalibration),
    winCalibrationEceCandidate: ece(candidateCalibration),
    winCalibrationCurrent: currentCalibration,
    winCalibrationLatest: latestCalibration,
    winCalibrationCandidate: candidateCalibration,
    supportCurrent: mean(values('supportCurrent')),
    supportCandidate: mean(values('supportCandidate')),
    lossRows: losses.length,
    lossMeanWinCurrent: mean(losses.map((r) => r.variants[variant].pCurrent[0])),
    lossMeanWinLatest: mean(losses.map((r) => r.variants[variant].pLatest[0])),
    lossMeanWinCandidate: mean(losses.map((r) => r.variants[variant].pCandidate[0])),
    overconfidentLossesCurrent: losses.filter((r) => r.variants[variant].pCurrent[0] >= 1 - 1e-9).length,
    overconfidentLossesLatest: losses.filter((r) => r.variants[variant].pLatest[0] >= 1 - 1e-9).length,
    overconfidentLossesCandidate: losses.filter((r) => r.variants[variant].pCandidate[0] >= 1 - 1e-9).length,
    overconfidentLossHandlesLatest: handleCounts('pLatest'),
    overconfidentLossHandlesCandidate: handleCounts('pCandidate'),
    sodiumRows: sodium.length,
    sodiumBrierDeltaVsLatest: mean(sodium.map((r) => r.variants[variant].brierDeltaVsLatest)),
    seatChanged: changed.length,
    seatBetter,
    seatWorse,
    seatTied: changed.length - seatBetter - seatWorse,
    seatScoreDelta: changed.length ? mean(changed.map((r) => r.variants[variant].seatDelta)) : null,
  };
}

function pairedInterval(rows, variant, field, samples = 5000) {
  const byMatch = new Map();
  for (const r of rows) if (r.variants[variant]?.candidate) {
    const a = byMatch.get(r.matchKey) || [];
    a.push(r.variants[variant][field]); byMatch.set(r.matchKey, a);
  }
  const clusters = [...byMatch.values()].map(mean);
  if (clusters.length < 2) return [null, null];
  let seed = 0x9e3779b9;
  const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = seed;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const draws = [];
  for (let b = 0; b < samples; b++) {
    let s = 0;
    for (let i = 0; i < clusters.length; i++) s += clusters[Math.floor(rand() * clusters.length)];
    draws.push(s / clusters.length);
  }
  draws.sort((a, b) => a - b);
  return [draws[Math.floor(samples * 0.025)], draws[Math.floor(samples * 0.975)]];
}

function run(options = {}) {
  const oldLog = options.oldLog || DEFAULT_OLD, newLog = options.newLog || DEFAULT_NEW;
  const events = [...read(oldLog).map((e) => ({ ...e, _day: 'warmup' })),
    ...read(newLog).map((e) => ({ ...e, _day: 'evaluation' }))];
  const sourceMatches = {
    older432: events.filter((e) => e._day === 'evaluation' && e.code === DEV_CODE && e.type === 'result').length,
    newer177: events.filter((e) => e._day === 'evaluation' && e.code === HOLDOUT_CODE && e.type === 'result').length,
  };
  const tmp = path.join(os.tmpdir(), `arena-s4-uncertainty-${process.pid}.json`);
  const book = bookLib.open(tmp, { empty: true, merge: false });
  const context = new Map(), shops = new Map(), seenBoards = new Map();
  const observations = [], observationIds = new Set(), byMatchRound = new Map();
  const calibration = Object.fromEntries(VARIANTS.map((v) => [v.id, []]));
  const rows = [];
  const baseline = { holdoutShopsR0to2: 0, targetCountMatches: 0, targetWeightMatches: 0,
    loggedForecasts: 0, forecastComponentMatches: 0, recent1BookMatches: 0 };
  const originalAuditFile = path.resolve(path.dirname(newLog), '../../..', 'targets.json');
  if (fs.existsSync(originalAuditFile)) {
    const audit = JSON.parse(fs.readFileSync(originalAuditFile, 'utf8'));
    baseline.originalAuditArtifact = { file: originalAuditFile, shops: audit.shops,
      countMatches: audit.countMatches, weightMatches: audit.weightMatches,
      forecasts: audit.forecasts, forecastMatches: audit.forecastMatches };
  }
  let ingested = 0;

  for (const event of events) {
    if (event.type === 'match_start') context.set(event.matchKey, event);
    if (event.type === 'shop' && event.season === 4 && event.round <= 2) {
      const beforeTs = ms(event.ts);
      const sourceHandle = normHandle(event.round === 0
        ? event.handle || context.get(event.matchKey)?.prevHandle : event.handle);
      const target = targetLib.build({ book, season: 4, round: event.round,
        handle: event.handle, prevHandle: context.get(event.matchKey)?.prevHandle,
        seats: event.seats, beforeTs });
      if (event._day === 'evaluation' && event.code === HOLDOUT_CODE) {
        baseline.holdoutShopsR0to2++;
        baseline.targetCountMatches += Number(target.sources.bookN === event.target?.bookN &&
          target.sources.poolN === event.target?.poolN);
        baseline.targetWeightMatches += Number(Math.abs(target.sources.bookWeight -
          Number(event.target?.bookWeight)) < 1e-8);
      }
      const eligible = observations.filter((o) => o.handle === sourceHandle && o.round === event.round &&
        o.observedMs < beforeTs);
      const previousBoard = seenBoards.get(event.matchKey)?.get(event.round - 1)?.board || null;
      const candidates = {};
      for (const variant of VARIANTS) {
        const entries = weightedEntries(eligible, variant, event, previousBoard, byMatchRound);
        const prior = event.round === 0 ? 0.5 : 0.75;
        candidates[variant.id] = { entries,
          alpha: entries.length ? confidence(calibration[variant.id], event.round, sourceHandle,
            prior, beforeTs) : 0 };
      }
      shops.set(`${event.matchKey}:${event.round}`, { shop: event, target, sourceHandle,
        candidates, previousBoard, day: event._day });
    }
    if (event.type === 'battle' && event.season === 4 && event.round <= 2 && event.us?.length) {
      const key = `${event.matchKey}:${event.round}`, row = shops.get(key);
      if (row) {
        row.battle = event;
        const map = seenBoards.get(event.matchKey) || new Map();
        map.set(event.round, { board: event.them, captain: event.rivalCaptain, relics: event.rivalRelics });
        seenBoards.set(event.matchKey, map);
        const shop = row.shop;
        const options = { season: 4, round: shop.round, seats: shop.seats,
          ourCaptain: shop.captain, theirCaptain: shop.rivalCaptain,
          ourRelics: shop.relics,
          // Shop relic information belongs to the previous fight, so each historical candidate's
          // own relics remain the prior for this fight.
          theirRelics: shopModel.planningRivalRelics(shop) };
        row.options = options;
        row.currentBook = probabilities(event.us, row.target.components.book, options);
        row.pool = probabilities(event.us, row.target.components.pool, options);
        for (const variant of VARIANTS) row.candidates[variant.id].forecast =
          probabilities(event.us, row.candidates[variant.id].entries, options);
      }
    }
    if (event.type === 'book' && event.season === 4) {
      const receipt = event.observationId;
      const accepted = !receipt || !observationIds.has(receipt);
      if (receipt) observationIds.add(receipt);
      if (event.role === 'attack' && event.round <= 2) {
        const row = shops.get(`${event.matchKey}:${event.round}`);
        // Compare only rows whose deployed bot recorded its pre-battle component forecast.  This
        // fixes the evaluation population before looking at any candidate's support.
        if (row?.battle && row.pool && event.forecast?.book && event.forecast?.pool) {
          row.actualEvent = event;
          const actual = actualIndex(event.outcome);
          const alphaCurrent = Number.isFinite(Number(row.shop.target?.bookWeight))
            ? Number(row.shop.target.bookWeight) : row.target.sources.bookWeight;
          const currentBook = row.currentBook || row.pool;
          // Preserve the prediction that actually drove the recorded run as the calibration
          // baseline.  pLatest is the latest-only policy rerun through today's corrected engine;
          // widening must beat that control too, so engine fixes are not credited to uncertainty.
          const pCurrent = mix(alphaCurrent, event.forecast.book, event.forecast.pool);
          const pLatest = mix(row.currentBook ? alphaCurrent : 0, currentBook, row.pool);
          const out = { cohort: row.day === 'evaluation'
              ? event.code === DEV_CODE ? 'older432' : event.code === HOLDOUT_CODE ? 'newer177' : 'other'
              : 'warmup', matchKey: event.matchKey, matchId: event.matchId, ts: row.shop.ts,
            round: event.round, handle: normHandle(event.handle), actual, outcome: event.outcome,
            sourceHandle: row.sourceHandle, bookWeight: alphaCurrent,
            variants: {} };
          const fullActual = bookLib.boardKey(event.board, event.captain, event.relics);
          const currentSupport = row.target.components.book.some((x) =>
            bookLib.boardKey(x.board, x.theirCaptain, x.theirRelics) === fullActual);
          if (event.code === HOLDOUT_CODE) {
            baseline.loggedForecasts++;
            baseline.forecastComponentMatches += Number(['book', 'pool'].every((source) =>
              row[source === 'book' ? 'currentBook' : 'pool']?.every((p, i) =>
                Math.abs(p - event.forecast[source][i]) < 1e-8)));
          }
          for (const variant of VARIANTS) {
            const candidate = row.candidates[variant.id];
            if (!candidate.forecast) { out.variants[variant.id] = { candidate: false }; continue; }
            const pFixed = mix(alphaCurrent, candidate.forecast, row.pool);
            const pAdaptive = mix(candidate.alpha, candidate.forecast, row.pool);
            if (event.code === HOLDOUT_CODE && variant.control) baseline.recent1BookMatches += Number(
              candidate.forecast.every((p, i) => Math.abs(p - row.currentBook[i]) < 1e-8));
            const candidateSupport = candidate.entries.some((x) =>
              bookLib.boardKey(x.board, x.theirCaptain, x.theirRelics) === fullActual);
            const metrics = { candidate: true, alphaAdaptive: candidate.alpha,
              pCurrent, pLatest, pCandidate: pFixed, pCandidateAdaptive: pAdaptive,
              brierCurrent: brier(pCurrent, actual),
              brierLatest: brier(pLatest, actual),
              brierCandidateFixed: brier(pFixed, actual),
              brierCandidateAdaptive: brier(pAdaptive, actual),
              brierDeltaVsLogged: brier(pFixed, actual) - brier(pCurrent, actual),
              brierDeltaVsLatest: brier(pFixed, actual) - brier(pLatest, actual),
              brierDeltaAdaptiveVsLogged: brier(pAdaptive, actual) - brier(pCurrent, actual),
              logLossDeltaVsLogged: logLoss(pFixed, actual) - logLoss(pCurrent, actual),
              logLossDeltaVsLatest: logLoss(pFixed, actual) - logLoss(pLatest, actual),
              supportCurrent: currentSupport ? 1 : 0, supportCandidate: candidateSupport ? 1 : 0,
              seatChanged: false, seatDelta: 0 };
            const currentTarget = combineTarget(row.target.components.book, row.target.components.pool,
              alphaCurrent, row.shop.seats);
            const candidateTarget = combineTarget(candidate.entries, row.target.components.pool,
              alphaCurrent, row.shop.seats);
            if (currentTarget.length && candidateTarget.length) {
              const utility = planner.utility(row.shop.round, row.shop.series);
              const oldSeat = sim.bestSeating(row.battle.us, currentTarget,
                { ...row.options, utility })[0].order;
              const newSeat = sim.bestSeating(row.battle.us, candidateTarget,
                { ...row.options, utility })[0].order;
              const seatKey = (b) => b.map((u) => `${u.name}/${u.atk}/${u.hp}/${u.item || ''}`).join('|');
              metrics.seatChanged = seatKey(oldSeat) !== seatKey(newSeat);
              if (metrics.seatChanged) {
                const actualOpts = { ...row.options, theirCaptain: event.captain,
                  theirRelics: event.relics };
                metrics.seatDelta = scoreOutcome(sim.outcome(newSeat, event.board, actualOpts)) -
                  scoreOutcome(sim.outcome(oldSeat, event.board, actualOpts));
              }
            }
            out.variants[variant.id] = metrics;
            calibration[variant.id].push({ ts: ms(event.observedAt || event.ts), round: event.round,
              handle: normHandle(event.handle), book: candidate.forecast, pool: row.pool, actual });
          }
          rows.push(out);
        }
      }
      const recorded = book.record({ ...event, ts: event.observedAt,
        role: event.source === 'defense_replay' ? 'defense' : event.role });
      if (accepted && recorded) {
        const observation = { handle: normHandle(event.handle), round: Number(event.round),
          board: bookLib.normBoard(event.board), captain: event.captain || null,
          relics: event.relics || [], matchId: String(event.matchId || ''),
          observedMs: ms(event.observedAt || event.ts), ingested: ingested++ };
        observations.push(observation);
        if (observation.matchId) byMatchRound.set(`${observation.matchId}:${observation.round}`, observation);
      }
    }
  }

  const cohorts = {};
  for (const cohort of ['older432', 'newer177']) {
    const selected = rows.filter((r) => r.cohort === cohort);
    cohorts[cohort] = { sourceMatches: sourceMatches[cohort], rows: selected.length,
      forecastMatches: new Set(selected.map((r) => r.matchKey)).size,
      rounds: Object.fromEntries([0, 1, 2].map((r) =>
      [r, selected.filter((x) => x.round === r).length])), variants: {} };
    for (const variant of VARIANTS) {
      cohorts[cohort].variants[variant.id] = summarize(selected, variant.id);
      cohorts[cohort].variants[variant.id].brierDelta95VsLogged = pairedInterval(selected,
        variant.id, 'brierDeltaVsLogged');
      cohorts[cohort].variants[variant.id].brierDelta95VsLatest = pairedInterval(selected,
        variant.id, 'brierDeltaVsLatest');
    }
  }
  return { inputs: { oldLog, newLog }, baseline, variants: VARIANTS, cohorts,
    rows, limitations: [
      'September 23 is warm-up; candidate selection must use older432 only and newer177 as holdout.',
      'Every comparison holds the logged shop book weight fixed and changes only same-handle board support.',
      'The logged forecast remains the calibration baseline. A corrected-engine latest-only control isolates widening from later simulator fixes.',
      'Forecast comparisons keep the actually played board fixed and do not estimate changed shopping trajectories.',
      'Prior-round trajectory conditioning uses only the already observed earlier battle in the same match.',
      'Fixed-board seating comparisons omit the production defense objective and isolate attack-target ordering.',
    ] };
}

if (require.main === module) {
  try {
    const o = args(process.argv.slice(2));
    const result = run(o);
    if (o.out) fs.writeFileSync(o.out, JSON.stringify(result, null, 2) + '\n');
    const compact = { inputs: result.inputs, baseline: result.baseline,
      cohorts: result.cohorts, limitations: result.limitations };
    console.log(JSON.stringify(compact, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = { run, boardSimilarity, weightedEntries, confidence, VARIANTS };
