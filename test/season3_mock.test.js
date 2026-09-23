'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mock = require('./mock_arena');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bookLib = require('../lib/book');
const { run } = require('../driver/play_loop');

test('S3 ghosts keep three boards from one public match together', () => {
  const ghosts = mock.loadGhosts({ s3: true });
  assert.equal(ghosts.length, 39); // 100 public details; 39 played all three rounds
  assert.equal(new Set(ghosts.map((g) => g.id)).size, 39);
  for (const g of ghosts) {
    assert.equal(g.rounds.length, 3);
    for (const round of g.rounds) {
      assert.equal(round.length, 1, `mixed trajectories in ${g.id}`);
      assert.ok(round[0].length > 0);
      assert.ok(round[0].every((u) => u.kitId && u.crew));
    }
  }
});

test('S3 mock applies captain, equipment and Banker carry through a battle', async () => {
  const arena = mock.create({ season: 3, seed: 123, captainOffer: ['banker', 'scout', 'chef'], rivalCaptain: 'drill' });
  let e = await arena.act({ type: 'start' });
  assert.deepEqual(e.state.captainOffer, ['banker', 'scout', 'chef']);
  assert.equal(e.state.shop.item.cost, 2);
  await assert.rejects(() => arena.act({ type: 'endShop' }), /empty board|captain pick/);
  e = await arena.observe();
  e = await arena.act({ type: 'pickCaptain', captain: 'banker' }, e.version);
  assert.equal(e.state.captain, 'banker');
  e = await arena.act({ type: 'buy', shopIndex: 0 }, e.version);
  e = await arena.act({ type: 'equip', boardIndex: 0 }, e.version);
  assert.equal(e.state.board[0].item != null, true);
  assert.equal(e.state.gold, 5);
  e = await arena.act({ type: 'endShop' }, e.version);
  assert.equal(e.state.phase.kind, 'battle');
  assert.equal(e.state.rivalCaptain, 'drill');
  assert.ok(e.state.phase.frames.length > 0);
  e = await arena.act({ type: 'battleDone' }, e.version);
  assert.equal(e.state.phase.kind, 'shop');
  assert.equal(e.state.phase.round, 1);
  assert.equal(e.state.gold, 15);
  assert.equal(e.state.carry, 5);
});

test('S3 mock Scout first reroll is free and future shop draws stay keyed', async () => {
  const arena = mock.create({ season: 3, seed: 45, captainOffer: ['scout', 'chef', 'drill'] });
  let e = await arena.act({ type: 'start' });
  e = await arena.act({ type: 'pickCaptain', captain: 'scout' }, e.version);
  assert.equal(e.state.gold, 10);
  assert.equal(e.state.freeRerolls, 1);
  e = await arena.act({ type: 'reroll' }, e.version);
  assert.equal(e.state.gold, 10);
  assert.equal(e.state.freeRerolls, 0);
  assert.ok(e.state.shop.item);
  e = await arena.act({ type: 'reroll' }, e.version);
  assert.equal(e.state.gold, 9);
});

test('the real driver learns exact equipped ghost boards from completed mock replays', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-mock-replay-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ghost = mock.loadGhosts({ s3: true }).find((g) =>
    g.rounds[0][0].some((u) => u.item));
  assert.ok(ghost, 'requires recorded enemy equipment');
  const arena = mock.create({ season: 3, seed: 917, ghosts: [ghost] });
  assert.equal(await arena.getPublicMatchDetail('m_mock_1'), null);
  const book = bookLib.open(path.join(dir, 'book.json'));
  const observations = [];
  const result = await run({ arena, book, start: true, games: 1, seed: 42,
    timeBudgetMs: 0, lastOpponentFile: path.join(dir, 'last.json'),
    telemetry: { event(type, payload) { if (type === 'book') observations.push(payload); }, close() {} } });
  assert.equal(result.games, 1);
  const replay = await arena.getPublicMatchDetail('m_mock_1');
  assert.ok(replay.rounds.length >= 2);
  for (const r of replay.rounds) {
    const expected = bookLib.normBoard(ghost.rounds[r.round][0]);
    assert.deepEqual(book.lookup(3, ghost.handle, r.round)[0].board, expected);
    assert.deepEqual(bookLib.normBoard(bookLib.publicReplayBoard(r, 'them')), expected);
    const logged = observations.find(e => e.round === r.round);
    assert.deepEqual(bookLib.normBoard(logged.board), expected);
    assert.equal(logged.recorded, true);
    assert.ok(logged.observationId && logged.observedAt);
  }
  replay.rounds[0].them[0].atk = -999;
  assert.notEqual((await arena.getPublicMatchDetail('m_mock_1')).rounds[0].them[0].atk, -999);
});
