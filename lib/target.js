'use strict';
/*
 * The TARGET: the weighted set of enemy boards every decision is scored against.
 *
 * WHY a mix and never a single board (audit/strategy.md §0.6, §3.1, §5):
 *   R1/R2, n=302 fights where the book board turned out wrong: pure book 0.651, pool-only 0.840, 75/25 MIX 0.879.
 *   Across all 5,066 R1/R2 shops: MIX 0.976 > book 0.957 > pool 0.915 > what the bot actually did 0.758.
 *   R0 (opponent hidden in 90.5% of R0 shops): the previous opponent's R0 board alone is +0.021 overall but
 *   -0.053 in S1-late and -0.080 in S2; the 50/50 mix is +0.059 and positive in EVERY era.
 * These remain the S1/S2 weights and the S3 calibration priors. S3 now estimates its weights
 * from recent pre-battle forecast errors, and samples its pool from recent outgoing games.
 * The historical measurements predate the 2026-09-20 rated ghost diversification.
 *
 * The pool leaves out the handle the book half already covers, which is how the audit measured it
 * ("leave-one-handle-out, so no information about this opponent", audit/strategy.md §3.1).
 */

const R0_BOOK_WEIGHT = 0.5;
const R12_BOOK_WEIGHT = 0.75;
const THIN_POOL = 10;   // below this many pooled boards, blend in the previous season (contract §lib/target.js)

// Keep this separate from the historical constant: the hidden-opponent prior is also used for
// future-round estimates made at R0. Both paths must change together when a new policy is validated.
const proxyBookWeight = (_season) => R0_BOOK_WEIGHT;

/**
 * build({book, season, round, handle, prevHandle, seats, limit, beforeTs, bookPolicy, recencyHalfLifeMs})
 *  -> {entries: [{board, weight, seats}], sources: {bookN, poolN, bookWeight}, note}
 * Weights sum to 1.  `seats` is the CURRENT match's seat rules and is attached to every entry: the book's own
 * per-entry seats describe the match it was recorded in, which is not the match we are about to play.
 */
function build({ book, season, round, handle, prevHandle, seats = null, limit = 40, beforeTs,
  bookWeight: bookWeightOverride, recencyHalfLifeMs = null,
  populationPolicy = Number(season) >= 3 ? 'recent' : 'frequency', populationWindow = 100,
  calibrate = Number(season) >= 3, proxy = false,
  bookPolicy = Number(season) >= 3 && recencyHalfLifeMs == null ? 'latest' : 'frequency' } = {}) {
  if (!['frequency', 'latest'].includes(bookPolicy)) throw new Error(`unknown book policy: ${bookPolicy}`);
  const r = Number(round) || 0;
  // R0 falls back on the PREVIOUS opponent because the handle is hidden in 90.5% of R0 shops -- but
  // it is known in the other 9.5%, and the real handle beats the proxy there (the prev-opponent top
  // board is exact only 47.0% of the time, n=641; review R1-05).
  // A FUTURE round planned from R0 (match-level valuation) has the same problem, so it may pass
  // prevHandle as `handle` together with the R0 confidence as `bookWeight`.
  const bookHandle = r === 0 || proxy ? handle || prevHandle : handle;
  const prior = r === 0 || proxy ? proxyBookWeight(season) : R12_BOOK_WEIGHT;
  const wantBook = bookWeightOverride != null ? bookWeightOverride
    : calibrate && book.confidence ? book.confidence(season, proxy ? 0 : r, bookHandle, prior, beforeTs) : prior;
  const notes = [];

  const bookRows = bookHandle ? book.lookup(season, bookHandle, r, { beforeTs }) : [];
  if (!bookHandle) notes.push(r === 0 ? 'no previous opponent' : 'no handle');
  else if (!bookRows.length) notes.push(`no book entry for ${bookHandle} r${r}`);

  let poolRows = book.pool(season, r, { limit, beforeTs, excludeHandle: bookHandle,
    policy: populationPolicy, window: populationWindow });
  if (poolRows.length < THIN_POOL && Number(season) > 1 && populationPolicy !== 'recent') {
    // thin same-season pool (a fresh season): S2 opened with 16 handles, so borrow the previous season's shapes
    const prev = book.pool(Number(season) - 1, r, { limit, beforeTs });
    if (prev.length) {
      const seen = new Set(poolRows.map(key));
      for (const p of prev) if (!seen.has(key(p))) { poolRows.push(p); seen.add(key(p)); }
      poolRows = poolRows.slice(0, limit);
      notes.push(`thin season-${Number(season)} pool, blended season ${Number(season) - 1}`);
    }
  }

  if (Number(season) === 4 && !poolRows.length && !bookRows.length) {
    poolRows = require('./season4_pool').pool(r, {beforeTs,excludeHandle:bookHandle,limit});
    if (poolRows.length) notes.push('fixed S4 public-board prior');
  }

  let bookWeight = bookRows.length ? wantBook : 0;
  if (!poolRows.length) {
    bookWeight = bookRows.length ? 1 : 0;
    if (bookRows.length) notes.push('empty pool, book only');
  }

  const entries = [];
  // S3 ghosts change lineups: the supplied chronological records favor the most recent sighting
  // over lifetime frequency (149 vs 127 correct later-round boards). Only the handle's share
  // changes; the pool remains the population prior and older boards remain in memory. Explicit
  // frequency/decay policies are available for comparison; S1/S2 retain frequency by default.
  const newest = bookRows.reduce((m, x) => Math.max(m, Number(x.lastTs) || 0), 0);
  const halfLife = Number(recencyHalfLifeMs);
  const recentWeight = (x) => {
    if (bookPolicy === 'latest' && newest > 0) return Number(x.lastTs) === newest ? x.n : 0;
    return recencyHalfLifeMs != null && halfLife > 0
      ? x.n * 2 ** (-Math.max(0, newest - (Number(x.lastTs) || newest)) / halfLife)
      : x.n;
  };
  const components = { book: [], pool: [] };
  const weightedBook = bookRows.map((x) => ({ board: x.board, captain: x.captain, relics: x.relics, w: recentWeight(x) }));
  const weightedPool = poolRows.map((x) => ({ board: x.board, captain: x.captain, relics: x.relics, w: x.weight }));
  push(components.book, weightedBook, 1, seats, 'book');
  push(components.pool, weightedPool, 1, seats, 'pool');
  push(entries, weightedBook,
    bookWeight, seats, 'book');
  push(entries, weightedPool,
    1 - bookWeight, seats, 'pool');

  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total > 0) for (const e of entries) e.weight /= total;   // kill float drift; weights must sum to 1

  const note = `r${r} book=${bookRows.length}@${bookWeight.toFixed(2)} pool=${poolRows.length}@${(1 - bookWeight).toFixed(2)}`
    + (bookPolicy === 'latest' ? ' latest' : '') + (notes.length ? ` (${notes.join('; ')})` : '');
  return { entries, components, sources: { bookN: bookRows.length, poolN: poolRows.length, bookWeight },
    model: { populationPolicy, populationWindow, calibrate }, note: note + ` ${populationPolicy} pool` };
}

const key = (row) => require('./book').boardKey(row.board, row.captain, row.relics);

function push(out, rows, share, seats, source) {
  if (!rows.length || share <= 0) return;
  const sum = rows.reduce((s, x) => s + (x.w > 0 ? x.w : 0), 0);
  for (const x of rows) {
    const w = x.w > 0 ? x.w : 0;
    if (!w) continue;
    out.push({ board: x.board, weight: (share * w) / sum, seats: seats || null, source,
      ...(x.captain ? { theirCaptain: x.captain } : {}), ...(x.relics ? { theirRelics: x.relics } : {}) });
  }
}

// Compute the two component forecasts for the FINAL ordered board before seeing its opponent.
// This is telemetry and subsequent probability calibration, never a hindsight decision input.
function forecast(units, target, options) {
  const sim = require('./sim');
  const out = Number(options.season) >= 4 ? {version: require('./opponent_model').S4_FORECAST_VERSION} : {};
  for (const source of ['book', 'pool']) {
    const entries = target.components?.[source] || target.entries.filter((e) => e.source === source);
    const mass = entries.reduce((s, e) => s + e.weight, 0);
    if (!mass) return null;
    const p = [0, 0, 0];
    for (const e of entries) {
      const winner = sim.outcome(units, e.board, { ...options,
        theirCaptain: options.theirCaptain ?? e.theirCaptain, theirRelics: options.theirRelics ?? e.theirRelics });
      p[winner === 'us' ? 0 : winner === 'draw' ? 1 : 2] += e.weight / mass;
    }
    out[source] = p.map((x) => Math.max(0, Math.min(1, x)));
  }
  return out;
}

module.exports = { build, forecast, proxyBookWeight, R0_BOOK_WEIGHT, R12_BOOK_WEIGHT, THIN_POOL };
