'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mock = require('./mock_arena');

const unit = (atk = 1, hp = 1) => ({ name: 'GTM Prospecting', kitId: null,
  atk, hp, honey: false, crew: null, item: null });

async function setBoard(arena, units) {
  const state = arena._state();
  state.board = units.map((u, i) => ({ ...u, uid: i + 1, tempAtk: 0, potato: false,
    rarity: 'common', cost: 3 }));
  state.nextUid = units.length + 1;
  if (state.captainOffer?.length) await arena.act({ type: 'pickCaptain', captain: 'scout' });
  if (state.relicOffer?.length) {
    // Fix the draft for this lifecycle regression; these relics have no combat effect.
    state.relicOffer = [state.relics.length ? 'bulkOrder' : 'rich'];
    await arena.act({ type: 'pickRelic', relic: state.relicOffer[0] });
  }
}

async function fight(arena, units) {
  await setBoard(arena, units);
  const battle = (await arena.act({ type: 'endShop' })).state;
  const after = (await arena.act({ type: 'battleDone' })).state;
  return { battle, after };
}

test('modern mock enters a fourth shop only for an even series; legacy default still ends after three', async () => {
  for (const season of [1, 2, 3, 4]) for (const suddenDeath of [false, true]) {
    const ghost = { handle: 'same-rival', rounds: [0, 1, 2].map(() => [[unit()]]),
      captains: ['scout', 'scout', 'scout'], relics: [[], ['rich'], ['rich', 'bulkOrder']] };
    const arena = mock.create({ season, suddenDeath, seed: 102, ghosts: [ghost],
      captainOffer: ['scout'], rivalCaptain: 'scout' });
    const initial = (await arena.act({ type: 'start' })).state;
    assert.equal(initial.suddenDeathEnabled, suddenDeath);
    for (let round = 0; round < 3; round++) {
      assert.equal(arena._phase().round, round);
      const { battle, after } = await fight(arena, [unit()]);
      assert.equal(battle.phase.winner, 'draw');
      assert.equal(after.phase.kind, round < 2 || suddenDeath ? 'shop' : 'result');
    }
    if (!suddenDeath) {
      assert.equal(arena.stats.rounds.length, 3);
      assert.equal(arena.stats.matches[0].result, 'draw');
      continue;
    }
    const shop = (await arena.observe()).state;
    assert.deepEqual(shop.phase, { kind: 'shop', round: 3 });
    assert.equal(shop.toSuddenDeath, true);
    assert.equal(shop.opponentHandle, 'same-rival');
    assert.deepEqual(shop.kept, { you: { hp: 0, atk: 0 }, them: { hp: 0, atk: 0 } });
    if (season >= 4) {
      assert.equal(shop.relicOffer, null, 'the third fight does not drop a relic');
      assert.deepEqual(shop.relics, ['rich', 'bulkOrder']);
      assert.deepEqual(shop.rivalRelics, ['rich', 'bulkOrder']);
      assert.equal(shop.gold, 12, 'ordinary shop income includes the retained Rich relic');
    } else assert.equal(shop.gold, 10);
    const { after } = await fight(arena, [unit()]);
    assert.equal(after.phase.kind, 'result');
    assert.deepEqual(after.results, ['draw', 'draw', 'draw', 'draw']);
    assert.equal(after.suddenDeath.decider, 'draw');
    assert.equal(arena.stats.matches[0].result, 'draw');
    assert.deepEqual(arena.stats.ghostFallbacks, [{ matchId: 'm_mock_1', round: 3,
      sourceRound: 2, reason: 'no recorded fourth-round board' }]);
    if (season >= 3) {
      const replay = await arena.getPublicMatchDetail('m_mock_1');
      assert.equal(replay.rounds.length, 4);
      assert.deepEqual(replay.rounds[3].suddenDeath, after.suddenDeath);
    }
  }
});

test('modern mock keeps the raw fourth fight in results and applies cumulative HP then ATK to wins', async () => {
  const cases = [
    { you: unit(3, 10), them: unit(3, 7), winner: 'you', decider: 'hp',
      kept: { you: { hp: 9, atk: 3 }, them: { hp: 6, atk: 3 } } },
    { you: unit(3, 7), them: unit(3, 10), winner: 'them', decider: 'hp',
      kept: { you: { hp: 6, atk: 3 }, them: { hp: 9, atk: 3 } } },
    { you: unit(3, 7), them: unit(2, 7), winner: 'you', decider: 'atk',
      kept: { you: { hp: 6, atk: 3 }, them: { hp: 6, atk: 2 } } },
    { you: unit(3, 7), them: unit(3, 7), winner: 'draw', decider: 'draw',
      kept: { you: { hp: 6, atk: 3 }, them: { hp: 6, atk: 3 } } },
  ];
  for (const c of cases) {
    const ghost = { handle: 'same-rival', rounds: [[[unit()]], [[c.them]], [[unit()]], [[unit()]]] };
    const arena = mock.create({ season: 1, suddenDeath: true, ghosts: [ghost] });
    await arena.act({ type: 'start' });
    await fight(arena, [c.you]);
    await fight(arena, [unit()]);
    await fight(arena, [unit()]);
    const shop = (await arena.observe()).state;
    assert.deepEqual(shop.kept, c.kept, 'survival totals contain all three previous fights');
    const { battle, after } = await fight(arena, [unit()]);
    assert.equal(battle.phase.winner, 'draw');
    assert.deepEqual(after.results, ['you', 'them', 'draw', 'draw']);
    assert.deepEqual(after.suddenDeath, { winner: c.winner, decider: c.decider, kept: c.kept });
    assert.deepEqual(after.wins, { you: 1 + +(c.winner === 'you'), them: 1 + +(c.winner === 'them') });
    assert.equal(arena.stats.matches[0].result, c.winner === 'you' ? 'win' : c.winner === 'them' ? 'loss' : 'draw');
    assert.deepEqual(arena.stats.ghostFallbacks, [], 'a recorded fourth board is used directly');
  }
});

test('modern mock finishes decisive ordinary series and a fourth-fight winner overrides survival totals', async () => {
  for (const secondWin of [true, false]) {
    const ghost = { handle: 'rival', rounds: [0, 1, 2].map(() => [[unit()]]) };
    const arena = mock.create({ suddenDeath: true, ghosts: [ghost] });
    await arena.act({ type: 'start' });
    await fight(arena, [unit(3, 10)]);
    await fight(arena, [secondWin ? unit(3, 10) : unit()]);
    if (!secondWin) await fight(arena, [unit()]);
    assert.equal(arena._phase().kind, 'result');
    assert.equal(arena.stats.rounds.length, secondWin ? 2 : 3);
    assert.equal(arena.stats.matches[0].result, 'win');
  }
  const ghost = { handle: 'rival', rounds: [[[unit()]], [[unit(3, 20)]], [[unit()]], [[unit()]]] };
  const arena = mock.create({ suddenDeath: true, ghosts: [ghost] });
  await arena.act({ type: 'start' });
  await fight(arena, [unit(3, 3)]);
  await fight(arena, [unit()]);
  await fight(arena, [unit()]);
  const { after } = await fight(arena, [unit(3, 3)]);
  assert.ok(after.kept.you.hp < after.kept.them.hp);
  assert.equal(after.suddenDeath.winner, 'you');
  assert.equal(after.suddenDeath.decider, 'fight');
  assert.equal(arena.stats.matches[0].result, 'win');
});
