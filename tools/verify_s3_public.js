#!/usr/bin/env node
'use strict';
/**
 * Read-only Season 3 public-record diagnostic. The public match detail API
 * includes battle inputs, frames and winners but omits the seat-rule triplet
 * and both captain IDs. We infer fight captains and most seats from captions.
 * When captions leave a seat ambiguous, search the rule triplets against the full trace.
 * This is a replay of observed data with inferred metadata, not an independent
 * prediction benchmark or a guarantee of exact server fidelity.
 */
const fs = require('node:fs');
const path = require('node:path');
const sim = require('../lib/sim');
const catalog = require('../lib/catalog');

const FILE = process.argv[2] || path.join(__dirname, '../data/corpus/s3_public_matches.jsonl');
const RULES = {
  'Spotlight': 'spotlight', 'Pit stop': 'pit_stop', 'Warm-up': 'warm_up',
  'Encore': 'encore', 'Hard hat': 'hard_hat', 'Hot seat': 'hot_seat',
};
const SEATS = ['front', 'middle', 'back'];

// These four matches contain seat rules whose effects are silent until a later
// exchange. The public record's seat captions identify the listed positions:
// d504: Warm-up on a third bot; 5b5: Hot seat on a third bot;
// 222: Hard hat on a third bot; 6f3: Encore/Pit stop/Spotlight in seat order.
const RECONSTRUCTED_SEATS = {
  'd5049ff2-3c19-41de-9fef-94221e3023b5': { front: 'pit_stop', middle: 'hard_hat', back: 'warm_up' },
  '5b5c3785-80df-41fe-bcfb-439a8cbf0ae5': { front: 'warm_up', middle: 'hard_hat', back: 'hot_seat' },
  '2226865b-360e-4a2b-bf60-f7c0f7f75011': { front: 'warm_up', middle: 'encore', back: 'hard_hat' },
  '6f392150-d82e-4779-b3e6-83334d17120d': { front: 'encore', middle: 'pit_stop', back: 'spotlight' },
};

function inferredSeats(rounds) {
  const seats = {};
  for (const round of rounds) {
    const seat = SEATS[round.round];
    if (!seat) continue;
    // A start rule for the newly active seat appears before any kit caption.
    // Previously active rules are already known; skip their repeat captions.
    for (const frame of round.frames) {
      const rule = Object.entries(RULES).find(([name]) => frame.caption.startsWith(name + ':'))?.[1];
      if (!rule || Object.values(seats).includes(rule)) continue;
      if (!seats[seat]) seats[seat] = rule;
    }
  }
  return seats;
}

function toUnit(unit) {
  const bot = catalog.byId(unit.botId);
  if (!bot) throw new Error(`catalog lacks ${unit.botId}`);
  return { name: bot.name, kitId: bot.kitId, atk: unit.atk + (unit.tempAtk || 0), hp: unit.hp,
    honey: !!unit.honey, crew: bot.crew, ...(unit.item ? { item: unit.item } : {}) };
}

function battleOptions(round, seats) {
  const captions = round.frames.map((f) => f.caption);
  return { season: 3, round: round.round, seats,
    ourCaptain: captions.some((c) => c.startsWith('Drill:')) ? 'drill'
      : captions.some((c) => c.startsWith('Medic:')) ? 'medic' : null,
    theirCaptain: captions.some((c) => c.startsWith('Enemy Drill:')) ? 'drill'
      : captions.some((c) => c.startsWith('Enemy Medic:')) ? 'medic' : null };
}

function reconstructSeats(match) {
  const initial = RECONSTRUCTED_SEATS[match.id] || inferredSeats(match.rounds);
  const inputs = match.rounds.map((r) => ({ r, you: r.you.map(toUnit), them: r.them.map(toUnit) }));
  const score = (seats) => inputs.reduce((total, { r, you, them }) => {
    const got = sim.simulate(you, them, battleOptions(r, seats)).frames;
    let prefix = 0;
    while (prefix < Math.max(got.length, r.frames.length) &&
      JSON.stringify(got[prefix]) === JSON.stringify(r.frames[prefix])) prefix++;
    // Exact rounds dominate any partial prefix. Ties preserve the caption-derived guess.
    return total + (prefix === got.length && prefix === r.frames.length ? 1000000 : prefix);
  }, 0);
  let best = initial, bestScore = score(initial);
  const complete = 1000000 * inputs.length;
  if (bestScore === complete) return best;
  for (const front of sim.SEAT_RULES) for (const middle of sim.SEAT_RULES) for (const back of sim.SEAT_RULES) {
    const seats = { front, middle, back }, value = score(seats);
    if (value > bestScore) { best = seats; bestScore = value; }
    if (bestScore === complete) return best;
  }
  return best;
}

function verify(file = FILE) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  let matches = 0, rounds = 0, winners = 0, frameExact = 0;
  const differences = [];
  for (const line of lines) {
    const match = JSON.parse(line);
    matches++;
    const seats = reconstructSeats(match);
    for (const r of match.rounds) {
      const actual = sim.simulate(r.you.map(toUnit), r.them.map(toUnit), battleOptions(r, seats));
      rounds++;
      const winner = actual.winner === 'us' ? 'you' : actual.winner;
      if (winner === r.winner) winners++;
      if (JSON.stringify(actual.frames) === JSON.stringify(r.frames)) frameExact++;
      else if (differences.length < 12) {
        let at = 0;
        while (at < Math.min(actual.frames.length, r.frames.length) &&
          JSON.stringify(actual.frames[at]) === JSON.stringify(r.frames[at])) at++;
        differences.push({ id: match.id, round: r.round, at,
          got: actual.frames[at]?.caption || null, expected: r.frames[at]?.caption || null });
      }
    }
  }
  return { matches, rounds, winnerMatches: winners, frameExact,
    note: 'Seat and fight captain metadata inferred from these same battle frames; diagnostic replay only.',
    differences };
}

if (require.main === module) console.log(JSON.stringify(verify(), null, 2));
module.exports = { verify, inferredSeats, reconstructSeats, RECONSTRUCTED_SEATS };
