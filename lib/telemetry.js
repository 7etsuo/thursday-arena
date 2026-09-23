'use strict';
/**
 * The append-only record of match events. The opponent book separately stores learned boards.
 *
 * One append-only JSONL stream per day at data/log/YYYY-MM-DD.jsonl, plus data/log/LATEST holding
 * the current file's path. The audit (audit/code_lib_infra.md) found the old bot spraying the same
 * facts into five stores that disagreed with each other; everything now goes through t.event().
 *
 * Every line carries {ts, seq, session, code, type, ...payload}. `code` is the code version hash,
 * so a run can be attributed to the exact lib/ + driver/ it was produced by.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DEFAULT_DIR = path.join(ROOT, 'data', 'log');

const TYPES = new Set([
  'history', 'session_start', 'match_start', 'match_identified', 'shop', 'act', 'battle', 'book', 'result', 'error', 'session_end',
]);

function jsFiles(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith('.js')).sort().map((n) => path.join(dir, n));
}

/** sha1 over the contents of lib/*.js + driver/*.js, first 12 hex chars. */
function codeVersion(files) {
  const list = files && files.length ? files.slice().sort() : [
    ...jsFiles(path.join(ROOT, 'lib')),
    ...jsFiles(path.join(ROOT, 'driver')),
  ];
  const h = crypto.createHash('sha1');
  for (const f of list) {
    h.update(path.basename(f));
    try {
      h.update(fs.readFileSync(f));
    } catch {
      h.update('missing');
    }
  }
  return h.digest('hex').slice(0, 12);
}

function dayOf(d) {
  return d.toISOString().slice(0, 10);
}

function open(opts = {}) {
  const dir = opts.dir || DEFAULT_DIR;
  const code = opts.codeVersion || null;
  const now = opts.now || (() => new Date());
  const session = opts.sessionId || crypto.randomUUID();

  let seq = 0;
  let day = null;
  let file = null;
  let closed = false;
  let dropped = 0;

  // The single write path. Nothing else in this module touches the filesystem.
  function write(rec) {
    try {
      const d = dayOf(new Date(rec.ts));
      if (d !== day) {
        fs.mkdirSync(dir, { recursive: true });
        day = d;
        file = path.join(dir, `${d}.jsonl`);
        fs.writeFileSync(path.join(dir, 'LATEST'), file + '\n');
      }
      fs.appendFileSync(file, JSON.stringify(rec) + '\n');
    } catch (e) {
      // Telemetry must never take the loop down; count the loss and keep going.
      dropped += 1;
      if (dropped === 1) console.error(`telemetry write failed: ${e.message}`);
    }
    return rec;
  }

  function event(type, payload) {
    if (closed) return null;
    if (!TYPES.has(type)) throw new Error(`unknown telemetry type ${type}`);
    return write({
      ts: now().toISOString(),
      seq: seq++,
      session,
      code,
      type,
      ...(payload || {}),
    });
  }

  // `dropped` rides along on session_end: a read-only log dir used to produce one stderr line and
  // then an empty stream while the loop reported success (review R3-10).
  function close(payload) {
    if (closed) return null;
    const rec = event('session_end', { ...(payload || {}), dropped });
    closed = true;
    return rec;
  }

  return {
    dir,
    session,
    code,
    event,
    close,
    get file() {
      return file;
    },
    get count() {
      return seq;
    },
    get dropped() {
      return dropped;
    },
  };
}

module.exports = { open, codeVersion, TYPES, DEFAULT_DIR };
