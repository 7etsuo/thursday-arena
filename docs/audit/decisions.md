# DEC audit: shop-decision quality and runtime reliability

> **Historical audit (2026-09-19, before the simulator rewrite).** “Current” and “live” below
> refer to the old code at the audit cutoff, not the code in this repo today. The old data is in
> `archive/legacy-2026-09-19/`; the audit scripts are in the scratchpad path described below.
> See [AGENTS.md](../../AGENTS.md) and [HISTORY.md](../HISTORY.md) for the implemented rewrite.

Scope: every shop decision and runtime event since the data wipe (2026-09-18T11:06:37Z to 2026-09-19T07:28Z). That covers 3,991 matches, 9,770 fights, 16,849 shop plans, 49,969 applied actions and 514 climb batch logs.
Repo: `/home/tetsuo/grok/thursday-arena`. It was read only; nothing under it was modified.
Scripts: `audit/dec/` (see "Reproduce" at the end). The offline planner replay runs against an isolated copy in `audit/dec/harness/repo`.

Evidence labels:
- **PROVEN** means computed directly from logs or read directly from code.
- **INFERRED** means a model, a mechanism or a causal reading of a correlation.

Win rates carry a Wilson 95% CI.

---

## 0. Headline numbers (read these first)

| Fact | Number | Label |
|---|---|---|
| Round WR when we fight with 3 units at R0 | 2107/3287 = 64.1% [62.4, 65.7] | PROVEN |
| Round WR when we fight with 2 units at R0 | 112/606 = 18.5% [15.6, 21.8] (1 unit: 0/38) | PROVEN |
| Underfilled fights ("never fight short" violated) | 680/9674 = 7.0% overall; 22–46% of shops in every 10-min bucket after 04:50Z; live code 54/115 shops, **48/48 R0** | PROVEN |
| Current live planner on a fresh R0 shop (offline replay, 1000 sims) | recipe path 1000/1000, ends R0 with **2 units 999/1000** | PROVEN (replay) |
| Recipe vs policy matches in the same era (≥04:50Z) | recipe 232/629 = 36.9% [33.2, 40.7], −923 elo · policy 59/87 = 67.8% [57.4, 76.7], +551 elo | PROVEN |
| Opponent boards are deterministic per (handle, round) | modal board share 94.7% / 96.0% / 84.8% at R0/R1/R2 (opponents with ≥5 sightings) | PROVEN |
| Matches that are an immediate rematch of the same handle | 3148/3988 = 78.9% | PROVEN |
| Shops planned against the board actually faced | 1578/9674 = 16.3%. A (handle, round) memory would have matched the board in 8363/9674 = 86.4% of shops, with 97.9% precision | PROVEN |
| Learning on repeated boards | R0 WR is 56.5% the first time we face a board and 48.8% on the 10th+ time. There is no improvement. | PROVEN |
| Elo economics before the collapse (<04:00Z 9/19, n=3121) | WR 81.0%, avg win +4.8, loss −26.0, draw −10.5; **net +122 elo (break-even WR = 80.9%)** | PROVEN |
| Share of match losses that start with a lost R0 | 540/761 = 71% (R0 lost → match lost 52%; R0 won → match WR 92.8%) | PROVEN |
| Shops ending with ≥3 gold unspent (gold does not carry over) | 2088/9674 = 21.6%; lost R2 rounds 301/495 = 60.8% | PROVEN |
| Code-era match WR | E1–E3 80–84% · E4 71.0% · E5 (recipes re-enabled) 42.8% · **E6 live code 3/49 = 6.1% [2.1, 16.5]** (confounded by the season reset and stronger opponents) | PROVEN / confound noted |

The bottom line for my lens:
- The bot loses most of its elo to four things:
  1. R0 boards fielded with 2 units.
  2. A recipe planner that buys nothing and rerolls.
  3. A planner that counters the previous round's board instead of the next one, which is known in advance.
  4. Name ban lists that its own data contradicts.
- Before the collapse the bot won 81% and still made about zero elo. The objective has to be "never lose R0 / never draw", not win rate.

---

## 1. Data notes (read before trusting any number)

- **Per-shop join (PROVEN).** `data/decisions/events.jsonl` events are grouped by `matchId` and `shopSeq`. The `fight` event carries the same `shopSeq` as the shop that produced the board. The result is 9,831 shop turns, 9,770 with a fight (`shops.py` → `shops.jsonl`).
- **Action replay validation (PROVEN).** I replayed every applied action on the logged board (`sim.py`), with buys appended to the end as in the game reducer. The replayed board matched the server's post-action board string in 29,634 of 29,652 cases (99.94%).
- **End-of-shop gold is not logged anywhere.** I inferred it as the last `applied.goldAfter` minus the cost of units that appear in the fight board but not in `boardAfter` (the emergency buys). The inferred emergency buys (1,198 units) agree with the 1,197 `emergency_buy` stdout events.
- **Orphan matchIds (PROVEN).** 92 matchIds (96 fights, 239 shops) have no result. They come from a crash and resume re-creating the matchId (see DEC-15). They are excluded from match-level figures.
- **Game rules used, read from the client reducer `sapMatchReducer` in `scratchpad/site/1ou4egaetj-op.js` (PROVEN):**
  - Gold is 10 per shop and never carries over.
  - A bought unit is **appended** to the board (`[...e.board, a]`).
  - Food is consumed on feed (`shop.food = null`), and a reroll re-rolls the food as well.
  - Honey means "Faint: summon a 1/1 Drone".
  - Potato gives **+2 attack this round only** (`tempAtk + 2`) and **sets `honey: false`**.
  - Honey removes potato.
  - Re-feeding the same boost is invalid (`alreadyHasBoost`).
  - A match ends at 2 wins or after round index 2.

---

## 2. Findings

### DEC-01: The recipe planner starves boards and cost the collapse. Delete it. (critical)

- **Evidence (PROVEN):**
  - The recipe path was disabled until about 04:50Z on 9/19: the "RECIPE PLANNER DISABLED" marker exists in every `.bak` file and not in the live file. Recipe shops per 10-min bucket went from 0 to 37–170 after 04:50Z (`collapse2.py`).
  - Same era (≥04:50Z), round level (`recipe_vs_policy.py`):

    | Round | Recipe path | Policy path |
    |---|---|---|
    | R0 | 84/448 = 18.8% [15.4, 22.6], underfilled 445/448 | 146/269 = 54.3% [48.3, 60.1], underfilled 44/269 |
    | R1 | 46.6% (n=592) | 64.8% (n=125) |
    | R2 | 37.0% (n=384) | 61.9% (n=21) |

  - All time, round WR by recipe "why":
    - `arch:` 356/1027 = 34.7%
    - `ghost_matchup` 117/316 = 37.0%
    - `global_hot` 29/81 = 35.8%
    - policy 5748/8346 = 68.9%
  - Match level, same era: recipe 36.9% (n=629, −923 elo) vs policy 67.8% (n=87, +551 elo) (`eras.py`, `recipe_vs_policy.py`).
  - R1/R2 recipe shops end with ≥3 gold unspent in 914/971 = 94.1% (mean 6.06 gold). 709 of those shops did nothing but reroll twice: no buy, no feed (`feed2.py`, this report's gold breakdown).
  - Offline replay of the **current** code (`harness/r0_sim.js`, 1000 random R0 shops from the empirical 36-bot R0 pool): `recipe+global_hot` was chosen 1000/1000, two rerolls in 999/1000, and the board ended with **2 units in 999/1000**, with mean 2.0 gold left. This matches the live data (48/48 R0 shops underfilled under E6).
  - Top recipes by volume all lose:
    - `recipe-imogen__cooper__wtd` 83/224 = 37.1%
    - `recipe-copy-humanizer__writing-bot__wtd` 26/75 = 34.7%
    - `recipe-copy-humanizer__event-request-desk__projects-manager` 10/39 = 25.6%
- **Mechanism (PROVEN, code):**
  - `lib/recipes.js:371-381` `planTowardRecipe` buys only named pieces and returns `reroll` whenever any piece is missing. It never fills with anything else, never feeds while pieces are missing, and never checks gold.
  - `driver/play_loop.js:2342-2375` returns early from the recipe path and skips fill, food and seating.
  - At R0 with no opponent info, `pickRecipe` falls back to `global_hot`. It is not skipped, because `scouted` is false (`play_loop.js:2226,2276`).
  - `recipes.recordOutcome` (`lib/recipes.js:106`) records every final board, from losses too, as a "recipe". The 3,191 recipe files are just every final board ever seen, scored on tiny samples.
- **Fix:**
  - Delete `planTowardRecipe`, `pickRecipe`, `recordOutcome`, the seed recipes and `memory/recipes/`.
  - Delete the recipe branch in `planShopSmart` (`play_loop.js:2228-2377`).

### DEC-02: "Never fight short" is violated, mostly at R0, where it is lethal. (critical)

- **Evidence (PROVEN)** (`underfill.py`, `reroll.py`, the R0 reroll split, `harness/r0_sim_policy.js`):
  - Board size at the fight, by round:

    | Round | 1 unit | 2 units | 3 units |
    |---|---|---|---|
    | R0 | 0/38 | 112/606 = 18.5% [15.6, 21.8] | 2107/3287 = 64.1% [62.4, 65.7] |
    | R1 | – | 6/34 = 17.6% | 73.0% |

  - Underfill rate over time: 2–4% per hour before 04:50Z, then 12–46% per 10-min bucket after it. Live code: 54/115 shops underfilled, including every R0 shop (48/48).
  - **Every** R0 shop with ≥2 rerolls fought short: 632/632, round WR 110/632 = 17.4%. With one reroll and a full board, R0 WR is 69.5% (1074/1546). With no reroll, 59.2%.
  - Root causes:
    1. **Reroll budget.** Two rerolls at R0 leave ≤8 gold, which buys at most 2 more units when the board still needs 3. Sources: `P0_opener_reroll` (`play_loop.js:1391`), then `P0_fill_reroll` (`play_loop.js:1614-1631`), or the recipe fishing reroll.
    2. **The loop replans only once after a reroll** (`play_loop.js:2903`), so the second reroll's shop is never planned. The emergency fill (`:2939-2971`) then has ≤8 gold.
    3. **The refuse lists reject 14 of the 36 R0 bots (39%)**: `seat_table.shouldRefuseBuy(name, null)`. In 77% of R0 shops at least one offer is refused. Offline replay of the current **policy-only** planner (`r0_sim_policy.js`) still ends R0 with 2 units in **542/1000** simulations. The historical policy-era R0 underfill was 2–5%, so the new `seat_table` (07:20Z) regressed the policy path too.
    4. **Silent `pushBuy` refusal loop** (`play_loop.js:1353-1360` with `1408-1611`). `tryPick` keeps returning a "dupSoft" name (NYC Parent / Flora / Company Docs / CCM duplicate) that `pushBuy` refuses. The 4-iteration guard burns out and the plan rerolls. Replay (`harness/dup_soft_test.js`): board [NYC Parent], offers [NYC Parent, Writing Bot, Imogen], 7 gold. The planner buys Imogen and **rerolls without buying the affordable Writing Bot**.
    5. **Force-sells with no refill.** The tip force-sell (`:1709-1753`) and the P1 front-sell (`:1683-1691`) have no fill guard. 84 policy plans deliberately ended with <3 units and no reroll (`policyPhase=seat`, `boardPreview` length <3).
- **Fix:**
  - At R0, buy 3 first (9 gold). Allow one reroll only when gold after the reroll still covers the missing units.
  - Replan after **every** reroll until no action is worth taking.
  - A sell is legal only if a replacement buy in the same plan is affordable.
  - "Refuse" may demote a unit but must never leave the board short. Any 3rd unit beats no 3rd unit: the worst unit has a stratified effect of −28 pts versus −45 pts for fighting with 2.

### DEC-03: The planner counters the wrong board. Opponents are deterministic replays and the bot never uses that. (critical)

- **Evidence (PROVEN)** (`ghost_determinism.py`, `handle_lag.py`, `stale_ghost.py`, `learning.py`, `arch_accuracy.py`):
  - For opponents seen ≥5 times, the board at fight index 0/1/2 equals that opponent's modal board 94.7% / 96.0% / 84.8% of the time (n = 3942 / 3886 / 1256). Examples: `cibaru` R0 = "meeting recap deck | cooper | skippy" 45/45; `_tech_lord` R1 = "imogen | the morning newspaper | call follow ups" 42/42.
  - 78.9% of matches (3148/3988) are against the same handle as the previous match.
  - The handle is unknown during R0 shopping: `match_start.handle` is null in 3558/3988 matches and is the *previous* opponent in 69. The batch loop nulls `matchCtx.handle` after `restart` (`play_loop.js:2802`), and the shop state has no opponent field.
  - The planner's `ghostFp` equals the board actually faced in only **1578/9674 shops (16.3%)**:

    | Round | Planned against the actual board | Stale board | No board |
    |---|---|---|---|
    | R0 | 51 | 323 | 3557 |
    | R1 | 1054 | 2908 | – |
    | R2 | 473 | 1308 | – |

    From R1 on it plans against the **previous round's** board: `matchCtx.ghostFp = g.fp` at endShop (`:2997`). Yet opponents switch boards every round, and the classified archetype changes between consecutive rounds in 2254/3939 matches (57%).
  - A plain `(handle, round) → last board` memory would have held the exact next board in 8546 shops and been right in 8363 (97.9% precision; 86.4% of all shops).
  - The whole arch-counter layer shows **no measurable effect**. R1/R2 rounds where the planner's arch equalled the arch actually faced: 2126/3053 = 69.6% [68.0, 71.2]. Arch wrong: 1836/2664 = 68.9% [67.1, 70.6].
  - Exact-board knowledge does correlate with wins. Policy rounds whose planned-against board equalled the board faced: 1006/1257 = 80.0% [77.7, 82.1], versus 2573/3540 = 72.7% [71.2, 74.1] otherwise. (Causal reading INFERRED; boards that repeat may belong to weaker ghosts.)
  - **No learning.** Round WR against an identical opponent board (same handle, round, names and stats), by encounter number:

    | Round | 1st time | 2nd–3rd | 4th–9th | 10th+ |
    |---|---|---|---|---|
    | R0 | 56.5% [52.0, 60.9] | 59.9% | 57.9% | 48.8% [45.2, 52.5] |
    | R1 | 72.0% | 73.4% | 73.5% | 69.2% |
    | R2 | 59.6% | 66.3% | 64.8% | 43.3% (n=120) |

    The 917 ghost files, 3.2k recipe files and scout dossiers buy nothing.
- **Fix:**
  - Key memory by `(handle, roundIndex)` and store the exact board with stats.
  - Carry the result-screen `opponentHandle` into the next match as the R0 prior; it is right about 79% of the time.
  - Plan every shop against the **next** round's known board, ideally by simulating candidate boards with the client battle simulator (engine lens).
  - Delete the archetype classifier path from shop decisions.

### DEC-04: A stale `scoutArch` leaks across matches in a batch and drives R0 buys for the wrong opponent. (high)

- **Evidence (PROVEN):**
  - Since 04:58Z, 612 of 687 R0 shops carried an archetype tag even though the shop had no opponent information (`ghostArch` null): 374 as `recipe+arch:X` and 238 as `policy_v1+X`.
  - In the 374 recipe cases, X matched the actual R0 opponent's arch only 110 times (29%) (`arch_accuracy.py`).
- **Mechanism (PROVEN, code):**
  - The in-process batch reset (`play_loop.js:2802-2813`) does not reset `scoutArch`, `scoutPrior`, `scoutKits`, `recipeWhy`, `hedgeReplies` or `hedgeSecondary`.
  - The full reset at `:2632-2644` runs only once, because the outer loop `break`s at `:3054`.
  - `scoutArch` is then read by `alwaysRefuseBuy` (`:322`), `scoreUnit` (`:624`) and `planShopSmart` (`:2225`). In `planShopSmart` it makes `scouted = true` and picks an `arch:` recipe at R0 for an opponent that has not been seen.
- **Fix:** keep one `resetMatch()` function that rebuilds the whole context object, and call it at every match start.

### DEC-05: The planner's internal board diverges from the server, so sells, feeds and moves hit the wrong units. (high)

- **Evidence (PROVEN):**
  - `pushBuy(wall, true)` does `board.unshift(unit)` (`play_loop.js:1374`, called at `:1694`), but the server appends bought units at the end. Every later index-based action in the same plan is off by one.
  - Comparing the planner's `boardPreview` with the server's `boardAfter` (`divergence.py`): 196 policy plans ended with a **different set of units** than intended, and 228 more had the wrong order.
  - In 189 of the 196, a sell followed a buy. The unit most often lost was the one just bought. Example: match `m_mu6uu8pw_d957` seq 2 sold Love, bought the NYC Parent wall, then "sold index 2", intending Deal Hunting, which **sold the NYC Parent just bought**.
  - Those rounds won 100/196 = 51.0% [44.1, 57.9], against about 73% for R1 overall.
  - This also explains the 124 "bought and sold in the same shop" events (`churn.py`).
- **Fix:** model the board exactly as the reducer does: append on buy, splice on sell, swap on move. Emit move actions to bring a new wall to the front. Better still, derive every action index from a simulated state after each step.

### DEC-06: Gold is left on the table every round; the policy path is structurally capped. (high)

- **Evidence (PROVEN)** (`gold.py`, `reroll.py`, `stats.py`):
  - Gold never carries over, yet 2088/9674 shops (21.6%) ended with ≥3 gold and 1414 with ≥5.
  - Share of shops ending with ≥3 gold, by round and outcome:

    | Round | Won | Lost |
    |---|---|---|
    | R1 | 24.9% | 47.8% |
    | R2 | 37.4% | 60.8% |

    Mean end gold in lost R2 rounds is 4.49, and 45% of lost R2 rounds ended with ≥6 gold.
  - On the policy path, 23.8% of R1/R2 shops end with ≥3 gold. The typical pattern is `sell + buy + feed`, which leaves 5 gold.
    - P6 allows one sell→buy (`for (guard < 1)`, `play_loop.js:1757`).
    - There is one feed, even though a reroll brings a new food.
    - The P7 reroll is followed by a single replan (`:2903`).
  - 2086/9674 shops (21.6%) ended with a reroll as the last action. That shop was never evaluated, and mean end gold was 3.97.
  - Stat difference is the dominant predictor of the round:

    | Our stats minus theirs | Round WR |
    |---|---|
    | −8 | 6.5% |
    | −2 | 48.3% |
    | 0 | 61.9% |
    | +2 | 75.8% |
    | +4 | 86.2% |
    | +8 | 97.7% |

  - Our board grows only +1.52 stats from R1 to R2, against +2.36 for opponents.
- **INFERRED:** turning every 3 unspent gold into +2 stats (an apple) would, on the empirical diff→WR curve, add about +335 round wins (+3.5 pts round WR) over the dataset.
- **Fix:** loop plan → apply → observe until no action has positive value. Treat the last shop of the series as "spend to zero". Allow feed → reroll → feed.

### DEC-07: The emergency fill bypasses every buy gate, so the refuse lists only convert good-gold buys into worse ones. (high)

- **Evidence (PROVEN)** (`emergency_extract.py`, `emerg_refuse.js`):
  - The emergency fill (`play_loop.js:2939-2971`) scores with `scoreUnit` and excludes only `GHOST_PUNISH`.
  - It ran in 869 shops and bought 1198 units. 392 of them (33%) are units the current `seat_table.shouldRefuseBuy` refuses; 361 are global refuses. The most common were Company Docs Q&A (55), X Brief (34), Pipeline Pulse (33), Flora (27), Signal Prospector (27) and Event Request Desk (23).
  - Round WR in shops with an emergency buy: 265/869 = 30.5% [27.5, 33.6]. In shops where the emergency buy was a refused unit: 74/338 = 21.9%.
  - 80 emergency-bought units were sold the next shop (churn, `churn.py`).
- **Fix:** delete the separate emergency path and let one planner fill to 3, with a hard budget rule (DEC-02).

### DEC-08: The name ban/prefer tables and several hard rules are contradicted by the bot's own data. (high)

- **Method (PROVEN numbers; causal reading INFERRED):**
  - Mantel-Haenszel risk difference for a round win, stratified by the **exact opponent board and stats plus the round index** (`unit_effect.py`, `rules_test.py`).
  - Within a stratum, the only difference is our board. Units are confounded with the rest of our board, but opponent strength is controlled.
- **Globally refused (`lib/seat_table.js` `GLOBAL_REFUSE` / `TIPS_ALWAYS`) but neutral or positive:**
  - Sales Call Coach +4.7 pts (n=115)
  - Nightly Audit Engineer +3.1 (n=225)
  - X Brief −0.3 (n=819)
  - Company Docs Q&A −2.6 (n=1229)
  - Stills & Clips −3.0 (n=523)
  - Video Edit −3.7 (n=497)
  - Flora −3.9 (n=697)
  - Love −5.3 (n=577)
- **Not globally refused but worst:** EBR & Value Deck Builder −40.2 (n=63, only arch-gated). Deal Hunting −28.4 and Hiring Signals −24.1 are refused correctly.
- **Arch tables contradicted:**
  - `glass_burst.prefer` includes Outbound Prospecting (−8.0, n=141) and Luma Pages (−6.0, n=227).
  - `glass_burst.refuse` includes Sales Call Coach (+9.3, n=25).
  - `hype_battery.refuse` includes Writing Bot (+14.2, n=22), Luma (+13.8, n=20) and Meeting Recap (+13.2, n=20). These samples are small.
- **Hard heuristics contradicted:**
  - The anti-mirror −50 penalty (`play_loop.js:632-633`), plus the mirror exclusions in fill, P6, teeth and freeze: fielding a unit the opponent also has is **+2.3 pts** (n=1283).
  - "Echo vs echo is a draw machine" (`:995,1011`; fill ban `:1427`): our echo against echo ghosts is **+8.6 pts** win and −2.4 pts draws (n=1120).
  - The "never 2 echo" cap (`:1426`): +8.0 pts (n=409).
  - "Never flamingo into flamingo" (`:1429-1436,1774-1779`): **+16.9 pts** (n=158).
- **Rules the data confirms:**
  - Glass front (hp ≤3) is −26.2 pts (n=94).
  - Front bulk / hold_the_line is +7.6 pts (n=3367).
- **Contradictions between the code's own lists:**
  - `glass_burst` *prefers* Stills, Luma and Outbound in `seat_table`. But the P0 fill *refuses* them on glass_burst through `isGlassWakeTipName`, which calls `isHardTipBanName` (`play_loop.js:1463-1480`, list at `:225-241`). And `isWallPunishTipKit` treats `wake` (Stills) as a tip.
  - "Product Support Inbox Assistant" is in both `TIPS_ALWAYS` (always refuse) and `TIPS_ARCH_GATED` (allowed when preferred).
- **Fix:**
  - Drop all name lists.
  - Keep at most two structural rules that are validated (no glass front, prefer a bulk/hold front).
  - Choose buys by simulating against the known next board.

### DEC-09: Potato is modelled wrong; it strips honey and double-feeds. (medium)

- **Evidence (PROVEN):**
  - The planner treats potato as a permanent +1/+1 (`play_loop.js:2089-2092`). It targets the front and runs a survival check with `hp + 1` (`:2047-2073`).
  - The game gives +2 ATK for this round only and sets `honey: false`.
  - There were 1190 potato feeds, 955 of them onto seat 0.
  - **74 potatoes were fed onto honeyed units.** The server removed the honey in 72 of those 74 (checked on the post-action board).
  - The decision log has 90 skipped actions (88 `action_skipped` lines in stdout), all `invalid_action`: 78 are potato re-feeds onto a unit that already had potato, 11 are honey onto an already-honeyed unit, and 1 is a buy (`feed.py`, `feed2.py`).
  - Separately, in 28 feeds the planner had <3 real gold. The server silently no-oped them.
- **Fix:**
  - Model food exactly as the reducer does.
  - Never potato a honeyed unit.
  - Use potato only on the unit whose extra attack changes the simulated outcome of this round.

### DEC-10: Actions after a reroll use the pre-reroll shop and food. (medium)

- **Evidence (PROVEN)** (`freeze.py`, `feed_after_reroll.py`):
  - 357 freezes were emitted after a reroll in the same action list: P7 reroll `:2126`, then freeze `:2147`. In 246 of them the offer actually frozen was not the one evaluated (only 4 were the same).
  - 290 feeds were emitted after a reroll: P6 "tip-only shop" reroll `:1799`, then P5 feed `:2027`. The food applied differed from the food planned in **191 of 290**. For example, planned honey became apple (41) or potato (36), and planned apple became honey (56).
- **Fix:** a reroll is always the last action of a plan. Then observe and replan.

### DEC-11: Dead, non-functional and self-cancelling decision logic. (medium)

- **Evidence (PROVEN):**
  - **`forceDeciderReplan` / `ghost_remap` never fired: 0 of 789 shops at 1–1.** `ghostRemap` compares `matchCtx.ghostFp` with `lastFightTheirFp`, but both are set from the same endShop fingerprint (`:2997`, `:3025` → `:2479`), so they are always equal (`:1301-1315`).
  - About 330 lines sit inside `if (false) {…}` (`:665-992`), plus another dead block at `:1038-1091`.
  - `refuseRematchBeforeAccept` always returns `refuse:false` and `refuseAbortPause` is unreachable (`:59-180`). There are five `if (false && …)` call sites (`:2680, 2697, 2733, 2768, 2786`) and two `if (true || …)` (`:119, 168`).
  - `weakestBoardIndex` (`:1117`) and `alwaysBleedBan` (`:316`) are never called.
  - The double-wake check is duplicated (`:1541-1544`), and `'pipeline pulse'` appears twice in `HARD_TIP_BAN_NAMES` (`:239-240`).
  - The three `seatBoard` passes undo each other. 150 plans issued moves that net to no order change: 581 wasted API calls (`moves.py`).
  - 1786 of 2970 final-plan freezes (60%) were issued in the match's last shop, where they are useless. Only 539 (18%) led to a purchase (`freeze_waste.py`).
- **Fix:** delete it all. Rebuild seating as one deterministic function (or choose it by simulation).

### DEC-12: Runtime reliability: live edits, no 429 backoff, and crash/restart churn. (medium)

- **Live edits during the climb (PROVEN, `ops.py`):** the code was edited while the loop was running.
  - 9 batches died on `SyntaxError`: 5 "missing )", 3 "Missing initializer", 1 "`kitMirrorDump` already declared".
  - 34 `ReferenceError`s in `scoreUnit`: "unit is not defined" ×24, "k is not defined" ×10.
- **No 429 retry (PROVEN).** 11 fatal `HTTP 429 {"error":"overloaded"}` errors crashed the process mid-match, and 9 more hit `rank_check`. There is no retry or backoff in `lib/cdp.js arenaFetch` or `lib/arena.js unwrap`, whereas the official client wraps rated POSTs in `sendWithRetryAfter` (`scratchpad/site/2yjqnsbsdx9j5.js`). There was also 1 `HTTP 401`.
- **Climb churn (PROVEN):**
  - `climb.log` has 62 `batch_end ok=false`, 15 "Terminated" and 10 "Killed".
  - 65 batch logs have no `batch_done`.
  - The climb loop was restarted 43 times (`climb_start`), and the failure streak reached 14 (the abort limit is 15).
  - `climb_loop.sh` respawns immediately (0–3 s sleep), so it hammers the server during overload.
- **No forfeit found (PROVEN).** A crash mid-shop resumes on the next spawn (`skip_start` ×94). Across 503 rank-check intervals, the leaderboard rating moved −558 and the logged deltas sum to −614, a residual that is boundary timing (`elo_recon.py`).
- **Old refuse sleeps (PROVEN; code now dead).** Earlier code slept 720 s in `soft_rotate_avoid` and ran 20 `refuse_rematch_wait_clear` polls.
- **Speed is fine (PROVEN).** Median match is 8.7 s (p90 12.0), median shop is 2.9 s and median battle advance 0.27 s.
- **Waste per call (PROVEN):**
  - Every API call re-reads and re-parses `catalog.json` and rewrites `api/last_version.json` (`lib/arena.js:38-55`, `lib/enrich.js:8-16`).
  - Each `pickRecipe` reads all 3,191 recipe files (≈74 ms per call, measured).
- **Fix:**
  - Deploy only between batches, behind `node --check` and a working offline test.
  - Add 429/5xx retry that honours Retry-After, and exponential backoff in `climb_loop.sh`.
  - Cache the catalog in memory.

### DEC-13: `stale_result` detection uses an impossible threshold and discards real results. (medium)

- **Evidence (PROVEN):**
  - `settled` requires `max(wins) >= 3` (`play_loop.js:2724`), but a series ends at 2 wins or after 3 rounds.
  - Any real result without `eloDelta` or `settled` is therefore treated as stale and restarted without being recorded.
  - It happened once in the logs: a real 2–1 win at 2026-09-19T07:00:07Z (season-reset moment) was dropped.
- **Fix:** treat a result as final when `phase.kind === 'result'` and the match has any fights. Record it before any restart.

### DEC-14: The catalog is never refreshed, so every name/kit rule is blind to new bots. (low)

- **Evidence (PROVEN):**
  - `arena.getCatalog()` always returns the cached `catalog.json` (72 bots, `lib/arena.js:78-86`).
  - After the 07:00Z season reset, 191 of 2661 offers (7.2%) were bots missing from the catalog. They were logged with raw botId names (e.g. `xSfBSprfKv5h909uzrv7W` ×86) and `kitId ''`.
  - 5 opponent bots are missing from `name_to_kit.json` (x high coach, commitments, memento, coffee companion, shepherd; 55 instances), so they get `kit ''`.
- **Fix:** refresh the catalog at process start and whenever an unknown botId appears.

### DEC-15: Telemetry is misleading, duplicated or missing exactly what is needed. (medium)

- **Misleading or wrong (PROVEN):**
  - **`batch_end` counts double.** `climb_loop.sh:31-33` greps `"result":"win"`, which matches both the `result` and `avoid_note` lines. 229 of 236 OK batches report W+L+D = 30 for 15 games.
  - `match_start.handle` and the first shop's `ghostHandle` are null in 3558/3988 matches and the previous opponent in 69.
  - Shop `ghostSeats` / `ghostFp` hold last round's board, not the opponent being planned against.
  - The recipe path logs the **pre-action** board as `boardPreview`. `play_loop.js:2365` uses `[] || …`, and an empty array is truthy, so it never falls through to `toward.boardPreview`.
  - Strategy JSONs hard-code `plan:'tempo'`, `curve:{r1:null…}` and `opponent_tier:'unknown'` (`:2508-2535`).
- **Missing (PROVEN):**
  - `decision_db.pet()` drops `frozen`, `potato`, `tempAtk` and `uid`, so freezes and potato cannot be audited and duplicate units cannot be told apart.
  - Nothing is logged at endShop: no final gold, final board or emergency buys in the decision DB.
  - No battle frames are logged, only the winner, so it is impossible to see how a round was lost or to validate a simulator.
- **Duplicated and broken (PROVEN):**
  - `data/matchlog/events.jsonl` mirrors the decision DB from 04:30Z with a **different `shopSeq`**: it increments on after-reroll plans too, and `opponent` is null at `match_start`.
  - A crash and resume regenerates `matchId` (`decision_db.beginMatch` at `shopTurns === 0`), which leaves 92 orphan matches.
- **Fix:**
  - Keep one event log with explicit `pre` / `post_action` / `endShop` / `battle` (with frames) / `result` records.
  - Log the server `uid`s and the full unit state.
  - Take the matchId from the server `seed` or version rather than a random id.

### DEC-16: The objective is mis-specified. Win rate is not elo; R0 and draws are the levers. (high, strategy)

- **Evidence (PROVEN)** (`eras.py`, `r0_conditional.py`):
  - Before 04:00Z 9/19 (n=3121) the bot won 81.0% for a **net +122 elo**. Average win +4.8, loss −26.0, draw −10.5; break-even WR is 80.9%.
  - All time: wins +17,585, losses −15,956 and draws −2,263 (322 drawn matches). That is net −634.
  - Match outcome depends heavily on R0:

    | R0 result | Matches | Match WR | Match losses | Elo |
    |---|---|---|---|---|
    | Lost | 1036 | 37.6% | 540 | −9,314 |
    | Drawn | 675 | 62.5% | 109 | −666 |
    | Won | 2218 | **92.8%** | 94 | +9,514 |

    **71% of all match losses (540/761) start with a lost R0.**
  - Series-state tags confirm it. Shops at 0–1 win 51.4% of rounds (n=1327); shops at 1–0 win 79.8% (n=2884).
- **INFERRED:** the highest-value work is making R0 airtight: 3 units always, and a counter to the known R0 board (DEC-02 and DEC-03). After that comes draw avoidance. Tuning R1/R2 heuristics is secondary.

### DEC-17: The current live code (07:21Z) is the worst version yet. Do not run it. (critical, ops)

- **Evidence (PROVEN):**
  - `play_loop.js` / `seat_table.js` / `recipes.js` were modified at 07:20–07:21Z. Since then the bot is 3W-42L-4D (3/49 = 6.1% [2.1, 16.5], −224 elo).
  - The previous code in the same post-reset window (07:00–07:20Z) went 48/124 = 38.7% [30.6, 47.5].
  - Under the live code, 96% of matches ran the recipe path, 54/115 shops were underfilled (48/48 at R0), and round WR was 10.4% / 16.3% / 11.1% at R0/R1/R2.
  - **Confound:** the season reset put the bot against stronger handles, including the #1 player omlejmi. The magnitude is not all code; the underfill is (DEC-01, DEC-02, replay).
- **Fix:** stop the climb. Nothing live should run until DEC-01, DEC-02, DEC-03 and DEC-05 are fixed and pass an offline replay test.

---

## 3. Supporting tables

**Hourly, from `hourly.py`, `collapse.py` and `collapse2.py`:**
- WR was 80–90% from 22Z to 03Z, then fell to 56% (04Z), 44% (05Z), 44% (06Z) and 29% (07Z).
- Average elo per win rose from about +4 to +15–17 after 05Z, which means the opponents were closer in rating.

**Action volume (49,969 applied actions):**

| Action | Count |
|---|---|
| Buy | 15,383 |
| Move | 9,662 |
| Reroll | 9,133 |
| Feed | 7,771 (honey 3,915 · apple 2,666 · potato 1,190) |
| Sell | 4,607 |
| Freeze | 3,323 |
| Skipped with `invalid_action` | 90 |

- No 409s were observed: 33,180 of 33,183 consecutive actions advanced the version by exactly +1.
- The code treats HTTP 409 as success (`lib/arena.js:59-60`), so any future 409 would be silently counted as applied.

**Sells:**
- 3,560 of 4,607 sells were a unit bought in the previous shop (mostly the R1 swap). 124 were bought and sold in the same shop (DEC-05). 9 sold a honeyed unit.
- Round WR at R1 is higher when a sell happens (76.0% vs 59.8%), because the no-sell shops are mostly recipe no-ops.

**Food:**
- No R0 shop ever fed (10 gold = 3 buys + 1).
- Honey placement at the fight, R1: front 386, mid 831, back 1633. There is no clean causal signal on placement; the stratified "any honey" effect is +2.6 pts.

**Front-survival gate:**
- When `frontSurvival` was true the round WR was 76.3% (n=4385); when false, 56.8% (n=412).
- It agrees with the simple actual-matchup check (our front hp > their front atk) in 4143/4797 cases. The gate points the right way, but it is fed the stale board (DEC-03).

---

## 4. Reproduce

All scripts are in `audit/dec/`. Run them in this order.

1. **Base tables:** `python3 shops.py` (builds `shops.jsonl`), then `sim.py` (builds `actions.jsonl`), then `emergency_extract.py` and `r0_offer_pool.py`.
2. **Analyses:**
   - Match and era level: `basics.py`, `handle_lag.py`, `hourly.py`, `collapse.py`, `collapse2.py`, `eras.py`, `runs.py`, `elo_recon.py`
   - Opponent memory and learning: `ghost_determinism.py`, `stale_ghost.py`, `relearn.py`, `learning.py`, `arch_accuracy.py`
   - Gold, rerolls and fill: `gold.py`, `gold2.py`, `reroll.py`, `underfill.py`
   - Actions: `churn.py`, `divergence.py`, `feed.py`, `feed2.py`, `feed_after_reroll.py`, `freeze.py`, `freeze_waste.py`, `moves.py`
   - Outcomes and rules: `stats.py`, `reasons.py`, `recipe_vs_policy.py`, `recipe_churn.py`, `unit_effect.py`, `rules_test.py`, `r0_conditional.py`
   - Ops: `ops.py`
   - Node: `node emerg_refuse.js` (requires the pure `lib/seat_table.js` read-only).
3. **Offline replay of the current planner** (isolated repo copy with a stubbed `playwright-core`; no network or CDP): `cd harness && node r0_sim.js 1000`, `POLICY_ONLY=1 node r0_sim_policy.js 1000`, `node dup_soft_test.js`.
