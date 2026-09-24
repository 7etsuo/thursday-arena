#!/usr/bin/env node
'use strict';
/**
 * The loop. All intelligence is in lib/planner.js; this file only turns planner output into
 * server actions safely.
 *
 *   node driver/play_loop.js [--once] [--dry] [--start] [--games N] [--seed S]
 *
 * Rules it enforces (contract + audit/code_play_loop.md):
 *   - one instance at a time (pid lock at data/play_loop.lock, stale after 10 min);
 *   - one action at a time; the envelope each act() returns IS the new state, so the planner never
 *     plans against a shop the server has moved on from;
 *   - the target is built once per shop, not once per action;
 *   - start/restart only ever from result/idle;
 *   - at R0 the hidden-handle battle is buffered until the handle appears (R1 or result);
 *   - a late server match ID is promoted inside the same context, preserving the once-per-round
 *     record and the board that fought;
 *   - any throw is logged to telemetry, the lock is released, exit code 1.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const sim = require('../lib/sim');
const catalog = require('../lib/catalog');
const shopModel = require('../lib/shop_model');
const targetLib = require('../lib/target');
const bookLib = require('../lib/book');
const telemetryLib = require('../lib/telemetry');
const historyLib = require('../lib/public_history');

const LOCK_FILE = path.join(ROOT, 'data', 'play_loop.lock');
const LAST_OPPONENT = path.join(ROOT, 'memory', 'last_opponent.json');
const STALE_LOCK_MS = 10 * 60 * 1000;
const MAX_SHOP_STEPS = 24;   // 10 gold cannot pay for more than this many useful actions
const MAX_MATCH_STEPS = 4000;
const MAX_NO_PROGRESS = 8;   // consecutive outer iterations that change nothing before giving up
const NO_PROGRESS_BASE_MS = 500;
const NO_PROGRESS_MAX_MS = 30000;
const PHASES = new Set(['shop', 'battle', 'result', 'idle']);

// ---------------------------------------------------------------- lock

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';   // alive, just not ours to signal
  }
}

/**
 * Exclusive pid lock.  ONLY a dead pid releases it: the age test used to be OR'd with the liveness
 * test against a `ts` written once at acquire, so a healthy `--games 15` batch (which cannot finish
 * in 10 minutes) was evicted and a second rated loop started on the same account (review R2-02).
 * `ts` is now a heartbeat the loop refreshes, kept for diagnostics.
 * -> release(), with release.touch() to beat the heart.
 */
function acquireLock(file = LOCK_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const write = (fd) => fs.writeSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() }));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx');
      write(fd);
      fs.closeSync(fd);
      const release = () => { try { fs.unlinkSync(file); } catch {} };
      release.touch = () => {
        try {
          fs.writeFileSync(`${file}.tmp-${process.pid}`, JSON.stringify({ pid: process.pid, ts: Date.now() }));
          fs.renameSync(`${file}.tmp-${process.pid}`, file);
        } catch {}
      };
      return release;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let held = null;
      try { held = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
      if (held && pidAlive(held.pid)) {
        throw new Error(`play_loop already running (pid ${held.pid})`);
      }
      // two racing reclaimers both unlink; the loser must not throw a bare ENOENT (review R2-02)
      try { fs.unlinkSync(file); } catch {}
    }
  }
  throw new Error('could not acquire play_loop lock');
}

// ---------------------------------------------------------------- helpers

const mulberry32 = sim.mulberry32;   // one seeded rng for the whole repo (review R3-7)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "AI" is the client's placeholder handle for a match with no ghost, not an opponent.
const handleOf = (s) => {
  const h = s ? String(s).replace(/^@/, '').trim().toLowerCase() : '';
  return h && h !== 'ai' ? h : null;
};

/**
 * "AI · no ghost": a rated queue for which the matchmaker found no ghost, so the server fields the
 * AI and the result carries no eloDelta (client 05a-jofdag21h.js). Nothing about it should be
 * learned (its board is not a ghost) and re-queueing at once mostly returns another one, because
 * the pool it drew from is still empty -- so consecutive AI matches back off before the next queue.
 */
const isAiMatch = (st) => String((st && st.opponentKind) || '').toLowerCase() === 'ai';
// Live 2026-09-19: AI streaks ran 10-74 matches (1.6-22 min) and ended on their own when a ghost
// appeared; each AI match costs ~9 s and no rating. A queue attempt is the only way to see whether
// a ghost is back, so the wait stays short (10 s, capped at 60 s) rather than climbing to minutes,
// and the streak cap is far above the longest seen.
const AI_BACKOFF_BASE_MS = 10000;
const AI_BACKOFF_MAX_MS = 60 * 1000;
const AI_MAX_STREAK = 300;

// What a signal handler needs in order to land the book and the telemetry before the process dies.
// Set while run() is in flight; read only by main()'s SIGINT/SIGTERM handler (review R2-09).
let inFlight = null;

/** The round-0 target needs the previous match's opponent, so it outlives the process. */
function readLastOpponent(file = LAST_OPPONENT) {
  try {
    return handleOf(JSON.parse(fs.readFileSync(file, 'utf8')).handle);
  } catch {
    return null;
  }
}

function writeLastOpponent(handle, file = LAST_OPPONENT) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ handle, ts: new Date().toISOString() }) + '\n');
    fs.renameSync(`${file}.tmp`, file);
  } catch {}
}

// ---------------------------------------------------------------- the loop

async function run(opts = {}) {
  // Observation time is injectable for chronological offline replay. Real action/search
  // deadlines still use the wall clock.
  const now = opts.now || Date.now;
  const arena = opts.arena || require('../lib/arena');
  const planner = opts.planner || require('../lib/planner');
  const book = opts.book || bookLib.open(opts.bookFile);
  const t = opts.telemetry || telemetryLib.open({ dir: opts.logDir, codeVersion: telemetryLib.codeVersion() });
  const rng = opts.rng || mulberry32(opts.seed == null ? Date.now() & 0x7fffffff : opts.seed);
  const dry = !!opts.dry;
  const games = opts.games == null ? (opts.once ? 1 : Infinity) : opts.games;
  // Anonymous practice is AI, so a separate total-match limit can stop its verification run.
  // It does not change rated game counts or allow AI boards into the opponent book.
  const stopAfterMatches = opts.stopAfterMatches == null ? Infinity : opts.stopAfterMatches;
  const timeBudgetMs = opts.timeBudgetMs == null ? 1500 : opts.timeBudgetMs;
  // Optional policy overrides are for paired offline evaluation. An ordinary live run gets the
  // defaults in target.build; keep this explicit so an eval can test a policy end to end.
  const targetOpts = opts.targetOpts || {};
  // A lifetime cap stopped healthy --games 0 sessions after about 584 matches.
  // Keep an explicit diagnostic cap and a separate cap that resets after each match.
  const maxSteps = opts.maxSteps ?? Infinity;
  const maxMatchSteps = opts.maxMatchSteps ?? MAX_MATCH_STEPS;
  for (const n of [maxSteps, maxMatchSteps]) {
    if (!(n === Infinity || (Number.isInteger(n) && n > 0))) throw new Error('step limits must be positive integers or Infinity');
  }
  const nap = opts.sleep || sleep;
  const aiBackoffBase = opts.aiBackoffMs == null ? AI_BACKOFF_BASE_MS : opts.aiBackoffMs;
  if (arena.setDryRun) arena.setDryRun(dry);

  // `games` counts rated ghost matches only; AI matches are tallied apart and never count.
  const summary = {
    games: 0, wins: 0, losses: 0, draws: 0, elo: 0, actions: 0, rounds: 0, dropped: 0, aiMatches: 0,
  };
  let aiStreak = 0;
  let prevHandle =
    opts.prevHandle === undefined ? readLastOpponent(opts.lastOpponentFile) : opts.prevHandle;
  let ctx = null;
  let matchSeq = 0;

  // A stable key joins a match's shops, actions, battles and result even when the server supplies
  // its match ID only after the last battle. The server ID remains in each event when known.
  const event = (type, payload) => t.event(type, ctx
    ? { matchKey: ctx.matchKey, matchId: ctx.matchId, ...(payload || {}) }
    : payload);

  inFlight = { book, telemetry: t, summary, flush: flushUnfinished };

  event('session_start', {
    dry, start: !!opts.start, prevHandle, book: book.file,
    games: games === Infinity ? null : games,
  });

  /**
   * The stored catalog is the only thing that tells the sim what a bot's kit is, and a bot it does
   * not know is fought as a vanilla statline: with a one-season-stale catalog the winner accuracy on
   * the S2 corpus falls from 451/451 to 432/451 (review R1-02, docs/ENGINE_SHOP.md ENGS-01).
   * Refresh once at start-up, and again whenever lib/catalog.js has met a bot it cannot resolve.
   */
  let knownUnknowns = catalog.unknownCount();
  async function refreshCatalog(why) {
    if (!arena.getCatalog) return;
    try {
      const bots = await arena.getCatalog({ refresh: true });
      knownUnknowns = catalog.unknownCount();
      event('act', { catalogRefresh: why, bots: (bots && bots.length) || 0 });
    } catch (e) {
      // a stale catalog still plays; a dead run does not
      event('error', { where: 'getCatalog', message: e.message });
    }
  }
  await refreshCatalog('session_start');

  let history = opts.history || null;
  let historyRetryAt = 0;
  async function syncHistory(st) {
    if (opts.history === false || arena.practice || shopModel.seasonOf(st) < 3 ||
        !arena.playerMatches || !arena.getPublicMatchDetail) return;
    if (!opts.history && history && history.data().season !== shopModel.seasonOf(st)) {
      // Reopen through the same validated migration as a newly started process.
      // The old season's complete ledger remains in previousSeasons on disk.
      history = null;
      historyRetryAt = 0;
    }
    if (!history && Date.now() >= historyRetryAt) {
      historyRetryAt = Date.now() + 60000;
      try {
        const me = await arena.getMe();
        history = historyLib.open({ handle: me?.xHandle, season: shopModel.seasonOf(st),
          file: opts.historyFile || path.join(path.dirname(book.file), 'public_history.json') });
      } catch (e) { event('error', { where: 'public_history_init', message: e.message }); }
    }
    if (history) await history.poll({ arena, book, event: (type, payload) => t.event(type, payload) });
  }

  function syncCtx(st) {
    const phase = st.phase || {};
    // A fresh R0 shop after an R0 battle is a different match even if the previous result was
    // skipped externally. Merely revealing an ID during the current R0 shop is not a new match.
    const freshR0 = ctx && phase.kind === 'shop' && phase.round === 0 && ctx.recorded.has(0);
    if (!ctx || freshR0 || (st.matchId && !ctx.matchId.startsWith('local_') && ctx.matchId !== st.matchId)) {
      flushUnfinished();
      ctx = {
        matchId: st.matchId || `local_${Date.now()}`,
        matchKey: `${t.session || 'session'}:${++matchSeq}`,
        season: shopModel.seasonOf(st),
        handle: handleOf(st.opponentHandle),
        // R0 rerolls are capped at one, and shop_model.normalize cannot know the count (the server
        // does not report it), so it lives per (match, round) here -- as a playShop local it reset
        // on any re-entry into the same shop, e.g. after an endShop conflict (review R3-1).
        rerolls: new Map(),
        prevHandle, pending: [], s3Rows: [], recorded: new Set(), forecasts: new Map(), lastBoard: [], ai: isAiMatch(st),
        // A result screen is only OUR result if this process saw the match in shop/battle. Without
        // this, every batch after the first re-recorded the result the previous batch left on
        // screen: a phantom game, duplicate telemetry, and `--games N` playing N-1 (review 1).
        played: false,
      };
      event('match_start', { season: ctx.season, prevHandle, ai: ctx.ai });
    } else if (st.matchId && ctx.matchId !== st.matchId) {
      // Keep the whole in-flight context: resetting it lost the round dedupe set and our last
      // board, causing a second battle with us=[] and a second opponent-book observation.
      const oldMatchId = ctx.matchId;
      ctx.matchId = st.matchId;
      for (const row of ctx.pending) row.matchId = st.matchId;
      for (const row of ctx.s3Rows) row.matchId = st.matchId;
      event('match_identified', { oldMatchId, serverMatchId: st.matchId });
    }
    if (!ctx.ai && isAiMatch(st)) {
      ctx.ai = true;   // the kind can show up after the first observe
      ctx.pending = [];
      ctx.s3Rows = [];
      // Battle and result events carry ai=true; a second match_start would split this match.
    }
    const h = handleOf(st.opponentHandle);
    if (h && !ctx.handle) {
      ctx.handle = h;
      flushPending();
    }
    return ctx;
  }

  function flushPending() {
    if (!ctx || !ctx.handle || ctx.ai) return;
    for (const b of ctx.pending) book.record({ ...b, handle: ctx.handle });
    if (ctx.pending.length) ctx.pending = [];
  }

  function flushSeason3(detail = null) {
    if (!ctx || !ctx.handle || ctx.ai) return;
    const same = (a, b) => handleOf(a) === handleOf(b);
    const enemySide = detail && detail.id === ctx.matchId && Array.isArray(detail.rounds)
      ? same(detail.opponent && detail.opponent.x_handle, ctx.handle) ? 'them'
        : same(detail.player && detail.player.x_handle, ctx.handle) ? 'you' : null
      : null;
    while (ctx.s3Rows.length) {
      const row = ctx.s3Rows[0];
      const replayRound = enemySide && detail.rounds.find((r) => Number(r.round) === row.round);
      const exact = replayRound ? bookLib.publicReplayBoard(replayRound, enemySide) : [];
      const observation = { ...row, handle: ctx.handle, board: exact.length ? exact : row.board,
        observationId: `attack:${row.matchId}:${row.round}` };
      const recorded = book.record(observation);
      ctx.s3Rows.shift();
      event('book', { source: exact.length ? 'public_replay' : 'battle_frames', round: row.round,
        role: row.role, outcome: row.outcome, forecast: row.forecast,
        // Keep the exact learned inputs in exported logs, even after the book evicts
        // this board or the public replay becomes unavailable.
        season: row.season, handle: ctx.handle, matchId: row.matchId, board: observation.board,
        captain: row.captain || null, relics: row.relics || [], seats: row.seats,
        observedAt: row.ts, observationId: observation.observationId, recorded: !!recorded });
    }
  }

  function flushUnfinished() {
    flushPending();
    flushSeason3();
  }

  function recordBattle(st, ourUnits) {
    const ph = st.phase || {};
    const key = ph.round;
    if (ctx.recorded.has(key)) return;
    ctx.recorded.add(key);
    const seats = shopModel.seatsFrom(st);
    // A battle observed after another actor advanced the shop has no confirmed version of OUR
    // board. Frame 0 omits honey, so inferring or booking the enemy from a stale board is unsafe.
    const confirmed = Array.isArray(ourUnits) && ourUnits.length > 0;
    const them = confirmed
      ? bookLib.inferGhost({ frames: ph.frames || [], ourUnits, round: ph.round || 0, seats,
        season: ctx.season, ourCaptain: st.captain, theirCaptain: st.rivalCaptain, ourRelics: st.relics, theirRelics: st.rivalRelics }) : [];
    event('battle', {
      matchId: ctx.matchId, season: ctx.season, round: ph.round, seats, handle: ctx.handle, ai: ctx.ai,
      ...(ctx.season >= 3 ? { captain: st.captain || null, rivalCaptain: st.rivalCaptain || null } : {}),
      ...(ctx.season >= 4 ? {relics:st.relics || [],rivalRelics:st.rivalRelics || []} : {}),
      us: confirmed ? ourUnits : [], them, winner: ph.winner, frames: ph.frames || [],
      ...(confirmed ? {} : { inputMissing: 'confirmed_us_board' }),
    });
    summary.rounds += 1;
    if (!them.length || ctx.ai) return;   // the AI's board is not a ghost: never into the book
    const row = {
      season: ctx.season, round: ph.round || 0, board: them, seats,
      ts: new Date(now()).toISOString(), matchId: ctx.matchId,
      ...(ctx.season >= 3 ? { role: 'attack', outcome: ph.winner, forecast: ctx.forecasts.get(ph.round) || null } : {}),
      ...(ctx.season >= 4 ? { relics: st.rivalRelics || require('../lib/season4').combatMetadata(ph.frames, 'them').relics } : {}),
      ...(ctx.season >= 3 && st.rivalCaptain ? { captain: st.rivalCaptain } : {}),
    };
    if (ctx.season >= 3) {
      // Public completed replays retain equipment, which live battle frames omit. Defer one write
      // until the result so a match is not counted twice when the exact board becomes available.
      ctx.s3Rows.push(row);
    } else if (ctx.handle) book.record({ ...row, handle: ctx.handle });
    else ctx.pending.push(row);   // R0: the opponent is hidden; record once the handle appears
  }

  async function recordResult(st) {
    const w = st.wins || { you: 0, them: 0 };
    const result = w.you > w.them ? 'win' : w.them > w.you ? 'loss' : 'draw';
    const ai = ctx.ai || isAiMatch(st);
    flushPending();
    if (!ai && ctx.s3Rows.length && ctx.handle) {
      let detail = null;
      if (arena.getPublicMatchDetail && !ctx.matchId.startsWith('local_')) {
        // Publication can lag the result. Retry once, then keep the observed frame evidence.
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt) await nap(500);
          try { detail = await arena.getPublicMatchDetail(ctx.matchId); }
          catch (e) { event('error', { where: 'getPublicMatchDetail', message: e.message }); }
          if (detail && detail.id === ctx.matchId && Array.isArray(detail.rounds) && detail.rounds.length) break;
          detail = null;
        }
      }
      flushSeason3(detail);
    }
    event('result', {
      matchId: ctx.matchId, result, wins: w, opponent: ctx.handle, ai,
      opponentKind: st.opponentKind || null, rated: st.rated == null ? null : st.rated,
      eloDelta: st.eloDelta == null ? null : st.eloDelta, rounds: `${w.you}-${w.them}`,
    });
    if (ai) {
      summary.aiMatches += 1;
      aiStreak += 1;
    } else {
      aiStreak = 0;
      summary.games += 1;
      summary[result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws'] += 1;
      summary.elo += st.eloDelta || 0;
      if (ctx.handle) {
        prevHandle = ctx.handle;
        writeLastOpponent(ctx.handle, opts.lastOpponentFile);
      }
    }
    book.save();
    ctx = null;
    return { result, ai };
  }

  /**
   * Leave a result screen for the next rated match.  After a ghost match `restart` is the client's
   * own "Play again" and has queued 3,991 recorded matches.  After an AI match the pool was empty a
   * moment ago, so first wait (10 s, doubling to a 60 s cap over consecutive AI matches), then try
   * `start` -- the action the client posts on every page load -- and fall back to `restart` if the
   * screen did not move.  Both are allowed from `result`, so nothing here can forfeit anything.
   */
  async function requeue(st, afterAi) {
    if (!afterAi || arena.practice) return lifecycleAct('restart', st);
    const wait = Math.min(AI_BACKOFF_MAX_MS, aiBackoffBase * 2 ** (aiStreak - 1));
    event('act', { aiBackoffMs: wait, aiStreak });
    await nap(wait);
    // The screen may have moved during the nap (a human on the same account, the server): the
    // allowlist must judge the phase as it is NOW, not as it was minutes ago (review 4).
    const fresh = await arena.observe();
    const now = fresh && fresh.state ? fresh.state : {};
    const k0 = now.phase && now.phase.kind;
    if (k0 !== 'result' && k0 !== 'idle') {
      event('act', { requeueAfterAi: 'skipped', phase: now.phase });
      return fresh;
    }
    let env = await lifecycleAct('start', now);
    const kind = env && env.state && env.state.phase && env.state.phase.kind;
    if (kind === 'result') env = await lifecycleAct('restart', env.state);
    event('act', { requeueAfterAi: kind === 'result' ? 'restart' : 'start', phase: env && env.state && env.state.phase });
    return env;
  }

  /**
   * start/restart may only ever leave a result/idle screen -- an ALLOWLIST, as the contract states.
   * As a shop/battle denylist, any phase the server adds (and any phase we failed to read) was a
   * green light to abandon the match (review R2-01).
   */
  async function lifecycleAct(type, st) {
    const kind = st.phase && st.phase.kind;
    if (kind !== 'result' && kind !== 'idle') throw new Error(`refusing ${type} while phase=${kind}`);
    summary.actions += 1;
    const env = await arena.act({ type });
    event('act', { action: { type }, phase: kind });
    return env;
  }

  async function playShop(env0) {
    let env = env0;
    syncCtx(env.state);
    // The previous round's board cannot serve as input if another actor ends this shop first.
    ctx.lastBoard = [];
    const round = (env.state.phase && env.state.phase.round) || 0;
    // per (match, round), so re-entering the same shop does not hand the planner a fresh budget
    const bumpRerolls = () => ctx.rerolls.set(round, (ctx.rerolls.get(round) || 0) + 1);
    const reS = (e) => ({
      ...shopModel.normalize(e.state, { season: ctx.season }),
      rerolls: ctx.rerolls.get(round) || 0,
    });
    let S = reS(env);
    if (S.season >= 3 && !S.captain && Array.isArray(S.captainOffer) && S.captainOffer.length) {
      const captain = planner.chooseCaptain
        ? planner.chooseCaptain(S, { book, handle: ctx.handle, prevHandle: ctx.prevHandle, timeBudgetMs, targetOpts, beforeTs: now(),
          captainSamples: opts.plannerOpts?.captainSamples, captainShopSteps: opts.plannerOpts?.captainShopSteps,
          pairedRerolls: opts.plannerOpts?.pairedRerolls })
        : S.captainOffer[0];
      const action = { type: 'pickCaptain', captain };
      if (shopModel.legal(S, action) !== true) {
        throw new Error(`planner chose unavailable captain ${JSON.stringify(captain)}`);
      }
      if (dry) {
        S = shopModel.apply(S, action);
        event('act', { action, dry: true, accepted: false, after: S });
      } else {
        summary.actions += 1;
        const picked = await arena.act(action);
        event('act', { action, accepted: !picked.conflict,
          afterPhase: picked.state && picked.state.phase && picked.state.phase.kind });
        if (!picked.conflict) ctx.played = true;
        return { env: picked, S, stopped: false, ended: false };
      }
    }
    if (S.season >= 4 && S.relicOffer?.length) {
      const relic = planner.chooseRelic(S, {book,handle:ctx.handle,prevHandle:ctx.prevHandle,targetOpts,beforeTs:now()});
      const action = {type:'pickRelic',relic};
      if (shopModel.legal(S, action) !== true) throw new Error('Planner chose an unavailable relic');
      if (dry) { S = shopModel.apply(S,action); event('act',{action,dry:true,accepted:false,after:S}); }
      else {
        summary.actions++;
        const picked = await arena.act(action);
        event('act',{action,accepted:!picked.conflict,afterPhase:picked.state?.phase?.kind});
        if (!picked.conflict) ctx.played = true;
        return {env:picked,S,stopped:false,ended:false};
      }
    }
    // Once per shop, not once per action.
    const built = targetLib.build({
      ...targetOpts, beforeTs: now(), book, season: ctx.season, round: S.round,
      handle: ctx.handle, prevHandle: ctx.prevHandle, seats: S.seats,
      bookWeight: S.round === 0 ? targetOpts.bookWeight0 : targetOpts.bookWeight12,
      recencyHalfLifeMs: targetOpts.recencyHalfLifeMs,
      bookPolicy: targetOpts.bookPolicy,
    });
    // The rounds still to come, for match-level valuation: at R0 the handle is hidden, so the
    // previous opponent stands in at R0 confidence; from R1 the handle is known and its book
    // boards for the later round are used at full confidence.
    const futureTargets = {};
    for (let r = S.round + 1; r <= 2; r++) {
      futureTargets[r] = targetLib.build({
        ...targetOpts, beforeTs: now(), book, season: ctx.season, round: r, seats: S.seats, proxy: !ctx.handle,
        handle: ctx.handle || ctx.prevHandle, prevHandle: ctx.prevHandle,
        bookWeight: ctx.handle ? targetOpts.bookWeight12 : targetOpts.bookWeight0,
        recencyHalfLifeMs: targetOpts.recencyHalfLifeMs,
        bookPolicy: targetOpts.bookPolicy,
      });
    }
    event('shop', {
      matchId: ctx.matchId, season: ctx.season, round: S.round, gold: S.gold, food: S.food, offers: S.offers,
      board: S.board, seats: S.seats, series: S.series, handle: ctx.handle,
      ...(ctx.season >= 3 ? { captain: S.captain, rivalCaptain: S.rivalCaptain,
        itemOffer: S.itemOffer, freeRerolls: S.freeRerolls, shopCosts: S.shopCosts,
        carry: S.carry, rerolls: S.rerolls } : {}),
      ...(ctx.season >= 4 ? { relics: S.relics, rivalRelics: S.rivalRelics, rivalRelicsRound: S.rivalRelicsRound } : {}),
      target: { ...built.sources, ...built.model, note: built.note, entries: built.entries.length },
      future: Object.fromEntries(Object.entries(futureTargets).map(([r, f]) => [r, f.note])),
    });

    // One action at a time: the envelope act() returns IS the new state.
    async function applyAction(a, plan) {
      const actionLog = {
        action: a, round: S.round, gold: S.gold,
        value: plan && plan.value != null ? plan.value : null,
        reason: (plan && plan.reason) || null,
      };
      if (dry) {
        // A true dry run sends nothing at all; it advances the local model instead, and stops as
        // soon as it needs information only the server has (a reroll's new offers).
        const next = shopModel.apply(S, a);
        if (a.type === 'reroll') bumpRerolls();
        const modeled = { ...next, rerolls: ctx.rerolls.get(round) || 0 };
        event('act', { ...actionLog, dry: true, accepted: false, after: modeled });
        return {
          S: modeled,
          conflict: false,
          stop: a.type === 'reroll',
        };
      }
      summary.actions += 1;
      const res = await arena.act(a);
      const phase = res && res.state && res.state.phase && res.state.phase.kind;
      const inShop = phase === 'shop';
      if (res && res.conflict) {
        const next = inShop ? reS(res) : S;
        event('act', { ...actionLog, accepted: false, conflict: true,
          after: inShop ? next : null, afterPhase: phase });
        event('error', { where: 'act', message: 'version conflict, replanning', action: a });
        return { env: res, S: next, conflict: true, leftShop: !inShop };
      }
      if (a.type === 'reroll') bumpRerolls();
      ctx.played = true;
      const next = inShop ? reS(res) : S;
      event('act', { ...actionLog, accepted: true,
        after: inShop ? next : null, afterPhase: phase });
      return { env: res, S: next, conflict: false, leftShop: !inShop };
    }

    // One board valuation cache per shop: every action re-scored boards the previous action had
    // already scored, which cost ~26% of the loop's wall clock for identical results (review R3-5).
    // It dies with the shop; the key already carries round, seats, utility and target identity.
    const shopCache = new Map();
    const pctx = {
      target: built,
      futureTargets,
      defenseTarget: history?.defenseTarget(S.round),
      rng,
      timeBudgetMs,
      cache: shopCache,
      log: (m) => event('act', { plannerLog: m, round: S.round }),
      ...(opts.plannerOpts || {}),
    };
    let bailed = null;
    for (let step = 0; step < MAX_SHOP_STEPS; step++) {
      let plan;
      try {
        plan = planner.planStep(S, pctx);
      } catch (e) {
        event('error', { where: 'planStep', round: S.round, message: e.message });
        bailed = `planStep: ${e.message}`;
        break;
      }
      if (!plan || plan.done || !Array.isArray(plan.actions) || !plan.actions.length) break;
      let replan = false;
      for (const a of plan.actions) {
        const why = shopModel.legal(S, a);
        if (why !== true) {
          // The planner is contracted never to do this; fight with what we have rather than
          // let the server hand us a 400.
          event('error', { where: 'planStep', message: `illegal ${a.type}: ${why}`, action: a });
          replan = true;
          plan.actions = [];
          bailed = `illegal ${a.type}: ${why}`;
          break;
        }
        const r = await applyAction(a, plan);
        if (r.env) env = r.env;
        S = r.S;
        // Re-observe after any conflict. The refreshed state may be a new round or already in
        // battle; keeping the old target and continuing to seating can send `move` in battle.
        if (r.conflict || r.leftShop) return { env, S, stopped: false, ended: false };
        if (dry && r.stop) return { env, S, stopped: true };
      }
      if (replan && !plan.actions.length) break;
    }

    // Seating is free, so it is always worth doing last, on the final board.
    let moves = [];
    try {
      moves = planner.seatingActions(S, built, {
        round: S.round,
        seats: S.seats,
        utility: planner.utility(S.round, S.series),
        defenseTarget: pctx.defenseTarget,
        defenseWeight: pctx.defenseWeight,
        defenseObjective: pctx.defenseObjective,
        finishTies: pctx.finishTies,
        cache: shopCache,
      }) || [];
    } catch (e) {
      event('error', { where: 'seatingActions', message: e.message });
    }
    for (const m of moves) {
      if (shopModel.legal(S, m) !== true) break;
      const r = await applyAction(m, { reason: 'seating' });
      if (r.env) env = r.env;
      S = r.S;
      if (r.conflict || r.leftShop) return { env, S, stopped: false, ended: false };
    }

    const ourUnits = shopModel.simUnits(S);
    const endLog = {
      action: { type: 'endShop' }, round: S.round, goldLeft: S.gold,
      board: ourUnits.map((u) => `${u.name} ${u.atk}/${u.hp}${u.honey ? '+honey' : ''}`),
    };
    if (dry) {
      event('act', { ...endLog, dry: true, accepted: false });
      return { env, S, stopped: true };
    }

    // endShop used to go out on EVERY path out of the loop above, including a planner throw with an
    // empty board (a 400 that kills the batch) and a conflict that had already moved the phase on
    // (docs/ENGINE_SHOP.md §1: with 0 bots and nothing affordable, Fight FORFEITS the round).
    // So: only end a shop that is still a shop, and never end one we bailed out of short (review R2-03).
    const kind = env.state && env.state.phase && env.state.phase.kind;
    if (kind !== 'shop') {
      event('error', { where: 'endShop', message: `phase is ${kind}, not shop; re-observing` });
      return { env, S, stopped: false, ended: false };
    }
    const affordable = S.offers.some((o) => o && o.cost <= S.gold);
    if (bailed && S.board.length < shopModel.BOARD_MAX && affordable) {
      event('error', { where: 'endShop', message: `not ending a short shop after ${bailed}`, units: S.board.length });
      return { env, S, stopped: false, ended: false };
    }
    summary.actions += 1;
    const forecast = S.season >= 3 ? targetLib.forecast(ourUnits, built, {
      season: S.season, round: S.round, seats: S.seats,
      ourCaptain: S.captain, theirCaptain: S.rivalCaptain, ourRelics: S.relics, theirRelics: shopModel.planningRivalRelics(S),
    }) : null;
    env = await arena.act({ type: 'endShop' });
    if (!env.conflict) { ctx.played = true; ctx.forecasts.set(S.round, forecast); }
    event('act', {
      ...endLog, accepted: !env.conflict, ...(forecast ? { forecast } : {}),
      afterPhase: env.state && env.state.phase ? env.state.phase.kind : null,
    });
    if (!env.conflict) ctx.lastBoard = ourUnits;
    if (!env.conflict && env.state && env.state.phase && env.state.phase.kind === 'battle') {
      recordBattle(env.state, ourUnits);
    }
    return { env, S, stopped: false, ended: !env.conflict };
  }

  let exitReason = 'max_steps';
  const stop = (why) => { exitReason = why; return true; };
  // A server that stops advancing the phase used to produce 8,000 requests as fast as the transport
  // allowed and then exit 0 with games=0 (review R2-05).  Progress is (phase, round, version).
  let lastMark = null;
  let idleTurns = 0;
  let completedMatches = 0;
  let matchSteps = 0;
  const napBase = opts.noProgressMs == null ? NO_PROGRESS_BASE_MS : opts.noProgressMs;
  const napMs = (n) => Math.min(NO_PROGRESS_MAX_MS, napBase * 2 ** (n - 1));
  try {
    // Refuse future unsupported seasons before starting, including from a stale result.
    const assertSupported = season => {
      if (season > 4) throw new Error(`Season ${season} is not supported by this S1–S4 build; no further game actions sent`);
    };
    if (arena.getSeason) assertSupported(await arena.getSeason());
    for (let step = 0; step < maxSteps; step++) {
      if (summary.games >= games) { stop('games_done'); break; }
      if (summary.games + summary.aiMatches >= stopAfterMatches) { stop('matches_done'); break; }
      const completed = summary.games + summary.aiMatches;
      if (completed !== completedMatches) { completedMatches = completed; matchSteps = 0; }
      if (matchSteps++ >= maxMatchSteps) { stop('max_steps'); break; }
      if (opts.touch) opts.touch();                       // the lock's heartbeat (review R2-02)
      if (catalog.unknownCount() > knownUnknowns) await refreshCatalog('unknown_bot');

      const env = await arena.observe();
      const st = (env && env.state) || {};
      assertSupported(shopModel.seasonOf(st));
      const kind = st.phase && st.phase.kind;              // NO `|| 'idle'`: see review R2-01

      const known = PHASES.has(kind);
      const mark = `${kind}|${st.phase && st.phase.round}|${env && env.version}`;
      // an unrecognised phase is never progress, however the version moves: there is nothing we can
      // legitimately do with it
      if (!known || mark === lastMark) idleTurns += 1; else { idleTurns = 0; lastMark = mark; }
      if (idleTurns >= MAX_NO_PROGRESS) { stop(known ? 'no_progress' : 'unknown_phase'); break; }
      if (idleTurns) await nap(napMs(idleTurns));

      if (!known) {
        // A phase the server added, or one we could not read.  Re-observe; never fall through to
        // the idle branch, which answers with `start` and abandons the match.
        event('error', { where: 'observe', message: `unknown phase ${JSON.stringify(kind)}` });
        continue;
      }
      if (!history || kind === 'result' || kind === 'idle' ||
          (kind === 'shop' && st.phase.round === 0 && !ctx?.played)) await syncHistory(st);
      if (kind !== 'idle') syncCtx(st);

      if (kind === 'shop') {
        if ((await playShop(env)).stopped && stop('dry')) break;
      } else if (kind === 'battle') {
        // Merely observing a battle does not make this process its player. An attached process
        // may be seeing another process's fight, with no confirmed shop board to learn from.
        recordBattle(st, ctx.lastBoard);
        if (dry && stop('dry')) break;
        summary.actions += 1;
        await arena.act({ type: 'battleDone' });
      } else if (kind === 'result') {
        let ai = isAiMatch(st);
        if (ctx.played) {
          ai = (await recordResult(st)).ai;
        } else {
          // Someone else's result (the previous batch's, typically): not ours to count or learn from.
          event('act', { staleResult: true, matchId: ctx.matchId, ai });
          ctx = null;
        }
        if (summary.games >= games && stop('games_done')) break;
        if (summary.games + summary.aiMatches >= stopAfterMatches && stop('matches_done')) break;
        if (dry && stop('dry')) break;
        if (aiStreak >= AI_MAX_STREAK && stop('ai_only')) break;   // let climb_loop back off
        await requeue(st, ai);
      } else {
        if (!opts.start && stop('idle')) break;
        if (dry && stop('dry')) break;
        await lifecycleAct('start', st);
      }
    }
  } catch (e) {
    event('error', { where: 'run', message: e.message, stack: String(e.stack || '').split('\n').slice(0, 4) });
    // the in-flight match's battles are only in memory until this runs (review R2-09)
    try { flushUnfinished(); summary.dropped = t.dropped || 0; book.save(); } catch {}
    t.close({ ...summary, exitReason: 'error' });
    inFlight = null;
    throw e;
  }

  flushUnfinished();
  const saved = book.save();
  summary.dropped = t.dropped || 0;
  if (history) summary.publicHistory = history.report();
  t.close({ ...summary, exitReason, pruned: saved && saved.pruned });
  inFlight = null;
  return { ...summary, exitReason, prevHandle };
}

// ---------------------------------------------------------------- cli

function parseArgs(argv) {
  const o = { once: false, dry: false, start: false, games: null, seed: null };
  // `Number('fifteen')` is NaN, and `games >= NaN` is never true: an unbounded rated run (review 5).
  const int = (flag, v) => {
    const n = Number(v);
    if (v == null || !Number.isInteger(n) || n < 0) throw new Error(`${flag} needs a non-negative integer, got ${JSON.stringify(v)}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') o.once = true;
    else if (a === '--dry') o.dry = true;
    else if (a === '--start') o.start = true;
    else if (a === '--games') o.games = int(a, argv[++i]);
    else if (a === '--seed') o.seed = int(a, argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  if (o.once && o.games == null) o.games = 1;
  if (o.games === 0) o.games = Infinity;   // --games 0 = no limit
  return o;
}

/**
 * Ctrl-C / SIGTERM: land the book and the telemetry, release the lock, close the browser, then die
 * BY THE SIGNAL. Exiting with status 130 instead used to tell bash "the child handled it", so
 * climb_loop.sh kept launching rated batches after a Ctrl-C (review 2). Shared with play_session.
 */
function installSignalHandlers(release, who) {
  let signalled = null;
  const onSignal = async (sig) => {
    if (signalled) process.exit(130);      // a second signal means "now"
    signalled = sig;
    process.stderr.write(JSON.stringify({ event: `${who}_signal`, signal: sig }) + '\n');
    if (inFlight) {
      try { inFlight.flush(); inFlight.book.save(); } catch {}
      try { inFlight.telemetry.close({ ...inFlight.summary, exitReason: `signal_${sig}` }); } catch {}
    }
    try { release(); } catch {}
    try { await require('../lib/arena').disconnect(); } catch {}
    process.removeAllListeners(sig);
    process.kill(process.pid, sig);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
}

async function main() {
  let opts;
  let release;
  try {
    opts = parseArgs(process.argv.slice(2));
    release = acquireLock();
  } catch (e) {
    process.stderr.write(JSON.stringify({ event: 'play_loop_error', message: e.message }) + '\n');
    process.exitCode = 1;
    return;
  }
  installSignalHandlers(release, 'play_loop');

  let code = 0;
  try {
    const out = await run({ ...opts, touch: release.touch });
    process.stdout.write(JSON.stringify({ event: 'play_loop_done', ...out }) + '\n');
    if (['no_progress', 'unknown_phase', 'max_steps'].includes(out.exitReason)) code = 3;
  } catch (e) {
    process.stderr.write(JSON.stringify({ event: 'play_loop_error', message: e.message }) + '\n');
    code = 1;
  } finally {
    release();
    // The CDP websocket (or a browser we launched) keeps the event loop alive: a finished batch sat
    // there forever after play_loop_done, and climb_loop.sh never got to start the next one.
    try { await require('../lib/arena').disconnect(); } catch {}
  }
  process.exit(code);
}

module.exports = {
  run, parseArgs, acquireLock, installSignalHandlers, pidAlive, mulberry32,
  LOCK_FILE, LAST_OPPONENT, STALE_LOCK_MS,
};

if (require.main === module) main();
