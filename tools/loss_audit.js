#!/usr/bin/env node
'use strict';
/** Read-only audit of what the bot learned from rated losses in the copied telemetry. */
const sim = require('../lib/sim');
const bookLib = require('../lib/book');
const recent = require('./eval_recent');

function audit(records, opt) {
  const from = Date.parse(opt.from), to = opt.to ? Date.parse(opt.to) : Infinity;
  const matches = records.matches.filter((m) => m.result === 'loss'
    && Date.parse(m.ts) >= from && Date.parse(m.ts) < to);
  const totals = { matches: matches.length, battleRounds: 0, lostRounds: 0,
    rescueWins: 0, rescueDraws: 0, simulatorMismatches: 0, noEnemyBoard: 0,
    bookExact: [0, 0, 0], bookSeen: [0, 0, 0], shops: [0, 0, 0] };
  for (const m of matches) for (const b of m.rounds) {
    if (!b.us || !b.us.length || !b.correctedThem || !b.correctedThem.length) { totals.noEnemyBoard++; continue; }
    totals.battleRounds++;
    const options = { round: b.round, seats: b.seats || null };
    const actual = sim.outcome(b.us, b.correctedThem, options);
    const logged = b.winner === 'you' ? 'us' : b.winner;
    if (actual !== logged) totals.simulatorMismatches++;
    if (logged !== 'them') continue;
    totals.lostRounds++;
    const best = sim.bestSeating(b.us, [b.correctedThem], options)[0];
    if (!best) continue;
    const bestOutcome = sim.outcome(best.order, b.correctedThem, options);
    if (bestOutcome === 'us') totals.rescueWins++;
    else if (bestOutcome === 'draw') totals.rescueDraws++;
  }
  recent.score(records, { ...opt, limit: 0 }, (row, book) => {
    if (row.result !== 'loss') return;
    const r = row.round;
    totals.shops[r]++;
    const handle = r === 0 ? row.handle || row.prevHandle : row.handle;
    if (!handle) return;
    const lookup = book.lookup(row.s2 ? 2 : 1, handle, r);
    if (lookup.length) totals.bookSeen[r]++;
    if (lookup.some((x) => bookLib.boardKey(x.board) === bookLib.boardKey(row.them))) totals.bookExact[r]++;
  });
  return totals;
}

function main() {
  const opt = recent.argsOf(process.argv.slice(2));
  const records = recent.loadRecords(opt);
  const x = audit(records, opt);
  console.log(`rated losses=${x.matches} battle rounds=${x.battleRounds} lost rounds=${x.lostRounds}`);
  console.log(`complete enemy boards missing=${x.noEnemyBoard}; simulator winner mismatches=${x.simulatorMismatches}`);
  console.log(`hindsight seat-order rescues: wins=${x.rescueWins}, draws=${x.rescueDraws}`);
  for (const r of [0, 1, 2]) console.log(`R${r} loss shops=${x.shops[r]} target handle seen=${x.bookSeen[r]} exact board in book=${x.bookExact[r]}`);
  console.log('Seat-order rescues use the enemy board revealed after shopping; they are an upper bound, not a deployable win-rate estimate.');
}

if (require.main === module) main();
module.exports = { audit };
