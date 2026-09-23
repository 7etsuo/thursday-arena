#!/usr/bin/env node
'use strict';
/**
 * Merge another bot's opponent book into memory/book.json.
 *
 *   node tools/merge_book.js /path/to/their/memory/book.json
 *
 * Works on the raw files: for every (season|handle|round) key and board, the two observation
 * timestamp lists are unioned, so an observation both books already hold (the seeded corpus, a
 * match both saw) is counted once. Idempotent. Writes atomically.
 */
const fs = require('fs');
const path = require('path');
const bookLib = require('../lib/book');

const OURS = path.join(__dirname, '..', 'memory', 'book.json');
const boardKey = (e) => bookLib.boardKey(e.board, e.captain, e.relics);

function load(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  return d.entries ? d : { format: 1, entries: d };
}

function mergeFiles(other, oursFile = OURS) {
  if (!other) throw new Error('usage: merge_book.js <other book.json>');
  const theirs = load(other);
  const ours = fs.existsSync(oursFile) ? load(oursFile) : { format: theirs.format || 1, entries: {} };
  let added = 0;
  let dup = 0;
  for (const [key, list] of Object.entries(theirs.entries)) {
    const handle = key.split('|')[1];
    if (!handle || handle === 'ai') continue;
    const mine = ours.entries[key] || (ours.entries[key] = []);
    for (const e of list) {
      const k = boardKey(e);
      let m = mine.find((x) => boardKey(x) === k);
      const stamps = Array.isArray(e.ts) && e.ts.length ? e.ts : [e.lastTs];
      // Live books retain only 64 timestamps, while n can be larger. Recounting just ts silently
      // deleted older observations. New boards can be copied intact; overlapping truncated
      // histories cannot be merged exactly without the missing source records.
      const truncated = (row) => Number(row.n) > (row.ts || []).length;
      if (!m && truncated(e)) {
        mine.push(structuredClone(e));
        added += e.n;
        continue;
      }
      if (m && (truncated(m) || truncated(e))) {
        const have = new Set(m.ts || []);
        if (m.n === e.n && m.firstTs === e.firstTs && m.lastTs === e.lastTs &&
            have.size === stamps.length && stamps.every((t) => have.has(t))) {
          dup += stamps.length;
          if (e.seeded) m.seeded = true;
          continue;
        }
        throw new Error(`cannot exactly merge truncated observation history for ${key}; use the full records. Neither file was changed.`);
      }
      if (!m) {
        m = { board: e.board, seats: e.seats || null, n: 0, firstTs: Infinity, lastTs: 0, ts: [] };
        if (e.captain) m.captain = e.captain;
        if (e.relics) m.relics = [...e.relics];
        if (e.seeded) m.seeded = true;
        mine.push(m);
      }
      if (e.seeded) m.seeded = true;
      if (e.lastTs > m.lastTs) { m.seats = e.seats || null; m.matchId = e.matchId || null; }
      const have = new Set(m.ts || []);
      for (const t of stamps) {
        if (t == null) continue;
        if (have.has(t)) { dup++; continue; }
        have.add(t);
        added++;
      }
      m.ts = [...have].sort((a, b) => a - b);
      m.n = m.ts.length;
      m.firstTs = m.ts[0];
      m.lastTs = m.ts[m.ts.length - 1];
    }
    mine.sort((a, b) => b.lastTs - a.lastTs);
    ours.entries[key] = mine.slice(0, bookLib.MAX_BOARDS);
  }
  // Preserve the idempotency receipts when importing learned defensive observations.
  if (theirs.receipts) ours.receipts = { ...theirs.receipts, ...(ours.receipts || {}) };
  const keys = Object.keys(ours.entries).length;
  const boards = Object.values(ours.entries).reduce((s, l) => s + l.length, 0);
  const obs = Object.values(ours.entries).reduce((s, l) => s + l.reduce((a, e) => a + e.n, 0), 0);
  fs.mkdirSync(path.dirname(oursFile), { recursive: true });
  const tmp = `${oursFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(ours));
  fs.renameSync(tmp, oursFile);
  return { from: other, added, alreadyHad: dup, keys, boards, observations: obs };
}

if (require.main === module) console.log(JSON.stringify(mergeFiles(process.argv[2])));

module.exports = { mergeFiles, boardKey };
