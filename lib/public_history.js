'use strict';
/** Public attack/defense ledger and exact defensive observations. No arena actions.
 * Poll at match boundaries. Checkpoints and pending replays survive restarts; the book's
 * observation receipts make a crash between its save and the history save harmless.
 */
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const bookLib = require('./book');
const sim = require('./sim');
const DAY = 86400000;
const norm = (h) => String(h || '').replace(/^@/, '').trim().toLowerCase();
const seasonOf = (s) => Number(String(s).replace(/^Season\s+/i, ''));
const DEFAULT_FILE = path.join(__dirname, '../memory/public_history.json');

function read(file, handle, season) {
  let d;
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw new Error(`Cannot read public history: ${e.message}`); }
  if (!d) return { format: 1, handle, season, matches: {}, boundary: null, cursor: null, head: null };
  if (d.format !== 1 || d.handle !== handle || !(d.season === season || d.season === 3 && season === 4) || !d.matches || Array.isArray(d.matches)
      || typeof d.matches !== 'object' || Object.values(d.matches).some((r) => !r || !Number.isFinite(r.ts)
        || !['attacker', 'ghost'].includes(r.role) || !['win', 'loss', 'draw'].includes(r.outcome)
        || !Number.isFinite(r.elo) || !r.opponent || !Array.isArray(r.rounds))) {
    throw new Error('Invalid public history or account/season mismatch; preserve the file for review');
  }
  if (d.format === 1 && d.handle === handle && d.season === 3 && season === 4) {
    // Keep the full previous ledger alongside the new season. The ordinary atomic save
    // persists both; a season rollover must never erase learned records.
    return { format:1,handle,season,matches:{},boundary:null,cursor:null,head:null,
      previousSeasons:{...(d.previousSeasons || {}),3:{...d,previousSeasons:undefined}} };
  }
  return d;
}
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  try { fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, file); }
  catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
}
function rowOf(raw, handle, season) {
  if (seasonOf(raw?.season) !== season) return null;
  const self = raw.players?.find((p) => norm(p.x_handle) === handle);
  const other = raw.players?.find((p) => norm(p.x_handle) !== handle);
  const ts = Date.parse(raw.played_at);
  if (!raw.id || !Number.isFinite(ts) || !Array.isArray(raw.players) || raw.players.length !== 2 || !self || !other || !norm(other.x_handle)
      || !['attacker', 'ghost'].includes(self.role) || !['win', 'loss', 'draw'].includes(self.outcome)
      || other.role !== (self.role === 'ghost' ? 'attacker' : 'ghost') || !Number.isFinite(self.elo_delta)) {
    throw new Error('Malformed or wrong-account public history row');
  }
  return { id: raw.id, ts, role: self.role, opponent: norm(other.x_handle), outcome: self.outcome,
    elo: self.elo_delta, rounds: [], learned: self.role !== 'ghost',
    // The public ledger exposes rating changes, not both ratings/K factors. Their observed
    // ratio estimates defensive exposure in attack-K units (including zero-rated defenses).
    kRatio: self.role === 'ghost' && other.elo_delta
      ? Math.min(1, Math.abs(self.elo_delta / other.elo_delta)) : 0 };
}

// Captains with combat effects announce themselves. A null here means "no observed combat
// captain", never a guessed economic captain. Seats enter defense planning only when a unique
// assignment of ACTIVE rules reproduces the complete public trace.
function replayInputs(detail, row, handle, season) {
  if (!detail || detail.id !== row.id || seasonOf(detail.season) !== season || detail.rated !== true
      || norm(detail.player?.x_handle) !== row.opponent || detail.opponent?.kind !== 'ghost'
      || norm(detail.opponent?.x_handle) !== handle || Date.parse(detail.played_at) !== row.ts
      || detail.owner_elo_delta !== row.elo || ({ win: 'loss', loss: 'win', draw: 'draw' }[detail.result]) !== row.outcome
      || !Array.isArray(detail.rounds) || !detail.rounds.length || detail.rounds.length > 3) {
    throw new Error('Public defense replay is unavailable or does not match its history row');
  }
  const seen = new Set();
  const series = { you: 0, them: 0 };
  return detail.rounds.map((r) => {
    if (![0, 1, 2].includes(r.round) || seen.has(r.round) || !Array.isArray(r.frames) || !r.frames.length) {
      throw new Error('Malformed defense round');
    }
    seen.add(r.round);
    const board = bookLib.publicReplayBoard(r, 'you'), defender = bookLib.publicReplayBoard(r, 'them');
    if (!board.length || board.length > 3 || !defender.length || defender.length > 3) throw new Error('Unknown defense board');
    const c = r.frames.map((f) => f.caption);
    const meta = require('./season4').combatMetadata(r.frames, 'you');
    const defenderMeta = require('./season4').combatMetadata(r.frames, 'them');
    const captain = meta.captain, defenderCaptain = defenderMeta.captain;
    const positions = ['front', 'middle', 'back'].slice(0, r.round + 1);
    let possibilities = [{}];
    for (const position of positions) possibilities = possibilities.flatMap((p) => [...sim.SEAT_RULES, ...(season >= 4 ? require('./season4').SEATS : [])].filter(rule => !Object.values(p).includes(rule)).map((rule) => ({ ...p, [position]: rule })));
    let seats = null, matches = 0;
    for (const candidate of possibilities) {
      const got = sim.simulate(board, defender, { season, round: r.round, seats: candidate,
        ourCaptain: captain, theirCaptain: defenderCaptain, ourRelics: meta.relics, theirRelics: defenderMeta.relics });
      if (isDeepStrictEqual(got.frames, r.frames)) { seats = candidate; if (++matches > 1) break; }
    }
    const before = { ...series };
    if (r.winner === 'them') series.you++;
    if (r.winner === 'you') series.them++;
    return { round: r.round, board, captain, ...(season >= 4 ? {relics:meta.relics} : {}), series: before, seats: matches === 1 ? seats : null,
      metadata: matches === 1 ? 'unique_trace_match' : matches ? 'ambiguous_seats' : 'unmatched_trace' };
  });
}

function report(data, since = -Infinity) {
  const result = { handle: data.handle, season: data.season, from: null, through: null,
    attack: { games: 0, wins: 0, losses: 0, draws: 0, elo: 0 },
    defense: { games: 0, wins: 0, losses: 0, draws: 0, elo: 0 }, pending: 0,
    backfillPending: data.cursor != null || !data.updatedAt, updatedAt: data.updatedAt || null, byOpponent: {} };
  for (const r of Object.values(data.matches).filter((r) => r.ts >= since)) {
    const side = r.role === 'attacker' ? 'attack' : 'defense';
    const opponent = result.byOpponent[r.opponent] || (result.byOpponent[r.opponent] = { attack: 0, defense: 0, elo: 0 });
    opponent[side]++; opponent.elo += r.elo;
    result[side].games++;
    result[side][{ win: 'wins', loss: 'losses', draw: 'draws' }[r.outcome]]++;
    result[side].elo += r.elo;
    result.from = result.from == null ? r.ts : Math.min(result.from, r.ts);
    result.through = Math.max(result.through || 0, r.ts);
    if (!r.learned) result.pending++;
  }
  result.combinedElo = result.attack.elo + result.defense.elo;
  return result;
}

function open({ file = DEFAULT_FILE, handle, season = 3, now = Date.now } = {}) {
  handle = norm(handle);
  if (!handle || ![3,4].includes(season)) throw new Error('Public history needs the signed-in handle and a supported season');
  let data = read(file, handle, season), nextPoll = 0;
  async function poll({ arena, book, event = () => {}, maxPages = 2, maxDetails = 12, intervalMs = 60000, budgetMs = 12000 } = {}) {
    const at = now();
    if (at < nextPoll) return { skipped: true };
    nextPoll = at + intervalMs;
    const d = structuredClone(data), cut = at - 30 * DAY;
    const deadline = Date.now() + budgetMs, observations = [];
    let added = 0, learned = 0, upgraded = 0;
    const replayVersion = season >= 4 ? require('./season4').BATTLE_MODEL_VERSION : null;
    try {
      for (let page = 0; page < maxPages; page++) {
        if (Date.now() >= deadline) break;
        const reply = await arena.playerMatches(handle, { limit: 100, cursor: d.cursor, bestEffort: true });
        if (!reply || !Array.isArray(reply.data) || (reply.next_cursor != null && typeof reply.next_cursor !== 'string')) throw new Error('Invalid history page');
        const rows = reply.data.map((raw) => ({ raw, row: rowOf(raw, handle, season) }));
        if (!d.cursor) d.head = reply.data[0]?.id || d.boundary;
        let stop = false;
        for (const { raw, row } of rows) {
          if (raw.id === d.boundary || Date.parse(raw.played_at) < cut) { stop = true; break; }
          if (!row || row.ts < cut) continue;
          if (!d.matches[row.id]) { d.matches[row.id] = row; added++; }
        }
        if (stop || !reply.next_cursor) { d.boundary = d.head; d.head = null; d.cursor = null; break; }
        if (reply.next_cursor === d.cursor) throw new Error('History cursor did not advance');
        d.cursor = reply.next_cursor;
      }
      // Oldest first keeps book recency based on played_at. Retry failures without blocking newer
      // defenses; nextAttempt is persisted so a missing replay cannot monopolize every poll.
      const pending = Object.values(d.matches).filter((r) => r.role === 'ghost' && r.ts >= cut &&
        (!r.learned || (r.ts >= at - 3600000 && (r.rounds.some(x => !x.series) ||
          replayVersion && r.replayVersion !== replayVersion))) && (r.nextAttempt || 0) <= at)
        .sort((a, b) => Number(a.learned) - Number(b.learned) || a.ts - b.ts || a.id.localeCompare(b.id)).slice(0, maxDetails);
      for (const row of pending) {
        if (Date.now() >= deadline) break;
        try {
          const detail = await arena.getPublicMatchDetail(row.id);
          const rounds = replayInputs(detail, row, handle, season);
          const upgrade = row.learned;
          if (!upgrade) for (const r of rounds) book.record({ observationId: `defense:${handle}:${row.id}:${r.round}`,
            season, handle: row.opponent, round: r.round, board: r.board, captain: r.captain, ...(r.relics ? {relics:r.relics} : {}),
            seats: r.seats, matchId: row.id, ts: row.ts, role: 'defense' });
          row.rounds = rounds; row.learned = true; delete row.nextAttempt; delete row.failures;
          if (replayVersion) row.replayVersion = replayVersion;
          row.kRatio = detail.elo_delta ? Math.min(1, Math.abs(detail.owner_elo_delta / detail.elo_delta)) : 0;
          observations.push({ row, rounds, upgrade });
          if (upgrade) upgraded++; else learned++;
        } catch (e) {
          row.failures = (row.failures || 0) + 1;
          row.nextAttempt = at + Math.min(15 * 60000, 60000 * 2 ** Math.min(row.failures - 1, 4));
          event('error', { where: 'defense_replay', matchId: row.id, message: e.message });
        }
      }
      for (const [id, r] of Object.entries(d.matches)) if (r.ts < cut) delete d.matches[id];
      book.save(); // receipts and observations land together BEFORE marking replays learned
      d.updatedAt = at;
      write(file, d); data = d;
      for (const { row, rounds, upgrade } of observations) for (const r of rounds) event(upgrade ? 'defense_metadata' : 'book', {
        source: 'defense_replay', matchId: row.id, handle: row.opponent, season, round: r.round,
        board: r.board, captain: r.captain, ...(r.relics ? {relics:r.relics} : {}), seats: r.seats, metadata: r.metadata,
        series: r.series, ...(replayVersion ? {replayVersion} : {}),
        observedAt: new Date(row.ts).toISOString(), observationId: `defense:${handle}:${row.id}:${r.round}`,
      });
      const summary = report(d);
      event('history', { added, learned, upgraded, ...summary });
      return { added, learned, upgraded, ...summary };
    } catch (e) {
      event('error', { where: 'public_history', message: e.message });
      return { error: e.message };
    }
  }
  function defenseTarget(round, limit = 24) {
    const cut = now() - 3600000;
    const rows = Object.values(data.matches).filter((r) => r.role === 'ghost' && r.learned && r.ts >= cut)
      .sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
    const out = [];
    for (const r of rows) {
      const observed = r.rounds.find((x) => x.round === round && x.seats && x.series);
      if (observed) out.push({ board: observed.board, seats: observed.seats, theirCaptain: observed.captain, theirRelics: observed.relics,
        series: observed.series,
        weight: r.kRatio ?? .5, source: 'defense', matchId: r.id, observedAt: r.ts });
      if (out.length >= limit) break;
    }
    const recent = Object.values(data.matches).filter((r) => r.ts >= cut);
    const attacks = recent.filter((r) => r.role === 'attacker').length;
    const ratedExposure = recent.filter((r) => r.role === 'ghost')
      .reduce((n, r) => n + (r.kRatio ?? .5), 0);
    return { entries: out, exposure: attacks ? ratedExposure / (attacks + 10) : 0,
      note: `${out.length} recent defensive rounds; exposure from the last hour, in attack-K units` };
  }
  return { file, poll, defenseTarget, report: (since) => report(data, since), data: () => data };
}
module.exports = { open, report, replayInputs, rowOf, DEFAULT_FILE };
