'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sim = require('../lib/sim');
const catalog = require('../lib/catalog');

const u = (name, kitId, atk, hp, crew, item) => ({ name, kitId, atk, hp, honey: false, crew, item });
const captions = (r) => r.frames.map((f) => f.caption);

test('Season 3 crews activate before fight captains and kits', () => {
  const result = sim.simulate(
    [u('A', 'hype', 1, 20, 'sales'), u('B', null, 1, 20, 'sales')],
    [u('E', null, 1, 30, 'ops')],
    { season: 3, round: 0, ourCaptain: 'drill', theirCaptain: 'medic' },
  );
  const c = captions(result);
  assert.deepEqual(c.slice(0, 5), [
    'The fight starts',
    'Sales crew: +2 ATK to 2 of your bots',
    'Drill: +2 ATK to your front bot',
    'Enemy Medic: +3 HP to their front bot',
    'A juiced A: +2 ATK',
  ]);
  assert.deepEqual(result.frames[4].you[0], { name: 'A', atk: 7, hp: 20 });
  assert.deepEqual(result.frames[4].them[0], { name: 'E', atk: 1, hp: 33 });
});

test('aura and other start abilities share attack ordering', () => {
  const result = sim.simulate(
    [u('Front', 'hype', 1, 12, 'personal'), u('Aura', 'command', 5, 12, 'builders')],
    [u('Enemy', null, 1, 20, 'ops')],
    { season: 3, round: 0 },
  );
  assert.deepEqual(captions(result).slice(0, 3), [
    'The fight starts', 'Aura lights its aura', 'Front juiced Front: +2 ATK',
  ]);
  assert.equal(result.frames[2].you[0].atk, 4);
});

test('both Marketing crews damage both teams before kit triggers', () => {
  const result = sim.simulate(
    [u('A', null, 1, 2, 'marketing'), u('B', null, 1, 2, 'marketing')],
    [u('E', null, 1, 2, 'marketing'), u('F', null, 1, 2, 'marketing')],
    { season: 3, round: 0 },
  );
  assert.equal(result.winner, 'draw');
  assert.equal(captions(result)[1], 'Both Marketing crews: 2 damage to each enemy');
  assert.equal(result.turns, 0);
});

test('double hit reports combined damage in the exchange caption', () => {
  const result = sim.simulate(
    [u('Hammer', 'hammer', 2, 5, 'builders')],
    [u('Target', null, 1, 4, 'ops')],
    { season: 3, round: 0 },
  );
  assert.equal(result.winner, 'us');
  assert.ok(captions(result).includes('Hammer and Target trade: -1 HP / -4 HP'));
});

test('a shield blocks hit damage but venom still poisons the target', () => {
  const result = sim.simulate(
    [u('Poison', 'acid_test', 1, 4, 'sales')],
    [u('Shield', 'rollback', 1, 4, 'ops')],
    { season: 3, round: 0 },
  );
  const c = captions(result);
  assert.ok(c.includes("Shield's shield blocks the hit"));
  assert.ok(c.includes('Poison poisons Shield: venom 1'));
  assert.ok(c.includes('Venom: Shield -1 HP'));
});

test('a jammed Grow bot gains stats before its basic attack is skipped', () => {
  const result = sim.simulate(
    [u('Grower', 'grow', 2, 8, 'personal')],
    [u('Jammer', 'clamp', 1, 8, 'ops')],
    { season: 3, round: 0 },
  );
  const c = captions(result);
  const skip = c.indexOf('Grower is jammed and skips its attack');
  assert.ok(skip > 0);
  assert.equal(c[skip - 1], 'Grower grows into the swing: +1/+1');
  assert.ok(c.slice(skip + 1).some((x) => x.startsWith('Grower grows into the swing')));
});

test('bestSeating uses each target board’s rival captain', () => {
  const own = [u('Us', null, 2, 3, 'ops')];
  const enemy = [u('Them', null, 2, 3, 'sales')];
  const without = sim.bestSeating(own, [{ board: enemy, weight: 1 }], { season: 3, round: 0 });
  const withDrill = sim.bestSeating(own, [{ board: enemy, weight: 1, theirCaptain: 'drill' }], { season: 3, round: 0 });
  assert.equal(without[0].wdl.draw, 1);
  assert.equal(withDrill[0].wdl.loss, 1);
});

test('bestSeating uses the observed rival captain over a historical book captain', () => {
  const own = [u('Us', null, 2, 3, 'ops')];
  const enemy = [u('Them', null, 2, 3, 'sales')];
  const past = [{ board: enemy, weight: 1, theirCaptain: 'drill' }];
  const observed = sim.bestSeating(own, past,
    { season: 3, round: 0, theirCaptain: 'banker' });
  assert.equal(observed[0].wdl.draw, 1);
  const observedAlternateShape = sim.bestSeating(own, past,
    { season: 3, round: 0, captains: { them: 'banker' } });
  assert.equal(observedAlternateShape[0].wdl.draw, 1);
});

test('public Season 3 copy and tied strongest-enemy battle replays frame for frame', () => {
  // The public record omits seats/captains; its opening captions identify
  // Spotlight at the front and our Drill captain in this round.
  const file = path.join(__dirname, '../data/corpus/s3_public_matches.jsonl');
  const match = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse)
    .find((m) => m.id === '5db19f79-85e4-433e-8427-cd92fb775b3d');
  assert.ok(match);
  const round = match.rounds[0];
  const units = (board) => board.map((x) => {
    const b = catalog.byId(x.botId);
    assert.ok(b, x.botId);
    return { name: b.name, kitId: b.kitId, atk: x.atk + (x.tempAtk || 0), hp: x.hp,
      honey: x.honey, crew: b.crew, item: x.item };
  });
  const got = sim.simulate(units(round.you), units(round.them), {
    season: 3, round: 0, seats: { front: 'spotlight' }, ourCaptain: 'drill',
  });
  assert.equal(got.winner, 'us');
  assert.deepEqual(got.frames, round.frames);
});

test('all 2,751 complete-input September 21 battles reproduce every frame and winner', () => {
  const rows = JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(
    path.join(__dirname, 'fixtures/s3-live-logs-20260921.json.gz'))));
  assert.equal(rows.length, 2751);
  for (const r of rows) {
    const got = sim.simulate(r.us, r.them, r.options);
    const label = `${r.matchId} round ${r.round}`;
    assert.equal(got.winner === 'us' ? 'you' : got.winner, r.winner, label);
    assert.deepEqual(got.frames, r.frames, label);
  }
});
