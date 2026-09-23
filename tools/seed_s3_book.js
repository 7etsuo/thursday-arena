#!/usr/bin/env node
'use strict';
/**
 * Build a separate Season 3 opponent book from public completed-match replays.
 *
 *   node tools/seed_s3_book.js --out /path/to/new-book.json [--in /path/to/matches.jsonl]
 *
 * Both recorded sides are player boards. The public response does not include captains or seat
 * rules, so those fields are intentionally absent. This tool refuses to replace any existing file;
 * use tools/merge_book.js separately if the generated seed should be added to a live book.
 */
const fs = require('fs');
const path = require('path');
const catalog = require('../lib/catalog');
const bookLib = require('../lib/book');

const DEFAULT_INPUT = path.join(__dirname, '..', 'data', 'corpus', 's3_public_matches.jsonl');

function parseArgs(argv) {
  const o = { input: DEFAULT_INPUT, output: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in' && argv[i + 1]) o.input = path.resolve(argv[++i]);
    else if (argv[i] === '--out' && argv[i + 1]) o.output = path.resolve(argv[++i]);
    else throw new Error(`unknown or incomplete flag: ${argv[i]}`);
  }
  if (!o.output) throw new Error('usage: seed_s3_book.js --out NEW_BOOK.json [--in matches.jsonl]');
  if (o.input === o.output) throw new Error('input and output must differ');
  return o;
}

function replayBoard(units) {
  if (!Array.isArray(units) || !units.length) return null;
  for (const u of units) {
    if (!catalog.lookup(u)) throw new Error(`public replay has unknown bot ${u.botId || u.name}`);
  }
  // The shared replay converter includes tempAtk in battle ATK and preserves the exact replay
  // item. Crew is resolved from the public catalog because replay rows usually omit it.
  const board = bookLib.publicReplayBoard({ you: units }, 'you');
  if (board.length !== units.length) throw new Error('public replay board has invalid unit data');
  return board;
}

function observationsFromMatch(match) {
  if (!match || !match.id || !Array.isArray(match.rounds)) throw new Error('invalid public match');
  const ts = Date.parse(match.played_at);
  if (!Number.isFinite(ts)) throw new Error(`match ${match.id}: invalid played_at`);
  const sides = [
    ['you', match.player && match.player.x_handle],
    ['them', match.opponent && match.opponent.kind === 'ghost' && match.opponent.x_handle],
  ];
  const out = [];
  for (const round of match.rounds) {
    if (![0, 1, 2].includes(round.round)) throw new Error(`match ${match.id}: invalid round`);
    for (const [side, handle] of sides) {
      if (!handle) continue;
      const board = replayBoard(round[side]);
      if (!board) continue;
      out.push({ season: 3, handle, round: round.round, board, ts,
        matchId: match.id });
    }
  }
  return out;
}

function readMatches(input) {
  const matches = [];
  const ids = new Set();
  let lineNo = 0;
  for (const line of fs.readFileSync(input, 'utf8').split('\n')) {
    lineNo++;
    if (!line.trim()) continue;
    let match;
    try { match = JSON.parse(line); }
    catch (e) { throw new Error(`${input}:${lineNo}: ${e.message}`); }
    if (ids.has(match.id)) throw new Error(`${input}:${lineNo}: duplicate match id ${match.id}`);
    ids.add(match.id);
    matches.push(match);
  }
  if (!matches.length) throw new Error(`no matches in ${input}`);
  return matches;
}

function writeObservations(observations, output) {
  if (!output) throw new Error('output is required');
  const dest = path.resolve(output);
  if (fs.existsSync(dest)) throw new Error(`refusing to overwrite ${dest}`);
  if (!observations.length) throw new Error('no public replay boards to seed');
  const newest = Math.max(...observations.map((o) => o.ts));
  const book = bookLib.open(dest, { empty: true, seeded: true, now: () => newest });
  for (const o of observations) book.record(o);
  book.save();
  return { observations: observations.length, stats: book.stats(), output: dest };
}

function seed({ input = DEFAULT_INPUT, output, matches = null }) {
  const rows = matches || readMatches(input);
  const result = writeObservations(rows.flatMap(observationsFromMatch), output);
  return { matches: rows.length, ...result };
}

if (require.main === module) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const r = seed(o);
    console.log(`S3 public book: ${r.matches} matches, ${r.observations} board observations; ` +
      `${r.stats.observations} retained across ${r.stats.keys} keys -> ${r.output}`);
  } catch (e) {
    console.error(e.stack || e.message);
    process.exitCode = 1;
  }
}

module.exports = { DEFAULT_INPUT, parseArgs, replayBoard, observationsFromMatch,
  readMatches, writeObservations, seed };
