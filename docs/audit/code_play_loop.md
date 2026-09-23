# driver/play_loop.js audit (lens: PL)

> **Historical audit (2026-09-19, before the simulator rewrite).** The line numbers and
> references to “current” or “live” code below are for the 3,093-line legacy loop, not today's
> `driver/play_loop.js`. The old data is in `archive/legacy-2026-09-19/`; the audit scripts
> remain in the scratchpad path described below. See [AGENTS.md](../../AGENTS.md) and
> [HISTORY.md](../HISTORY.md) for the implemented rewrite and later measurements.

Scope: every line of `/home/tetsuo/grok/thursday-arena/driver/play_loop.js` (3093 lines), with the modules it calls (`lib/seat_table.js`, `lib/counters.js`, `lib/recipes.js`, `lib/ghosts.js`, `lib/ledger.js`, `lib/decision_db.js`) where they decide what play_loop does. The repo was only read. All scripts are in `scratchpad/audit/pl/`. The harness `harness.js` loads a **scratch copy** of the code (`audit/pl/repo/`) with `lib/arena` stubbed, so it makes no network or CDP calls.

Data sources:
- `matches/log.jsonl`: 3,991 results.
- `data/decisions/events.jsonl`: 65k events (16,849 shop, 9,770 fight, 3,989 result).
- `matches/climb/*.log`: 514 stdout batch logs holding 9,821 `plan`, 1,197 `emergency_buy`, 90 `action_skipped` and 46 `error` events.
- `audit/outcomes/rank_checks.txt`: rating snapshots.
- The client reducer `sapMatchReducer` in `site/1ou4egaetj-op.js`.

Labels: **PROVEN** means computed or read directly. **INFERRED** means reasoned but not directly observed.

## 0. Era map (code versions vs results)

`.bak` mtimes are local time (−0600) and were converted to UTC. Script: `eras.py`, `eras2.py`, `reasons.py`.

| era | code in effect | n matches | W / D / L | match WR (Wilson 95%) | elo/match | plan path |
|---|---|---|---|---|---|---|
| A ≤11:56Z | pre-hedge | 264 | 194/21/49 | 73.5% [67.9,78.4] | −0.47 | 100% policy |
| B 11:56Z–01:18Z | hedge … pre-certain-fixes | 2199 | 1781/148/270 | 81.0% [79.3,82.6] | +0.06 | 100% policy |
| C 01:18–01:58Z | certain-fixes | 263 | 216/19/28 | 82.1% | −0.20 | 100% policy |
| D 01:58–02:47Z | blocklist | 233 | 195/15/23 | 83.7% | +0.39 | 100% policy |
| E 02:47–04:58Z | refuse/isfarm (**recipe planner re-enabled**) | 352 | 250/23/79 | 71.0% | −1.06 | recipe 18 matches (4 W) |
| F 04:58–07:20Z | encoded-loss-fixes | 626 | 268/92/266 | 42.8% [39.0,46.7] | −0.08 | recipe 559 / 626 |
| **G ≥07:20:33Z** | **current (seat-table)** | 54 | 4/4/46 | **7.4% [2.9,17.6]** | **−4.89** | recipe 52 / 54 |

Rating from rank checks: 1234 (04:12Z) → 993 (04:58Z) → 857 (06:09Z). The season reset about 07:00Z. It was 930 at 07:21Z and **726 at 07:28Z**. In the same post-reset environment:
- Previous code, 07:00–07:21Z: 49W/20D/58L, 38.6% [30.6,47.3], n=127.
- Current code: 3W/4D/44L, 5.9% [2.0,15.9], n=51. **PROVEN**

Before era E, every `play_loop.js.bak*` holds `// RECIPE PLANNER DISABLED — heuristic tempo only (recipe path was starving boards / tilting elo)`. All 11 backups up to `pre-refuse-204742` contain it. **PROVEN**

---

## Findings (most severe first)

### PL-01 CRITICAL: the recipe planner is back on and it loses (planShopSmart L2192–2377)
- Per-fight WR by the planner that shaped that shop (`fight_by_reason.py`, `fight_by_reason_round.py`). **PROVEN**
  - Era F: policy 209/370 = 56.5% [51.4,61.4] vs recipe 467/1249 = 37.4% [34.7,40.1].
  - Era F by round:
    - R0: policy 53.6% (135/252) vs recipe 17.5% (66/377).
    - R1: 63.5% (104) vs 50.2% (524).
    - R2: 57.1% (14) vs 39.7% (348).
  - Era E: policy 63.3% (830) vs recipe 33.3% (51). Era G: recipe 18/124 = 14.5% [9.4,21.8].
- Per match: F recipe 224/559 = 40.1% with elo −491, vs F tempo 44/67 = 65.7% with elo +443. **PROVEN**
- How it loses. The recipe path does the following:
  - It only buys named recipe pieces and rerolls whenever a piece is missing (`recipes.planTowardRecipe`).
  - It ignores fill-to-3, P1 threat survival, the anti-mirror rule, GHOST_PUNISH, dupSoft and the arch kit gates. The only check it applies is `alwaysRefuseBuy`, at L2319–2333.
  - It returns early, so none of the policy phases run.
- The last live batch shows the result, turn by turn:
  1. R0 plan `[reroll]`.
  2. Replan `[reroll]`.
  3. The emergency fill buys 1 Pipeline Pulse, a globally refused unit.
  4. It fights 1v3.
  5. R1 plan `[sell0, reroll]`, which sells its only unit.
  6. Replan `[reroll]`.
  7. Two emergency buys, then a 2v3 fight. **PROVEN** (`batch-*.log` tail, 07:28Z)
- Fix: delete the recipe branch from the live loop (L2228–2377) and the `recipes.pickRecipe` call. Keep recipes offline for analysis only.

### PL-02 CRITICAL: "Never fight short" is not enforced, and gold is wasted
Gold resets to 10 every shop, so gold left at the end of a shop is lost:
- Client `battleDone` sets `gold: 10`, and `GOLD_PER_SHOP=10`.
- Rated pre-shop gold was 10 in 9,775 of 9,836 shops.

The planner spends that gold on rerolls with no reserve for filling the board. It also allows only **one** replan (L2903–2932). **PROVEN**:
- **Short-board fights (≤2 units):**
  - F recipe: 376/1249 = 30.1%, winning 0% with 1 unit and 18.6% with 2.
  - G: 59/124 = 47.6%.
  - A–D policy: 169/7142 = 2.4%, winning 17%.
  - Full boards win 71.5% in A–D. (`short_board.py`)
- **The second plan also ends in a reroll that nobody replans** (`reroll_waste.py`):
  - A–D: 539 of 7176 shops.
  - F: 1257 of 1635.
  - G: 122 of 130.
- **Replan chains that end in a reroll** (A–D): P0_fill→P0_fill had 1 of 34 full boards and won 20.6%. Opener→fill had 0 of 87 full and won 13.8%. (`fillreroll.py`)
- **P0 opener reroll** (L1391–1404, `score<7` with an empty board): R0 won 80/210 = 38.1% [31.8,44.8] with only 48% full boards. Without it, R0 won 1780/2752 = 64.7% with 99% full boards. (`opener.py`)
- **Gold unspent at endShop** (`gold_end.py`):
  - G: mean 3.70; 56% of shops left ≥3.
  - F: 4.13.
  - A–D: 1.27.
- The emergency fill (L2939) cannot rescue a short board once rerolls have taken the gold below 3. It never rerolls.
- Fix:
  - Loop plan → apply until a plan has no reroll or gold is below 1.
  - Hold back `3 × missingSeats` gold before any reroll.
  - Fill first and reroll after.
  - Drop the opener reroll.

### PL-03 CRITICAL: the ghost model is wrong. Opponent boards repeat exactly for each (handle, round), but the loop plans against the previous round
- The loop stores one "last seen" board per handle:
  - `ghosts.rememberHandle` overwrites it every round.
  - `ghost_seen` at L2985–2999 sets `matchCtx.ghostFp`.
  - `theirSeats()` (L519), `resolveCounterPlan()` (L547) and the P1 threat all plan round *r* against the enemy's round *r−1* board.
- The board is the same as the previous round's only 1517/5709 = 26.6% [25.4,27.7] of the time. The archetype changed in 2659/5709 = 46.6% of round pairs. (`ghost_drift.py`) **PROVEN**
- Keyed by (opponent, round), the board equals the last board seen for that pair (`ghost_by_round.py`) **PROVEN**:
  - R0: 3462/3547 = 97.6% [97.0,98.1].
  - R1: 3514/3577 = 98.2%.
  - R2: 1391/1422 = 97.8%.
- The next opponent is the same as the last one in 3149/3990 = 78.9% [77.6,80.2] of consecutive matches. **PROVEN**
- The loop throws that knowledge away:
  - The batch reset (L2802–2803) nulls `handle` and `ghostFp`, so 3,605 R0 shops had no ghost at all.
  - At R0 the shop state carries no opponent handle: `ghostHandle` was null in 3624 of 4019 R0 shops.
- This is the single biggest strategic lever. For roughly 80–90% of rounds, the exact enemy board can be known before buying. **INFERRED** from the numbers above.
- Fix:
  - Store boards by `(handle, round)` using `data/decisions` fights.
  - Predict "opponent = last opponent".
  - Plan against that exact board with a port of the client `simulateBattle`.

### PL-04 HIGH: per-game context leaks between games (two different reset blocks)
- The outer `while` in `main()` always `break`s after one pass (L3054). So the "fresh match context" at L2631–2644 runs once per **process**. Every later game uses the reset at L2802–2813.
- The second reset does **not** clear `scoutArch`, `scoutKits`, `scoutPrior`, `hedgeReplies`, `hedgeSecondary` or `recipeWhy`. The first does not clear `recipeWhy`, `lastFight*` or `forceDeciderReplan`. **PROVEN** (`ctx.py`)
- Consumers treat the leaked `scoutArch` inconsistently. **PROVEN**:
  - These use it without checking `scoutPrior`: `alwaysRefuseBuy` L322, `planShopSmart` L2225, L1030, and `recordResult` L2594.
  - These gate it on `scoutPrior`: L302, L402, L624.
- Measured effect (`stale_arch.py`, `r0_stale.py`) **PROVEN**:
  - 374 R0 plans in F and G used `recipe+arch:X` with **no ghost for the current opponent**. `resolveCounterPlan` had not run yet that game, so X is the previous opponent's archetype.
  - Those R0 fights won 61/326 = 18.7% [14.9,23.3] in F and 5/45 = 11.1% in G. R0 policy in F won 134/250 = 53.6%.
- The first game of a process takes `handle` and `ghostFp` from the **result screen**, which shows the previous opponent (L2647–2654). `planShopSmart` prefers `matchCtx.ghostFp` over the new handle (L2202–2205). **PROVEN**:
  - R0 recipe on the first game won 2/38 = 5.3%.
  - 70 R0 shops planned against a different opponent's ghost.
- Harness S6: after the L2802 reset, `alwaysRefuseBuy('Imogen')` returns true for a brand-new opponent, because of the leaked `hurt_revenge`. **PROVEN**
- Fix: replace both blocks with one `newMatchCtx()` factory, and call it on every match start, including the stale-result path.

### PL-05 HIGH: the emergency fill ignores every ban and is invisible to telemetry (L2936–2971)
- Its only filters are affordability and `GHOST_PUNISH`. It skips `alwaysRefuseBuy`, anti-mirror, the tip and arch gates and dupSoft, and it does not add spineGapBonus.
- It does not reseat the board afterwards. It calls `arena.act` directly, so `decision_db` never sees these buys.
- Measured (`emergency.py`, `emerg_refuse.js`) **PROVEN**:
  - 1201 emergency-bought units were reconstructed.
  - 360 = 30.0% [27.5,32.6] are seat_table GLOBAL_REFUSE names: Pipeline Pulse 33, Signal Prospector 27, Stills & Clips 25, Event Request Desk 23, Video Edit 20, and more.
  - Era G had 146 emergency buys in 54 matches (2.7 per match).
- Fix: route the fill through the same candidate filter as the planner, and reseat after it. Better, remove the need for it (see PL-02).

### PL-06 HIGH: the P1 front wall goes to the back seat, and later board indexes are wrong (L1694 `pushBuy(wall,true)` → L1374 `board.unshift`)
- The rated server **appends** bought units: 4831/4831 observed buys landed at the end (`append_check.py`). The client reducer does the same (`[...e.board, a]`). **PROVEN**
- The planner puts the wall at seat 0, so every later `boardIndex` is computed on a board that does not exist. That covers feed, P6 sell, P4 sell and seatBoard moves.
- Harness S2 (`scenarios.js`):
  - Planner view: `[Webby, The Morning Newspaper, Cooper]`.
  - Real board: `[Cooper, Webby, The Morning Newspaper]`.
  - A 2/5 echo front faces a 6-atk threat, while telemetry reports `frontSurvival=true`. **PROVEN**
- Data: 173 policy plans ended with the same units in a different order than planned (`desync.py`). **PROVEN**
- Fix:
  - Model buys as appends.
  - Seat everything in one final pass computed on the simulated board.
  - Assert that the planner's board equals a replay of its own actions.

### PL-07 HIGH: sell first, then the buy is refused (P1, P4, P6 and recipe tip-strip)
Sells run before `pushBuy`'s own gates (`alwaysRefuseBuy`, the dupSoft regex at L1346–1360). When `pushBuy` then returns false, the unit is gone for nothing:
- **P1 wall candidates** (L1666–1680) never check `alwaysRefuseBuy`, and peacock is accepted at any HP.
  - Harness S1: P1 sells Credit Card Max, `pushBuy` refuses Sales Call Coach (GLOBAL_REFUSE), and the board fights 2v3. **PROVEN**
- **P4 teeth** (L1982–2019) sells the unit with the lowest atk+hp and then calls `pushBuy`.
  - Harness S7, bulk_echo: it sells Webby 3/5 to buy Credit Card Max, the seat table refuses Credit Card Max, and the board has 2 units. The emergency fill would then buy that same refused Credit Card Max. **PROVEN**
- **Recipe tip-strip** (L2319) removes buy actions but keeps the sell that made room for them.
- Data: plans that net-lose a unit into a short board (`sell_nothing.py`): A–D policy 40, E 7, F policy 12, G recipe 23. **PROVEN**

### PL-08 HIGH: scoring and gating systems fight over the same decision
There are at least 7 independent "is this unit good" systems:
1. `scoreUnit`: 36 live terms.
2. `seat_table.seatTableScore`, called inside it.
3. `counters.biasScore`, called inside it.
4. `spineGapBonus`: 7 terms, used by P0 and P6 only.
5. The P6 dump adjustments: 9 terms.
6. The ~22 hard gates in `tryPick`, plus 4 fallback gates, plus 2 in `pushBuy`.
7. The emergency fill, which uses `scoreUnit` only.

A single P0 buy is touched by **≥70 distinct live rules** (see §A). Sells use 8 separate paths with 5 definitions of "weakest". Concrete conflicts, all run in the harness or read from the lists:
- **glass_burst** (`scenarios.js` S3, `scen2.js`):
  - seat_table **prefers** Stills & Clips, Outbound Prospecting and Luma Pages (+10, `shouldRefuseBuy`=false).
  - play_loop **hard-refuses** them through `isGlassWakeTipName` and `isWallPunishTip` at L1463–1480.
  - The fallback pick at L1563–1582 then buys Luma anyway.
  - counters.PLANS.glass_burst prefers `flamingo` and `grow` (+5.5), but L1463–1480 hard-refuses both kits.
  - The fallback buys The Morning Newspaper (flamingo). P6 then sells Imogen (bulk 2/6, a kit counters also prefers) for a second flamingo, Copy Humanizer. **PROVEN**
- **hype_battery** (S5):
  - `MUST_BUY_NAMES` gives +4 and `GHOST_COUNTER` gives +3.5 to Cooper, Writing Bot, Office Ops, Meeting Recap and Webby.
  - seat_table refuses all of them: −16 and a hard refuse.
  - `counters.biasScore('hype')` = +6 for Writing Bot while seat_table refuses it. **PROVEN**
- **MUST_BUY_NAMES** (L488–511) contains Company Docs Q&A and X Brief. Both are seat_table GLOBAL_REFUSE, which means a score of +4 and −20, a hard refuse, and a force-sell every shop. **PROVEN**
- **The hot-name bonus** (+4, L635–637) comes from `index.json.hot`. That list is frozen on 2026-09-17 seed strategies: every auto strategy has plays=1 and wins=1, so the ranking never changes. It gives +4 to pipeline pulse and company docs q&a (global refuse) and to clip bot (also GHOST_PUNISH −4.5). **PROVEN**
- **"Front kit" has 8 different definitions:**
  - KIT_FRONT L456 includes `brace`, which is not a catalog kit.
  - seatBoard `frontish` L1241.
  - `echoOffFront` L1249 treats guard as front.
  - P1 wall kits L1675 (no grow).
  - Potato front L2052.
  - `counters.sameRole` (includes spotlight).
  - `counters.PLANS[*].front`, which lists **hype** as a front kit for glass_burst, flamingo_pass, hurt_revenge and hype_battery. Meanwhile `frontSeatScore` gives hype −6 (L1192) and seatBoard pushes hype back (L1240).
  - `frontSeatScore`. **PROVEN**
- **Flamingo:** `isProtected` (L1112) forbids selling a flamingo unless the arch is flamingo_pass. So the P6 flamingo-mirror dumps (L1818–1839) cannot fire on glass_burst boards that contain flamingo, while `tryPick` refuses to buy flamingo against those same boards. **PROVEN** (code)
- **P6 `want`:**
  - The clause at L1944 is logically subsumed by L1945.
  - The weakest unit is chosen by the *adjusted* score (L1855), but the margin uses the *unadjusted* score (L1863).
  - The variable `theirKit` at L1817 actually holds our unit's kit. **PROVEN**

### PL-09 HIGH: recordResult credits the wrong recipe, which creates survivorship bias (L2549–2577)
- `recipes.recordOutcome(state.board)` credits the recipe file of the **final board**, not the recipe that was pursued.
  - The pursued recipe was completed in only 21/629 matches = 3.3%. Those went 16/21 = 76.2%, and they are the only results the recipe file ever sees.
  - The other 608 went 216/608 = 35.5% and were credited to other files (`recipe_completion.py`). **PROVEN**
- Example: the `recipe-imogen__cooper__wtd` file says 15W of 17 plays. Its real record when chosen is 83/224 = 37.1% [31.0,43.5]. **PROVEN**
- 2678 of 3191 recipe files (84%) have ≤1 play, so `pickRecipe` ranks single-game flukes (`wr*10`). **PROVEN**

### PL-10 HIGH: 701 dead or duplicated lines (22.7% of the file) (`usage.py`, `braces.py`, `ctx.py`)

| lines | n | what |
|---|---|---|
| 54–62 | 9 | `refuseRematchBeforeAccept`: a no-op whose doc comment still promises blocklist and field-WR refusals |
| 64–180 | 117 | `refuseAbortPause`: reachable only from `if (false && …)`. Contains `if (true \|\| …)` and a `while(true)` |
| 182–190 | 9 | `resultOpponentHandle`: only feeds the no-op and dead code |
| 664–992 | 329 | `if (false) {` "superseded by seat_table". It also killed every **kit-level** arch score (sustain, double_echo, grow_hype, echo_hype, buff_suicide, backline_snipe, bulk_echo, the 1-1 decider −16, the R0 wall prefer), even though seat_table is name-only |
| 1037–1091 | 55 | second `if (false)` block (hurt_revenge boosts) |
| 295–297, 315–318, 431–451, 1117–1135, 1379–1388 | 57 | unused or dead-only helpers: `isWritingBot`, `alwaysBleedBan`, `isDoubleCoachHurtGhost` (still exported), `weakestBoardIndex`, `canBuyName` |
| 1541–1544 | 4 | double-wake check written twice, and a third time at L1425 |
| 1545–1554 | 10 | `!needFill` branches. `needFill` is always true inside the P0 loop because of the `break` at L1410 |
| 1584–1607 | 24 | "absolute last resort" `find` with a predicate identical to L1563–1582 |
| 2257–2266 | 10 | `recipe_unstick_global` branch, unreachable (branch 1 already covers it). 0 log events |
| 2675–2795 | 72 | 5 refuse call sites, each followed by `if (false && …)` |
| 43–45 | 3 | `bailsThisRun`, `bailsSameHandle`, `lastBailHandle`: never read or written |

Also: `settlePendingFight` branch L2466 is unreachable. The stale-result terms at L2723–2725 are impossible (PL-13). HARD_TIP_BAN_NAMES repeats 'pipeline pulse' (L239–240) and has dead spellings ('stills and clips desk', 'stills clips'). GHOST_PUNISH has dead 'home robot' and 'gtm connection'. KIT_WEAK has 'spot' and 'poke', which are not kit ids. **PROVEN**

### PL-11 HIGH: name normalizers disagree, so anti-mirror fails for 10 units
- Ghost fingerprints are `ghosts.normName`'d, for example `call follow ups`.
- scoreUnit (L618/632), tryPick (L1419/1424) and P6 (L1771/1827) compare **raw lowercase** names, for example `call follow-ups`.
- So the −50 mirror penalty and the hard mirror gate silently fail for these catalog units: SEO & AEO Desk, Stills & Clips Desk, Lingxi's Engineer Bot, Critiquito: Design Critique, Flora: Plant Care Log, EBR & Value Deck Builder, Call Follow-Ups, Company Docs Q&A, Customer Call Coach & Assistant, Love ❤️ (`seat_substr.js`).
- Harness S4: vs a ghost containing Call Follow-Ups, our Call Follow-Ups gets no −50. Cooper, which has no punctuation, does. **PROVEN**
- There are at least 6 normalizers:
  - `tipBanName` in play_loop.
  - A duplicate `tipBanName` in seat_table.
  - `counters.normName`.
  - `ghosts.normName`.
  - `nameOf().toLowerCase()`.
  - Ad-hoc `String(name).toLowerCase()` regexes.
- `ghostHasEcho` (L1159) detects echo boards by name (meeting recap or call follow). It misses Cooper and X Brief echo ghosts in 989 of 3743 fights vs echo-named boards, so the `avoidEcho` gates never fire for them. **PROVEN**

### PL-12 MEDIUM: freeze and feed after a reroll use the old shop; potato is modelled wrongly
- P7 pushes `reroll` (L2126) and then picks `freezeCand` from the **pre-reroll** `pets` (L2131–2148), so it freezes a random new offer. P6 FIX-4 rerolls (L1799) and P5 then feeds (L2085). A reroll also re-rolls the food (client reducer).
- Data: 357 plans froze after a reroll and 290 fed after a reroll (`after_reroll.py`). The server rejected 87 feeds with `invalid_action`. **PROVEN**
- Potato is modelled as a permanent +1/+1 (L2089–2092), and the survival check uses hp+1 (L2064–2067). The client reducer's potato is **+2 tempAtk for one battle and removes honey**.
- Potato was the food in 933/9820 shops (9.5%). **PROVEN** (reducer, rated food counts)

### PL-13 MEDIUM: the stale-result heuristic is wrong, and when it fires it skips the reset (L2718–2746)
- A series ends at 2 wins or after round index 2 (`battleDone: 2===you||2===them||2===round`). So `max(wins)>=3` can never be true and `you+them<5` is always true. The test reduces to `eloDelta==null`.
- It fired once, at 07:00:07Z, on a **real 2-1 win**: 1 of 1 was a false positive.
  - The win was never recorded.
  - It restarted, and the `continue` skipped the context reset.
  - The next match inherited the previous `recipeId`, ghost and arch (`recipe_unstick … mismatch:true`). **PROVEN**

### PL-14 MEDIUM: recordResult and ledger telemetry is wrong (L2496–2619)
- `plan:'tempo'` is hardcoded (L2512): 3900 of 3919 win strategies say tempo, although 629 matches used recipes.
- The `kit` field stores kitText prose.
- `curve` is always null and `opponent_tier` is always 'unknown'.
- `food:'potato'` is never recorded, because potato is cleared after battle.
- Every draw gets `avoid:'echo-mirror draw farm'`.
- `ledger.record` files draws under `strategies/losses`: 460 draw files.
- Seven results were recorded twice within 300 ms. That points to concurrent processes, and there is no single-instance lock (**INFERRED** cause). **PROVEN** counts

### PL-15 MEDIUM: the 1-1 decider logic is half dead
- `ghostRemap` (L1303–1308) can never be true: `lastFightTheirFp` and `matchCtx.ghostFp` are the same `g.fp` by construction. `ghost_remap` appeared 0 times in 9821 plans, while `decider_11` appeared 255 times. **PROVEN**
- The decider −16 tip demotion and the +6 wall prefer now sit inside `if(false)`, but the tryPick and P6 decider gates are still live.

### PL-16 MEDIUM: matchCtx field hygiene (`ctx.py`)
- Declared but never used: `bails*`.
- Written but never read: `counterLogged`, `hedgeSecondary`.
- **Read but never written**: `pendingTheirSeats` (L2828). A fight stashed on reconnect therefore always logs `theirSeats: null`.
- Used but never declared: `scoutArch`, `scoutKits`, `scoutPrior`, `theirKits`, `hedgeReplies`.

**PROVEN**

### PL-17 MEDIUM: arch is computed twice per shop, with different classifiers
- `planShopSmart` sets `counterArch` via `counters.planFromSeats`, which has call-coach and imogen+writing+wtd name overrides (L2209–2224).
- `planShop`'s `resolveCounterPlan` then overwrites it with `hedgePlan`, which uses kits only (L596–603).
- `ghost_seen` uses `planFromKits`.
- `arch_refresh` never fired (0 events), so the "LIVE REFRESH" block is dead in practice.
- `biasScore` is called without `ourBoard` (L1026). As a result `preferTeeth` is always boosted, which contradicts `counters.effectivePrefer`'s own contract. **PROVEN**

### PL-18 MEDIUM: advanceBattle and crash handling
- On a `battleDone` error (L2441–2446), `advanceBattle` waits 12 s for 'shop', then 8 s for 'result', then rethrows, which crashes the process.
- 46 `error` crashes in the logs:
  - 11 were HTTP 429.
  - 34 were `ReferenceError`s ("unit/k is not defined") in scoreUnit, from untested live edits at 11:29–11:48Z and 22:32–22:38Z.
- After 8 loops still in battle, `settlePendingFight` labels the fight 'draw'. The real winner is available as `phase.winner`. **PROVEN** (logs, code)

### PL-19 MEDIUM: `--dry` is not dry
- The batch-restart branch (L2777–2797) sends `restart` and `start` with no `DRY` guard when `--games ≥2`.
- Dry runs also write `match_start`, `shop` and `result` rows to `data/decisions`. **PROVEN** (code)

### PL-20 MEDIUM: the smoke test is stale and blind
Running `run_smoke.js` against the arena-stubbed scratch copy **PROVEN**:
- 2 of 12 checks fail:
  - `no_recipe_planner`, the tripwire for PL-01.
  - `counters_hedge_no_prefer_union`: 'sting' is no longer in grow_scale's preferTeeth.
- It tests only `planShop`. There are 0 tests of `planShopSmart`, which made 97% of G plans.
- It cannot run without `playwright-core`, because `play_loop` requires `arena`, which requires `cdp`.
- Its anti-mirror test uses the raw name 'call follow-ups', so it passes while PL-11 is live.

### PL-21 LOW: redundant moves and failed actions
- 2104 of 9683 move POSTs (21.7%) cancel each other out, and 95 plans' moves are a net identity (`moves.py`). The seatBoard bubble swaps adjacent hype/hype pairs back and forth.
- `applyActions` has a `/409/` regex (L2424) that is dead, because `arena.unwrap` treats 409 as success. A stale-version action is therefore silently reported as applied. **PROVEN** (code, logs)

### PL-22 LOW: planShopSmart telemetry lies
- Recipe plans report the unexecuted heuristic's `policyPhase`, `teethOk`, `frontSurvival` and threat (L2368–2373).
- `boardPreview` is the pre-buy board, because `[] || …` never falls through (L2365). It is `[]` at R0.
- The fallback `reason` drops the heuristic's bits (policy_fill3, opener, tip_refuse, decider) since era F.
- `plan.missing` is logged but never set.
- `planShop` always runs and mutates `matchCtx` even when its plan is thrown away. **PROVEN**

### PL-23 LOW: patch-on-patch evolution and per-opponent overfitting
- The file grew from 814 lines (`.bak`, 09-17 21:41 local) to 3093 lines across 12 snapshots in about 27.5 hours.
- There are 39 live `DATA <handle>` / `FIX n` / study patch comments. Hard arch-wide gates are justified by single opponents: dlsusco L1438, mfatikk L1447, rywelski L1482, aj121503 L1499, thewife_ L1513, converse L1520, gavin/mfh/nick L1534, tspmethod L1592/1879.
- The jason2reynolds ghost is hardcoded in comments and `GHOST_PUNISH`.
- About 108 hand-tuned numeric literals sit in the live scoring: 48 in scoreUnit, 20 in frontSeatScore, 7 in spineGapBonus and 33 in planShop.
- This contradicts CLAUDE.md's "No per-handle rules". **PROVEN**

### PL-24 LOW (INFERRED): an empty board can loop forever
- `skip_fight` (L3042) never sends `endShop` with an empty board.
- If gold reaches 0 with an empty board, for example after recipe rerolls when every offer is GHOST_PUNISH, the loop spins with no sleep. The reducer only allows a forfeit `endShop` in that state.
- Observed twice (05:05Z, 05:25Z). Both recovered only because gold was left.

### Stale comments that contradict the code (PROVEN, read)
| line | comment | what the code does |
|---|---|---|
| L54–58 | refuse if blocklisted | always plays |
| L64 | "Never restart/start" | the body calls `start` |
| L136–139 | "force restart" | keeps waiting instead |
| L331 | "HARD tips only" | the list holds 12 non-hard names |
| L357–360 | "hard-banned on hype_battery elsewhere" | returns true for every arch except glass and flamingo |
| L653 | "Webby/NYC/Copy Humanizer are kit=bulk" | Copy Humanizer is flamingo, and NYC is not in the predicate |
| L455 | "Real kitIds from catalog" | the set includes `brace` |
| L1283 | "Recipes disabled" | recipes are enabled |
| L1712 | "Imogen bleed on ALL arches" | Imogen is refused only on hurt_revenge |
| L2287 | "never lock … imogen recipes" | the regex has no imogen |
| L2631 | "Fresh match context each game" | runs once per process |
| L2675, L2758, L3035–3036 | refuse and blocklist | disabled |
| L1028 | "≤0.2×" | L1030 applies a flat −5 |

---

## A. Rules that touch one P0 buy (live code only)
- **Score terms.**
  - `scoreUnit` has 36 terms: L621, 625 (seat_table, 5 branches), 628, 633, 637, 638, 641, 642, 644, 645, 646, 647, 648, 649, 650, 652–656, 657, 658–663, 993, 995, 996, 998–1003, 1004, 1005, 1007, 1008, 1011, 1015, 1016, 1018–1019, 1020, 1021, 1022, 1026 (`biasScore`, 3 branches), 1030–1032 and 1033–1036.
  - `spineGapBonus` adds 7 more (L1265–1273).
- **Hard gates in `tryPick`.** There are 22 live gates: cost, GHOST_PUNISH, `alwaysRefuseBuy`, name mirror, wake dup, echo≥2, echo avoidEcho, hype≥2, flamingo, tipPunish, decider, R0 priorWall, and 8 arch kit lists (glass/wake/bulk_echo/chip; chip; echo_hype/wake_chip; buff_suicide; bulk_echo; backline), plus 2 wake duplicates. 3 more are dead (`!needFill`).
- **Fallback gates.** 4 more, duplicated once.
- **`pushBuy` gates.** 2 more: `alwaysRefuseBuy` again and the dupSoft regex.
- **Triggers.** The opener-reroll and underfill-reroll triggers.
- **Total:** ≥70 rules. After that, 3 force-sell sweeps, P1, P4, P6, the emergency fill and the recipe path each re-decide with **their own** filters.

## B. Recommended structure for the rewrite
1. Delete the recipe path, the refuse and bail remnants, both `if(false)` blocks and the dead helpers (about 700 lines).
2. One `newMatchCtx()`.
3. One name normalizer, used for ghosts, lists and the shop.
4. One candidate filter, used everywhere, including the emergency fill.
5. Planner state that exactly mirrors the reducer: buys append, reroll re-rolls food, potato is +2 tempAtk.
6. Replan until there is no reroll, holding gold back for missing seats.
7. Ghost memory keyed by `(handle, round)`. Predict "same opponent", and search buys and orders against the exact board with a port of `simulateBattle`. Fall back to one simple spine policy when the board is unknown.
8. Tests on `planShopSmart` and on a replay of recorded shops.

## Scripts
Everything is in `scratchpad/audit/pl/`: `load.py`, `eras.py`, `eras2.py`, `rating_join.py`, `reasons.py`, `fight_by_reason*.py`, `short_board.py`, `reroll_waste.py`, `gold_end.py`, `fillreroll.py`, `opener.py`, `ghost_drift.py`, `ghost_by_round.py`, `first_game.py`, `stale_arch.py`, `r0_stale.py`, `emergency.py`, `emerg_refuse.js`, `desync.py`, `append_check.py`, `after_reroll.py`, `sell_nothing.py`, `recipe_completion.py`, `moves.py`, `noop_actions.py`, `winner_check.py`, `usage.py`, `ctx.py`, `braces.py`, `magic.py`, `seat_substr.js`, `harness.js`, `scenarios.js`, `scen2.js`, `scen3.js`, `run_smoke.js`. The scratch code copy is in `repo/`.
