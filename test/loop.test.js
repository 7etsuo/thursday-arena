'use strict';
/**
 * End-to-end: the real loop, the real book/target/shop_model/sim, against test/mock_arena.js.
 *
 * The mock is the engine offline (real shop reducer, real battle sim, real recorded ghosts), so
 * "the loop played 8 matches" here means the same thing it means live, minus the network.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mockArena = require('./mock_arena');
const loop = require('../driver/play_loop');
const bookLib = require('../lib/book');
const telemetryLib = require('../lib/telemetry');
const shopModel = require('../lib/shop_model');
const sim = require('../lib/sim');
const catalog = require('../lib/catalog');
const planner = require('../lib/planner');   // the real planner, never a stub

const ROOT = path.join(__dirname, '..');

// ------------------------------------------------------------------ harness

test('unsupported season stops before starting, including a stale previous-season result', async () => {
  for (const reported of [true, false]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-season-guard-'));
    try {
      let posts = 0;
      const arena = { observe: async () => ({ state: { season: reported ? 4 : 5,
        phase: { kind: reported ? 'result' : 'idle' } } }), act: async () => { posts++; } };
      if (reported) arena.getSeason = async () => 5;
      await assert.rejects(loop.run({ arena, start: true, games: 1,
        book: bookLib.open(path.join(dir, 'book.json'), { empty: true }),
        telemetry: { event() {}, close() {} }, prevHandle: null }), /Season 5 is not supported/);
      assert.equal(posts, 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arena-loop-'));
}

/**
 * COLD by default: the mock's ghosts are corpus boards and memory/book.json is built from the same
 * corpus, so a warm book hands the planner the exact enemy board and the win rate is meaningless.
 * Cold means the loop starts knowing nothing and learns inside the run, which is also the harder
 * test of the loop (an empty target must still produce a legal, full board).
 */
let warmSeed;
function seededBook(dir, warm) {
  const file = path.join(dir, 'book.json');
  // Protocol tests must work on a clean installation and must not depend on
  // whichever opponents happen to be present in the user's live memory.
  if (warm) {
    if (!warmSeed) {
      const seed = bookLib.open(file, { empty: true, seeded: true });
      const rows = fs.readFileSync(path.join(ROOT, 'data/corpus/battles.jsonl'), 'utf8')
        .trim().split('\n').map(JSON.parse).filter(r=>r.handle && r.handle.toLowerCase() !== 'ai')
        .sort((a,b)=>a.ts.localeCompare(b.ts));
      for (const r of rows) seed.record({ season:r.s2 ? 2 : 1, handle:r.handle, round:r.round,
        board:r.them, seats:r.seats, ts:r.ts, matchId:r.mid });
      warmSeed = JSON.stringify(seed.data());
    }
    fs.writeFileSync(file, warmSeed);
  }
  return bookLib.open(file, { empty: !warm });
}

async function playMatches(n, opts = {}) {
  const dir = tmpdir();
  const arena = mockArena.create({
    seed: opts.seed == null ? 7 : opts.seed,
    season: opts.season || 1,
    aiMatch: opts.aiMatch,
  });
  const book = seededBook(dir, !!opts.warm);
  const telemetry = telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'testtest1234' });
  const out = await loop.run({
    arena,
    planner,
    book,
    telemetry,
    start: true,
    games: n,
    seed: 99,
    timeBudgetMs: opts.timeBudgetMs || 400,
    prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json'),
    ...opts.run,
  });
  return { out, arena, book, telemetry, dir };
}

test('Season 3 loop drafts a captain and books the exact public item board once', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ season: 3, seed: 123 });
  const replayUnit = { botId: catalog.byName('Cooper').id, atk: 2, tempAtk: 2,
    hp: 5, honey: false, item: 'foamPad' };
  arena.getPublicMatchDetail = async (id) => ({ id,
    opponent: { x_handle: arena.stats.matches.find((m) => m.id === id).handle },
    player: { x_handle: 'self' },
    rounds: [{ round: 0, them: [replayUnit] }],
  });
  const book = bookLib.open(path.join(dir, 'book.json'), { empty: true });
  const out = await loop.run({ arena, planner, book,
    telemetry: telemetryLib.open({ dir: path.join(dir, 'log') }),
    start: true, games: 1, seed: 99, timeBudgetMs: 300, prevHandle: null,
    lastOpponentFile: path.join(dir, 'last.json') });
  assert.equal(out.games, 1);
  assert.equal(arena.stats.illegal, 0);
  assert.equal(arena.stats.actions.pickCaptain, 1);
  const handle = arena.stats.matches[0].handle;
  const rows = book.lookup(3, handle, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].n, 1);
  assert.equal(rows[0].board[0].item, 'foamPad');
  assert.equal(rows[0].board[0].atk, 4);
  const logs = fs.readFileSync(path.join(dir, 'log', 'LATEST'), 'utf8').trim();
  assert.ok(fs.readFileSync(logs, 'utf8').includes('"source":"public_replay"'));
});

test('Season 3 saves completed round evidence when the next server action fails', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ season: 3, seed: 123 });
  const act = arena.act;
  arena.act = async (action, version) => {
    if (action.type === 'battleDone') throw new Error('connection lost after battle');
    return act(action, version);
  };
  const file = path.join(dir, 'book.json');
  await assert.rejects(() => loop.run({ arena, planner, bookFile: file,
    logDir: path.join(dir, 'log'), start: true, games: 1, seed: 99,
    timeBudgetMs: 300, prevHandle: null, lastOpponentFile: path.join(dir, 'last.json') }),
  /connection lost after battle/);
  const st = (await arena.observe()).state;
  const rows = bookLib.open(file).lookup(3, st.opponentHandle, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].n, 1, 'the completed round survives an error before result');
});

test('Season 3 retries replay publication and learns equipment after a completed loss', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ season: 3, seed: 123 });
  const observe = arena.observe;
  arena.observe = async () => {
    const env = await observe();
    if (env.state.phase.kind === 'result') env.state.wins = { you: 0, them: 2 };
    return env;
  };
  let reads = 0;
  arena.getPublicMatchDetail = async (id) => {
    if (++reads === 1) return null;
    return { id, opponent: { x_handle: arena.stats.matches[0].handle },
      rounds: [{ round: 0, them: [{ botId: catalog.byName('Cooper').id,
        atk: 2, hp: 5, item: 'foamPad' }] }] };
  };
  const naps = [];
  const file = path.join(dir, 'book.json');
  const out = await loop.run({ arena, planner, bookFile: file,
    logDir: path.join(dir, 'log'), start: true, games: 1, seed: 99,
    timeBudgetMs: 300, prevHandle: null, lastOpponentFile: path.join(dir, 'last.json'),
    sleep: async (ms) => naps.push(ms) });
  assert.equal(out.losses, 1);
  assert.equal(reads, 2);
  assert.deepEqual(naps, [500]);
  const reopened = bookLib.open(file);
  const handle = arena.stats.matches[0].handle;
  const rows = reopened.lookup(3, handle, 0);
  assert.equal(rows[0].n, 1);
  assert.equal(rows[0].board[0].item, 'foamPad');
  const target = require('../lib/target').build({ book: reopened, season: 3, round: 0, handle });
  assert.ok(target.entries.some((e) => e.source === 'book' && e.board[0].item === 'foamPad'));
});

test('practice match limit stops AI play without learning or starting a rated game', async () => {
  const { out, arena, book } = await playMatches(1, {
    seed: 41, season: 3, aiMatch: () => true,
    run: { stopAfterMatches: 1, sleep: async () => { throw new Error('must stop before requeue'); } },
  });
  assert.equal(out.exitReason, 'matches_done');
  assert.equal(out.games, 0);
  assert.equal(out.aiMatches, 1);
  assert.equal(arena.stats.matches.length, 1);
  assert.equal(book.stats().observations, 0);
});

// ------------------------------------------------------------------ mock arena

test('mock arena: start opens a round-0 shop with 10 gold and 3 offers', async () => {
  const a = mockArena.create({ seed: 1 });
  let env = await a.observe();
  assert.equal(env.state.phase.kind, 'idle');
  env = await a.act({ type: 'start' });
  assert.equal(env.state.phase.kind, 'shop');
  assert.equal(env.state.phase.round, 0);
  assert.equal(env.state.gold, 10);
  assert.equal(env.state.shop.pets.length, 3);
  assert.ok(env.state.shop.pets.every((p) => p && p.cost === 3), 'R0 offers are commons');
  assert.ok(['apple', 'honey'].includes(env.state.shop.food), 'R0 food is apple or honey');
  assert.equal(env.state.opponentHandle, undefined, 'handle hidden during the R0 shop');
});

test('mock arena: illegal actions throw, lifecycle actions are refused mid-match', async () => {
  const a = mockArena.create({ seed: 2 });
  await a.act({ type: 'start' });
  await assert.rejects(() => a.act({ type: 'sell', boardIndex: 0 }), /invalid_action/);
  await assert.rejects(() => a.act({ type: 'start' }), /start while phase=shop/);
  await assert.rejects(() => a.act({ type: 'restart' }), /restart while phase=shop/);
  await assert.rejects(() => a.act({ type: 'battleDone' }), /battleDone while phase=shop/);
});

test('mock arena: a stale version is a conflict and applies nothing', async () => {
  const a = mockArena.create({ seed: 3 });
  const env = await a.act({ type: 'start' });
  const before = env.state.gold;
  const res = await a.act({ type: 'buy', shopIndex: 0 }, env.version - 5);
  assert.equal(res.conflict, true);
  assert.equal(res.state.gold, before, 'nothing was applied');
});

test('mock arena: a full series ends at 2 wins or after round 2, with elo', async () => {
  const a = mockArena.create({ seed: 4 });
  let env = await a.act({ type: 'start' });
  for (let i = 0; i < 40 && env.state.phase.kind !== 'result'; i++) {
    const kind = env.state.phase.kind;
    if (kind === 'shop') {
      const S = shopModel.normalize(env.state);
      if (S.board.length < 3 && shopModel.legal(S, { type: 'buy', shopIndex: 0 }) === true) {
        env = await a.act({ type: 'buy', shopIndex: 0 });
        continue;
      }
      env = await a.act({ type: 'endShop' });
    } else if (kind === 'battle') {
      assert.ok(env.state.phase.frames.length >= 1);
      env = await a.act({ type: 'battleDone' });
    }
  }
  assert.equal(env.state.phase.kind, 'result');
  const w = env.state.wins;
  assert.ok(w.you === 2 || w.them === 2 || w.you + w.them + env.state.results.filter((r) => r === 'draw').length === 3);
  assert.ok([16, -16, 0].includes(env.state.eloDelta));
  assert.equal(a.stats.matches.length, 1);
});

// ------------------------------------------------------------------ e2e

test('e2e: the loop plays a batch and holds every invariant', async () => {
  const GAMES = 30;
  const { out, arena, book, telemetry, dir } = await playMatches(GAMES);

  assert.equal(out.games, GAMES, 'played the requested number of matches');
  assert.equal(out.exitReason, 'games_done');
  assert.equal(arena.stats.illegal, 0, 'no illegal action reached the server');

  // start/restart only from result/idle: the mock throws otherwise, and there is exactly one
  // lifecycle action per match.
  const lifecycle = (arena.stats.actions.start || 0) + (arena.stats.actions.restart || 0);
  assert.equal(lifecycle, GAMES);

  // Always field 3 units when a third unit is affordable.
  assert.ok(arena.stats.endShops.length >= GAMES * 2, `${arena.stats.endShops.length} shops played`);
  for (const s of arena.stats.endShops) {
    assert.ok(s.units >= 1, 'never fights empty');
    if (s.units < 3) {
      assert.ok(s.goldLeft < s.cheapestOffer, `short board at r${s.round} with ${s.goldLeft} gold and a ${s.cheapestOffer} offer`);
    }
  }

  // Gold is spent: at R0 three commons cost 9 of the 10, so a full board leaves at most 1.
  for (const s of arena.stats.endShops) {
    if (s.round === 0 && s.units === 3) assert.ok(s.goldLeft <= 1, `r0 left ${s.goldLeft} gold`);
  }

  // The book learned the ghosts it fought.
  const stats = book.stats();
  assert.ok(stats.observations > 0 && stats.keys > 0);
  assert.ok(fs.existsSync(book.file), 'book persisted');

  // Telemetry: one stream, every event type present.
  const lines = fs.readFileSync(telemetry.file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const types = new Set(lines.map((l) => l.type));
  for (const want of ['session_start', 'match_start', 'shop', 'act', 'battle', 'result', 'session_end']) {
    assert.ok(types.has(want), `telemetry has ${want}`);
  }
  assert.ok(lines.every((l) => l.code === 'testtest1234' && l.session === telemetry.session));
  assert.deepEqual(lines.map((l) => l.seq), lines.map((_, i) => i), 'seq is dense and ordered');
  const shops = lines.filter((l) => l.type === 'shop');
  assert.ok(shops.every((l) => l.round != null && l.gold != null && 'food' in l && l.target), 'shop events are complete');
  const acts = lines.filter((l) => l.type === 'act');
  assert.ok(
    acts.length > 0 && acts.every((l) => l.action || l.plannerLog || l.catalogRefresh),
    'act events name an action, a planner note or a catalog refresh'
  );
  assert.ok(acts.some((l) => l.action && l.action.type === 'endShop'));
  // The live catalog is refreshed once per run, or the bot is blind to a new season (review R1-02).
  assert.equal(acts.filter((l) => l.catalogRefresh === 'session_start').length, 1);

  // R0 gets exactly one reroll: the only thing enforcing it live is the driver's own counter, and
  // nothing used to notice when it was removed (review R3-1).
  const perShopRerolls = new Map();
  for (const l of acts) {
    if (!l.action || l.action.type !== 'reroll') continue;
    const k = `${l.round}`;
    if (l.round === 0) perShopRerolls.set(k, (perShopRerolls.get(k) || 0) + 1);
  }
  const r0Rerolls = [];
  let curMatch = null;
  let seen = 0;
  for (const l of lines) {
    if (l.type === 'match_start') { if (curMatch) r0Rerolls.push(seen); curMatch = l.matchId; seen = 0; }
    if (l.type === 'act' && l.action && l.action.type === 'reroll' && l.round === 0) seen += 1;
  }
  if (curMatch) r0Rerolls.push(seen);
  assert.equal(r0Rerolls.length, GAMES, 'one R0 shop per match');
  assert.ok(r0Rerolls.every((n) => n <= 1), `an R0 shop rerolled more than once: ${r0Rerolls}`);
  assert.ok(r0Rerolls.some((n) => n === 1), 'the R0 reroll policy never fired, so the cap is untested');
  const battles = lines.filter((l) => l.type === 'battle');
  assert.ok(battles.every((l) => Array.isArray(l.frames) && l.frames.length && Array.isArray(l.them)));
  assert.equal(lines.filter((l) => l.type === 'result').length, GAMES);
  assert.equal(fs.readFileSync(path.join(dir, 'log', 'LATEST'), 'utf8').trim(), telemetry.file);

  // The R0 buffer really fired: some battles were recorded before the handle was known.
  assert.ok(battles.some((l) => l.round === 0 && !l.handle), 'R0 handle is hidden and buffered');
  assert.ok(book.lookup(1, arena.stats.matches[0].handle, 0).length > 0, 'the buffered R0 board landed in the book');

  // Mock win rate and the per-round score (win 1 / draw 0.5 / loss 0), which is the quantity the
  // audit reports; the match rate alone hides which round is losing.
  const wr = (out.wins + 0.5 * out.draws) / out.games;
  const per = [0, 1, 2].map((r) => {
    const rows = arena.stats.rounds.filter((x) => x.round === r);
    const sc = rows.reduce((a, x) => a + (x.winner === 'you' ? 1 : x.winner === 'them' ? 0 : 0.5), 0);
    return { r, n: rows.length, score: rows.length ? sc / rows.length : null };
  });
  const all = arena.stats.rounds;
  const allScore =
    all.reduce((a, x) => a + (x.winner === 'you' ? 1 : x.winner === 'them' ? 0 : 0.5), 0) / all.length;
  assert.equal(all.length, out.rounds, 'every round the loop saw was a round the mock resolved');
  console.log(
    `[mock arena] planner=lib/planner.js cold book, ${out.games} matches: ` +
      `W${out.wins} L${out.losses} D${out.draws} matchScore=${wr.toFixed(3)} elo=${out.elo} ` +
      `actions=${out.actions}`
  );
  console.log(
    `[mock arena] per-round score: ` +
      per.map((p) => `R${p.r} ${p.score == null ? '-' : p.score.toFixed(3)} (n=${p.n})`).join('  ') +
      `  ALL ${allScore.toFixed(3)} (n=${all.length})`
  );
});

test('e2e: season 2 — seat rules reach the planner, the sim and the book', async () => {
  // warm: an empty target scores every board 0, which would exercise the plumbing but not the
  // planner. A warm book makes the seat-rule sim path actually decide the seating here.
  const { out, arena, book, telemetry } = await playMatches(4, { seed: 31, season: 2, warm: true });
  assert.equal(out.games, 4);
  assert.equal(arena.stats.illegal, 0);

  const lines = fs.readFileSync(telemetry.file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const shops = lines.filter((l) => l.type === 'shop');
  assert.ok(shops.length >= 8);
  for (const s of shops) {
    assert.ok(s.seats, `r${s.round} shop carries seat rules`);
    // state.seats holds all three from round 0 (the seatShop only *reveals* one more each round,
    // docs/ENGINE_BATTLE.md §"zod schemas"); the sim is what restricts them to seats 0..round.
    for (const seat of ['front', 'middle', 'back']) {
      assert.ok(sim.SEAT_RULES.includes(s.seats[seat]), `${s.seats[seat]} is a rule id, not a display name`);
    }
  }
  assert.ok(lines.filter((l) => l.type === 'battle').every((l) => l.seats && l.seats.front));
  assert.ok(book.stats().observations > 0);
});

test('seat rules: display names map to sim ids, unknown ones are dropped', () => {
  const st = {
    seatShop: [
      { seat: 'front', revealed: true, name: 'Hot seat' },
      { seat: 'middle', revealed: true, name: 'Warm-up' },
      { seat: 'back', revealed: false, name: 'Encore' },
    ],
  };
  assert.deepEqual(shopModel.seatsFrom(st), { front: 'hot_seat', middle: 'warm_up' });
  assert.equal(shopModel.seatsFrom({ seats: { front: 'Season 3 mystery rule' } }), null);
  assert.equal(shopModel.seatsFrom({}), null);
  // state.seats wins over the seatShop display row, and both resolve to the same id.
  assert.deepEqual(shopModel.seatsFrom({ seats: { back: 'hard_hat' }, ...st }).back, 'hard_hat');
});

test('e2e: --dry sends nothing', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ seed: 11 });
  await arena.act({ type: 'start' }); // put a shop on the table, then watch only what the loop does
  const before = arena.stats.posts;
  // Counting posts would pass even if lib/arena.js swallowed the action somewhere else. This
  // arena THROWS on every mutation, so a dry run that is not truly silent fails loudly.
  const sent = [];
  const noMutations = {
    ...arena,
    observe: (...a) => arena.observe(...a),
    async act(action) {
      sent.push(action);
      throw new Error(`dry run sent a mutation: ${action.type}`);
    },
  };
  const out = await loop.run({
    arena: noMutations,
    planner,
    book: bookLib.open(path.join(dir, 'book.json'), { empty: true }),
    telemetry: telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'dry' }),
    dry: true,
    games: 1,
    seed: 5,
    prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json'),
  });
  assert.deepEqual(sent, [], 'a dry run reached act() zero times');
  assert.equal(arena.stats.posts, before, 'no action was sent');
  assert.equal(out.actions, 0);
  assert.equal(out.exitReason, 'dry');
});

test('e2e: a version conflict is replanned, not swallowed', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ seed: 21 });
  let acts = 0;
  const flaky = {
    ...arena,
    async act(a, v) {
      acts += 1;
      if (acts === 3) return { ...(await arena.observe()), conflict: true, action: a };
      return arena.act(a, v);
    },
  };
  const out = await loop.run({
    arena: flaky,
    planner,
    book: bookLib.open(path.join(dir, 'book.json'), { empty: true }),
    telemetry: telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'conflict' }),
    start: true,
    games: 1,
    seed: 5,
    prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json'),
  });
  assert.equal(out.games, 1);
  assert.equal(arena.stats.illegal, 0);
});

test('loop: a conflicting endShop does not learn from a stale board', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ seed: 21 });
  let intercepted = false;
  const concurrent = {
    ...arena,
    async act(action) {
      if (action.type === 'endShop' && !intercepted) {
        intercepted = true;
        await arena.act({ type: 'sell', boardIndex: 0 }); // another actor changed the board
        await arena.act({ type: 'endShop' });
        return { ...(await arena.observe()), conflict: true };
      }
      return arena.act(action);
    },
  };
  const book = bookLib.open(path.join(dir, 'book.json'), { empty: true });
  const telemetry = telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'stale-end' });
  const out = await loop.run({ arena: concurrent, planner, book, telemetry,
    start: true, games: 1, seed: 5, timeBudgetMs: 100, prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json') });
  const lines = fs.readFileSync(telemetry.file, 'utf8').trim().split('\n').map(JSON.parse);
  const r0 = lines.find((x) => x.type === 'battle' && x.round === 0);
  assert.equal(intercepted, true);
  assert.equal(out.games, 1);
  assert.equal(r0.inputMissing, 'confirmed_us_board');
  assert.deepEqual(r0.us, []);
  assert.deepEqual(r0.them, []);
  assert.equal(book.lookup(1, arena.stats.matches[0].handle, 0).length, 0,
    'unknown opponent board must not poison the book');
});

test('loop: a shop action conflict that reveals battle stops before seating', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ seed: 21 });
  let intercepted = false;
  let seated = false;
  const concurrent = {
    ...arena,
    async act(action) {
      if (action.type === 'buy' && !intercepted) {
        intercepted = true;
        for (let shopIndex = 0; shopIndex < 3; shopIndex++) await arena.act({ type: 'buy', shopIndex });
        await arena.act({ type: 'endShop' });
        return { ...(await arena.observe()), conflict: true };
      }
      return arena.act(action);
    },
  };
  const scripted = {
    planStep: () => ({ done: false, actions: [{ type: 'buy', shopIndex: 0 }], reason: 'test' }),
    seatingActions: () => { seated = true; return [{ type: 'move', boardIndex: 1, dir: -1 }]; },
    utility: planner.utility,
  };
  const out = await loop.run({ arena: concurrent, planner: scripted,
    book: bookLib.open(path.join(dir, 'book.json'), { empty: true }),
    telemetry: telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'shop-conflict' }),
    start: true, games: 1, maxSteps: 2, seed: 5, timeBudgetMs: 100, prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json') });
  assert.equal(intercepted, true);
  assert.equal(seated, false, 'the old shop must not request a move in battle');
  assert.equal(arena.stats.illegal, 0);
  assert.equal(out.games, 0);
});

test('loop: a rejected first action does not claim another actor’s completed match', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ seed: 21 });
  let intercepted = false;
  const concurrent = {
    ...arena,
    async act(action) {
      if (action.type === 'buy' && !intercepted) {
        intercepted = true;
        let env = await arena.observe();
        while (env.state.phase.kind !== 'result') {
          if (env.state.phase.kind === 'shop') {
            while (env.state.board.length < 3) {
              const slot = env.state.shop.pets.findIndex((o) => o);
              env = await arena.act({ type: 'buy', shopIndex: slot });
            }
            env = await arena.act({ type: 'endShop' });
          } else env = await arena.act({ type: 'battleDone' });
        }
        return { ...env, conflict: true };
      }
      return arena.act(action);
    },
  };
  const scripted = { ...planner,
    planStep: () => ({ done: false, actions: [{ type: 'buy', shopIndex: 0 }], reason: 'test' }) };
  const telemetry = telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'unowned-result' });
  const out = await loop.run({ arena: concurrent, planner: scripted,
    book: bookLib.open(path.join(dir, 'book.json'), { empty: true }), telemetry,
    start: true, games: 1, maxSteps: 3, seed: 5, timeBudgetMs: 100, prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json') });
  const lines = fs.readFileSync(telemetry.file, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(intercepted, true);
  assert.equal(out.games, 0);
  assert.equal(lines.filter((x) => x.staleResult).length, 1);
});

test('loop: an inherited battle is not learned from without a confirmed board', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ seed: 21 });
  await arena.act({ type: 'start' });
  for (let shopIndex = 0; shopIndex < 3; shopIndex++) await arena.act({ type: 'buy', shopIndex });
  await arena.act({ type: 'endShop' }); // another process played this shop
  const book = bookLib.open(path.join(dir, 'book.json'), { empty: true });
  const telemetry = telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'inherited-battle' });
  const out = await loop.run({ arena, planner, book, telemetry,
    start: true, games: 1, seed: 5, timeBudgetMs: 100, prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json') });
  const lines = fs.readFileSync(telemetry.file, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(out.games, 1, 'the process may play the later shop in this match');
  assert.equal(lines.find((x) => x.type === 'battle').inputMissing, 'confirmed_us_board');
  assert.equal(book.lookup(1, arena.stats.matches[0].handle, 0).length, 0);
});

test('loop: a late server match ID keeps one complete battle and book write per round', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ seed: 17 });
  let revealOnObserve = false;
  let revealed = false;
  const hideId = (env) => {
    if (!env?.state) return env;
    const r0 = env.state.phase?.round === 0;
    return { ...env, state: { ...env.state,
      matchId: revealed ? env.state.matchId : undefined,
      opponentHandle: r0 ? undefined : env.state.opponentHandle,
    } };
  };
  const lateId = {
    ...arena,
    async observe() {
      const env = await arena.observe();
      if (revealOnObserve) revealed = true;
      return hideId(env);
    },
    async act(action) {
      const env = await arena.act(action);
      // The endShop response has already been recorded by the driver with the local ID. Reveal
      // the real ID on the following battle observe, reproducing the live duplicate-write path.
      if (action.type === 'endShop' && env.state.phase.kind === 'battle' && env.state.phase.round === 1) {
        revealOnObserve = true;
      }
      return hideId(env);
    },
  };
  const book = bookLib.open(path.join(dir, 'book.json'), { empty: true });
  const telemetry = telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'late-id' });
  const out = await loop.run({
    arena: lateId, planner, book, telemetry, start: true, games: 1,
    seed: 99, timeBudgetMs: 400, prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json'),
  });
  const lines = fs.readFileSync(telemetry.file, 'utf8').trim().split('\n').map(JSON.parse);
  const battles = lines.filter((x) => x.type === 'battle');
  const starts = lines.filter((x) => x.type === 'match_start');
  const identified = lines.filter((x) => x.type === 'match_identified');
  const results = lines.filter((x) => x.type === 'result');
  assert.equal(out.games, 1);
  assert.equal(starts.length, 1);
  assert.equal(identified.length, 1, 'one local-to-real ID promotion');
  assert.equal(identified[0].oldMatchId, starts[0].matchId);
  assert.equal(identified[0].serverMatchId, arena.stats.matches[0].id);
  assert.equal(results.length, 1);
  assert.equal(results[0].matchId, arena.stats.matches[0].id);
  assert.equal(battles.length, arena.stats.rounds.length, 'no terminal battle duplicate');
  assert.equal(out.rounds, arena.stats.rounds.length, 'summary counts unique rounds');
  assert.equal(new Set(battles.map((x) => x.round)).size, battles.length);
  assert.ok(battles.every((x) => x.us.length === 3 && x.them.length > 0));
  assert.equal(battles[0].handle, null, 'R0 handle was hidden through the battle');
  assert.equal(book.stats().observations, battles.length, 'one learned enemy board per round');
  assert.ok(book.lookup(1, arena.stats.matches[0].handle, 0).length > 0, 'hidden R0 board flushed');
  assert.ok(lines.filter((x) => ['match_start', 'match_identified', 'shop', 'battle', 'result'].includes(x.type))
    .every((x) => x.matchKey === starts[0].matchKey), 'stable key joins local and real IDs');
});

test('loop: a round-two ID reveal does not duplicate the final battle', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ seed: 1 }); // deterministic three-round match
  let revealOnObserve = false;
  let revealed = false;
  const lateId = {
    ...arena,
    async observe() {
      const env = await arena.observe();
      if (revealOnObserve) revealed = true;
      return revealed ? env : { ...env, state: { ...env.state, matchId: undefined } };
    },
    async act(action) {
      const env = await arena.act(action);
      if (action.type === 'endShop' && env.state.phase.kind === 'battle' && env.state.phase.round === 2) {
        revealOnObserve = true;
      }
      return revealed ? env : { ...env, state: { ...env.state, matchId: undefined } };
    },
  };
  const book = bookLib.open(path.join(dir, 'book.json'), { empty: true });
  const telemetry = telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'late-id-r2' });
  const out = await loop.run({
    arena: lateId, planner, book, telemetry, start: true, games: 1,
    seed: 99, timeBudgetMs: 100, prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json'),
  });
  const lines = fs.readFileSync(telemetry.file, 'utf8').trim().split('\n').map(JSON.parse);
  const battles = lines.filter((x) => x.type === 'battle');
  assert.equal(arena.stats.rounds.length, 3, 'fixture reached round two');
  assert.equal(lines.filter((x) => x.type === 'match_identified').length, 1);
  assert.deepEqual(battles.map((x) => x.round), [0, 1, 2]);
  assert.ok(battles.every((x) => x.us.length === 3));
  assert.equal(out.rounds, 3);
  assert.equal(book.stats().observations, 3);
});

test('loop: a rejected reroll keeps its allowance and logs the actual post-action state', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ seed: 7 });
  await arena.act({ type: 'start' });
  let rejected = false;
  const flaky = {
    ...arena,
    async act(action) {
      if (action.type === 'reroll' && !rejected) {
        rejected = true;
        return { ...(await arena.observe()), conflict: true, action };
      }
      return arena.act(action);
    },
  };
  const seen = [];
  const spy = { ...planner, planStep(S, pctx) {
    if (S.round === 0) seen.push(S.rerolls);
    return planner.planStep(S, pctx);
  } };
  const telemetry = telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'reroll-409' });
  const out = await loop.run({
    arena: flaky, planner: spy, book: seededBook(dir, true), telemetry,
    games: 1, seed: 99, timeBudgetMs: 400, prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json'),
  });
  const lines = fs.readFileSync(telemetry.file, 'utf8').trim().split('\n').map(JSON.parse);
  const rerolls = lines.filter((x) => x.type === 'act' && x.action && x.action.type === 'reroll' && x.round === 0);
  assert.equal(out.games, 1);
  assert.equal(rejected, true, 'test actually rejected a reroll');
  assert.equal(rerolls[0].accepted, false);
  assert.equal(rerolls[0].conflict, true);
  assert.equal(rerolls[0].after.rerolls, 0, 'rejected action did not spend the allowance');
  assert.ok(seen.filter((n) => n === 0).length >= 2, 'planner saw the unused allowance again');
  assert.ok(rerolls.filter((x) => x.accepted).every((x) => x.after.rerolls === 1));
  assert.equal(arena.stats.actions.reroll || 0, rerolls.filter((x) => x.accepted).length,
    'the mock engine receives only accepted rerolls');
  assert.ok(lines.filter((x) => x.type === 'act' && x.accepted === true && x.action.type !== 'endShop')
    .every((x) => x.after && Array.isArray(x.after.board) && Array.isArray(x.after.offers)),
  'accepted shop actions carry normalized post-action state');
});

// ------------------------------------------------------------------ lib/arena.js transport
//
// arena.js calls cdp.arenaFetch(path, opts) by property lookup, so stubbing that one function
// exercises the whole module offline. Nothing here touches the live game.

const cdp = require('../lib/cdp');
const arenaLib = require('../lib/arena');

function stubFetch(handler) {
  const real = cdp.arenaFetch;
  const calls = [];
  cdp.arenaFetch = async (p, o = {}) => {
    calls.push({ path: p, method: o.method || 'GET', body: o.body });
    return handler(calls.length, p, o);
  };
  return {
    calls,
    restore() {
      cdp.arenaFetch = real;
    },
  };
}

const res = (status, json, text) => ({ status, ok: status >= 200 && status < 300, json, text: text || '' });
const shopEnv = (version) => ({ state: { phase: { kind: 'shop', round: 0 }, gold: 10, version }, version });

test('arena: observe remembers the version and act sends it', async () => {
  const s = stubFetch((n) => (n === 1 ? res(200, shopEnv(42)) : res(200, shopEnv(43))));
  try {
    arenaLib.setDryRun(false);
    await arenaLib.observe();
    await arenaLib.act({ type: 'buy', shopIndex: 1 });
    assert.equal(s.calls[1].method, 'POST');
    assert.deepEqual(s.calls[1].body, { action: { type: 'buy', shopIndex: 1 }, version: 42 });
    assert.equal(arenaLib.getLast().version, 43);
  } finally {
    s.restore();
  }
});

test('arena: 409 is a conflict — refetch, report it, apply nothing', async () => {
  const s = stubFetch((n) => {
    if (n === 1) return res(200, shopEnv(42));
    if (n === 2) return res(409, { error: 'stale_version', state: { gold: 999 } }, 'stale_version');
    return res(200, shopEnv(77));
  });
  try {
    arenaLib.setDryRun(false);
    await arenaLib.observe();
    const r = await arenaLib.act({ type: 'reroll' });
    assert.equal(r.conflict, true);
    assert.equal(r.version, 77, 'the caller gets the refetched state, not the 409 body');
    assert.equal(r.state.gold, 10);
    assert.equal(s.calls.length, 3, 'observe, the rejected POST, the refetch');
  } finally {
    s.restore();
  }
});

test('arena: 429 and 5xx back off and then throw a typed error', async () => {
  const waits = [];
  // 429 has its own, longer schedule: a rate limit is the server asking us to wait, and giving up
  // after 7.75 s used to cost the whole in-flight match (review R2-09).
  arenaLib.setRetryOptions({
    retries: 3, baseMs: 100, rateRetries: 3, rateBaseMs: 1000, rateMaxMs: 60000,
    jitter: () => 1, sleep: async (ms) => waits.push(ms),
  });
  const s = stubFetch(() => res(429, null, 'slow down'));
  try {
    await assert.rejects(() => arenaLib.observe(), (e) => {
      assert.equal(e.name, 'ArenaError');
      assert.equal(e.code, 'rate_limited');
      assert.equal(e.status, 429);
      return true;
    });
    assert.deepEqual(waits, [1000, 2000, 4000], 'exponential, on the 429 schedule');
    assert.equal(s.calls.length, 4, '1 try + 3 retries');
    s.restore();

    // Retry-After wins over the schedule, in seconds and as an HTTP date.
    waits.length = 0;
    const sRA = stubFetch((n) => (n < 3
      ? { ...res(429, null, 'slow down'), headers: { 'retry-after': n === 1 ? '7' : new Date(Date.now() + 12000).toUTCString() } }
      : res(200, shopEnv(11))));
    assert.equal((await arenaLib.observe()).version, 11);
    assert.equal(waits.length, 2);
    assert.equal(waits[0], 7000, 'Retry-After seconds');
    assert.ok(Math.abs(waits[1] - 12000) <= 1500, `Retry-After date, got ${waits[1]}`);
    sRA.restore();

    waits.length = 0;
    arenaLib.setRetryOptions({ jitter: () => 0 });
    const sLong = stubFetch((n) => n === 1
      ? { ...res(429, null, 'slow down'), headers: { 'retry-after': '120' } }
      : res(200, shopEnv(12)));
    await arenaLib.observe();
    assert.deepEqual(waits, [120000], 'server minimum is neither shortened by jitter nor capped');
    sLong.restore();
    arenaLib.setRetryOptions({ jitter: () => 1 });

    waits.length = 0;
    const s2 = stubFetch((n) => (n < 3 ? res(503, null, 'nope') : res(200, shopEnv(9))));
    const env = await arenaLib.observe();
    assert.equal(env.version, 9, 'a 5xx that clears is retried through');
    assert.deepEqual(waits, [100, 200], 'the 5xx schedule is the short one');
    s2.restore();

    const s3 = stubFetch(() => res(400, { error: 'invalid_action' }, 'invalid_action'));
    await assert.rejects(() => arenaLib.act({ type: 'buy', shopIndex: 0 }, 1), /HTTP 400/);
    assert.equal(s3.calls.length, 1, '4xx is not retried');
    s3.restore();
  } finally {
    arenaLib.setRetryOptions({
      retries: 5, baseMs: 250, rateRetries: 8, rateBaseMs: 1000, rateMaxMs: 60000,
      jitter: () => 1, sleep: async () => {},
    });
  }
});

test('arena: a 200 that is not JSON is an error, never a null state', async () => {
  // The whole R2-01 chain started here: json:null with ok:true reached the loop as phase `idle`,
  // and the loop answered a mid-match 502 page with `start`.
  const s = stubFetch(() => res(200, null, '<!doctype html>502 Bad Gateway'));
  try {
    await assert.rejects(() => arenaLib.observe(), (e) => {
      assert.equal(e.name, 'ArenaError');
      assert.equal(e.code, 'http_error');
      assert.match(e.message, /non-JSON body/);
      return true;
    });
    assert.equal(s.calls.length, 1, 'a bad body is not a transport failure, so it is not retried');
  } finally {
    s.restore();
  }
});

test('arena: dry run blocks every mutation and nothing else', async () => {
  const s = stubFetch(() => res(200, shopEnv(5)));
  try {
    await arenaLib.observe();
    arenaLib.setDryRun(true);
    const before = s.calls.length;
    for (const type of arenaLib.MUTATIONS) {
      const r = await arenaLib.act({ type, shopIndex: 0, boardIndex: 0, dir: 1 });
      assert.equal(r.dryRun, true);
    }
    assert.equal(s.calls.length, before, 'no POST at all');
    await arenaLib.getMe();
    assert.equal(s.calls.length, before + 1, 'reads still happen');
  } finally {
    arenaLib.setDryRun(false);
    s.restore();
  }
});

test('arena: getCatalog merges live rows through lib/catalog.js', async () => {
  const catalog = require('../lib/catalog');
  const before = catalog.getCatalog().length;
  const s = stubFetch(() => res(200, { bots: catalog.getCatalog() }));
  try {
    const cached = await arenaLib.getCatalog();
    assert.equal(s.calls.length, 0, 'the cached catalog is used when refresh is not asked for');
    assert.equal(cached.length, before);
    const live = await arenaLib.getCatalog({ refresh: true });
    assert.equal(s.calls[0].path, '/api/catalog');
    assert.equal(live.length, before, 'merging the same rows changes nothing');
  } finally {
    s.restore();
  }
});

test('arena: getMe / getLeaderboard / playerMatches hit the documented paths', async () => {
  const s = stubFetch((n, p) => res(200, { path: p, data: [{ id: 'm1' }] }));
  try {
    assert.equal((await arenaLib.getMe()).path, '/api/me');
    assert.equal((await arenaLib.getLeaderboard()).path, '/api/leaderboard');
    await arenaLib.playerMatches('@Someone', { limit: 5 });
    assert.equal(s.calls[2].path, '/api/public/v1/matches?x_handle=Someone&limit=5');
    const d = await arenaLib.playerMatches('someone', { detail: true });
    assert.equal(d.detail.path, '/api/public/v1/matches/m1');
  } finally {
    s.restore();
  }
});

test('arena: public match detail is a bounded GET and unavailable replays return null', async () => {
  const detail = { id: 'm/3', rounds: [{ round: 0, them: [{ botId: 'bot', item: 'foamPad' }] }] };
  const s = stubFetch((n) => {
    if (n === 1) return res(200, detail);
    if (n === 2) return res(404, { error: 'not_found' });
    if (n === 3) return res(503, { error: 'unavailable' });
    if (n === 4) throw new Error('offline');
    return res(200, { error: 'not_a_replay' });
  });
  try {
    assert.equal(await arenaLib.getPublicMatchDetail(''), null);
    assert.equal(s.calls.length, 0, 'no request for an empty match id');
    assert.deepEqual(await arenaLib.getPublicMatchDetail(' m/3 '), detail);
    assert.equal(s.calls[0].path, '/api/public/v1/matches/m%2F3');
    assert.equal(s.calls[0].method, 'GET');
    assert.equal(s.calls[0].body, undefined);
    assert.equal(await arenaLib.getPublicMatchDetail('missing'), null);
    assert.equal(await arenaLib.getPublicMatchDetail('unavailable'), null);
    assert.equal(await arenaLib.getPublicMatchDetail('offline'), null);
    assert.equal(await arenaLib.getPublicMatchDetail('malformed'), null);
    assert.ok(s.calls.every((c) => c.method === 'GET'), 'replay lookups never POST');
    assert.equal(s.calls.length, 5, 'best-effort lookup makes one request per match');
  } finally {
    s.restore();
  }
});

test('lock: only a dead holder releases it, however old the lock file is', () => {
  // This test used to write a LIVE pid with an 11-minute-old ts and assert the lock was reclaimed,
  // which is exactly the bug: a `--games 15` batch cannot finish in 10 minutes, so the lock evicted
  // a healthy loop and a second rated loop started on the same account (review R2-02).
  const dir = tmpdir();
  const file = path.join(dir, 'play_loop.lock');
  const release = loop.acquireLock(file);
  assert.throws(() => loop.acquireLock(file), /already running/);
  release();

  // an ALIVE holder is never evicted, whatever the clock says
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, ts: Date.now() - 11 * 60 * 1000 }));
  assert.throws(() => loop.acquireLock(file), /already running/);
  assert.throws(() => loop.acquireLock(file), /already running/);   // and it is still there

  // a DEAD holder is reclaimed immediately, even with a fresh ts
  const dead = findDeadPid();
  fs.writeFileSync(file, JSON.stringify({ pid: dead, ts: Date.now() }));
  loop.acquireLock(file)();
  assert.equal(fs.existsSync(file), false);

  // so is a lock file we cannot read at all
  fs.writeFileSync(file, 'not json');
  loop.acquireLock(file)();
  assert.equal(fs.existsSync(file), false);
});

/** A pid nothing is using, so the test does not depend on a hardcoded number. */
function findDeadPid() {
  for (let pid = 2 ** 20; pid > 2; pid--) if (!loop.pidAlive(pid)) return pid;
  throw new Error('no free pid');
}

test('lock: touch keeps the heartbeat fresh without releasing the lock', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'play_loop.lock');
  const release = loop.acquireLock(file);
  try {
    const before = JSON.parse(fs.readFileSync(file, 'utf8'));
    release.touch();
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(after.pid, process.pid);
    assert.ok(after.ts >= before.ts);
    assert.deepEqual(fs.readdirSync(dir), ['play_loop.lock'], 'no tmp file left behind');
  } finally {
    release();
  }
});

test('loop: an unrecognised phase is re-observed, never answered with start', async () => {
  // A non-JSON 200 or a phase the server adds used to collapse to `idle`, and the idle branch POSTs
  // `start` -- abandoning a match mid-series (review R2-01).
  const dir = tmpdir();
  const sent = [];
  let version = 1;
  const weird = {
    async observe() { return { state: { phase: { kind: 'seat_draft' }, matchId: 'm1' }, version: version++ }; },
    async act(a) { sent.push(a.type); return { state: { phase: { kind: 'seat_draft' } }, version: version++ }; },
    async getCatalog() { return []; },
    setDryRun() {},
  };
  const out = await loop.run({
    arena: weird,
    planner,
    book: bookLib.open(path.join(dir, 'book.json'), { empty: true }),
    telemetry: telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'weird' }),
    start: true,
    games: 1,
    maxSteps: 4000,
    noProgressMs: 1,
    prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json'),
  });
  assert.deepEqual(sent, [], 'nothing was sent to an unrecognised phase');
  assert.equal(out.exitReason, 'unknown_phase', 'and the run gives up instead of spinning');
  assert.equal(out.games, 0);
});

test('loop: a phase that never advances stops instead of hammering the server', async () => {
  // 8000 requests as fast as the transport allows, then exitReason "done" and code 0 (review R2-05).
  const dir = tmpdir();
  let observes = 0;
  const stuck = {
    async observe() { observes += 1; return { state: { phase: { kind: 'idle' } }, version: 7 }; },
    async act() { return { state: { phase: { kind: 'idle' } }, version: 7 }; },
    async getCatalog() { return []; },
    setDryRun() {},
  };
  const out = await loop.run({
    arena: stuck,
    planner,
    book: bookLib.open(path.join(dir, 'book.json'), { empty: true }),
    telemetry: telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'stuck' }),
    start: true,
    games: 3,
    maxSteps: 4000,
    noProgressMs: 1,
    prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json'),
  });
  assert.equal(out.exitReason, 'no_progress');
  assert.ok(observes <= 12, `gave up after ${observes} observes, not 4000`);
});

test('loop: the R0 reroll count survives a re-entry into the same shop', async () => {
  // `S.rerolls` is set by the driver alone -- shop_model.normalize hardcodes 0 because the server
  // does not report it.  As a playShop local it reset on every re-entry, and an endShop that comes
  // back as a version conflict re-enters (review R3-1).
  const dir = tmpdir();
  // warm: a cold book scores every board 0, so the planner never rerolls and the counter is never
  // exercised at all.
  const book = seededBook(dir, true);
  const arena = mockArena.create({ seed: 7 });
  await arena.act({ type: 'start' });
  let endShops = 0;
  const flakyEnd = {
    ...arena,
    observe: () => arena.observe(),
    async act(a, v) {
      if (a.type === 'endShop' && endShops++ === 0) {
        return { ...(await arena.observe()), conflict: true, action: a };   // applied nothing
      }
      return arena.act(a, v);
    },
  };
  const seen = [];          // S.rerolls as the planner was handed it, in order
  const spy = { ...planner, planStep(S, ctx) { seen.push([S.round, S.rerolls]); return planner.planStep(S, ctx); } };
  await loop.run({
    arena: flakyEnd,
    planner: spy,
    book,
    telemetry: telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'reenter' }),
    games: 1,
    seed: 99,
    timeBudgetMs: 400,
    prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json'),
  });
  const r0 = seen.filter(([r]) => r === 0).map(([, n]) => n);
  assert.ok(endShops >= 2, 'the conflicting endShop really did force a re-entry');
  assert.ok(r0.includes(1), `the R0 reroll was never counted: ${JSON.stringify(r0)}`);
  // and once counted it never goes back to 0 inside the same shop
  assert.deepStrictEqual(r0.slice(r0.indexOf(1)).filter((n) => n === 0), [], `count reset: ${JSON.stringify(r0)}`);
});

test('loop: a shop the planner bailed out of short is not ended', async () => {
  // endShop used to go out on every path out of the shop loop, including a planner throw with an
  // empty board -- which is a 400 that kills the batch, or a forfeited round (review R2-03).
  const dir = tmpdir();
  const arena = mockArena.create({ seed: 41 });
  await arena.act({ type: 'start' });
  const sent = [];
  const watched = {
    ...arena,
    observe: () => arena.observe(),
    async act(a, v) { sent.push(a.type); return arena.act(a, v); },
  };
  const boom = { ...planner, planStep() { throw new Error('planner exploded'); } };
  await loop.run({
    arena: watched,
    planner: boom,
    book: bookLib.open(path.join(dir, 'book.json'), { empty: true }),
    telemetry: telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'bail' }),
    games: 1,
    maxSteps: 6,
    noProgressMs: 1,
    prevHandle: null,
    lastOpponentFile: path.join(dir, 'last_opponent.json'),
  });
  assert.ok(!sent.includes('endShop'), `endShop was sent after a bail: ${sent}`);
  assert.equal(arena._state().board.length, 0, 'the board really was empty and affordable');
});

test('arena: dry run sends nothing, including an action type it does not recognise', async () => {
  // The no-op used to be an allowlist of nine names, so a renamed or new action POSTed live
  // (review R2-07).
  const s = stubFetch(() => res(200, shopEnv(5)));
  try {
    await arenaLib.observe();
    arenaLib.setDryRun(true);
    const before = s.calls.length;
    for (const type of ['endshop', 'buyPet', 'sellPet', 'rollShop', 'toggleFreeze', 'setSeats', 'seasonThreeThing']) {
      const r = await arenaLib.act({ type, shopIndex: 0 });
      assert.equal(r.dryRun, true, type);
    }
    assert.equal(s.calls.length, before, 'no POST escaped the dry run');
  } finally {
    arenaLib.setDryRun(false);
    s.restore();
  }
});

test('telemetry: an unknown type throws, close is idempotent and carries the drop count', () => {
  const dir = tmpdir();
  const t = telemetryLib.open({ dir: path.join(dir, 'log'), codeVersion: 'tele' });
  assert.throws(() => t.event('not_a_type', {}), /unknown telemetry type not_a_type/);
  assert.equal(t.dropped, 0);
  const end = t.close({ games: 2 });
  assert.equal(end.type, 'session_end');
  assert.equal(end.dropped, 0, 'session_end always reports the drop count');
  assert.equal(t.close({ games: 2 }), null, 'a second close writes nothing');
  assert.equal(t.event('shop', {}), null, 'and no event lands after close');
});

test('telemetry: an unwritable dir counts drops instead of throwing', () => {
  // The only store for match data can lose every line; nothing used to read `dropped` (review R3-10).
  const dir = tmpdir();
  const blocked = path.join(dir, 'blocked');
  fs.writeFileSync(blocked, 'not a directory');           // mkdir over a file is EEXIST/ENOTDIR
  const errs = [];
  const realErr = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  let t;
  try {
    t = telemetryLib.open({ dir: path.join(blocked, 'log'), codeVersion: 'drops' });
    t.event('session_start', {});
    t.event('shop', { round: 0 });
    const end = t.close({ games: 0 });
    assert.equal(end.dropped, 2, 'the two events before close were counted');
  } finally {
    console.error = realErr;
  }
  assert.equal(t.file, null, 'nothing was opened');
  assert.equal(errs.length, 1, 'it complains once, not per line');
});

test('telemetry: codeVersion is stable and content-addressed', () => {
  const dir = tmpdir();
  const a = path.join(dir, 'a.js');
  fs.writeFileSync(a, 'x');
  const v1 = telemetryLib.codeVersion([a]);
  assert.match(v1, /^[0-9a-f]{12}$/);
  assert.equal(v1, telemetryLib.codeVersion([a]));
  fs.writeFileSync(a, 'y');
  assert.notEqual(v1, telemetryLib.codeVersion([a]));
  assert.match(telemetryLib.codeVersion(), /^[0-9a-f]{12}$/);
});

test('e2e: an "AI · no ghost" match is played, never learned from, and re-queued with backoff', async () => {
  const naps = [];
  // matches 2 and 3 are AI (no ghost, eloDelta null); 1, 4 and 5 are real ghosts
  const { out, arena, book, telemetry } = await playMatches(3, {
    seed: 41,
    aiMatch: (n) => n === 2 || n === 3,
    run: { sleep: async (ms) => { naps.push(ms); }, aiBackoffMs: 30000 },
  });
  const played = arena.stats.matches;
  assert.strictEqual(played.filter((m) => m.ai).length, 2, 'both AI matches were played out');
  assert.strictEqual(out.games, 3, 'AI matches do not count toward --games');
  assert.strictEqual(out.aiMatches, 2);
  assert.strictEqual(played.length, 5, '3 rated + 2 AI');
  assert.deepStrictEqual(naps, [30000, 60000], 'backoff doubles over consecutive AI matches');
  // nothing about the AI is remembered
  assert.strictEqual(book.lookup(1, 'ai', 0).length, 0);
  assert.strictEqual(book.lookup(1, 'AI', 0).length, 0);
  assert.notStrictEqual(out.prevHandle, 'ai');
  assert.strictEqual(out.prevHandle, played[4].handle, 'prevHandle is the last REAL opponent');
  // after an AI result the loop tries `start` first, then falls back to `restart`
  assert.ok(arena.stats.actions.start >= 3, `start sent from result after AI: ${JSON.stringify(arena.stats.actions)}`);
  // the AI results are in telemetry, flagged, with no elo
  const lines = fs.readFileSync(telemetry.file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const aiResults = lines.filter((e) => e.type === 'result' && e.ai);
  assert.strictEqual(aiResults.length, 2);
  assert.ok(aiResults.every((e) => e.eloDelta === null && e.opponentKind === 'ai'));
  assert.ok(lines.filter((e) => e.type === 'battle' && e.ai).length >= 2, 'AI battles are still logged');
});

test('e2e: a result screen left by the previous batch is not counted as a played game', async () => {
  const dir = tmpdir();
  const arena = mockArena.create({ seed: 51 });
  const book = seededBook(dir, false);
  const common = { arena, planner, book, start: true, seed: 5, timeBudgetMs: 400, prevHandle: null, lastOpponentFile: path.join(dir, 'last_opponent.json') };
  const t1 = telemetryLib.open({ dir: path.join(dir, 'log1'), codeVersion: 'testtest1234' });
  const first = await loop.run({ ...common, telemetry: t1, games: 1 });
  assert.strictEqual(first.games, 1);
  assert.strictEqual((await arena.observe()).state.phase.kind, 'result', 'batch 1 leaves the result screen up');
  // batch 2 opens on that result screen: it must not count it, and must play a real match of its own
  const t2 = telemetryLib.open({ dir: path.join(dir, 'log2'), codeVersion: 'testtest1234' });
  const second = await loop.run({ ...common, telemetry: t2, games: 1 });
  assert.strictEqual(second.games, 1);
  assert.strictEqual(arena.stats.matches.length, 2, 'two real matches were played in total');
  const lines = fs.readFileSync(t2.file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const results = lines.filter((e) => e.type === 'result');
  assert.strictEqual(results.length, 1, 'only its own result is recorded');
  assert.strictEqual(results[0].matchId, arena.stats.matches[1].id);
  assert.ok(lines.some((e) => e.type === 'act' && e.staleResult), 'the leftover result is logged as stale');
});

test('unlimited healthy play crosses 4,000 iterations and still stops at the requested match count', async () => {
  const dir = tmpdir(), arena = mockArena.create({ seed: 71, season: 2 });
  let observations = 0;
  const observe = arena.observe;
  arena.observe = async () => { observations++; return observe(); };
  // Isolate lifecycle testing from expensive search; all actions and battles still use the real reducer.
  const fillPlanner = {
    utility: planner.utility,
    planStep: (S) => {
      const i = S.offers.findIndex((o) => o && o.cost <= S.gold);
      return S.board.length < 3 && i >= 0 ? { actions: [{ type: 'buy', shopIndex: i }] } : { done: true };
    },
    seatingActions: () => [],
  };
  const out = await loop.run({ arena, planner: fillPlanner, bookFile: path.join(dir, 'book.json'),
    logDir: path.join(dir, 'log'), lastOpponentFile: path.join(dir, 'last.json'), prevHandle: null,
    games: Infinity, stopAfterMatches: 900, start: true, seed: 71, maxMatchSteps: 20 });
  assert.equal(out.games, 900);
  assert.equal(out.exitReason, 'matches_done');
  assert.ok(observations > 4000, `${observations} iterations must exceed the old lifetime cap`);
  assert.equal(arena.stats.illegal, 0);
});

test('changing versions without a completed match cannot bypass the per-match step limit', async () => {
  const dir = tmpdir(); let n = 0;
  const arena = { observe: async () => ({ version: ++n, state: { phase: { kind: 'idle' } } }), act: async () => ({}) };
  const out = await loop.run({ arena, bookFile: path.join(dir, 'book.json'), logDir: path.join(dir, 'log'),
    start: true, games: Infinity, maxMatchSteps: 12, prevHandle: null });
  assert.equal(out.exitReason, 'max_steps');
  assert.equal(n, 12);
});
