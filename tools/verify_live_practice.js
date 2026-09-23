#!/usr/bin/env node
'use strict';
/** Run the real driver against the official anonymous practice reducer, with isolated local files.
 * Usage: node tools/verify_live_practice.js [--seed 12345] [--games 1] [--budget 1500]
 * This makes practice requests only. It needs no account and cannot change rating.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { run } = require('../driver/play_loop');
const bookLib = require('../lib/book');
const shop = require('../lib/shop_model');
const sim = require('../lib/sim');
const catalog = require('../lib/catalog');

function verifyBattle(before, after) {
  assert.ok(Array.isArray(after.ghostBoard), 'practice battle must expose the exact enemy board');
  const actual = sim.simulate(before.board.map((u) => catalog.toSimUnit(u, after.season)),
    after.ghostBoard.map((u) => catalog.toSimUnit(u, after.season)), {
      season: after.season, round: after.phase.round, seats: shop.seatsFrom(after),
      ourCaptain: after.captain, theirCaptain: after.rivalCaptain, ourRelics: after.relics, theirRelics: after.rivalRelics,
    });
  assert.equal(actual.winner === 'us' ? 'you' : actual.winner, after.phase.winner, 'practice battle winner');
  assert.deepEqual(actual.frames, after.phase.frames, 'practice battle frames');
}

async function verify(opts = {}) {
  const seed = opts.seed ?? 12345;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-live-practice-'));
  const session = crypto.randomUUID();
  const trace = path.join(dir, 'requests.jsonl');
  const bookFile = path.join(dir, 'book.json');
  if (fs.existsSync(bookLib.DEFAULT_FILE)) fs.copyFileSync(bookLib.DEFAULT_FILE, bookFile);
  else bookLib.open(bookFile, { empty: true }).save();
  let state = { phase: { kind: 'result' }, gold: 0, board: [],
    shop: { pets: [null, null, null], food: null }, wins: { you: 0, them: 0 },
    results: [], lastSeen: null, seed, nextUid: 1 };
  let version = 0;
  let nextRequestAt = 0;
  let checks = 0;
  let battleChecks = 0;
  let rateLimits = 0;
  const results = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const arena = {
    practice: true,
    observe: async () => ({ state, version }),
    act: async (action) => {
      const before = state;
      let reply;
      for (let attempt = 0; attempt < 9; attempt++) {
        await sleep(Math.max(0, nextRequestAt - Date.now()));
        const res = await fetch('https://thursdayarena.com/api/arena/practice', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-practice-session': session },
          body: JSON.stringify({ state: before, action }), signal: AbortSignal.timeout(20000),
        });
        const body = await res.text();
        if (res.status === 429) {
          rateLimits++;
          const header = res.headers.get('retry-after');
          const seconds = header == null ? NaN : Number(header);
          const wait = Number.isFinite(seconds) ? seconds * 1000
            : header && Number.isFinite(Date.parse(header)) ? Date.parse(header) - Date.now()
              : Math.min(60000, 1000 * 2 ** attempt);
          nextRequestAt = Date.now() + Math.max(1000, wait);
          continue;
        }
        assert.equal(res.status, 200, `practice ${action.type}: HTTP ${res.status}: ${body.slice(0, 400)}`);
        reply = JSON.parse(body);
        break;
      }
      assert.ok(reply?.state?.phase, 'practice response must contain a state');
      state = reply.state; // Preserve the entire raw server state for the next request.
      version++;
      nextRequestAt = Date.now() + 1100;
      fs.appendFileSync(trace, JSON.stringify({ before, action, after: state }) + '\n');
      if (action.type === 'endShop') { verifyBattle(before, state); battleChecks++; }
      if (before.phase.kind === 'shop' && action.type !== 'endShop' && action.type !== 'reroll') {
        const predicted = shop.apply(shop.normalize(before), action);
        const actual = shop.normalize(state);
        assert.equal(actual.gold, predicted.gold, `${action.type}: gold`);
        if (action.relic !== 'earlyAccess') assert.equal(actual.food, predicted.food, `${action.type}: food`);
        assert.equal(actual.captain, predicted.captain, `${action.type}: captain`);
        if (action.relic !== 'earlyAccess') assert.deepEqual(actual.itemOffer, predicted.itemOffer, `${action.type}: item offer`);
        assert.ok(shop.simUnitsOutcomes(predicted).some((w) =>
          isDeepStrictEqual(w.units, shop.simUnits(actual))), `${action.type}: board differs from shop model`);
        checks++;
      }
      if (state.phase.kind === 'result') results.push({ wins: state.wins, rounds: state.results });
      if (['pickCaptain', 'endShop', 'battleDone'].includes(action.type)) {
        process.stdout.write(JSON.stringify({ event: 'practice_action', action, phase: state.phase.kind,
          round: state.phase.round, wins: state.wins, captain: state.captain }) + '\n');
      }
      return { state, version };
    },
  };
  process.stdout.write(JSON.stringify({ event: 'practice_start', seed, dir }) + '\n');
  const summary = await run({ arena, bookFile, logDir: path.join(dir, 'log'),
    lastOpponentFile: path.join(dir, 'last.json'), prevHandle: null, seed,
    stopAfterMatches: opts.games ?? 1, timeBudgetMs: opts.budget ?? 1500,
    aiBackoffMs: 0, sleep: async (ms) => { if (ms) await sleep(ms); } });
  assert.equal(summary.exitReason, 'matches_done');
  assert.equal(summary.games, 0, 'practice must never count as rated games');
  assert.equal(summary.aiMatches, opts.games ?? 1);
  const logFile = fs.readFileSync(path.join(dir, 'log', 'LATEST'), 'utf8').trim();
  const events = fs.readFileSync(logFile, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.filter((e) => e.type === 'error'), [], 'driver reported an error');
  assert.equal(events.filter((e) => e.type === 'book').length, 0, 'practice AI must not be learned as a human');
  const report = { seed, dir, summary, checks, battleChecks, rateLimits, results };
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ event: 'practice_verified', ...report }) + '\n');
  return report;
}

if (require.main === module) {
  const opts = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const key = args[i].slice(2);
    const n = Number(args[++i]);
    if (!['seed', 'games', 'budget'].includes(key) || !Number.isInteger(n) || n < (key === 'seed' ? 0 : 1)) {
      throw new Error('usage: verify_live_practice.js [--seed N] [--games N] [--budget MS]');
    }
    opts[key] = n;
  }
  verify(opts).catch((e) => { console.error(e); process.exitCode = 1; });
}

module.exports = { verify, verifyBattle };
