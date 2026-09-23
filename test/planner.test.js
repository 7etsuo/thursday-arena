'use strict';
/*
 * lib/planner.js.  The interesting tests are the property ones at the bottom: the contract's
 * guarantees are asserted against a few hundred seeded random shop states rather than a handful of
 * hand-picked ones, because the guarantees are what the live loop relies on.
 */
const test = require('node:test');
const assert = require('node:assert');

const sim = require('../lib/sim');
const shop = require('../lib/shop_model');
const catalog = require('../lib/catalog');
const planner = require('../lib/planner');

const u = (name, o) => sim.unitFromCatalog(name, o);
const names = (order) => order.map((x) => x.name);

// A small fixed target: four real S1 R0 boards, equally weighted.
const TARGET = {
  entries: [
    { board: [u('Webby'), u('Cooper'), u('Writing Bot')], weight: 0.25, seats: null },
    { board: [u('Imogen'), u('X Brief'), u('Luma Pages')], weight: 0.25, seats: null },
    { board: [u('NYC Parent'), u('Call Follow-Ups'), u('WTD')], weight: 0.25, seats: null },
    { board: [u('The Morning Newspaper'), u('Meeting Recap Deck'), u('Writing Bot')], weight: 0.25, seats: null },
  ],
};

const mulberry32 = sim.mulberry32;   // the repo's one seeded stream (review R3-7)

function state(over = {}) {
  return {
    round: 0,
    gold: 10,
    board: [],
    offers: [null, null, null],
    frozen: [false, false, false],
    food: null,
    series: { you: 0, them: 0 },
    seats: null,
    season: 1,
    rerolls: 0,
    nextUid: 1,
    ...over,
  };
}

const offer = (name, i) => {
  const b = catalog.byName(name);
  return { shopIndex: i, name: b.name, kitId: b.kitId, atk: b.attack, hp: b.health, cost: catalog.PRICES[b.rarity], rarity: b.rarity, frozen: false };
};
const boardUnit = (name, i, over = {}) => {
  const b = catalog.byName(name);
  return { uid: i + 1, name: b.name, kitId: b.kitId, atk: b.attack, hp: b.health, tempAtk: 0, honey: false, potato: false, cost: catalog.PRICES[b.rarity], rarity: b.rarity, ...over };
};

// ------------------------------------------------------------------ utility

test('utility: only the final round changes the objective', () => {
  // A match is at most 3 rounds and the result compares wins, so 1-1 and 0-0 are drawn matches
  // (docs/ENGINE_SHOP.md §4.7).  Rounds 0 and 1 are not final at any score.
  for (const r of [0, 1]) {
    for (const s of [{ you: 0, them: 0 }, { you: 1, them: 0 }, { you: 0, them: 1 }]) {
      assert.deepStrictEqual(planner.utility(r, s), { win: 1, draw: 0.5, loss: 0 });
    }
  }
  assert.deepStrictEqual(planner.utility(2, { you: 1, them: 0 }), { win: 1, draw: 1, loss: 0 });
  assert.deepStrictEqual(planner.utility(2, { you: 0, them: 1 }), { win: 1, draw: 0, loss: 0 });
  assert.deepStrictEqual(planner.utility(2, { you: 1, them: 1 }), { win: 1, draw: 0.5, loss: 0 });
  assert.deepStrictEqual(planner.utility(2, { you: 0, them: 0 }), { win: 1, draw: 0.5, loss: 0 });
  assert.deepStrictEqual(planner.utility(2, undefined), { win: 1, draw: 0.5, loss: 0 });
});

test('utility: at 1-0 the final round values a draw like a win, at 0-1 like a loss', () => {
  // Concrete check that the switch actually moves a decision: a board that can only draw is
  // preferred over one that can only lose when 1-0, and is worth nothing more than a loss at 0-1.
  const us = [u('Webby'), u('Cooper'), u('Writing Bot')];
  const drawTarget = { entries: [{ board: us.map((x) => ({ ...x })), weight: 1, seats: null }] };
  const lead = planner.evaluate(us, drawTarget, { round: 2, utility: planner.utility(2, { you: 1, them: 0 }) });
  const deficit = planner.evaluate(us, drawTarget, { round: 2, utility: planner.utility(2, { you: 0, them: 1 }) });
  assert.strictEqual(sim.outcome(us, us.map((x) => ({ ...x })), { round: 2 }), 'draw');
  assert.strictEqual(lead.score, 1);
  assert.strictEqual(deficit.score, 0);
});

test('utility: planStep and seatingActions really use it when the caller does not pass one', () => {
  // Both call sites defaulted to `utility(round, series)`, and replacing either default with a flat
  // 1/0.5/0 left the whole suite green: contract strategy rule 8 could be disconnected in silence
  // (review R3-2).  A board that can only DRAW is worth a match win at 1-0 and a loss at 0-1.
  const mirror = [u('Webby'), u('Cooper'), u('Writing Bot')];
  const drawTarget = { entries: [{ board: mirror.map((x) => ({ ...x })), weight: 1, seats: null }] };
  assert.strictEqual(sim.outcome(mirror, mirror.map((x) => ({ ...x })), { round: 2 }), 'draw');

  const S = (series) => state({
    round: 2, gold: 0, food: null, series,
    board: mirror.map((x, i) => boardUnit(x.name, i)),
    offers: [null, null, null],
  });
  const lead = planner.planStep(S({ you: 1, them: 0 }), { target: drawTarget });
  const deficit = planner.planStep(S({ you: 0, them: 1 }), { target: drawTarget });
  assert.strictEqual(lead.value, 1, 'at 1-0 a drawn final round wins the match');
  assert.strictEqual(deficit.value, 0, 'at 0-1 it loses it');
  assert.notStrictEqual(lead.value, deficit.value);

  // seatingActions: an order that only draws beats an order that loses at 1-0, and the reverse at
  // 0-1 -- so the two scores must pick different orders for the same board.
  const wall = u('Webby');
  const glass = u('skippy');
  const mid = u('Cooper');
  const enemy = { entries: [{ board: [u('Webby'), u('Cooper'), u('skippy')], weight: 1, seats: null }] };
  const board = [wall, mid, glass].map((x, i) => boardUnit(x.name, i));
  const at = (series) => planner.seatingActions(state({ round: 2, series, board }), enemy);
  // the assertion that matters is that the default is the SERIES-AWARE table, not a flat one:
  const flat = planner.seatingActions(state({ round: 2, series: { you: 1, them: 0 }, board }), enemy, {
    utility: { win: 1, draw: 0.5, loss: 0 },
  });
  const seriesAware = at({ you: 1, them: 0 });
  assert.deepStrictEqual(
    seriesAware,
    planner.seatingActions(state({ round: 2, series: { you: 1, them: 0 }, board }), enemy, {
      utility: planner.utility(2, { you: 1, them: 0 }),
    }),
    'the default is utility(round, series)'
  );
  // and the flat table must actually be a different question: at 1-0 a draw wins the match, so the
  // default cannot equal the flat answer whenever the two disagree on the best order
  const flatOrder = planner.evaluate(board, enemy, { round: 2, utility: { win: 1, draw: 0.5, loss: 0 } }).order.map((u) => u.name);
  const awareOrder = planner.evaluate(board, enemy, { round: 2, utility: planner.utility(2, { you: 1, them: 0 }) }).order.map((u) => u.name);
  if (flatOrder.join() !== awareOrder.join()) assert.notDeepStrictEqual(flat, seriesAware);
  assert.ok(Array.isArray(flat) && Array.isArray(seriesAware));
});

test('seatingActions: the draw weighting can change the chosen order', () => {
  // The property test at the bottom never happened to generate a board where the draw weight flips
  // the best order, so the seatingActions default was untestable there (review R3-2).
  const rng = mulberry32(31337);
  const pool = catalog.unlockedPool(2, 1);
  let found = null;
  for (let t = 0; t < 4000 && !found; t++) {
    const pick = () => pool[Math.floor(rng() * pool.length)];
    const board = [pick(), pick(), pick()].map((b, i) => boardUnit(b.name, i));
    const enemy = { entries: [{ board: [pick(), pick(), pick()].map((b) => u(b.name)), weight: 1, seats: null }] };
    const lead = planner.seatingActions(state({ round: 2, series: { you: 1, them: 0 }, board }), enemy);
    const deficit = planner.seatingActions(state({ round: 2, series: { you: 0, them: 1 }, board }), enemy);
    if (JSON.stringify(lead) !== JSON.stringify(deficit)) found = { board, lead, deficit };
  }
  assert.ok(found, 'no board where 1-0 and 0-1 seat differently; the utility default is unpinned');
});

// ------------------------------------------------------------------ evaluate

test('evaluate: returns the best seat order and agrees with sim.bestSeating', () => {
  const units = [u('Writing Bot'), u('Webby'), u('Cooper')];
  const got = planner.evaluate(units, TARGET, { round: 0 });
  const want = sim.bestSeating(units, TARGET.entries, { round: 0, utility: { win: 1, draw: 0.5, loss: 0 } })[0];
  assert.strictEqual(got.score, want.score);
  assert.deepStrictEqual(names(got.order), names(want.order));
  assert.ok(got.score >= 0 && got.score <= 1);
  assert.strictEqual(got.order.length, 3);
});

test('evaluate: accepts a bare array of entries and a build() result alike', () => {
  const units = [u('Webby'), u('Cooper'), u('Writing Bot')];
  const a = planner.evaluate(units, TARGET, { round: 0 });
  const b = planner.evaluate(units, TARGET.entries, { round: 0 });
  assert.strictEqual(a.score, b.score);
});

test('evaluate: an empty target scores 0 and still returns every unit once', () => {
  const units = [u('Webby'), u('Cooper')];
  const r = planner.evaluate(units, { entries: [] }, { round: 0 });
  assert.strictEqual(r.score, 0);
  assert.deepStrictEqual(names(r.order).sort(), ['Cooper', 'Webby']);
  assert.deepStrictEqual(planner.evaluate([], TARGET, { round: 0 }), { score: 0, order: [] });
});

test('evaluate: a shared cache returns the same score and a correctly ordered board', () => {
  const cache = new Map();
  const a = planner.evaluate([u('Writing Bot'), u('Webby'), u('Cooper')], TARGET, { round: 0, cache });
  // Same multiset, different input order, and tagged objects: the cached order must be replayed
  // onto THESE objects, not the ones the first call happened to hold.
  const tagged = [u('Cooper'), u('Writing Bot'), u('Webby')].map((x, i) => ({ ...x, seat: i }));
  const b = planner.evaluate(tagged, TARGET, { round: 0, cache });
  assert.strictEqual(a.score, b.score);
  assert.deepStrictEqual(names(a.order), names(b.order));
  assert.deepStrictEqual(b.order.map((x) => x.seat).sort(), [0, 1, 2]);
  assert.ok(b.order.every((x) => tagged.includes(x)));
});

test('evaluate: the season-2 seat rules reach the evaluation', () => {
  // Seat rules act on both teams from round i on (docs/ENGINE_BATTLE.md §3).  NOTE the sim's
  // contract: a pool entry that carries `seats` OVERRIDES opts.seats, and `seats: null` is an
  // override too -- lib/target.js therefore stamps the CURRENT match's seats onto every entry.
  const units = [u('Webby'), u('Cooper'), u('Writing Bot')];
  const bare = TARGET.entries.map((e) => ({ board: e.board, weight: e.weight }));   // no `seats` key
  const seen = new Set();
  for (const r of sim.SEAT_RULES) {
    const got = planner.evaluate(units, bare, { round: 2, seats: { front: r, middle: r, back: r } });
    assert.ok(Number.isFinite(got.score));
    seen.add(`${got.score}|${names(got.order)}`);
  }
  assert.ok(seen.size > 1, 'different seat rules must give different evaluations');

  // The override: entries pinned to seats: null ignore opts.seats entirely.
  const pinned = planner.evaluate(units, TARGET, { round: 2, seats: { front: 'hot_seat', middle: 'hot_seat', back: 'hot_seat' } });
  assert.strictEqual(pinned.score, planner.evaluate(units, TARGET, { round: 2 }).score);

  // Through the entries, the same rules do change the answer.
  const stamped = TARGET.entries.map((e) => ({ board: e.board, weight: e.weight, seats: { front: 'hot_seat', middle: 'hot_seat', back: 'hot_seat' } }));
  assert.notStrictEqual(planner.evaluate(units, stamped, { round: 2 }).score, pinned.score);
});

// ------------------------------------------------------------------ seatingActions

test('seatingActions: the emitted moves really produce the best order', () => {
  const S = state({ board: [boardUnit('Writing Bot', 0), boardUnit('Webby', 1), boardUnit('Cooper', 2)] });
  const want = planner.evaluate(shop.simUnits(S), TARGET, { round: 0 });
  const acts = planner.seatingActions(S, TARGET);
  let cur = S;
  for (const a of acts) {
    assert.strictEqual(a.type, 'move');
    assert.strictEqual(shop.legal(cur, a), true);
    cur = shop.apply(cur, a);
  }
  assert.deepStrictEqual(shop.simUnits(cur).map((x) => x.name), names(want.order));
  assert.ok(acts.length <= 3, `3 units need at most 3 adjacent swaps, got ${acts.length}`);
  assert.deepStrictEqual(planner.seatingActions(cur, TARGET), []);   // already seated: no churn
});

test('seatingActions: nothing to do with fewer than two units', () => {
  assert.deepStrictEqual(planner.seatingActions(state(), TARGET), []);
  assert.deepStrictEqual(planner.seatingActions(state({ board: [boardUnit('Webby', 0)] }), TARGET), []);
});

// ------------------------------------------------------------------ look-ahead primitives

test('completions: only affordable buys, and canFill sees the budget', () => {
  const S = state({ gold: 7, offers: [offer('Webby', 0), offer('Cooper', 1), offer('Writing Bot', 2)] });
  const plans = planner.completions(S);
  assert.ok(plans.every((c) => c.cost <= 7));
  assert.ok(!plans.some((c) => c.plan.length === 3), '3 commons cost 9, which 7 gold cannot buy');
  assert.strictEqual(planner.canFill(S), false);
  assert.strictEqual(planner.canFill({ ...S, gold: 9 }), true);
  assert.strictEqual(planner.canFill({ ...S, board: [boardUnit('Webby', 0), boardUnit('Cooper', 1), boardUnit('WTD', 2)] }), true);
});

test('completedValue: a candidate is worth the FULL board it leads to, never a short one', () => {
  // strategy.md §4.2 "always field 3 units" is structural, not a patch: a candidate is scored as
  // the board it completes to, and while a full board is affordable only full completions count.
  const V = (units) => planner.evaluate(units, TARGET, { round: 0, seats: null });
  const simUnits = (S) => shop.simUnits(S);
  const buyAll = (S, plan) => plan.reduce((acc, i) => shop.apply(acc, { type: 'buy', shopIndex: i }), S);

  const rich = state({ gold: 10, offers: [offer('Webby', 0), offer('Cooper', 1), offer('Writing Bot', 2)] });
  const best = planner.completedValue(rich, V);
  assert.strictEqual(best.plan.length, 3, '10 gold buys all three commons, so the plan fills the board');
  assert.strictEqual(best.state.board.length, 3);
  // and it is the best of the full completions, not merely the first one found.
  for (const c of planner.completions(rich).filter((c) => c.plan.length === 3)) {
    assert.ok(best.score >= V(simUnits(buyAll(rich, c.plan))).score - 1e-12);
  }

  // A board already at BOARD_MAX completes with an empty plan and is scored as it stands.
  const full = state({ gold: 4, board: [boardUnit('Webby', 0), boardUnit('Cooper', 1), boardUnit('WTD', 2)] });
  const bf = planner.completedValue(full, V);
  assert.deepStrictEqual(bf.plan, []);
  assert.strictEqual(bf.state, full);
  assert.strictEqual(bf.score, V(simUnits(full)).score);

  // The guard that matters: when a FULL board is affordable, a SHORT one is not even a candidate,
  // however much better it scores this round.  Removing `full.length ? full : all` used to leave the
  // whole suite green because every fixture's full board also scored higher (review R3-3a).
  const trap = state({
    gold: 3,
    board: [boardUnit('GTM Connections', 0, { atk: 5, hp: 8 }), boardUnit('Tech Demos', 1, { atk: 6, hp: 4 })],
    offers: [offer('Home robots', 0), null, null],
  });
  const shortScore = V(simUnits(trap)).score;
  const fullScore = V(simUnits(buyAll(trap, [0]))).score;
  assert.ok(shortScore > fullScore + 0.5, `fixture is stale: short ${shortScore} vs full ${fullScore}`);
  const bt = planner.completedValue(trap, V);
  assert.strictEqual(bt.plan.length, 1, 'a full board is affordable, so only full completions count');
  assert.strictEqual(bt.score, fullScore, 'and it is scored as the full board, not the short one');

  // When a full board is NOT affordable the filter falls back to every completion and returns the
  // highest-scoring one, which may be short -- against a 3-unit target every short board loses, so
  // the scores tie at 0 and the tie goes to the shortest plan.
  const poor = { ...rich, gold: 7 };
  const bp = planner.completedValue(poor, V);
  assert.ok(bp, 'completedValue never gives up');
  assert.ok(bp.plan.length <= 2, '7 gold cannot buy three commons');
  for (const c of planner.completions(poor)) {
    assert.ok(bp.score >= V(simUnits(buyAll(poor, c.plan))).score - 1e-12, 'it is still the max');
  }
  // That tie is harmless because filling the board is planStep's guarantee (G1/G7), not
  // completedValue's: with 7 gold the planner still buys as many units as it can pay for.
  let S = poor;
  for (let i = 0; i < 8; i++) {
    const p = planner.planStep(S, { target: TARGET, rng: null });
    if (!p || p.done || !p.actions.length) break;
    for (const a of p.actions) {
      assert.strictEqual(shop.legal(S, a), true);
      S = shop.apply(S, a);
    }
  }
  assert.strictEqual(S.board.length, 2, 'two commons is everything 7 gold can field');
  assert.ok(S.gold < 3, 'and the leftover cannot buy a third');
});

test('rerollAllowed: the hard budget invariant, 3 gold per empty seat', () => {
  // strategy.md §7 STR-02: a reroll that leaves the board unfillable is what produced short boards.
  assert.strictEqual(planner.rerollAllowed(state({ gold: 10 })), true);        // 10-1 = 9 >= 3*3
  assert.strictEqual(planner.rerollAllowed(state({ gold: 9 })), false);        //  9-1 = 8  < 3*3
  assert.strictEqual(planner.rerollAllowed(state({ gold: 7, board: [boardUnit('Webby', 0)] })), true);
  assert.strictEqual(planner.rerollAllowed(state({ gold: 6, board: [boardUnit('Webby', 0)] })), false);
  assert.strictEqual(planner.rerollAllowed(state({ gold: 0 })), false);        // not even legal
});

test('singleMoves: never a bare sell, never a freeze, never a fill-breaking feed', () => {
  const S = state({
    round: 1,
    gold: 10,
    food: 'apple',
    board: [boardUnit('Webby', 0), boardUnit('Cooper', 1)],
    offers: [offer('Writing Bot', 0), offer('WTD', 1), null],
  });
  const moves = planner.singleMoves(S);
  assert.ok(moves.length > 0);
  for (const m of moves) {
    assert.ok(!m.actions.some((a) => a.type === 'freeze'));
    const sells = m.actions.filter((a) => a.type === 'sell').length;
    const buys = m.actions.filter((a) => a.type === 'buy').length;
    assert.ok(sells === 0 || buys === sells, 'a sell is only ever paired with a buy');
  }
  // 10 gold, one empty seat: a 3-gold feed still leaves 7, so feeds survive here...
  assert.ok(moves.some((m) => m.actions[0].type === 'feed'));
  // ...but with 5 gold the feed would leave 2, and the last seat could never be bought.
  const tight = planner.singleMoves({ ...S, gold: 5 });
  assert.ok(!tight.some((m) => m.actions[0].type === 'feed'));
});

test('singleMoves: the fill guard applies to a plain buy too, not only to feeds and swaps', () => {
  // The buy branch used to skip `ok(after)`, so a 1-unit board with 7 gold could buy a 6-gold epic
  // and fight two-handed: 27 of 3,124 seeded R2 states ended short (review R1-04).
  const S = state({
    round: 1, gold: 7, food: null,
    board: [boardUnit('Webby', 0)],
    offers: [offer('Writing Bot', 0), offer('Alfred', 1), offer('Cooper', 2)],   // Alfred is epic, 6
  });
  assert.strictEqual(planner.canFill(S), true, 'two commons are affordable out of 7 gold');
  const kinds = planner.singleMoves(S).map((m) => m.kind);
  assert.ok(kinds.includes('buy#0') && kinds.includes('buy#2'), `the 3-gold buys survive: ${kinds}`);
  assert.ok(!kinds.includes('buy#1'), `the 6-gold buy strands the board: ${kinds}`);

  // and the whole shop really does end with three units
  let cur = S;
  for (let i = 0; i < 12; i++) {
    const p = planner.planStep(cur, { target: TARGET, rng: null });
    if (!p || p.done || !p.actions.length) break;
    for (const a of p.actions) cur = shop.apply(cur, a);
  }
  assert.strictEqual(cur.board.length, 3, `ended with ${cur.board.map((x) => x.name)}`);
});

test('planStep: the apple carry-over is R1-only and puts the apple on the eventual front', () => {
  // strategy.md §4.5 scopes the rule to R1; `S.round < 2` also covered R0, where a full board has
  // 0-1 gold and the feed is never legal anyway.  And the tie-break is the seat the unit will hold
  // after re-seating, not the board index it happens to sit at (§3.3: 0.888 front vs 0.852 back).
  // A board that already beats every target entry: no feed can improve THIS round, so every
  // candidate ties and the branch under test is the one that fires.  This board also re-seats, so
  // "board index 0" and "the eventual front" are different units.
  const board = [
    boardUnit('Love ❤️', 0, { atk: 4, hp: 7 }),
    boardUnit('Haggle Bot', 1, { atk: 6, hp: 6 }),
    boardUnit('Talent Discovery', 2, { atk: 6, hp: 5 }),
  ];
  const S = state({ round: 1, gold: 3, food: 'apple', board, offers: [null, null, null] });
  const step = planner.planStep(S, { target: TARGET, rng: null });
  assert.match(step.reason, /apple carries/);
  assert.strictEqual(step.actions.length, 1);
  assert.strictEqual(step.actions[0].type, 'feed');

  const front = planner.evaluate(shop.simUnits(S).map((u2, i) => ({ ...u2, seat: i })), TARGET, {
    round: 1, seats: null, utility: planner.utility(1, S.series),
  }).order[0].seat;
  assert.notStrictEqual(front, 0, 'fixture is stale: the tie-break would be untestable');
  assert.strictEqual(step.actions[0].boardIndex, front, 'the apple went to the eventual front seat');

  // R0 never takes this branch: a full R0 board cannot afford a feed, so the rule is dead there.
  const r0 = planner.planStep({ ...S, round: 0 }, { target: TARGET, rng: null });
  assert.ok(!/apple carries/.test(r0.reason), `R0 took the R1-only branch: ${r0.reason}`);
});

// ------------------------------------------------------------------ planStep, specific shapes

test('planStep: R0 buys or rerolls, never a second reroll, and ends with three units', () => {
  const rng = mulberry32(7);
  let S = state({ gold: 10, food: 'honey', offers: [offer('skippy', 0), offer('Webby', 1), offer('Cooper', 2)] });
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const step = planner.planStep(S, { target: TARGET, rng });
    if (step.done) break;
    for (const a of step.actions) {
      seen.push(a.type);
      S = a.type === 'reroll' ? shop.sampleReroll(S, rng) : shop.apply(S, a);
    }
  }
  assert.strictEqual(S.board.length, 3, 'R0 must field three units with 10 gold');
  assert.ok(seen.filter((t) => t === 'reroll').length <= 1, `R0 rerolls at most once, saw ${seen}`);
  assert.ok(!seen.includes('freeze'));
});

test('planStep: R0 keeps the strong offer and rerolls away the weak one', () => {
  // Webby is the #3 R0 common (+0.145) and skippy is F tier (-0.126), strategy.md §2.2.
  const rng = mulberry32(11);
  const S = state({ gold: 10, offers: [offer('skippy', 0), offer('Webby', 1), offer('Hiring Signals', 2)] });
  const step = planner.planStep(S, { target: TARGET, rng });
  assert.strictEqual(step.actions.length, 1);
  assert.strictEqual(step.actions[0].type, 'buy');
  assert.strictEqual(S.offers[step.actions[0].shopIndex].name, 'Webby');
  assert.match(step.reason, /reroll after/);
});

test('planStep: R1 spends the gold and reports what it did', () => {
  const rng = mulberry32(3);
  let S = state({
    round: 1, gold: 10, food: 'apple',
    board: [boardUnit('skippy', 0), boardUnit('Cooper', 1), boardUnit('Luma Pages', 2)],
    offers: [offer('Webby', 0), offer('Credit Card Max', 1), offer('The Morning Newspaper', 2)],
  });
  const before = planner.evaluate(shop.simUnits(S), TARGET, { round: 1 }).score;
  let steps = 0;
  for (; steps < 24; steps++) {
    const step = planner.planStep(S, { target: TARGET, rng });
    assert.ok(typeof step.reason === 'string' && step.reason.length > 0);
    if (step.done) break;
    for (const a of step.actions) S = a.type === 'reroll' ? shop.sampleReroll(S, rng) : shop.apply(S, a);
  }
  assert.ok(steps < 24, 'the greedy loop terminates');
  assert.strictEqual(S.board.length, 3);
  assert.ok(S.gold < 10, 'gold was spent');
  assert.ok(planner.evaluate(shop.simUnits(S), TARGET, { round: 1 }).score > before);
});

test('planStep: done only when nothing is left to do', () => {
  const S = state({
    round: 1, gold: 0, food: null,
    board: [boardUnit('Webby', 0), boardUnit('Cooper', 1), boardUnit('Writing Bot', 2)],
    offers: [null, null, null],
  });
  const step = planner.planStep(S, { target: TARGET, rng: mulberry32(1) });
  assert.strictEqual(step.done, true);
  assert.deepStrictEqual(step.actions, []);
  assert.ok(step.value > 0);
});

test('planStep: fills an empty seat rather than reporting done', () => {
  // The buy cannot improve the score here (the target beats us either way), but a short board is
  // never acceptable: contract §lib/planner.js, strategy.md §4.7.
  const S = state({
    round: 1, gold: 3, food: null,
    board: [boardUnit('Webby', 0), boardUnit('Cooper', 1)],
    offers: [offer('Home robots', 0), null, null],
  });
  const step = planner.planStep(S, { target: TARGET, rng: mulberry32(2) });
  assert.ok(!step.done);
  assert.strictEqual(step.actions.length, 1);
  assert.strictEqual(step.actions[0].type, 'buy');
});

test('planStep: no rng means no reroll, and it says so by simply not rerolling', () => {
  const S = state({ gold: 10, offers: [offer('skippy', 0), offer('Hiring Signals', 1), offer('Home robots', 2)] });
  const step = planner.planStep(S, { target: TARGET });
  assert.ok(!step.actions.some((a) => a.type === 'reroll'));
});

test('planStep: a tight time budget degrades and names what it cut', () => {
  const big = { entries: [] };
  const rng = mulberry32(5);
  const pool = catalog.unlockedPool(2, 1);
  for (let i = 0; i < 40; i++) {
    big.entries.push({
      board: [pool[i % pool.length], pool[(i * 7) % pool.length], pool[(i * 13) % pool.length]].map((b) => u(b.name)),
      weight: 1 / 40,
      seats: null,
    });
  }
  const S = state({
    round: 1, gold: 10, food: 'apple',
    board: [boardUnit('Webby', 0), boardUnit('Cooper', 1), boardUnit('Writing Bot', 2)],
    offers: [offer('Credit Card Max', 0), offer('WTD', 1), offer('Imogen', 2)],
  });
  const t0 = Date.now();
  const step = planner.planStep(S, { target: big, rng, timeBudgetMs: 1 });
  const ms = Date.now() - t0;
  assert.match(step.reason, /\[cut: /, `expected a cut note, got "${step.reason}"`);
  assert.match(step.reason, /samples \d+->\d+|target \d+->\d+/);
  assert.ok(ms < 1500, `a 1 ms budget should not take ${ms} ms`);
  // The full target must be left untouched for the next caller.
  assert.strictEqual(big.entries.length, 40);
});

test('target trimming preserves the book/pool mixture under a tight budget', () => {
  const entries = [
    ...Array.from({ length: 5 }, (_, i) => ({ board: [i], weight: 0.1, source: 'book' })),
    ...Array.from({ length: 40 }, (_, i) => ({ board: [i + 5], weight: 0.0125, source: 'pool' })),
  ];
  const cut = planner.trimTarget(entries, 6);
  assert.equal(cut.length, 6);
  assert.equal(cut.filter((e) => e.source === 'book').length, 3);
  assert.equal(cut.filter((e) => e.source === 'pool').length, 3);
  for (const source of ['book', 'pool']) {
    const mass = cut.filter((e) => e.source === source).reduce((s, e) => s + e.weight, 0);
    assert.ok(Math.abs(mass - 0.5) < 1e-12, `${source} lost its intended share`);
  }
  assert.equal(entries.length, 45);
  assert.equal(entries[0].weight, 0.1, 'the full target is not mutated');
  assert.equal(planner.trimTarget(entries, 1)[0].weight, 1);
  const recent = planner.trimTarget([
    { board: ['old'], weight: 0.05, source: 'book' },
    { board: ['new'], weight: 0.45, source: 'book' },
    { board: ['pool1'], weight: 0.25, source: 'pool' },
    { board: ['pool2'], weight: 0.25, source: 'pool' },
  ], 2);
  assert.equal(recent.find((e) => e.source === 'book').board[0], 'new');
  assert.deepEqual(planner.trimTarget(entries.map(({ source, ...e }) => e), 2).map((e) => e.board), [[0], [1]],
    'an external target without source tags keeps its prefix behavior');
});

test('planStep: ctx.log receives the reason of every action', () => {
  const lines = [];
  const S = state({ round: 1, gold: 10, food: 'apple', board: [boardUnit('skippy', 0), boardUnit('Cooper', 1), boardUnit('Luma Pages', 2)], offers: [offer('Webby', 0), null, null] });
  planner.planStep(S, { target: TARGET, rng: mulberry32(9), log: (m) => lines.push(m) });
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /^r1 /);
});

// ------------------------------------------------------------------ properties over random shops

/** A random but legal-looking shop state; `season` 2 states also carry seat rules. */
function randomState(rng) {
  const round = Math.floor(rng() * 3);
  const season = rng() < 0.25 ? 2 : 1;
  const pool = catalog.unlockedPool(round, season);
  const pick = () => pool[Math.floor(rng() * pool.length)];
  const nBoard = Math.floor(rng() * 4);
  const board = [];
  for (let i = 0; i < nBoard; i++) {
    const b = pick();
    board.push({
      uid: i + 1, name: b.name, kitId: b.kitId,
      atk: b.attack + Math.floor(rng() * 3), hp: b.health + Math.floor(rng() * 3),
      tempAtk: rng() < 0.1 ? 2 : 0, honey: rng() < 0.2, potato: false,
      cost: catalog.PRICES[b.rarity], rarity: b.rarity,
    });
  }
  for (const x of board) if (x.tempAtk) { x.potato = true; x.honey = false; }
  const offers = [];
  const frozen = [];
  for (let i = 0; i < 3; i++) {
    if (rng() < 0.12) { offers.push(null); frozen.push(false); continue; }
    const b = pick();
    offers.push({ shopIndex: i, name: b.name, kitId: b.kitId, atk: b.attack, hp: b.health, cost: catalog.PRICES[b.rarity], rarity: b.rarity, frozen: false });
    frozen.push(false);
  }
  const wins = [[0, 0], [1, 0], [0, 1], [1, 1]][Math.floor(rng() * 4)];
  const SEATS = sim.SEAT_RULES;
  return {
    round,
    gold: Math.floor(rng() * 11),
    board,
    offers,
    frozen,
    food: [null, 'apple', 'honey', 'potato'][Math.floor(rng() * 4)],
    series: { you: wins[0], them: wins[1] },
    seats: season === 2
      ? { front: SEATS[Math.floor(rng() * SEATS.length)], middle: SEATS[Math.floor(rng() * SEATS.length)], back: SEATS[Math.floor(rng() * SEATS.length)] }
      : null,
    season,
    rerolls: rng() < 0.3 ? 1 : 0,
    nextUid: nBoard + 1,
  };
}

test('planStep: the contract guarantees hold over 240 seeded random shops', () => {
  const rng = mulberry32(20260919);
  let shops = 0;
  let stepsTaken = 0;
  let rerolls = 0;
  for (let t = 0; t < 240; t++) {
    let S = randomState(rng);
    const round = S.round;
    const cache = new Map();
    const startRerolls = S.rerolls;
    let steps = 0;
    for (; steps < 40; steps++) {
      const before = S;
      const step = planner.planStep(S, { target: TARGET, rng, cache });

      assert.ok(Array.isArray(step.actions), 'actions is always an array');
      assert.ok(typeof step.reason === 'string' && step.reason.length, 'every result carries a reason');
      assert.ok(Number.isFinite(step.value), 'every result carries a value');

      if (step.done || !step.actions.length) {
        assert.strictEqual(step.done, true, 'an empty action list must be marked done');
        // G1: never done while a seat is empty and an affordable offer exists.
        if (S.board.length < shop.BOARD_MAX) {
          const affordable = S.offers.some((o) => o && o.cost <= S.gold);
          assert.ok(!affordable, `done at ${S.board.length} units with an affordable offer (gold ${S.gold})`);
        }
        break;
      }

      const types = step.actions.map((a) => a.type);
      // G2: never a freeze (strategy.md §7 STR-11).
      assert.ok(!types.includes('freeze'), `freeze in ${JSON.stringify(step.actions)}`);
      // G3: a sell is only ever returned together with its buy.
      const sells = types.filter((x) => x === 'sell').length;
      if (sells) assert.deepStrictEqual(types, ['sell', 'buy'], `bare sell: ${types}`);
      assert.ok(step.actions.length <= 2, 'one action, or a [sell, buy] pair');

      // G4: every action is legal in sequence, per shop_model.legal.
      let probe = S;
      for (const a of step.actions) {
        assert.strictEqual(shop.legal(probe, a), true, `illegal ${a.type}: ${shop.legal(probe, a)}`);
        probe = shop.apply(probe, a);
      }

      // G5: a reroll never breaks the fill budget, and R0 rerolls at most once.
      if (types.includes('reroll')) {
        rerolls++;
        assert.ok(S.gold - shop.REROLL_COST >= 3 * (shop.BOARD_MAX - S.board.length),
          `reroll broke the budget: gold ${S.gold}, ${shop.BOARD_MAX - S.board.length} empty`);
        if (round === 0) assert.ok(S.rerolls === startRerolls && startRerolls === 0, 'a second R0 reroll');
      }

      for (const a of step.actions) {
        S = a.type === 'reroll' ? shop.sampleReroll(S, rng) : shop.apply(S, a);
      }
      // G6: termination -- every action the planner can return strictly decreases gold, and gold
      // is bounded by 10, so the loop cannot run away.
      assert.ok(S.gold < before.gold, `gold did not decrease: ${before.gold} -> ${S.gold} via ${types}`);
      assert.ok(S.board.length <= shop.BOARD_MAX);
      stepsTaken++;
    }
    assert.ok(steps < 40, 'planStep terminated');

    // G7: three units whenever the starting state could pay for three.
    if (S.board.length < shop.BOARD_MAX) {
      assert.ok(!S.offers.some((o) => o && o.cost <= S.gold),
        `left ${S.board.length} units with ${S.gold} gold and a buyable offer`);
    }
    shops++;
  }
  assert.strictEqual(shops, 240);
  assert.ok(stepsTaken > 100, `expected real work, took ${stepsTaken} steps`);
  assert.ok(rerolls > 0, 'the random shops should have produced some rerolls');
});

test('seatingActions: reachable by adjacent swaps for every random board', () => {
  const rng = mulberry32(4242);
  for (let t = 0; t < 120; t++) {
    const S = randomState(rng);
    if (S.board.length < 2) continue;
    const want = planner.evaluate(shop.simUnits(S), TARGET, { round: S.round, seats: S.seats, utility: planner.utility(S.round, S.series) });
    let cur = S;
    for (const a of planner.seatingActions(S, TARGET)) {
      assert.strictEqual(a.type, 'move');
      assert.strictEqual(a.dir, -1);
      assert.strictEqual(shop.legal(cur, a), true);
      cur = shop.apply(cur, a);
    }
    assert.deepStrictEqual(
      shop.simUnits(cur).map((x) => `${x.name}/${x.atk}/${x.hp}/${x.honey ? 1 : 0}`),
      want.order.map((x) => `${x.name}/${x.atk}/${x.hp}/${x.honey ? 1 : 0}`),
    );
  }
});

// ------------------------------------------------------------------ match-level valuation

test('matchValue: series rules, and utility() is its final-round special case', () => {
  const sure = (win, draw, loss) => ({ win, draw, loss });
  // a match already decided
  assert.strictEqual(planner.matchValue(1, { you: 2, them: 0 }, {}), 1);
  assert.strictEqual(planner.matchValue(1, { you: 0, them: 2 }, {}), 0);
  // final round: at 1-0 a draw WINS the match, at 0-1 a draw LOSES it, at 1-1 it is a drawn match
  assert.strictEqual(planner.matchValue(2, { you: 1, them: 0 }, { 2: sure(0, 1, 0) }), 1);
  assert.strictEqual(planner.matchValue(2, { you: 0, them: 1 }, { 2: sure(0, 1, 0) }), 0);
  assert.strictEqual(planner.matchValue(2, { you: 1, them: 1 }, { 2: sure(0, 1, 0) }), 0.5);
  assert.strictEqual(planner.matchValue(2, { you: 0, them: 0 }, { 2: sure(0, 1, 0) }), 0.5);
  // utility() is the final-round value up to an affine rescaling (at 1-0 a LOSS is a drawn match,
  // 0.5, which utility maps to 0): same ordering, same ties.
  for (const series of [{ you: 0, them: 0 }, { you: 1, them: 0 }, { you: 0, them: 1 }, { you: 1, them: 1 }]) {
    const u = planner.utility(2, series);
    const mv = (p) => planner.matchValue(2, series, { 2: p });
    const [w, d, l] = [mv(sure(1, 0, 0)), mv(sure(0, 1, 0)), mv(sure(0, 0, 1))];
    assert.strictEqual(Math.sign(w - d), Math.sign(u.win - u.draw), JSON.stringify(series));
    assert.strictEqual(Math.sign(d - l), Math.sign(u.draw - u.loss), JSON.stringify(series));
    assert.ok(w >= d && d >= l);
  }
  // rolling forward: win R0 for sure, then coin flips -> 2-0 (0.25) + 2-1 (0.125) + 1-1 (0.25 draw) ...
  const flip = sure(0.5, 0, 0.5);
  const v = planner.matchValue(0, { you: 0, them: 0 }, { 0: sure(1, 0, 0), 1: flip, 2: flip });
  // after 1-0: win R1 -> 1; lose R1 -> 1-1 -> R2 flip -> 0.5
  assert.ok(Math.abs(v - (0.5 * 1 + 0.5 * 0.5)) < 1e-12);
  // unknown future rounds are coin flips, so winning now is worth more than not
  assert.ok(planner.matchValue(0, { you: 0, them: 0 }, { 0: sure(1, 0, 0) }) > planner.matchValue(0, { you: 0, them: 0 }, { 0: sure(0, 0, 1) }));
});

test('match-level valuer: a permanent apple outranks a one-battle potato when this round is already won', () => {
  // A board that beats the R1 target either way: the food decision is entirely about R2.
  const wall = [
    { uid: 1, name: 'Webby', kitId: 'bulk', atk: 6, hp: 12, tempAtk: 0, honey: false, potato: false, cost: 3, rarity: 'common' },
    { uid: 2, name: 'Cooper', kitId: 'echo', atk: 5, hp: 10, tempAtk: 0, honey: false, potato: false, cost: 3, rarity: 'common' },
    { uid: 3, name: 'WTD', kitId: 'hype', atk: 5, hp: 8, tempAtk: 0, honey: false, potato: false, cost: 3, rarity: 'common' },
  ];
  // R2 opponents strong enough that +1/+1 permanent changes fights; a temp +2 ATK does not carry
  const R2 = { entries: [
    { board: [u('Webby', { extraAtk: 4, extraHp: 6 }), u('Cooper', { extraAtk: 4, extraHp: 6 }), u('Writing Bot', { extraAtk: 3, extraHp: 6 })], weight: 0.5, seats: null },
    { board: [u('The Morning Newspaper', { extraAtk: 4, extraHp: 6 }), u('Meeting Recap Deck', { extraAtk: 4, extraHp: 6 }), u('WTD', { extraAtk: 3, extraHp: 6 })], weight: 0.5, seats: null },
  ] };
  const base = state({ round: 1, gold: 3, board: wall, series: { you: 0, them: 0 } });   // at 1-0 a won R1 ends the match
  // the mechanism is tested at full strength on R1; the shipped default is R0-only at 50% (measured)
  const ctx = { cache: new Map(), futureTargets: { 2: R2 }, matchRounds: [0, 1], futureBlend: 1 };
  const VM = planner.makeStateValuer(base, ctx, planner.utility(1, base.series), TARGET.entries);
  assert.ok(VM.matchLevel, 'future target in play');
  const apple = shop.apply({ ...base, food: 'apple' }, { type: 'feed', boardIndex: 0 });
  const potato = shop.apply({ ...base, food: 'potato' }, { type: 'feed', boardIndex: 0 });
  const vNow = VM.now(shop.simUnits(apple)).score;
  assert.ok(vNow > 0.99 && VM.now(shop.simUnits(potato)).score > 0.99, 'R1 is won either way');
  assert.ok(VM.valueOf(apple) > VM.valueOf(potato), `apple ${VM.valueOf(apple)} should beat potato ${VM.valueOf(potato)}`);
  // and without future targets the two are indistinguishable (the old one-round objective)
  const VM0 = planner.makeStateValuer(base, { cache: new Map() }, planner.utility(1, base.series), TARGET.entries);
  assert.ok(!VM0.matchLevel);
  assert.ok(Math.abs(VM0.valueOf(apple) - VM0.valueOf(potato)) < 1e-12);
});

test('two-step search never does worse than one-step on the same deterministic state, and stays legal', () => {
  const rng = mulberry32(2026);
  let improved = 0;
  for (let i = 0; i < 40; i++) {
    const S = { ...randomState(rng), round: 1 + Math.floor(rng() * 2) };
    const base = { target: TARGET, cache: new Map(), timeBudgetMs: Infinity, rng: null };   // no reroll sampling: exact
    const one = planner.planStep(S, { ...base, twoStep: false, matchLevel: false });
    const two = planner.planStep(S, { ...base, twoStep: true, matchLevel: false });
    let s2 = S;
    for (const a of two.actions || []) { assert.strictEqual(shop.legal(s2, a), true, `illegal ${a.type}`); s2 = shop.apply(s2, a); }
    if (two.actions && two.actions.length && one.actions && one.actions.length) {
      assert.ok(two.expected >= one.expected - 1e-9, `two-step ${two.expected} < one-step ${one.expected}`);
      if (two.expected > one.expected + 1e-9) improved++;
    }
  }
  assert.ok(improved >= 0);   // how often it helps is measured by tools/eval_matches.js, not asserted here
});

test('Season 3 planner can equip an item without spending gold needed to fill the board', () => {
  const full = state({ season: 3, round: 1, gold: 2,
    board: [boardUnit('Webby', 0), boardUnit('Cooper', 1), boardUnit('WTD', 2)],
    itemOffer: { item: 'foamPad', cost: 2, rarity: 'common' } });
  assert.equal(planner.singleMoves(full).filter((m) => m.actions[0].type === 'equip').length, 3);
  const short = { ...full, board: full.board.slice(0, 2), gold: 5,
    offers: [offer('Writing Bot', 0), null, null] };
  assert.equal(planner.canFill(short), true);
  assert.equal(planner.singleMoves(short).some((m) => m.actions[0].type === 'equip'), true);
  const tight = { ...short, gold: 4 };
  assert.equal(planner.singleMoves(tight).some((m) => m.actions[0].type === 'equip'), false);
});

test('Season 3 fill budget allows Scout or Recruiter a second opening reroll', () => {
  const base = state({ season: 3, round: 0, gold: 9, rerolls: 1, board: [],
    offers: [offer('Webby', 0), offer('Cooper', 1), offer('WTD', 2)] });
  assert.equal(planner.rerollAllowed({ ...base, captain: 'scout', freeRerolls: 0 }), false);
  assert.equal(planner.rerollAllowed({ ...base, captain: 'recruiter', gold: 10 }), true);
  assert.equal(planner.rerollAllowed({ ...base, captain: 'scout', gold: 10, freeRerolls: 0 }), true);
});

test('Season 3 completion search excludes a second Mythic', () => {
  const mythics = catalog.unlockedPool(2, 3).filter((b) => b.rarity === 'mythic');
  assert.ok(mythics.length >= 2);
  const offerMythic = (b, i) => shop.offerFromBot(b, i, 3);
  const S = state({ season: 3, round: 2, gold: 20,
    offers: [offerMythic(mythics[0], 0), offerMythic(mythics[1], 1), null] });
  assert.ok(planner.completions(S).every((c) => c.plan.length <= 1));
  const withMythic = { ...S, board: [{ ...boardUnit('Webby', 0), rarity: 'mythic' }] };
  assert.ok(planner.completions(withMythic).every((c) => c.plan.length === 0));
});

test('Season 3 captain choice evaluates offered captains reproducibly', () => {
  const makeOffer = (name, i) => shop.offerFromBot(catalog.byName(name), i, 3);
  const S = state({ season: 3, round: 0, gold: 10,
    offers: ['Copy Humanizer', 'Cooper', 'Alexandria'].map(makeOffer),
    captainOffer: ['drill', 'medic', 'banker'],
    itemOffer: { item: 'laserPointer', cost: 2, rarity: 'common' },
    food: 'apple' });
  const enemy = { entries: [{ board: ['Newsie', 'Devils Advocate', 'Speed Lab']
    .map((n) => sim.unitFromCatalog(n)), weight: 1 }] };
  const before = JSON.stringify(S);
  const opts = { targets: [enemy, enemy, enemy], captainSamples: 1, captainShopSteps: 5 };
  const first = planner.chooseCaptain(S, opts);
  assert.ok(S.captainOffer.includes(first));
  assert.equal(planner.chooseCaptain(S, opts), first);
  assert.equal(JSON.stringify(S), before);
});
