'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mock = require('./mock_arena');
const bookLib = require('../lib/book');
const catalog = require('../lib/catalog');
const shop = require('../lib/shop_model');
const { run } = require('../driver/play_loop');

test('real driver buys in sudden death, saves every round, and resumes more four-round matches', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-sudden-driver-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bookFile = path.join(dir, 'book.json');
  const bot = catalog.byName('Dr Disk Clean'); // Shop-only kit: symmetric combat draws.
  const board = [{ name: bot.name, botId: bot.id, kitId: bot.kitId,
    atk: 1, hp: 1, honey: false, crew: bot.crew, item: null }];
  const ghost = { handle: 'four-round-rival', rounds: [0, 1, 2, 3].map(() => [structuredClone(board)]),
    captains: ['scout', 'scout', 'scout', 'scout'], relics: [[], ['rich'], ['rich', 'bulkOrder'], ['rich', 'bulkOrder']],
    seats: { front: 'warm_up', middle: 'hard_hat', back: 'pit_stop' } };
  const arena = mock.create({ season: 4, suddenDeath: true, seed: 402, ghosts: [ghost],
    ghostSequence: true, captainOffer: ['scout'], rivalCaptain: 'scout' });
  const actualAct = arena.act;
  const actions = [];
  // A controlled protocol fixture guarantees three drawn opening fights. The
  // fourth shop retains real random offers, income, planner decisions and combat.
  // This exercises lifecycle/persistence, not an estimate of strategic strength.
  function ordinaryShop() {
    if (arena._phase().kind !== 'shop' || arena._phase().round >= 3) return;
    const state = arena._state();
    state.board = board.map((u, i) => ({ ...u, uid: i + 1, tempAtk: 0, potato: false,
      rarity: 'epic', cost: 6 }));
    state.nextUid = 2;
    state.gold = 0;
    state.offers = [null, null, null];
    state.frozen = [false, false, false];
    state.food = null;
    state.itemOffer = null;
    state.freeRerolls = 0;
    state.shopCosts = { reroll: 1, food: 3 };
    if (state.relicOffer?.length) state.relicOffer = [state.round === 1 ? 'rich' : 'bulkOrder'];
  }
  arena.act = async (action, version) => {
    const before = (await arena.observe()).state;
    actions.push({ round: before.phase.round, phase: before.phase.kind, action });
    if (action.type === 'endShop' && before.phase.round < 3) {
      const state = arena._state();
      ghost.rounds[state.round] = [shop.simUnits(state)];
      ghost.relics[state.round] = [...state.relics];
    }
    await actualAct(action, version);
    ordinaryShop();
    return arena.observe();
  };
  const events = [];
  const options = { arena, bookFile, start: true, seed: 41, timeBudgetMs: 30,
    prevHandle: null, sleep: async () => {}, lastOpponentFile: path.join(dir, 'last.json'),
    telemetry: { event(type, value) { events.push({ type, ...value }); }, close() {} } };

  const first = await run({ ...options, games: 2 });
  assert.equal(first.exitReason, 'games_done');
  assert.equal(first.games, 2);
  assert.equal(first.rounds, 8);
  let saved = bookLib.open(bookFile);
  assert.equal(saved.stats().observations, 8, 'all four rounds of both matches survived saving');
  assert.equal(saved.lookup(4, ghost.handle, 3).reduce((n, x) => n + x.n, 0), 2);

  const second = await run({ ...options, games: 1 });
  assert.equal(second.exitReason, 'games_done');
  assert.equal(second.games, 1);
  assert.equal(second.rounds, 4);
  saved = bookLib.open(bookFile);
  assert.equal(saved.stats().observations, 12, 'restart preserved earlier learning and adds exactly four rounds');
  assert.equal(saved.lookup(4, ghost.handle, 3).reduce((n, x) => n + x.n, 0), 3);
  assert.equal(arena.stats.illegal, 0);
  assert.equal(arena.stats.matches.length, 3);
  for (const match of arena.stats.matches) {
    const rounds = arena.stats.rounds.filter(r => r.matchId === match.id);
    assert.equal(rounds.length, 4);
    assert.deepEqual(rounds.slice(0, 3).map(r => r.winner), ['draw', 'draw', 'draw']);
  }
  assert.ok(actions.some(a => a.round === 3 && ['buy', 'feed', 'equip'].includes(a.action.type)),
    'the real planner improves its board in the fourth shop instead of passing with all tokens');
  assert.ok(arena.stats.endShops.filter(s => s.round === 3).every(s => s.goldLeft < 12));
  assert.equal(events.filter(e => e.type === 'battle').length, 12);
  assert.equal(events.filter(e => e.type === 'book').length, 12);
  assert.equal(events.filter(e => e.type === 'result').length, 3);
  assert.equal(events.filter(e => e.type === 'error').length, 0);
  assert.ok(events.filter(e => e.type === 'shop' && e.round === 3).every(e => e.target.entries > 0));
});
