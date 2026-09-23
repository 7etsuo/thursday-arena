# Thursday Arena bot

> **Working on this code (human or AI)?** Start with [`AGENTS.md`](AGENTS.md) — the canonical
> handbook — then [`docs/HISTORY.md`](docs/HISTORY.md) for why it looks like this.

The supplied 2026-09-20 records, repair and replay checks are documented in
[`docs/RECENT_RECORDS_2026-09-20.md`](docs/RECENT_RECORDS_2026-09-20.md).
**This build supports Seasons 1–4.** Current rules, fusion/relic planning and validation limits
are in [Season 4 notes](docs/SEASON4.md). [Season 3 notes](docs/SEASON3.md) retain the earlier rules.

The latest learning, planning and simulator fixes for the supplied Season 3 logs are in
[`docs/ADAPTATION_FIXES_2026-09-23.md`](docs/ADAPTATION_FIXES_2026-09-23.md).
The earlier [counter review](docs/COUNTER_RESEARCH_2026-09-21.md) covers the prior 562-match archive.
The [mathematical counter model](docs/COUNTER_MODEL.md) and
[historical 179-card atlas](docs/results/counter-model-2026-09-21/atlas/index.html) explain
contextual matchups and the limits of opponent exploitation.


A simulator-driven bot for [thursdayarena.com](https://thursdayarena.com). Every decision — which
bots to buy or fuse, which relic to choose, what to feed or equip, whether to reroll, and how to seat the board — is scored by replaying the
battle against a weighted set of enemy boards. There are no archetypes, no name lists, no preset team recipes
and no threat formulas; the simulator decides everything.

Node 25, CommonJS, no runtime dependencies beyond `playwright-core` (CDP transport),
`@modelcontextprotocol/sdk` and `zod` (MCP server only).

## Repository and installation

This private repository includes the application, tests, research evidence, historical records,
and a snapshot of this workspace's memory and logs. For an existing bot installation, use the
reviewed package in [Releases](https://github.com/7etsuo/thursday-arena/releases) and follow
[the installation instructions](docs/INSTALL_SEASON4.txt), preserving that computer's entire
memory and logs. The repository's snapshot must not replace the bot's current learned data.
Install dependencies with `npm ci` on Node 25; they are not checked into Git.

## How it works

```
observe  ->  shop_model.normalize   the shop as a pure, replayable state
             planner.chooseCaptain captain draft, when present
             planner.chooseRelic   Season 4 relic draft, when present
             target.build           a weighted set of boards the enemy might field
             planner.planStep       one action at a time, each scored by lib/sim.js
         ->  act                    one action, then re-observe
             ...                    until nothing improves
             seatingActions         moves are free, so always re-seat last
         ->  endShop
battle   ->  book.inferGhost        recover the enemy board from the frames, honey included
result   ->  book.record            use completed public replays for S3/S4 items and fusion parents
boundary ->  public_history         learn defensive opponents; report both sides of rating
```

| module | job |
|---|---|
| `lib/sim.js` | the battle engine. Matches **10,748/10,748** historical Season 1/2 recorded winners; the historical audit validated 10,065 battles frame for frame, and the 2026-09-20 archive replay validates another **5,454/5,454** complete-input battles frame for frame. Season 3 coverage is newer and narrower; see [Season 3 notes](docs/SEASON3.md). |
| `lib/catalog.js` | the 279-bot catalog (seasons 1–4), 27 items, unlock pools, state-unit → sim-unit |
| `lib/shop_model.js` | a pure model of the server's shop reducer, for look-ahead |
| `lib/book.js` | the opponent book at `memory/book.json`, plus `inferGhost` (accepts both recorded opening captions when recovering honey); S3 result handling prefers exact completed replay boards with item data |
| `lib/public_history.js` | Polls public results, learns exact attacking boards from ghost defenses, and reconciles both roles in one rating ledger. |
| `lib/opponent_model.js` | Bounded recent outgoing observations and calibration of simulator forecasts. |
| `lib/target.js` | the weighted board set each decision is scored against |
| `lib/planner.js` | the only thing that decides anything |
| `lib/counter_model.js` | contextual payoff matrices and finite-scenario baseline-loss certificates for analysis |
| `lib/shop_search.js` | optional bounded search over deterministic known-offer combinations; disabled by default |
| `lib/arena.js` | the rated API over CDP: 409 is a conflict, 429/5xx back off, `--dry` sends no arena POST |
| `lib/telemetry.js` | one append-only JSONL per day at `data/log/` |
| `driver/play_loop.js` | turns planner output into server actions, safely |

## Run

```bash
npm test                    # node --test, all offline

npm run book:build          # seed memory/book.json from data/corpus/battles.jsonl
npm run eval                # one-round evaluation over 9,020 real recorded shops
node tools/eval_matches.js  # whole-match mock evaluation (--old selects the previous planning objective)
node tools/eval_season3.js --games 2 --seeds 101,103,107,109,113 --folds 5 --budget 200  # paired S3 mock
node tools/eval_recent.js --archive /path/to/records.tgz --limit 100  # paired recent-shop evaluation
node tools/loss_audit.js --archive /path/to/records.tgz               # rated-loss audit
node tools/repair_book_archive.js --records-dir /path/to/extracted-root --out /path/to/repaired-book.json
node tools/verify_archive_battles.js /path/to/extracted-root      # replay complete archived battles
node tools/verify_s3_public.js                                     # S3 public replay diagnostic
node tools/verify_live_practice.js --seed 20260921 --games 2        # official anonymous practice; no rating
node tools/seed_s3_book.js --out /path/to/new-book.json             # build a separate S3 public-replay seed
node tools/bootstrap_s3_book.js                                  # stopped bot: seed only if S3 memory is absent

npm run play:dry            # read the live shop and plan; no arena POST
npm run play -- --once --start # one rated match
npm run play -- --games 15 --start
npm run climb               # batches until driver/check_rank.js reports a top-N place
npm run rank                # leaderboard position
npm run mcp                 # stdio MCP server, see mcp/README.md
```

`npm test`, `book:build`, `eval`, `eval_matches`, `eval_season3`, `eval_recent`, `loss_audit`, and
`repair_book_archive`, and `verify_archive_battles` use local data. The repair tool writes the
requested output file and refuses to overwrite its input. `book:build` replaces the newer repaired
`memory/book.json` with the older corpus seed, so use it only when intentionally rebuilding that
file. `seed_s3_book.js` writes a new file from the checked-in public replay sample; the local
opponent book has already received 334 retained S3 observations across 116 keys from that sample.
`eval_recent`, `loss_audit`, and `repair_book_archive` accept historical Season 1/2 records only;
they refuse Season 3 inputs whose items and captains they cannot reconstruct correctly.
`verify_live_practice` makes real anonymous practice requests and writes isolated temporary
book/log files. It checks shop actions and battle frames against the official server.
`play:dry` reads the live account and writes local catalog/book/log files,
but sends no arena action. `rank` is a live
read-only check. The play and climb commands can change rating; the MCP server includes the
mutating `arena_act` tool.

`node --test test/` does **not** work on Node 25 — the runner treats the positional as a file, not
a directory. Use `npm test` (`node --test`) or `node --test 'test/*.test.js'`.

Auth is a Clerk session in a **dedicated** Chrome profile (`ARENA_PROFILE`, default
`~/.config/google-chrome-arena`), signed in once by hand. `lib/cdp.js` attaches to a debug port if one
exists and otherwise launches its own Chrome — and refuses the user's real profile outright
(see [`docs/HISTORY.md`](docs/HISTORY.md) §4).

## Layout

```
lib/      catalog.js sim.js shop_model.js book.js target.js planner.js arena.js cdp.js telemetry.js
driver/   play_loop.js play_session.js climb_loop.sh check_rank.js
tools/    build_book.js eval_planner.js eval_matches.js eval_recent.js loss_audit.js merge_book.js
          repair_book_archive.js verify_archive_battles.js verify_s3_public.js verify_live_practice.js
          seed_s3_book.js eval_season3.js
test/     mock_arena.js sim.test.js shop_model.test.js book.test.js planner.test.js loop.test.js evaluation.test.js repair_book_archive.test.js
data/     catalog.json items.json corpus/{battles,shops,s3_public_matches}.jsonl log/*.jsonl
memory/   book.json              last_opponent.json is created at runtime
docs/     SEASON3.md ENGINE_BATTLE.md ENGINE_SHOP.md STRATEGY.md HISTORY.md audit/
api/      ACTIONS.md                           action schemas, costs, phases, series, seat rules
mcp/      server.js README.md
archive/  legacy-2026-09-19/**                 old data, never read by live code
          AGENTS.md                            the canonical handbook for any coding agent
          README.md                            this file
          CLAUDE.md / .cursor/rules/           thin pointers to AGENTS.md
```

`test/mock_arena.js` implements the same interface as `lib/arena.js` on top of the real shop
reducer, the real battle sim and ghosts drawn from the corpus, so the whole loop runs offline and
deterministically.

The `--old` flag in `tools/eval_matches.js` changes the planning objective within the current
code; it does not load an earlier code version. The original 1,000-match objective comparison used
a shared random stream, so equal starting seeds did not guarantee identical later shops or
opponents. See [the historical results](docs/HISTORY.md#6-the-match-level-and-two-step-pass-2026-09-20).
The [2026-09-20 paired version benchmark](docs/VERSION_BENCHMARK_2026-09-20.md) ran the
pre-improvement backup and current code through 1,000 local mock matches per season; it found no
aggregate win-rate gain, while a separate late-ID check confirmed the duplicate-record fix.

## Engine facts worth knowing before changing anything

- Battles are deterministic: the seed is fixed by the round. There is no probability to sample.
- A shop starts with 10 tokens. Banker may carry 5 unspent tokens, Recruiter adds 1, Scout's first
  reroll is free, and Chef reduces food cost by 1. With none of these modifiers, three commons cost
  9 and R0 affords one paid reroll while filling the board.
- **Buy appends to the end of the board.** Sell shifts the later indices down.
- The back seat is the **last** index, not index 2.
- Apple is permanent +1/+1; potato is +2 ATK for this battle only and destroys honey; honey is a
  flag that summons a 1/1 Drone at the fainted seat — and honey fed to a potatoed unit strips the
  potato and its +2 ATK just as potato strips honey. The exclusion runs both ways.
- A match is at most 3 rounds and a drawn round still consumes one, so 1-1 and 0-0 are drawn
  matches and round 2's value of a draw depends on the score.
- Each legendary has half the ordinary per-bot offer weight. Season 3 mythics cost 8, have one
  quarter weight, and are limited to one per team. Season 3 also adds crew bonuses, captains, and
  item equipment; see [Season 3 notes](docs/SEASON3.md).
- Hot seat's direct HP loss does not give the previous attacker knock-out credit. At the
  40-exchange cap, the simulator compares remaining total HP and then total ATK; no recorded battle
  has reached that cap.

Current rules are summarized in [`docs/SEASON4.md`](docs/SEASON4.md) and
[`api/ACTIONS.md`](api/ACTIONS.md). The detailed [`docs/ENGINE_SHOP.md`](docs/ENGINE_SHOP.md) and
[`docs/ENGINE_BATTLE.md`](docs/ENGINE_BATTLE.md) retain the historical Season 1/2 audit.

The driver keeps one match context when the server reveals an ID in R1 or R2, so each round is
logged and learned once. A repair of a **copied** 2026-09-20 archive book removed 1,072 uniquely
identified duplicate observation stamps from the earlier driver behavior.
