# OUT: true match outcomes, rating trajectory, and whether each code change helped or hurt

> **Historical audit (2026-09-19, before the simulator rewrite).** “Current” and “live” below
> refer to the old code and results through 07:28Z, not today's bot. The old match logs and
> study files are in `archive/legacy-2026-09-19/`; the audit scripts are in the scratchpad path
> described below. See [AGENTS.md](../../AGENTS.md) and [HISTORY.md](../HISTORY.md) for the
> implemented rewrite and later live results.

Scope: every rated result from the data wipe (2026-09-18T11:06:37Z) to the last logged match (2026-09-19T07:28:35Z), the pre-wipe history kept in `strategies/`, server-side leaderboard checks from `matches/climb/climb.log`, and the claims in the earlier AI's study documents. All scripts are in `scratchpad/audit/outcomes/` and `./run_all.sh` re-runs them. The repo was only read, never written.

Labels: **PROVEN** means computed or read directly. **INFERRED** means reasoned from data without a controlled test. Win rate is W/(W+L) with a Wilson 95% CI. "Score" is (W + 0.5·D)/n, the quantity Elo actually rewards. All times are UTC. The machine's local clock is UTC−6, so bak file names and `climb_start` timestamps were converted.

---

## 0. Headline numbers

| | value |
|---|---|
| Rated results after the wipe (deduplicated) | **3,983**: W 2,904 / L 758 / D 321 (PROVEN) |
| Season 1 after the wipe (11:06Z to 07:00Z) | n=3,805: W 2,852 / L 656 / D 297. Win rate **81.3% [80.0–82.6]**. Score 0.846. **Net Elo −269** (PROVEN) |
| Season 2 (07:00Z to 07:28Z) | n=178: W 52 / L 102 / D 24. Win rate **33.8% [26.8–41.5]**. **−311 Elo in 28 min** (PROVEN) |
| Live code as of the last match (seat_table, from 07:20:33Z) | **4 W / 46 L / 4 D. Win rate 8.0% [3.2–18.8]**, n=54, −264 Elo (PROVEN) |
| Server check vs local log (Season 1 intervals) | server +2,904 W / +747 L / −489 Elo against local 2,900 W / 745 L / −484 Elo. The local log is trustworthy after removing 8 duplicates (PROVEN) |
| Rating path (server) | 1284 (rank 9) at the wipe. **Rank 2 / 1439** at 13:05Z on Sep 18, when the top-3 goal was hit and the climb stopped. Peak 1473 (rank 5) at 00:51Z. **827 (rank 2,466)** at 06:15Z. Season 2 reset to 1000, then **726, rank 34**, record 53–98 at 07:28Z (PROVEN) |
| Opponent pool | Opponent ratings implied by the Elo deltas cluster tightly around **1000** (Season 1 before 04:00: mean 1001, sd 32). The K-factor is 32, confirmed from 478 adjacent win/loss pairs whose deltas sum to 32 or 33 (PROVEN) |
| Rating the bot settles at, given its score s | R ≈ 1000 + 400·log10(s/(1−s)). s = 0.846 gives **≈1300**, which is where it hovered (mean 1322 over 190 rank checks while aiming for #1, never inside the top 3). The #1 rating of 1610 needs **s ≈ 0.97** (PROVEN arithmetic, INFERRED interpretation) |

---

## 1. Reconciling the data sources (PROVEN; `reconcile.py`, `overlap.py`, `server_vs_local.py`)

| source | rows | W / L / D | notes |
|---|---|---|---|
| `matches/log.jsonl` | 3,992 lines = 1 `data_wipe` + 3,991 | 2,908 / 761 / 322 | 1 strategy_id appears twice (`loss-202609190425500`). 8 adjacent near-duplicates (same opponent, board, Elo and result, less than 3 s apart) → **3,983 after dedupe** |
| `data/decisions` `result` | 3,989 | 2,906 / 761 / 322 | 4,080 `match_start` rows. **92 local matchIds were abandoned mid-series and resumed under a new id** |
| `data/matchlog` `match_end` | 832 | 355 / 370 / 107 | **Starts only at 04:30:48Z on Sep 19** (21% of matches). 19 starts have no end |
| climb batch/match logs `result` | 3,986 | 2,905 / 760 / 321 | 5 results in the log have no stdout line (killed processes) |
| `strategies/` | 5,420 files | wins 3,919 / losses 1,041 / draws 460 (in `losses/`) | 3,992 after the wipe and 1,428 before. 31 ids are non-standard (hand-written or cloned, see OUT-18) |
| `index.json` stats | matches 3,992 | 2,908 / 761 / 322 | Counts the `data_wipe` line as a match (update_index.py:60) |
| server (`rank_check`) | — | +2,904 / +747 over the Season 1 intervals | Draws are not counted as W or L. About 4 W and 2 L never reached the local log |

- Result classification is correct. `recordResult` (play_loop.js:2499-2501) uses the same rule as the game client's `matchResult`: you > them → win, series ends at 2 round wins or after round index 2 (client `1ou4egaetj-op.js` battleDone). A final of 1–1 is a real draw; 1–0 and 0–1 are real wins and losses with drawn rounds. The Elo sign is + for every win and − for every loss. Draws are −232 / 0×66 / +24, which matches Elo with a 0.5 score against lower- or higher-rated ghosts. **No result is misclassified.**
- `opponent` is never 'unknown' (0/3,991). `ghost_fp` equals an actual fight board in 3,988/3,988 cases.

---

## 2. The real record

### By season, from `record.py`
| window | n | W | L | D | win rate [CI] | Elo | Elo per match | mean Δ per win / loss / draw |
|---|---|---|---|---|---|---|---|---|
| Season 1 after wipe | 3,805 | 2,852 | 656 | 297 | 81.3% [80.0–82.6] | −269 | −0.07 | +5.8 / −22.3 / −7.8 |
| Season 2 | 178 | 52 | 102 | 24 | 33.8% [26.8–41.5] | −311 | −1.75 | +17.1 / −12.3 / +2.3 |

Series scores in Season 1: 2-0 2,264 · 2-1 485 · 0-2 400 · 1-1 285 · 1-2 198 · 1-0 103 · 0-1 58 · 0-0 12.
Series scores in Season 2: 0-2 70 · 2-0 33 · 1-2 26 · 1-1 24 · 2-1 14 · 0-1 6 · 1-0 5.

### By hour (win rate, then Elo)
Sep 18: 11h 79.6% (−114) · 12h 85.7% (+188) · 13h 100% (+70) · [7.7 h pause after the top-3 goal] · 20h 86.5% (−122) · 21h 78.9% (−72) · 22h 88.6% (+42) · 23h 89.0% (+57).
Sep 19: 00h 90.3% (−50) · 01h 88.8% (−47) · 02h 90.8% (+170) · 03h 93.4% (+28, only 95 matches because of the refuse loop) · **04h 61.1% (−418)** · **05h 51.0%** · **06h 51.4%** · **07h 33.8% (−311)**.
By day: Sep 18 85.0% (Elo −3), Sep 19 73.6% (Elo −653).

### Streaks (`streaks.py`)
Season 1: longest win streak 55, longest loss streak 9 (05:12Z Sep 19), longest unbeaten run 83. Season 2: longest win streak 3, **longest loss streak 21** (07:24Z).

### Opponents (`chains.py`)
The bot met 385 distinct opponents. **86.6% of Season 1 matches before 04:00 were rematches of the previous opponent** (418 chains, median length 8, max 18). The 153 opponents with net-negative Elo cost −9,914. The worst 20 by Elo account for 211 of 761 losses: cibaru 9-27-9 (−302), pat_lorna 2-19-2 (−272), aj121503 0-9-1 (−242), aurinkern 3-15 (−228), novagamingx4 2-9 (−222).

---

## 3. Eras: did any code change help?

Boundaries come from bak file names and mtimes, `climb_start` restarts, the first recipe-driven shop, and the Season 2 reset. The second table uses a cluster bootstrap with each rematch chain as one cluster, because matches in a chain are not independent.

| era | start (UTC) | n | W-L-D | win rate [Wilson] | score | perf rating vs 1000 | Elo |
|---|---|---|---|---|---|---|---|
| E1 policy_v1, before the hedge | 18T11:06 | 264 | 194-49-21 | 79.8 [74.3–84.4] | .775 | 1214 | −125 |
| E2 hedge | 18T11:56 | 441 | 355-57-29 | 86.2 [82.5–89.2] | .838 | 1285 | +239 |
| E2b evening restarts (edits not documented) | 18T20:44 | 1,220 | 968-164-88 | 85.5 [83.3–87.4] | .830 | 1275 | −137 |
| E3 edit at 23:55 | 18T23:55 | 535 | 455-49-31 | 90.3 [87.4–92.6] | .879 | 1345 | +14 |
| E4 certain-fixes | 19T01:18 | 263 | 216-28-19 | 88.5 [83.9–91.9] | .857 | 1312 | −53 |
| E5 blocklist + soft_rotate | 19T01:58 | 233 | 195-23-15 | 89.4 [84.7–92.9] | .869 | 1329 | +91 |
| E6 refuse-rematch / isfarm | 19T02:47 | 162 | 143-10-9 | 93.5 [88.4–96.4] | .910 | 1403 | +71 |
| E6b same planner, stronger pool | 19T04:00 | 38 | 24-11-3 | 68.6 [52.0–81.4] | .671 | 1124 | −201 |
| E7 decision_db / match_log rewrite | 19T04:30 | 134 | 79-46-9 | 63.2 [54.5–71.1] | .623 | 1087 | −62 |
| **E8 recipe planner on (+encoded-loss-fixes)** | 19T04:53 | 520 | 224-222-74 | **50.2 [45.6–54.8]** | .502 | 1001 | −182 |
| S2 Season 2 reset, same code | 19T07:00 | 124 | 48-56-20 | 46.2 [36.9–55.7] | .468 | 978 | −47 |
| **E9 seat_table.js (live now)** | 19T07:20:33 | 54 | 4-46-4 | **8.0 [3.2–18.8]** | .111 | 639 | −264 |

Changes between eras, with cluster-bootstrap 95% CIs:

| change | Δ win rate | CI |
|---|---|---|
| E1→E2 | +6.3 pp | [−4.3, +17.4] |
| E2b→E3 | +4.8 pp | [−1.1, +10.0] |
| E5→E6 | +4.0 pp | [−1.5, +11.6] |
| **E6→E6b** | **−24.9 pp** | **[−48.6, −6.9]** |
| E7→E8 | −13.0 pp | [−27.8, +5.1] (the same-window comparison in OUT-02 is decisive) |
| **S2→E9** | **−38.2 pp** | **[−50.5, −24.7]** |

Before the wipe (`prewipe_eras.py`, from strategy ids): the original loop reached 76.8% (n=392 decisive). The broken-0218 build went 57.5% (n=40, −151 Elo in 8 min). policy_v1 before the wipe was 78.0% (n=567), no better than the 83.1% of the counter era before it.

**Conclusions:**
1. No Season 1 change produced a measurable gain.
2. The drop at 04:00 came from the opponent pool, not the code (OUT-11).
3. The two changes that were measurably destructive are the recipe re-enable and seat_table. Both are live now.

---

## 4. Findings

### OUT-01 · critical · bug/strategy: the live code (seat_table.js, deployed 07:20:33Z) fights short and went 4–46–4
- **PROVEN:**
  - Result: 4 W / 46 L / 4 D, **8.0% [3.2–18.8]**, −264 Elo in about 8 minutes. The server rating went 981 → 726.
  - Against the preceding Season 2 window on the same code minus seat_table: **−38.2 pp [−50.5, −24.7]** (cluster bootstrap).
  - **53/53 matches entered round 0 with ≤2 units** (50 with two, 3 with one). Round-0 win rate was 15.1%.
  - Per-shop action rates: buys 0.36 (1.74 in the Season 1 policy era), rerolls 1.91 (0.83), feeds 0.05 (0.90). `P0_fill_reroll` fired in 113 of 130 shops (`behaviour.py`).
- **Mechanism, PROVEN with `refuse_cov.js` against the live module:**
  - `GLOBAL_REFUSE`/`TIPS_ALWAYS` (lib/seat_table.js:17-48) refuse **14 of the 36 bots that unlock on turn 1**.
  - That is **39.6% of all 12,015 round-0 opening offers**. In 6.6% of opening shops all 3 offers are refused.
  - With 10 gold, each reroll after the first means one fewer unit. `shouldRefuseBuy` plus the P0 fill-reroll (play_loop.js:1612-1631) therefore converts refusals into a short board.
- **Fix:** delete the refuse lists. Make "3 units in round 0" a hard invariant: at most 1 reroll in shop 0, and buy the best available unit instead of refusing.

### OUT-02 · critical · strategy: re-enabling the recipe planner (04:53Z) halved the win rate by starving round 0
- **PROVEN in the same time window (04:50–07:00Z):**
  - Recipe-driven matches: 200-211-72, **48.7% [43.9–53.5]**, n=411.
  - Policy fallback matches: 39-13-3, **75.0% [61.8–84.8]**.
  - Season 2 before seat_table: recipe 39.8% [30.2–50.2] vs policy 81.2% [57.0–93.4] (n=16).
- **PROVEN, how recipe matches are played:**
  - **70.7% of recipe matches fought round 0 short** (340 of 481; 25 of them with one unit).
  - Rerolls per match were 4.65, against 1.80 in the policy era.
  - Per shop: buys fell 1.68 → 0.69, feeds 0.92 → 0.10, rerolls rose 0.88 → 1.71.
  - `emergency_buy` fired 1,054 times from 05:00 to 07:28, against fewer than 30 per hour before. The fill-to-3 backstop fires but cannot fill once the gold is gone.
- **PROVEN, what a short round 0 costs in this window:** round-0 win rate is 57.7% with 3 units, 20.2% with 2 and 0% with 1. Match win rate is 61.8%, 47.8% and 21.7% respectively.
- **PROVEN, all recipe-logged matches:** 232-305-92 (43.2%). The most-used recipe, `recipe-imogen__cooper__wtd`, went 83-107-34.
- **PROVEN, the claim was never tested:** FIX_NOTES (08:28Z on Sep 18) lists "Recipe planner re-enable" under "Explicitly not done". `smoke_plan.js` still checks for `RECIPE PLANNER DISABLED` and now fails.
- **Fix:** delete the recipe path (`planShopSmart` recipe branch at play_loop.js:2192-2330, and `lib/recipes.js`).

### OUT-03 · critical · data_integrity: recipe and ghost "learning" suffers from survivorship bias
- **PROVEN:** `recipes.recordOutcome(state.board)` (lib/recipes.js:106-116) credits the result to the recipe matching the **final board**, not to the recipe the planner was pursuing.
- **PROVEN, how rarely a pursued recipe is completed:** only **21 of 629 (3.3%)** pursued recipes ended as the final board. Those went 80.0% [58.4–91.9]; the other 617 went 41.8% [37.6–46.1].
- **PROVEN, what the store therefore shows:**
  - `recipe-imogen__cooper__wtd.json` records 15 W / 1 L / **+188 Elo**.
  - Matches that actually pursued it went 83-107-34 for **−68 Elo**. The store keeps choosing it.
  - The store also never records draws: 3,191 recipe files contain plays 3,989, wins 2,906, losses 761, draws 0.
  - Seeded recipes carry made-up stats (`plays:5, wins:5, elo:40`, recipes.js:118-137).
  - Ghost matchups use the same final-board recipe id (play_loop.js:2556).
- **Fix:** delete the recipe store and ghost `bestRecipeId`. If kept, key outcomes to the plan pursued and include draws.

### OUT-04 · critical · rules_mismatch: Season 2 started at 07:00Z and the bot plays it as if nothing changed
- **PROVEN from the game changelog in `1iil01q93t0nb.js`:**
  - "Season 2: seat rules — each match draws a rule for each seat… the shop shows one more each round".
  - "8 new fighters".
  - "at 12:00 AM PT… every rating resets to 1000".
- **PROVEN, the bot's catalog is stale:**
  - `getCatalog` never refreshes (lib/arena.js:74-83, refresh=false). `catalog.json` dates from 09-17 and has 72 bots.
  - In Season 2, **191 of 2,661 shop offers (7.2%) were unknown raw ids with no kitId**.
  - 55 enemy units had no kitId (x high coach, commitments, memento, coffee companion, shepherd).
- **PROVEN, no code handles the new rules:** nothing reads `state.seats` or `seatShop`, the grep returns 0 hits.
- **PROVEN, ghost boards changed:** in Season 2 the ghost's round-0 board repeats in rematches only 62/90 times (69%), against 2,970/2,988 (99.4%) in Season 1.
- **PROVEN, memory is not split by season:** ghost, avoid and recipe memory have no season key, so Season 1 priors drive Season 2.
- **PROVEN, result:** 52-102-24, 33.8% [26.8–41.5]. The bot was briefly rank 3 at 1038 (07:05Z), then 726, rank 34, 53-98.
- **Fix:** refresh the catalog on a version change, model seat rules, and namespace all memory by season.

### OUT-05 · high · strategy: the bot optimised win rate while the ladder rewards score against a pool rated about 1000
- **PROVEN:**
  - Implied opponent ratings are about 1000 (sd 32).
  - Season 1 scored 81.3% but lost −269 Elo over 3,805 matches.
  - Draws cost −7.8 on average (297 draws, −2,317 Elo in total).
  - During the 7-hour "reach #1" phase the rating averaged 1322 and was never in the top 3 (0/190 checks).
  - The only top-3 finish (rank 2, 1439, 13:05Z) came from a 15-0 batch (logged as "30-0" by the doubled batch_end counter). After the restart it fell to 1269 within 12 minutes.
- **PROVEN arithmetic:** the rating settles at 1000 + 400·log10(s/(1−s)). The #1 rating of 1610 needs s ≈ 0.97. Leaderboard leaders at 02:53Z: omlejmi 375-25 (93.8%), ryaske 679-77 (89.8%); tetsuoai was 83.3% with 5–10 times more games.
- **PROVEN:** the prior studies' "Elo tax" of 4.7 wins per loss is just this Elo expectation, not a system flaw.
- **INFERRED:**
  - Because the rating just moves around that settling point, more games add variance, not rating.
  - A "stop when above the settling point" rule (what actually happened at 13:05Z) beats "play until top 1".
  - Success should be tracked as score minus expected score (Σ Elo / 32), not win rate.

### OUT-06 · high · strategy: round 0 decides the series and nothing in the planner optimises for it
- **PROVEN, Season 1 policy era (`round0.py`, `short.py`):**
  - Winning round 0 → **95.1%** series win (n=1,932). Losing it → **49.8%** (n=639). Drawing it → 68.1%.
  - The 639 lost round-0s alone cost **−5,876 Elo**, more than the whole net result.
  - Round-0 win rate by our attack+health: 51.1% at 19–21 → 69.1% at 21–23 → 74.1% at ≥23.
  - Leading by ≥4 attack+health gives 88.5%.
  - One reroll in shop 0 while still fielding 3 units: 70.4% [68.0–72.8]. No reroll: 60.4% [58.0–62.8].
  - Round 0 is the weakest round: 62.6% round win rate, against 78.1% in round 1 and 70.8% in round 2.
- **Fix:** give shop 0 its own objective: 3 units, maximise attack+health or the simulated win chance against the known or likely round-0 ghost, and at most one reroll.

### OUT-07 · high · strategy: rematches are 87% of games and the ghost board is known, yet the bot loses the same rematch again
- **PROVEN:**
  - The ghost's round-0 board (names, stats, honey) is identical to the previous match's in **99.4%** of Season 1 rematches (2,970/2,988). Round 1 matches in 99.0%.
  - After a loss to the same ghost, the next match is lost **32.2% [27.2–37.5]** of the time (n=311). After a win it is 8.3% [7.2–9.5].
  - Mean next-match Elo is **−5.27 (se 0.80)** after a loss, against −0.15 (se 0.55) for a fresh ghost.
  - After two straight losses the next match goes 33 W / 46 L (−10.4 Elo).
  - Losses are concentrated on few opponents: aurinkern 0-6 in a row at 04:41Z, ahmad_alqodri 0-10-2 at 04:53–04:56Z.
- **INFERRED:** with a deterministic board known in advance and the client's simulator (`1ou4egaetj-op.js`), a solver can check the shop for a winning lineup. This is the single biggest lever toward s ≈ 0.97.
- **Fix:** replace the archetype heuristics with "simulate the shop against the known ghost board".

### OUT-08 · high · docs/strategy: FULL_AUDIT's "global spine / global toxic" table (now lib/seat_table.js) was built from the 771-match collapse window
- **PROVEN:**
  - `study/FULL_AUDIT.md` uses only `data/matchlog`, which covers 04:30–07:28Z. That is the recipe-starved, stronger-pool window, with base win rate 49%.
  - The matchlog README calls it the "single source of truth", yet it holds 832 of 3,983 matches.
  - Replicated on the 3,118-match Season 1 policy era (base win rate 87%, W/(W+L+D) 81%), final-board win rates W/(W+L+D) are shown below against FULL_AUDIT's claimed values.

| unit | FULL_AUDIT claim | Season 1 policy era |
|---|---|---|
| signal prospector | 16.2% | **87.0%** (n=54) |
| x brief | 39.4% | **86.4%** (n=228) |
| company docs q&a | 39.4% | **81.4%** (n=489) |
| video edit desk | 40.0% | **83.7%** (n=86) |
| nightly audit engineer | 40% | 81.2% (n=133) |
| event request desk | 26.7% | 75.0% (n=108) |
| apple search ads | 33.3% | 73.9% (n=153) |
| flora | 40.4% | 74.7% (n=166) |

- These are "global refuse" units in seat_table.js:17-37, which feeds OUT-01.
- **PROVEN:** a few units lag the base rate in both windows: deal hunting 48.9% (n=45), site audit 56.5%, gtm prospecting 56.2%, hiring signals 57.1%, stills/outbound 68%.
- **INFERRED:** final-board presence is endogenous (the planner buys filler when shops are poor), so even these are weak evidence.

### OUT-09 · high · docs: CURRENT_LOSS_STUDY's headline loss modes have no base rate, and they drove the RULES_CLEANUP bans
- **PROVEN, `tip_baserate.py`, `archmismatch.py`, windows before 04:59Z:**
  - The same `tip_soft_into_wall_arch` tag hits **58.5%** of losses (261/446, reproduces their 262/448) **and 44.2% of wins** (1,163/2,632). Win rate is 81.7% tagged against 88.8% untagged: a modest association, not "the" failure mode.
  - `wrong_plan_arch_vs_ghost` hits 44.4% of losses and **46.8% of wins**. Win rate is 86.6% when mismatched and 85.4% when matched, so **no effect**.
  - These were the evidence for the hard tip bans with force-sell, the hype_battery arch pinning, the live arch refresh and `recipe_unstick` (study/RULES_CLEANUP.md).

### OUT-10 · high · docs/strategy: GLOBAL_COUNTERS rewrote per-archetype plans from 152 matches taken over 30 minutes
- **PROVEN:**
  - "hype_battery W1 L13" is **one handle (aurinkern), 2 fingerprints**, between 04:30 and 04:59Z.
  - The same archetype in the Season 1 policy era: 42-12-6, 77.8% [65.1–86.8], 7 handles.
  - "hurt_revenge W2 L2" (n=4) and "wake_chip W2 L3" (n=5) also became code rules.
  - The resulting code: `PLANS.hype_battery` rewritten, Webby/Copy hard-banned against hype_battery, and `ARCH_SEAT_TABLE.hype_battery` refusing cooper, writing bot, webby, office ops and more.
- In Season 1 every archetype except grow_hype (33%, n=18) and echo_hype (61%, n=33) sat at 77–96%, so the archetype machinery had almost nothing to fix.

### OUT-11 · high · strategy: the 04:00Z drop came from the opponent pool, and the "fixes" that followed were reactions to noise
- **PROVEN:**
  - The planner behaved the same in E6, E6b and E7: buys per shop 1.74 / 1.70 / 1.68, feeds 0.90 / 0.84 / 0.92, rerolls 0.83 / 0.76 / 0.88.
  - Opponent boards got stronger: round-0 attack+health 18.8 → 20.1, round-2 23.9 → 25.6. Ours stayed at 21 / 25.
  - Against the same 9 round-0 ghost compositions the win rate fell 87.1% → 60.6%, so the ghosts' later-round boards were stronger.
  - The leaderboard held about 2,450 players by 02:53Z.
  - Win rate fell 93.5% → 68.6% → 63.2%.
- **INFERRED:** the policy_v1 bot was tuned against a weak pool. The 04:53–07:20 "encoded loss fixes" (recipe, tip bans, seat table) answered a pool shift and each made things worse (OUT-01, OUT-02).

### OUT-12 · medium · docs: no claimed improvement in the study or fix notes is supported, and a broken build played rated games
- **PROVEN:**
  - Every Season 1 era difference has a cluster CI that spans zero (section 3).
  - Before the wipe, the rewrite to policy_v1 (FIX_NOTES) scored 78.0%, against 83.1% for the prior counter era and 76.8% for the original loop.
  - `play_loop.js.bak.broken-0218` was live for 8 minutes: 23-17-6, −151 Elo.
  - BRONZE_LOSS_FIX.md reports "ALL batch result events … Elo sum **1754**". The real sum up to that doc is **−467**, and its own sub-rows add up to −466.
  - That doc also blames arch clusters and tips for the "bleed since 04:54:55Z". That time is exactly when the recipe planner switched on, and the doc never mentions units per board.

### OUT-13 · medium · ops/strategy: the refuse-rematch machinery idled the bot for about 2.8 h and often failed to change the opponent
- **PROVEN (`refuse.py`):**
  - 22 `refuse_rematch_batch_abort` events between 02:58 and 04:27Z.
  - The next opponent was **the same handle 8/22 times**.
  - Median wait 293 s, total 10,208 s idle.
  - Throughput fell from about 390 to 95 matches per hour at 03h.
  - The code is now neutralised with `if (false && …)` and `if (true || …)` (play_loop.js:118-119, 167-168) but remains as dead code, including `avoid.shouldRefuseRematch`.
- **PROVEN:** the premise was correct (rematch after a loss is −EV, OUT-07). The chosen remedy was wrong.

### OUT-14 · medium · data_integrity/ops: two play_loop processes ran at once
- **PROVEN:**
  - 6 overlapping batch windows, 144 s in total. The pairs are 055851/055900, 055900/055926, 060005/060007, 200014/200040, 222536/222537 and 222537/222601, all local time.
  - **8 results were double-logged**, e.g. `loss-202609190425500` twice at 04:25:50.035Z from batch-…222536 and …222537.
  - Both processes send actions for the same series.
  - climb_loop.sh has no lock, and `climb_start` fired at 22:25:35 and 22:25:36 local.

### OUT-15 · medium · data_integrity: local matchIds split server series, and the match_start fields are wrong
- **PROVEN:**
  - `decision_db.beginMatch` mints `uid('m')` (lib/decision_db.js:56) on the first shop turn this process sees (play_loop.js:2848-2856). It never uses the server's `state.matchId`.
  - **92 local matches were abandoned mid-series** (73 already had fights) and resumed under a new id. In 59 cases the next id's first shop is round 1–2. 60 results have no round-0 fight.
  - `match_start.handle` is the **previous** opponent in 3,629/3,988 (91%), because `matchCtx.handle` is read on the result screen.
  - In `data/matchlog`: match_start opponent is null 789/851, seed null 851/851, match_end seriesYou/seriesThem null 832/832, and 19 starts have no end.

### OUT-16 · medium · telemetry: climb.log batch_end W/L/D counts are doubled
- **PROVEN:** `grep -c '"result":"win"'` (climb_loop.sh:31-33) also matches the `avoid_note` line, which contains `"result"`. Reported totals are exactly **2×** the real ones in 237/239 successful batches (7,716 reported vs 3,609 real).
- climb_loop.sh also `cd`s to a nonexistent `/workspace/thursday-arena` (line 3).

### OUT-17 · medium · data_integrity: labels are hardcoded or wrong
- **PROVEN:**
  - The strategy file `plan` is always `'tempo'` (play_loop.js:2512; 5,389 of 5,389 generated files).
  - The ledger `plan` is `'tempo'` for all policy_v1 games (play_loop.js:2540; 3,344 rows). It is also `'tempo'` for **15 recipe-driven matches**, because `recipe_unstick` cleared `matchCtx.recipeId` before the result.
  - `opponent_tier: 'unknown'` and `curve: null` are always written (2514-2516).
  - Draws are written to `strategies/losses/` (lib/ledger.js:42-43; 460 draw files).
  - `index.json.by_plan` buckets are therefore meaningless: tempo 3,900, buff 9, faint 6, late_spike 4.
  - `index.json.stats.matches` counts the wipe marker (update_index.py:60).

### OUT-18 · medium · data_integrity/strategy: fake and hand-written "wins" drive live unit scoring
- **PROVEN, what is in `strategies/wins/`:**
  - 18 `win-20260917-studyNN` files that are *other players'* wins, labelled "cloned from @X win vs @Y", with made-up rating deltas.
  - `win-20260918-jason-ghost-counter`, a note with rating_delta 0 and plays 5.
  - 7 hand-authored 09-17 entries.
- **PROVEN, how they reach the planner:**
  - update_index.py ranks `hot` by per-file win rate. Every file is 1/1, so the order never changes. The current hot list is the note, the 7 hand-written files and 2 arbitrary 03:13Z wins.
  - `hotNameSet()` (play_loop.js:1095-1105) feeds every unit on those boards a **+4.0** score (play_loop.js:637).
  - That includes Pipeline Pulse, Company Docs Q&A, Luma Pages and Outbound Prospecting, which seat_table scores **−20 / −12**. The two stacks contradict each other.

### OUT-19 · low · ops_reliability: broken code was hot-loaded into rated play
- **PROVEN:**
  - `ReferenceError: unit is not defined` ×24 (11:29–11:48Z), which also caused 9 failed batches in a row from 11:46 to 11:49Z.
  - `k is not defined` ×10 (22:32–22:38Z).
  - HTTP 429 overloaded ×11, 401 ×1.
  - About 4 W and 2 L seen by the server never reached the local log (server_vs_local: one loss at 02:41–02:46Z is missing).
  - The only test (`smoke_plan.js`) fails by design (see CLAUDE.md).

---

## 5. How the prior AI's claims hold up against the data

| doc / claim | verdict | evidence |
|---|---|---|
| FULL_LOSS_DIAGNOSIS: 1,860 series W1467 L258 D135, 85% | **Correct** | 1,864 series, 1469/259/136 up to 23:45Z |
| FULL_LOSS_DIAGNOSIS: the "Elo tax" of 4.7 wins per loss | Correct arithmetic, wrong framing | Normal Elo against a ~1000 pool (OUT-05) |
| FULL_LOSS_DIAGNOSIS / CURRENT_LOSS_STUDY: rematching after a loss is −EV | **Supported** | −5.27 vs −0.15 Elo next match (OUT-07). The refuse remedy failed (OUT-13) |
| CURRENT_LOSS_STUDY: tip_soft_into_wall_arch is 58.5% of losses | **Misleading** | 44.2% of wins carry the same tag. Win rate 81.7% vs 88.8% (OUT-09) |
| CURRENT_LOSS_STUDY: wrong_plan_arch_vs_ghost is 16–42% of losses | **False as a cause** | 46.8% of wins carry it. Win rate 86.6% vs 85.4% (OUT-09) |
| FULL_AUDIT: global toxic / spine seats | **Not replicated** | Confounded by the collapse window (OUT-08) |
| GLOBAL_COUNTERS: hype_battery W1 L13 | **One opponent, 30 minutes** | 77.8% in the Season 1 policy era (OUT-10) |
| ALL_LOSSES_ANALYSIS: root cause is tips on loss boards (101/266) | **Overstated** | In that window 30.3% of losses and 21.3% of wins had hard tips (win rate 44% vs 56%). The real driver was a short round-0 board, 70% of recipe games (OUT-02) |
| BRONZE_LOSS_FIX: batch Elo sum +1,754 | **Wrong** | −467 (OUT-12) |
| FIX_NOTES: policy_v1 is a coherent improvement | **Unsupported** | 78.0% vs 83.1% for the previous era (OUT-12) |

---

## 6. Evidence-based direction for the rewrite (INFERRED from the numbers above)
1. **Never fight short.** Enforce it in shop 0: ≤1 reroll, buy the 3 strongest units. Round 0 decides the series (OUT-06).
2. **Solve the known ghost.** 87% of games are rematches and the ghost's round-0 and round-1 boards are fixed in about 99% of them. Simulate the candidate buys against that board using the client's `simulate` (OUT-07).
3. **Delete** the recipe store, the seat table, the tip and archetype stacks, the refuse and avoid graph, the hot-list bonus and the fabricated strategies (OUT-01/02/03/08/09/10/13/18).
4. **Handle Season 2.** Refresh the catalog, model seat rules and namespace memory by season (OUT-04).
5. **Measure the right thing.** Track score and Σ Elo against expectation per era with cluster CIs, and log the server matchId. Stop the climb when the rating is above its settling point (OUT-05/15/16).

## 7. Scripts (all in `scratchpad/audit/outcomes/`; `./run_all.sh` re-runs everything)
- `load.py`: shared loaders and the Wilson CI.
- `build_table.py`: builds `matches.json`.
- `reconcile.py`, `overlap.py`, `server_vs_local.py`: source reconciliation.
- `record.py`, `tenmin.py`, `streaks.py`, `chains.py`: records, streaks and rematch chains.
- `perf.py` → `implied_ratings.json`: implied opponent ratings.
- `eras.py` → `eras.json`, `era_bootstrap.py`, `behaviour.py`, `same_ghost.py`, `prewipe_eras.py`: era analysis.
- `short.py`, `round0.py`, `fights.py`, `food.py`: round-0 and board analysis.
- `recipe_bias.py`, `unit_wr.py`, `tip_baserate.py`, `archmismatch.py`, `arch.py`: tests of the prior claims.
- `refuse.py`, `refuse_cov.js` (loads the live lib/seat_table.js read-only): refuse behaviour.
- `event_eras.py`: first and last appearance of each event type.
- `top_players.py`: public-match benchmark.
- `rank_checks.txt`: every server rank check.
- Each `out_*.txt` file holds the output of the matching script.
