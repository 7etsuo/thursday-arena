'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { parseArgs, clusteredInterval, extractBefore } = require('../tools/eval_versions');

test('TGZ comparisons retain the old runtime item catalog and accept archives predating items', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-backup-test-'));
  const outputs = [];
  try {
    const source = path.join(dir, 'source');
    for (const name of ['lib', 'driver', 'data', 'memory']) fs.mkdirSync(path.join(source, name), { recursive: true });
    for (const name of ['data/catalog.json', 'memory/book.json']) fs.writeFileSync(path.join(source, name), '{}');
    const archive = path.join(dir, 'before.tgz');
    for (const hasItems of [false, true]) {
      if (hasItems) fs.writeFileSync(path.join(source, 'data/items.json'), '[{"id":"original-item"}]');
      execFileSync('tar', ['-czf', archive, '-C', source, '.']);
      const extracted = extractBefore(archive); outputs.push(extracted);
      assert.equal(fs.existsSync(path.join(extracted, 'data/items.json')), hasItems);
      if (hasItems) assert.equal(fs.readFileSync(path.join(extracted, 'data/items.json'), 'utf8'),
        '[{"id":"original-item"}]');
    }
  } finally {
    for (const out of outputs) fs.rmSync(out, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
const { summarize } = require('../tools/summarize_eval_versions');

test('version benchmark defaults reproduce the historical 20-seed, 1,000-match sample per season', () => {
  const o = parseArgs([]);
  assert.equal(o.games, 50);
  assert.equal(o.seeds.length, 20);
  assert.deepEqual(o.seeds.slice(0, 3), [101, 103, 107]);
  assert.deepEqual(o.seeds.slice(-3), [191, 193, 197]);
  assert.equal(o.season, 'both');
  assert.equal(o.budget, Infinity);
  assert.equal(o.bookMode, 'cold');
});

test('clustered interval is centered on the seed means', () => {
  const [lo, hi] = clusteredInterval([-0.1, 0, 0.1]);
  assert.ok(Math.abs(lo + hi) < 1e-12);
  assert.ok(lo < 0 && hi > 0);
  assert.deepEqual(clusteredInterval([0, 0, 0]), [0, 0]);
});

test('the paired runner has zero delta when both arms load the same version', () => {
  const root = path.resolve(__dirname, '..');
  const out = execFileSync(process.execPath,
    ['tools/eval_versions.js', '--before-dir', root, '--games', '2',
      '--seeds', '233', '--season', '2'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /before W\d+ L\d+ D\d+.*current W\d+ L\d+ D\d+/);
  assert.match(out, /paired score delta current-before=0\.0000/);
  assert.match(out, /better=0 worse=0 same=2/);
  assert.match(out, /illegal before=0 current=0/);
});

test('late-ID pairing preserves one book write per battle with the current driver', () => {
  const root = path.resolve(__dirname, '..');
  const out = execFileSync(process.execPath,
    ['tools/eval_versions.js', '--before-dir', root, '--games', '2',
      '--seeds', '239', '--season', '2', '--late-id'],
    { cwd: root, encoding: 'utf8' });
  assert.match(out, /book records before=5\/5 rounds current=5\/5 rounds/);
  assert.match(out, /battle events before=5 current=5/);
});

test('parallel result summary validates every score and clusters by seed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-version-summary-'));
  try {
    const head = 'season,seed,match,handle,before,current,before_score,current_score,delta\n';
    const rows = (seed, first) => [
      `1,${seed},1,"opponent, one",${first},win,${first === 'loss' ? 0 : 1},1,${first === 'loss' ? 1 : 0}`,
      `1,${seed},2,"opponent",win,win,1,1,0`,
      `2,${seed},1,"opponent",win,win,1,1,0`,
      `2,${seed},2,"opponent",win,win,1,1,0`,
    ];
    fs.writeFileSync(path.join(dir, 'seed-1.csv'), head + rows(1, 'loss').join('\n') + '\n');
    fs.writeFileSync(path.join(dir, 'seed-2.csv'), head + rows(2, 'win').join('\n') + '\n');
    const out = summarize(dir, [1, 2], 2);
    assert.equal(out[0].n, 4);
    assert.deepEqual(out[0].before, { win: 3, loss: 1, draw: 0 });
    assert.deepEqual(out[0].current, { win: 4, loss: 0, draw: 0 });
    assert.equal(out[0].pairedDelta, 0.25);
    assert.deepEqual(out[0].seedMeans, [0.5, 0]);
    assert.equal(out[1].pairedDelta, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
