'use strict';
/*
 * The planner.  One evaluator decides everything: replay the candidate board through lib/sim.js
 * against the weighted TARGET of enemy boards (lib/target.js) and keep the best seat order's score.
 * No archetypes, no name lists, no recipes, no threat formulas -- audit/strategy.md §0.9, §4.
 *
 * Shape of a shop, and why the two rounds are planned differently:
 *   R0  (10 gold, empty board, three commons, opponent hidden).  "Buy the three offered" scores 0.690
 *       against the R0 corpus; "keep k of the offers, reroll ONCE, complete the board" scores 0.876,
 *       and a second paid reroll in the old 10-gold economy left the board short (strategy.md §2.3,
 *       §0.2). Season 3 Scout and Recruiter can afford another roll. Buying the
 *       kept offers BEFORE the reroll dominates freezing them: the reducer nulls a bought slot and
 *       refreshes all three unfrozen slots, so a freeze only wastes a slot (docs/ENGINE_SHOP.md §1).
 *   R1/R2 (10 gold, the board carries over, the handle is known).  A greedy one-step search over
 *       feed / buy / sell-then-buy / reroll scores 0.976 against the boards actually faced, vs the
 *       0.758 the old bot got (strategy.md §3.1).  Most of that (+0.156) is just spending 10 gold
 *       under a correct evaluator; the opponent book adds the last +0.06.
 *
 * planStep returns actions to execute in order; the live loop re-observes after every act.
 * Optional combination search commits a sequence only for deterministic shop transitions.
 * The server remains authoritative on the resulting state (contract §driver/play_loop.js).
 */
const sim = require('./sim');
const shop = require('./shop_model');
const catalog = require('./catalog');
const targetLib = require('./target');
const shopSearch = require('./shop_search');

const DEFAULTS = {
  timeBudgetMs: 1500,
  epsilon: 0.01,    // margin a SAMPLED reroll estimate must clear; exact moves need only to improve
  r0Samples: 16,    // reroll draws for the R0 keep-k expectimax
  r12Samples: 6,    // the R1/R2 search in strategy.md §3.1 used 6-10
  minSamples: 2,
  minEntries: 6,
  twoStepWidth: 4,   // single moves that get a follow-up look at R1/R2
  matchRounds: [0],  // shop rounds valued at MATCH level (see makeStateValuer for the measurement)
  futureBlend: 0.5,  // trust in the carried-board estimate of a future round
  // measured ~7.2 us per sim.outcome x 6 seat orders, per target entry
  msPerEntry: 0.045,
};

// ------------------------------------------------------------------ board value against a target

const ukey = (u) => `${u.name}/${u.kitId}/${u.atk}/${u.hp}/${u.honey ? 1 : 0}`
  + (u.crew == null && u.item == null ? '' : `/${u.crew || ''}/${u.item || ''}`);
const boardKey = (units) => units.map(ukey).sort().join('|');

/**
 * Rolling cost of one board evaluation per target entry (ms), re-measured on every planStep that
 * evaluates.  It lives on the CALLER's ctx, not in module scope: as a module global it leaked
 * between shops, matches and tests, and the same seed produced actions=468 in one run and 483 in
 * the next (review R3-4).  A ctx reused across the steps of one shop keeps the calibration; a fresh
 * ctx starts from the measured constant.
 */
function calibOf(ctx) {
  if (!ctx.calib || typeof ctx.calib !== 'object') ctx.calib = { msPerEntry: DEFAULTS.msPerEntry };
  return ctx.calib;
}

const TARGET_IDS = new WeakMap();
let nextTargetId = 1;
function targetId(entries) {
  let id = TARGET_IDS.get(entries);
  if (!id) { id = nextTargetId++; TARGET_IDS.set(entries, id); }
  return id;
}

function entriesOf(target) {
  if (!target) return [];
  if (Array.isArray(target)) return target;
  return Array.isArray(target.entries) ? target.entries : [];
}

/**
 * Keep both parts of a target when the time budget forces a smaller battle sample. Target.build
 * orders the handle book before the population pool; taking an array prefix silently turns a
 * 50/50 or 75/25 mixture into almost all book. Choose the highest-weight entries from each part
 * and restore each part's original probability mass after the cut. Targets without source tags
 * (test and external callers) retain the old prefix behavior.
 */
function trimTarget(entries, limit) {
  const n = Math.max(0, Math.min(entries.length, Math.floor(limit)));
  if (n >= entries.length) return entries;
  if (!n) return [];
  const book = entries.filter((e) => e.source === 'book');
  const pool = entries.filter((e) => e.source === 'pool');
  if (!book.length || !pool.length || book.length + pool.length !== entries.length) return entries.slice(0, n);

  const mass = (rows) => rows.reduce((s, e) => s + (Number(e.weight) || 0), 0);
  const bookMass = mass(book);
  const poolMass = mass(pool);
  if (bookMass <= 0 || poolMass <= 0) return entries.slice(0, n);
  if (n === 1) {
    const best = entries.reduce((a, b) => b.weight > a.weight ? b : a);
    return [{ ...best, weight: 1 }];
  }
  const minEach = n >= 4 ? 2 : 1;
  let bookN = Math.round(n * bookMass / (bookMass + poolMass));
  bookN = Math.max(minEach, Math.min(n - minEach, bookN));
  bookN = Math.min(bookN, book.length);
  let poolN = Math.min(n - bookN, pool.length);
  bookN = Math.min(n - poolN, book.length);
  poolN = n - bookN;

  const byWeight = (a, b) => b.weight - a.weight;
  const selectedBook = book.slice().sort(byWeight).slice(0, bookN);
  const selectedPool = pool.slice().sort(byWeight).slice(0, poolN);
  const reweight = (rows, originalMass) => {
    const keptMass = mass(rows);
    return rows.map((e) => ({ ...e, weight: e.weight * originalMass / keptMass }));
  };
  return [...reweight(selectedBook, bookMass), ...reweight(selectedPool, poolMass)];
}

/** Put `units` into the order described by a cached list of unit keys (equal keys are interchangeable). */
function reorderTo(units, orderKeys) {
  const pool = units.slice();
  const out = [];
  for (const k of orderKeys) {
    const i = pool.findIndex((u) => ukey(u) === k);
    // orderKeys is a permutation of the multiset the cache entry was keyed on, so a miss is a bug in
    // the cache key, not a state to silently seat around (review R3-8).
    if (i < 0) throw new Error(`planner: cached seat order does not match the board (${k})`);
    out.push(pool.splice(i, 1)[0]);
  }
  return out.concat(pool);
}

/**
 * Memoised board valuer.  The key is the SORTED unit keys, because the value is the maximum over
 * seat orders -- the order we happen to hold them in does not matter.  The cache stores the winning
 * order as keys rather than as objects so a hit can be replayed onto a different unit array.
 */
function makeValue(entries, o) {
  const cache = o.cache instanceof Map ? o.cache : new Map();
  const seats = o.seats;
  const sig = `${targetId(entries)}|${entries.length}|${o.round}|`
    + `${o.utility.win},${o.utility.draw},${o.utility.loss}|`
    + (seats ? `${seats.front || ''},${seats.middle || ''},${seats.back || ''}` : '')
    + `|${o.season || 0}|${o.ourCaptain || ''}|${o.theirCaptain || ''}|${JSON.stringify(o.ourRelics)}|${JSON.stringify(o.theirRelics)}`
    + `|${o.defenseWeight || 0}|${o.defenseTarget ? targetId(entriesOf(o.defenseTarget)) : 0}`;
  const simOpts = { round: o.round, seats: seats || null, utility: o.utility,
    season: o.season, ourCaptain: o.ourCaptain, theirCaptain: o.theirCaptain, ourRelics: o.ourRelics, theirRelics: o.theirRelics };
  const f = (units) => {
    const k = `${sig}#${boardKey(units)}`;
    let hit = cache.get(k);
    if (!hit) {
      let rows = sim.bestSeating(units, entries, simOpts);
      if (o.defenseWeight > 0) rows = rows.map((r) => {
        const defense = defensiveValue(r.order, o.defenseTarget, o);
        return { ...r, defense, score: r.score + o.defenseWeight * defense };
      }).sort((a, b) => b.score - a.score);
      hit = rows.length
        ? { score: rows[0].score, orderKeys: rows[0].order.map(ukey), wdl: rows[0].wdl,
          defense: rows[0].defense || 0 }
        : { score: 0, orderKeys: [], wdl: { win: 0, draw: 0, loss: 1 } };
      cache.set(k, hit);
      f.evals++;
    }
    return hit;
  };
  f.evals = 0;
  f.entries = entries;
  return f;
}

/**
 * Match value by backward induction over the series.  probs[r] = {win, draw, loss} of round r.
 * A match ends at 2 round-wins or after round 2, a drawn round is consumed, and the result compares
 * wins (docs/ENGINE_SHOP.md §4.7): a 1-1 or 0-0 final is a DRAWN match, worth 0.5 -- exactly the
 * Elo value of a draw.  utility(round, series) is this function's final-round special case.
 */
function matchValue(round, series, probs) {
  const you = (series && series.you) | 0;
  const them = (series && series.them) | 0;
  if (you >= 2) return 1;
  if (them >= 2) return 0;
  if (round > 2) return you > them ? 1 : you < them ? 0 : 0.5;
  const p = probs[round];
  if (!p) return you > them ? 1 : you < them ? 0 : 0.5;   // no estimate: treat the rest as a coin flip
  return p.win * matchValue(round + 1, { you: you + 1, them }, probs)
    + p.draw * matchValue(round + 1, { you, them }, probs)
    + p.loss * matchValue(round + 1, { you, them: them + 1 }, probs);
}

/**
 * Candidate value uses current-round battles and, at R0, estimated later rounds. S3 samples
 * legal future shops and spends future income before simulating those rounds. S1/S2 (and the
 * explicit futureMode:'carry' control) retain the historical unchanged-board approximation.
 * Both remove temporary attack and consumed items. Future estimates remain damped because
 * offers, hidden seat rules and opponent updates are uncertain; this is a bounded rollout.
 */
function makeStateValuer(S, ctx, util, entries) {
  const cache = ctx.cache;
  const defenseWeight = defenseExposure(S, ctx);
  const now = makeValue(entries, { round: S.round, seats: S.seats,
    utility: defenseWeight ? matchUtility(S.round, S.series) : util, cache,
    season: S.season, ourCaptain: S.captain, theirCaptain: S.rivalCaptain, ourRelics: S.relics, theirRelics: S.rivalRelics,
    defenseTarget: ctx.defenseTarget, defenseWeight });
  // ctx.matchRounds: which shop rounds get the match-level objective.  ctx.futureBlend: how far the
  // future estimate is trusted, 0..1; the rest is a coin flip. Historically the carried board
  // omitted the next shop's gold and was pessimistic and noisy. Measured with tools/eval_matches.js
  // (identical seeds, 600-1000 matches
  // per season, 2026-09-19): full strength on R0+R1 gave back at R1 what it gained at R0 (S1 0.898 vs
  // 0.897 baseline); R0 only, with two-step, was the best of eight variants on both seasons
  // (S1 0.916, S2 0.897-0.907 vs 0.901 / 0.868-0.885 baseline).  Hence the defaults below.
  const rounds = Array.isArray(ctx.matchRounds) ? ctx.matchRounds : DEFAULTS.matchRounds;
  const matchLevel = ctx.matchLevel !== false && S.round < 2 && rounds.includes(S.round);
  const blend = ctx.futureBlend == null ? DEFAULTS.futureBlend : Math.max(0, Math.min(1, ctx.futureBlend));
  const damp = (p) => ({ win: blend * p.win + (1 - blend) * 0.5, draw: blend * p.draw, loss: blend * p.loss + (1 - blend) * 0.5 });
  const futures = [];
  const shopFutures = S.season >= 3 && ctx.futureMode !== 'carry';
  if (matchLevel) {
    for (let r = S.round + 1; r <= 2; r++) {
      const fe = entriesOf(ctx.futureTargets && ctx.futureTargets[r]);
      if (!fe.length) break;   // nothing known about that round: the recursion treats it as a coin flip
      futures.push({ round: r, V: makeValue(shopFutures ? trimTarget(fe, 4) : fe, { round: r, seats: S.seats,
        utility: { win: 1, draw: 0.5, loss: 0 }, cache,
        season: S.season, ourCaptain: S.captain, theirCaptain: S.rivalCaptain, ourRelics: S.relics, theirRelics: S.rivalRelics }) });
    }
  }
  const carriedUnits = (s) => shop.simUnits({ ...s, board: s.board.map((u) => ({
    ...u, tempAtk: 0, potato: false,
    item: u.item && catalog.itemById(u.item)?.oneUse ? null : u.item,
  })) });
  const continuationCache = new Map();
  const continuation = (initial) => {
    const key = JSON.stringify({ board: initial.board, gold: initial.captain === 'banker' ? initial.gold : 0,
      frozen: initial.frozen, offers: initial.offers.filter((_, i) => initial.frozen[i]), item: initial.itemOffer?.frozen ? initial.itemOffer : null });
    if (continuationCache.has(key)) return continuationCache.get(key);
    const probs = {};
    let state = initial;
    if (S.season >= 4) state = {...state,lastResult:sim.mulberry32(0x4c4f5353)() < now(shop.simUnits(state)).wdl.loss ? 'them' : 'you'};
    for (const f of futures) {
      state = shop.sampleNextShop(state, f.round, sim.mulberry32(0x6f726500 + f.round * 7919));
      // A bounded legal continuation through the sampled offers, with actual future income.
      // No recursive match valuation or reroll search. Reject unresolved random transitions
      // here rather than carry fractional expected stats into another simulated shop.
      for (let step = 0; step < 3; step++) {
        let best = f.V(shop.simUnits(state)).score, next = null;
        for (const m of singleMoves(state)) {
          const after = applyAll(state, m.actions);
          if (shop.simUnitsOutcomes(after).length !== 1) continue;
          const value = f.V(shop.simUnits(after)).score;
          if (value > best + 1e-9) { best = value; next = after; }
        }
        if (!next) break;
        state = next;
      }
      probs[f.round] = damp(f.V(shop.simUnits(state)).wdl);
      if (S.season >= 4) state.lastResult = sim.mulberry32(0x4c4f5353 + f.round)() < probs[f.round].loss ? 'them' : 'you';
    }
    continuationCache.set(key, probs);
    return probs;
  };
  const valueOf = (s) => {
    // a `bloom` bought onto a two-unit board leaves the +1/+1 unresolved: average the concrete worlds
    const worlds = shop.simUnitsOutcomes(s);
    let total = 0;
    for (const w of worlds) {
      const hit = now(w.units);
      let v = hit.score;
      if (futures.length) {
        const probs = { [S.round]: hit.wdl };
        // world units already fold tempAtk into atk; strip it by board index
        const carried = worlds.length === 1 ? carriedUnits(s) : w.units.map((u, i) => ({
          ...u, atk: u.atk - ((s.board[i] && s.board[i].tempAtk) || 0),
          item: u.item && catalog.itemById(u.item)?.oneUse ? null : u.item,
        }));
        if (shopFutures) {
          // Resolve a candidate's random purchase world before carrying it into future shops.
          const concrete = { ...s, pendingBuff: null, board: s.board.map((u, i) => ({ ...u,
            atk: w.units[i].atk - (u.tempAtk || 0), hp: w.units[i].hp })) };
          Object.assign(probs, continuation(concrete));
        } else for (const f of futures) probs[f.round] = damp(f.V(carried).wdl);
        v = matchValue(S.round, S.series, probs) + defenseWeight * hit.defense;
      }
      total += (w.p == null ? 1 : w.p) * v;
    }
    return total;
  };
  return { valueOf, now, matchLevel: futures.length > 0, futures, defenseWeight };
}

// Unscaled expected MATCH points are needed when combining attack and defense. The usual
// round utility is rescaled for search and would give a tied-series final round twice the
// importance of a final round where a draw already secures the match.
function matchUtility(round, series) {
  const out = {};
  for (const result of ['win', 'draw', 'loss']) {
    const p = {};
    for (let r = round; r <= 2; r++) p[r] = r === round
      ? { win: +(result === 'win'), draw: +(result === 'draw'), loss: +(result === 'loss') }
      : { win: .5, draw: 0, loss: .5 };
    out[result] = matchValue(round, series, p);
  }
  return out;
}
function defenseExposure(S, ctx) {
  if (S.season < 3 || ctx.defenseObjective === false || !entriesOf(ctx.defenseTarget).some(e => (e.weight ?? 1) > 0)) return 0;
  const value = ctx.defenseWeight ?? ctx.defenseTarget?.exposure ?? 0;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
function defensiveValue(units, target, opts) {
  let score = 0, mass = 0;
  for (const e of entriesOf(target)) {
    const weight = e.weight ?? 1;
    if (!(weight > 0)) continue;
    const winner = sim.outcome(e.board, units, { season: opts.season, round: opts.round,
      seats: e.seats, ourCaptain: e.theirCaptain, theirCaptain: opts.ourCaptain, ourRelics: e.theirRelics, theirRelics: opts.ourRelics });
    const u = matchUtility(opts.round, e.series);
    score += weight * u[winner === 'them' ? 'win' : winner === 'draw' ? 'draw' : 'loss'];
    mass += weight;
  }
  return mass ? score / mass : 0;
}

/**
 * utility(round, series) -> {win, draw, loss}: what a round result is worth as MATCH value.
 *
 * A match is at most 3 rounds, ends at 2 round-wins, a drawn round is consumed, and the result
 * compares wins -- so 1-1 and 0-0 are drawn MATCHES (docs/ENGINE_SHOP.md §4.7, ENGS-11).
 * Round 2 is therefore always final and its values follow directly:
 *   1-0: win 2-0, draw 1-0 (both match wins), loss 1-1 (a drawn match)  -> rescaled {1, 1, 0}
 *   0-1: win 1-1 (a drawn match), draw 0-1, loss 0-2 (both losses)      -> rescaled {1, 0, 0}
 *   0-0 / 1-1: win, draw, loss map straight onto win/draw/loss          -> {1, 0.5, 0}
 * Before the final round the backward induction with a symmetric future round (we are as likely to
 * win the next round as to lose it) collapses to {1, 0.5, 0} at every score, so there is nothing to
 * switch on: only the final round gets a special objective.
 */
function utility(round, series) {
  const you = (series && series.you) | 0;
  const them = (series && series.them) | 0;
  if (Number(round) !== 2) return { win: 1, draw: 0.5, loss: 0 };
  if (you === 1 && them === 0) return { win: 1, draw: 1, loss: 0 };
  if (you === 0 && them === 1) return { win: 1, draw: 0, loss: 0 };
  return { win: 1, draw: 0.5, loss: 0 };
}

/** evaluate(units, target, opts) -> {score, order}: the best seat order and what it is worth. */
function evaluate(units, target, opts = {}) {
  const entries = entriesOf(target);
  const util = opts.utility || { win: 1, draw: 0.5, loss: 0 };
  const V = makeValue(entries, {
    round: opts.round == null ? 0 : opts.round,
    seats: opts.seats || null,
    utility: util,
    cache: opts.cache,
    season: opts.season,
    ourCaptain: opts.ourCaptain,
    theirCaptain: opts.theirCaptain, ourRelics: opts.ourRelics, theirRelics: opts.theirRelics,
  });
  const hit = V(units);
  return { score: hit.score, order: reorderTo(units, hit.orderKeys) };
}

// ------------------------------------------------------------------ shop look-ahead primitives

/** Every affordable set of buys that fills up to the empty seats, including buying nothing. */
function completions(S) {
  const need = shop.BOARD_MAX - S.board.length;
  const out = [{ plan: [], cost: 0 }];
  if (need <= 0) return out;
  const slots = [0, 1, 2].filter((i) => S.offers[i]);
  const rec = (start, chosen, cost) => {
    if (chosen.length >= need) return;
    for (let i = start; i < slots.length; i++) {
      const o = S.offers[slots[i]];
      if (cost + o.cost > S.gold) continue;
      if (o.rarity === 'mythic' && (S.board.some((u) => u.rarity === 'mythic') ||
        chosen.some((j) => S.offers[j].rarity === 'mythic'))) continue;
      chosen.push(slots[i]);
      out.push({ plan: chosen.slice(), cost: cost + o.cost });
      rec(i + 1, chosen, cost + o.cost);
      chosen.pop();
    }
  };
  rec(0, [], 0);
  return out;
}

const buyAll = (S, plan) => plan.reduce((s, i) => shop.apply(s, { type: 'buy', shopIndex: i }), S);

/**
 * What a shop state's board is worth.  Normally one call, but a `bloom` bought onto a two-unit board
 * leaves the +1/+1 unresolved, and averaging the STATS there gives a board with half-HP units the
 * engine has no equivalent of -- it changed the answer for 31.6% of those boards (review R1-03).
 * shop_model.simUnitsOutcomes hands back the concrete worlds; the value is the mean over them.
 */
function stateValue(S, VM) {
  if (typeof VM === 'function') {
    // a plain units -> {score} valuer (tests, callers without a series): one-round value
    let s = 0;
    for (const o of shop.simUnitsOutcomes(S)) s += o.p * VM(o.units).score;
    return s;
  }
  return VM.valueOf(S);
}

/** Can the board still be filled to three from the offers on the table? */
function canFill(S) {
  const need = shop.BOARD_MAX - S.board.length;
  return need <= 0 || completions(S).some((c) => c.plan.length === need);
}

/**
 * The value of a state once its empty seats are filled as well as the current offers allow.
 * Every candidate is scored this way, so a short board is never compared against a full one; and
 * when a FULL board is reachable only full boards are considered.  Fighting short is the single
 * worst thing this bot used to do: a short R0 board won 18.5% of its matches against 64.1% for a
 * full one (strategy.md §7 STR-02), and -0.456 per fight (BRD-01) dwarfs any unit's own value.
 */
function completedValue(S, V) {
  const need = shop.BOARD_MAX - S.board.length;
  const all = completions(S);
  const full = all.filter((c) => c.plan.length === need);
  let best = null;
  for (const c of (full.length ? full : all)) {
    const after = c.plan.length ? buyAll(S, c.plan) : S;
    const score = stateValue(after, V);
    if (!best || score > best.score) best = { score, plan: c.plan, state: after };
  }
  return best;
}

/**
 * Single actions available from S: feeds, buys into an empty seat, and sell-then-buy pairs.
 * An action that spends gold the board still needs to reach three units is dropped: 3 gold is the
 * common price and every R0/R1 offer pool is priced from there (docs/ENGINE_SHOP.md §1).
 */
function singleMoves(S) {
  const out = [];
  if (S.season >= 4) for (let i = 0; i < S.board.length; i++) for (let j = 0; j < S.board.length; j++) {
    const a = {type:'fuse',boardIndex:i,withIndex:j};
    if (shop.legal(S, a) === true) out.push({actions:[a],kind:`fuse${i}+${j}`});
  }
  const mustKeepFill = canFill(S);
  const ok = (after) => !mustKeepFill || canFill(after);
  for (let i = 0; i < S.board.length; i++) {
    const a = { type: 'feed', boardIndex: i };
    if (shop.legal(S, a) === true && ok(shop.apply(S, a))) {
      out.push({ actions: [a], kind: `feed@${i}` });
    }
  }
  if (S.itemOffer) for (let i = 0; i < S.board.length; i++) {
    const a = { type: 'equip', boardIndex: i };
    if (shop.legal(S, a) === true && ok(shop.apply(S, a))) {
      out.push({ actions: [a], kind: `equip@${i}` });
    }
  }
  for (let j = 0; j < S.offers.length; j++) {
    const buy = { type: 'buy', shopIndex: j };
    // The same guard as the feed and sell+buy branches: it used to be missing here, so a 1-unit
    // board with 7 gold could buy a 6-gold rare and fight two-handed (review R1-04).
    if (shop.legal(S, buy) === true && ok(shop.apply(S, buy))) {
      out.push({ actions: [buy], kind: `buy#${j}` });
    }
  }
  // A sell is only ever emitted together with its buy (contract §lib/planner.js): a bare sell both
  // loses a unit and cannot be undone, and the search never wants one on its own.
  for (let i = 0; i < S.board.length; i++) {
    const sold = shop.apply(S, { type: 'sell', boardIndex: i });
    for (let j = 0; j < sold.offers.length; j++) {
      const buy = { type: 'buy', shopIndex: j };
      if (shop.legal(sold, buy) !== true || !ok(shop.apply(sold, buy))) continue;
      out.push({ actions: [{ type: 'sell', boardIndex: i }, buy], kind: `sell${i}+buy#${j}` });
    }
  }
  return out;
}

const applyAll = (S, actions) => actions.reduce((s, a) => shop.apply(s, a), S);

/**
 * Hard budget invariant before any reroll: a reroll must still leave 3 gold per empty seat, or the
 * board goes into the fight short.  A short R0 board won 18.5% of its matches against 64.1% for a
 * full one (strategy.md §7 STR-02).
 */
function rerollAllowed(S) {
  if (shop.legal(S, { type: 'reroll' }) !== true) return false;
  const empty = shop.BOARD_MAX - S.board.length;
  return S.gold - shop.rerollCost(S) >= (shop.hasRelic(S, 'bulkOrder') ? 2 : 3) * empty;
}

/** Mean best follow-up value over `n` sampled rerolls. `deep` decides how deep the follow-up looks. */
function rerollEV(S, V, rng, n, deadline, deep) {
  const drawRng = rng.fork ? rng.fork() : rng;
  let total = 0;
  let used = 0;
  for (let k = 0; k < n; k++) {
    if (used && Date.now() > deadline) break;
    const R = shop.sampleReroll(S, drawRng);
    let best = completedValue(R, V).score;
    if (deep) {
      for (const m of singleMoves(R)) {
        const v = completedValue(applyAll(R, m.actions), V).score;
        if (v > best) best = v;
      }
    }
    total += best;
    used++;
  }
  return { ev: used ? total / used : 0, samples: used };
}

// ------------------------------------------------------------------ planStep

function fmt(x) { return Number(x).toFixed(3); }

function planStep(S, ctx = {}) {
  const budgetMs = ctx.timeBudgetMs == null ? DEFAULTS.timeBudgetMs : ctx.timeBudgetMs;
  const deadline = Date.now() + budgetMs;
  const eps = ctx.epsilon == null ? DEFAULTS.epsilon : ctx.epsilon;
  let rng = typeof ctx.rng === 'function' ? ctx.rng : null;
  // Common random numbers compare alternative purchases using a shared stream of hypothetical
  // draws. Frozen slots can change consumption, so pairing can be partial. Each decision gets
  // a new seed; forks never change the live arena's draws.
  if (rng && S.season >= 3 && ctx.pairedRerolls === true) {
    const seed = Math.floor(rng() * 4294967296);
    rng = Object.assign(sim.mulberry32(seed), { fork: () => sim.mulberry32(seed) });
  }
  const util = ctx.utility || utility(S.round, S.series);
  const opening = S.round === 0 && (S.rerolls || 0) === 0 && S.board.length < shop.BOARD_MAX;

  const all = entriesOf(ctx.target);
  let entries = all;
  let samples = ctx.rerollSamples == null
    ? (opening ? DEFAULTS.r0Samples : DEFAULTS.r12Samples)
    : ctx.rerollSamples;
  const cuts = [];

  // The budget is spent against a measurement, not a hardcoded constant: the first evaluations of
  // this step time themselves and update the calibration.  Degrade by cutting the reroll sample
  // first and the target second (contract §lib/planner.js).
  const calib = calibOf(ctx);
  let VM = makeStateValuer(S, ctx, util, entries);
  const evalsOf = (vm) => vm.now.evals + vm.futures.reduce((a, f) => a + f.V.evals, 0);
  // one state costs one evaluation against this round's target plus one per future round
  const perState = 1 + VM.futures.length;
  const t0 = process.hrtime.bigint();
  let cur = completedValue(S, VM);
  const fullVM = VM, fullCur = cur;
  if (evalsOf(VM) > 0) {
    calib.msPerEntry = (Number(process.hrtime.bigint() - t0) / 1e6 / evalsOf(VM)) / Math.max(1, entries.length);
  }
  const perEntryMs = calib.msPerEntry;

  const twoStep = ctx.twoStep !== false && !opening;
  const nMoves = singleMoves(S).length;
  const nPlans = completions(S).length;
  const estEvals = () => perState * (opening
    ? nPlans * (samples * 3 + 1)
    : nMoves * 2 + (rng && rerollAllowed(S) ? samples * (1 + nMoves) * 1.5 : 0) + 2
      + (twoStep ? DEFAULTS.twoStepWidth * (nMoves + (rng ? samples : 0)) : 0));
  const fits = () => estEvals() * perEntryMs * Math.max(1, entries.length) <= budgetMs;

  const samples0 = samples;
  while (!fits() && samples > DEFAULTS.minSamples) samples = Math.max(DEFAULTS.minSamples, samples >> 1);
  if (samples !== samples0) cuts.push(`samples ${samples0}->${samples}`);
  if (!fits() && entries.length > DEFAULTS.minEntries) {
    const n0 = entries.length;
    while (!fits() && entries.length > DEFAULTS.minEntries) {
      entries = trimTarget(all, Math.max(DEFAULTS.minEntries, entries.length >> 1));
    }
    cuts.push(`target ${n0}->${entries.length}`);
    VM = makeStateValuer(S, ctx, util, entries);
    cur = completedValue(S, VM);
  }
  let V = VM;
  let tail = cuts.length ? ` [cut: ${cuts.join(', ')}]` : '';

  const done = (reason) => ({ actions: [], done: true, reason: reason + tail, value: cur.score, expected: cur.score });
  const take = (actions, reason, expected) => {
    let s = S;
    for (const a of actions) {
      const why = shop.legal(s, a);
      if (why !== true) throw new Error(`planner produced an illegal ${a.type}: ${why}`);
      s = shop.apply(s, a);
    }
    if (ctx.log) ctx.log(reason + tail);
    return { actions, reason: reason + tail, value: cur.score, expected };
  };

  let best = opening
    ? openingBest(S, V, rng, samples, deadline, eps)
    : greedyBest(S, V, rng, samples, deadline, eps, cur, twoStep ? DEFAULTS.twoStepWidth : 0);

  // Experimental search of deterministic purchase combinations at S3 full-board shops. Retain the
  // old reroll/short search candidate unless this search finds a strictly better payoff.
  // This uses the same simulator objective; the node cap bounds reproducible offline work.
  const deepRounds = ctx.deepRounds || [2];
  if (S.season >= 3 && deepRounds.includes(S.round) && S.board.length === shop.BOARD_MAX && ctx.deepShop === true &&
      Date.now() <= deadline) {
    const deeper = shopSearch.search(S, { moves: singleMoves,
      value: state => completedValue(state, V), deadline,
      maxNodes: ctx.searchNodes == null ? 160 : ctx.searchNodes,
      width: ctx.searchWidth == null ? 10 : ctx.searchWidth,
      depth: ctx.searchDepth == null ? 4 : ctx.searchDepth });
    // A reduced search target is an accelerator, never a certificate. Check the completed
    // combination against the original target before committing its intermediate sacrifices.
    const fullScore = deeper.actions.length ? completedValue(deeper.state, fullVM).score : fullCur.score;
    if (deeper.actions.length && fullScore >= fullCur.score - 1e-9 &&
        deeper.value.score > (best ? best.value : cur.score) + 1e-9) {
      best = { actions: deeper.actions, value: deeper.value.score,
        reason: `combination ${deeper.actions.length} actions / ${deeper.expanded} states` };
    }
  }

  if (best && best.actions.length) {
    return take(best.actions, `r${S.round} ${best.reason} ${fmt(cur.score)}->${fmt(best.value)}`, best.value);
  }

  // A reduced sample can claim a perfect score while omitting the boards an affordable
  // move would beat. Before stopping, check every exact single move against the original
  // target. This bounded pass may exceed the soft search budget; no extra reroll sampling
  // or two-step search is added. The opt-out exists for paired policy evaluations.
  if (entries !== all && ctx.verifyStop !== false) {
    entries = all;
    VM = fullVM;
    V = fullVM;
    cur = fullCur;
    tail += ' [full-target stop check]';
    const checked = greedyBest(S, V, null, 0, Infinity, eps, cur, 0);
    if (checked && checked.actions.length) {
      return take(checked.actions, `r${S.round} ${checked.reason} ${fmt(cur.score)}->${fmt(checked.value)}`, checked.value);
    }
  }

  // Never finish a shop with an empty seat we can afford to fill (strategy.md §4.7, STR-13):
  // a short board is worth about -0.456 per fight, far more than any unit is bad.
  if (S.board.length < shop.BOARD_MAX) {
    const planned = cur.plan && cur.plan.length;
    const fill = planned ? { type: 'buy', shopIndex: cur.plan[0] } : bestAffordableBuy(S, V);
    if (fill) {
      const why = planned ? 'completion' : 'mandatory, no gain';
      return take([fill], `r${S.round} fill#${fill.shopIndex} (${why}) ${fmt(cur.score)}`, cur.score);
    }
  }
  // An apple is the only food whose STATS are permanent (docs/ENGINE_SHOP.md §4.3), so at R1 spare
  // gold goes on one even when it does not change THIS round's result: it carries into the next
  // shop, which the one-round evaluator cannot see (strategy.md §4.5, INFERRED).  R1 only: a full R0
  // board has spent 9 of its 10 gold, so a 3-gold feed is never legal there anyway (review R1-07).
  // (the match-level valuer sees the apple's future itself; this is the one-round fallback)
  if (!VM.matchLevel && !VM.defenseWeight && S.round === 1 && S.food === 'apple' && S.board.length === shop.BOARD_MAX) {
    // This block only runs when greedyBest found nothing, i.e. every feed ties at or below cur.score.
    // Ties then go to the seat the unit will actually hold: strategy.md §3.3 measures the apple at
    // 0.888 on the eventual front against 0.870 on the weakest and 0.852 on the back.
    const seatRank = frontFirstRank(S, entries, util, ctx.cache);
    let pick = null;
    for (const m of singleMoves(S)) {
      if (m.actions[0].type !== 'feed') continue;
      const v = completedValue(applyAll(S, m.actions), V).score;
      const rank = seatRank.get(m.actions[0].boardIndex);
      if (!pick || v > pick.value + 1e-9 || (v > pick.value - 1e-9 && rank < pick.rank)) {
        pick = { value: v, actions: m.actions, kind: m.kind, rank };
      }
    }
    if (pick) return take(pick.actions, `r${S.round} ${pick.kind} (apple carries) ${fmt(cur.score)}`, pick.value);
  }
  const finish = finishMove(S, ctx);
  if (finish) return take(finish.actions, `r${S.round} finish tie: defense ${fmt(finish.base.defense)}->${fmt(finish.value.defense)}, round ${fmt(finish.base.neutral)}->${fmt(finish.value.neutral)}`, finish.value.score);
  const freezes = freezerMoves(S, ctx);
  if (freezes.length) return take(freezes, 'freeze for the next Freezer shop', cur.score);
  return done(`r${S.round} done ${fmt(cur.score)}`);
}

/** boardIndex -> its position in the seat order the board will be re-seated into (0 = front). */
function frontFirstRank(S, entries, util, cache) {
  const tagged = shop.simUnits(S).map((u, i) => ({ ...u, seat: i }));
  const { order } = evaluate(tagged, entries, { round: S.round, seats: S.seats,
    season: S.season, ourCaptain: S.captain, theirCaptain: S.rivalCaptain, ourRelics: S.relics, theirRelics: S.rivalRelics,
    utility: util, cache });
  return new Map(order.map((u, pos) => [u.seat, pos]));
}

function bestAffordableBuy(S, V) {
  let best = null;
  for (let j = 0; j < S.offers.length; j++) {
    if (shop.legal(S, { type: 'buy', shopIndex: j }) !== true) continue;
    const v = stateValue(shop.apply(S, { type: 'buy', shopIndex: j }), V);
    if (!best || v > best.v) best = { v, type: 'buy', shopIndex: j };
  }
  return best ? { type: 'buy', shopIndex: best.shopIndex } : null;
}

/**
 * R0 opening: choose the subset of the current offers to buy before a reroll.
 * Candidates are "complete the board from what is on offer now" and, for every affordable subset,
 * "buy that subset, reroll, then complete". The action returned is the first buy of the
 * winning plan, or the reroll itself; the next planStep re-derives the same decision from the
 * smaller state, so an unlucky sample can never strand the board.
 */
function openingBest(S, V, rng, samples, deadline, eps) {
  const now = completedValue(S, V);
  let best = { value: now.score, actions: now.plan.length ? [{ type: 'buy', shopIndex: now.plan[0] }] : [], reason: 'take offers' };
  if (!rng) return best;

  for (const c of completions(S)) {
    const after = c.plan.length ? buyAll(S, c.plan) : S;
    if (after.board.length >= shop.BOARD_MAX) continue;   // nothing left to reroll for
    if (!rerollAllowed(after)) continue;
    const { ev, samples: used } = rerollEV(after, V, rng, samples, deadline, false);
    if (ev <= best.value + eps) continue;
    best = {
      value: ev,
      actions: c.plan.length ? [{ type: 'buy', shopIndex: c.plan[0] }] : [{ type: 'reroll' }],
      reason: c.plan.length
        ? `keep${c.plan.length} buy#${c.plan[0]} (reroll after, ${used}x)`
        : `reroll (keep0, ${used}x)`,
    };
  }
  return best;
}

/**
 * R1/R2 (and the R0 tail after its first reroll): one greedy step.
 *
 * `eps` guards the REROLL only, and `ctx.epsilon` (tools/eval_planner.js --epsilon) therefore moves
 * only the reroll margin.  A reroll's value is a mean over sampled shops, so it needs a margin
 * against sampling noise; the audit used exactly this, +0.01 on the reroll and a bare improvement on
 * everything else (audit/strategy/r12b_policy.js).  Feeds, buys and sell+buys are evaluated exactly
 * by the simulator, so any strict improvement is a real one.  Applying eps to them as well was
 * measured against a MODIFIED greedyBest (the flag as shipped cannot reproduce it) and cost 0.007 at
 * R1 and 0.005 at R2 while leaving 2 gold a shop unspent (review R3-6).
 */
function greedyBest(S, V, rng, samples, deadline, eps, cur, width = 0) {
  let best = { value: cur.score, actions: [], reason: 'stand' };
  const ranked = [];
  for (const m of singleMoves(S)) {
    const after = applyAll(S, m.actions);
    const v = completedValue(after, V).score;
    ranked.push({ v, m, after });
    if (v > best.value + 1e-9) best = { value: v, actions: m.actions, reason: m.kind };
  }
  // Two-step look-ahead: the best `width` single moves are followed by their own best exact follow-up
  // (a feed after a buy, a buy after a sell+buy, ...), and a move is credited with the better of the
  // two.  Greedy alone stops at the first step that does not improve on its own, so a swap that only
  // pays off once the freed gold is fed was never taken.  Exact moves only: a reroll after the first
  // step stays a sampled estimate and keeps its eps margin.
  if (width > 0 && ranked.length) {
    ranked.sort((a, b) => b.v - a.v);
    for (const cand of ranked.slice(0, width)) {
      if (Date.now() > deadline) break;
      let chain = cand.v;
      for (const m2 of singleMoves(cand.after)) {
        const v2 = completedValue(applyAll(cand.after, m2.actions), V).score;
        if (v2 > chain) chain = v2;
      }
      if (rng && (S.season >= 3 || S.round > 0 || (S.rerolls || 0) === 0) && rerollAllowed(cand.after)) {
        const { ev } = rerollEV(cand.after, V, rng, Math.max(DEFAULTS.minSamples, samples >> 1), deadline, false);
        if (ev > chain + eps) chain = ev;
      }
      if (chain > best.value + 1e-9) best = { value: chain, actions: cand.m.actions, reason: `${cand.m.kind} (+follow-up)` };
    }
  }
  // The fill budget itself permits one paid R0 roll in S1/S2. Scout's free first roll and
  // Recruiter's extra token can permit a second roll in S3 without leaving an empty seat.
  const mayReroll = rng && (S.season >= 3 || S.round > 0 || (S.rerolls || 0) === 0) && rerollAllowed(S);
  if (mayReroll) {
    const { ev, samples: used } = rerollEV(S, V, rng, samples, deadline, true);
    if (ev > best.value + eps) best = { value: ev, actions: [{ type: 'reroll' }], reason: `reroll (${used}x)` };
  }
  return best.actions.length ? best : null;
}

/**
 * Compare an offered captain by playing the same small set of hypothetical shops with each one.
 * The round outcomes come from the battle simulator; the shop model accounts for Recruiter's extra
 * gold, Scout's free roll, Chef's food price and Banker's carry. The future offers are unknown, so
 * this is a sampled decision, not a claim that a captain has a fixed rank.
 */
function chooseCaptain(S, ctx = {}) {
  const offered = [...new Set((S.captainOffer || []).map(shop.captainId).filter(Boolean))];
  if (!offered.length) return null;
  if (offered.length === 1) return offered[0];
  const targets = [0, 1, 2].map((round) => {
    const supplied = ctx.targets && ctx.targets[round];
    const built = supplied || (ctx.book && targetLib.build({
      ...ctx.targetOpts, beforeTs: ctx.beforeTs ?? Date.now(), book: ctx.book, season: S.season, round,
      handle: ctx.handle || ctx.prevHandle, prevHandle: ctx.prevHandle, seats: S.seats,
      proxy: !ctx.handle,
      bookWeight: !ctx.handle || round === 0 ? ctx.targetOpts?.bookWeight0 : ctx.targetOpts?.bookWeight12,
      bookPolicy: ctx.targetOpts?.bookPolicy,
      recencyHalfLifeMs: ctx.targetOpts?.recencyHalfLifeMs,
    }));
    return trimTarget(entriesOf(built), 8);
  });
  // No battle evidence means the simulator cannot distinguish captains. Preserve offer order.
  if (!targets.some((t) => t.length)) return offered[0];

  const sampleCount = ctx.captainSamples == null ? 2 : Math.max(1, Math.trunc(ctx.captainSamples));
  const shopSteps = ctx.captainShopSteps == null ? 8 : Math.max(1, Math.trunc(ctx.captainShopSteps));
  const nextShop = shop.sampleNextShop;
  const playShop = (initial, entries, planRng, drawRng) => {
    let state = initial;
    // Fixed search work keeps the draft reproducible under different CPU load; the target and
    // number of hypothetical shops are already bounded above.
    const planCtx = { target: entries, futureTargets:targets, rng: planRng, timeBudgetMs: Infinity, rerollSamples: 2,
      matchLevel: false, twoStep: false, deepShop: false, pairedRerolls: ctx.pairedRerolls, cache: new Map() };
    for (let step = 0; step < shopSteps; step++) {
      const plan = planStep(state, planCtx);
      if (!plan.actions.length) break;
      for (const action of plan.actions) {
        state = action.type === 'reroll' ? shop.sampleReroll(state, drawRng) : shop.apply(state, action);
      }
    }
    const tagged = shop.simUnits(state).map((u, seat) => ({ ...u, seat }));
    const ranked = sim.bestSeating(tagged, entries, {
      round: state.round, season: state.season, seats: state.seats,
      ourCaptain: state.captain, theirCaptain: state.rivalCaptain, ourRelics: state.relics, theirRelics: state.rivalRelics,
      utility: { win: 1, draw: 0.5, loss: 0 },
    });
    if (ranked.length) state = { ...state,
      board: ranked[0].order.map((u) => state.board[u.seat]) };
    return { state, wdl: ranked.length ? ranked[0].wdl : { win: 0.5, draw: 0, loss: 0.5 } };
  };
  let winner = offered[0];
  let best = -Infinity;
  for (const captain of offered) {
    let total = 0;
    for (let sample = 0; sample < sampleCount; sample++) {
      // Each round's external offers use a separate keyed stream, so a captain taking an extra
      // reroll in round zero cannot change what the comparison sees in round one.
      const seed = 0x5eed0000 + sample * 1009;
      let state = shop.apply(S, { type: 'pickCaptain', captain });
      const probs = {};
      for (let round = 0; round <= 2; round++) {
        if (round) state = nextShop(state, round, sim.mulberry32(seed + round * 7919));
        const fought = playShop(state, targets[round],
          sim.mulberry32(seed + round * 10949 + 1),
          sim.mulberry32(seed + round * 15427 + 2));
        state = fought.state;
        if (S.season >= 4) state.lastResult = sim.mulberry32(seed + round * 2311)() < fought.wdl.loss ? 'them' : 'you';
        probs[round] = fought.wdl;
      }
      total += matchValue(0, { you: 0, them: 0 }, probs);
    }
    const value = total / sampleCount;
    if (value > best + 1e-9) { best = value; winner = captain; }
  }
  return winner;
}

// Ties still matter: a draw can already win the series, and the saved
// board can be attacked later. Maximize the full current-match score first, then
// defense against observed attackers (with our board on the ghost side), then the
// ordinary round score. Seating ties can use defense in every round; spending
// extra gold is restricted to exact, deterministic final-round moves.
function finishValue(S, target, defenseTarget, util = utility(S.round, S.series)) {
  const units = shop.simUnits(S).map((u, seat) => ({ ...u, seat }));
  const primary = sim.bestSeating(units, entriesOf(target), { season: S.season, round: S.round,
    seats: S.seats, ourCaptain: S.captain, theirCaptain: S.rivalCaptain, ourRelics: S.relics, theirRelics: S.rivalRelics, utility: util });
  const defense = entriesOf(defenseTarget);
  const weight = defense.reduce((sum, e) => sum + (e.weight ?? 1), 0);
  let best = null;
  for (const row of primary) {
    if (best && row.score < best.score - 1e-9) break;
    let defensive = 0;
    for (const e of defense) {
      const result = sim.outcome(e.board, row.order, { season: S.season, round: S.round,
        seats: e.seats, ourCaptain: e.theirCaptain, theirCaptain: S.captain, ourRelics: e.theirRelics, theirRelics: S.relics });
      defensive += (e.weight ?? 1) * (result === 'them' ? 1 : result === 'draw' ? 0.5 : 0);
    }
    const candidate = { ...row, defense: weight ? defensive / weight : 0,
      neutral: row.wdl.win + 0.5 * row.wdl.draw };
    if (!best || betterFinish(candidate, best)) best = candidate;
  }
  return best;
}
function betterFinish(a, b) {
  for (const field of ['score', 'defense', 'neutral']) {
    if (a[field] > b[field] + 1e-9) return true;
    if (a[field] < b[field] - 1e-9) return false;
  }
  return false;
}
function finishMove(S, ctx) {
  if (defenseExposure(S, ctx)) return null; // combined objective already evaluates spending in every round
  if (ctx.finishTies === false || S.season < 3 || S.round !== 2 || S.board.length !== shop.BOARD_MAX ||
      !entriesOf(ctx.target).length) return null;
  const base = finishValue(S, ctx.target, ctx.defenseTarget, ctx.utility);
  let best = base, actions = null;
  for (const m of singleMoves(S)) {
    const after = applyAll(S, m.actions);
    // Expected-value shop triggers are not exact battle inputs. Leave these moves
    // to the existing stochastic search rather than silently rounding their stats.
    if (shop.simUnitsOutcomes(after).length !== 1) continue;
    const value = finishValue(after, ctx.target, ctx.defenseTarget, ctx.utility);
    if (betterFinish(value, best)) { best = value; actions = m.actions; }
  }
  return actions ? { actions, base, value: best } : null;
}

// ------------------------------------------------------------------ seating

/**
 * The moves that turn the current board into the best seat order.  Moves are free, so every shop
 * ends with them: re-seating the same R0 units is worth 0.718 -> 0.799, and at R1/R2 the units
 * actually fought went 0.758 -> 0.883 on order alone (strategy.md §7 STR-08).
 * The server only has "swap with a neighbour", so the target order is reached by adjacent swaps.
 */
function seatingActions(S, target, opts = {}) {
  if (S.board.length < 2) return [];
  const units = shop.simUnits(S).map((u, i) => ({ ...u, seat: i }));
  let { order } = evaluate(units, target, {
    round: S.round,
    seats: S.seats,
    season: S.season,
    ourCaptain: S.captain,
    theirCaptain: S.rivalCaptain, ourRelics: S.relics, theirRelics: S.rivalRelics,
    utility: opts.utility || utility(S.round, S.series),
    cache: opts.cache,
  });
  const exposure = defenseExposure(S, opts);
  if (exposure) {
    const V = makeValue(entriesOf(target), { round: S.round, season: S.season, seats: S.seats,
      ourCaptain: S.captain, theirCaptain: S.rivalCaptain, ourRelics: S.relics, theirRelics: S.rivalRelics, utility: matchUtility(S.round, S.series),
      defenseTarget: opts.defenseTarget, defenseWeight: exposure, cache: opts.cache });
    order = reorderTo(units, V(units).orderKeys);
  } else if (S.season >= 3 && opts.finishTies !== false && entriesOf(target).length &&
      (S.round === 2 || entriesOf(opts.defenseTarget).length)) {
    order = finishValue(S, target, opts.defenseTarget, opts.utility).order;
  }
  const want = order.map((u) => u.seat);
  const cur = S.board.map((_, i) => i);
  const out = [];
  for (let i = 0; i < want.length; i++) {
    let j = cur.indexOf(want[i]);
    while (j > i) {
      out.push({ type: 'move', boardIndex: j, dir: -1 });
      const t = cur[j - 1]; cur[j - 1] = cur[j]; cur[j] = t;
      j--;
    }
  }
  return out;
}

/**
 * NOTE on reproducibility: planStep degrades against a WALL CLOCK, so with a finite
 * `ctx.timeBudgetMs` the same (S, seed) can take a different action on a loaded machine.  The
 * calibration that drives that decision lives on ctx (see calibOf), so it no longer leaks between
 * shops, matches or tests -- but a cold process still measures itself slower than a warm one.
 * Pass `timeBudgetMs: Infinity` for a byte-reproducible run; tools/eval_planner.js does.
 */
module.exports = {
  matchUtility, defensiveValue, defenseExposure,
  utility,
  matchValue,
  makeStateValuer,
  evaluate,
  planStep,
  chooseCaptain,
  chooseRelic,
  freezerMoves,
  seatingActions,
  completions,
  completedValue,
  canFill,
  rerollAllowed,
  singleMoves,
  finishValue,
  finishMove,
  trimTarget,
  DEFAULTS,
};

/** Compare relic offers through bounded, shared shop draws and simulated remaining rounds. */
function chooseRelic(S, ctx = {}) {
  const offered = (S.relicOffer || []).filter(relic => shop.legal(S, {type:'pickRelic',relic}) === true);
  if (!offered.length) return null;
  const targets = [0,1,2].map(round => trimTarget(entriesOf(targetLib.build({
    ...ctx.targetOpts, book:ctx.book, season:S.season, round, handle:ctx.handle,
    prevHandle:ctx.prevHandle, seats:S.seats, beforeTs:ctx.beforeTs })), 8));
  let best = -Infinity, winner = offered[0];
  for (const relic of offered) {
    let total = 0;
    for (let sample = 0; sample < (ctx.relicSamples ?? 2); sample++) {
      const seed = 0x52454c + sample * 997;
      let state = shop.apply(S, {type:'pickRelic',relic});
      if (relic === 'earlyAccess') state = shop.sampleStock(state, sim.mulberry32(seed));
      const probs = {};
      for (let round = S.round; round <= 2; round++) {
        if (round !== S.round) state = shop.sampleNextShop(state, round, sim.mulberry32(seed + round * 7919));
        const rng = sim.mulberry32(seed + round * 3571);
        const planCtx = {target:targets[round],rng,cache:new Map(),timeBudgetMs:Infinity,
          rerollSamples:2,matchLevel:false,twoStep:false,finishTies:false};
        for (let step = 0; step < 8; step++) {
          const p = planStep(state, planCtx); if (!p.actions.length) break;
          for (const a of p.actions) state = a.type === 'reroll' ? shop.sampleReroll(state, rng) : shop.apply(state, a);
        }
        const ranked = sim.bestSeating(shop.simUnits(state), targets[round], {round,season:S.season,seats:S.seats,
          ourCaptain:S.captain,theirCaptain:S.rivalCaptain,ourRelics:state.relics,theirRelics:S.rivalRelics});
        probs[round] = ranked[0]?.wdl || {win:.5,draw:0,loss:.5};
        state.lastResult = sim.mulberry32(seed + round * 2311)() < probs[round].loss ? 'them' : 'you';
      }
      total += matchValue(S.round, S.series, probs);
    }
    if (total > best + 1e-9) { best = total; winner = relic; }
  }
  return winner;
}

/** Freezer turns a carried offer into a stronger next-shop purchase. Compare every freeze mask
 * using the same two sampled future shops and actual battle scores; no card ranking. */
function freezerMoves(S, ctx) {
  const entries = trimTarget(entriesOf(ctx.futureTargets?.[S.round + 1]), 6);
  if (S.season < 4 || S.captain !== 'freezer' || S.round >= 2 || !entries.length) return [];
  const slots = S.offers.flatMap((o,i)=>o ? [i] : []);
  if (!slots.length) return [];
  const V = makeValue(entries,{round:S.round+1,seats:S.seats,season:S.season,ourCaptain:S.captain,
    theirCaptain:S.rivalCaptain,ourRelics:S.relics,theirRelics:S.rivalRelics,utility:{win:1,draw:.5,loss:0}});
  let best = -Infinity, bestActions = [];
  const original = slots.reduce((n,i,j)=>n | (S.frozen[i] ? 1 << j : 0),0);
  const masks = [original,...Array.from({length:1 << slots.length},(_,i)=>i).filter(i=>i!==original)];
  for (const mask of masks) {
    const actions = slots.flatMap((i,j)=>!!(mask & (1 << j)) !== S.frozen[i] ? [{type:'freeze',shopIndex:i}] : []);
    const candidate = applyAll(S,actions); let value = 0;
    for (let sample=0;sample<2;sample++) {
      let state = shop.sampleNextShop(candidate,S.round+1,sim.mulberry32(0x46525a+sample*7919));
      for (let step=0;step<3;step++) {
        let score=stateValue(state,V), next=null;
        for (const m of singleMoves(state)) { const after=applyAll(state,m.actions), v=completedValue(after,V);
          if(v.score > score+1e-9) {score=v.score;next=v.state;} }
        if(!next) break; state=next;
      }
      value += stateValue(state,V);
    }
    if(value > best+1e-9) {best=value;bestActions=actions;}
  }
  return bestActions;
}
