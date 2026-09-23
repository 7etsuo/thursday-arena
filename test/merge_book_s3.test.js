'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bookLib = require('../lib/book');
const { mergeFiles } = require('../tools/merge_book');

test('merging a Season 3 seed keeps distinct equipment and captain observations', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3-merge-'));
  const seedFile = path.join(dir, 'seed.json');
  const liveFile = path.join(dir, 'live.json');
  const seed = bookLib.open(seedFile, { empty: true, seeded: true });
  const board = (item) => [{ name: 'Cooper', kitId: 'echo', atk: 2, hp: 5,
    honey: false, crew: 'marketing', item }];
  seed.record({ season: 3, handle: 'alice', round: 1, board: board('foamPad'),
    captain: 'drill', ts: '2026-09-20T00:00:00Z' });
  seed.record({ season: 3, handle: 'alice', round: 1, board: board('laserPointer'),
    captain: 'medic', ts: '2026-09-20T00:01:00Z' });
  seed.save();
  assert.equal(mergeFiles(seedFile, liveFile).added, 2);
  assert.equal(mergeFiles(seedFile, liveFile).added, 0);
  const live = bookLib.open(liveFile);
  const rows = live.lookup(3, 'alice', 1);
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map((r) => r.board[0].item)),
    new Set(['foamPad', 'laserPointer']));
  assert.deepEqual(new Set(rows.map((r) => r.captain)), new Set(['drill', 'medic']));
  assert.ok(Object.values(live.data().entries).flat().every((e) => e.seeded));
});

test('merging preserves truncated counts and refuses ambiguous history without changing files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'book-merge-history-'));
  const a = path.join(dir, 'a.json'), b = path.join(dir, 'b.json');
  const board = [{ name: 'Cooper', kitId: 'echo', atk: 2, hp: 5, honey: false }];
  const old = { board, n: 100, firstTs: 1, lastTs: 100, ts: Array.from({ length: 64 }, (_, i) => i + 37) };
  fs.writeFileSync(a, JSON.stringify({ format: 1, entries: { '3|alice|0': [old] } }));
  mergeFiles(a, b);
  mergeFiles(a, b);
  assert.equal(bookLib.open(b).stats().observations, 100);
  const before = fs.readFileSync(b, 'utf8');
  fs.writeFileSync(a, JSON.stringify({ format: 1, entries: {
    '3|alice|0': [{ ...old, n: 1, firstTs: 101, lastTs: 101, ts: [101] }],
  } }));
  assert.throws(() => mergeFiles(a, b), /cannot exactly merge truncated/);
  assert.equal(fs.readFileSync(b, 'utf8'), before);
  fs.rmSync(dir, { recursive: true, force: true });
});
