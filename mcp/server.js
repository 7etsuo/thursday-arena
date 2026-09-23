#!/usr/bin/env node
'use strict';
/**
 * Thursday Arena MCP server (stdio).
 *
 * Read-only tools talk to the live rated API through Chrome CDP; arena_act is the only one that
 * mutates, and it refuses start/restart while a match is in progress (the loop's rule, enforced
 * here too so a stray tool call cannot abandon a match mid-series).
 *
 * sim_battle and book_lookup use local data only. plan_shop reads the live shop, then plans locally;
 * it sends no mutation. arena_catalog with refresh=true also updates data/catalog.json locally.
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const arena = require('../lib/arena');
const sim = require('../lib/sim');
const shopModel = require('../lib/shop_model');
const targetLib = require('../lib/target');
const bookLib = require('../lib/book');
const planner = require('../lib/planner');
const catalog = require('../lib/catalog');

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (e) => ({
  isError: true,
  content: [
    {
      type: 'text',
      text: JSON.stringify({ error: (e && e.message) || String(e), body: e && e.body }, null, 2),
    },
  ],
});

const tool = (fn) => async (args) => {
  try {
    return ok(await fn(args || {}));
  } catch (e) {
    return fail(e);
  }
};

// The driver may update the book while this MCP process stays alive between requests.
const book = () => bookLib.open();

const UNIT = z.object({
  name: z.string(),
  kitId: z.string().nullable().optional(),
  atk: z.number().optional(),
  hp: z.number().optional(),
  honey: z.boolean().optional(),
  crew: z.enum(['sales', 'ops', 'marketing', 'personal', 'builders']).optional(),
  fusedWith: z.string().optional(),
  botId: z.string().optional(),
  crews: z.array(z.string()).optional(),
  item: z.string().nullable().optional(),
  itemId: z.string().nullable().optional(),
});

/** A board given as names only is filled in from the catalog. */
function toUnits(list, season = 4) {
  return (list || []).map((u) => {
    const known = catalog.byName(u.name);
    if ((u.fusedWith || known?.fusedWith) && (u.atk == null || u.hp == null)) {
      throw new Error('Fused units need explicit atk and hp from their recorded board');
    }
    const base = u.atk == null || u.hp == null
      ? sim.unitFromCatalog(u.name)
      : { kitId: known?.kitId || null, honey: false, ...u };
    return {
      ...base,
      ...(Number(season) >= 3 && known?.crew ? { crew: known.crew } : {}),
      ...u,
      ...(Number(season) >= 4 && (u.fusedWith || known?.fusedWith) ? catalog.fusionMeta(u.fusedWith ? u : known) : {}),
      ...(Object.hasOwn(u, 'kitId') ? { kitId: u.kitId } : {}),
      ...(u.itemId && !u.item ? { item: u.itemId } : {}),
    };
  });
}

const server = new McpServer({ name: 'thursday-arena', version: '2.0.0' });

server.registerTool(
  'arena_me',
  { title: 'Arena me', description: 'GET /api/me — signed-in player (xHandle, season rating).', inputSchema: {} },
  tool(() => arena.getMe())
);

server.registerTool(
  'arena_catalog',
  {
    title: 'Arena catalog',
    description: 'GET /api/catalog — all current bots. refresh=true refetches and merges into data/catalog.json.',
    inputSchema: { refresh: z.boolean().optional() },
  },
  tool(async ({ refresh }) => {
    const bots = await arena.getCatalog({ refresh: !!refresh });
    return { count: bots.length, bots };
  })
);

server.registerTool(
  'arena_observe',
  { title: 'Arena observe', description: 'GET /api/arena — the rated state, plus the shop_model view of it.', inputSchema: {} },
  tool(async () => {
    const env = await arena.observe();
    const kind = env.state && env.state.phase && env.state.phase.kind;
    return { version: env.version, phase: env.state && env.state.phase, state: env.state, shop: kind === 'shop' ? shopModel.normalize(env.state) : null };
  })
);

server.registerTool(
  'arena_act',
  {
    title: 'Arena act',
    description:
      'POST /api/arena {action, version}. Actions include pickCaptain|pickRelic|fuse|buy|sell|reroll|feed|freeze|equip|freezeItem|move|endShop|battleDone, plus start|restart which are refused while a match is in progress. A 409 returns {conflict:true} and applies nothing.',
    inputSchema: {
      action: z.record(z.string(), z.any()).describe('e.g. {type:"buy",shopIndex:0}'),
      version: z.number().int().optional(),
    },
  },
  tool(async ({ action, version }) => {
    if (!action || typeof action.type !== 'string') throw new Error('action.type required');
    if (action.type === 'start' || action.type === 'restart') {
      const env = await arena.observe();
      const kind = env.state && env.state.phase && env.state.phase.kind;
      // allowlist, not a shop/battle denylist: an unread or newly added phase must not be a green
      // light to abandon the match (review R2-01, same rule as driver/play_loop.js)
      if (kind !== 'result' && kind !== 'idle') {
        throw new Error(`refusing ${action.type} while phase=${kind}: it would abandon the match`);
      }
    }
    return arena.act(action, version);
  })
);

server.registerTool(
  'arena_leaderboard',
  { title: 'Arena leaderboard', description: 'GET /api/leaderboard', inputSchema: {} },
  tool(() => arena.getLeaderboard())
);

server.registerTool(
  'arena_player_matches',
  {
    title: 'Arena player matches',
    description: 'GET /api/public/v1/matches?x_handle=… — a handle\'s match history.',
    inputSchema: {
      handle: z.string(),
      limit: z.number().int().optional(),
      cursor: z.string().optional(),
      detail: z.boolean().optional(),
      matchId: z.string().optional(),
    },
  },
  tool((a) => arena.playerMatches(a.handle, a))
);

server.registerTool(
  'sim_battle',
  {
    title: 'Simulate a battle',
    description:
      'Offline: replay two boards through lib/sim.js. Season 1–2 matches all 10,748 recorded winners; Season 3 has focused live and public replays. Seat 0 is the front; the seed is fixed by the round.',
    inputSchema: {
      us: z.array(UNIT),
      them: z.array(UNIT),
      season: z.number().int().min(1).max(4).optional().describe('defaults to the current season, 4'),
      round: z.number().int().min(0).max(2).optional(),
      seats: z.record(z.string(), z.string()).optional().describe('{front,middle,back} season-2 rule ids'),
      ourCaptain: z.string().optional(),
      theirCaptain: z.string().optional(),
      ourRelics: z.array(z.string()).optional(),
      theirRelics: z.array(z.string()).optional(),
      frames: z.boolean().optional(),
      bestSeating: z.boolean().optional().describe('also score every seat order of `us`'),
    },
  },
  tool((a) => {
    const season = a.season || 4;
    const us = toUnits(a.us, season);
    const them = toUnits(a.them, season);
    const opts = { season, round: a.round || 0, seats: a.seats || null,
      ourCaptain: a.ourCaptain || null, theirCaptain: a.theirCaptain || null, ourRelics:a.ourRelics, theirRelics:a.theirRelics,
      frames: a.frames !== false };
    const r = sim.simulate(us, them, opts);
    const out = { winner: r.winner, turns: r.turns, frames: a.frames === false ? undefined : r.frames };
    if (a.bestSeating) {
      out.seating = sim.bestSeating(us, [them], opts).map((row) => ({
        score: row.score,
        order: row.order.map((u) => u.name),
      }));
    }
    return out;
  })
);

server.registerTool(
  'plan_shop',
  {
    title: 'Plan the current shop',
    description:
      'Read-only: observe the live shop, build the target from the book and ask lib/planner.js for the next step. Sends no mutation.',
    inputSchema: {
      prevHandle: z.string().optional().describe('previous opponent, for the round-0 target'),
      timeBudgetMs: z.number().int().optional(),
      seed: z.number().int().optional(),
    },
  },
  tool(async (a) => {
    const env = await arena.observe();
    const st = env.state || {};
    if (!st.phase || st.phase.kind !== 'shop') throw new Error(`phase is ${st.phase && st.phase.kind}, not shop`);
    const season = shopModel.seasonOf(st);
    if (season > 4) throw new Error('Unsupported season');
    const S = shopModel.normalize(st, { season });
    const handle = st.opponentHandle ? String(st.opponentHandle).replace(/^@/, '').toLowerCase() : null;
    if (S.season >= 3 && !S.captain && Array.isArray(S.captainOffer) && S.captainOffer.length) {
      const captain = planner.chooseCaptain(S, { book: book(), handle,
        prevHandle: a.prevHandle || null });
      const action = { type: 'pickCaptain', captain };
      if (shopModel.legal(S, action) !== true) throw new Error(`planner chose unavailable captain ${captain}`);
      return { season, round: S.round, captainOffer: S.captainOffer,
        plan: { actions: [action], reason: 'choose captain before shopping' } };
    }
    if (S.relicOffer?.length) {
      const relic = planner.chooseRelic(S,{book:book(),handle,prevHandle:a.prevHandle || null});
      return {season,round:S.round,relicOffer:S.relicOffer,plan:{actions:[{type:'pickRelic',relic}],reason:'choose relic before shopping'}};
    }
    const built = targetLib.build({
      book: book(),
      season,
      round: S.round,
      handle,
      prevHandle: a.prevHandle || null,
      seats: S.seats,
    });
    const futureTargets = {};
    for (let round = S.round + 1; round <= 2; round++) {
      futureTargets[round] = targetLib.build({ book: book(), season, round, seats: S.seats,
        handle: handle || a.prevHandle || null, prevHandle: a.prevHandle || null, proxy: !handle });
    }
    // the repo's one seeded stream; the LCG this used to hold was low-bit correlated (review R3-7)
    const rng = sim.mulberry32(a.seed == null ? 1 : a.seed);
    const cache = new Map();
    const plan = planner.planStep(S, {
      target: built.entries,
      futureTargets,
      rng,
      cache,
      timeBudgetMs: a.timeBudgetMs == null ? 1500 : a.timeBudgetMs,
    });
    return {
      season,
      round: S.round,
      gold: S.gold,
      food: S.food,
      board: S.board,
      offers: S.offers,
      seats: S.seats,
      captain: S.captain,
      rivalCaptain: S.rivalCaptain,
      relics: S.relics,
      rivalRelics: S.rivalRelics,
      itemOffer: S.itemOffer,
      target: { ...built.sources, note: built.note, entries: built.entries.length },
      plan,
      seating: planner.seatingActions(S, built.entries, { round: S.round, seats: S.seats, cache }),
    };
  })
);

server.registerTool(
  'book_lookup',
  {
    title: 'Opponent book',
    description:
      'Offline: what memory/book.json holds for an opponent. With a handle, the boards recorded for (season, handle, round); without one, the round pool across handles.',
    inputSchema: {
      handle: z.string().optional(),
      round: z.number().int().min(0).max(2),
      season: z.number().int().min(1).optional(),
      limit: z.number().int().optional(),
    },
  },
  tool((a) => {
    const season = a.season || 4;
    const b = book();
    if (a.handle) {
      const rows = b.lookup(season, String(a.handle).replace(/^@/, ''), a.round);
      return { season, handle: a.handle, round: a.round, n: rows.length, rows };
    }
    return { season, round: a.round, pool: b.pool(season, a.round, { limit: a.limit || 20 }), stats: b.stats() };
  })
);

async function main() {
  await server.connect(new StdioServerTransport());
}

if (require.main === module) main().catch((err) => {
  console.error(err);
  process.exit(1);
});

module.exports = { server, toUnits };
