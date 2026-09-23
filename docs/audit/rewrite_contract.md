# Rewrite contract — Thursday Arena bot (sim-driven)

> **Historical implementation contract (2026-09-19).** This records the specification used for
> the rewrite, not an up-to-date API or test baseline. Later work added the 81st bot
> (`DeckLens`), corrected two Season 2 kit rules, expanded winner checks to 10,748 battles,
> and added two-step search with a round-0 match-level objective. Use [AGENTS.md](../../AGENTS.md)
> and [HISTORY.md](../HISTORY.md) for the implemented behavior. The evidence files cited below
> are retained in this repo or in the stated scratchpad path.

Repo: `/home/tetsuo/grok/thursday-arena` (no git; a full pre-rewrite backup exists at
`/home/tetsuo/grok/thursday-arena-pre-rewrite-20260919.tgz`). Node 25, CommonJS, deps already installed
(`playwright-core`, `@modelcontextprotocol/sdk`, `zod`). Tests use the built-in `node --test`.

Legacy code (deleted from the repo, kept for reference only) is at
`<SCR>/legacy_code/**` where `<SCR>` = `/tmp/user/1000/claude-1000/-home-tetsuo-grok-thursday-arena/06183e91-c69d-4347-9358-42776c52875a/scratchpad`.
Legacy data stores are under `archive/legacy-2026-09-19/`. **Never resurrect legacy heuristics** (archetypes,
name ban lists, recipes, threat formulas, hot lists). The simulator decides everything.

Audit reports (evidence for every rule below): `docs/ENGINE_BATTLE.md`, `docs/ENGINE_SHOP.md`,
`<SCR>/audit/*.md`, `<SCR>/audit/strategy/*` (strategy scripts + outputs).

## Ground truth (verified; do not re-litigate)

- Battles are deterministic: seed = `[101,202,303][round]`. `lib/sim.js` replays 9,730/9,730 recorded battles
  exactly in the contract's original corpus (see `<SCR>/audit/strategy/check.js`).
- Board max 3, seat 0 = front, back = LAST unit (a 2-unit board's back is index 1).
- Gold = 10 every shop, no carry-over. Cost by rarity: common 3, uncommon 4, rare 5, epic 6.
  Sell +1. Reroll −1. Feed −3. Move/freeze/endShop 0.
- **Buy appends to the END of the board.** Sell removes; later indices shift.
- Reroll refreshes all UNFROZEN offer slots **and re-rolls the food**. Frozen offers persist across rerolls
  and rounds. Freeze is a toggle, costs 0.
- Food: apple = permanent +1/+1. potato = +2 ATK for this battle only (`tempAtk`), clears honey, cannot be
  applied twice to the same unit. honey = flag; on faint summons a 1/1 Drone; cannot re-honey.
  Food odds: R0 apple 50 / honey 50; R1–R2 honey 50 / apple 33 / potato 16.
- Offer pool: R0 = unlockTurn 1 only; R1 = unlockTurn ≤2; R2 = all. Uniform over the unlocked pool with
  replacement (duplicates happen). Season 2 pools: 38 / 61 / 80 bots.
- Series: at most 3 rounds (`round` 0..2). Ends at 2 round-wins or after round 2. Drawn rounds consume rounds.
- Season 2 (since 2026-09-19T07:00Z): 8 new bots and seat rules. State carries `seats {front,middle,back}`
  and `seatShop [{seat,revealed,name,text}×3]`; seat i is active from round i on. Seat rule ids used by the
  sim: `spotlight | pit_stop | warm_up | encore | hot_seat | hard_hat`.
- The opponent handle is HIDDEN during the R0 shop (null in 90.5% of R0 shops) and known at R1/R2.
- Ghost boards are ~97% deterministic per (season, handle, round); 79% of matches are a rematch of the
  previous opponent. The enemy's next-round board differs from this round's 71% of the time — never plan
  round r against round r−1's board.

## Strategy specified for the rewrite (from [docs/STRATEGY.md](../STRATEGY.md))

1. Every decision is scored by the simulator against a weighted TARGET of enemy boards. No name lists, no
   archetypes, no threat formulas.
2. Target: R0 = 50% the previous match opponent's R0 board(s) + 50% the same-season R0 pool;
   R1/R2 = 75% this handle's book board(s) for that round + 25% the same-round pool. Never a single board.
3. Always field 3 units and spend the gold. Never sell without buying in the same step.
4. R0: buy the best 1–2 offers, reroll at most ONCE, then complete the board. Hard budget invariant before
   any reroll: `gold − 1 ≥ 3 × (empty seats)`.
5. Re-seat every shop with `sim.bestSeating` (moves are free).
6. Food: let the sim choose the target, with the engine facts above (apple is permanent, so prefer it at R1;
   potato is this-battle-only; honey is a Drone, so it is usually best on the back unit).
7. Never freeze.
8. Round 2 is always final: weight draws by the series score — at 1-0 a draw wins the match, at 0-1 a draw
   loses it. At round 1 with a 1-0 lead a win ends the match.

## Module contract

All modules are CommonJS, no side effects at require time (no disk writes, no network).

### `lib/catalog.js` (owner: CORE)
```js
getCatalog()                     // -> [bot]; loads data/catalog.json (80 bots incl. season 2) once
setCatalog(bots)                 // merge live /api/catalog rows, persist to data/catalog.json, reset caches
byId(id) / byName(name)          // bot or null; name match is case/punctuation-insensitive
unlockedPool(round, season)      // -> [bot] offerable at that round (unlockTurn <= round+1), season filtered
toSimUnit(stateUnit)             // board unit from the arena state -> {name, kitId, atk, hp, honey}
                                 //   atk MUST include tempAtk; unknown bots fall back to the state fields
offerToSimUnit(offer)            // shop offer -> sim unit (no food applied)
PRICES                           // {common:3, uncommon:4, rare:5, epic:6}
```
Unknown bot ids (a new season) must degrade gracefully: keep name/atk/hp, `kitId: null`, and log once.

### `lib/sim.js` (owner: CORE — already vendored and validated; clean it, do not change behaviour)
Public API stays: `simulate(us, them, {round, seats, seed, frames})`, `outcome(...)`, `bestSeating(units, pool, opts)`,
`simulateBattle`, `unitFromCatalog`, `permutations`, `KITS`, `ROUND_SEEDS`, `SEAT_RULES`.
- Replace its hardcoded `catalog()` paths with `lib/catalog.js`.
- Keep `DEFAULT_HYP` behaviour identical (the defaults are what validate 100%); drop the unused alternative
  branches only if the corpus test still passes 9,730/9,730.
- `bestSeating(units, pool, opts)` accepts `pool` as `[board]` or `[{board, weight, seats}]` and must support
  `opts.utility = {win, draw, loss}` (default 1/0.5/0) and per-entry `seats`.

### `lib/shop_model.js` (owner: CORE)
A pure model of the server's shop reducer, used for look-ahead. No I/O.
```js
normalize(arenaState)            // -> S {round, gold, board:[u], offers:[o|null], food, frozen:[bool],
                                 //       series:{you,them}, seats, season}
                                 //   u: {uid, name, kitId, atk, hp, tempAtk, honey, potato, cost, rarity}
                                 //   o: {shopIndex, name, kitId, atk, hp, cost, rarity, frozen}
legal(S, action)                 // -> true | 'reason string'
apply(S, action)                 // -> new S (pure). Actions: {type:'buy',shopIndex} {type:'sell',boardIndex}
                                 //   {type:'reroll'} {type:'feed',boardIndex} {type:'freeze',shopIndex}
                                 //   {type:'move',boardIndex,dir}. buy appends; reroll marks offers unknown
                                 //   and food unknown; feed applies S.food per the rules above.
sampleReroll(S, rng)             // -> S with offers/food sampled (uniform over unlockedPool(round, season),
                                 //   frozen slots preserved; food by the round odds above)
simUnits(S)                      // -> [sim unit] for the current board (atk includes tempAtk)
```
`rng` is a seeded function `() => [0,1)` passed in by the caller (no `Math.random` in library code).

### `lib/book.js` (owner: BOOK)
Opponent board book, persisted at `memory/book.json` (atomic write: tmp + rename).
```js
open(file?)                                   // -> book instance (loads or creates)
book.record({season, handle, round, board, seats, ts, matchId})   // board = [sim unit] (frame-0 stats, honey resolved)
book.lookup(season, handle, round)            // -> [{board, seats, n, lastTs}] most-seen first
book.pool(season, round, {limit=40, beforeTs}) // -> [{board, weight}] across handles, weight = times faced
book.save()
inferGhost({frames, ourUnits, round, seats})  // -> [sim unit] for the enemy board: kits from the catalog by
                                              //   name, honey resolved by replaying all honey assignments
                                              //   with the sim and keeping the one that reproduces `frames`
                                              //   exactly (fall back to Drone-caption inference)
```
Storage stays small: cap boards per (season, handle, round) at the 5 most recent distinct boards, and prune
handles not seen for 30 days. `beforeTs` exists so the offline evaluation can avoid look-ahead leakage.

### `lib/target.js` (owner: BOOK)
```js
build({book, season, round, handle, prevHandle, seats, limit=40, beforeTs})
  // -> {entries: [{board, weight, seats}], sources: {bookN, poolN, bookWeight}, note}
```
Weights sum to 1. R0 uses `prevHandle`'s R0 boards at 0.5 (pool 0.5); if there is no such board, pool only.
R1/R2 use `handle`'s boards for that round at 0.75 (pool 0.25); pool only if the handle is unknown.
`seats` (the CURRENT match's seat rules) is attached to every entry — book entries keep their own seats only
for reference. If the same-season pool has fewer than 10 boards, blend in the previous season's pool and say
so in `note`.

### `lib/planner.js` (owner: PLANNER)
```js
utility(round, series)                 // -> {win, draw, loss} match-value weights (see strategy rule 8)
evaluate(units, target, {round, seats, utility})  // -> {score, order}  (best seat order and its score)
planStep(S, ctx)                       // S = shop_model state; ctx = {target, rng, timeBudgetMs, log}
                                       // -> {actions: [action], reason, value, expected}  (1 action, or a
                                       //    [sell, buy] pair) | {actions: [], done: true, reason, value}
seatingActions(S, target, opts)        // -> [{type:'move',...}] to reach the best order from the current one
```
Rules the planner must guarantee (assert in tests):
- never returns `done` while a seat is empty and an affordable offer exists;
- never returns a reroll that breaks `gold − 1 ≥ 3 × empty seats`;
- never returns a sell without a buy in the same result;
- never returns `freeze`;
- never returns an illegal action per `shop_model.legal`;
- respects `ctx.timeBudgetMs` (default 1500) — degrade by shrinking the target and the reroll sample, and
  report what was cut in `reason`.
R0 uses the keep-k + one-reroll policy (evaluate keeping each subset of the offers and the expected value of
the best completion after one reroll, via `sampleReroll` with N samples, memoised by sorted unit names).
R1/R2 use a greedy loop: evaluate every feed, every buy into an empty seat, every sell-then-buy, and a reroll
(expected value over samples); take the best improvement above `ctx.epsilon` (default 0.01).

### `lib/arena.js` (owner: LOOP — rewrite of the existing file)
Same transport (`lib/cdp.js`, unchanged), but:
- `observe()`, `act(action)` -> `{state, version, ...}`; `act` uses the version from the last envelope.
- **409 is a conflict, not success**: refetch and return `{conflict: true, state}` so the caller replans.
- **429 / 5xx**: exponential backoff with jitter, capped retries, then throw a typed error.
- `setDryRun(true)` makes every mutating call a no-op that returns the current state (no POST at all).
- `getCatalog({refresh})` merges the live catalog into `lib/catalog.js` and persists it.
- No disk writes per poll (the old `api/last_version.json` is gone).
- `getMe()`, `getLeaderboard()`, `playerMatches()` stay.

### `lib/telemetry.js` (owner: LOOP)
One append-only JSONL stream per day: `data/log/YYYY-MM-DD.jsonl`, plus `data/log/LATEST`.
```js
open({dir='data/log', codeVersion}) -> t
t.event(type, payload)   // types: session_start | match_start | shop | act | battle | result | error | session_end
t.close()
codeVersion(files)       // sha1 over lib/*.js + driver/*.js contents, first 12 hex chars
```
Every `shop` event records: round, gold, food, offers, board (with tempAtk/honey/potato), seats, series,
handle, target summary, the chosen action, its value, and the planner reason. Every `battle` event records
round, seats, our units, enemy units (frame-0), the full frames, and the winner. Every `result` records
wins, eloDelta, opponent, server matchId. No other store writes match data.

### `driver/play_loop.js` (owner: LOOP)
```
node driver/play_loop.js [--once] [--dry] [--start] [--games N]
```
- Single instance: an exclusive pid lock at `data/play_loop.lock` (stale lock older than 10 min is reclaimed).
- Loop: `observe` -> switch on `phase.kind`:
  - `shop`: build the target once per shop, then `planStep`/`act` one action at a time, using the envelope
    returned by each `act` as the new state (no stale-shop planning, no batched action lists). On `conflict`,
    re-observe and continue. When `planStep` says done: emit seating moves, then `endShop`.
  - `battle`: record the battle (frames from the endShop/battle envelope) into the book and telemetry, then
    `battleDone` until the phase changes.
  - `result`: record the result; if more games remain, `restart` (only ever from `result`/`idle`).
  - `idle`: `start` if `--start`, else exit.
- NEVER send `start`/`restart` while the phase is `shop` or `battle`.
- The R0 target needs the previous opponent: keep it in memory across games in the batch and persist the last
  opponent handle in `memory/last_opponent.json`.
- The enemy board is recorded per (season, handle, round). At R0 the handle may be unknown at endShop time —
  buffer the battle and record it once the handle appears (it is in the state from R1 on and at `result`).
- Crash safety: any thrown error is logged to telemetry, the lock is released, exit code 1.

### `test/mock_arena.js` + `test/*.test.js` (owner: LOOP, extended by INTEGRATOR)
`mock_arena.js` implements the same interface as `lib/arena.js` on top of `shop_model` + `sim` + a seeded RNG,
with ghost boards drawn from `data/corpus/battles.jsonl`, real series/round/result logic and elo. It lets the
whole loop run offline and deterministically. `test/loop.test.js` plays several matches through it and asserts
the invariants (always 3 units at endShop when affordable, no illegal action, no start/restart mid-match,
gold spent, book updated, telemetry written).

### `tools/` (owner: BOOK for build_book, PLANNER for eval_planner)
- `tools/build_book.js` — seed `memory/book.json` from `data/corpus/battles.jsonl` (rows already carry
  resolved honey, kits, handle, round, seats, season flag `s2`). Prints counts per season/round.
- `tools/eval_planner.js` — offline strategy evaluation. For each row of `data/corpus/shops.jsonl` (the real
  pre-shop state and the enemy board actually faced), build the target from a book containing only battles
  with an EARLIER timestamp (no leakage), run the planner to completion against a `sampleReroll`-driven shop,
  then score the resulting board against the enemy board actually faced with the sim. Report mean score
  (win 1 / draw 0.5) vs the recorded outcome, split by round and era (S1early < 2026-09-19T04:30Z, S1late, S2),
  with n and a 95% CI. Support `--limit N`, `--round R`, `--era X`, `--seed S`.
  Reference numbers to beat (from the audit): recorded actual R0 0.650, R1/R2 0.758; the audit's search
  reached R0 0.873–0.933 and R1/R2 0.976 — those are upper bounds from a heavier search.

## Repo layout after the rewrite
```
lib/      catalog.js sim.js shop_model.js book.js target.js planner.js arena.js cdp.js telemetry.js
driver/   play_loop.js climb_loop.sh check_rank.js
tools/    build_book.js eval_planner.js
test/     mock_arena.js sim.test.js shop_model.test.js book.test.js planner.test.js loop.test.js
data/     catalog.json corpus/{battles,shops}.jsonl log/*.jsonl
memory/   book.json last_opponent.json
docs/     ENGINE_BATTLE.md ENGINE_SHOP.md
api/      ACTIONS.md (rewritten by the INTEGRATOR to match the engine docs)
mcp/      server.js
archive/  legacy-2026-09-19/** (old data; never read by live code)
```

## Style
- Small, direct modules; no cleverness, no dead branches, no "DATA <date>" comment archaeology.
- Comments explain WHY with a pointer to the evidence (`docs/ENGINE_SHOP.md §…`), not what the line does.
- No `Math.random` in `lib/` (seeded rng passed in); no `process.exit` in `lib/`.
- Every exported function gets a test. Tests must run offline in under ~60 s total.
