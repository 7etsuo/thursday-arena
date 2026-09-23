'use strict';
/**
 * Thursday Arena rated API, over the authenticated CDP page (lib/cdp.js).
 *
 *   observe : GET  /api/arena            -> {state, version, ...}
 *   act     : POST /api/arena {action, version}
 *
 * Three rules this module exists to enforce (docs/ENGINE_SHOP.md §1, audit/code_lib_infra.md):
 *   - HTTP 409 is a LOST optimistic-concurrency race, not a success. The old code fed the 409 body
 *     back to the caller as if the action had landed, so the loop planned on a board the server
 *     never built. Here a 409 refetches and returns {conflict:true} so the caller replans.
 *   - 429 / 5xx are retried with exponential backoff and jitter, then raised as a typed ArenaError.
 *   - Nothing is written to disk per poll (the old api/last_version.json write is gone).
 */
const crypto = require('crypto');
const cdp = require('./cdp');
const catalog = require('./catalog');

/** Actions that change server state. setDryRun(true) makes every one of them a no-op. */
const MUTATIONS = new Set([
  'start', 'restart', 'pickCaptain', 'buy', 'sell', 'reroll', 'feed', 'freeze', 'equip',
  'freezeItem', 'move', 'endShop', 'battleDone',
]);

class ArenaError extends Error {
  constructor(message, code, status, body) {
    super(message);
    this.name = 'ArenaError';
    this.code = code;          // transport | rate_limited | server_error | http_error | bad_action
    this.status = status == null ? null : status;
    this.body = body == null ? null : body;
  }
}

let lastEnvelope = null;
let dryRun = false;

const retry = {
  retries: 5,
  baseMs: 250,
  maxMs: 5000,
  // A rate limit is the server asking us to wait, not a failure: giving up after 7.75 s cost the
  // whole in-flight match (review R2-09).  429 gets its own, longer schedule and honours Retry-After.
  rateRetries: 8,
  rateBaseMs: 1000,
  rateMaxMs: 60000,
  // Retry delays are not decisions, so they use crypto rather than a seeded rng; lib/ still has no
  // Math.random. Tests inject a deterministic jitter/sleep through setRetryOptions().
  jitter: () => crypto.randomInt(0, 1000) / 1000,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

function setRetryOptions(o = {}) {
  Object.assign(retry, o);
  return { ...retry };
}

function backoff(attempt, o = {}) {
  // Retry-After is the server's minimum wait, not a jittered/capped retry estimate.
  if (o.fixedMs != null) return retry.sleep(Math.ceil(Math.max(0, o.fixedMs)));
  const base = o.baseMs == null ? retry.baseMs : o.baseMs;
  const max = o.maxMs == null ? retry.maxMs : o.maxMs;
  const full = Math.min(max, base * 2 ** attempt);
  return retry.sleep(Math.round(full * (0.5 + 0.5 * retry.jitter())));
}

/** Retry-After is either seconds or an HTTP date (RFC 9110 §10.2.3). */
function retryAfterMs(res) {
  const v = res && res.headers && (res.headers['retry-after'] || res.headers['Retry-After']);
  if (!v) return null;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

async function request(path, opts = {}) {
  // Each failure class keeps its own counter: a 429 streak used to consume the transport/5xx budget
  // too, so the first real error after a rate limit threw with zero retries of its own.
  let rateAttempts = 0;
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await cdp.arenaFetch(path, opts);
    } catch (e) {
      if (attempt >= retry.retries) {
        throw new ArenaError(`arena transport failed after ${attempt} retries: ${e.message}`, 'transport');
      }
      await backoff(attempt++);
      continue;
    }
    if (res.status === 409) return res;
    if (res.ok) {
      // A 200 whose body did not parse is not a success.  It used to reach observe() as `null`,
      // which driver/play_loop.js read as phase `idle` and answered with `start` -- abandoning a
      // match it was winning (review R2-01).
      if (res.json == null) {
        throw new ArenaError(
          `arena HTTP ${res.status} with a non-JSON body: ${(res.text || '').slice(0, 200)}`,
          'http_error',
          res.status,
          res.text
        );
      }
      return res;
    }
    if (res.status === 429) {
      if (rateAttempts >= retry.rateRetries) {
        throw new ArenaError(
          `arena HTTP 429 after ${rateAttempts} retries: ${(res.text || '').slice(0, 200)}`,
          'rate_limited', 429, res.json
        );
      }
      const after = retryAfterMs(res);
      await backoff(rateAttempts++, {
        baseMs: retry.rateBaseMs, maxMs: retry.rateMaxMs,
        fixedMs: after == null ? null : after,
      });
      continue;
    }
    if (res.status >= 500) {
      if (attempt >= retry.retries) {
        throw new ArenaError(
          `arena HTTP ${res.status} after ${attempt} retries: ${(res.text || '').slice(0, 200)}`,
          'server_error', res.status, res.json
        );
      }
      await backoff(attempt++);
      continue;
    }
    throw new ArenaError(
      `arena HTTP ${res.status}: ${(res.text || '').slice(0, 300)}`,
      'http_error',
      res.status,
      res.json
    );
  }
}

function remember(env) {
  if (env) lastEnvelope = env;
  return env;
}

/** Never returns null: request() rejects a 200 that did not parse (review R2-01). */
async function observe() {
  const res = await request('/api/arena');
  if (!res.json || typeof res.json !== 'object') {
    throw new ArenaError('arena returned no state envelope', 'http_error', res.status, res.text);
  }
  return remember(res.json);
}

/**
 * One action. Returns the new envelope, or {conflict:true, ...freshEnvelope} when the server
 * rejected our version: the action did NOT happen and the caller must replan from the fresh state.
 */
async function act(action, version) {
  if (!action || typeof action.type !== 'string') {
    throw new ArenaError('action.type required', 'bad_action');
  }
  // A dry run never POSTs, whatever the action is called.  Gating on the MUTATIONS name list let a
  // renamed or unrecognised action type through to the live server (review R2-07); MUTATIONS stays
  // as documentation of what the loop actually sends.
  if (dryRun) {
    const env = lastEnvelope || (await observe());
    return { ...env, dryRun: true, action };
  }
  let ver = version;
  if (ver == null) ver = lastEnvelope && (lastEnvelope.version ?? (lastEnvelope.state || {}).version);
  if (ver == null) ver = (await observe()).version ?? 0;   // observe() throws rather than returning null

  const res = await request('/api/arena', { method: 'POST', body: { action, version: ver } });
  if (res.status === 409) {
    const fresh = await observe();
    return { ...fresh, conflict: true, action };
  }
  return remember(res.json);
}

/** Merge the live catalog into lib/catalog.js (which persists data/catalog.json). */
async function getCatalog({ refresh = false } = {}) {
  if (!refresh) {
    const cached = catalog.getCatalog();
    if (cached.length) return cached;
  }
  const data = (await request('/api/catalog')).json;
  const bots = Array.isArray(data) ? data : (data && data.bots) || [];
  return catalog.setCatalog(bots);
}

async function getMe() {
  return (await request('/api/me')).json;
}

async function getLeaderboard() {
  return (await request('/api/leaderboard')).json;
}

/**
 * Best-effort, read-only lookup of a completed public match replay. A newly finished match may not
 * be published yet, and enrichment must not hold up the rated loop while the public API is down.
 * Return null for an absent, unavailable, or malformed replay; never send an arena action.
 */
async function getPublicMatchDetail(matchId) {
  if (typeof matchId !== 'string' || !matchId.trim()) return null;
  try {
    const path = `/api/public/v1/matches/${encodeURIComponent(matchId.trim())}`;
    const res = await cdp.arenaFetch(path, { method: 'GET', timeoutMs: 5000 });
    const detail = res && res.ok && res.json;
    return detail && typeof detail === 'object' && Array.isArray(detail.rounds) ? detail : null;
  } catch (_) {
    return null;
  }
}

async function playerMatches(handle, opts = {}) {
  const q = new URLSearchParams({
    x_handle: String(handle).replace(/^@/, ''),
    limit: String(opts.limit ?? 20),
  });
  if (opts.cursor) q.set('cursor', opts.cursor);
  const url = `/api/public/v1/matches?${q.toString()}`;
  // Background learning has its own checkpoint and retry schedule.
  const response = opts.bestEffort
    ? await cdp.arenaFetch(url, { method: 'GET', timeoutMs: 5000 })
    : await request(url);
  if (opts.bestEffort && !response?.ok) return null;
  const list = response.json;
  if (!opts.detail) return list;
  const id = opts.matchId || (list && list.data && list.data[0] && list.data[0].id);
  if (!id) return { list, detail: null };
  const detail = (await request(`/api/public/v1/matches/${encodeURIComponent(id)}`)).json;
  return { list, detail };
}

function setDryRun(v) {
  dryRun = !!v;
  return dryRun;
}

const isDryRun = () => dryRun;
const getLast = () => lastEnvelope;

async function getSeason() {
  const season = (await request('/api/season')).json?.number;
  if (!Number.isInteger(season) || season < 1) throw new ArenaError('Invalid current season', 'http_error');
  return season;
}

module.exports = {
  observe,
  act,
  getCatalog,
  getMe,
  getLeaderboard,
  getPublicMatchDetail,
  playerMatches,
  setDryRun,
  isDryRun,
  getLast,
  getSeason,
  setRetryOptions,
  ArenaError,
  MUTATIONS,
  connect: cdp.connect,
  disconnect: cdp.disconnect,
  detectCdpPort: cdp.detectCdpPort,
};
