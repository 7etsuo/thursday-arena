#!/usr/bin/env node
'use strict';
/**
 * Repair a copied, newer opponent book using its accompanying raw telemetry. Never edits the
 * supplied archive. Only removes duplicate observations whose exact board, handle, round and
 * write timestamp can be identified uniquely. Usage:
 *   node tools/repair_book_archive.js --records-dir /path/to/extracted-root --out /path/to/book.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bookLib = require('../lib/book');

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--records-dir', '--out'].includes(argv[i]) || !argv[i + 1]) throw new Error('usage: --records-dir DIR --out FILE');
    out[argv[i]] = argv[i + 1];
  }
  if (!out['--records-dir'] || !out['--out']) throw new Error('usage: --records-dir DIR --out FILE');
  return { root: path.resolve(out['--records-dir']), out: path.resolve(out['--out']) };
}

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const boardKey = (b) => bookLib.boardKey(bookLib.normBoard(b));
const eventMs = (e) => Date.parse(e.ts);
const eventKey = (e) => `${e.session}|${e.round}|${hash(JSON.stringify(e.frames || []))}`;
const handleKey = (e) => String(e.handle || '').trim().toLowerCase();
const seasonOf = (e) => e.season || (e.seats ? 2 : 1);

function findUniqueStamp(data, e, board, ms) {
  const key = `${seasonOf(e)}|${handleKey(e)}|${e.round}`;
  const list = data.entries[key] || [];
  const bkey = boardKey(board);
  const found = [];
  for (const row of list) {
    if (boardKey(row.board) !== bkey) continue;
    for (let i = 0; i < row.ts.length; i++) {
      if (row.ts[i] === ms || row.ts[i] === ms + 1) found.push({ key, list, row, index: i, ts: row.ts[i] });
    }
  }
  return found.length === 1 ? found[0] : null;
}

function readBattles(root) {
  const logDir = path.join(root, 'data', 'log');
  const files = fs.readdirSync(logDir).filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort();
  const fullByKey = new Map();
  const full = [];
  const pairs = [];
  let empty = 0;
  for (const file of files) {
    for (const line of fs.readFileSync(path.join(logDir, file), 'utf8').split('\n')) {
      if (!line) continue;
      const e = JSON.parse(line);
      if (e.type !== 'battle' || e.ai) continue;
      const k = eventKey(e);
      if (Array.isArray(e.us) && e.us.length) {
        fullByKey.set(k, e);
        full.push(e);
      } else {
        empty++;
        const prior = fullByKey.get(k);
        if (prior && eventMs(e) - eventMs(prior) >= 0 && eventMs(e) - eventMs(prior) <= 3000
          && boardKey(e.them || []) === boardKey(prior.them || [])) pairs.push({ original: prior, duplicate: e });
      }
    }
  }
  return { full, pairs, empty };
}

function repair(data, battles) {
  if ([...battles.full, ...battles.pairs.flatMap((p) => [p.original, p.duplicate])]
    .some((e) => seasonOf(e) >= 3)) {
    throw new Error('This historical honey/duplicate repair supports Season 1/2 records only; Season 3 item boards must not be replaced by honey-only inference.');
  }
  const stats = { emptyBattleEvents: battles.empty, pairedDuplicates: battles.pairs.length,
    duplicateStampsRemoved: 0, duplicateStampsAbsentOrAmbiguous: 0,
    honeyEventsCorrected: 0, honeyStampsMoved: 0, honeyStampsAbsentOrAmbiguous: 0 };

  // A duplicate log event is evidence for one extra book write, but the five-variant book may
  // have evicted that write. Never subtract a count if its exact timestamp is unavailable.
  for (const { original, duplicate } of battles.pairs) {
    if (!handleKey(duplicate) || (handleKey(original) && handleKey(original) !== handleKey(duplicate))) continue;
    const hit = findUniqueStamp(data, duplicate, duplicate.them, eventMs(duplicate));
    if (!hit) { stats.duplicateStampsAbsentOrAmbiguous++; continue; }
    hit.row.ts.splice(hit.index, 1);
    stats.duplicateStampsRemoved++;
  }

  // The new opening caption used to make inferGhost fall back to caption-only honey detection.
  // Re-infer from the complete original battle, then relocate only a uniquely identified write.
  for (const e of battles.full) {
    if (!handleKey(e) || !e.frames?.length) continue;
    const fixed = bookLib.inferGhost({ frames: e.frames, ourUnits: e.us, round: e.round, seats: e.seats || null });
    if (boardKey(fixed) === boardKey(e.them || [])) continue;
    stats.honeyEventsCorrected++;
    const hit = findUniqueStamp(data, e, e.them, eventMs(e));
    if (!hit) { stats.honeyStampsAbsentOrAmbiguous++; continue; }
    hit.row.ts.splice(hit.index, 1);
    let corrected = hit.list.find((row) => boardKey(row.board) === boardKey(fixed));
    if (!corrected) {
      corrected = { board: fixed, seats: e.seats || null, n: 0, firstTs: hit.ts,
        lastTs: hit.ts, ts: [], matchId: e.matchId || null };
      hit.list.push(corrected);
    }
    corrected.ts.push(hit.ts);
    stats.honeyStampsMoved++;
  }

  for (const [key, list] of Object.entries(data.entries)) {
    const kept = list.filter((e) => e.ts.length);
    for (const e of kept) {
      e.ts.sort((a, b) => a - b);
      e.n = e.ts.length;
      e.firstTs = e.ts[0];
      e.lastTs = e.ts[e.ts.length - 1];
    }
    kept.sort((a, b) => b.lastTs - a.lastTs || boardKey(a.board).localeCompare(boardKey(b.board)));
    if (kept.length) data.entries[key] = kept.slice(0, bookLib.MAX_BOARDS);
    else delete data.entries[key];
  }
  return stats;
}

function main() {
  const { root, out } = args(process.argv.slice(2));
  const input = path.join(root, 'memory', 'book.json');
  if (out === input) throw new Error('refusing to edit the supplied archive book');
  const raw = fs.readFileSync(input);
  const data = JSON.parse(raw);
  if (data.format !== 1 || !data.entries || typeof data.entries !== 'object') throw new Error('unexpected book format');
  for (const rows of Object.values(data.entries)) for (const e of rows) {
    if (!Array.isArray(e.ts) || e.n !== e.ts.length) throw new Error('archive book has unretained timestamps; exact repair is unsafe');
  }
  const stats = repair(data, readBattles(root));
  const bytes = JSON.stringify(data);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bytes);
  console.log(JSON.stringify({ input, inputSha256: hash(raw), out, outputSha256: hash(bytes), ...stats }, null, 2));
}

if (require.main === module) main();
module.exports = { repair, readBattles, findUniqueStamp };
