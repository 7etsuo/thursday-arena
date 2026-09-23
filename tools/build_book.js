'use strict';
/*
 * Seed memory/book.json from data/corpus/battles.jsonl.
 *
 * The corpus rows already carry the resolved enemy board ("them": kits + honey recovered by the audit's
 * frame-exact verifier, docs/ENGINE_BATTLE.md §4), the handle, the round, the seat rules and the season flag,
 * so this is a straight replay of the recorded observations in timestamp order.
 *
 * Idempotent: the book is rebuilt from an empty store every run, so running it twice writes the same bytes.
 *
 * usage: node tools/build_book.js [--in FILE] [--out FILE] [--no-coverage]
 */

const fs = require('fs');
const path = require('path');
const bookmod = require('../lib/book.js');
const target = require('../lib/target.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);

const IN = path.resolve(opt('--in', path.join(ROOT, 'data', 'corpus', 'battles.jsonl')));
const OUT = path.resolve(opt('--out', path.join(ROOT, 'memory', 'book.json')));

const ERAS = [
  ['S1 early', (r) => !r.s2 && r.ts < '2026-09-19T04:30:00Z'],
  ['S1 late', (r) => !r.s2 && r.ts >= '2026-09-19T04:30:00Z'],
  ['S2', (r) => !!r.s2],
];
const eraOf = (r) => (ERAS.find(([, f]) => f(r)) || ['?'])[0];
const seasonOf = (r) => (r.s2 ? 2 : 1);
const bkey = (b) => bookmod.boardKey(bookmod.normBoard(b));

function main() {
  const rows = fs.readFileSync(IN, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  rows.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  // clock = the newest recorded battle, so rebuilding the seed book months later does not prune the corpus away
  const newest = Date.parse(rows[rows.length - 1].ts);
  // `seeded` marks these as the corpus seed: lib/book.js never prunes them, because the whole corpus
  // is dated within one day and a wall-clock prune 31 days later wiped all of it (review R2-06).
  const book = bookmod.open(OUT, { empty: true, seeded: true, now: () => newest });
  const cov = new Map();          // "era|round" -> {n, bookHit, targetHit, prevHit, prevN}
  const bump = (k, f) => { const c = cov.get(k) || { n: 0, bookHit: 0, targetHit: 0, prevHit: 0, prevN: 0 }; f(c); cov.set(k, c); };

  // match sequence, to reconstruct "the previous match's opponent" that the R0 target relies on
  let prevHandle = null;
  let curMid = null;
  let curHandle = null;

  for (const r of rows) {
    // Early corpus rows can lack a resolved human handle. They are useful battle
    // fixtures, but cannot be keyed as an opponent observation.
    if (!r.handle || r.handle.toLowerCase() === 'ai') continue;
    if (r.mid !== curMid) { prevHandle = curHandle; curMid = r.mid; curHandle = r.handle; }
    const season = seasonOf(r);
    const want = bkey(r.them);

    if (!flag('--no-coverage')) {
      const k = `${eraOf(r)}|${r.round}`;
      // measured BEFORE recording this row, so the book only ever contains strictly earlier battles
      const rowsB = book.lookup(season, r.handle, r.round);
      const t = target.build({ book, season, round: r.round, handle: r.handle, prevHandle, seats: r.seats || null });
      const inTarget = t.entries.some((e) => bkey(e.board) === want);
      const prevRows = prevHandle ? book.lookup(season, prevHandle, r.round) : [];
      bump(k, (c) => {
        c.n++;
        if (rowsB.some((x) => bkey(x.board) === want)) c.bookHit++;
        if (inTarget) c.targetHit++;
        if (r.round === 0 && prevHandle) { c.prevN++; if (prevRows.length && bkey(prevRows[0].board) === want) c.prevHit++; }
      });
    }

    book.record({ season, handle: r.handle, round: r.round, board: r.them, seats: r.seats || null, ts: r.ts, matchId: r.mid });
  }

  book.save();

  // ---------------- report
  const data = book.data();
  const per = new Map();
  const byHandle = new Map();
  for (const k of Object.keys(data.entries)) {
    const a = k.indexOf('|'); const b = k.lastIndexOf('|');
    const season = k.slice(0, a); const handle = k.slice(a + 1, b); const round = k.slice(b + 1);
    const pk = `S${season} R${round}`;
    const p = per.get(pk) || { keys: 0, boards: 0, obs: 0, handles: new Set() };
    for (const e of data.entries[k]) { p.boards++; p.obs += e.n; byHandle.set(handle, (byHandle.get(handle) || 0) + e.n); }
    p.keys++; p.handles.add(handle);
    per.set(pk, p);
  }

  const st = book.stats();
  const bytes = fs.statSync(OUT).size;
  console.log(`book -> ${OUT}`);
  console.log(`  ${st.keys} keys (season,handle,round), ${st.boards} distinct boards, ${st.observations} observations, ${(bytes / 1024).toFixed(1)} KiB`);
  console.log('');
  console.log('  slice     keys  handles  boards   obs');
  for (const pk of [...per.keys()].sort()) {
    const p = per.get(pk);
    console.log(`  ${pk.padEnd(8)} ${String(p.keys).padStart(5)} ${String(p.handles.size).padStart(8)} ${String(p.boards).padStart(7)} ${String(p.obs).padStart(5)}`);
  }
  console.log('');
  console.log('  top handles by observations:');
  for (const [h, n] of [...byHandle.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12)) {
    console.log(`    ${String(n).padStart(4)}  ${h}`);
  }

  if (!flag('--no-coverage')) {
    console.log('');
    console.log('  coverage: would a book built from STRICTLY EARLIER battles have held the exact board faced?');
    console.log('  era        R      n   book   target  (book = lookup(season,handle,round); target = the weighted set lib/target.js would build)');
    for (const [name] of ERAS) {
      for (let r = 0; r <= 2; r++) {
        const c = cov.get(`${name}|${r}`);
        if (!c) continue;
        const pct = (a) => `${((100 * a) / c.n).toFixed(1)}%`;
        let extra = '';
        if (r === 0 && c.prevN) extra = `   prev-opponent top board exact: ${((100 * c.prevHit) / c.prevN).toFixed(1)}% (n=${c.prevN})`;
        console.log(`  ${name.padEnd(9)} ${r} ${String(c.n).padStart(6)}  ${pct(c.bookHit).padStart(6)} ${pct(c.targetHit).padStart(7)}${extra}`);
      }
    }
  }
}

// A bare main() rewrote memory/book.json on plain require(), with the requiring process's own argv
// deciding where it wrote (review R3-9).
if (require.main === module) main();

module.exports = { main, eraOf, seasonOf, bkey, ERAS };
