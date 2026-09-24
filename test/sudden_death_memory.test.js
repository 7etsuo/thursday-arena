'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const bookLib = require('../lib/book');
const model = require('../lib/opponent_model');
const historyLib = require('../lib/public_history');
const fixture = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,
  'fixtures/sudden-death-memory-20260924.json.gz'))));

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-sudden-memory-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('the actual fourth-round attack survives saving, reopening, retry and another writer', (t) => {
  const dir = sandbox(t), file = path.join(dir, 'book.json');
  const e = fixture.attackingObservation, now = () => Date.parse(e.observedAt) + 1000;
  let book = bookLib.open(file, { now });
  book.record({ ...e, ts: e.observedAt });
  book.save();
  const first = JSON.parse(fs.readFileSync(file));
  assert.equal(first.outgoing[0].round, 3);
  assert.equal(first.outgoing[0].matchId, e.matchId);
  assert.equal(first.outgoing[0].board[0].fusedWith, e.board[0].fusedWith);
  assert.deepEqual(first.outgoing[0].relics, e.relics);
  // These two operations were the exact next-save and restart failures in the logs.
  book.save();
  book = bookLib.open(file, { now });
  assert.deepEqual(book.data().outgoing, first.outgoing);
  assert.deepEqual(book.data().receipts, first.receipts);
  assert.equal(book.lookup(4, e.handle, 3)[0].n, 1);
  assert.equal(book.record({ ...e, ts: e.observedAt }), null, 'receipt survives reopening');

  book.record({ ...e, round: 0, matchId: 'next-attack', observationId: 'attack:next-attack:0', ts: now() });
  fs.mkdirSync(`${file}.tmp-${process.pid}`);
  assert.throws(() => book.save(), /EISDIR/);
  fs.rmdirSync(`${file}.tmp-${process.pid}`);
  const other = bookLib.open(file, { now });
  other.record({ ...e, matchId: 'other-attack', observationId: 'attack:other-attack:3', ts: now() });
  other.save();
  book.save(); book.save();
  const restarted = bookLib.open(file, { now });
  assert.equal(restarted.stats().observations, 3);
  assert.equal(restarted.data().outgoing.length, 3);
  assert.equal(Object.keys(restarted.data().receipts).length, 3);
  assert.equal(restarted.lookup(4, e.handle, 3)[0].n, 2);
});

test('invalid rounds and timestamps are rejected before observation or receipt mutation', (t) => {
  const e = fixture.attackingObservation, book = bookLib.open(path.join(sandbox(t), 'book.json'));
  for (const change of [{ round: -1 }, { round: 4 }, { round: 1.5 }, { ts: Infinity }, { ts: NaN }]) {
    const before = structuredClone(book.data());
    assert.throws(() => book.record({ ...e, ts: e.observedAt, ...change }), /book.record/);
    assert.deepEqual(book.data(), before);
  }
  const outgoing = { season: 4, round: 4, handle: e.handle, matchId: e.matchId,
    board: e.board, ts: Date.parse(e.observedAt) };
  const data = {};
  assert.throws(() => model.append(data, outgoing), /Invalid outgoing/);
  assert.deepEqual(data, {});
});

test('save validates the serialized book before replacing a readable file', (t) => {
  const e = fixture.attackingObservation, file = path.join(sandbox(t), 'book.json');
  const book = bookLib.open(file, { empty: true, now: () => Date.parse(e.observedAt) });
  book.record({ ...e, ts: e.observedAt }); book.save();
  const before = fs.readFileSync(file);
  book.data().outgoing[0].round = 4;
  assert.throws(() => book.save(), /outgoing observations/);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(bookLib.open(file).data().outgoing[0].round, 3);
  book.data().outgoing[0].round = 3;
  book.data().receipts.invalid = Infinity;
  assert.throws(() => book.save(), /receipts/);
  assert.deepEqual(fs.readFileSync(file), before, 'JSON Infinity-to-null cannot corrupt receipts');
  delete book.data().receipts.invalid;
  book.save();
  assert.equal(bookLib.open(file).stats().observations, 1);
});

test('the real four-round defense learns once through a failed history commit and restart', async (t) => {
  const dir = sandbox(t), file = path.join(dir, 'history.json'), bookFile = path.join(dir, 'book.json');
  const now = () => Date.parse(fixture.raw.played_at) + 1000;
  const row = historyLib.rowOf(fixture.raw, 'tetsuoai', 4);
  const rounds = historyLib.replayInputs(fixture.detail, row, 'tetsuoai', 4);
  assert.deepEqual(rounds.map(r => r.round), [0, 1, 2, 3]);
  assert.deepEqual(rounds[3].series, { you: 1, them: 1 });
  assert.deepEqual(rounds[3].kept, { you: { hp: 2, atk: 9 }, them: { hp: 1, atk: 3 } });
  assert.equal(rounds[3].metadata, 'unique_trace_match');
  const arena = {
    playerMatches: async () => ({ data: [fixture.raw], next_cursor: null }),
    getPublicMatchDetail: async () => fixture.detail,
  };
  const open = () => historyLib.open({ file, season: 4, handle: 'tetsuoai', now });
  const book = bookLib.open(bookFile, { now });
  fs.mkdirSync(`${file}.tmp-${process.pid}`);
  const failed = await open().poll({ arena, book });
  assert.match(failed.error, /EISDIR/);
  assert.equal(bookLib.open(bookFile, { now }).stats().observations, 4,
    'all four observations reached the book before the history commit failed');
  fs.rmdirSync(`${file}.tmp-${process.pid}`);
  const restarted = bookLib.open(bookFile, { now }), store = open(), events = [];
  const result = await store.poll({ arena, book: restarted, event: (type, e) => events.push({ type, ...e }) });
  assert.equal(result.error, undefined); assert.equal(result.pending, 0);
  assert.equal(restarted.stats().observations, 4);
  assert.equal(Object.keys(restarted.data().receipts).length, 4);
  assert.equal(restarted.lookup(4, row.opponent, 3)[0].n, 1);
  assert.equal(store.defenseTarget(3).entries.length, 1);
  assert.deepEqual(store.defenseTarget(3).entries[0].kept, rounds[3].kept);
  assert.deepEqual(events.find(e => e.type === 'book' && e.round === 3).kept, rounds[3].kept);
  arena.getPublicMatchDetail = async () => { throw new Error('already committed replay must not be fetched'); };
  const again = await open().poll({ arena, book: bookLib.open(bookFile, { now }) });
  assert.equal(again.error, undefined); assert.equal(again.pending, 0);
  assert.equal(bookLib.open(bookFile, { now }).stats().observations, 4);
});

test('invalid four-round replay order, eligibility or adjudication cannot enter defense learning', () => {
  const row = historyLib.rowOf(fixture.raw, 'tetsuoai', 4);
  for (const change of [
    d => { d.rounds[3].round = 2; },
    d => { d.rounds[2].winner = 'draw'; },
    d => { d.rounds[3].winner = 'not-a-winner'; },
    d => { d.rounds[3].suddenDeath.kept.you.hp++; },
    d => { d.rounds.push(d.rounds[3]); },
  ]) {
    const detail = structuredClone(fixture.detail); change(detail);
    assert.throws(() => historyLib.replayInputs(detail, row, 'tetsuoai', 4),
      /Malformed defense round|Inconsistent sudden-death|does not match/);
  }
});

test('older defensive metadata refreshes missing survival totals without recounting boards', async (t) => {
  const dir = sandbox(t), file = path.join(dir, 'history.json');
  const now = () => Date.parse(fixture.raw.played_at) + 1000;
  const book = bookLib.open(path.join(dir, 'book.json'), { now });
  let fetches = 0;
  const arena = {
    playerMatches: async () => ({ data: [fixture.raw], next_cursor: null }),
    getPublicMatchDetail: async () => { fetches++; return fixture.detail; },
  };
  const open = () => historyLib.open({ file, season: 4, handle: 'tetsuoai', now });
  await open().poll({ arena, book });
  const old = JSON.parse(fs.readFileSync(file));
  for (const r of old.matches[fixture.raw.id].rounds) delete r.kept;
  fs.writeFileSync(file, JSON.stringify(old));
  const before = structuredClone(book.data()), events = [], store = open();
  const result = await store.poll({ arena, book, event: (type, e) => events.push({ type, ...e }) });
  assert.equal(result.upgraded, 1); assert.equal(result.learned, 0);
  assert.deepEqual(book.data(), before);
  assert.deepEqual(store.data().matches[fixture.raw.id].rounds[3].kept,
    { you: { hp: 2, atk: 9 }, them: { hp: 1, atk: 3 } });
  assert.equal(events.filter(e => e.type === 'defense_metadata').length, 4);
  await open().poll({ arena, book });
  assert.equal(fetches, 2);
});
