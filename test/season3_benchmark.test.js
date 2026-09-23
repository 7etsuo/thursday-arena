'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bookLib = require('../lib/book');
const mock = require('./mock_arena');
const seed = require('../tools/seed_s3_book');
const bench = require('../tools/eval_season3');

test('public S3 book seed retains both sides, items, crew and battle attack', () => {
  const match = seed.readMatches(seed.DEFAULT_INPUT).find((m) =>
    m.id === 'dc43fd77-3108-40af-a5dd-1c41d81a2055');
  assert.ok(match);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-s3-seed-test-'));
  try {
    const out = path.join(dir, 'book.json');
    const result = seed.seed({ matches: [match], output: out });
    assert.equal(result.observations, match.rounds.length * 2);
    const book = bookLib.open(out);
    for (const [side, handle] of [['you', match.player.x_handle],
      ['them', match.opponent.x_handle]]) {
      for (const round of match.rounds) {
        const entry = book.lookup(3, handle, round.round)[0];
        assert.ok(entry, `${side} round ${round.round}`);
        assert.deepEqual(entry.board, bookLib.normBoard(seed.replayBoard(round[side])));
      }
    }
    const raw = match.rounds.flatMap((r) => [...r.you, ...r.them]);
    assert.ok(raw.some((u) => u.item));
    assert.ok(raw.some((u) => u.tempAtk));
    assert.throws(() => seed.seed({ matches: [match], output: out }), /refusing to overwrite/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('S3 benchmark folds exclude each held-out match and handle from seed observations', () => {
  const ghosts = mock.loadGhosts({ s3: true });
  const folds = bench.foldsOf(ghosts, 5);
  const matches = seed.readMatches(seed.DEFAULT_INPUT);
  assert.equal(folds.reduce((n, f) => n + f.ghosts.length, 0), ghosts.length);
  assert.deepEqual(folds.map((f) => f.ghosts.length).sort(), [7, 8, 8, 8, 8]);
  for (const fold of folds) {
    const heldIds = new Set(fold.ghosts.map((g) => g.id));
    const train = bench.trainingObservations(matches, fold);
    assert.ok(train.length > 0);
    for (const row of train) {
      assert.equal(heldIds.has(row.matchId), false);
      assert.equal(fold.handles.has(row.handle), false);
    }
  }
});
