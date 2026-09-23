'use strict';
/*
 * Opponent board book: what board a handle fielded at (season, round), how often, and when.
 *
 * WHY a book at all: historical ghost boards were ~97% deterministic per (season, handle, round),
 * and 79% of matches were a rematch of the previous opponent. The 2026-09-20 matchmaking change
 * greatly reduced repeats; the old R0 blend lift (+0.059) needs re-evaluation. The historical
 * R1/R2 blend lift was +0.061 over pool-only (docs/STRATEGY.md §3.1, §2.3). Keyed per ROUND because
 * the enemy's next-round board differed from this round's 71% of the time in that audit.
 *
 * WHY inferGhost: the arena never tells us the enemy's honey — frames carry only name/atk/hp
 * (docs/ENGINE_BATTLE.md §1, zod frame unit).  Honey changes the outcome (winner accuracy 97.2% without it,
 * 100% with it, docs/ENGINE_BATTLE.md §4), so we recover it from the frames the server already sent us.
 */

const fs = require('fs');
const path = require('path');
const sim = require('./sim.js');
const opponentModel = require('./opponent_model');

const DEFAULT_FILE = path.join(__dirname, '..', 'memory', 'book.json');
const FORMAT = 1;
const MAX_BOARDS = 5;      // distinct boards kept per (season, handle, round); contract "Storage stays small"
const MAX_AGE_DAYS = 30;   // handles not seen for this long are pruned
const MAX_TS = 64;         // per-entry observation timestamps kept (newest first out of the oldest)
const DAY_MS = 86400000;

// ---------------------------------------------------------------- small helpers

function toMs(ts) {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  const n = Date.parse(ts);
  return Number.isNaN(n) ? null : n;
}

const normHandle = (h) => String(h == null ? '' : h).trim().toLowerCase();
const keyOf = (season, handle, round) => `${Number(season)}|${normHandle(handle)}|${Number(round)}`;
// handles may contain anything, so split on the FIRST and LAST separator only
function parseKey(k) {
  const a = k.indexOf('|');
  const b = k.lastIndexOf('|');
  return { season: Number(k.slice(0, a)), handle: k.slice(a + 1, b), round: Number(k.slice(b + 1)) };
}

/** A board unit as the simulator wants it (atk must already include tempAtk; see lib/sim.js API). */
function normUnit(u) {
  const unit = {
    name: String(u.name),
    kitId: u.kitId == null ? null : String(u.kitId),
    atk: Number(u.atk) || 0,
    hp: Number(u.hp) || 0,
    honey: !!u.honey,
  };
  if (u.crew != null) unit.crew = String(u.crew);
  if (u.item != null || u.itemId != null) unit.item = String(u.item ?? u.itemId);
  if (u.fusedWith) Object.assign(unit, catalog().fusionMeta(u));
  return unit;
}

const normBoard = (b) => (b || []).map(normUnit);

/** Identity of a board: seat order matters, so this is order-sensitive. */
const boardKey = (b, captain = null, relics = null) => b.map((u) =>
  `${u.name}/${u.kitId}/${u.atk}/${u.hp}/${u.honey ? 1 : 0}`
  + (u.crew == null && u.item == null ? '' : `/${u.crew || ''}/${u.item || ''}`)
).join(';') + (captain ? `|captain:${captain}` : '') + (relics?.length ? `|relics:${[...relics].sort().join(',')}` : '');

/** Observations of an entry that happened strictly before `beforeMs`.
 *  Entries keep at most MAX_TS timestamps (the newest); dropped ones are all older than ts[0], so they only
 *  count when the cutoff is past the oldest kept stamp.  Under-counting is safe: it can never leak the future. */
function weightBefore(e, beforeMs) {
  if (beforeMs == null) return e.n;
  const kept = e.ts.reduce((s, t) => s + (t < beforeMs ? 1 : 0), 0);
  const dropped = e.n - e.ts.length;
  return kept + (dropped > 0 && e.ts.length && beforeMs > e.ts[0] ? dropped : 0);
}

/** Newest observation strictly before `beforeMs` (e.lastTs when there is no cutoff). */
function lastBefore(e, beforeMs) {
  if (beforeMs == null) return e.lastTs;
  let best = e.firstTs;
  for (const t of e.ts) if (t < beforeMs && t > best) best = t;
  return best;
}

// ---------------------------------------------------------------- store

function emptyData() {
  return { format: FORMAT, entries: {} };
}

function loadData(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return emptyData();
    throw new Error(`Cannot read opponent book ${file}: ${e.message}`, { cause: e });
  }
  let d;
  try {
    d = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid opponent book ${file}: ${e.message}`, { cause: e });
  }
  if (!d || d.format !== FORMAT || !d.entries || typeof d.entries !== 'object' || Array.isArray(d.entries)) {
    throw new Error(`Invalid opponent book ${file}: unsupported format or entries`);
  }
  if (d.receipts != null && (typeof d.receipts !== 'object' || Array.isArray(d.receipts) ||
      Object.values(d.receipts).some((ts) => !Number.isFinite(ts)))) throw new Error(`Invalid opponent book ${file}: receipts`);
  if (d.outgoing != null && !opponentModel.validate(d.outgoing)) throw new Error(`Invalid opponent book ${file}: outgoing observations`);
  // `k` is derived from `board`, so it is not persisted
  for (const rows of Object.values(d.entries)) {
    if (!Array.isArray(rows) || rows.some((e) => !e || !Array.isArray(e.board) || !Array.isArray(e.ts)
      || !Number.isInteger(e.n) || e.n < e.ts.length || e.n < 1
      || !Number.isFinite(e.firstTs) || !Number.isFinite(e.lastTs))) {
      throw new Error(`Invalid opponent book ${file}: malformed observation`);
    }
    for (const e of rows) e.k = boardKey(e.board, e.captain, e.relics);
  }
  return d;
}

/**
 * open(file?, opts?) -> book instance.
 * opts: {maxBoards, maxAgeDays, maxTs, now, empty}.  `now` is a clock function (ms) so tests and the
 * corpus builder are deterministic; `empty` starts from a blank book but still saves to `file`.
 */
function open(file, opts = {}) {
  const f = file || DEFAULT_FILE;
  const maxBoards = opts.maxBoards == null ? MAX_BOARDS : opts.maxBoards;
  const maxAgeMs = (opts.maxAgeDays == null ? MAX_AGE_DAYS : opts.maxAgeDays) * DAY_MS;
  const maxTs = opts.maxTs == null ? MAX_TS : opts.maxTs;
  const now = opts.now || Date.now;
  // `empty` rebuilds the store from nothing (tools/build_book.js, tests), so it must not merge the
  // file back in on save either, or the rebuild would not be idempotent.
  const merge = opts.merge == null ? !opts.empty : !!opts.merge;
  const seeded = !!opts.seeded;
  let data = opts.empty ? emptyData() : loadData(f);
  // Everything this instance recorded, so save() can replay it onto whatever is on disk NOW: two
  // instances used to overwrite each other's matches outright (review R2-08).
  let journal = [];

  function clear() {
    data = emptyData();
    journal = [];
  }

  function recordInto(d, obs) {
    const { season, handle, round, board, seats = null, matchId = null, captain = null, relics = null } = obs || {};
    const ts = toMs(obs && obs.ts) == null ? now() : toMs(obs.ts);
    if (obs.observationId && d.receipts?.[obs.observationId] != null) return null;
    const units = normBoard(board);
    if (!units.length) return null;
    if (obs.observationId) (d.receipts || (d.receipts = {}))[obs.observationId] = ts;
    const k = keyOf(season, handle, round);
    const list = d.entries[k] || (d.entries[k] = []);
    const bk = boardKey(units, captain, relics);
    let e = list.find((x) => x.k === bk);
    if (!e) {
      e = { k: bk, board: units, seats: seats || null, n: 0, firstTs: ts, lastTs: ts, ts: [], matchId };
      if (captain) e.captain = captain;
      if (relics) e.relics = [...relics];
      if (seeded) e.seeded = true;
      list.push(e);
    }
    e.n += 1;
    e.ts.push(ts);
    e.ts.sort((a, b) => a - b);
    if (e.ts.length > maxTs) e.ts = e.ts.slice(e.ts.length - maxTs);
    if (ts >= e.lastTs) { e.lastTs = ts; e.seats = seats || null; e.matchId = matchId; }
    if (ts < e.firstTs) e.firstTs = ts;
    // keep the `maxBoards` most RECENT distinct boards (contract): the enemy's roster drifts, old ones rot
    if (list.length > maxBoards) {
      list.sort((a, b) => b.lastTs - a.lastTs);
      d.entries[k] = list.slice(0, maxBoards);
    }
    if (Number(season) >= 3 && obs.role === 'attack' && matchId) {
      opponentModel.append(d, { season: Number(season), round: Number(round), handle: normHandle(handle),
        board: units, captain, ...(relics ? { relics: [...relics] } : {}), matchId: String(matchId), ts,
        ...(opponentModel.validForecast(obs.forecast) ? { forecast: obs.forecast } : {}),
        ...(['you', 'them', 'draw'].includes(obs.outcome) ? { outcome: obs.outcome } : {}) });
    }
    return e;
  }

  function record(obs) {
    if (!obs || !Number.isInteger(Number(obs.season)) || !Number.isInteger(Number(obs.round)) || !obs.handle) {
      throw new Error('book.record needs season, round and handle');   // else the key is "NaN|…|NaN"
    }
    const e = recordInto(data, obs);
    if (e) journal.push({ ...obs, ts: toMs(obs && obs.ts) == null ? e.lastTs : obs.ts });
    return e;
  }

  function lookup(season, handle, round, o = {}) {
    const beforeMs = toMs(o.beforeTs);
    const list = data.entries[keyOf(season, handle, round)] || [];
    const out = [];
    for (const e of list) {
      const n = weightBefore(e, beforeMs);
      if (n <= 0) continue;
      out.push({ board: e.board, seats: e.seats, n, lastTs: lastBefore(e, beforeMs),
        ...(e.captain ? { captain: e.captain } : {}), ...(e.relics ? { relics: e.relics } : {}) });
    }
    out.sort((a, b) => b.n - a.n || b.lastTs - a.lastTs);
    return out;
  }

  /** Same-round boards across handles, weight = times faced.  `excludeHandle` gives the leave-one-handle-out
   *  pool the audit measured (audit/strategy.md §3.1), so the pool carries no information about that handle. */
  function pool(season, round, o = {}) {
    const limit = o.limit == null ? 40 : o.limit;
    const beforeMs = toMs(o.beforeTs);
    const skip = o.excludeHandle == null ? null : normHandle(o.excludeHandle);
    if (o.policy === 'recent') {
      const recent = opponentModel.population(data, season, round,
        { beforeTs: beforeMs, excludeHandle: skip, limit, window: o.window }, boardKey);
      if (recent.length || opponentModel.recent(data, season, round, beforeMs, o.window).length) return recent;
      // Older books have no source-tagged queue sample. Warm up from recent sightings,
      // never from lifetime counts. This fallback disappears as outgoing games arrive.
      const seen = [];
      for (const [k, list] of Object.entries(data.entries)) {
        const p = parseKey(k);
        if (p.season !== Number(season) || p.round !== Number(round) || p.handle === skip) continue;
        for (const e of list) if (weightBefore(e, beforeMs) > 0) seen.push({ board: e.board,
          captain: e.captain, relics: e.relics, weight: 1, lastTs: lastBefore(e, beforeMs) });
      }
      return seen.sort((a, b) => b.lastTs - a.lastTs).slice(0, limit);
    }
    const agg = new Map();
    for (const k of Object.keys(data.entries)) {
      const p = parseKey(k);
      if (p.season !== Number(season) || p.round !== Number(round)) continue;
      if (skip != null && p.handle === skip) continue;
      for (const e of data.entries[k]) {
        const n = weightBefore(e, beforeMs);
        if (n <= 0) continue;
        // ordering must not see sightings after the cutoff either, or the `limit` cut leaks
        const seen = lastBefore(e, beforeMs);
        const cur = agg.get(e.k);
        if (cur) { cur.weight += n; cur.lastTs = Math.max(cur.lastTs, seen); }
        else agg.set(e.k, { board: e.board, weight: n, lastTs: seen,
          ...(e.captain ? { captain: e.captain } : {}), ...(e.relics ? { relics: e.relics } : {}) });
      }
    }
    const out = [...agg.values()].sort((a, b) => b.weight - a.weight || b.lastTs - a.lastTs).slice(0, limit);
    return out.map((x) => ({ board: x.board, weight: x.weight,
      ...(x.captain ? { captain: x.captain } : {}), ...(x.relics ? { relics: x.relics } : {}) }));
  }

  /**
   * Age out handles not seen for maxAgeDays.  Entries written by tools/build_book.js carry
   * `seeded` and are exempt: the whole corpus is dated within one day, so a wall-clock prune 31 days
   * later deleted all 9,621 observations in a single save() with no error and no log line
   * (review R2-06).  Returns the number of entries dropped.
   */
  function prune(atMs) {
    const cut = (atMs == null ? now() : atMs) - maxAgeMs;
    let dropped = 0;
    for (const k of Object.keys(data.entries)) {
      const list = data.entries[k].filter((e) => e.seeded || e.lastTs >= cut);
      if (!list.length) { delete data.entries[k]; dropped += 1; continue; }
      if (list.length !== data.entries[k].length) dropped += data.entries[k].length - list.length;
      data.entries[k] = list;
    }
    return dropped;
  }

  /**
   * Atomic: write a sibling tmp file, fsync-free rename (same filesystem) over the target.
   * Read-modify-write, not blind overwrite: whatever is on disk now is reloaded and this instance's
   * own records are replayed onto it. Sequential saves from separately opened instances preserve
   * both journals; simultaneous writers must still be excluded by the caller. -> {file, pruned}
   */
  function save() {
    // Always reload: a save with an empty journal used to write this instance's stale snapshot over
    // whatever another writer (book:build, a second loop) had put on disk since (review 2).
    if (merge) {
      const disk = loadData(f);
      for (const obs of journal) recordInto(disk, obs);
      data = disk;
    }
    const pruned = prune();
    // Public history only imports its last 30 days; older receipts cannot be replayed.
    if (data.receipts) for (const [id, ts] of Object.entries(data.receipts)) {
      if (ts < now() - 31 * DAY_MS) delete data.receipts[id];
    }
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = `${f}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(data, (key, v) => (key === 'k' ? undefined : v)));
      fs.renameSync(tmp, f);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch {}
      throw e;
    }
    // Keep the observations available for a retry if writing or replacing the file fails.
    journal = [];
    return { file: f, pruned };
  }

  function stats() {
    const keys = Object.keys(data.entries);
    let boards = 0;
    let obs = 0;
    for (const k of keys) for (const e of data.entries[k]) { boards++; obs += e.n; }
    return { keys: keys.length, boards, observations: obs };
  }

  const confidence = (season, round, handle, prior, beforeTs) =>
    opponentModel.confidence(data, season, round, normHandle(handle), prior, toMs(beforeTs));
  return { file: f, data: () => data, record, lookup, pool, confidence, prune, save, clear, stats };
}

// ---------------------------------------------------------------- ghost inference

let _catalog = null;
// lazy so requiring lib/book.js has no side effects and no hard load order against lib/catalog.js
function catalog() {
  if (!_catalog) _catalog = require('./catalog.js');
  return _catalog;
}

function botFor(name) {
  return catalog().byName(name);
}

function kitFor(name) {
  const b = botFor(name);
  return b && b.kitId != null ? b.kitId : null;
}

const frameUnit = (u, season = 0) => {
  const b = botFor(u.name);
  const unit = { name: String(u.name), kitId: b && b.kitId != null ? b.kitId : null,
    atk: Number(u.atk), hp: Number(u.hp), honey: false };
  if (season >= 3 && b && b.crew) unit.crew = b.crew;
  if (season >= 4 && (u.fusedWith || b?.fusedWith)) {
    Object.assign(unit, catalog().fusionMeta(u.fusedWith ? u : b));
  }
  return unit;
};

/** Exact, item-aware starting board from a completed public Season 3 replay. */
function publicReplayBoard(round, side) {
  if (!round || !['you', 'them'].includes(side) || !Array.isArray(round[side])) return [];
  const out = [];
  for (const raw of round[side]) {
    const bot = catalog().lookup(raw);
    if (!bot || !Number.isFinite(Number(raw.atk)) || !Number.isFinite(Number(raw.hp))) return [];
    out.push(catalog().toSimUnit(raw, 3));
  }
  return out;
}

const sameFrame = (a, b) =>
  a.caption === b.caption &&
  a.you.length === b.you.length && a.them.length === b.them.length &&
  a.you.every((u, i) => u.name === b.you[i].name && u.atk === b.you[i].atk && u.hp === b.you[i].hp) &&
  a.them.every((u, i) => u.name === b.them[i].name && u.atk === b.them[i].atk && u.hp === b.them[i].hp);

const sameFrames = (A, B) => A.length === B.length && A.every((f, i) => {
  if (i === 0 && f.caption === 'The teams square up' && B[i].caption === 'The fight starts') {
    return sameFrame({ ...f, caption: B[i].caption }, B[i]);
  }
  return sameFrame(f, B[i]);
});

/**
 * Honey visible in the captions: a starting unit whose knock-out is followed by "Drone joins <its side>"
 * before the next knock-out or trade was honeyed (docs/ENGINE_BATTLE.md §2, faint -> honey Drone).
 * Units are tracked positionally through the frames so duplicate names stay distinguishable.
 * -> {you: [bool], them: [bool]} indexed by the frame-0 board.
 */
function captionHoney(frames) {
  const f0 = frames[0];
  const hy = { you: f0.you.map(() => false), them: f0.them.map(() => false) };
  const cur = {
    you: f0.you.map((u, i) => ({ name: u.name, i, hp: u.hp })),
    them: f0.them.map((u, i) => ({ name: u.name, i, hp: u.hp })),
  };
  for (let k = 1; k < frames.length; k++) {
    const f = frames[k];
    const ko = / is knocked out$/.test(f.caption) ? f.caption.replace(/ is knocked out$/, '') : null;
    for (const side of ['you', 'them']) {
      let arr = cur[side];
      let gone = null;
      if (ko && f[side].length === arr.length - 1) {
        // dead units already have hp<=0 in the previous frame, which disambiguates duplicate names
        const j = arr.findIndex((p) => p.name === ko && p.hp <= 0);
        const jj = j >= 0 ? j : arr.findIndex((p) => p.name === ko);
        if (jj >= 0) { gone = arr[jj]; arr = arr.filter((_, q) => q !== jj); }
      }
      const names = f[side].map((u) => u.name);
      const next = [];
      const rest = [...arr];
      for (let q = 0; q < names.length; q++) {
        const j = rest.findIndex((p) => p.name === names[q]);
        if (j >= 0) next.push({ ...rest.splice(j, 1)[0], hp: f[side][q].hp });
        else next.push({ name: names[q], i: -1, hp: f[side][q].hp });   // a summon (Drone / Agent)
      }
      if (gone) {
        for (let q = k + 1; q < frames.length; q++) {
          const c = frames[q].caption;
          if (/ is knocked out$| trade: /.test(c)) break;
          if (c === `Drone joins ${side === 'you' ? 'your side' : 'the enemy side'}`) { if (gone.i >= 0) hy[side][gone.i] = true; break; }
        }
      }
      cur[side] = next;
    }
  }
  return hy;
}

const popcount = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };

/** Masks to try, cheapest hypothesis first: the caption reading, then by number of honeys. */
function masksToTry(n, guessMask) {
  const all = [];
  for (let m = 0; m < (1 << n); m++) if (m !== guessMask) all.push(m);
  all.sort((a, b) => popcount(a) - popcount(b) || a - b);
  return [guessMask, ...all];
}

/**
 * inferGhost({frames, ourUnits, round, seats}) -> [sim unit] for the ENEMY board at frame 0.
 * Kits come from the catalog by name (frames carry no kit).  Honey is searched: every assignment is replayed
 * and the one that reproduces `frames` exactly wins. The audit needed this search for 35 of 10,065 battles
 * where the caption reading alone was not enough (docs/ENGINE_BATTLE.md §0). With no exact replay we fall
 * back to caption reading. The server has used two equivalent opening captions; both are accepted
 * while every other frame must still match exactly.
 */
function inferGhost({ frames, ourUnits, round = 0, seats = null, season = 0,
  ourCaptain = null, theirCaptain = null, ourRelics = null, theirRelics = null } = {}) {
  if (!frames || !frames.length || !frames[0] || !frames[0].them) return [];
  const f0 = frames[0];
  // Alchemist is already included in frame zero. Store the pre-battle board so
  // replaying this observation with its relic cannot add the bonus a second time.
  const fromFrame = (u, relics) => {
    const unit = frameUnit(u, season);
    if (season >= 4 && unit.fusedWith && relics?.includes('alchemist')) {
      unit.atk -= 2; unit.hp -= 2;
    }
    return unit;
  };
  if (season >= 4) {
    const metadata = require('./season4').combatMetadata;
    ourRelics ??= metadata(frames, 'you').relics;
    theirRelics ??= metadata(frames, 'them').relics;
  }
  const base = f0.them.map((u) => fromFrame(u, theirRelics));
  const capt = captionHoney(frames);
  const guessMask = base.reduce((m, _, i) => m | (capt.them[i] ? 1 << i : 0), 0);
  const fallback = base.map((u, i) => ({ ...u, honey: !!capt.them[i] }));
  if (!base.length) return fallback;

  const us = ourUnits && ourUnits.length
    ? normBoard(ourUnits)
    : f0.you.map((u, i) => ({ ...fromFrame(u, ourRelics), honey: !!capt.you[i] }));

  for (const mask of masksToTry(base.length, guessMask)) {
    const them = base.map((u, i) => ({ ...u, honey: !!(mask & (1 << i)) }));
    const r = sim.simulate(us, them, { round, seats, frames: true, season,
      ourCaptain, theirCaptain, ourRelics, theirRelics });
    if (sameFrames(r.frames, frames)) return them;
  }
  return fallback;
}

module.exports = { open, inferGhost, publicReplayBoard, captionHoney, boardKey, normBoard,
  DEFAULT_FILE, MAX_BOARDS, MAX_AGE_DAYS };
