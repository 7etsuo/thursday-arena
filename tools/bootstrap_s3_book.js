#!/usr/bin/env node
'use strict';
/** Installation helper: seed Season 3 only when the preserved book has no S3 observations.
 * Run while the bot is stopped. Existing S3 memory is a byte-for-byte no-op; S1/S2 counts
 * are preserved when the separate public-replay seed is merged. Never calls book:build.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const bookLib = require('../lib/book');
const { seed, DEFAULT_INPUT } = require('./seed_s3_book');
const { mergeFiles } = require('./merge_book');

function bootstrap({ bookFile = bookLib.DEFAULT_FILE, input = DEFAULT_INPUT,
  lockFile = path.join(path.dirname(bookFile), '../data/play_loop.lock') } = {}) {
  if (fs.existsSync(lockFile)) throw new Error(`Stop the arena loop before seeding memory (${lockFile})`);
  const book = bookLib.open(bookFile); // Validate existing data; never replace malformed memory.
  const existing = Object.entries(book.data().entries)
    .filter(([key]) => key.startsWith('3|')).reduce((n, [, rows]) =>
      n + rows.reduce((s, row) => s + row.n, 0), 0);
  if (existing) return { seeded: false, reason: 'Season 3 observations already present', observations: existing };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-s3-bootstrap-'));
  try {
    const seedFile = path.join(dir, 'seed.json');
    seed({ input, output: seedFile });
    let backup = null;
    if (fs.existsSync(bookFile)) {
      backup = `${bookFile}.before-s3-seed-${crypto.randomUUID()}`;
      fs.copyFileSync(bookFile, backup, fs.constants.COPYFILE_EXCL);
    }
    const merged = mergeFiles(seedFile, bookFile);
    return { seeded: true, backup, added: merged.added, observations: merged.observations };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--book')) {
      throw new Error('usage: bootstrap_s3_book.js [--book PATH]');
    }
    console.log(JSON.stringify(bootstrap(args.length ? { bookFile: path.resolve(args[1]) } : {})));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}

module.exports = { bootstrap };
