#!/usr/bin/env node
'use strict';
/** Replay every complete battle in an extracted records archive against the current simulator. */
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('node:util');
const sim = require('../lib/sim');
const book = require('../lib/book');

function verify(root) {
  const dir = path.join(root, 'data', 'log');
  const files = fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(x)).sort();
  const out = { complete: 0, winners: 0, frames: 0, mismatches: [] };
  for (const file of files) for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
    if (!line) continue;
    const e = JSON.parse(line);
    if (e.type !== 'battle' || !e.us?.length || !e.them?.length || !e.frames?.length) continue;
    out.complete++;
    const options = { round: e.round, seats: e.seats || null,
      season: e.season || (e.captain || e.rivalCaptain ? 3 : e.seats ? 2 : 1),
      ourCaptain: e.captain || null, theirCaptain: e.rivalCaptain || null,
      ourRelics: e.relics, theirRelics: e.rivalRelics };
    // S3 frame inference cannot recover every item; retain the explicitly logged enemy inputs.
    const them = options.season >= 3 ? e.them
      : book.inferGhost({ frames: e.frames, ourUnits: e.us, ...options });
    const got = sim.simulate(e.us, them, options);
    if (got.winner === (e.winner === 'you' ? 'us' : e.winner)) out.winners++;
    const frames = got.frames.map((f, i) => i === 0 && f.caption === 'The teams square up'
      && e.frames[0].caption === 'The fight starts' ? { ...f, caption: 'The fight starts' } : f);
    if (isDeepStrictEqual(frames, e.frames)) out.frames++;
    else if (out.mismatches.length < 10) out.mismatches.push({ ts: e.ts, matchId: e.matchId, round: e.round });
  }
  return out;
}

if (require.main === module) {
  const root = process.argv[2];
  if (!root) throw new Error('usage: node tools/verify_archive_battles.js EXTRACTED_RECORDS_ROOT');
  const result = verify(path.resolve(root));
  console.log(JSON.stringify(result, null, 2));
  if (result.winners !== result.complete || result.frames !== result.complete) process.exitCode = 1;
}
module.exports = { verify };
