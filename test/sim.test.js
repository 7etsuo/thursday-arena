'use strict';
/**
 * The simulator is ground truth: it replays every recorded battle exactly, so these tests pin both the
 * corpus replay and the individual engine facts the old hand-written model got wrong
 * (docs/ENGINE_BATTLE.md §5, §6).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const sim = require('../lib/sim');

const ROOT = path.join(__dirname, '..');
const U = (name, kitId, atk, hp, honey) => ({ name, kitId, atk, hp, honey: !!honey });
const caps = (r) => r.frames.map((f) => f.caption);
const stats = (side) => side.map((u) => `${u.name} ${u.atk}/${u.hp}`);

// ------------------------------------------------------------------ corpus replay
test('replays every recorded battle: 10748/10748 winners', () => {
  const rows = fs
    .readFileSync(path.join(ROOT, 'data/corpus/battles.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.equal(rows.length, 10748);   // 9,730 audit corpus + 1,018 live season-2 battles
  let ok = 0;
  const byEra = { S1early: [0, 0], S1late: [0, 0], S2: [0, 0] };
  for (const r of rows) {
    const era = r.s2 ? 'S2' : r.ts < '2026-09-19T04:30' ? 'S1early' : 'S1late';
    byEra[era][1] += 1;
    const got = sim.outcome(r.you, r.them, { round: r.round, seats: r.seats });
    if (got === (r.winner === 'you' ? 'us' : r.winner)) { ok += 1; byEra[era][0] += 1; }
  }
  assert.equal(ok, 10748, `winner agreement ${ok}/10748 ${JSON.stringify(byEra)}`);
  assert.deepEqual(byEra, { S1early: [7602, 7602], S1late: [1677, 1677], S2: [1469, 1469] });   // 451 audit + 1,018 live
});

// ------------------------------------------------------------------ frame-exact spot check
// Two battles lifted from the recorded server frames (scratchpad/audit/engb/battles.jsonl, joined to
// their exact inputs through data/corpus/battles.jsonl). Every caption and every unit's ATK/HP in
// every frame must come out identical.
const RECORDED = [
  {
    ts: "2026-09-18T12:40:54.712Z", round: 1, winner: "you", seats: null,
    you: [{"name":"Nightly Audit Engineer","kitId":"cover","atk":3,"hp":6,"honey":true},{"name":"Company Docs Q&A","kitId":"guard","atk":2,"hp":6,"honey":false},{"name":"WTD","kitId":"hype","atk":3,"hp":4,"honey":true}],
    them: [{"name":"Tech Demos","kitId":"first_seat","atk":4,"hp":2,"honey":false},{"name":"Apple Search Ads Review","kitId":"grow","atk":3,"hp":3,"honey":false}],
    frames: [
      {"you":[{"name":"Nightly Audit Engineer","atk":3,"hp":6},{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[{"name":"Tech Demos","atk":4,"hp":2},{"name":"Apple Search Ads Review","atk":3,"hp":3}],"caption":"The teams square up"},
      {"you":[{"name":"Nightly Audit Engineer","atk":3,"hp":6},{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[{"name":"Tech Demos","atk":4,"hp":2},{"name":"Apple Search Ads Review","atk":3,"hp":3}],"caption":"Tech Demos takes first seat"},
      {"you":[{"name":"Nightly Audit Engineer","atk":5,"hp":6},{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[{"name":"Tech Demos","atk":4,"hp":2},{"name":"Apple Search Ads Review","atk":3,"hp":3}],"caption":"WTD juiced Nightly Audit Engineer: +2 ATK"},
      {"you":[{"name":"Nightly Audit Engineer","atk":5,"hp":8},{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[{"name":"Tech Demos","atk":4,"hp":2},{"name":"Apple Search Ads Review","atk":3,"hp":3}],"caption":"Company Docs Q&A pads Nightly Audit Engineer: +2 HP"},
      {"you":[{"name":"Nightly Audit Engineer","atk":5,"hp":4},{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[{"name":"Tech Demos","atk":4,"hp":-3},{"name":"Apple Search Ads Review","atk":3,"hp":3}],"caption":"Nightly Audit Engineer and Tech Demos trade: -4 HP / -5 HP"},
      {"you":[{"name":"Nightly Audit Engineer","atk":5,"hp":4},{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[{"name":"Apple Search Ads Review","atk":3,"hp":3}],"caption":"Tech Demos is knocked out"},
      {"you":[{"name":"Nightly Audit Engineer","atk":5,"hp":4},{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[{"name":"Apple Search Ads Review","atk":4,"hp":4}],"caption":"Apple Search Ads Review grows into the swing: +1/+1"},
      {"you":[{"name":"Nightly Audit Engineer","atk":5,"hp":0},{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[{"name":"Apple Search Ads Review","atk":4,"hp":-1}],"caption":"Nightly Audit Engineer and Apple Search Ads Review trade: -4 HP / -5 HP"},
      {"you":[{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[{"name":"Apple Search Ads Review","atk":4,"hp":-1}],"caption":"Nightly Audit Engineer is knocked out"},
      {"you":[{"name":"Drone","atk":1,"hp":1},{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[{"name":"Apple Search Ads Review","atk":4,"hp":-1}],"caption":"Drone joins your side"},
      {"you":[{"name":"Drone","atk":1,"hp":1},{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[],"caption":"Apple Search Ads Review is knocked out"},
      {"you":[{"name":"Drone","atk":1,"hp":1},{"name":"Company Docs Q&A","atk":2,"hp":6},{"name":"WTD","atk":3,"hp":4}],"them":[],"caption":"Your side holds the floor"},
    ],
  },
  {
    ts: "2026-09-19T07:14:51.915Z", round: 0, winner: "you", seats: {"front":"spotlight"},
    you: [{"name":"Writing Bot","kitId":"hype","atk":2,"hp":5,"honey":false},{"name":"Imogen","kitId":"bulk","atk":2,"hp":6,"honey":false}],
    them: [{"name":"GTM Prospecting","kitId":"mosquito","atk":4,"hp":3,"honey":true},{"name":"skippy","kitId":"sidestep","atk":2,"hp":4,"honey":false}],
    frames: [
      {"you":[{"name":"Writing Bot","atk":2,"hp":5},{"name":"Imogen","atk":2,"hp":6}],"them":[{"name":"GTM Prospecting","atk":4,"hp":3},{"name":"skippy","atk":2,"hp":4}],"caption":"The teams square up"},
      {"you":[{"name":"Writing Bot","atk":4,"hp":5},{"name":"Imogen","atk":2,"hp":6}],"them":[{"name":"GTM Prospecting","atk":4,"hp":3},{"name":"skippy","atk":2,"hp":4}],"caption":"Spotlight: Writing Bot +2 ATK"},
      {"you":[{"name":"Writing Bot","atk":4,"hp":5},{"name":"Imogen","atk":2,"hp":6}],"them":[{"name":"GTM Prospecting","atk":6,"hp":3},{"name":"skippy","atk":2,"hp":4}],"caption":"Spotlight: GTM Prospecting +2 ATK"},
      {"you":[{"name":"Writing Bot","atk":4,"hp":4},{"name":"Imogen","atk":2,"hp":6}],"them":[{"name":"GTM Prospecting","atk":6,"hp":3},{"name":"skippy","atk":2,"hp":4}],"caption":"GTM Prospecting snipes Writing Bot for 1"},
      {"you":[{"name":"Writing Bot","atk":6,"hp":4},{"name":"Imogen","atk":2,"hp":6}],"them":[{"name":"GTM Prospecting","atk":6,"hp":3},{"name":"skippy","atk":2,"hp":4}],"caption":"Writing Bot juiced Writing Bot: +2 ATK"},
      {"you":[{"name":"Writing Bot","atk":6,"hp":4},{"name":"Imogen","atk":2,"hp":5}],"them":[{"name":"GTM Prospecting","atk":6,"hp":3},{"name":"skippy","atk":2,"hp":4}],"caption":"skippy sideswipes Imogen: 1"},
      {"you":[{"name":"Writing Bot","atk":6,"hp":4},{"name":"Imogen","atk":2,"hp":7}],"them":[{"name":"GTM Prospecting","atk":6,"hp":3},{"name":"skippy","atk":2,"hp":4}],"caption":"Imogen bulks up: +2 HP"},
      {"you":[{"name":"Writing Bot","atk":6,"hp":-2},{"name":"Imogen","atk":2,"hp":7}],"them":[{"name":"GTM Prospecting","atk":6,"hp":-3},{"name":"skippy","atk":2,"hp":4}],"caption":"Writing Bot and GTM Prospecting trade: -6 HP / -6 HP"},
      {"you":[{"name":"Writing Bot","atk":6,"hp":-2},{"name":"Imogen","atk":2,"hp":7}],"them":[{"name":"skippy","atk":2,"hp":4}],"caption":"GTM Prospecting is knocked out"},
      {"you":[{"name":"Writing Bot","atk":6,"hp":-2},{"name":"Imogen","atk":2,"hp":7}],"them":[{"name":"Drone","atk":1,"hp":1},{"name":"skippy","atk":2,"hp":4}],"caption":"Drone joins the enemy side"},
      {"you":[{"name":"Imogen","atk":2,"hp":7}],"them":[{"name":"Drone","atk":1,"hp":1},{"name":"skippy","atk":2,"hp":4}],"caption":"Writing Bot is knocked out"},
      {"you":[{"name":"Imogen","atk":2,"hp":6}],"them":[{"name":"Drone","atk":1,"hp":-1},{"name":"skippy","atk":2,"hp":4}],"caption":"Imogen and Drone trade: -1 HP / -2 HP"},
      {"you":[{"name":"Imogen","atk":2,"hp":6}],"them":[{"name":"skippy","atk":2,"hp":4}],"caption":"Drone is knocked out"},
      {"you":[{"name":"Imogen","atk":2,"hp":4}],"them":[{"name":"skippy","atk":2,"hp":2}],"caption":"Imogen and skippy trade: -2 HP / -2 HP"},
      {"you":[{"name":"Imogen","atk":2,"hp":2}],"them":[{"name":"skippy","atk":2,"hp":0}],"caption":"Imogen and skippy trade: -2 HP / -2 HP"},
      {"you":[{"name":"Imogen","atk":2,"hp":2}],"them":[],"caption":"skippy is knocked out"},
      {"you":[{"name":"Imogen","atk":2,"hp":2}],"them":[],"caption":"Your side holds the floor"},
    ],
  },
];

test('frame-exact replay of recorded battles', () => {
  for (const b of RECORDED) {
    const got = sim.simulate(b.you, b.them, { round: b.round, seats: b.seats });
    assert.equal(got.winner, b.winner === 'you' ? 'us' : b.winner, b.ts);
    assert.equal(got.frames.length, b.frames.length, `${b.ts} frame count`);
    for (let i = 0; i < b.frames.length; i++) {
      assert.deepEqual(got.frames[i], b.frames[i], `${b.ts} frame ${i}`);
    }
  }
});

test('the per-round seed is fixed, so the same boards always fight the same battle', () => {
  assert.deepEqual(sim.ROUND_SEEDS, [101, 202, 303, 404]);
  const a = sim.simulate(RECORDED[0].you, RECORDED[0].them, { round: 1 });
  const b = sim.simulate(RECORDED[0].you, RECORDED[0].them, { round: 1 });
  assert.deepEqual(a.frames, b.frames);
  // a different round = a different seed, and the tie-breaks can differ
  assert.equal(sim.simulate(RECORDED[0].you, RECORDED[0].them, { round: 1, seed: 999 }).frames.length > 0, true);
});

// ------------------------------------------------------------------ engine facts the old model got wrong
test('hype buffs the front-most friend, including itself, and stacks', () => {
  // ENGB-05: "never seat0 hype" was wrong -- 271 threat under-estimates came from hype buffing itself.
  const alone = sim.simulate([U('H', 'hype', 2, 20)], [U('E', null, 1, 20)], { round: 0 });
  assert.equal(caps(alone)[1], 'H juiced H: +2 ATK');
  assert.equal(alone.frames[1].you[0].atk, 4);

  const behind = sim.simulate([U('A', null, 2, 20), U('H', 'hype', 2, 20)], [U('E', null, 1, 20)], { round: 0 });
  assert.equal(caps(behind)[1], 'H juiced A: +2 ATK');

  const two = sim.simulate(
    [U('A', null, 2, 20), U('H1', 'hype', 3, 20), U('H2', 'hype', 2, 20)],
    [U('E', null, 1, 30)],
    { round: 0 }
  );
  assert.deepEqual(caps(two).slice(1, 3), ['H1 juiced A: +2 ATK', 'H2 juiced A: +2 ATK']);
  assert.equal(two.frames[2].you[0].atk, 6);
});

test('guard, dodo, cover and patch do nothing at index 0', () => {
  // ENGB-08 / ENGB-06: they all act on the friend AHEAD, which index 0 does not have.
  const guard0 = sim.simulate([U('G', 'guard', 2, 20), U('A', null, 2, 20)], [U('E', null, 1, 20)], { round: 0 });
  assert.equal(caps(guard0).some((c) => c.includes('pads')), false);
  const guard1 = sim.simulate([U('A', null, 2, 20), U('G', 'guard', 2, 20)], [U('E', null, 1, 20)], { round: 0 });
  assert.equal(caps(guard1)[1], 'G pads A: +2 HP');

  const dodo0 = sim.simulate([U('D', 'dodo', 4, 20), U('A', null, 2, 20)], [U('E', null, 1, 20)], { round: 0 });
  assert.equal(caps(dodo0).some((c) => c.includes('hypes')), false);
  const dodo1 = sim.simulate([U('A', null, 2, 20), U('D', 'dodo', 4, 20)], [U('E', null, 1, 20)], { round: 0 });
  assert.equal(caps(dodo1)[1], 'D hypes A: +2 ATK');            // floor(4 * 50 / 100)

  // cover reacts to the friend ahead fainting: at index 0 it can never fire, at index 1 it does
  const cover0 = sim.simulate([U('C', 'cover', 1, 1), U('A', null, 1, 20)], [U('E', null, 5, 20)], { round: 0 });
  assert.equal(caps(cover0).some((c) => c.includes('covers the fall')), false);
  const cover1 = sim.simulate([U('X', null, 1, 1), U('C', 'cover', 1, 20)], [U('E', null, 5, 20)], { round: 0 });
  assert.equal(caps(cover1).some((c) => c.includes('C covers the fall: +2 ATK')), true);

  const patch0 = sim.simulate([U('P', 'patch', 1, 20), U('A', null, 1, 20)], [U('E', null, 2, 20)], { round: 0 });
  assert.equal(caps(patch0).some((c) => c.includes('patches')), false);
  const patch1 = sim.simulate([U('A', null, 1, 20), U('P', 'patch', 1, 20)], [U('E', null, 2, 20)], { round: 0 });
  assert.equal(caps(patch1).some((c) => c === 'P patches A: +1 HP'), true);
});

test('dump at the front faints for nothing', () => {
  // ENGB-09: dump@front was fielded 27 times for a 7.4% win rate.
  const front = sim.simulate([U('D', 'dump', 4, 20), U('A', null, 2, 20)], [U('E', null, 1, 20)], { round: 0 });
  assert.deepEqual(caps(front).slice(1, 3), ['D is knocked out', 'A and E trade: -1 HP / -2 HP']);
  assert.equal(front.frames[2].you.length, 1);
  assert.equal(front.frames[2].you[0].atk, 2);                  // nothing was handed over

  const behind = sim.simulate([U('A', null, 2, 20), U('D', 'dump', 4, 20)], [U('E', null, 1, 20)], { round: 0 });
  assert.deepEqual(caps(behind).slice(1, 3), ['D is knocked out', 'D hands A +2 ATK']);
  assert.equal(behind.frames[2].you[0].atk, 4);
});

test('spotlight fires only at index 0, last_word only when last', () => {
  const spot0 = sim.simulate([U('S', 'spotlight', 2, 20), U('A', null, 2, 20)], [U('E', null, 1, 20)], { round: 0 });
  assert.equal(caps(spot0)[1], 'S takes the spotlight: 2 to E');
  const spot1 = sim.simulate([U('A', null, 2, 20), U('S', 'spotlight', 2, 20)], [U('E', null, 1, 20)], { round: 0 });
  assert.equal(caps(spot1).some((c) => c.includes('spotlight')), false);

  const last = sim.simulate([U('A', null, 2, 20), U('L', 'last_word', 2, 20)], [U('E0', null, 1, 20), U('E1', null, 1, 20)], { round: 0 });
  assert.equal(caps(last)[1], 'L has the last word: 3 to E1');   // the LAST enemy, not the front
  const notLast = sim.simulate([U('L', 'last_word', 2, 20), U('A', null, 2, 20)], [U('E0', null, 1, 20), U('E1', null, 1, 20)], { round: 0 });
  assert.equal(caps(notLast).some((c) => c.includes('last word')), false);
  // "last" means last index, so a lone unit is last
  const lone = sim.simulate([U('L', 'last_word', 2, 20)], [U('E0', null, 1, 20), U('E1', null, 1, 20)], { round: 0 });
  assert.equal(caps(lone)[1], 'L has the last word: 3 to E1');
});

test('mosquito hits a random enemy, not the enemy front', () => {
  // ENGB-04: the kitText says "enemy front"; the server keeps the legacy seeded random snipe.
  const three = sim.simulate(
    [U('M', 'mosquito', 1, 20)],
    [U('E0', null, 1, 20), U('E1', null, 1, 20), U('E2', null, 1, 20)],
    { round: 0 }
  );
  assert.equal(caps(three)[1], 'M snipes E2 for 1');             // seed 101: the back one
  const two = sim.simulate([U('M', 'mosquito', 1, 20)], [U('E0', null, 1, 20), U('E1', null, 1, 20)], { round: 0 });
  assert.equal(caps(two)[1], 'M snipes E1 for 1');
});

test('honey summons a 1/1 Drone at the fainted seat', () => {
  // ENGB-07: honey is not +2 HP on the unit.
  const r = sim.simulate([U('X', null, 1, 1, true), U('B', null, 1, 20)], [U('E', null, 5, 20)], { round: 0 });
  assert.deepEqual(caps(r).slice(1, 4), ['X and E trade: -5 HP / -1 HP', 'X is knocked out', 'Drone joins your side']);
  assert.deepEqual(stats(r.frames[3].you), ['Drone 1/1', 'B 1/20']);
  // the Drone takes the fainted unit's SEAT, not the back of the line: sidestep kills our middle
  const mid = sim.simulate(
    [U('F', null, 1, 20), U('X', null, 1, 1, true), U('B', null, 1, 20)],
    [U('S', 'sidestep', 1, 20)],
    { round: 0 }
  );
  const joined = mid.frames.findIndex((f) => f.caption === 'Drone joins your side');
  assert.equal(joined > 0, true);
  assert.deepEqual(stats(mid.frames[joined].you), ['F 1/20', 'Drone 1/1', 'B 1/20']);
});

test('potato is tempAtk only, and honey and potato are exclusive', () => {
  // ENGB-03: potato is +2 ATK for this battle, never a permanent +1/+1, and it erases honey.
  const base = sim.unitFromCatalog('Webby');
  const potato = sim.unitFromCatalog('Webby', { food: 'potato' });
  assert.deepEqual(potato, { name: 'Webby', kitId: 'bulk', atk: base.atk + 2, hp: base.hp, honey: false });
  const honeyed = sim.unitFromCatalog('Webby', { food: 'honey' });
  assert.deepEqual(honeyed, { name: 'Webby', kitId: 'bulk', atk: base.atk, hp: base.hp, honey: true });
  assert.deepEqual(sim.unitFromCatalog('Webby', { honey: true, potato: true }).honey, false);
  const apple = sim.unitFromCatalog('Webby', { food: 'apple' });
  assert.deepEqual([apple.atk, apple.hp], [base.atk + 1, base.hp + 1]);
});

test('unitFromCatalog reads the 81-bot catalog, season 2 included', () => {
  assert.equal(sim.unitFromCatalog('X High Coach').kitId, 'reach_check');
  assert.equal(sim.unitFromCatalog('company docs q&a').kitId, 'guard');    // punctuation-insensitive
  assert.throws(() => sim.unitFromCatalog('No Such Bot'), /unknown bot/);
});

// ------------------------------------------------------------------ Season-2 seat rules
test('back is the LAST index, not index 2', () => {
  // docs/ENGINE_BATTLE.md §2.2: "back = index 2" reproduces only 94.5% of the S2 battles.
  const two = sim.simulate(
    [U('A', null, 1, 20), U('B', null, 1, 20)],
    [U('E', null, 1, 20)],
    { round: 2, seats: { back: 'pit_stop' } }
  );
  assert.equal(caps(two).includes('Pit stop: B +3 HP'), true);
  assert.equal(two.frames[1].you[1].hp, 23);
  // a lone unit is front AND back at once
  const lone = sim.simulate(
    [U('A', null, 1, 20)],
    [U('E', null, 1, 20)],
    { round: 2, seats: { front: 'spotlight', back: 'pit_stop' } }
  );
  const c = caps(lone);
  assert.equal(c.includes('Spotlight: A +2 ATK'), true);
  assert.equal(c.includes('Pit stop: A +3 HP'), true);
});

test('seat rules are active only for seats <= round', () => {
  const seats = { front: 'spotlight', middle: 'pit_stop', back: 'warm_up' };
  const board = [U('A', null, 1, 20), U('B', null, 1, 20), U('C', null, 1, 20)];
  const active = (round) => caps(sim.simulate(board, [U('E', null, 1, 40)], { round, seats }))
    .filter((c) => /^(Spotlight|Pit stop|Warm-up):/.test(c))
    .map((c) => c.split(':')[0]);
  assert.deepEqual([...new Set(active(0))], ['Spotlight']);
  assert.deepEqual([...new Set(active(1))], ['Spotlight', 'Pit stop']);
  assert.deepEqual([...new Set(active(2))], ['Spotlight', 'Pit stop', 'Warm-up']);
});

test('hot seat and hard hat behave as recorded', () => {
  // hot seat: direct HP loss before every exchange except the first, no hurt triggers.
  const hot = sim.simulate(
    [U('A', 'peacock', 1, 20)],
    [U('E', null, 1, 20)],
    { round: 0, seats: { front: 'hot_seat' } }
  );
  assert.equal(caps(hot)[1], 'A and E trade: -1 HP / -1 HP');        // nothing before the first swing
  assert.equal(caps(hot).filter((c) => c === 'Hot seat: A -1 HP').length > 0, true);
  // hard hat: every damage instance of 2 or more is reduced by 1; a 1-damage hit is untouched
  const hard = sim.simulate(
    [U('A', null, 1, 20)],
    [U('E', null, 4, 20)],
    { round: 0, seats: { front: 'hard_hat' } }
  );
  assert.equal(caps(hard)[2], 'Hard hat: A takes 1 less');
  assert.equal(hard.frames[2].you[0].hp, 17);                        // 4 damage became 3
  assert.equal(caps(hard).filter((c) => c === 'Hard hat: E takes 1 less').length, 0);   // 1 damage stays 1
});

test('Hot seat knock-outs do not credit a previous attacker for drain', () => {
  // Recorded 2026-09-20T02:02:34.102Z, round 0. Deal Hunting hit Copy Humanizer,
  // then Hot seat dealt the last HP. The server did not grant a drain heal.
  const ours = [
    U('Copy Humanizer', 'flamingo', 2, 5),
    U('X Brief', 'echo', 2, 4),
    U('Meeting Recap Deck', 'echo', 3, 4),
  ];
  const theirs = [
    U('Deal Hunting', 'drain', 4, 2),
    U('Company Docs Q&A', 'guard', 2, 6),
    U('Site Audit', 'pin', 3, 3),
  ];
  const got = sim.simulate(ours, theirs, { round: 0, seats: { front: 'hot_seat' } });
  const captions = caps(got);
  assert.equal(got.winner, 'us');
  assert.equal(captions[5], 'Hot seat: Copy Humanizer -1 HP');
  assert.equal(captions[7], 'Copy Humanizer is knocked out');
  assert.equal(captions[10], 'X Brief and Deal Hunting trade: -4 HP / -4 HP');
  assert.ok(!captions.some((c) => c === 'Deal Hunting drains the knock-out: +2 HP'));
  assert.deepEqual(got.frames[7].them[0], { name: 'Deal Hunting', atk: 4, hp: 1 });
});

test('the 40-exchange cap compares total health, then total attack', () => {
  const health = sim.simulate(
    [U('Front', null, 0, 50), U('Back', null, 0, 50)],
    [U('Enemy', null, 0, 80)],
    { round: 0 }
  );
  assert.equal(health.turns, 40);
  assert.equal(health.winner, 'us');

  const attack = sim.simulate(
    [U('Front', null, 0, 50), U('Back', null, 3, 50)],
    [U('Enemy', null, 0, 100)],
    { round: 0 }
  );
  assert.equal(attack.turns, 40);
  assert.equal(attack.winner, 'us');

  const drawn = sim.simulate([U('Us', null, 0, 80)], [U('Enemy', null, 0, 80)], { round: 0 });
  assert.equal(drawn.turns, 40);
  assert.equal(drawn.winner, 'draw');
});

// ------------------------------------------------------------------ bestSeating
test('bestSeating scores every distinct order against a weighted pool', () => {
  const units = [U('Wall', 'bulk', 1, 12), U('Hitter', null, 6, 2), U('Cheap', null, 1, 1)];
  const pool = [[U('E', null, 3, 6)], [U('F', null, 2, 9)]];
  const rows = sim.bestSeating(units, pool, { round: 0 });
  assert.equal(rows.length, 6);
  for (const r of rows) assert.equal(r.order.length, 3);
  assert.equal(rows[0].score >= rows[rows.length - 1].score, true);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i - 1].score >= rows[i].score, true);
  // the score is the weighted mean utility, so it stays in [0, 1]
  for (const r of rows) assert.equal(r.score >= 0 && r.score <= 1, true);
});

test('bestSeating: duplicate units are scored once', () => {
  const twin = [U('T', 'bulk', 2, 6), U('T', 'bulk', 2, 6), U('Other', null, 3, 4)];
  assert.equal(sim.bestSeating(twin, [[U('E', null, 3, 6)]], { round: 0 }).length, 3);
});

test('bestSeating: weights and per-entry seats', () => {
  const units = [U('A', null, 2, 6), U('B', null, 4, 2)];
  const losing = [U('Big', null, 9, 9)];
  const winning = [U('Small', null, 1, 1)];
  const heavyLoss = sim.bestSeating(units, [{ board: losing, weight: 9 }, { board: winning, weight: 1 }], { round: 0 });
  const heavyWin = sim.bestSeating(units, [{ board: losing, weight: 1 }, { board: winning, weight: 9 }], { round: 0 });
  assert.equal(heavyWin[0].score > heavyLoss[0].score, true);

  // a per-entry seat rule overrides opts.seats for that entry only
  const withSeats = sim.bestSeating(units, [{ board: losing, seats: { front: 'pit_stop' } }], { round: 0 });
  const without = sim.bestSeating(units, [{ board: losing }], { round: 0 });
  assert.equal(withSeats.length, without.length);
  const seatsEverywhere = sim.bestSeating(units, [losing], { round: 0, seats: { front: 'pit_stop' } });
  assert.deepEqual(withSeats.map((r) => r.score), seatsEverywhere.map((r) => r.score));
});

test('bestSeating: utility weights change the ranking', () => {
  // Round 2 at 1-0: a draw wins the match, so a draw must count as a win (strategy rule 8).
  const units = [U('A', null, 3, 3), U('B', null, 2, 2)];
  const pool = [[U('E', null, 3, 3), U('F', null, 2, 2)], [U('S', null, 1, 1)]];  // a draw and a win
  const top = (o) => sim.bestSeating(units, pool, { round: 2, ...o })[0].score;
  assert.equal(top({}), 0.75);
  assert.equal(top({ utility: { win: 1, draw: 1, loss: 0 } }), 1);                // at 1-0 a draw wins
  assert.equal(top({ utility: { win: 1, draw: 0, loss: 0 } }), 0.5);              // at 0-1 it loses
});

test('simulate does not mutate the boards it is given', () => {
  const us = [U('A', 'bulk', 2, 6)];
  const them = [U('E', null, 3, 3)];
  const before = JSON.stringify([us, them]);
  sim.simulate(us, them, { round: 0 });
  sim.outcome(us, them, { round: 1 });
  sim.bestSeating(us, [them], { round: 0 });
  assert.equal(JSON.stringify([us, them]), before);
});

// ---- engine facts learned from 1,410 live season-2 battles on 2026-09-19 (all replay frame-exact)
test('live 2026-09-19: route buffs friends only, recall with 0 ATK is silent, red_flag is -3 ATK', () => {
  const master = { name: 'Master', kitId: 'route', atk: 5, hp: 5, honey: false };
  const a = { name: 'Webby', kitId: 'bulk', atk: 3, hp: 5, honey: false };
  const b = { name: 'Cooper', kitId: 'echo', atk: 2, hp: 5, honey: false };
  const enemy = [{ name: 'Imogen', kitId: 'bulk', atk: 2, hp: 6, honey: false }];
  const r = sim.simulate([a, b, master], enemy, { round: 2 });
  const after = r.frames.find((f) => /routes the work/.test(f.caption));
  assert.ok(after, 'route fires from the back seat');
  assert.deepStrictEqual(after.you.map((u) => [u.name, u.atk, u.hp]), [['Webby', 4, 6], ['Cooper', 3, 6], ['Master', 5, 5]], 'each FRIEND +1/+1, Master untouched');
  // recall passes its ATK to the unit behind; with 0 ATK there is nothing to pass and no caption
  const memento0 = { name: 'Memento', kitId: 'recall', atk: 0, hp: 1, honey: false };
  const r2 = sim.simulate([memento0, { ...a }], [{ name: 'Webby', kitId: 'bulk', atk: 5, hp: 9, honey: false }], { round: 1 });
  assert.ok(!r2.frames.some((f) => /passes its memory/.test(f.caption)));
  const memento3 = { ...memento0, atk: 3 };
  const r3 = sim.simulate([memento3, { ...a }], [{ name: 'Webby', kitId: 'bulk', atk: 5, hp: 9, honey: false }], { round: 1 });
  assert.ok(r3.frames.some((f) => f.caption === 'Memento passes its memory to Webby: +3 ATK'));
  // DeckLens: the strongest enemy loses 3 ATK at start of battle
  const deck = { name: 'DeckLens', kitId: 'red_flag', atk: 4, hp: 7, honey: false };
  const r4 = sim.simulate([deck], [{ name: 'Office Ops Desk', kitId: 'hold_the_line', atk: 7, hp: 9, honey: false }], { round: 2 });
  const flagged = r4.frames.find((f) => /flags/.test(f.caption));
  assert.strictEqual(flagged.caption, 'DeckLens flags Office Ops Desk: -3 ATK');
  assert.strictEqual(flagged.them[0].atk, 4);
});

test('live 2026-09-19: a 0-damage hit still triggers hurt kits, and caffeinate clamps inside the hit', () => {
  // an attacker flagged down to 0 ATK: "trade: -0 HP" then hold_the_line still "holds: +1 HP"
  const ops = { name: 'Office Ops Desk', kitId: 'hold_the_line', atk: 5, hp: 5, honey: false };
  const zero = { name: 'Zero', kitId: null, atk: 0, hp: 20, honey: false };
  const r = sim.simulate([ops], [zero], { round: 1 });
  const i = r.frames.findIndex((f) => /trade: -0 HP/.test(f.caption));
  assert.ok(i > 0, 'a 0-damage trade happened');
  assert.strictEqual(r.frames[i + 1].caption, 'Office Ops Desk holds: +1 HP');
  // caffeinate: the trade frame already shows 1 HP, then "stays awake", then the enemy's KO
  const dev = { name: 'Apple Dev', kitId: 'caffeinate', atk: 6, hp: 1, honey: false };
  const foe = { name: 'Foe', kitId: null, atk: 9, hp: 3, honey: false };
  const r2 = sim.simulate([dev], [foe], { round: 2 });
  const t = r2.frames.findIndex((f) => /trade/.test(f.caption));
  assert.strictEqual(r2.frames[t].you[0].hp, 1, 'held at 1 HP inside the hit');
  assert.strictEqual(r2.frames[t + 1].caption, 'Apple Dev stays awake: 1 HP');
  assert.strictEqual(r2.frames[t + 2].caption, 'Foe is knocked out');
  assert.strictEqual(r2.winner, 'us');
  // and only once
  const r3 = sim.simulate([{ ...dev, hp: 1 }], [{ name: 'Foe', kitId: null, atk: 9, hp: 30, honey: false }], { round: 2 });
  assert.strictEqual(r3.frames.filter((f) => /stays awake/.test(f.caption)).length, 1);
  assert.strictEqual(r3.winner, 'them');
});
