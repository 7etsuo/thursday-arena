'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), zlib = require('node:zlib');
const historyLib = require('../lib/public_history'), bookLib = require('../lib/book'), targetLib = require('../lib/target');
const fixture = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures/s3-defense-history-20260921.json.gz'))));
const AT = Date.parse('2026-09-21T15:10:00Z');
function setup(rows = fixture.history, details = fixture.details) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-history-test-'));
  const book = bookLib.open(path.join(dir, 'book.json'), { now: () => AT, maxBoards: 1000 });
  const file = path.join(dir, 'history.json');
  const open = () => historyLib.open({ file, handle: 'tetsuoai', now: () => AT });
  const calls = [];
  const arena = {
    playerMatches: async (_handle, { cursor, limit }) => {
      const start = Number(cursor || 0); calls.push(['page', start]);
      return { data: rows.slice(start, start + limit), next_cursor: start + limit < rows.length ? String(start + limit) : null };
    },
    getPublicMatchDetail: async (id) => { calls.push(['detail', id]); return details[id]; },
  };
  return { dir, file, book, open, arena, calls };
}

test('all 129 real defenses enter learning once across pagination and restarts; rating totals reconcile', async () => {
  const h = setup();
  let store;
  for (let i = 0; i < 14; i++) {
    store = h.open();
    const result = await store.poll({ ...h, maxPages: 1, maxDetails: 30 });
    assert.equal(result.error, undefined);
  }
  const report = store.report();
  assert.deepEqual(report.attack, { games: 1151, wins: 999, losses: 112, draws: 40, elo: 955 });
  assert.deepEqual(report.defense, { games: 129, wins: 28, losses: 88, draws: 13, elo: -1211 });
  assert.equal(report.combinedElo, -256);
  assert.equal(report.pending, 0);
  assert.equal(report.backfillPending, false);
  const before = h.book.stats();
  assert.equal(before.observations, 330);
  assert.equal(Object.keys(h.book.data().receipts).length, 330);
  assert.ok(store.defenseTarget(2).entries.length > 0);
  const learned = h.book.lookup(3, 'ternquest_com', 2);
  assert.ok(learned.length && learned.some((r) => r.board.some((u) => u.item)));
  const target = targetLib.build({ book: h.book, season: 3, round: 2, handle: 'ternquest_com' });
  assert.ok(target.entries.some((e) => e.source === 'book'));
  await h.open().poll({ ...h, maxPages: 20, maxDetails: 200 });
  assert.deepEqual(h.book.stats(), before);
  assert.equal(h.calls.filter((c) => c[0] === 'detail').length, 129);
});

test('replay failures retry without poisoning the cursor or marking boards learned', async () => {
  const row = fixture.history.find((r) => fixture.details[r.id]);
  const h = setup([row], {}), events = [];
  await h.open().poll({ ...h, event: (type, e) => events.push({ type, ...e }) });
  assert.equal(h.book.stats().observations, 0);
  assert.equal(h.open().report().pending, 1);
  assert.ok(events.some((e) => e.where === 'defense_replay'));
  const store = historyLib.open({ file: h.file, handle: 'tetsuoai', now: () => AT + 60001 });
  h.arena.getPublicMatchDetail = async () => fixture.details[row.id];
  await store.poll(h);
  assert.equal(store.report().pending, 0);
  assert.equal(h.book.stats().observations, fixture.details[row.id].rounds.length);
});

test('a crash after book save but before history commit does not double-count on retry', async () => {
  const row = fixture.history.find((r) => fixture.details[r.id]), h = setup([row]);
  fs.mkdirSync(h.file); // force the history rename to fail after the book has landed
  const store = historyLib.open({ file: path.join(h.dir, 'other.json'), handle: 'tetsuoai', now: () => AT });
  // Fail the rename using the same temporary path without corrupting the existing history file.
  fs.mkdirSync(`${path.join(h.dir, 'other.json')}.tmp-${process.pid}`);
  const result = await store.poll(h);
  assert.match(result.error, /EISDIR/);
  const first = h.book.stats();
  assert.ok(first.observations > 0);
  fs.rmdirSync(`${path.join(h.dir, 'other.json')}.tmp-${process.pid}`);
  const retry = historyLib.open({ file: path.join(h.dir, 'other.json'), handle: 'tetsuoai', now: () => AT });
  await retry.poll(h);
  assert.deepEqual(h.book.stats(), first);
  assert.equal(retry.report().pending, 0);
});

test('book receipts survive failed saves and merge with observations from another writer', () => {
  const h = setup(), other = bookLib.open(h.book.file, { now: () => AT });
  const obs = { season: 3, handle: 'rival', round: 0, ts: AT, board: [{ name: 'Cooper', kitId: 'sting', atk: 3, hp: 4 }] };
  h.book.record({ ...obs, observationId: 'defense:a:0' });
  fs.mkdirSync(`${h.book.file}.tmp-${process.pid}`);
  assert.throws(() => h.book.save());
  fs.rmdirSync(`${h.book.file}.tmp-${process.pid}`);
  other.record({ ...obs, handle: 'second' }); other.save();
  h.book.save(); h.book.record({ ...obs, observationId: 'defense:a:0' }); h.book.save();
  const reread = bookLib.open(h.book.file);
  assert.equal(reread.lookup(3, 'rival', 0)[0].n, 1);
  assert.equal(reread.lookup(3, 'second', 0)[0].n, 1);
});

test('wrong accounts, roles, seasons, malformed pages and repeated cursors cannot become learned data', async () => {
  const raw = fixture.history.find((r) => fixture.details[r.id]);
  assert.throws(() => historyLib.rowOf(raw, 'someone_else', 3));
  assert.equal(historyLib.rowOf(raw, 'tetsuoai', 2), null);
  const row = historyLib.rowOf(raw, 'tetsuoai', 3);
  const detail = fixture.details[row.id];
  assert.throws(() => historyLib.replayInputs({ ...detail, opponent: { kind: 'ghost', x_handle: 'wrong' } }, row, 'tetsuoai', 3));
  assert.throws(() => historyLib.replayInputs({ ...detail, rated: false }, row, 'tetsuoai', 3));
  const h = setup();
  h.arena.playerMatches = async () => ({ data: [raw], next_cursor: 'same' });
  assert.match((await h.open().poll(h)).error, /cursor did not advance/);
  assert.equal(h.book.stats().observations, 0);
  fs.writeFileSync(h.file, '{broken');
  assert.throws(() => h.open(), /Cannot read/);
});

test('new head records with the same timestamp are fetched after a checkpoint', async () => {
  const raw = fixture.history.find((r) => !fixture.details[r.id]), rows = [{ ...raw, id: 'old' }];
  const h = setup(rows);
  await h.open().poll(h);
  rows.unshift({ ...raw, id: 'new' });
  const store = h.open(); await store.poll(h);
  assert.equal(store.report().attack.games, 2);
  assert.equal(store.report().attack.elo, 2 * historyLib.rowOf(raw, 'tetsuoai', 3).elo);
});

test('saved defense context upgrades without recording observations twice', async () => {
  const raw = fixture.history.find(r => fixture.details[r.id] && Date.parse(r.played_at) >= AT - 3600000);
  assert.ok(raw);
  const h = setup([raw]);
  await h.open().poll(h);
  const before = h.book.stats(), data = JSON.parse(fs.readFileSync(h.file));
  const row = data.matches[raw.id];
  const expected = row.rounds.map(r => r.series);
  for (const round of row.rounds) delete round.series;
  delete row.kRatio;
  fs.writeFileSync(h.file, JSON.stringify(data));
  const events = [], store = h.open();
  await store.poll({ ...h, event: (type, e) => events.push({ type, ...e }) });
  assert.deepEqual(h.book.stats(), before);
  assert.deepEqual(store.data().matches[raw.id].rounds.map(r => r.series), expected);
  assert.equal(events.filter(e => e.type === 'book').length, 0);
  assert.equal(h.calls.filter(c => c[0] === 'detail').length, 2);
  const target = store.defenseTarget(0);
  assert.ok(Number.isFinite(target.exposure));
});

test('the real driver polls before planning, logs defense observations, and skips polling in practice', async () => {
  const raw = fixture.history.find((r) => fixture.details[r.id]), h = setup([raw]);
  const mock = require('./mock_arena').create({ seed: 19, season: 3 });
  const events = [];
  let plans = 0, auth = 0;
  Object.assign(mock, h.arena, { getMe: async () => { auth++; return { xHandle: 'tetsuoai' }; } });
  const planner = {
    chooseCaptain: (S) => S.captainOffer[0],
    planStep: (S) => {
      assert.ok(h.book.lookup(3, historyLib.rowOf(raw, 'tetsuoai', 3).opponent, 0).length);
      plans++;
      const i = S.offers.findIndex((o) => o && o.cost <= S.gold);
      return S.board.length < 3 && i >= 0 ? { actions: [{ type: 'buy', shopIndex: i }] } : { done: true };
    },
    seatingActions: () => [], utility: require('../lib/planner').utility,
  };
  await require('../driver/play_loop').run({ arena: mock, planner, book: h.book,
    historyFile: h.file, telemetry: { event: (type, payload) => events.push({ type, ...payload }), close() {} },
    games: 1, start: true, prevHandle: null, lastOpponentFile: path.join(h.dir, 'last.json') });
  assert.equal(auth, 1); assert.ok(plans > 0);
  assert.ok(events.some((e) => e.type === 'history' && e.defense.games === 1));
  const learned = events.filter((e) => e.type === 'book' && e.source === 'defense_replay');
  assert.equal(learned.length, fixture.details[raw.id].rounds.length);
  assert.ok(learned.every((e) => e.board.length && e.observedAt && !e.matchKey));
  mock.practice = true;
  let practicePolls = 0;
  mock.playerMatches = async () => { practicePolls++; throw new Error('practice must not poll'); };
  mock.getMe = async () => { auth++; throw new Error('practice must not read an account'); };
  const out = await require('../driver/play_loop').run({ arena: mock, book: h.book,
    telemetry: { event() {}, close() {} }, games: 1, dry: true });
  assert.equal(out.exitReason, 'dry');
  assert.equal(practicePolls, 0);
  assert.equal(auth, 1);
});

test('book merge retains both stores of defensive observation receipts', () => {
  const h = setup(), otherFile = path.join(h.dir, 'other-book.json');
  const other = bookLib.open(otherFile, { now: () => AT });
  const obs = { season: 3, handle: 'rival', round: 0, ts: AT, board: [{ name: 'Cooper', kitId: 'sting', atk: 3, hp: 4 }] };
  h.book.record({ ...obs, observationId: 'defense:one:0' }); h.book.save();
  other.record({ ...obs, ts: AT + 1, observationId: 'defense:two:0' }); other.save();
  require('../tools/merge_book').mergeFiles(otherFile, h.book.file);
  const merged = bookLib.open(h.book.file, { now: () => AT });
  assert.equal(Object.keys(merged.data().receipts).length, 2);
  assert.equal(merged.record({ ...obs, observationId: 'defense:two:0' }), null);
  assert.equal(merged.lookup(3, 'rival', 0)[0].n, 2);
});
