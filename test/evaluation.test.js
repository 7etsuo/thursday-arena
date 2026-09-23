'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mock = require('./mock_arena');
const recent = require('../tools/eval_recent');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('historical shop evaluators refuse Season 3 telemetry instead of scoring it as Season 2', (t) => {
  const plannerEval = require('../tools/eval_planner');
  assert.throws(() => plannerEval.stateFrom({ season: 3 }), /Season 1\/2/);
  assert.throws(() => plannerEval.runRow({ season: 3 }), /Season 1\/2/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-s3-eval-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'data', 'log'), { recursive: true });
  const events = [
    { type: 'match_start', session: 's', seq: 1, matchId: 's3', season: 3 },
    { type: 'result', session: 's', seq: 2, matchId: 's3', opponent: 'other', rated: true, ai: false },
  ];
  fs.writeFileSync(path.join(dir, 'data', 'log', '2026-09-20.jsonl'), events.map(JSON.stringify).join('\n'));
  assert.throws(() => recent.loadRecords({ recordsDir: dir }), /Season 1\/2/);
});

async function advanceToRoundOne(arena, env, reroll) {
  if (reroll) env = await arena.act({ type: 'reroll' }, env.version);
  for (let i = 0; i < 3; i++) env = await arena.act({ type: 'buy', shopIndex: i }, env.version);
  env = await arena.act({ type: 'endShop' }, env.version);
  return arena.act({ type: 'battleDone' }, env.version);
}

async function nextRoundOne(arena, reroll) {
  return advanceToRoundOne(arena, await arena.act({ type: 'start' }), reroll);
}

async function nextMatch(arena, env) {
  while (env.state.phase.kind !== 'result') {
    env = await arena.act({ type: 'endShop' }, env.version);
    env = await arena.act({ type: 'battleDone' }, env.version);
  }
  return arena.act({ type: 'restart' }, env.version);
}

test('mock exogenous shops and later ghosts stay paired when one policy rerolls', async () => {
  const a = mock.create({ seed: 833, season: 2 });
  const b = mock.create({ seed: 833, season: 2 });
  const r1a = await nextRoundOne(a, false);
  const r1b = await nextRoundOne(b, true);
  assert.deepEqual(r1a.state.shop, r1b.state.shop);
  assert.deepEqual(r1a.state.seats, r1b.state.seats);
  assert.equal(r1a.state.opponentHandle, r1b.state.opponentHandle);
  const nextA = await nextMatch(a, r1a);
  const nextB = await nextMatch(b, r1b);
  assert.deepEqual(nextA.state.shop, nextB.state.shop);
  assert.deepEqual(nextA.state.seats, nextB.state.seats);
  const nextR1a = await advanceToRoundOne(a, nextA, false);
  const nextR1b = await advanceToRoundOne(b, nextB, false);
  assert.equal(nextR1a.state.opponentHandle, nextR1b.state.opponentHandle);
});

test('recent evaluator builds its book only from battles before each shop', () => {
  const board = (name) => [{ name, kitId: 'pin', atk: 2, hp: 3, honey: false }];
  const make = (ts, name) => ({ ts, season: 2, handle: 'enemy', round: 1,
    board: board(name), matchId: name });
  const shop = { ts: '2026-09-20T06:00:00.000Z', mid: 'm', round: 1, s2: true,
    seats: null, winner: 'them', them: board('past'),
    shop: { gold: 10, food: 'apple', offers: [null, null, null], board: board('ours') } };
  const records = { rows: [shop], battles: [make(Date.parse('2026-09-20T05:59:00Z'), 'past'),
    make(Date.parse('2026-09-20T06:01:00Z'), 'future')] };
  recent.score(records, { from: '2026-09-20T05:00:00Z', to: null, limit: 0 }, (_, book) => {
    const names = book.lookup(2, 'enemy', 1).map((e) => e.board[0].name);
    assert.deepEqual(names, ['past']);
  });
});
