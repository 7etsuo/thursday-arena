'use strict';
/**
 * Exit 0 when we hold a top-N place on the leaderboard, 10 when not, 2 when it could not be told.
 * climb_loop.sh keys on these codes.
 */
const arena = require('../lib/arena');

const TOP_N = Number(process.env.CLIMB_TOP_N || 3);

async function main() {
  let code = 2;
  try {
    await arena.connect();
    const [lb, me] = await Promise.all([arena.getLeaderboard(), arena.getMe()]);
    const handle = String((me && me.xHandle) || '').toLowerCase();
    const entries = (lb && lb.entries) || [];
    const entry =
      entries.find((e) => e.isYou) ||
      entries.find((e) => String(e.xHandle || '').toLowerCase() === handle);
    const top = entries[0] || null;
    const rank = entry && entry.rank != null ? entry.rank : null;
    const inTop = rank != null && rank >= 1 && rank <= TOP_N;
    process.stdout.write(JSON.stringify({
      event: 'rank_check',
      ts: new Date().toISOString(),
      handle: (me && me.xHandle) || null,
      rank,
      rating: entry && entry.rating != null ? entry.rating : (me && me.season && me.season.rating) || null,
      wins: entry ? entry.wins : null,
      losses: entry ? entry.losses : null,
      topN: TOP_N,
      top1: top ? { handle: top.xHandle, rating: top.rating, rank: top.rank } : null,
      gap: top && entry ? top.rating - entry.rating : null,
      isNumberOne: rank === 1,
      inTopN: inTop,
    }) + '\n');
    code = inTop ? 0 : 10;
  } catch (e) {
    console.error(JSON.stringify({ event: 'rank_check_error', message: e.message }));
    code = 2;
  } finally {
    // close the browser cleanly (process.exit inside the try used to skip this and SIGKILL Chrome)
    try { await arena.disconnect(); } catch {}
  }
  process.exit(code);
}

main();
