# Integration report — Thursday Arena bot rewrite

> **Historical integration report (2026-09-19, before the first live run).** The test count,
> 80-bot catalog, mock results and open issues below describe that integration snapshot. The
> live path was subsequently exercised, the catalog grew to 81 bots, and the corpus test reached
> 10,748/10,748 battle winners. `play:dry` observes the live arena and may write local catalog/telemetry; “dry”
> means it sends no mutating action. For current behavior see [AGENTS.md](../../AGENTS.md) and
> [HISTORY.md](../HISTORY.md).

INTEGRATOR pass over the four builders' work. Everything below was produced by running the code in
this session; nothing is quoted from the builders' reports without re-running it. No Chrome/CDP, no
authenticated call, no `npm run play/climb/rank/mcp` against the live arena.

Repo: `/home/tetsuo/grok/thursday-arena` · Node v25.9.0 · 5,930 lines of live code + tests.

---

## 1. What the system does, end to end

```
observe ──▶ shop_model.normalize(state)        the shop as a pure, replayable value
            target.build({book, handle, …})    a weighted set of boards the enemy might field
            planner.planStep(S, ctx)           ONE action, chosen by replaying the resulting board
        ──▶ arena.act(action)                  ... the returned envelope IS the new state
            (repeat until nothing improves)
            planner.seatingActions             moves are free, so re-seat last
        ──▶ arena.act({type:'endShop'})
battle  ──▶ book.inferGhost(frames)            recover the enemy board, honey included
            book.record(...)                   so the next match against this handle is not a guess
result  ──▶ telemetry + memory/last_opponent.json, then restart
```

**The single idea.** There is exactly one evaluator. A candidate board is replayed through
`lib/sim.js` against every board in the target, and its score is the weight-normalised mean of
win 1 / draw 0.5 / loss 0. Buys, feeds, sells, rerolls and seat orders are all ranked by that one
number. There is no second scoring path, no archetype table and no hand-tuned weight.

**Why it can be that simple.** Battles are deterministic — the seed is fixed by the round — so
"probability of winning" is not a thing to estimate; it is a weighted count over the boards the
opponent might bring. All the uncertainty lives in the target, which is why the book matters more
than the search.

| module | job | key fact |
|---|---|---|
| `lib/sim.js` | battle engine | replays 9,730/9,730 recorded battles exactly |
| `lib/catalog.js` | 80 bots (S1+S2), unlock pools | pools 36/56/72 (S1), 38/61/80 (S2) |
| `lib/shop_model.js` | pure model of the server's shop reducer | 6,373 real shops replay with 0 mismatches |
| `lib/book.js` | opponent book + `inferGhost` | 9,730/9,730 enemy boards recovered, honey included |
| `lib/target.js` | the weighted board set | R0 50/50 prev-opponent/pool; R1-R2 75/25 handle/pool |
| `lib/planner.js` | the only module that decides | one evaluator, R0 keep-k + one reroll, R1/R2 greedy |
| `lib/arena.js` | rated API over CDP | 409 = conflict, 429/5xx back off, dry run sends no POST |
| `lib/telemetry.js` | one JSONL per day | the only store that writes match data |
| `driver/play_loop.js` | planner output → server actions, safely | one action at a time, lock, buffered R0 record |

---

## 2. Measured numbers

### 2.1 Test suite — 105/105

```
$ npm test                       # = node --test
ℹ tests 105  ℹ pass 105  ℹ fail 0  ℹ duration_ms 13691.80
```

`node --check` is clean on all 20 JS files; `bash -n driver/climb_loop.sh` is clean.

Per file: sim 19, shop_model 20, book 25, planner 23, loop 17.

### 2.2 Offline strategy evaluation — the headline

`tools/eval_planner.js` replays every usable real pre-shop state from `data/corpus/shops.jsonl`,
builds the target from a book containing **only strictly earlier battles** (no leakage), runs the
planner to completion against a `sampleReroll`-driven shop, then scores the resulting board against
the enemy board actually faced.

```
$ node tools/build_book.js
$ node tools/eval_planner.js --jobs 24

eval_planner  seed=20260919 pool=40 rows=9020
era      R      n  planner  95% CI            actual   delta   short  gold
S1early  0   3136   0.944  [0.937, 0.951]   0.708  +0.236      0  0.13
S1early  1   2982   0.990  [0.986, 0.993]   0.826  +0.164      0  3.17
S1early  2   1283   0.945  [0.934, 0.957]   0.746  +0.199      0  2.69
S1late   0    640   0.866  [0.841, 0.890]   0.446  +0.420      1  0.13
S1late   1    296   0.966  [0.947, 0.985]   0.598  +0.368      0  3.85
S1late   2    380   0.930  [0.907, 0.954]   0.511  +0.420      0  2.45
S2       0    178   0.829  [0.779, 0.879]   0.368  +0.461      1  0.07
S2       1     39   0.987  [0.962, 1.012]   0.641  +0.346      0  2.72
S2       2     86   0.866  [0.801, 0.932]   0.314  +0.552      0  2.13
------------------------------------------------------------------------
ALL      0   3954   0.926  [0.919, 0.933]   0.650  +0.276      2  0.13
ALL      1   3317   0.988  [0.984, 0.991]   0.803  +0.185      0  3.22
ALL      2   1749   0.938  [0.928, 0.949]   0.674  +0.264      0  2.61
ALL      *   9020   0.951  [0.947, 0.955]   0.711  +0.240      2  1.75

9020 shops in 152.6s on 24 jobs
```

Against the contract's reference points: recorded actual R0 0.650 → **0.926**, R1/R2 0.758 →
**0.971**. The audit's much heavier search reached R0 0.873–0.933 and R1/R2 0.976, so this planner
lands inside the audit's R0 band and 0.005 below it at R1/R2 — and that last gap is the deliberate
final-round utility switch, which trades metric score for match wins (at 1-0 a draw wins the match
but scores 0.5).

`n` reproduces the audit's slices exactly (R0 3,954; R1+R2 5,066). The run is deterministic: each
row gets its own stream seeded from (seed, matchId, round, ts), so `--jobs` does not change results.

### 2.3 Mock arena — the loop end to end, cold book

The e2e test plays the **real** planner, book, target, shop_model, sim and `driver/play_loop.run()`
against `test/mock_arena.js` (real shop reducer, real battle sim, ghosts drawn from the corpus).
**There are no stubs anywhere in this path** — the planner stub that existed as a scaffold is
deleted.

The book is **cold**: the loop starts knowing nothing and learns inside the run. This matters,
because the mock's ghosts are corpus boards and `memory/book.json` is built from the same corpus, so
a warm book hands the planner the exact enemy board and the win rate becomes meaningless.

In the test suite (seed 7, 30 matches):

```
[mock arena] planner=lib/planner.js cold book, 30 matches: W27 L2 D1 matchScore=0.917 elo=400 actions=468
[mock arena] per-round score: R0 0.783 (n=30)  R1 0.933 (n=30)  R2 0.833 (n=6)  ALL 0.856 (n=66)
```

Over a wider sample (5 seeds × 30 matches per season, `scratchpad/mock_eval.js`, same `run()` the
CLI uses):

| season | matches | W/L/D | match score | R0 | R1 | R2 | all rounds |
|---|---|---|---|---|---|---|---|
| S1 cold | 150 | 128/14/8 | **0.880** | 0.803 (n=150) | 0.893 (n=150) | 0.651 (n=43) | 0.824 |
| S2 cold | 150 | 124/15/11 | **0.863** | 0.790 (n=150) | 0.847 (n=150) | 0.620 (n=54) | 0.788 |

Across those 300 matches and 697 shops: **0 unjustified short boards, 0 illegal actions**, mean gold
left at R0 0.21 (S1) / 0.32 (S2) — the board is filled and the gold is spent.

The 30-match figure reproduces exactly (`actions=468`, R0 0.783) across four runs, standalone and
inside the full suite. It is **not** reproducible under heavy external CPU load: one reading taken
while a 24-shard evaluation saturated the machine came back `actions=475`, R0 0.817, R2 0.857. The
cause is `ctx.timeBudgetMs` — the planner measures its own evaluations against a **wall clock** and
cuts the reroll sample and the target when it runs short, so how many cores it is competing for
changes what it decides. The match result (W27 L2 D1) was identical in both cases and every
invariant held, but do not diff per-round numbers across runs on a busy machine.

R2 scores lower than R0/R1 in every slice. That is selection, not weakness: round 2 only happens
when the series is level or behind, so the R2 sample is conditioned on a harder opponent.

### 2.4 Invariants asserted over those runs

Enforced by the mock (which **throws** rather than asserting, so a violation cannot be missed) and
by the e2e test:

- three units at `endShop` unless the leftover gold cannot buy the cheapest offer;
- no illegal action ever reached the server;
- exactly one `start`/`restart` per match and never mid-match;
- R0 ends with ≤ 1 gold on a full board;
- the book gained observations and persisted;
- telemetry carries `session_start | match_start | shop | act | battle | result | session_end` with a
  dense `seq` and a matching `LATEST`;
- an R0 battle was recorded with no handle and later landed in the book under the right handle
  (the buffer path);
- `--dry` reached `act()` zero times.

---

## 3. Contract guarantees — verified by reading and running, not by trusting reports

| guarantee | how it was checked | result |
|---|---|---|
| no legacy heuristics anywhere | grep for `archetype, recipe, threat, hot list, ban/prefer list, refuse, glass_burst, flamingo_pass, hype_battery, seat_table, name_to_kit, counters, ghosts.js, classify, effectiveThreat, policy_v1, scout, ledger, enrich, decision_db` across `lib/ driver/ tools/ mcp/ test/` and the docs | **clean** — the only hits are comments that say these were *not* used |
| no `Math.random` in `lib/` | `grep -rn 'Math\.random\|process\.exit' lib/` | only two comments explaining their absence |
| no require-time side effects | hooked `fs.writeFileSync/appendFileSync/mkdirSync/renameSync/unlinkSync/openSync/rmSync`, `fs.readFileSync`, `net.connect`, `http.request`, `https.request`, then required all 9 lib modules | **0 writes, 0 network, 0 reads of `data/` or `memory/`** |
| no `start`/`restart` mid-match | `driver/play_loop.js` routes both through `lifecycleAct()`, which throws when `phase.kind` is `shop`/`battle`; `mcp/server.js` re-observes and refuses; `test/mock_arena.js` throws | verified in code + 300 mock matches |
| 409 handled as a conflict | `lib/arena.js act()` returns `{conflict:true, ...freshEnvelope}` after refetching; the loop replans and logs it | verified in code + a test that injects a conflict mid-shop |
| `--dry` sends no mutating action | the dry test runs the loop against an arena whose `act()` **throws on every call** | passes — `sent` is empty, `actions` is 0 |
| nothing reads `archive/` | `grep -rn archive lib/ driver/ tools/ mcp/ test/ package.json` | **no matches** |
| `lib/sim.js` unchanged in behaviour | corpus replay inside `test/sim.test.js` | 9,730/9,730 winners |

Offline CLI and MCP smoke tests, with `lib/cdp.js` replaced in memory by a stub that **throws on any
POST**:

```
$ node -r stub_cdp.js driver/play_loop.js --dry --once
STUB GET /api/arena
{"event":"play_loop_done","games":0,...,"exitReason":"idle"}     exit=0, lock released
$ node driver/play_loop.js --nope
{"event":"play_loop_error","message":"unknown argument --nope"}  exit=1

$ mcp/server.js over stdio
tools: arena_me, arena_catalog, arena_observe, arena_act, arena_leaderboard,
       arena_player_matches, sim_battle, plan_shop, book_lookup      (no ledger tools)
sim_battle  -> winner=us turns=6 seatOrders=6 best=1
book_lookup -> cibaru r1 n=1, "Meeting Recap Deck(echo 3/4) | Cooper(echo 2/5) | skippy(sidestep 2/4)", seen 45x
```

`data/catalog.json` (md5 `74f9ce39…`, 80 bots, 8 season-2) and `memory/book.json` (md5 `c34181b6…`,
1,135 keys / 1,433 boards / 9,621 observations) are byte-identical before and after every run above.

---

## 4. What I changed

**Fixes**

- `test/loop.test.js` — deleted the fallback planner stub (`loadPlanner`/`stubPlanner`/`movesToOrder`)
  and required `lib/planner.js` unconditionally. The e2e path now has no stub in it.
- `test/loop.test.js` — the e2e batch runs **30 matches** (was 8) on a **cold** book (was warm, which
  leaked the corpus into the target) and reports the per-round score.
- `test/loop.test.js` — `--dry sends nothing` now runs against an arena that throws on any mutation.
  Counting posts would have passed even if the action were swallowed elsewhere.
- `test/loop.test.js` — the season-2 test keeps a warm book on purpose, so the seat-rule sim path
  actually decides something instead of scoring every board 0.
- `test/mock_arena.js` — `stats.rounds` records every resolved round, so per-round scoring is
  measurable rather than inferred.
- `test/planner.test.js` — added a test for `planner.completedValue`, which was exported with no
  test. Writing it surfaced (and documented) a real edge: when a full board is unaffordable every
  completion ties at score 0 and the tie goes to the *empty* plan. That is harmless because filling
  the board is `planStep`'s G1/G7 guarantee, not `completedValue`'s — the test now pins both halves.
- `driver/climb_loop.sh` — climb logs moved from `matches/climb` to `data/log/climb`, so the repo
  matches the contract's layout and there is no store outside `data/` and `memory/`.

**Deletions** (all verified unreferenced first)

- `matches/` — 514 legacy climb logs, reachable only through the old `LOG_DIR` default.
- `api/sample_state.json` — unreferenced since `arena.saveSample`/`SAMPLE_PATH` were removed.
- `data/climb.lock` — a leftover empty flock target, recreated on demand.

**Documentation rewritten**

- `api/ACTIONS.md` — rewritten against `docs/ENGINE_SHOP.md`: transport and the 409 rule, phases,
  every action with its real cost, the rarity price/unlock table, food effects and odds, offer pool
  and replacement, the R0 budget invariant, series and drawn rounds, season-2 seat rules, and a
  section on what `start`/`restart` really do — including that **"`start` forfeits" was never a
  supported behaviour**, that the client sends `start` on every page mount, and that the resume
  reading is INFERRED and the `restart` forfeit unverified, which is why the bot never sends either
  mid-match. Also corrects "restart = practice rematch" (it is the rated "Play again") and the
  `endShop` rule (allowed with 0 units when nothing is affordable, and it forfeits the round).
- `mcp/README.md` — was documenting four deleted tools (`ledger_hot`, `ledger_record`,
  `arena_action_docs`, `arena_wait`), none of the three new offline ones, a `--fight` flag that does
  not exist and `/workspace` paths. Rewritten against the actual server.
- `README.md` — was the legacy strategy ledger: `strategies/wins`, `index.json`, `hot`,
  `avoid_boards` and archetype "plan" labels (`tempo|buff|faint|late_spike|hybrid`). Every one of
  those is a heuristic the contract bans and none of it exists. Rewritten.
- `CLAUDE.md` — the worst offender, and the file an agent reads first. It described
  `lib/recipes.js`, `lib/counters.js` with `classify()`/`effectiveThreat`, `lib/ghosts.js`,
  `lib/seat_table.js` ("global refuse and prefer lists"), `lib/scout.js`, `lib/ledger.js`,
  `lib/enrich.js`, `lib/decision_db.js`, `update_index.py`, `smoke_plan.js`, a `--fight` flag and a
  9-step "policy_v1 priority stack" — none of which exist. Rewritten around the simulator-decides
  rule, the verified engine facts and the loop's invariants.

---

## 5. Risks and open issues

### 5.1 Blocking nothing, but worth knowing before a live run

1. **`node --test test/` does not work on Node 25.** The runner treats the positional as a *file*
   and dies with `MODULE_NOT_FOUND`; I reproduced it in a clean throwaway project, so it is Node
   behaviour, not a repo bug. Use `npm test` (`node --test`, which globs) or
   `node --test 'test/*.test.js'`. `package.json` already has the working form.
2. **`npm test` also collects `test/mock_arena.js`** as a test file (Node's default glob includes
   `**/test/**/*.js`), where it contributes 0 tests. Harmless today because the file has no
   require-time side effects, and that property is now load-bearing.
3. **No live path has ever been exercised.** Every number here comes from the corpus or the mock.
   `driver/check_rank.js` has been syntax-checked and its dependencies confirmed present, but it has
   never been run, because running it hits the live API.
4. **The catalog is not auto-refreshed on an unknown botId.** The client does this
   (`shopNeedsCatalogRefresh`, `docs/ENGINE_SHOP.md` ENGS-01). Whoever wires the live entry point
   should call `arena.getCatalog({refresh: true})` once at session start; a season-3 bot would
   otherwise arrive with `kitId: null` and be simulated as a vanilla statline.

### 5.2 Model risk — the numbers rest on these

5. **`route` and `caffeinate` (season 2, epic/rare) have zero observed captions.** Their simulator
   semantics are the vendored guesses. Any S2 R2 evaluation involving Master or Apple Dev rests on
   them, and S2 R2 0.866 [0.801, 0.932] should not be quoted as settled.
6. **`bloom` and `hand_off` are modelled at expected value**, which makes board stats fractional
   (`Shepherd/herd/3.5/5.5`). Numerically fine, and the live loop re-observes the real board, but
   nothing in the 9,020-row evaluation exercised it — only 26 corpus rows contain such a unit and
   they fall outside the usable slice. Never persist an EV board into the book.
7. **Season 2 rests on thin data**: 178/39/86 rows across 16 handles offline, and the S2 book has
   16 handles per round against 371 for S1. The S2 mock number (0.863) is generated from those same
   16 handles' recorded boards, so it is not independent evidence.
8. **The offline evaluation is one round deep**, like the audit's. The apple carry-over rule
   ([docs/STRATEGY.md](../STRATEGY.md) §4, step 5 — spare gold buys permanent stats before the final round) therefore cannot
   show a gain and measured neutral (−0.001, within noise). It is the only INFERRED rule in the
   planner, and it is applied at R0 as well as R1, which the audit does not state. A multi-round
   evaluation on top of `test/mock_arena.js` is the way to settle it.
9. **The season-2 `seatShop` → rule-id mapping is inferred from UI strings**, because no recorded
   state carries a `seatShop` row. If the live state already holds rule ids in `state.seats`, that
   path wins and the name mapping never runs — which is the likely case, but unconfirmed.
10. **`normalize()` guesses season 2** whenever `state.seats`/`seatShop` exist, and `null` otherwise.
    If the live state has a better season signal, pass it as `opts.season`.

### 5.3 Data limits, not defects

11. **The shop replay derives actions rather than reading them.** `data/corpus/shops.jsonl` records
    the pre-shop snapshot and the board the server fought, never the actions taken. The replay
    derives a minimal explaining sequence by independent arithmetic and replays it: 6,373 of 9,730
    rows, 0 mismatches. It cannot assert post-shop gold, which was never logged. The mutation tests
    (apple as +2/+2 → 1,811 mismatches; buy that unshifts → 3,820) show the replay is not vacuous.
12. **Book coverage is ~89% for S1 R0/R1, not the ~95% quoted in the task text.** I re-measured it:
    S1 R1 88.9% (early) / 92.4% (late), S1 R2 65.0% / 76.2%, S2 R1 67.8%, S2 R2 62.0%. The audit
    itself ([docs/STRATEGY.md](../STRATEGY.md) §3.1(c)) states 88–91% at R1 in S1 and 62–68% at R2, which is what the
    rebuild reproduces. **95% has no source I could find and should not be used as a target.**
13. **Two R0 corpus rows open at 8 gold**, so three commons (9) are unbuyable and the board is
    necessarily short. They are the only 2 short boards in the 9,020-row evaluation. I could not
    tell from the corpus whether the server really opens a shop at 8 gold or whether the snapshot
    was taken after two feeds.
14. **The 5-board cap dropped 109 of 9,730 observations** across the 21 keys that had more than 5
    distinct boards. That is the contract's cap, not a defect.
15. **`beforeTs` weights are exact only up to 64 observations** of the same board at the same
    (season, handle, round); beyond that the oldest stamps are dropped and can be under-counted.
    It can never leak a future board. The corpus's heaviest key is 45, so nothing today is affected.

### 5.3b Reproducibility

15b. **The planner's time budget is wall-clock driven, so its decisions are load-dependent.**
    Demonstrated above: the same seeded mock batch gives `actions=468` on an idle machine and
    `actions=475` under load. `tools/eval_planner.js` already sidesteps this by leaving the budget
    **off** by default (`--budget` opts in), which is why the 9,020-row table is reproducible. The
    live loop keeps the 1,500 ms default, which is correct for play but means two live sessions are
    not comparable action-for-action. Anything that benchmarks the planner should pin `--budget` or
    disable it.

### 5.4 Deliberate deviations from the contract's letter

16. **`sim.winProbability` and `sim.DEFAULT_HYP` were removed.** Nothing used them and they
    contradict the fixed-seed ground truth — there is no probability to sample. Use `outcome()`
    against a weighted target instead.
17. **The telemetry `shop` event does not carry "the chosen action, its value and the planner
    reason"** as the contract's wording implies. A shop has many actions, so those live on the
    per-action `act` events (`{action, round, gold, value, reason}`), one per action, alongside the
    `shop` event's round/gold/food/offers/board/seats/series/handle/target. Reassembling a shop means
    joining on `matchId` + `round`.
18. **`ctx.epsilon` gates the reroll only.** A reroll's value is a mean over sampled shops while
    every other candidate is an exact evaluation, so epsilon guards sampling noise and nothing else.
    Making moves clear 0.01 too costs 0.007 at R1 and leaves ~2 gold a shop unspent.
19. **The fill-budget invariant is applied to feeds and sell+buys, not only rerolls.** The contract
    names only the reroll, but a feed can break the same invariant, and without the guard the R0 tail
    fed an apple and went to the fight with 2 units.
20. **`mcp/README.md` and `CLAUDE.md` are not in the contract's file layout.** I rewrote rather than
    deleted them: both actively described the deleted legacy system, and `CLAUDE.md` is the first
    file an agent reads in this repo.
