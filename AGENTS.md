# AGENTS.md — the handbook for any coding agent working in this repo

Canonical. `CLAUDE.md` and `.cursor/rules/` point here; keep this file the source of truth and let the
others stay thin. Read this end to end before changing anything — most of what looks like a missing
feature here was measured and deliberately left out.

---

**Current compatibility (2026-09-23):** this build supports Seasons 1–4, including fusion,
relics and all 100 S4 cards. Read [Season 4 notes](docs/SEASON4.md) for behavior and validation
limits. The supplied S3 log fixes and honest comparison results are in
[the September 23 report](docs/ADAPTATION_FIXES_2026-09-23.md).

## 1. What this is, in one paragraph

A Node.js (CommonJS, no build step) bot that plays **rated matches on thursdayarena.com**, an
auto-battler in the style of Super Auto Pets, through the site's JSON API. It reached **#1 on the
Season 2 ladder** on 2026-09-19. The whole thing rests on one idea: **score decisions with a battle
simulator checked against recorded server results.** `lib/sim.js` matches the winner of all 10,748 battles in the
current corpus. The historical engine audit validated 10,065 battles frame for frame, and the
2026-09-20 archive replay validates another 5,454 complete-input battles frame for frame. These
are **Season 1/2** checks. The September 21 fixes additionally reproduce **337/337 complete-input
Season 3 live battles frame for frame**. The subsequent defense fixes add **2,751/2,751**
complete-input live battles with exact frames and winners (3,088 across both fixtures). The September 23 fixes add 7,250 exact complete-input fights (11,696 across the four supplied S3 fixtures). S4 adds 395 complete-input battle checks and 101 shop transitions. Neither season is exhaustively validated. See
[`docs/SEASON3.md`](docs/SEASON3.md).
Decisions (captain, relic, fusion, buy, sell, feed, equip, reroll, seat order) are made by
replaying the resulting board against a weighted set of boards the opponent might field and keeping
the best. There are no card-ranking heuristics. Season 3 calibrates opponent-model confidence from recent pre-battle forecast errors.

Node 25, CommonJS. Dependencies: `playwright-core` (browser transport), `@modelcontextprotocol/sdk`
and `zod` (MCP server only). Tests are `node --test`, no framework.

---

## 2. Hard rules

Violating any of these has broken the bot before. Each one is a scar.

1. **Never reintroduce heuristics.** The previous bot ranked boards with archetype labels
   (`glass_burst`, `flamingo_pass`, …), name ban/prefer lists, "recipes" of three named bots, threat
   formulas and hot lists. All deleted; all measured *worse* than the simulator. If a decision needs
   a number, get it from `lib/sim.js`.
2. **Preserve simulator validation.** A battle-rule change must keep the 10,748/10,748 historical
   Season 1/2 winners passing (`npm test`) and add frame validation for affected rules. The old
   corpus does not prove the newly added Season 3 kits, crews, captains, or items.
3. **Never point the browser at the user's real Chrome profile.** `lib/cdp.js` refuses
   `~/.config/google-chrome` outright. Playwright launches Chrome with `--use-mock-keychain`, which
   makes Chrome unable to decrypt that profile's cookies; it treats them as corrupt and **securely
   wipes them**. This happened on 2026-09-19 and logged the user out of every site, unrecoverably.
   The bot uses a dedicated profile (`ARENA_PROFILE`, default `~/.config/google-chrome-arena`).
4. **`start` / `restart` only ever from the `result` or `idle` phase** — an allowlist, so an unknown
   phase is refused too. Mid-match they may forfeit; the server is simply never asked.
5. **No `Math.random` in `lib/`** (a seeded `rng` is passed in), no `process.exit` in `lib/`, no side
   effects at require time (no disk reads, no network).
6. **Don't edit code while rated games are running.** The previous bot ran 12 different code versions
   inside one session and the results are unattributable. Stop the loop, change, test, restart.
7. **`archive/legacy-2026-09-19/**` is old data kept for reference. Live code never reads it.**

---

## 3. Commands

```bash
npm install
npm test                      # node --test, all offline

npm run book:build            # (re)seed memory/book.json from data/corpus/battles.jsonl
npm run eval                  # one-round evaluation over 9,020 real recorded shops
node tools/eval_matches.js    # whole-match evaluation vs the mock arena; --old = previous objective
node tools/eval_season3.js --games 2 --seeds 101,103,107,109,113 --folds 5 --budget 200  # 50 paired S3 mock matches per arm
node tools/merge_book.js <other book.json>   # fold another instance's opponent book in (idempotent)
node tools/seed_s3_book.js --out /path/to/new-book.json  # extract S3 public replay boards to a NEW book
node tools/bootstrap_s3_book.js  # stopped installation: seed S3 only if no S3 observations exist
node tools/eval_recent.js --archive /path/to/records.tgz --limit 100  # chronological paired shop evaluation
node tools/loss_audit.js --archive /path/to/records.tgz               # read-only rated-loss audit
node tools/repair_book_archive.js --records-dir /path/to/extracted-root --out /path/to/repaired-book.json
node tools/verify_archive_battles.js /path/to/extracted-root    # replay complete archived battles
node tools/verify_s3_public.js  # diagnostic public S3 replay; seats/captains inferred from frames
node tools/verify_live_practice.js --seed 20260921 --games 2  # real anonymous practice, isolated local files

npm run play:dry              # read the live shop and plan; no arena POST
npm run play -- --once --start # ONE RATED MATCH — spends real rating
npm run play -- --games 15 --start
node driver/play_session.js --games 0        # opens its own Chrome, waits for sign-in, plays forever
npm run climb                 # batches of play_loop + rank checks until top-N, then stops
npm run rank                  # exit 0 if in top CLIMB_TOP_N, 10 if not, 2 on error
npm run mcp                   # stdio MCP server
```

`npm test`, `book:build`, `eval`, `eval_matches`, `eval_season3`, `merge_book`, `eval_recent`, `loss_audit`, and
`repair_book_archive`, and `verify_archive_battles` use local data only. `book:build` and
`merge_book` write `memory/book.json`;
`repair_book_archive` writes only the requested output path and refuses to overwrite its input.
`seed_s3_book.js` writes only a new requested output path; use `merge_book.js` to add its
observations to `memory/book.json`.
`merge_book` preserves observation counts above the retained timestamp limit. If overlapping
truncated histories cannot be merged exactly, it refuses the merge; obtain full records instead.
`eval_recent`, `loss_audit`, and `repair_book_archive` refuse Season 3 telemetry because their
historical reconstruction does not retain all item/captain inputs. `verify_live_practice` makes
anonymous practice requests, checks shop actions and battle frames, and never changes rating.
`book:build` replaces the newer repaired book with the older corpus seed; use it only when that
replacement is intended.
`play:dry` reads the live account and may update local catalog,
book, and logs, but sends no arena POST. `rank` reads live account data without playing. The play
and climb commands play rated matches; the MCP server has both read-only tools and a mutating
`arena_act` tool. `npm install` may access the package registry.

`node --test test/` does **not** work on Node 25 (the runner treats the positional as a file). Use
`npm test` or `node --test 'test/*.test.js'`.

---

## 4. Architecture

```
observe ─► shop_model.normalize ─► captain/relic drafts (S3/S4) ─► target.build ─► planner.planStep ─► act
                                                 └► seatingActions ─► endShop
battle  ─► book.inferGhost ─► book.record (S1/2)
result  ─► public replay board/item enrichment ─► book.record (S3/S4, with frame fallback)
```

| module | job |
|---|---|
| `lib/sim.js` | the battle model, checked against server traces. Deterministic: seeds 101/202/303 by round. |
| `lib/season4.js` | pure S4 kit definitions, fusion recipes, captains, relic IDs and combat-caption metadata |
| `lib/season4_pool.js` | lazy public-board prior for an S4-empty book; never seeds user memory |
| `lib/catalog.js` | the 279-bot catalog (S1–S4), 27 items, unlock pools, arena-unit → sim-unit |
| `lib/shop_model.js` | a **pure** model of the server's shop reducer, for look-ahead. No I/O. |
| `lib/book.js` | opponent book at `memory/book.json`; `inferGhost` recovers the enemy board (honey included) from battle frames, accepting both recorded opening captions |
| `lib/public_history.js` | Bounded public-history polling, defensive replay learning, crash-safe receipts, and attack/defense rating reports. |
| `lib/target.js` | the weighted set of enemy boards every decision is scored against |
| `lib/opponent_model.js` | bounded outgoing-queue observations and recent forecast calibration; pure functions |
| `lib/planner.js` | **the only module that decides anything** |
| `lib/arena.js` | the rated API: 409 is a *conflict*, 429/5xx back off, dry run sends nothing |
| `lib/cdp.js` | browser transport (attach to a debug port, else launch our own Chrome) |
| `lib/telemetry.js` | one append-only JSONL per day in `data/log/` for match events; the book separately stores opponent boards. |
| `driver/play_loop.js` | turns planner output into server actions, safely. No strategy here. |
| `driver/play_session.js` | one process: open Chrome, wait for sign-in, dry run, then play |
| `driver/climb_loop.sh` | batches + rank checks, with a lock and backoff |
| `test/mock_arena.js` | the same interface as `lib/arena.js` on top of the real shop reducer, the real sim and corpus ghosts — the whole loop runs offline and deterministically |

### The planner, in detail

- **Value of a board** = its score against a weighted **target** of enemy boards, maximised over seat
  orders (`sim.bestSeating`). Win 1, draw 0.5, loss 0 — except in the final round, where the value of
  a draw depends on the series score (at 1-0 a draw wins the match; at 0-1 it loses it).
- **Round 0** (usually 10 gold, empty board, three commons, opponent usually hidden): compare
  current offers with keeping some and rerolling, then fill. The affordability invariant is
  `gold − current reroll cost ≥ 3 × empty seats`. The old one-reroll limit applies to an unmodified
  10-token shop; Scout and Recruiter can allow a second reroll while still filling the board.
- **Captain draft:** compare the three offered captains through sampled shop continuations and
  simulated fights. It is an estimate over unknown future offers, not a fixed captain ranking.
- **Rounds 1–2**: a greedy search over feed / equip / buy-into-empty / sell-then-buy / reroll, with a
  **two-step look-ahead** (the best few single moves get a follow-up look).
- **Match-level objective at round 0 only:** predict the current fight and later rounds, then
  combine their outcomes with `matchValue`. S3 spends future income in a bounded sampled shop
  continuation before evaluating later boards. S1/S2 retain the older carry-only approximation;
  `futureMode: 'carry'` selects it for S3 comparisons. Future predictions are blended 50% with
  an even win/loss prior. The rollout is approximate, not an exhaustive game solver.
- **Attack and defense:** when recent defensive context exists, purchases and seating maximize
  attacking match points plus estimated defensive exposure times defensive match points. The
  saved board is simulated on the ghost side. Exposure uses the past hour of the public ledger,
  adjusted for the observed relative Elo factors and ten zero-defense pseudo-matches. Missing
  or ambiguous defensive metadata is excluded. `defenseObjective: false` selects the old ties-only
  behavior for comparisons. See the September 23 report for the model's assumptions.
- **Freeze:** S4 Freezer compares all bot-offer freeze masks using sampled next-shop purchases.
  Other captains and item freezes remain outside the strategy search; old S1/S2 evaluations
  found no selected bot freezes.
- **Re-seats every shop.** Moves are free.
- **Checks before stopping.** If the search reduced its opponent target, the planner checks every
  exact single move against the full target before ending. This bounded pass can exceed the soft
  search budget; it does not add more reroll sampling or two-step search.

### The opponent book — the only thing that "learns"

The book is the bot's learned opponent state. Boards remain under `(season, handle, round)`,
with five distinct boards per key. S3 additionally keeps 400 outgoing observations per round,
independent of that eviction. The population prior uses the last 100 outgoing observations within
one hour; incoming defenses do not set outgoing queue frequencies. Old books without this sample
warm up from the latest same-season sightings with equal weights. No previous-season blend is used.
S3 handle confidence is fitted to recent component forecast errors, with the historical R0 50%
and R1/R2 75% weights as shrinkage priors. R0 uses a global window; later rounds additionally use
up to 32 observations of the named opponent. Samples expire, and confidence can recover after
errors. The prediction is recorded before battle, and learning waits for its outcome. S1/S2 keep
the old fixed weights and frequency pool. `populationPolicy: 'frequency'` and `calibrate: false`
provide explicit comparison controls. The previous opponent persists in `memory/last_opponent.json`.
Season 3 book writes wait for
the result and use the completed public replay's exact opponent board, including items, when its
match and handle can be matched. If that read is unavailable, the frame-inferred board is used;
captain metadata is retained when present. An unavailable public replay is retried once. On a
graceful stop or driver error, buffered completed rounds are saved using frame evidence once the
handle is known. An explicit live rival captain overrides a historical captain during simulation.
Within the handle's share, Season 3 uses its most recently observed board; older lineups remain
stored. Seasons 1/2 keep frequency weighting. `bookPolicy: 'frequency'` and the explicit decay
override support comparisons. This policy also reaches captain drafts and future-round targets.
The driver also polls the signed-in account's public S3/S4 history at startup and match boundaries,
at most once per minute. It backfills up to 30 days in bounded pages, learns the attackers from
both won and lost defenses, and retries unavailable replays. Observations use the match's played
time, so fetching an older defense cannot replace newer knowledge. `history` telemetry and
`node tools/rating_report.js` report attacks, defenses and combined Elo over the same fetched
window, with pending/backfill counts. Polling is disabled for anonymous practice. The learned coefficients mix simulator forecasts; they do not rewrite card abilities or strategic rules.

Measured on 280 live matches against 13 distinct opponents (2026-09-19):

| meeting with a given opponent | matches | match score |
|---|---|---|
| 1st | 13 | 0.808 |
| 2nd | 13 | 1.000 |
| 3rd–5th | 39 | 0.987 |
| 6th+ | 215 | 0.965 |

---

## 5. Game rules the code depends on

The historical rules were verified against the site's client bundle and ~11k recorded battles;
Season 3 additions come from the [live rules](https://thursdayarena.com/rules.md), public catalog,
and anonymous practice. Current additions and validation limits are in
[`docs/SEASON4.md`](docs/SEASON4.md). Historical details are in
[`docs/ENGINE_SHOP.md`](docs/ENGINE_SHOP.md) and [`docs/ENGINE_BATTLE.md`](docs/ENGINE_BATTLE.md);
action schemas in [`api/ACTIONS.md`](api/ACTIONS.md).

- **Board:** at most 3 units, seat 0 is the front, and the **back is the LAST index** (a 2-unit
  board's back is index 1). **Buys append to the END**; sells shift later indices down.
- **Economy:** baseline 10 tokens each shop; price by rarity 3/4/5/6/7/8. Sell +1, reroll −1,
  feed −3; move, freeze and endShop are free. Banker carries up to 5; Recruiter adds 1 token,
  Scout's first reroll is free, and Chef reduces food cost to 2.
- **Shop:** a reroll re-rolls the **food** as well as the unfrozen offers. Frozen offers persist
  through rerolls and into later rounds. Offers are drawn with replacement from bots with
  `unlockTurn ≤ round+1`. Each legendary has **half** the ordinary per-bot offer weight and each
  mythic one quarter; mythics are limited to one per team. `shop_model.sampleReroll` uses those
  per-bot weights in round 2. An additional Season 3 item offer can be equipped or frozen; its
  later-round cost and draw odds in the mock are approximations.
- **Food:** apple is a permanent +1/+1; **potato is +2 ATK for this battle only and destroys honey**;
  honey is a flag that summons a 1/1 Drone at the fainted unit's seat and adds no HP. The exclusion
  runs both ways. Neither honey nor potato can be applied twice to the same unit; apple always can.
- **Series:** at most 3 rounds (index 0–2), ending at 2 round-wins or after round 2. A drawn round
  still consumes a round, so **1-1 and 0-0 are drawn matches**. Round 2 is always final.
- **Battles are deterministic**: the seed is fixed per round. There is no probability to sample.
- **Hot seat:** from the second exchange onward, units in that seat lose 1 HP directly. This does
  not credit the previous attacker with a knock-out or trigger its `drain` heal.
- **S3 overtime:** from exchange 26, all living bots lose `exchange - 25` HP directly before attacking; the damage increases each exchange. Recorded replay tests cover this.
- **40-exchange cap:** if both teams remain, compare total HP, then total ATK, then draw. This is
  implemented from the official rules; no recorded battle has reached the cap.
- **Season 2** (since 2026-09-19T07:00Z) adds 9 bots and **seat rules**: `state.seats` holds all
  three from round 0, `seatShop` reveals one more per round, seat *i* is active from round *i* on,
  and the rules apply to both teams.
- **Season 3** adds 98 catalog bots, 19 items, crews, captains and mythics. Captain selection is a
  `shop`-phase `pickCaptain` action before the first purchase. Crew bonuses trigger after seat
  rules and before kits. See [Season 3 notes](docs/SEASON3.md) for exact effects.
- **Season 4** adds fusion, relics, 100 bots, eight items, eight captains and five seats.
  Drafts and ordered fusion candidates are simulated; Freezer can select offer freezes.
  See [S4 implementation and evidence](docs/SEASON4.md).
- **"AI · no ghost" matches** (`state.opponentKind === 'ai'`, handle `"AI"`, no `eloDelta`): the rated
  queue found no ghost. They pay nothing and cost nothing. See §7.
- **Rated ghost selection (Season 3):** aim is rating +23, adjusted by recent results (at most
  70). The server searches saved same-round boards in bands around aim of ±100, ±200, ±400, then
  any rating. It prefers an opponent not yet fought and then the closest rating, with repeat-ghost
  and high-rating exceptions. At the Season 3 top table (both ratings ≥1300), an owner can
  appear in 25 of the last 50 matches and defense uses K=32. Other eligible defenses use K=16
  within a 400-point rating gap. See the
  [live rules](https://thursdayarena.com/rules.md).

---

## 6. Invariants the loop enforces

Each of these came from a review finding or a live failure. Tests assert them.

- One instance at a time (pid lock at `data/play_loop.lock`). **Only a dead pid releases it.**
- **One action at a time.** The envelope each `act()` returns *is* the new state, so the planner never
  plans against a shop the server has moved on from.
- The target is built **once per shop**, not once per action.
- Every planner action is re-checked with `shop_model.legal` before it is sent.
- A **409 means the action did not happen**: refetch, leave the current shop plan, and replan only
  after observing the phase again. The phase may already have become a battle.
- `endShop` goes out only while the phase is still `shop`, and never on a short board that could
  still be filled.
- An **unrecognised phase is re-observed**, never treated as `idle` (the idle branch answers with
  `start`, which would abandon a live match).
- **No pacing-free spinning**: if an outer iteration leaves `(phase, round, version)` unchanged, the
  loop backs off exponentially and gives up after 8 tries with `exitReason: "no_progress"`.
- A result screen is only counted after **this process had an accepted shop action or endShop**
  (`ctx.played`); a result left by a previous batch or another actor after a rejected first action
  is logged as `staleResult` and skipped.
- The live catalog is refreshed at startup and whenever an unresolvable bot appears.
- The enemy board is recorded once per (match, round). At round 0 the handle is hidden, so the
  battle is **buffered** and recorded when the handle appears. Season 3 waits until result to
  enrich with a completed public replay if available. A late server match ID is promoted within
  the same context, preserving the round dedupe set and the last board through R1 or R2.
- A battle reached after a conflicting action or inherited from another process has no confirmed
  copy of our board. Its event carries `inputMissing`, and it is never written to the opponent book.
- Ctrl-C / SIGTERM: save the book, close telemetry, release the lock, close the browser, then die
  **by the signal** (exiting 130 tells bash "handled", and the climb script would launch another
  rated batch).
- Unlimited play has no lifetime iteration cap. A per-match 4,000-step cap resets only after a
  counted completed match; no-progress/unknown-phase guards remain. Explicit `maxSteps` still
  bounds diagnostic runs. Exhaustion returns `max_steps` and a nonzero CLI exit.
- A failed book save retains its pending observations for retry. A malformed or unreadable existing
  book is refused, never silently replaced by an empty one. Only a missing file starts empty.

---

## 7. AI matches

When the matchmaker has no ghost for you, it fields the AI: `opponentKind: "ai"`, handle `"AI"`, and
**no Elo either way**. Measured live: streaks of 10–74 in a row, 1.6–22 minutes, ending on their own
when a ghost appears. The loop therefore:

- plays them out (nothing is at stake, and no unverified mid-match action is needed);
- **never writes them to the book** (the AI's board is not a ghost) and never lets one become
  `prevHandle`;
- does not count them toward `--games` (they are tallied as `aiMatches`);
- waits 10 s before re-queueing, doubling to a 60 s cap over consecutive AI matches, then sends
  `start` and falls back to `restart`. The wait is short **on purpose**: a queue attempt is the only
  way to discover a ghost is back.
- exits with `exitReason: "ai_only"` after 300 in a row, so the climb script backs off.

No client-side change can conjure a ghost. If the pool is empty at your rating, it is empty.

---

## 8. How to verify a change

Nothing ships without numbers. In order of cost:

1. `npm test` — 281 offline tests as of the September 24 S4 update. S4 includes 395 complete-input server
   fights, 101 shop transitions and seven real-driver practice traces (17 fights), plus memory
   and season-rollover checks. The September 24 update adds 1,190 independent live
   winner checks and 1,188 exact traces, six regressions, and 60 defensive round
   reconstructions. Two older complete-input traces differ only in tied knockout
   order; two incomplete-input public traces also remain unresolved.
   The older coverage includes Season 1/2 winner checks for the full corpus
   (10,748 battles), frame checks for selected recorded traces, the shop-model replay
   against 6,373 real recorded shops, planner property tests over seeded random states, and a 30-match
   end-to-end run through the mock arena. Season 3 tests add an official anonymous practice trace
   and local mock coverage. Keep their narrower scope explicit.
2. `npm run eval` — one-round decision quality over 9,020 real recorded shops, scored against the
   enemy boards actually faced, with a leak-free book. Recorded baseline (2026-09-20): **0.95** overall vs the old bot's
   **0.71**. Use `--limit` for a quick pass, `--round-level --one-step` to compare against the
   previous objective.
3. `node tools/eval_matches.js` — whole-match play against the mock arena. `--old` runs the previous
   **objective within the current code**, not a previous code revision. The current mock keeps
   exogenous draws keyed across policies. The historical 1,000-match runs reported **S1 0.916,
   S2 0.899** for the shipped objective versus **0.901 / 0.885** for the previous objective, but
   that older mock used a shared random stream, so those runs were not truly paired; see
   [`docs/HISTORY.md`](docs/HISTORY.md) §6.
   The [paired 2026-09-20 version benchmark](docs/VERSION_BENCHMARK_2026-09-20.md) used the
   corrected mock for the backup and current code: 1,000 matches per season showed no aggregate
   win-rate gain; the late-ID sensitivity check verified that duplicate battle records stopped.
4. `node tools/eval_recent.js --archive /path/to/records.tgz` — paired, chronological shop
   counterfactuals on newer telemetry; `node tools/loss_audit.js` reports rated losses and hindsight
   seat-order rescues from the same archive. Neither plays matches.
   `node tools/eval_season3.js` provides a separate Season 3 paired local mock with handle-disjoint
   public-replay folds; its captain offers and later item economics are mock assumptions, not a
   rated queue estimate.
5. `node tools/verify_live_practice.js --seed 20260921 --games 2 --budget 1500` runs the actual
   driver against the official anonymous practice server with isolated local files. The review
   completed 10 matches (9 W / 1 L), with the final two after runtime fixes both wins. All 21
   recorded fights replay exactly using complete server inputs. This verifies operation and
   sampled engine behavior; it is not a rated or paired old/new policy benchmark.
6. A rated Season 3 evaluation, when explicitly authorized, should start with `--games 1`, then
   inspect `data/log/` and the accepted action sequence. No rated Season 3 evaluation was run for
   the initial update.

A planner change needs a paired comparison on each supported season before claiming a match-score gain.
Use per-match score differences and their uncertainty; the old blanket ±0.018 estimate does not
describe paired differences or serial learning within each seed.

---

## 9. Where the evidence lives

| file | what it is |
|---|---|
| `docs/ENGINE_BATTLE.md` | the battle engine reverse-engineered from the client bundle + ~10k recorded battles: trigger order, every kit, seat rules, RNG |
| `docs/ENGINE_SHOP.md` | shop, economy, offer pools, food odds, series rules, API semantics |
| `docs/SEASON3.md` | historical Season 3 rules, protocol fields and evidence limits |
| `docs/SEASON4.md` | current fusion/relic/card implementation, planning and verification limits |
| `docs/CODE_REVIEW_2026-09-20.md` | current code review, learning/data fixes, replay comparison and live practice verification |
| `docs/LIVE_RECORDS_2026-09-21.md` | supplied live Season 3 audit: 119 W / 14 L / 4 D, verified learning, simulator errors in the original version, recency and stopping-policy evidence |
| `docs/LIVE_FIXES_2026-09-21.md` | subsequent implementation and tests resolving the new live battle discrepancies and premature shop stop |
| `docs/STRATEGY.md` | how the strategy was derived: per-round policies, unit tier lists, what each lever is worth |
| `docs/HISTORY.md` | what happened and why — the old bot, the audit, the rewrite, the live results |
| `docs/RECENT_RECORDS_2026-09-20.md` | supplied archive repair, full replay, loss audit and evaluation limits |
| `docs/audit/*.md` | the seven original audit reports (158 verified findings) and the rewrite contract |
| `data/corpus/battles.jsonl` | 10,748 recorded battles with exact inputs — the simulator's test set |
| `data/corpus/shops.jsonl` | 9,730 real recorded pre-shop states — the planner's test set |
| `data/corpus/s3_public_matches.jsonl` | fixed sample of public Season 3 completed match details; replay inputs may omit captains/seats |
| `tools/seed_s3_book.js` | derives both players' Season 3 round boards from public replays into a separate book; 334 retained observations across 116 keys were merged locally |
| `data/corpus/s3_public_matches_review_2026-09-20.jsonl` | second disjoint sample of 100 public Season 3 matches, added during review |
| `data/corpus/s3_live_battles_2026-09-21.jsonl` | 337 exact public board/frame records with independently logged seats/captains, all included in automated regression tests |
| `tools/verify_s3_public.js` | diagnostic public replay: 497/497 winners and 494/497 full traces across both samples; missing seats/captains reconstructed from the same frames, not independent predictions |
| `test/fixtures/season3-practice-full-matches-2026-09-20.json.gz` | complete auth-free request/response traces for 10 official practice matches; 115 shop comparisons and 21 exact battle traces |
| `tools/eval_season3.js` | paired handle-disjoint Season 3 mock evaluation; never sends rated actions |
| `archive/legacy-2026-09-19/` | the old bot's data: 514 raw climb logs, 5,420 strategy files, the old stores |

A full pre-rewrite backup of everything is at `../thursday-arena-pre-rewrite-20260919.tgz`.

---

## 10. Repo layout

```
lib/      sim.js catalog.js shop_model.js book.js target.js planner.js arena.js cdp.js telemetry.js
driver/   play_loop.js play_session.js climb_loop.sh check_rank.js
tools/    build_book.js eval_planner.js eval_matches.js eval_recent.js loss_audit.js merge_book.js
          repair_book_archive.js verify_archive_battles.js verify_s3_public.js verify_live_practice.js
          seed_s3_book.js eval_season3.js
test/     mock_arena.js *.test.js fixtures/
data/     catalog.json items.json corpus/{battles,shops,s3_public_matches}.jsonl log/*.jsonl
memory/   book.json  (last_opponent.json is created at runtime)
docs/     SEASON3.md ENGINE_BATTLE.md ENGINE_SHOP.md STRATEGY.md HISTORY.md audit/
api/      ACTIONS.md
mcp/      server.js README.md
archive/  legacy-2026-09-19/**
```

Git history begins with the reviewed Season 4 import on 2026-09-23; earlier versions
are retained in the documented backups and evidence archives. Back up before large changes.

---

## 11. Recent fixes and known limits

- **September 24 S4:** shop relic observations are tagged by round; stale relics no
  longer override learned current-round combinations. Corrected forecasts have a
  version, and old calibration samples stay stored without influencing current
  confidence. Recent defense metadata refreshes once after the engine update. Book
  imports preserve outgoing samples. All 1,066 latest-session fights now match
  frame for frame. See [the fixes and comparisons](docs/LIVE_FIXES_2026-09-24.md).

- **September 23 Season 4:** all new card effects, fusions, relics, captains, items and seats are
  implemented and exercised with official anonymous practice. Opponent memory retains fusion
  parents/relics; season rollover preserves the complete prior history ledger. Two of 119
  incomplete-input public traces remain unexplained. See [S4 evidence](docs/SEASON4.md).

- **September 23 supersedes the earlier S3 defaults below:** recent outgoing-queue sampling,
  calibrated confidence, sampled future purchases and an exposure-weighted defense objective
  replace lifetime population counts, fixed confidence, unchanged future boards and defense-only
  tie breaks. All 22 new frame discrepancies are fixed. See
  [implementation, comparisons and limits](docs/ADAPTATION_FIXES_2026-09-23.md).
  Earlier dated bullets describe historical releases, not today's active policy.

- The [afternoon counter review](docs/COUNTER_RESEARCH_2026-09-21.md) audits the new 562-match
  archive. All 1,358 new complete-input fights reproduce frames and winners, bringing the three
  supplied S3 samples to 4,446. New fixes cover kitless silence, last-standing/KO ordering,
  Glitter Bomb, copied Hotfix, and additive kit/item splash. All new attacking-round learning
  events, including rounds from lost matches, are present exactly once. No final remote book
  was supplied, so the audit verifies logged learning and reconstructed decision inputs.
- `lib/counter_model.js` is a contextual mathematical analysis API. Its robust comparison bounds
  the payoff difference over a specified finite TV uncertainty set; it is not a universal game
  guarantee. The atlas is diagnostic only. Extra known-offer combination search is opt-in via
  `plannerOpts.deepShop: true`; recorded-shop gains did not establish a whole-match gain.
  The rejected bounded defense policy lives in `tools/research_counter_finish.js`, outside the
  live driver. See the review for all experimental results and the shipped configuration.

- The [defense fixes](docs/DEFENSE_FIXES_2026-09-21.md) reproduce all 3,088 complete-input S3
  recorded fights, remove the healthy-session lifetime cap, and ingest public defensive results.
  `memory/public_history.json` is account/season-bound and must be preserved with the entire
  memory directory. Public observations use persistent book receipts to survive retries/restarts.
  Every learned defensive round is also logged with its board, items, observed timestamp and ID.
- S3 seating breaks equal full-target match scores using recent defensive attackers; the bot is
  simulated on the ghost side under the observed attacker's reconstructed seats and captain.
  Ambiguous seat metadata is excluded from that target. At R2 only, a bounded exact move pass
  can spend remaining tokens to improve this tie-break, then ordinary round score, without
  reducing the full current-target match score. `finishTies: false` disables it for comparisons.
- A 900-match lifecycle test crosses the former cap. The new 100-pair-per-season mock comparison
  tied in every season; no match-win-rate gain is established. Chronological final-shop checks
  found two improved attacking rounds, none worse, and unchanged scores in 321 later defensive
  rounds. Those are counterfactual checks, not a rated improvement estimate.

- The September 21 fixes resolve all battle discrepancies in the new live sample: **337/337
  winners and full traces**, up from 333 winners and 306 traces. They correct silence/aura
  interactions, Megaphone targeting and venom, Hotfix debuff auras, effect order and captions.
  The planner now checks the full target before stopping a reduced search. The new installation
  bootstrap preserves an existing S3 book and seeds only an S3-empty book. Tests use copies of
  the supplied records. See [`docs/LIVE_FIXES_2026-09-21.md`](docs/LIVE_FIXES_2026-09-21.md).
- The S3 mock now exposes completed public replays, so local learning retains equipment as it
  does in live play. Earlier S3 benchmarks used the frame fallback. Do not mix those results
  without noting the changed learning model.
- The complete September 21 version scored 79 W / 16 L / 5 D versus the original's 77 W / 17 L /
  6 D in 100 paired S3 mock games (score delta +0.015, seed-clustered 95% interval
  −0.0266 to +0.0566). A separate 100-pair frequency/latest comparison with seeded, handle-disjoint
  folds tied at 91 W / 6 L / 3 D. These are local measurements, not established rated win-rate gains.
- `bloom` and `hand_off` (S2 shop-trigger kits) are modelled at expected value, which can make board
  stats fractional. The live loop re-observes the real board; never persist an EV board into the book.
  The one non-integral case is resolved before it reaches the sim (`shop_model.simUnitsOutcomes`).
- Before the late-ID fix, the 2026-09-20 archive showed duplicate R1/R2 battle events and book
  writes when a `local_*` ID became a server ID. The driver now preserves the match context and
  emits one `match_start`, one `match_identified`, and one complete battle per round. A separate
  repair removed **1,072** uniquely identified duplicate observation stamps from a **copy** of the
  archived book; `tools/repair_book_archive.js` never edits the supplied archive.
- The round-0 target gives the previous opponent 50% weight, based on older repeat-heavy queues.
  After the 2026-09-20 matching change, the previous opponent recurred in only 13 of the last 197
  recorded rated matches. Small chronological training comparisons did not establish a better
  weight, so the code keeps 50% at R0 and 75% at R1/R2. See
  [`docs/RECENT_RECORDS_2026-09-20.md`](docs/RECENT_RECORDS_2026-09-20.md).
- The 2026-09-20 opening caption change (`The teams square up` → `The fight starts`) caused four
  full-input archive events to miss enemy honey. `book.inferGhost` now accepts either caption;
  those four boards were already outside the archived book's five-board retention window.
- Season 3 item costs beyond the observed common offer, item offer weights, and fully hidden
  captain/seat inputs in public replays are not established by the published data. Do not turn
  Season 3 mock results into rated win-rate claims without measuring real Season 3 matches.
- The 2026-09-20 archive now replays **5,454/5,454** complete-input battles frame for frame after
  the Hot seat knock-out credit fix. The 40-exchange HP/ATK tiebreak is implemented from the
  official rules, but remains unverified against a recorded battle because none reached the cap.
- The original Season 2 strategy estimates rest on a few hundred matches against 13–16 opponents.
  Do not quote those estimates as settled under the current ghost selection.
- Every strategy figure is measured against ghosts rated ~1,000–1,100. Performance against a top-10
  pool is unmeasured.
