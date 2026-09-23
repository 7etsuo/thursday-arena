'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const bookmod = require('../lib/book.js');
const target = require('../lib/target.js');
const sim = require('../lib/sim.js');

const CORPUS = path.join(__dirname, '..', 'data', 'corpus', 'battles.jsonl');
const U = (name, kitId, atk, hp, honey = false) => ({ name, kitId, atk, hp, honey });
const DAY = 86400000;
const T0 = Date.parse('2026-09-18T00:00:00Z');
const at = (h) => new Date(T0 + h * 3600000).toISOString();
const bk = (b) => bookmod.boardKey(bookmod.normBoard(b));

function tmpBook(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-book-'));
  return { dir, file: path.join(dir, 'book.json'), book: bookmod.open(path.join(dir, 'book.json'), opts) };
}

const A = [U('Webby', 'bulk', 3, 5), U('Cooper', 'echo', 2, 5), U('WTD', 'hype', 3, 4)];
const B = [U('Imogen', 'bulk', 2, 6), U('X Brief', 'echo', 2, 4), U('Luma Pages', 'hype', 2, 4)];
const C = [U('Credit Card Max', 'grow', 3, 4), U('Cooper', 'echo', 2, 5)];

// ---------------------------------------------------------------- record / lookup

test('record dedupes identical boards and lookup returns most-seen first', () => {
  const { book } = tmpBook();
  book.record({ season: 1, handle: 'alice', round: 1, board: B, ts: at(1) });
  book.record({ season: 1, handle: 'alice', round: 1, board: A, ts: at(2) });
  book.record({ season: 1, handle: 'alice', round: 1, board: A, ts: at(3) });

  const rows = book.lookup(1, 'alice', 1);
  assert.equal(rows.length, 2);
  assert.equal(bk(rows[0].board), bk(A));
  assert.equal(rows[0].n, 2);
  assert.equal(rows[0].lastTs, Date.parse(at(3)));
  assert.equal(rows[1].n, 1);
  assert.deepEqual(book.stats(), { keys: 1, boards: 2, observations: 3 });
});

test('the book is keyed by season, handle and round', () => {
  const { book } = tmpBook();
  book.record({ season: 1, handle: 'alice', round: 0, board: A, ts: at(1) });
  assert.equal(book.lookup(1, 'alice', 0).length, 1);
  assert.equal(book.lookup(1, 'alice', 1).length, 0);   // the enemy's next-round board is a different question
  assert.equal(book.lookup(2, 'alice', 0).length, 0);
  assert.equal(book.lookup(1, 'bob', 0).length, 0);
  assert.equal(book.lookup(1, 'ALICE', 0).length, 1);   // handles are case-insensitive
});

test('seat order is part of a board identity', () => {
  const { book } = tmpBook();
  book.record({ season: 1, handle: 'alice', round: 0, board: A, ts: at(1) });
  book.record({ season: 1, handle: 'alice', round: 0, board: [A[1], A[0], A[2]], ts: at(2) });
  assert.equal(book.lookup(1, 'alice', 0).length, 2);
});

test('record keeps the current match seats on the newest observation', () => {
  const { book } = tmpBook();
  const seats = { front: 'hot_seat', middle: 'encore', back: null };
  book.record({ season: 2, handle: 'alice', round: 2, board: A, seats, ts: at(1) });
  assert.deepEqual(book.lookup(2, 'alice', 2)[0].seats, seats);
});

test('Season 3 book keeps equipment, crew and captain through save and target lookup', () => {
  const { file, book } = tmpBook();
  const board = [{ name: 'Cooper', kitId: 'echo', atk: 2, hp: 5,
    honey: false, crew: 'marketing', item: 'foamPad' }];
  book.record({ season: 3, handle: 'alice', round: 1, board, captain: 'drill', ts: at(1) });
  book.record({ season: 3, handle: 'alice', round: 1,
    board: [{ ...board[0], item: 'laserPointer' }], captain: 'medic', ts: at(2) });
  book.save();
  const reopened = bookmod.open(file);
  const rows = reopened.lookup(3, 'alice', 1);
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map((r) => r.board[0].item)), new Set(['foamPad', 'laserPointer']));
  const t = target.build({ book: reopened, season: 3, round: 1, handle: 'alice', bookPolicy: 'frequency' });
  assert.deepEqual(new Set(t.entries.map((e) => e.theirCaptain)), new Set(['drill', 'medic']));
});

test('public Season 3 replay board preserves item and temporary attack', () => {
  const catalog = require('../lib/catalog');
  const bot = catalog.byName('Cooper');
  const board = bookmod.publicReplayBoard({ them: [{ botId: bot.id, atk: 2, tempAtk: 2,
    hp: 5, honey: true, item: 'foamPad' }] }, 'them');
  assert.equal(board.length, 1);
  assert.equal(board[0].atk, 4);
  assert.equal(board[0].item, 'foamPad');
  assert.equal(board[0].honey, true);
  assert.equal(board[0].crew, bot.crew);
});

// ---------------------------------------------------------------- caps and pruning

test('a key keeps only the 5 most recent distinct boards', () => {
  const { book } = tmpBook();
  const boards = [];
  for (let i = 0; i < 8; i++) {
    const b = [U('Webby', 'bulk', 3, 5 + i), U('Cooper', 'echo', 2, 5)];
    boards.push(b);
    book.record({ season: 1, handle: 'alice', round: 1, board: b, ts: at(i) });
  }
  const rows = book.lookup(1, 'alice', 1);
  assert.equal(rows.length, bookmod.MAX_BOARDS);
  const kept = new Set(rows.map((r) => bk(r.board)));
  for (let i = 3; i < 8; i++) assert.ok(kept.has(bk(boards[i])), `board ${i} should survive`);
  for (let i = 0; i < 3; i++) assert.ok(!kept.has(bk(boards[i])), `board ${i} should be evicted`);
});

test('prune drops handles not seen for 30 days', () => {
  const { book } = tmpBook();
  book.record({ season: 1, handle: 'stale', round: 0, board: A, ts: T0 });
  book.record({ season: 1, handle: 'fresh', round: 0, board: B, ts: T0 + 29 * DAY });
  assert.equal(book.prune(T0 + 31 * DAY), 1);
  assert.equal(book.lookup(1, 'stale', 0).length, 0);
  assert.equal(book.lookup(1, 'fresh', 0).length, 1);
});

test('the corpus seed is never pruned, and save() reports what it dropped', () => {
  // The whole corpus is dated within one day, so a wall-clock prune 31 days later deleted all 9,621
  // observations in a single save() -- silently, over the only copy (review R2-06).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-book-'));
  const file = path.join(dir, 'book.json');
  let clock = T0;
  const seed = bookmod.open(file, { empty: true, seeded: true, now: () => clock });
  seed.record({ season: 1, handle: 'corpus', round: 0, board: A, ts: T0 });
  seed.save();

  const live = bookmod.open(file, { now: () => clock });
  live.record({ season: 1, handle: 'live', round: 0, board: B, ts: T0 });
  clock = T0 + 45 * DAY;
  const { pruned } = live.save();
  assert.equal(pruned, 1, 'the live handle aged out');
  assert.equal(live.lookup(1, 'live', 0).length, 0);
  assert.equal(live.lookup(1, 'corpus', 0).length, 1, 'the seed survived');
  assert.equal(bookmod.open(file).stats().observations, 1, 'and it survived the round trip');
});

test('two writers on one file do not lose each other s matches', () => {
  // open() loads a snapshot and save() used to write the whole snapshot back, so the second writer
  // simply deleted the first one's match (review R2-08).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-book-'));
  const file = path.join(dir, 'book.json');
  const a = bookmod.open(file);
  const b = bookmod.open(file);
  a.record({ season: 1, handle: 'alice', round: 0, board: A, ts: at(1) });
  a.save();
  b.record({ season: 1, handle: 'bob', round: 0, board: B, ts: at(2) });
  b.save();

  const disk = bookmod.open(file);
  assert.equal(disk.lookup(1, 'alice', 0).length, 1, 'alice survived the second writer');
  assert.equal(disk.lookup(1, 'bob', 0).length, 1);
  assert.deepEqual(disk.stats(), { keys: 2, boards: 2, observations: 2 });

  // and a re-save does not double-count what this instance already wrote
  b.save();
  assert.deepEqual(bookmod.open(file).stats(), { keys: 2, boards: 2, observations: 2 });
});

test('an empty book rebuilds the file rather than merging into it', () => {
  // tools/build_book.js must stay idempotent: a merge would union the old book into the new one.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-book-'));
  const file = path.join(dir, 'book.json');
  const first = bookmod.open(file, { empty: true });
  first.record({ season: 1, handle: 'alice', round: 0, board: A, ts: at(1) });
  first.save();
  const second = bookmod.open(file, { empty: true });
  second.record({ season: 1, handle: 'alice', round: 0, board: A, ts: at(1) });
  second.save();
  assert.deepEqual(bookmod.open(file).stats(), { keys: 1, boards: 1, observations: 1 });
});

// ---------------------------------------------------------------- pool

test('pool aggregates across handles, weights by times faced, honours limit', () => {
  const { book } = tmpBook();
  book.record({ season: 1, handle: 'alice', round: 1, board: A, ts: at(1) });
  book.record({ season: 1, handle: 'bob', round: 1, board: A, ts: at(2) });
  book.record({ season: 1, handle: 'bob', round: 1, board: A, ts: at(3) });
  book.record({ season: 1, handle: 'carol', round: 1, board: B, ts: at(4) });
  book.record({ season: 1, handle: 'carol', round: 2, board: C, ts: at(5) });

  const p = book.pool(1, 1);
  assert.equal(p.length, 2);
  assert.equal(bk(p[0].board), bk(A));
  assert.equal(p[0].weight, 3);
  assert.equal(p[1].weight, 1);
  assert.equal(book.pool(1, 1, { limit: 1 }).length, 1);
  assert.equal(book.pool(1, 2).length, 1);
  assert.equal(book.pool(2, 1).length, 0);

  // leave-one-handle-out: the pool must carry no information about the handle the book half covers
  const q = book.pool(1, 1, { excludeHandle: 'bob' });
  assert.equal(q.length, 2);
  assert.equal(q.find((x) => bk(x.board) === bk(A)).weight, 1);
});

// ---------------------------------------------------------------- persistence

test('save is atomic and round-trips', () => {
  const { dir, file, book } = tmpBook();
  book.record({ season: 1, handle: 'alice', round: 0, board: A, ts: at(1) });
  book.record({ season: 2, handle: 'bob', round: 2, board: C, seats: { front: 'spotlight' }, ts: at(2) });
  book.save();

  assert.deepEqual(fs.readdirSync(dir), ['book.json'], 'no tmp file left behind');
  JSON.parse(fs.readFileSync(file, 'utf8'));

  const again = bookmod.open(file);
  assert.equal(bk(again.lookup(1, 'alice', 0)[0].board), bk(A));
  assert.deepEqual(again.lookup(2, 'bob', 2)[0].seats, { front: 'spotlight' });
  assert.deepEqual(again.stats(), book.stats());

  // a second save over a live file leaves exactly one file and stays readable
  again.record({ season: 1, handle: 'alice', round: 0, board: B, ts: at(3) });
  again.save();
  assert.deepEqual(fs.readdirSync(dir), ['book.json']);
  assert.equal(bookmod.open(file).lookup(1, 'alice', 0).length, 2);
});

test('a failed save retains observations for a later retry and cleans its temp file', () => {
  const { dir, file, book } = tmpBook();
  book.record({ season: 3, handle: 'alice', round: 0, board: A, ts: at(1) });
  const rename = fs.renameSync;
  try {
    fs.renameSync = () => { throw new Error('simulated rename failure'); };
    assert.throws(() => book.save(), /simulated rename failure/);
  } finally {
    fs.renameSync = rename;
  }
  assert.deepEqual(fs.readdirSync(dir), [], 'failed save removed its temporary file');

  // Another writer can still update the book before this process retries.
  const other = bookmod.open(file);
  other.record({ season: 3, handle: 'bob', round: 0, board: B, ts: at(2) });
  other.save();
  book.save();
  const saved = bookmod.open(file);
  assert.equal(saved.lookup(3, 'alice', 0)[0].n, 1);
  assert.equal(saved.lookup(3, 'bob', 0)[0].n, 1);
  book.save();
  assert.equal(bookmod.open(file).stats().observations, 2, 'a later save does not duplicate the retry');
});

test('a corrupt or foreign book file is preserved and refused, including on save', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-book-'));
  const file = path.join(dir, 'book.json');
  const book = bookmod.open(file);
  book.record({ season: 3, handle: 'alice', round: 0, board: A, ts: at(1) });
  for (const raw of ['{not json', JSON.stringify({ format: 99, entries: { x: [] } }),
    JSON.stringify({ format: 1, entries: { x: {} } })]) {
    fs.writeFileSync(file, raw);
    assert.throws(() => bookmod.open(file), /Invalid opponent book/);
    assert.throws(() => book.save(), /Invalid opponent book/);
    assert.equal(fs.readFileSync(file, 'utf8'), raw);
  }
  fs.unlinkSync(file);
  book.save();
  assert.equal(bookmod.open(file).lookup(3, 'alice', 0)[0].n, 1, 'pending observation survives failed saves');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a thin-season target retains boards that differ in equipment, crew, or captain', () => {
  const { book } = tmpBook();
  const board = [{ ...A[0], crew: 'sales', item: 'stapler' }];
  book.record({ season: 4, handle: 'alice', round: 0, board, captain: 'drill', ts: at(1) });
  book.record({ season: 3, handle: 'bob', round: 0, board, captain: 'medic', ts: at(1) });
  book.record({ season: 3, handle: 'bob', round: 0,
    board: [{ ...board[0], item: 'foamPad' }], captain: 'drill', ts: at(1) });
  const t = target.build({ book, season: 4, round: 0, populationPolicy: 'frequency' });
  assert.equal(t.entries.length, 3);
  assert.equal(t.entries.filter((e) => e.theirCaptain === 'medic').length, 1);
  assert.equal(t.entries.filter((e) => e.board[0].item === 'foamPad').length, 1);
});

test('clear empties the store so a rebuild is idempotent', () => {
  const { book } = tmpBook();
  book.record({ season: 1, handle: 'alice', round: 0, board: A, ts: at(1) });
  book.clear();
  assert.equal(book.stats().keys, 0);
});

// ---------------------------------------------------------------- beforeTs (leak-free offline evaluation)

test('beforeTs hides observations at or after the cutoff', () => {
  const { book } = tmpBook();
  book.record({ season: 1, handle: 'alice', round: 1, board: A, ts: at(1) });
  book.record({ season: 1, handle: 'alice', round: 1, board: A, ts: at(5) });
  book.record({ season: 1, handle: 'alice', round: 1, board: B, ts: at(9) });

  assert.equal(book.lookup(1, 'alice', 1, { beforeTs: at(0) }).length, 0);
  const mid = book.lookup(1, 'alice', 1, { beforeTs: at(6) });
  assert.equal(mid.length, 1, 'the board first seen at t=9 must not leak back to t=6');
  assert.equal(bk(mid[0].board), bk(A));
  assert.equal(mid[0].n, 2);
  assert.equal(mid[0].lastTs, Date.parse(at(5)));
  assert.equal(book.lookup(1, 'alice', 1, { beforeTs: at(3) })[0].n, 1);
  assert.equal(book.lookup(1, 'alice', 1).length, 2);

  assert.equal(book.pool(1, 1, { beforeTs: at(0) }).length, 0);
  assert.equal(book.pool(1, 1, { beforeTs: at(6) }).length, 1);
  assert.equal(book.pool(1, 1, { beforeTs: at(6) })[0].weight, 2);
  assert.equal(book.pool(1, 1).length, 2);
});

test('a target built with beforeTs never contains a board only seen later', () => {
  const { book } = tmpBook();
  book.record({ season: 1, handle: 'alice', round: 1, board: A, ts: at(1) });
  book.record({ season: 1, handle: 'bob', round: 1, board: C, ts: at(2) });
  book.record({ season: 1, handle: 'alice', round: 1, board: B, ts: at(9) });   // the future

  const t = target.build({ book, season: 1, round: 1, handle: 'alice', beforeTs: at(5) });
  const seen = t.entries.map((e) => bk(e.board));
  assert.ok(seen.includes(bk(A)));
  assert.ok(!seen.includes(bk(B)), 'future board leaked into the target');

  const later = target.build({ book, season: 1, round: 1, handle: 'alice' });
  assert.ok(later.entries.map((e) => bk(e.board)).includes(bk(B)));
});

// ---------------------------------------------------------------- target

const sumW = (t) => t.entries.reduce((s, e) => s + e.weight, 0);
const wOf = (t, board) => t.entries.filter((e) => bk(e.board) === bk(board)).reduce((s, e) => s + e.weight, 0);

function seeded() {
  const { book } = tmpBook();
  // alice is the handle we care about; the pool is everyone else
  book.record({ season: 1, handle: 'alice', round: 0, board: A, ts: at(1) });
  book.record({ season: 1, handle: 'alice', round: 1, board: B, ts: at(2) });
  for (let i = 0; i < 12; i++) {
    const b = [U('Newspaper', 'flamingo', 2, 6 + i), U('Cooper', 'echo', 2, 5)];
    book.record({ season: 1, handle: `h${i}`, round: 0, board: b, ts: at(3 + i) });
    book.record({ season: 1, handle: `h${i}`, round: 1, board: b, ts: at(3 + i) });
  }
  return book;
}

test('R0 target is 50% the previous opponent and 50% the pool', () => {
  const book = seeded();
  const seats = { front: 'warm_up' };
  const t = target.build({ book, season: 1, round: 0, handle: null, prevHandle: 'alice', seats });
  assert.ok(Math.abs(sumW(t) - 1) < 1e-12);
  assert.ok(Math.abs(wOf(t, A) - target.R0_BOOK_WEIGHT) < 1e-12);
  assert.equal(t.sources.bookN, 1);
  assert.ok(t.sources.poolN >= 10);
  for (const e of t.entries) assert.deepEqual(e.seats, seats, 'every entry carries the CURRENT match seats');
});

test('R0 uses the real handle when the shop reveals it, and the proxy only when it does not', () => {
  // The R0 opponent is hidden in 90.5% of shops, so prevHandle is a PROXY -- but it is known in the
  // other 9.5%, and the proxy's top board is exact only 47.0% of the time (n=641, review R1-05).
  const book = seeded();
  book.record({ season: 1, handle: 'bob', round: 0, board: C, ts: at(2) });

  const known = target.build({ book, season: 1, round: 0, handle: 'bob', prevHandle: 'alice' });
  assert.ok(wOf(known, C) >= target.R0_BOOK_WEIGHT, 'bob is the opponent we face, so bob is the book half');
  assert.ok(wOf(known, A) < target.R0_BOOK_WEIGHT, 'alice is last match: pool weight at most, never the book half');
  assert.match(known.note, /r0 book=1@0\.50/);

  const hidden = target.build({ book, season: 1, round: 0, handle: null, prevHandle: 'alice' });
  assert.ok(Math.abs(wOf(hidden, A) - target.R0_BOOK_WEIGHT) < 1e-12, 'no handle: fall back to the proxy');
  assert.ok(Math.abs(sumW(known) - 1) < 1e-12 && Math.abs(sumW(hidden) - 1) < 1e-12);
});

test('R1/R2 target is 75% this handle for that round and 25% the pool', () => {
  const book = seeded();
  const t = target.build({ book, season: 1, round: 1, handle: 'alice', prevHandle: 'zed' });
  assert.ok(Math.abs(sumW(t) - 1) < 1e-12);
  assert.ok(Math.abs(wOf(t, B) - target.R12_BOOK_WEIGHT) < 1e-12);
  assert.equal(t.sources.bookWeight, target.R12_BOOK_WEIGHT);
  // R1 must use alice's ROUND 1 board, never her round 0 one
  assert.ok(!t.entries.map((e) => bk(e.board)).includes(bk(A)));
});

test('unknown handle or no previous opponent falls back to the pool alone', () => {
  const book = seeded();
  const a = target.build({ book, season: 1, round: 1, handle: 'nobody' });
  assert.equal(a.sources.bookN, 0);
  assert.equal(a.sources.bookWeight, 0);
  assert.ok(Math.abs(sumW(a) - 1) < 1e-12);
  assert.match(a.note, /no book entry/);

  const b = target.build({ book, season: 1, round: 0, handle: null, prevHandle: null });
  assert.equal(b.sources.bookWeight, 0);
  assert.ok(Math.abs(sumW(b) - 1) < 1e-12);
  assert.match(b.note, /no previous opponent/);
});

test('an empty book yields an empty target instead of throwing', () => {
  const { book } = tmpBook();
  const t = target.build({ book, season: 1, round: 0, handle: null, prevHandle: null });
  assert.deepEqual(t.entries, []);
  assert.equal(t.sources.poolN, 0);
});

test('book-only target when the pool is empty', () => {
  const { book } = tmpBook();
  book.record({ season: 1, handle: 'alice', round: 1, board: A, ts: at(1) });
  const t = target.build({ book, season: 1, round: 1, handle: 'alice' });
  assert.equal(t.sources.bookWeight, 1);
  assert.ok(Math.abs(wOf(t, A) - 1) < 1e-12);
  assert.match(t.note, /book only/);
});

test('a thin same-season pool blends in the previous season and says so', () => {
  const book = seeded();                                     // 12 season-1 pool boards
  book.record({ season: 2, handle: 'alice', round: 1, board: C, ts: at(20) });
  book.record({ season: 2, handle: 'newbie', round: 1, board: A, ts: at(21) });
  const t = target.build({ book, season: 2, round: 1, handle: 'alice' });
  assert.match(t.note, /blended season 1/);
  assert.ok(t.sources.poolN > 1);
  assert.ok(Math.abs(sumW(t) - 1) < 1e-12);
  assert.ok(Math.abs(wOf(t, C) - target.R12_BOOK_WEIGHT) < 1e-12);
});

test('target weights split proportionally to how often a board was faced', () => {
  const { book } = tmpBook();
  book.record({ season: 1, handle: 'alice', round: 1, board: A, ts: at(1) });
  book.record({ season: 1, handle: 'alice', round: 1, board: A, ts: at(2) });
  book.record({ season: 1, handle: 'alice', round: 1, board: A, ts: at(3) });
  book.record({ season: 1, handle: 'alice', round: 1, board: B, ts: at(4) });
  book.record({ season: 1, handle: 'bob', round: 1, board: C, ts: at(5) });
  const t = target.build({ book, season: 1, round: 1, handle: 'alice' });
  assert.ok(Math.abs(wOf(t, A) - 0.75 * 0.75) < 1e-12);
  assert.ok(Math.abs(wOf(t, B) - 0.75 * 0.25) < 1e-12);
  assert.ok(Math.abs(wOf(t, C) - 0.25) < 1e-12);
});

test('recency shifts boards within a handle while preserving book and pool shares', () => {
  const { book } = tmpBook();
  book.record({ season: 1, handle: 'alice', round: 1, board: A, ts: at(1) });
  book.record({ season: 1, handle: 'alice', round: 1, board: B, ts: at(5) });
  book.record({ season: 1, handle: 'bob', round: 1, board: C, ts: at(6) });
  const base = target.build({ book, season: 1, round: 1, handle: 'alice' });
  const recent = target.build({ book, season: 1, round: 1, handle: 'alice', recencyHalfLifeMs: 3600000 });
  assert.ok(Math.abs(wOf(base, A) - wOf(base, B)) < 1e-12);
  assert.ok(wOf(recent, B) > wOf(recent, A));
  assert.ok(Math.abs(sumW(recent) - 1) < 1e-12);
  assert.deepEqual(new Set(recent.entries.map((e) => e.source)), new Set(['book', 'pool']));
  assert.ok(Math.abs(recent.entries.filter((e) => e.source === 'book').reduce((n, e) => n + e.weight, 0) - 0.75) < 1e-12);
  assert.ok(Math.abs(recent.entries.filter((e) => e.source === 'pool').reduce((n, e) => n + e.weight, 0) - 0.25) < 1e-12);
});

test('latest-board targets replace stale frequency only within the handle and respect beforeTs', () => {
  const { book } = tmpBook();
  for (const day of [1, 2, 3]) book.record({ season: 3, handle: 'alice', round: 1, board: A, ts: at(day) });
  book.record({ season: 3, handle: 'alice', round: 1, board: B, captain: 'medic', ts: at(4) });
  book.record({ season: 3, handle: 'bob', round: 1, board: C, ts: at(2) });
  const build = (extra = {}) => target.build({ book, season: 3, round: 1, handle: 'alice',
    bookPolicy: 'latest', ...extra });
  const current = build();
  assert.equal(wOf(current, A), 0);
  assert.equal(wOf(current, B), 0.75);
  assert.equal(wOf(current, C), 0.25);
  assert.equal(current.entries.find((e) => e.source === 'book').theirCaptain, 'medic');
  const earlier = build({ beforeTs: Date.parse(at(3)) + 1 });
  assert.equal(wOf(earlier, A), 0.75);
  assert.equal(wOf(earlier, B), 0);
  assert.ok(wOf(build({ bookPolicy: 'frequency' }), A) > wOf(build({ bookPolicy: 'frequency' }), B));
  assert.equal(book.lookup(3, 'alice', 1).length, 2, 'historical evidence remains in memory');
  assert.deepEqual(target.build({ book, season: 3, round: 1, handle: 'alice' }), current,
    'live S3 defaults to the most recent observed lineup');
});

// ---------------------------------------------------------------- inferGhost

// The corpus rows hold the exact battle inputs the audit's verifier recovered, and lib/sim.js reproduces every
// one of those 10,065 battles frame for frame (docs/ENGINE_BATTLE.md §4).  So replaying a row gives exactly the
// frames the server sent, which is the only input inferGhost gets in live play.
function corpusRows() {
  if (!fs.existsSync(CORPUS)) return null;
  return fs.readFileSync(CORPUS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
const framesOf = (r) => sim.simulate(r.you, r.them, { round: r.round, seats: r.seats || null, frames: true }).frames;

test('inferGhost recovers the enemy board of every recorded battle, honey included', (t) => {
  const rows = corpusRows();
  if (!rows) return t.skip('data/corpus/battles.jsonl missing');
  let n = 0; let ok = 0; let honeyN = 0; let honeyOk = 0;
  const bad = [];
  for (const r of rows) {
    const frames = framesOf(r);
    const got = bookmod.inferGhost({ frames, ourUnits: r.you, round: r.round, seats: r.seats || null });
    const hit = bk(got) === bk(r.them);
    n++; if (hit) ok++;
    if (r.them.some((u) => u.honey)) { honeyN++; if (hit) honeyOk++; }
    if (!hit && bad.length < 5) bad.push({ ts: r.ts, want: bk(r.them), got: bk(got) });
  }
  assert.ok(honeyN > 1000, `expected plenty of enemy-honey battles, got ${honeyN}`);
  assert.deepEqual(bad, []);
  assert.equal(ok, n);
  assert.equal(honeyOk, honeyN);
});

test('inferGhost resolves honey that the Drone caption alone cannot see', () => {
  const rows = corpusRows();
  if (!rows) return;
  // battles where the enemy honey is NOT readable from the captions: the caption reading disagrees with the
  // recorded board, and only the sim replay settles it (the audit needed this for 35 of 10,065 battles).
  let searched = 0;
  for (const r of rows) {
    if (!r.them.some((u) => u.honey)) continue;
    const frames = framesOf(r);
    const capt = bookmod.captionHoney(frames).them;
    if (r.them.every((u, i) => !!u.honey === !!capt[i])) continue;
    searched++;
    const got = bookmod.inferGhost({ frames, ourUnits: r.you, round: r.round, seats: r.seats || null });
    assert.equal(bk(got), bk(r.them));
    if (searched >= 20) break;
  }
  assert.ok(searched > 0, 'expected at least one battle needing the honey search');
});

test('inferGhost recovers hidden honey with the newer recorded opening caption', () => {
  // Live battle 2026-09-20T06:16:25.093Z. The enemy Event Producer carried honey,
  // but its Drone appeared after Memento's own faint, so captionHoney alone missed it.
  const names = [
    'Memento', 'Flora: Plant Care Log', 'Outbound Prospecting', 'Event Producer',
    'Nightly Audit Engineer', 'NYC Parent', 'Drone',
  ];
  // Recorded frames, compacted as [caption, your [name index, ATK, HP][], enemy ...].
  const recorded = [
    ['The fight starts',[[0,5,4],[1,2,6],[2,3,4]],[[3,3,3],[4,3,6],[5,2,6]]],
    ['Warm-up: Flora: Plant Care Log +1/+1',[[0,5,4],[1,3,7],[2,3,4]],[[3,3,3],[4,3,6],[5,2,6]]],
    ['Warm-up: Nightly Audit Engineer +1/+1',[[0,5,4],[1,3,7],[2,3,4]],[[3,3,3],[4,4,7],[5,2,6]]],
    ['Outbound Prospecting snipes Event Producer for 1',[[0,5,4],[1,3,7],[2,3,4]],[[3,3,2],[4,4,7],[5,2,6]]],
    ['NYC Parent bulks up: +2 HP',[[0,5,4],[1,3,7],[2,3,4]],[[3,3,2],[4,4,7],[5,2,8]]],
    ['Memento and Event Producer trade: -3 HP / -5 HP',[[0,5,1],[1,3,7],[2,3,4]],[[3,3,-3],[4,4,7],[5,2,8]]],
    ['Flora: Plant Care Log patches Memento: +1 HP',[[0,5,2],[1,3,7],[2,3,4]],[[3,3,-3],[4,4,7],[5,2,8]]],
    ['Event Producer is knocked out',[[0,5,2],[1,3,7],[2,3,4]],[[4,4,7],[5,2,8]]],
    ['Event Producer pokes Memento: 2',[[0,5,0],[1,3,7],[2,3,4]],[[4,4,7],[5,2,8]]],
    ['Memento is knocked out',[[1,3,7],[2,3,4]],[[4,4,7],[5,2,8]]],
    ['Memento passes its memory to Flora: Plant Care Log: +5 ATK',[[1,8,7],[2,3,4]],[[4,4,7],[5,2,8]]],
    ['Drone joins the enemy side',[[1,8,7],[2,3,4]],[[6,1,1],[4,4,7],[5,2,8]]],
    ['Nightly Audit Engineer covers the fall: +2 ATK',[[1,8,7],[2,3,4]],[[6,1,1],[4,6,7],[5,2,8]]],
    ['Flora: Plant Care Log and Drone trade: -1 HP / -8 HP',[[1,8,6],[2,3,4]],[[6,1,-7],[4,6,7],[5,2,8]]],
    ['Drone is knocked out',[[1,8,6],[2,3,4]],[[4,6,7],[5,2,8]]],
    ['Nightly Audit Engineer covers the fall: +2 ATK',[[1,8,6],[2,3,4]],[[4,8,7],[5,2,8]]],
    ['Flora: Plant Care Log and Nightly Audit Engineer trade: -8 HP / -8 HP',[[1,8,-2],[2,3,4]],[[4,8,-1],[5,2,8]]],
    ['Flora: Plant Care Log is knocked out',[[2,3,4]],[[4,8,-1],[5,2,8]]],
    ['Nightly Audit Engineer is knocked out',[[2,3,4]],[[5,2,8]]],
    ['Outbound Prospecting and NYC Parent trade: -2 HP / -3 HP',[[2,3,2]],[[5,2,5]]],
    ['Outbound Prospecting and NYC Parent trade: -2 HP / -3 HP',[[2,3,0]],[[5,2,2]]],
    ['Outbound Prospecting is knocked out',[],[[5,2,2]]],
    ['The enemy side holds the floor',[],[[5,2,2]]],
  ];
  const units = (xs) => xs.map(([i, atk, hp]) => ({ name: names[i], atk, hp }));
  const frames = recorded.map(([caption, you, them]) => ({ caption, you: units(you), them: units(them) }));
  const ourUnits = [
    U('Memento', 'recall', 5, 4),
    U('Flora: Plant Care Log', 'patch', 2, 6),
    U('Outbound Prospecting', 'mosquito', 3, 4),
  ];
  const seats = { front: 'encore', middle: 'warm_up' };
  assert.deepEqual(bookmod.captionHoney(frames).them, [false, false, false]);
  const got = bookmod.inferGhost({ frames, ourUnits, round: 1, seats });
  assert.deepEqual(got.map((u) => u.honey), [true, false, false]);
  assert.deepEqual(got.map((u) => [u.name, u.atk, u.hp]), [
    ['Event Producer', 3, 3], ['Nightly Audit Engineer', 3, 6], ['NYC Parent', 2, 6],
  ]);
});

test('inferGhost reads kits from the catalog and stats from frame 0', () => {
  const rows = corpusRows();
  if (!rows) return;
  const r = rows.find((x) => x.them.length === 3 && x.them.every((u) => u.kitId));
  const got = bookmod.inferGhost({ frames: framesOf(r), ourUnits: r.you, round: r.round, seats: r.seats || null });
  assert.deepEqual(got.map((u) => [u.name, u.kitId, u.atk, u.hp]), r.them.map((u) => [u.name, u.kitId, u.atk, u.hp]));
});

test('inferGhost falls back to the Drone caption when no replay reproduces the frames', () => {
  const rows = corpusRows();
  if (!rows) return;
  const r = rows.find((x) => x.them.some((u) => u.honey) && x.you.length === 3);
  const frames = framesOf(r);
  // pretend we do not know our own board: no honey assignment can then reproduce the frames
  const wrongUs = r.you.map((u) => ({ ...u, atk: u.atk + 7, hp: u.hp + 7, honey: false }));
  const got = bookmod.inferGhost({ frames, ourUnits: wrongUs, round: r.round, seats: r.seats || null });
  const capt = bookmod.captionHoney(frames).them;
  assert.deepEqual(got.map((u) => u.honey), r.them.map((_, i) => !!capt[i]));
  assert.deepEqual(got.map((u) => u.name), r.them.map((u) => u.name));
});

test('inferGhost tolerates missing or empty frames', () => {
  assert.deepEqual(bookmod.inferGhost({ frames: [] }), []);
  assert.deepEqual(bookmod.inferGhost({}), []);
});

// ---------------------------------------------------------------- end-to-end

test('a recorded battle can be inferred, booked and turned into a target', () => {
  const rows = corpusRows();
  if (!rows) return;
  const r = rows.find((x) => x.them.length === 3 && !x.s2);
  const { book } = tmpBook();
  const enemy = bookmod.inferGhost({ frames: framesOf(r), ourUnits: r.you, round: r.round, seats: r.seats || null });
  book.record({ season: 1, handle: r.handle, round: r.round, board: enemy, ts: r.ts, matchId: r.mid });
  const t = target.build({ book, season: 1, round: r.round, handle: r.handle, prevHandle: r.handle });
  assert.ok(t.entries.length >= 1);
  assert.equal(bk(t.entries[0].board), bk(r.them));
  assert.ok(Math.abs(sumW(t) - 1) < 1e-12);
});
