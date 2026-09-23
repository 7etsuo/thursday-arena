#!/usr/bin/env node
'use strict';
/**
 * One browser session: open Chrome, confirm the Clerk sign-in, dry-run one shop, then play for real.
 *
 *   node driver/play_session.js --games 5        # 5 rated matches, then exit
 *   node driver/play_session.js                  # play until stopped (Ctrl-C is clean)
 *
 * Chrome 136+ ignores --remote-debugging-port on the default profile and Chrome 153 gives no port
 * at all, so lib/cdp.js launches its own Chrome over a pipe (lib/cdp.js launch()) on the dedicated
 * profile at ARENA_PROFILE (default ~/.config/google-chrome-arena; the real profile is refused).
 * Everything runs in ONE process against ONE window.
 */
const fs = require('fs');
const path = require('path');
const cdp = require('../lib/cdp');
const arena = require('../lib/arena');
const { run, acquireLock, installSignalHandlers } = require('./play_loop');

// stdout is block-buffered through a pipe, so a killed session loses everything it printed.
// Every event also goes straight to disk.
const TRACE = path.join(__dirname, '..', 'data', 'log', 'session.jsonl');
const out = (o) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n';
  process.stdout.write(line);
  try { fs.mkdirSync(path.dirname(TRACE), { recursive: true }); fs.appendFileSync(TRACE, line); } catch {}
};

function parseArgs(argv) {
  const o = { games: Infinity, dry: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0) throw new Error(`--games needs a non-negative integer (0 = forever)`);
      o.games = n === 0 ? Infinity : n;
    } else if (a === '--no-dry') o.dry = false;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  // Same pid lock as play_loop: two rated loops on one account collide on every action (review 3).
  const release = acquireLock();
  installSignalHandlers(release, 'play_session');
  let code = 0;
  try {
    out({ event: 'launching', profile: process.env.ARENA_PROFILE || cdp.PROFILE_DIR });
    await cdp.connect();
    out({ event: 'browser_open' });
    const ok = await cdp.waitForAuth({
      timeoutMs: Number(process.env.ARENA_LOGIN_TIMEOUT_MS || 600000),
      onWait: (status) => out({ event: 'login_needed', status, hint: 'sign in to thursdayarena.com in the open window' }),
    });
    if (!ok) {
      out({ event: 'login_timeout' });
      code = 2;
    } else {
      const me = await arena.getMe();
      out({ event: 'signed_in', handle: me && me.xHandle, rating: me && me.season && me.season.rating });
      if (opts.dry) {
        const dry = await run({ dry: true, once: true, touch: release.touch });
        out({ event: 'dry_run', ...dry });
        arena.setDryRun(false);
      }
      const live = await run({ games: opts.games, start: true, touch: release.touch });
      out({ event: 'live_run', ...live });
      if (['no_progress', 'unknown_phase', 'max_steps'].includes(live.exitReason)) code = 3;
    }
  } catch (e) {
    out({ event: 'session_error', message: e.message });
    code = 1;
  } finally {
    try { release(); } catch {}
    // A launched Chrome keeps the event loop alive: without this the process never exits and the
    // exit code is never delivered (review 6).
    try { await cdp.disconnect(); } catch {}
  }
  process.exit(code);
}

main();
