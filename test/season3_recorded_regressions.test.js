'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sim = require('../lib/sim');
const catalog = require('../lib/catalog');

const records = ['s3_public_matches.jsonl', 's3_public_matches_review_2026-09-20.jsonl'].flatMap((file) =>
  fs.readFileSync(path.join(__dirname, '../data/corpus', file), 'utf8').trim().split('\n').map(JSON.parse));
// Seat inputs were reconstructed from these public traces and are fixed here. These are engine
// regression checks; they do not turn reconstructed metadata into independent predictions.
const cases = [
  ['venom accumulates on repeated hits', 'db5487a4', 0, ['pit_stop', 'encore', 'spotlight']],
  ['double attacks resolve armor for both hits', 'c30f5d78', 0, ['warm_up', 'pit_stop', 'hard_hat']],
  ['blocked hits do not trigger hurt abilities', '066f7558', 2, ['pit_stop', 'hard_hat', 'spotlight']],
  ['Encore fires the copied effect', '782647ae', 2, ['warm_up', 'spotlight', 'encore']],
  ['Encore repeats auras; summons do not inherit them', 'f865efe4', 1, ['hard_hat', 'encore', 'spotlight']],
  ['item silence precedes ordered item stat bonuses', '8b8de027', 1, ['spotlight', 'warm_up', 'hot_seat']],
  ['silencing an already muted unit is silent', '7bfffc2c', 2, ['hot_seat', 'pit_stop', 'encore']],
  ['periodic abilities resolve after the next Hot seat tick', '2ac3a8b0', 1, ['warm_up', 'hot_seat', 'encore']],
  ['shield blocks preserve later seeded knockout order', '5b5c3785', 2, ['warm_up', 'hard_hat', 'hot_seat']],
  ['Hotfix does not increase passive splash damage', 'a3beb08e', 1, ['encore', 'hard_hat', 'spotlight']],
  ['dead units cannot react to another knockout', 'bbfff41c', 0, ['pit_stop', 'spotlight', 'spotlight']],
  ['both jammed attacks produce only the per-unit skip captions', '62faf28f', 2, ['warm_up', 'hard_hat', 'spotlight']],
  ['Megaphone fires after both teams receive item stat bonuses', '0d6980e5', 2, ['warm_up', 'encore', 'hard_hat']],
  ['simultaneous splash resolves with its defending team', '2a723e26', 2, ['hot_seat', 'pit_stop', 'encore']],
  ['Laser Pointer applies to both parts of the first double attack', '13d0d2a3', 1, ['hard_hat', 'pit_stop', null]],
  ['periodic friend buffs match the recorded trace', '52f763ab', 1, ['warm_up', 'spotlight', 'hard_hat']],
  ['a self shield matches the recorded trace', 'f58aa677', 1, ['encore', 'hard_hat', 'spotlight']],
  ['a jammed first striker allows an ordinary opposing attack', 'd565ff54', 0, ['hard_hat', 'encore', null]],
  ['double hits consume survivor sorting RNG once per unit', '899381ef', 2, ['encore', 'spotlight', 'pit_stop']],
  ['armor and shield captions retain damage order', '4d22ca12', 1, ['hot_seat', 'pit_stop', 'hard_hat']],
  ['last standing waits until all knockouts resolve', '081499cd', 1, ['warm_up', null, null]],
  ['Jump Cut combines double attacks with enemy-faint growth', '114059a3', 2, ['spotlight', 'encore', 'hot_seat']],
  ['Mute Button respects an enemy taunt', '27de9fe7', 0, ['hot_seat', 'encore', 'spotlight']],
];

for (const [name, prefix, round, rules] of cases) test(`recorded S3: ${name}`, () => {
  const match = records.find((m) => m.id.startsWith(prefix));
  const r = match.rounds.find((r) => r.round === round);
  const c = r.frames.map((f) => f.caption);
  const actual = sim.simulate(r.you.map((u) => catalog.toSimUnit(u, 3)),
    r.them.map((u) => catalog.toSimUnit(u, 3)), {
      season: 3, round, seats: Object.fromEntries(sim.SEAT_NAMES.map((seat, i) => [seat, rules[i]])),
      ourCaptain: c.some((s) => s.startsWith('Drill:')) ? 'drill'
        : c.some((s) => s.startsWith('Medic:')) ? 'medic' : null,
      theirCaptain: c.some((s) => s.startsWith('Enemy Drill:')) ? 'drill'
        : c.some((s) => s.startsWith('Enemy Medic:')) ? 'medic' : null,
    });
  assert.equal(actual.winner === 'us' ? 'you' : actual.winner, r.winner);
  assert.deepEqual(actual.frames, r.frames);
});
