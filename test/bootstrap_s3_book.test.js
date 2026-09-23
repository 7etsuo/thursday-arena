'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrap } = require('../tools/bootstrap_s3_book');

function files(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-bootstrap-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { bookFile: path.join(dir, 'book.json'), lockFile: path.join(dir, 'loop.lock') };
}

test('installation seeds missing S3 without changing old observations and is idempotent', (t) => {
  const opts = files(t);
  const entry = { board: [{ name: 'Cooper', kitId: 'echo', atk: 2, hp: 5, honey: false }],
    n: 1000, firstTs: 1, lastTs: 1000, ts: [999, 1000] };
  const original = JSON.stringify({ format: 1, entries: { '2|opponent|0': [entry] } });
  fs.writeFileSync(opts.bookFile, original);
  const result = bootstrap(opts);
  assert.equal(result.seeded, true);
  assert.ok(result.added > 0);
  assert.equal(fs.readFileSync(result.backup, 'utf8'), original);
  const after = fs.readFileSync(opts.bookFile, 'utf8');
  assert.deepEqual(JSON.parse(after).entries['2|opponent|0'], [entry]);
  assert.equal(bootstrap(opts).seeded, false);
  assert.equal(fs.readFileSync(opts.bookFile, 'utf8'), after);
});

test('bootstrap refuses malformed memory and a loop lock without changing data', (t) => {
  const opts = files(t);
  fs.writeFileSync(opts.bookFile, '{broken');
  assert.throws(() => bootstrap(opts), /Invalid opponent book/);
  assert.equal(fs.readFileSync(opts.bookFile, 'utf8'), '{broken');
  fs.writeFileSync(opts.lockFile, '{}');
  assert.throws(() => bootstrap(opts), /Stop the arena loop/);
  assert.equal(fs.readFileSync(opts.bookFile, 'utf8'), '{broken');
});
