# Thursday Arena MCP

Stdio MCP server (`mcp/server.js`) so an agent can inspect and play
[thursdayarena.com](https://thursdayarena.com) over the JSON API — no screenshot automation.

## Prerequisites

1. Chrome installed and a Clerk sign-in to thursdayarena.com. If no suitable CDP browser is
   running, `lib/cdp.js` opens Chrome with the dedicated `ARENA_PROFILE` profile (default
   `~/.config/google-chrome-arena`); sign in there when prompted.
2. Alternatively, an existing CDP browser with a thursdayarena.com tab can be used. The preferred
   port is **9244**; `lib/cdp.js` searches other debugging ports as well.

`sim_battle` and `book_lookup` work without a live browser. `plan_shop` observes the live shop,
but sends no action.

**Seasons 1–4:** `sim_battle` accepts `season` (default 4), unit `crew` and `item`/`itemId`,
`ourCaptain`/`theirCaptain`, and `ourRelics`/`theirRelics`. Fused units supply `botId` and
`fusedWith` plus explicit `atk` and `hp`; the catalog resolves both parents and their recipe. Known units obtain their kit
and crew from the catalog even with attack/health overrides; explicit `kitId: null` disables the
kit. `plan_shop` proposes pending `pickCaptain` or `pickRelic` drafts, then normal plans including
fusion. `book_lookup` defaults to Season 4. Correct equipment, relics, captains and seats are
necessary for a meaningful prediction. See [Season 4 notes](../docs/SEASON4.md).

## Start

```bash
cd /home/tetsuo/grok/thursday-arena
npm run mcp          # -> node mcp/server.js  (stdio JSON-RPC)
```

Client config:

```json
{
  "mcpServers": {
    "thursday-arena": {
      "command": "node",
      "args": ["/home/tetsuo/grok/thursday-arena/mcp/server.js"]
    }
  }
}
```

## Tools

| tool | live? | what it does |
|---|---|---|
| `arena_me` | live | `GET /api/me` — signed-in player, season rating |
| `arena_catalog` | cached or live | Returns the local catalog if available; `refresh:true` (or an empty cache) fetches `/api/catalog` and merges it into `data/catalog.json` |
| `arena_observe` | live | `GET /api/arena` — raw state plus the `shop_model.normalize()` view |
| `arena_act` | live, **mutates** | `POST /api/arena {action, version}` |
| `arena_leaderboard` | live | `GET /api/leaderboard` |
| `arena_player_matches` | live | `GET /api/public/v1/matches?x_handle=…`, `detail:true` also fetches one match |
| `sim_battle` | offline | replays two boards through `lib/sim.js`; accepts S1–S4 crews, items, captains, relics and fusion parents; `bestSeating:true` scores every distinct seat order |
| `plan_shop` | live, read-only | fetches the live shop, proposes `pickCaptain` or `pickRelic` if needed, otherwise builds the target and asks `lib/planner.js` for the next step — **sends no mutation** |
| `book_lookup` | offline | what `memory/book.json` holds for a handle, or the round pool across handles |

`arena_act` is the only tool that changes server state. It allows `start` and `restart` only when
`phase.kind` is `idle` or `result`: the true semantics of `start` mid-match are unverified
(`api/ACTIONS.md`, "start and restart — what they really do"), so the server is never asked. A
`409` comes back as `{conflict: true}` and applies nothing — replan from the returned state.

Action schemas, costs, phases, series and seat rules: [`../api/ACTIONS.md`](../api/ACTIONS.md).

## Notes

- Always `arena_observe` before `arena_act` so `version` is fresh.
- `plan_shop` and `book_lookup` read the current `memory/book.json` on every request, so newly
  learned opponents are visible without restarting MCP. `npm run book:build` replaces that file
  with the older corpus seed; use it only for an intentional rebuild. An empty book can leave the
  planner without an opponent target. A corrupt or unsupported book is reported as an error.
- `freeze` and `freezeItem` are free toggles. The S4 Freezer planner can choose bot freezes;
  item freezes are not part of the current search.

## Playing without MCP

```bash
npm run play -- --once --start # one rated match
npm run play:dry            # read live state and plan; send no arena action
npm run play -- --games 15 --start
npm run climb               # batches until driver/check_rank.js reports a top-N place
```
