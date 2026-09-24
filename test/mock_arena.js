'use strict';
/**
 * Offline, deterministic stand-in for lib/arena.js.
 *
 * It is the real engine, not a fake: the shop is lib/shop_model.js, the battle is lib/sim.js (which
 * matches all 10,748 recorded winners), the offer and food rolls follow the observed odds
 * (docs/ENGINE_SHOP.md §1), and the ghosts are real recorded enemy boards from
 * data/corpus/battles.jsonl for S1/S2 or complete same-match trajectories from
 * data/corpus/s3_public_matches.jsonl for S3. Each exogenous draw is keyed by match, round and roll, so policies
 * with different reroll counts still face the same later ghosts and fresh shops on the same seed.
 *
 * Rules it enforces so the loop's invariants can be tested:
 *   - an illegal action throws (the server answers 400 invalid_action);
 *   - start/restart while the phase is shop or battle throws (the loop must never do that);
 *   - the opponent handle is hidden during the round-0 shop, as it is live in 90.5% of R0 shops.
 *
 * opts.suddenDeath=true enables the current four-round format; the default preserves
 * historical three-round benchmarks. A missing fourth ghost board reuses its third
 * snapshot, recorded in stats.ghostFallbacks so evaluations can report that assumption.
 */
const fs = require('fs');
const path = require('path');
const catalog = require('../lib/catalog');
const shopModel = require('../lib/shop_model');
const sim = require('../lib/sim');
const { addKept, decideSuddenDeath } = require('../lib/match_rules');

const CORPUS = path.join(__dirname, '..', 'data', 'corpus', 'battles.jsonl');
const S3_CORPUS = path.join(__dirname, '..', 'data', 'corpus', 's3_public_matches.jsonl');
const CAPTAIN_IDS = ['drill','medic','banker','scout','chef','recruiter'];
const s4 = require('../lib/season4');
// one seeded rng, one seat-name list and one offerFromBot for the whole repo (review R3-7)
const { SEAT_NAMES, mulberry32 } = sim;
const offerFromBot = shopModel.offerFromBot;

const GHOST_CACHE = new Map();

/** handles that have a recorded enemy board for every round, so a full series can be played. */
function loadGhosts(opts = {}) {
  if (opts.s4) return loadS4Ghosts(opts.file);
  if (opts.s3) return loadS3Ghosts(opts.file || S3_CORPUS);
  const file = opts.file || CORPUS;
  const wantS2 = !!opts.s2;
  const key = `${file}|${wantS2}`;
  if (GHOST_CACHE.has(key)) return GHOST_CACHE.get(key);
  const byHandle = new Map();
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row.handle || !Array.isArray(row.them) || !row.them.length) continue;
    if (!!row.s2 !== wantS2) continue;
    let g = byHandle.get(row.handle);
    if (!g) byHandle.set(row.handle, (g = [[], [], [], []]));
    if (row.round >= 0 && row.round <= 3) g[row.round].push(row.them);
  }
  const out = [];
  for (const [handle, rounds] of byHandle) {
    if (rounds.slice(0, 3).every((r) => r.length)) {
      out.push({ handle, rounds: rounds[3].length ? rounds : rounds.slice(0, 3) });
    }
  }
  out.sort((a, b) => (a.handle < b.handle ? -1 : 1)); // stable order -> reproducible picks
  if (!out.length) throw new Error(`mock_arena: no complete ghosts in ${file} (s2=${wantS2})`);
  GHOST_CACHE.set(key, out);
  return out;
}

/** Keep each public S3 match together as one opponent trajectory. */
function loadS3Ghosts(file) {
  const key = `${file}|s3`;
  if (GHOST_CACHE.has(key)) return GHOST_CACHE.get(key);
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const rounds = row.rounds || [];
    if (![3, 4].includes(rounds.length) || !Array.from({ length: rounds.length }, (_, r) => r)
      .every((r) => rounds.some((x) => x.round === r && x.them && x.them.length))) continue;
    const handle = row.opponent && row.opponent.x_handle;
    if (!handle) continue;
    out.push({
      handle,
      id: row.id,
      rounds: Array.from({ length: rounds.length }, (_, r) =>
        [rounds.find((x) => x.round === r).them.map((u) => catalog.toSimUnit(u, 3))]),
    });
  }
  if (!out.length) throw new Error(`mock_arena: no complete S3 ghost trajectories in ${file}`);
  out.sort((a, b) => a.id.localeCompare(b.id));
  GHOST_CACHE.set(key, out);
  return out;
}

function loadS4Ghosts(file = path.join(__dirname,'../data/corpus/s4_public_matches_20260923.json.gz')) {
  if (GHOST_CACHE.has(file)) return GHOST_CACHE.get(file);
  const details = JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(file)));
  const out = details.filter(d => [3, 4].includes(d.rounds?.length) && d.opponent?.x_handle).map(d => ({
    id:d.id,handle:d.opponent.x_handle,
    rounds:d.rounds.map((_,r) => [d.rounds.find(x => x.round === r).them.map(u => catalog.toSimUnit(u,4))]),
    captains:d.rounds.map((_,r) => s4.combatMetadata(d.rounds.find(x => x.round === r).frames,'them').captain),
    relics:d.rounds.map((_,r) => s4.combatMetadata(d.rounds.find(x => x.round === r).frames,'them').relics)
  })).sort((a,b)=>a.id.localeCompare(b.id));
  if (!out.length) throw new Error('No complete Season 4 ghost trajectories');
  GHOST_CACHE.set(file,out); return out;
}

function botId(name) {
  const b = catalog.byName(name);
  return b ? b.id : `unknown:${name}`;
}

function create(opts = {}) {
  const seed = opts.seed == null ? 20260919 : opts.seed;
  const hash = (label) => {
    let h = (2166136261 ^ seed) >>> 0;
    for (let i = 0; i < label.length; i++) {
      h ^= label.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const draw = (label) => mulberry32(hash(label))();
  const season = opts.season || 1;
  // Historical benchmarks retain their three-round format unless explicitly opted in.
  const suddenDeathEnabled = opts.suddenDeath === true;
  const ghosts = opts.ghosts || loadGhosts({ s4: season === 4, s3: season === 3, s2: season === 2, file: opts.corpus });

  let version = 1000;
  let phase = { kind: 'idle' };
  let S = null;
  let match = null;
  let dry = false;
  // `rounds` is what lets a test report the per-round score, which is the quantity the audit
  // reports (audit/strategy.md §3) -- the match win rate alone hides which round loses.
  const stats = { posts: 0, actions: {}, endShops: [], matches: [], rounds: [], illegal: 0,
    ghostFallbacks: [] };
  const publicReplays = new Map();

  const pick = (arr, label) => arr[Math.floor(draw(label) * arr.length)];

  function rollShop(state) {
    const roll = match.rolls[state.round] || 0;
    match.rolls[state.round] = roll + 1;
    const pool = catalog.unlockedPool(state.round + (shopModel.hasRelic(state,'earlyAccess') ? 1 : 0), state.season);
    let offers = state.offers.map((o, i) =>
      state.frozen[i] && o ? o : offerFromBot(shopModel.sampleOfferBot(pool,
        () => draw(`match:${match.index}:round:${state.round}:roll:${roll}:offer:${i}`)), i, season)
    );
    if (shopModel.hasRelic(state,'bulkOrder')) offers = offers.map((o,i) => state.frozen[i] && state.offers[i] ? o : {...o,cost:Math.max(0,o.cost-1)});
    const food = shopModel.sampleFood(state.round,
      () => draw(`match:${match.index}:round:${state.round}:roll:${roll}:food`));
    // The public API specifies item unlock turns and the observed R0 common item costs 2.
    // R1/R2 item rarity odds and costs are not published, so this is an explicit mock assumption.
    let itemOffer = season >= 3
      ? state.itemOffer && state.itemOffer.frozen ? state.itemOffer :
        shopModel.sampleItemOffer(state.round,
          () => draw(`match:${match.index}:round:${state.round}:roll:${roll}:item`), season)
      : null;
    if (itemOffer && shopModel.hasRelic(state,'itemHoarder')) itemOffer = {...itemOffer,cost:0};
    return { ...state, offers, food, itemOffer };
  }

  // opts.aiMatch(n) -> true makes the n-th match (1-based) an "AI · no ghost" match: the rated
  // queue found no ghost, so the server fields the AI, opponentKind is 'ai', the handle reads "AI"
  // and the result carries no eloDelta (client 05a-jofdag21h.js, label "AI · no ghost").
  const aiMatch = typeof opts.aiMatch === 'function' ? opts.aiMatch : () => false;

  function newMatch() {
    const n = stats.matches.length + 1;
    const ghost = opts.ghostSequence ? ghosts[(n - 1) % ghosts.length] : pick(ghosts, `match:${n}:ghost`);
    const seats = {};
    if (season >= 2) {
      const rules = [...sim.SEAT_RULES, ...(season >= 4 ? s4.SEATS : [])];
      for (const seat of SEAT_NAMES) seats[seat] = opts.ghostSequence && ghost.seats?.[seat]
        || pick(rules.filter(r => !Object.values(seats).includes(r)), `match:${n}:seat:${seat}`);
    }
    const captains = [...CAPTAIN_IDS,...(season >= 4 ? s4.CAPTAINS : [])];
    match = {
      index: n,
      id: `m_mock_${n}`,
      ghost,
      rolls: {},
      ai: !!aiMatch(n),
      captainOffer: season >= 3 ? (opts.captainOffer || [...captains].sort((a, b) =>
        draw(`match:${n}:captain:${a}`) - draw(`match:${n}:captain:${b}`)).slice(0, 3)) : null,
      rivalCaptain: season >= 3 ? (opts.rivalCaptain || (season >= 4 && (ghost.captains?.find(Boolean) || 'trainer')) || (opts.ghostSequence && ghost.captain)
        || pick(captains, `match:${n}:rival-captain`)) : null,
      seats: season >= 2 ? seats : null,
      wins: { you: 0, them: 0 },
      kept: { you: { hp: 0, atk: 0 }, them: { hp: 0, atk: 0 } },
      toSuddenDeath: false,
      suddenDeath: null,
      results: [],
      replayRounds: [],
      eloDelta: null,
      done: false,
    };
    S = rollShop({
      round: 0,
      gold: shopModel.GOLD_PER_SHOP,
      board: [],
      offers: [null, null, null],
      frozen: [false, false, false],
      food: null,
      series: { you: 0, them: 0 },
      seats: match.seats,
      season,
      suddenDeathEnabled,
      rerolls: 0,
      nextUid: 1,
      captain: null,
      rivalCaptain: match.rivalCaptain,
      captainOffer: match.captainOffer,
      carry: 0,
      freeRerolls: 0,
      shopCosts: null,
      itemOffer: null,
      ...(season >= 4 ? {relics:[],relicOffer:null,rivalRelics:null} : {}),
    });
    phase = { kind: 'shop', round: 0 };
  }

  function nextShop() {
    if (season >= 4) {
      const next = shopModel.sampleNextShop({...S,lastResult:match.results.at(-1)},S.round+1,()=>0.5);
      next.offers = next.offers.map((o,i)=>S.frozen[i] ? o : null);
      next.itemOffer = S.itemOffer?.frozen ? S.itemOffer : null;
      S = rollShop({...next,series:{...match.wins},
        rivalCaptain:match.ghost.captains?.[next.round] ?? match.rivalCaptain,
        rivalRelics:match.ghost.relics?.[S.round]?.length ? match.ghost.relics[S.round] : null,
        relicOffer:next.round < 3 ? s4.RELICS.filter(r=>!S.relics.includes(r)).sort((a,b)=>draw(`match:${match.index}:round:${next.round}:relic:${a}`)-draw(`match:${match.index}:round:${next.round}:relic:${b}`)).slice(0,3) : null});
      phase={kind:'shop',round:S.round}; return;
    }

    // Banker carries up to five unspent tokens; Recruiter receives one extra each shop.
    const carry = season >= 3 && S.captain === 'banker' ? Math.min(5, S.gold) : 0;
    S = rollShop({
      ...S,
      round: S.round + 1,
      gold: shopModel.GOLD_PER_SHOP + carry + (S.captain === 'recruiter' ? 1 : 0),
      board: S.board.map((u) => ({
        ...u, tempAtk: 0, potato: false,
        ...(season >= 3 && u.item && catalog.itemById(u.item)?.oneUse ? { item: null } : {}),
      })),
      series: { ...match.wins },
      rerolls: 0,
      carry,
      freeRerolls: S.captain === 'scout' ? 1 : 0,
      shopCosts: season >= 3 ? { reroll: S.captain === 'scout' ? 0 : 1, food: S.captain === 'chef' ? 2 : 3 } : null,
    });
    phase = { kind: 'shop', round: S.round };
  }

  function finishMatch() {
    const w = match.wins;
    const result = w.you > w.them ? 'win' : w.them > w.you ? 'loss' : 'draw';
    // K=32 at equal rating (docs/ENGINE_SHOP.md §1 "standard K=32 Elo").
    match.eloDelta = match.ai ? null : result === 'win' ? 16 : result === 'loss' ? -16 : 0;
    match.done = true;
    stats.matches.push({
      id: match.id,
      handle: match.ai ? 'AI' : match.ghost.handle,
      ai: match.ai,
      result,
      wins: { ...w },
      eloDelta: match.eloDelta,
      ...(match.suddenDeath ? { suddenDeath: structuredClone(match.suddenDeath) } : {}),
    });
    if (season >= 3) publicReplays.set(match.id, {
      id: match.id,
      player: { x_handle: 'mockbot' },
      opponent: { kind: match.ai ? 'ai' : 'ghost', x_handle: match.ai ? 'AI' : match.ghost.handle },
      rounds: match.replayRounds,
      result,
    });
    phase = { kind: 'result' };
  }

  function seatShopRows(round) {
    if (season < 2) return undefined;
    return SEAT_NAMES.map((n, i) => ({
      seat: n,
      revealed: round >= i,
      name: round >= i ? match.seats[n].replace(/_/g, ' ') : undefined,
      text: round >= i ? `seat rule ${match.seats[n]}` : undefined,
    }));
  }

  /** The handle is hidden while the round-0 shop is open, as it is live. */
  function visibleHandle() {
    if (!match) return undefined;
    if (phase.kind === 'shop' && phase.round === 0) return undefined;
    return match.ai ? 'AI' : match.ghost.handle;
  }

  function toState() {
    if (!match) return { phase: { kind: 'idle' }, version, rated: true, season, suddenDeathEnabled };
    const round = phase.round == null ? S.round : phase.round;
    return {
      phase,
      suddenDeathEnabled,
      ...(suddenDeathEnabled ? { kept: structuredClone(match.kept),
        ...(match.toSuddenDeath ? { toSuddenDeath: true } : {}),
        ...(match.suddenDeath ? { suddenDeath: structuredClone(match.suddenDeath) } : {}) } : {}),
      ...(season >= 4 ? {relics:S.relics,relicOffer:S.relicOffer,rivalRelics:S.rivalRelics} : {}),
      gold: S.gold,
      board: S.board.map((u) => ({
        uid: u.uid,
        botId: botId(u.name), ...(u.fusedWith ? {fusedWith:u.fusedWith} : {}),
        name: u.name,
        kitId: u.kitId,
        atk: u.atk,
        hp: u.hp,
        tempAtk: u.tempAtk || 0,
        honey: !!u.honey,
        potato: !!u.potato,
        rarity: u.rarity,
        cost: u.cost,
        ...(season >= 3 ? { crew: u.crew || null, item: u.item || null } : {}),
      })),
      shop: {
        pets: S.offers.map((o, i) =>
          o
            ? {
                botId: botId(o.name),
                name: o.name,
                kitId: o.kitId,
                atk: o.atk,
                hp: o.hp,
                cost: o.cost,
                rarity: o.rarity,
                frozen: !!S.frozen[i],
                ...(season >= 3 ? { crew: o.crew || null } : {}),
              }
            : null
        ),
        food: S.food,
        ...(season >= 3 ? { item: S.itemOffer } : {}),
      },
      wins: { ...match.wins },
      results: match.results.slice(),
      lastSeen: null,
      seed: 0,
      nextUid: S.nextUid,
      version,
      rated: true,
      matchId: match.id,
      season,
      opponentKind: match.ai ? 'ai' : 'ghost',
      opponentHandle: visibleHandle(),
      eloDelta: phase.kind === 'result' && !match.ai ? match.eloDelta : undefined,
      seats: season >= 2 ? match.seats : undefined,
      seatShop: seatShopRows(round),
      ...(season >= 3 ? {
        captain: S.captain,
        captainOffer: S.captainOffer,
        captainShop: S.captainOffer ? { offer: S.captainOffer.map((captain) => ({ captain, name: captain })) } :
          { you: S.captain ? { captain: S.captain, name: S.captain } : undefined,
            them: phase.kind === 'shop' && phase.round === 0 ? undefined :
              { captain: match.rivalCaptain, name: match.rivalCaptain } },
        rivalCaptain: phase.kind === 'shop' && phase.round === 0 ? undefined : match.rivalCaptain,
        carry: S.carry,
        freeRerolls: S.freeRerolls,
        shopCosts: S.shopCosts,
      } : {}),
    };
  }

  function envelope(extra) {
    return { state: toState(), version, rated: true, ...(extra || {}) };
  }

  async function observe() {
    return envelope();
  }

  async function act(action, ver) {
    if (!action || typeof action.type !== 'string') throw new Error('action.type required');
    if (dry) return { ...envelope(), dryRun: true, action };
    stats.posts += 1;
    stats.actions[action.type] = (stats.actions[action.type] || 0) + 1;
    if (ver != null && ver !== version) {
      // Same contract as the server: the action is NOT applied on a stale version.
      return { ...envelope(), conflict: true, action };
    }
    version += 1;

    switch (action.type) {
      case 'start':
      case 'restart': {
        if (phase.kind === 'shop' || phase.kind === 'battle') {
          throw new Error(`${action.type} while phase=${phase.kind}`);
        }
        newMatch();
        return envelope();
      }
      case 'endShop': {
        if (phase.kind !== 'shop') throw new Error(`endShop while phase=${phase.kind}`);
        if (season >= 3 && !S.captain) throw new Error('endShop before captain pick');
        if (!S.board.length) throw new Error('endShop with an empty board');
        stats.endShops.push({
          matchId: match.id,
          round: S.round,
          units: S.board.length,
          goldLeft: S.gold,
          cheapestOffer: Math.min(
            ...S.offers.filter(Boolean).map((o) => o.cost),
            Infinity
          ),
        });
        let sourceRound = S.round;
        if (S.round === 3 && !match.ghost.rounds[3]?.length) {
          // Older corpora have no fourth board. Reuse the third recorded snapshot,
          // including its items/relics; this is an explicit benchmark assumption.
          sourceRound = 2;
          stats.ghostFallbacks.push({ matchId: match.id, round: 3, sourceRound,
            reason: 'no recorded fourth-round board' });
        }
        const them = pick(match.ghost.rounds[sourceRound], `match:${match.index}:round:${S.round}:enemy`);
        const us = shopModel.simUnits(S);
        if (season >= 4) S = {...S, rivalRelics:match.ghost.relics?.[sourceRound]
          ?? (S.round === 3 ? match.ghost.relics?.[2] : null) ?? []};
        const r = sim.simulate(us, them, {
          round: S.round,
          seats: match.seats,
          season,
          captains: season >= 3 ? { you: S.captain, them: match.rivalCaptain } : undefined,
          ourRelics:S.relics,theirRelics:S.rivalRelics,
          frames: true,
        });
        phase = {
          kind: 'battle',
          round: S.round,
          frames: r.frames,
          winner: r.winner === 'us' ? 'you' : r.winner,
        };
        if (season >= 3) {
          // The live result supplies exact public boards, including equipment. A mock
          // without this endpoint silently benchmarks the lossy frame fallback instead.
          const replayUnit = (u) => ({ ...u, botId: botId(u.name), ...(u.fusedWith ? {fusedWith:u.fusedWith} : {}), tempAtk: 0 });
          match.replayRounds.push({ round: S.round, you: us.map(replayUnit),
            them: them.map(replayUnit), winner: phase.winner, frames: r.frames });
        }
        return envelope();
      }
      case 'battleDone': {
        if (phase.kind !== 'battle') throw new Error(`battleDone while phase=${phase.kind}`);
        const w = phase.winner;
        match.results.push(w);
        stats.rounds.push({ matchId: match.id, round: phase.round, winner: w });
        if (suddenDeathEnabled) match.kept = addKept(match.kept, phase.frames.at(-1));
        if (suddenDeathEnabled && phase.round === 3) {
          match.suddenDeath = decideSuddenDeath(w, match.kept);
          if (season >= 3) match.replayRounds.at(-1).suddenDeath = structuredClone(match.suddenDeath);
        }
        const calledWinner = match.suddenDeath?.winner || w;
        if (calledWinner === 'you') match.wins.you += 1;
        else if (calledWinner === 'them') match.wins.them += 1;
        match.toSuddenDeath = match.toSuddenDeath || suddenDeathEnabled && phase.round === 2
          && match.wins.you === match.wins.them;
        const last = phase.round >= 3 || match.wins.you >= 2 || match.wins.them >= 2
          || phase.round === 2 && !match.toSuddenDeath;
        if (last) finishMatch();
        else nextShop();
        return envelope();
      }
      default: {
        if (phase.kind !== 'shop') throw new Error(`${action.type} while phase=${phase.kind}`);
        const why = shopModel.legal(S, action);
        if (why !== true) {
          stats.illegal += 1;
          throw new Error(`invalid_action: ${why}`);
        }
        S = action.type === 'reroll' || action.type === 'pickRelic' && action.relic === 'earlyAccess' ? rollShop(shopModel.apply(S, action)) : shopModel.apply(S, action);
        return envelope();
      }
    }
  }

  async function getCatalog() {
    return catalog.getCatalog();
  }
  async function getMe() {
    return { xHandle: 'mockbot', season: { rating: 1000 } };
  }
  async function getLeaderboard() {
    return { entries: [{ rank: 1, xHandle: 'mockbot', rating: 1000, isYou: true }] };
  }
  async function playerMatches() {
    return { data: [] };
  }
  async function getPublicMatchDetail(id) {
    return publicReplays.has(id) ? structuredClone(publicReplays.get(id)) : null;
  }
  function setDryRun(v) {
    dry = !!v;
    return dry;
  }

  return {
    observe,
    act,
    getCatalog,
    getMe,
    getLeaderboard,
    playerMatches,
    getPublicMatchDetail,
    setDryRun,
    isDryRun: () => dry,
    getLast: () => envelope(),
    stats,
    ghosts,
    // test hooks
    _state: () => S,
    _phase: () => phase,
    _bumpVersion: () => (version += 1),
  };
}

module.exports = { create, loadGhosts, mulberry32 };
