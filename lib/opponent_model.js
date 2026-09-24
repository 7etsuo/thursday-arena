'use strict';
// A bounded chronological sample of OUR outgoing games. Retained-board counts and incoming
// defenses are not samples from that queue. Everything here is pure and uses only prior rows.
const LIMIT = 400;
const WINDOW = 100;
// Forecasts from the old S4 engine / stale shop-relic override are incomparable
// with corrected predictions. Preserve their boards and outcomes, but do not
// fit today's confidence to those obsolete probability errors.
const S4_FORECAST_VERSION = `s4-${require('./season4').BATTLE_MODEL_VERSION}`;
const key = (r) => `${r.season}|${r.matchId}|${r.round}`;

function validForecast(f) {
  return f && ['book', 'pool'].every((k) => Array.isArray(f[k]) && f[k].length === 3 &&
    f[k].every((p) => Number.isFinite(p) && p >= 0 && p <= 1) &&
    Math.abs(f[k].reduce((a, p) => a + p, 0) - 1) < 1e-8);
}

function validate(rows) {
  return Array.isArray(rows) && rows.every((r) => r && Number.isInteger(r.season) &&
    Number.isInteger(r.round) && r.round >= 0 && r.round <= 2 && typeof r.handle === 'string' &&
    typeof r.matchId === 'string' && Number.isFinite(r.ts) && Array.isArray(r.board) && r.board.length &&
    (r.forecast == null || validForecast(r.forecast)) &&
    (r.outcome == null || ['you', 'them', 'draw'].includes(r.outcome)));
}

function append(data, row) {
  const rows = data.outgoing || [];
  if (rows.some((r) => key(r) === key(row))) return;
  rows.push(row);
  rows.sort((a, b) => a.ts - b.ts || key(a).localeCompare(key(b)));
  const counts = new Map();
  data.outgoing = rows.filter((r) => r.season === row.season).reverse().filter((r) => {
    const n = (counts.get(r.round) || 0) + 1; counts.set(r.round, n); return n <= LIMIT;
  }).reverse();
}

function recent(data, season, round, beforeTs, window = WINDOW) {
  const eligible = (data.outgoing || []).filter((r) => r.season === Number(season) &&
    r.round === Number(round) && (beforeTs == null || r.ts < beforeTs));
  const at = beforeTs ?? eligible.at(-1)?.ts ?? 0;
  return eligible.filter((r) => r.ts >= at - 3600000).slice(-window);
}

function population(data, season, round, { beforeTs, excludeHandle, limit = 40, window = WINDOW } = {}, boardKey) {
  const rows = recent(data, season, round, beforeTs, window), agg = new Map();
  for (const r of rows) {
    if (r.handle === excludeHandle) continue;
    const k = boardKey(r.board, r.captain, r.relics), old = agg.get(k);
    if (old) { old.weight++; old.lastTs = r.ts; }
    else agg.set(k, { board: r.board, captain: r.captain, relics: r.relics, weight: 1, lastTs: r.ts });
  }
  return [...agg.values()].sort((a, b) => b.weight - a.weight || b.lastTs - a.lastTs).slice(0, limit);
}

// Constrained least-squares probability calibration. Minimize the past multiclass Brier loss
// of alpha*book + (1-alpha)*pool plus a quadratic prior. Recompute over a bounded window so a
// change in prediction quality can recover; no lifetime success/failure counter accumulates.
function confidence(data, season, round, handle, prior, beforeTs) {
  const rows = recent(data, season, round, beforeTs, 128).filter((r) => validForecast(r.forecast) && r.outcome &&
    (Number(season) < 4 || r.forecast.version === S4_FORECAST_VERSION));
  const fit = (sample, center, strength) => {
    let num = strength * center, den = strength;
    for (const r of sample) {
      const actual = r.outcome === 'you' ? 0 : r.outcome === 'draw' ? 1 : 2;
      for (let i = 0; i < 3; i++) {
        const d = r.forecast.book[i] - r.forecast.pool[i];
        num += d * ((i === actual ? 1 : 0) - r.forecast.pool[i]); den += d * d;
      }
    }
    return Math.max(0, Math.min(1, num / den));
  };
  if (Number(round) === 0 || !handle) return fit(rows, prior, 8);
  const global = fit(rows.filter((r) => r.handle !== handle), prior, 8);
  return fit(rows.filter((r) => r.handle === handle).slice(-32), global, 8);
}

module.exports = { LIMIT, WINDOW, S4_FORECAST_VERSION, validate, validForecast, append, recent, population, confidence };
