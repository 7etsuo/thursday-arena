# STR: the strategy the tetsuoai bot should play, derived from the real engine and the real fights

> **Historical strategy audit (2026-09-19).** The measurements below use the pre-rewrite bot and
> its recorded opponent pool. Section 4 is the proposed rewrite policy, and §7 lists rules in the
> old code; neither describes the current implementation. The current planner adds two-step
> search and a round-0 match-level objective. Its 81-bot catalog is a Season 1/2 snapshot; the
> live Season 3 catalog has 179 bots and 19 items. Later Season 1/2 live battles
> resolved the `route`/`caffeinate` rules and increased the replay corpus to 10,748 battles.
> See [the implementation history](HISTORY.md), [current planner](../lib/planner.js), and
> [agent handbook](../AGENTS.md) for the implemented behavior, and
> [Season 3 notes](SEASON3.md) for new mechanics and evidence limits. The top-10 opponent pool remains
> unmeasured in this report.

> **Current matchmaking note (2026-09-20):** The [live rules](https://thursdayarena.com/rules.md)
> now diversify rated ghosts and prefer close ratings. In the new archive, the previous opponent
> recurred in only 13 of the final 197 rated matches. The 50/50 round-0 target below remains the
> implemented historical policy, but its old evaluation does not establish the best weight under
> the new matchmaking rule.

Scope: use the validated battle simulator on the bot's real fights to find what actually wins. That means what to buy each round, the seat order, food, when to reroll, sell or freeze, and whether to adapt to the opponent. The strategy is then compared with what the bot actually did, and every rule in the repo that contradicts it is listed.

Paths:
- Repo files are relative to `/home/tetsuo/grok/thursday-arena`.
- Scratch root is `$S = /tmp/user/1000/claude-1000/-home-tetsuo-grok-thursday-arena/06183e91-c69d-4347-9358-42776c52875a/scratchpad`.
- All scripts and outputs are in `$S/audit/strategy/`. `run_all.sh` re-runs everything in about 25 minutes on 56 cores, and each `out_*.txt` holds the numbers quoted here.

Label conventions:
- PROVEN: computed directly from the data or the simulator.
- INFERRED: a judgement or extrapolation.
- Scores use W=1, D=0.5, L=0.
- "Expected score vs the corpus" is the mean simulated result against the enemy boards we actually faced, weighted by how often we faced each one.

---------------------------------------------------------------------------------------------------------
## 0. Bottom line

1. **The game is a solved, deterministic puzzle, and the bot never used that.**
   - `$S/engine/sim.js` predicts the winner of **9,730 of 9,730** of our recorded unique battles (S1 early 7,602, S1 late 1,677, S2 451; `out_check.txt`). The engine lens reports the same inputs as 10,065/10,065 frame-exact.
   - Every decision below is scored by replaying real enemy boards through that simulator. PROVEN.
2. **Round 0 has one right way to shop.**
   - 10 gold buys three commons at 3 gold each, plus exactly one reroll.
   - Pick which 1–2 offers to keep, reroll once, then complete the board.
   - Across all offer draws this scores **0.876** against the R0 corpus, vs **0.690** for "buy the three offered" (S1 pool, 3,000 offer draws; `out_r0_policy.txt`).
   - On the bot's **real** 3,954 first R0 shops it scores **0.873 [0.867, 0.879]**, vs the **0.650 [0.637, 0.664]** the bot actually got (`out_r0_eval.txt`). PROVEN.
   - The optimal policy rerolls on 97.3% of opening shops. A **second** reroll always leaves the board one unit short.
3. **One template wins round 0 against every archetype.** Front: bulk/flamingo/grow. Middle: echo. Back: hype.
   - The top 100 R0 boards (all ≥0.971) have a flamingo or bulk front in 94/100 and an echo or hype middle in 81/100.
   - The single best board is the best, or within 0.025 of the best, against **each of the 15 enemy archetypes** (`out_r0_arch.txt`).
   - The bot fielded that exact template on only **3.7%** of its S1 R0 boards (`out_r0_decomp.txt`). PROVEN.
4. **The simulator's unit ranking matches the bot's own win data.** Simulated R0 unit lift vs the boards lens's opponent-adjusted empirical R0 lift: **Pearson r = 0.92, Spearman 0.905** (29 units, each n ≥ 250). PROVEN.
5. **Rounds 1 and 2: search against the opponent's known board.**
   - Setup: start from the **real** pre-shop state (board, offers, food, 10 gold). Run a greedy simulator search over feed, sell+buy and reroll, where the reroll's value is estimated from sampled shops. The target is 75% the board this opponent fielded in this round last time and 25% a same-round pool of *other* opponents' boards.
   - Result: **0.976 [0.973, 0.980]** vs the bot's actual **0.758 [0.747, 0.770]** (n=5,066 shops).
   - The same search with **no** opponent information scores **0.915**, so adapting to the known board is worth **+0.061 [0.055, 0.067]** (`out_r12b.txt`). PROVEN in simulation, starting from real states.
6. **Do not trust the known board blindly.** When the book's board turns out wrong (302 S1 cases):
   - pure known-board play: 0.651
   - 75/25 mix: 0.879
   - pool-only: 0.840

   Round 0, where the opponent is hidden, behaves the same way:
   - target = previous opponent's R0 board: +0.021 overall, but **−0.053 in S1-late and −0.080 in S2**
   - 50/50 mix: **+0.059 [0.055, 0.064]**, positive in every era.
7. **Archetype-level counters are worth nothing, and the repo's archetype lists are often backwards.**
   - Adapting to the archetype label is worth ≤0.025 at R0.
   - 22 `PLANS.avoid` entries have a simulated lift above +0.02 against the very archetype that avoids them. Worst cases:
     - bulk_echo avoids grow (+0.273) and echo (+0.133)
     - double_echo avoids grow (+0.224) and echo (+0.143)
     - hype_battery avoids bulk, echo, hold_the_line and guard (+0.086 to +0.114) while it *prefers* sidestep (−0.116)
8. **Expected effect** (vs the recorded corpus; the match-level figure assumes independent rounds, INFERRED):

   | Era | Actual R0 / R1 / R2 | Proposed R0 / R1 / R2 | Match-win estimate, actual → proposed |
   |---|---|---|---|
   | S1 late (the parity pool) | 0.446 / 0.598 / 0.511 | 0.879 / 0.979 / 0.945 | ≈0.53 → ≈0.99 |
   | S2 (n = 178 / 39 / 86) | 0.368 / 0.641 / 0.314 | 0.857 / 0.981 / 0.872 | — |

   The calibration check passes: the S1-early actual round scores imply a settling rating of ≈1,311 vs a 1000-rated pool, and the observed hover was ≈1,300–1,322 (OUT-05).

   These are upper-bound-style estimates against *this* pool (§6, §9).
9. **Almost every hand-written rule in the planner is replaced, not tuned.**
   - Recipes, refuse lists, archetype PLANS and the seating heuristics go.
   - So do the threat model, the food heuristics, freezes, the mirror bans, GHOST_PUNISH as a ban, and the name bombs.
   - The replacement is one evaluator: the simulator, scored against a target.
   - 20 contradicting rules are listed in §7 (STR-01 … STR-20).

---------------------------------------------------------------------------------------------------------
## 1. Harness validity

| Check | n | Result |
|---|---|---|
| `sim.outcome` winner vs recorded winner, exact inputs (frame-0 stats incl. potato, honey resolved by the verifier, S2 seat rules) (`check.js`) | 9,730 unique battles | **9,730 (100.00%)**. S1 early 7,602/7,602, S1 late 1,677/1,677, S2 451/451. 9.4 µs per battle. |
| Frame-exact replay (engine lens + verifier) | 10,065 incl. 299 public replays | 100%; 99.65% using only frame-visible honey |
| Winner with our honey known, ghost honey unknown | 10,065 | 97.2%. This is the live-play accuracy when the ghost honey is not yet in the book. |
| Winner from the bot's own logged fight rows (no potato, no seats, ghost honey false) | S1 9,319 / S2 451 | 95.6% / 74.1%. The drop comes from missing telemetry, not from the engine. |
| Simulated R0 unit lift vs empirical R0 unit lift (boards lens, leave-one-out against the same enemy line) | 29 units | r = 0.92, ρ = 0.905 |
| Simulated round scores → match-win → settling rating (S1 early) | 3,147 / 3,151 / 1,304 rounds | predicts ≈1,311 vs observed ≈1,300–1,322 |

**Corpus** (`build_corpus.py`): the verifier's exact battle inputs, joined to the opponent handle through the decision log. All 9,730 were joined, plus the first pre-shop state of each (match, round) (`build_shops.py`, 9,729/9,730).

| Era | Rounds (R0 / R1 / R2) | Distinct enemy boards (R0 / R1 / R2) | Handles |
|---|---|---|---|
| S1 early (<04:30Z) | 3,147 / 3,151 / 1,304 | 270 / 323 / 421 | 328 |
| S1 late (04:30–07:00Z) | 641 / 654 / 382 | 48 / 49 / 80 | 44 |
| S2 | 179 / 180 / 92 | 76 / 58 / 35 | 16 |

Enemy stat sums (ATK+HP) by round are R0 18.8–19.4, R1 21.1–22.1 and R2 23.4–25.1. Enemy boards average 2.7–2.8 units at R0.

**Conclusion:** the strategy rests on exact simulation of counterfactual boards against real recorded enemy boards. It is not an extrapolation from win rates. The one empirical cross-check (unit lift) agrees at r = 0.92.

---------------------------------------------------------------------------------------------------------
## 2. Round 0 (10 gold, empty board, 3 common offers, opponent hidden)

### 2.1 Exhaustive board table (`r0_table.js`, `r0_table.json`)
- Every multiset of 3 of the 38 commons (9,880 boards) and every distinct seat order was scored against three pools: S1 R0 (318 boards, weighted by 3,788 fights), S1-late R0, and S2 R0 with each fight's seat rules.
- For a random 3-common board with the best order, the mean score is S1 0.688, S1 late 0.669, S2 0.660.
- The best boards score 0.99+:

| Pool | Best boards (best order, front→back) |
|---|---|
| S1 | Newspaper · WTD · Writing Bot 0.996; Webby · Call Follow-Ups (or Meeting Recap) · WTD / Writing Bot / Luma 0.996; NYC Parent / Imogen · echo · WTD 0.988 |
| S1 late | Webby · Cooper · Clip Bot 0.998; Copy Humanizer · Video Edit · Writing Bot 0.998; Webby · Call Follow-Ups · WTD 0.998 |
| S2 (with seat rules) | Webby · Cooper · Writing Bot 0.992; Webby · Cooper · WTD 0.989; Webby · Call Follow-Ups · Writing Bot 0.980 |

- Seat composition of the top 100 S1 boards:
  - front: flamingo 47, bulk 47, grow 6
  - middle: echo 54, hype 27, guard 5
  - back: hype 48, echo 28, bulk 11
- Duplicates are fine, e.g. Newspaper + Writing Bot ×2 scores 0.991 and Webby ×2 + Cooper scores 0.986. This contradicts the repo's `dupSoft` rule (STR-12).

### 2.2 R0 unit tier list (`out_r0_units.txt`)
Lift is the probability-weighted mean best-order score of boards containing the unit, minus the mean of all boards. Pools: S1 / S1 late / S2. Best seat is the share of best orders with the unit front/mid/back.

| Tier | Unit (kit, base) | Lift S1 / S1 late / S2 | Best seat F/M/B % | Empirical R0 lift (boards lens) |
|---|---|---|---|---|
| S | Credit Card Max (grow 3/4) | +0.171 / +0.169 / +0.142 | 77/15/7 | +0.115 [0.082, 0.147] n=372 |
| S | The Morning Newspaper (flamingo 2/6) | +0.147 / +0.123 / +0.116 | 83/17/1 | +0.118 n=394 |
| S | Webby (bulk 3/5) | +0.145 / +0.145 / +0.137 | 60/20/20 | +0.117 n=384 |
| A | Meeting Recap Deck, Call Follow-Ups (echo 3/4) | +0.128 / +0.121 / +0.109 | ~6/65/29 | +0.081 / +0.103 |
| A | Cooper (echo 2/5) | +0.117 / +0.110 / +0.119 | 4/68/28 | +0.077 |
| A | Copy Humanizer (flamingo 2/5) | +0.115 / +0.105 / +0.055 | 94/6/0 | +0.116 |
| A | Writing Bot (hype 2/5) | +0.112 / +0.120 / +0.087 | 60/12/27 (self-buff front) | +0.034 |
| B | Company Docs Q&A (guard 2/6, **middle only**) | +0.085 / +0.071 / +0.051 | 7/59/34 | −0.032 (bot fielded it front 46%) |
| B | Office Ops Desk (hold 3/5) | +0.078 / +0.074 / +0.044 | 56/20/24 | +0.063 |
| B | X Brief (echo 2/4) | +0.065 / +0.059 / +0.060 | 1/50/48 | +0.016 |
| B | Imogen, NYC Parent (bulk 2/6) | +0.060 / +0.058 / +0.056 | ~38/25/37 | +0.024 / +0.030 |
| B | WTD (hype 3/4) | +0.057 / +0.070 / +0.091 | 29/30/41 | +0.054 |
| C | Apple Search Ads (grow 3/3), Stills & Clips, Video Edit (wake), Flora (patch), Luma Pages (hype 2/4), X High Coach (S2) | −0.007 … +0.030 | — | −0.045 … +0.030 |
| D | GTM Connections, SEO & AEO, Event Producer, Love, GTM Prospecting, Event Request, Pipeline Pulse, Outbound, Signal Prospector, Clip Bot, coffee companion (S2) | −0.024 … −0.054 | — | −0.031 … −0.087 |
| F | dial bot, Hiring Signals, Site Audit, skippy, Deal Hunting, Tech Demos, Home robots | −0.112 … −0.233 | — | −0.077 … −0.223 |

### 2.3 R0 shopping policy
- **Monte Carlo over the uniform offer distribution** (`r0_policy.js`, 3,000 draws per pool; engine lens: R0 offers are 100% common and uniform):
  - "buy the three offered, seat by sim": S1 0.690, S1 late 0.670, S2 0.660.
  - optimal "keep k ∈ {0,1,2}, reroll once, complete the board": **0.876 / 0.859 / 0.827**.
  - The optimum keeps 2 (57%), keeps 1 (40%), or takes all three (2.6%).
  - Buying before the reroll dominates freezing: the reducer turns a bought slot to null and refreshes all 3 non-frozen slots on reroll, so a freeze only wastes a slot.
- **On the bot's real first R0 shops** (`r0_eval.js`, n=3,954, scored on the actual enemy R0 board):

| Policy | All | S1 early (n=3,136) | S1 late (640) | S2 (178) |
|---|---|---|---|---|
| Bot actual | 0.650 [0.637, 0.664] (16.2% short) | 0.708 | 0.446 (54% short) | 0.368 (78% short) |
| Buy the 3 offered, sim order | 0.692 | 0.699 | 0.666 | 0.663 |
| Optimal keep + 1 reroll (pool) | **0.873 [0.867, 0.879]** | 0.880 | 0.851 | 0.827 |
| Same, table from the S1-early pool only (out-of-sample for S1 late) | 0.875 | 0.881 | **0.843** | — |
| Target = previous opponent's R0 board | 0.894 | 0.923 | 0.797 | 0.747 |
| **50/50 previous-opponent board + pool** | **0.933** | 0.948 | 0.879 | 0.857 |

- The out-of-sample S1-late score (0.843 vs 0.851 in-sample) shows the table is not overfit.
- The previous opponent's R0 board equals the actual R0 board in 3,006/3,776 = 79.6% of S1 matches but only 67/178 = 37.6% of S2 matches.
- When that prediction is wrong (n=880), the pure-predicted target collapses to 0.663 while the mix holds at 0.846.
- **Decomposition of the bot's full R0 boards** (S1 early, n=2,993; `r0_actual_decomp.js`):

| Step | Score |
|---|---|
| As seated | 0.718 |
| Same units, best order | 0.799 |
| Optimal shopping | 0.880 |

  Roughly half the gap is seating and half is composition, before counting the short boards.

### 2.4 Archetype robustness (`out_r0_arch.txt`)
- The global best board is best or within 0.025 against every enemy archetype, i.e. against every one of the 15 `classify()` labels: glass_burst, chip_snipe, buff_suicide, flamingo_pass, wake_chip, echo_hype, bulk_echo, backline_snipe, double_echo, sustain, hype_battery, unknown, bulk_wall, grow_scale and grow_hype.
- The largest regrets are 0.025, vs bulk_echo and hype_battery.
- Kit lift per enemy archetype is positive for bulk/flamingo/echo/grow/hype against almost every archetype. The exceptions are guard, patch and hold_the_line vs grow_hype. The worst kits are first_seat, drain and backtap everywhere.
- **Adapting to the archetype label is therefore worth at most 0.025 at R0.** Adapting to the exact predicted board is worth +0.059 (§2.3).

---------------------------------------------------------------------------------------------------------
## 3. Rounds 1 and 2 (10 gold; the board carries over; opponent handle known)

### 3.1 Counterfactual on real shops (`r12b_policy.js`, `out_r12b.txt`)
- **Setup.** Every recorded R1/R2 shop with a full board and 10 gold (n=5,066) starts from its real board (stats and honey), its 3 real offers and its real food.
- **Policy.** A greedy one-step simulator search:
  - Evaluate every feed, every sell+buy and every buy into an empty seat. Estimate a reroll by sampling 6–10 new shops from the unlocked pool, with food odds honey ½ / apple ⅓ / potato ⅙.
  - Take the best improvement, and repeat until nothing improves.
  - Seat the final board by the simulator. Score it on the **actual** enemy board with the round's seed and seat rules.
- **Targets:**
  - POOL: top-40 same-round boards from **other** opponents (leave-one-handle-out, so no information about this opponent).
  - KNOWN: this handle's most recent earlier board for this round (time-respecting), else POOL.
  - MIX: 75% KNOWN + 25% POOL.

| Slice | n | Actual | Pre-shop board, sim order | Same fought units, order vs known | POOL | KNOWN | **MIX** |
|---|---|---|---|---|---|---|---|
| S1 early R1 | 2,982 | 0.826 | 0.743 | 0.936 | 0.931 | 0.987 | **0.992** |
| S1 early R2 | 1,283 | 0.746 | 0.687 | 0.852 | 0.905 | 0.917 | **0.956** |
| S1 late R1 | 296 | 0.598 | 0.644 | 0.806 | 0.860 | 0.949 | **0.979** |
| S1 late R2 | 380 | 0.511 | 0.655 | 0.720 | 0.891 | 0.895 | **0.945** |
| S2 R1 | 39 | 0.641 | 0.756 | 0.795 | 0.968 | 0.865 | **0.981** |
| S2 R2 | 86 | 0.314 | 0.453 | 0.529 | 0.776 | 0.837 | **0.872** |
| **All** | 5,066 | **0.758 [0.747, 0.770]** | 0.712 | 0.883 | 0.915 [0.908, 0.921] | 0.957 [0.951, 0.962] | **0.976 [0.973, 0.980]** |
| S1, book board exact | 3,956 | 0.784 | 0.758 | 0.920 | 0.921 | 0.990 | 0.995 |
| S1, book board wrong | 302 | 0.538 | 0.444 | 0.644 | 0.840 | **0.651** | 0.879 |
| S1, no book entry | 683 | 0.772 | 0.591 | 0.821 | 0.927 | 0.921 | 0.926 |

Paired differences:
- MIX − actual = +0.218 [0.207, 0.228]
- POOL − actual = +0.156 [0.146, 0.167]
- MIX − POOL = +0.061 [0.055, 0.067]
- MIX − KNOWN = +0.020 [0.016, 0.024]

By era, MIX − POOL is +0.058 (S1 early), +0.082 (S1 late) and +0.070 (S2).

Actions per shop:

| Target | Sell+buy | Feeds | Rerolls |
|---|---|---|---|
| MIX | 0.96 | 1.12 | 0.59 |
| POOL | 0.86 | 1.23 | 1.14 |
| KNOWN | 0.21 | 0.38 | 0.24 (stops once the known board is beaten) |

Reading:
- (a) Most of the R1/R2 gain (+0.156) comes from simply *spending 10 gold well under a correct evaluator*, with no opponent memory.
- (b) Opponent memory adds another +0.06, and it must be blended with a pool.
- (c) At R1 the book holds this opponent's exact board 88–91% of the time in S1 but only 64% in S2. At R2 the figures are 62–68% (S1) and 59% (S2).

### 3.2 R1/R2 unit tiers (`unit_value_r12.js`, `out_unit_values_r12.txt`)
Swap-in value is the mean gain in best-order score (vs the same-round pool) from putting the unit into 200 real R1 boards or 129 real R2 boards, in the best seat to replace.

| Round | Top tier (mean gain; share of boards improved) | Bottom tier (≈0 gain) |
|---|---|---|
| R1 (base 0.733) | Paid Media Report Desk +0.231 (98%), Projects Manager +0.210, Credit Card Max +0.197, **Sales Call Coach +0.196**, GTM Loop Closer / **Nightly Audit Engineer** +0.184, Tradbot +0.174, Writing Bot +0.174, Cooper/MRD/CFU ≈+0.17, Webby +0.163, Newspaper +0.159 | EBR (dump) 0, Home robots, Tech Demos, Deal Hunting ≈0; Hiring Signals, skippy, dial bot, Site Audit ≤0.013 |
| R2 (base 0.687) | Stalk Bot +0.245, Alfred +0.217, Executive Assistant +0.203, dr eggbot +0.185, Paid Media +0.180, Partnerships Call Coach +0.172, Lingxi's +0.158, Competitor Watch +0.156, the last_word rares +0.14–0.15, Newspaper +0.136 | all dump kits 0, Home robots, skippy, Deal Hunting, Tech Demos, dial bot ≤0.008 |

S2 bots:
- Memento (recall) +0.154 and Commitments (keep_open) +0.148 at R1, both validated kits.
- Master (route) +0.250, Shepherd (herd) +0.172 and Apple Dev (caffeinate) +0.162 at R2. route and caffeinate are **unvalidated guesses** (0 captions); herd has 3 captions.
- bloom and hand_off show 0 here because the swap-in ignores their shop-time buffs.

### 3.3 Food (engine rules plus simulator counterfactuals from other lenses, re-checked)
- **Apple**: permanent +1/+1. It is the only stat that carries forward.
  - One extra +1/+1 on the front: 0.764 → 0.888. On the weakest unit (the repo's target): 0.870. On the back: 0.852 (BRD-V04, n=5,463).
- **Potato**: +2 ATK for this fight only. It clears honey, and a second potato on the same unit is rejected.
  - Placement: front 0.870, middle 0.817, back 0.785 (ENGB-03 corrected, n=7,357).
  - Never potato a honeyed unit.
- **Honey**: a 1/1 Drone after the unit faints. Placement: back 0.813–0.816, middle 0.78, front 0.77–0.78 (n=2,128–2,142).
- A reroll re-rolls the food. Feeding is repeatable via feed → reroll → feed, and the MIX search averaged 1.12 feeds per shop.

---------------------------------------------------------------------------------------------------------
## 4. The policy (simple, simulator-driven; this is what the rewrite should implement)

**Every shop:**
1. **Observe.** Collect board (atk, hp, tempAtk, honey, potato), shop pets (frozen), food, gold, round, wins, `seats`/`seatShop`, `opponentHandle`, and the live 80-bot catalog.
2. **Build the target T.**
   - **R0** (opponent hidden): 50% the previous match's opponent's most recent R0 board (from the book), 50% the pool of recent same-season R0 boards (weight = times faced). If there is no previous opponent, use the pool alone.
   - **R1/R2**: 75% the book board for (season, `opponentHandle`, round), if one exists, and 25% the same-round pool. Otherwise the pool alone.
   - Pass the revealed seat rules and the round into every simulator call.
3. **Score a board** as the maximum over seat orders of the T-weighted `sim.outcome` utility (W=1, D=0.5, L=0).
   - **Final round (R2)**, by the series score before the fight:
     - at 1-0 a draw wins the match, so utility is W = D = 1;
     - at 0-1 only a win avoids a loss, so D = 0;
     - otherwise D = 0.5.
   - This follows from the reducer (ENGB-11). Its value is INFERRED, not simulated.
4. **R0 shopping.**
   - Compute EV(take 3) and EV(keep k then one reroll) with the R0 table, or by sampling about 200 completions.
   - Buy the kept offers, reroll **once**, then buy the best completion.
   - **Never reroll a second time at R0.** Assert 3 units before endShop.
5. **R1/R2 shopping.** Loop:
   - evaluate every feed (skip invalid ones), every sell i → buy j (the sell only ever happens together with its buy), and every buy into an empty seat;
   - evaluate a reroll as the mean over 10 sampled shops of the best follow-up;
   - apply the best move if it gains more than 0.01, then observe and replan after every reroll;
   - stop when nothing improves.
   - At R1, if the target is already beaten and gold ≥ 3 with apple food, feed the apple to the unit the simulator prefers (permanent stats; INFERRED future value).
6. **Seat** the final board by `bestSeating(board, T)`. Moves cost nothing.
7. **Never freeze. Never fight short.** If the board has fewer than 3 units and a unit is affordable, buy the best affordable offer before endShop. Never exclude an affordable unit for any reason.
8. **Update the book.** After each battle, store the enemy's frame-0 board under (season, handle, round), including honey inferred from the frames, and the seat rules. The append-only telemetry stores the result, our board and actions; the book does not.

**Fallback tier list and seat roles**, for when the simulator is not available; also useful as a sanity check:
- **R0:** Credit Card Max = Newspaper = Webby > echo 3/4s = Cooper = Copy Humanizer = Writing Bot > Company Docs (middle only) = Office Ops = X Brief = Imogen = NYC Parent = WTD > wake/patch/Luma/Apple Search Ads > chip kits (mosquito/pin/sidestep/spite/dodo) > Hiring Signals, Site Audit, skippy, dial bot, Deal Hunting, Tech Demos, Home robots.
- **R1 upgrades:** Paid Media, Projects Manager, Sales Call Coach, GTM Loop Closer, Nightly Audit, Tradbot.
- **R2 upgrades:** Stalk Bot, Alfred, Executive Assistant, dr eggbot, Partnerships Call Coach, Lingxi's, Competitor Watch, the last_word rares.
- **Seats:**
  - Front: flamingo, bulk, grow, hold_the_line, or a hype that buffs itself.
  - Middle: echo, guard, wake, cover or patch, i.e. the friend-ahead kits.
  - Back: hype, last_word or echo.
  - spotlight only at the front. dump never at the front. last_word only last.

---------------------------------------------------------------------------------------------------------
## 5. Opponent adaptation: when it pays

| Level | Value | Evidence |
|---|---|---|
| Archetype label (classify → PLANS / ARCH_SEAT_TABLE) | ≤ +0.025 at R0; the repo's archetype lists often point the wrong way (§2.4) | `out_r0_arch.txt`; BRD-06 placebo: a single fixed plan correlates with winning better than the archetype-matched plan (0.252 vs 0.178) |
| Exact predicted board at R0 (previous opponent) | +0.059 as a 50/50 mix; pure prediction −0.053 (S1 late) / −0.080 (S2) | `out_r0_eval.txt` |
| Exact book board at R1/R2 | +0.061 as a 75/25 mix; pure known board 0.651 when the book is wrong | `out_r12b.txt` |

---------------------------------------------------------------------------------------------------------
## 6. Expected gain (vs the recorded corpus; `out_match_level.txt`)

| Era | Actual (R0 / R1 / R2) | Proposed (R0 / R1 / R2) | Match-win estimate (independent rounds, draws as half) |
|---|---|---|---|
| S1 early | 0.708 / 0.826 / 0.746 | 0.948 / 0.992 / 0.956 | 0.857 → 0.997 |
| S1 late | 0.446 / 0.598 / 0.511 | 0.879 / 0.979 / 0.945 | 0.528 → 0.990 |
| S2 | 0.368 / 0.641 / 0.314 | 0.857 / 0.981 / 0.872 | 0.405 → 0.977 |

Treat the proposed column as an upper bound, not a forecast (INFERRED):
- (1) The round counterfactuals are one round deep. R1/R2 start from the bot's actual (weaker) pre-shop boards, which is conservative. The permanent-apple value is ignored.
- (2) The corpus is the ghost pool the bot met at ratings of roughly 1,000–1,470. Stronger opponents at higher ratings will lower every number.
- (3) The greedy search samples reroll outcomes from the uniform unlocked pool. The engine lens confirmed that pool is uniform.
- (4) S2 numbers rest on 16 handles.

Even with no opponent memory at all (POOL at R1/R2, pool-only R0), the S1-late rounds are 0.851 / 0.860 / 0.891, which works out to a match-win estimate of about 0.95.

---------------------------------------------------------------------------------------------------------
## 7. Repo rules that contradict this strategy (delete or rewrite)

| id | Rule (file:line) | Contradiction (evidence) | Fix |
|---|---|---|---|
| STR-01 | Recipe planner: `driver/play_loop.js:2228-2377`; `lib/recipes.js:243-309` (pickRecipe), `:311-381` (planTowardRecipe; reroll+return at `:370-381`), `:106` (recordOutcome) | Chases 3 named bots; one specific common appears among the 3 R0 offers with p = 8.1%. Recipe R0 won 81/439 = 18.5% [15.1, 22.3] vs policy 131/248 = 52.8% (DEC-01), with 99.3% short boards. Optimal free-choice R0 scores 0.873 on the same real shops. | Delete |
| STR-02 | R0 reroll/fill: opener reroll `play_loop.js:1391-1404`, underfill mandatory reroll `:1613-1631` (plan-local guard), one-replan cap `:2902-2934`, emergency fill `:2936-2970` | The simulator optimum is **exactly one** R0 reroll (97.3% of offer sets). Two rerolls leave the board short in 621/621 cases (DEC-02). A short R0 wins 18.5% [15.6, 21.8] vs 64.1% with 3 units. | Budget invariant (§4.4); one buy path |
| STR-03 | Hard refusals and force-sells: `lib/seat_table.js:17-60` (GLOBAL_REFUSE, TIPS_ALWAYS, TIPS_ARCH_GATED), `play_loop.js:321-324`, `:1348-1352`, `:1705-1753` | Refuses units the simulator ranks above average: Company Docs Q&A R0 +0.085, X Brief +0.065, Apple Search Ads +0.030; **Sales Call Coach, R1 swap-in +0.196 (#4 of 61)**; **Nightly Audit Engineer +0.184 (#5)**. As hard gates they remove 14–22 of 36 R0 commons, which destroys the reroll EV. | Replace with simulator EV; no hard refusals |
| STR-04 | `ARCH_SEAT_TABLE` per-archetype refuse/prefer: `seat_table.js:77-147` | The global best board is best or within 0.025 against every archetype. It refuses Credit Card Max vs bulk_echo (grow lift vs bulk_echo +0.273) and Cooper / Writing Bot / Webby / Meeting Recap / Office Ops vs hype_battery (echo +0.095, bulk +0.086, hold_the_line +0.114 vs hype_battery). | Delete |
| STR-05 | Archetype layer: `lib/counters.js:53-92` (classify), `:94-273` (PLANS), `:320-403`, `:419-530` (biasScore/hedgePlan); `play_loop.js:547-604`, `:657-662`, `:1026-1035` (bulk_echo −5 for echo/patch/flamingo/wake/grow; flamingo −6) | 22 PLANS.avoid entries have simulated lift above +0.02 against their own archetype: bulk_echo grow +0.273 / echo +0.133 / flamingo +0.088; double_echo grow +0.224 / echo +0.143; hype_battery bulk/echo/hold/guard +0.086…+0.114; hype_battery.prefer sidestep −0.116; grow_hype.prefer guard −0.086. | Delete; simulator target instead |
| STR-06 | Webby/Copy "tip bleed": `play_loop.js:361-366` (isSoftBulkTipName), `:509`, `:654` (−4), `:1182` (front −6); seat_table hype_battery refuses Webby (`:145`) | Webby is #3 common (+0.145; empirical +0.117, n=384). Copy Humanizer +0.115 (empirical +0.116, n=435). | Delete |
| STR-07 | Grow HP gate: `play_loop.js:657` (grow −1.5 if hp < 5), `:1184-1185` (front −6 if hp < 5) | Credit Card Max (3/4) is the #1 common (+0.171, front in 77% of best orders; empirical +0.115 [0.082, 0.147]). | Delete |
| STR-08 | Seating heuristics: `play_loop.js:1175-1257` (frontSeatScore; hype/last_word −6 at `:1192`; backish push `:1236-1257`) | Same R0 units re-seated by the simulator: 0.718 → 0.799 (n=2,993). R1/R2 fought units re-seated against the known board: 0.758 → 0.883 (n=5,066). The optimum puts Writing Bot front in 60% of R0 boards. | `bestSeating` |
| STR-09 | Threat model and P1 wall: `counters.js:536-619`; `play_loop.js:1652-1703`; unshift `:1374` | Threat exact only 74.1% (ENGB-06). A plan against the enemy's real board reaches 0.976 without any threat heuristic. | Delete |
| STR-10 | Food heuristics: `play_loop.js:2024-2098` (potato +1/+1 `:2088-2092`, hp+1 gate `:2060-2067`, apple → weakest unit `:2074-2083`, feeds only on a full board, one feed), P7 no-reroll-while-food `:2104-2127` | Apple front 0.888 vs weakest 0.870; potato front 0.870 and never onto honey; honey back 0.813. The MIX search feeds 1.12 times per shop, using feed → reroll → feed. | Simulator-chosen feeds, repeatable |
| STR-11 | Freezes: `play_loop.js:2130-2148`; frozen rare +4 `:1017-1018`; sell-for-frozen `:1947` | No optimal line needs a freeze: buy-before-reroll dominates at R0, rares only unlock in R2 (the last shop), 83% of freezes were never bought (ENGS-10) and 34% were issued in R2. | Never freeze |
| STR-12 | Mirror and duplicate bans: `play_loop.js:632-634` (−50), `:995`, `:1011` (echo −6/−3), `:997-1003` (kit anti-mirror −4), `:1428-1436` and `:1772-1779` (flamingo refuse, hype cap of 2), `:1353-1360` (dupSoft) | The simulator scores duplicates and mirrors on their merits: Newspaper + Writing Bot ×2 0.991, Webby ×2 + Cooper 0.986. Mirror lift in the data is +0.019…+0.108 (BRD-07, DEC-08). | Delete |
| STR-13 | GHOST_PUNISH as a hard exclusion: `play_loop.js:481` + `:1380, :1420, :1566, :1589, :1669, :1985, :2139, :2952` | The simulator agrees these units are weak (Tech Demos −0.209, Home robots −0.233, skippy −0.126, dial bot −0.112, Clip Bot −0.046, Event Producer −0.036, GTM Connections −0.024). But excluding them from the fill turns them into short boards (−0.456 per short fight, BRD-01). | Keep them only as low-EV candidates; never block the fill |
| STR-14 | Name bombs and static unit score: MUST_BUY `:488-511`, GHOST_COUNTER `:482-486`, hotNameSet `:1095-1105` / `:635-641`, scoreUnit `:606-1036` | Mostly the right names, but it mixes refused units (Company Docs, X Brief) with a hot list frozen on 10 old files (LIB-14). It cannot see seat, food or the opponent. | Replace with the simulator evaluation |
| STR-15 | Opponent memory: `lib/ghosts.js:89-121` (one fingerprint per handle, overwritten every round), `play_loop.js:519-545`, `:2196-2206`, `:2647-2654` | The book is keyed by (handle, round) with a pool blend: MIX 0.976 vs POOL 0.915 vs actual 0.758 at R1/R2. At R0 the previous-opponent blend adds +0.059. | Ghost book keyed (season, handle, round) |
| STR-16 | Series logic: `play_loop.js:1296-1316` (1-1 only), `:1014-1016` (static series bonus) | Round 2 is always final: 993/1,782 R2 fights were not at 1-1 (ENGB-11). The objective must change with the score (§4.3). | Rewrite |
| STR-17 | Strategy docs: `study/omlejmi/COMPLETE_WIN_PLAN.md:22,33,40,71,100-103,146,289,297-303,402`; `GAME_SYSTEMS.md:32,40,78,114,172,186-196`; `WINNING_STRATEGY.md:21,48` | "First to 2", potato +1/+1, one food per shop, the opener/fill rerolls, mosquito hits front, "never seat0 hype", freeze rares, honey on front, survival inequality. All contradicted above. | Delete; one verified rules doc |
| STR-18 | Elo constants: `lib/avoid.js:43-45` (9/−7/−23); docs ±7/−23/−8 | The utility should be the simulated W/D/L with score-aware draws. Elo deltas depend on the rating gap (K=32; ENGS-11, LIB-V01). | Delete |
| STR-19 | Static kit sets: `play_loop.js:456-476` (KIT_FRONT incl. brace, KIT_WEAK incl. spot/poke, KIT_VALUE incl. patch), `counters.js:37-51` (SPINE incl. patch, TEETH), `lib/policy_draft.json` | Kit value depends on seat and partners. Examples: patch is +0.005 / −0.038 at R0; peacock (in KIT_FRONT, banned by isWallPunishTipKit `:368`) is +0.196 at R1. | Delete |
| STR-20 | Stale catalog and ignored seat rules: `lib/arena.js:75-84`, `lib/enrich.js:27-43`, no reader of `state.seats` | The strategy needs the 80-bot catalog and the seats in every simulator call. S2 seat-aware re-seating is worth about +0.03 (ENGB-02). S2 bots (Memento, Commitments) are R1 upgrades. | Fetch `/api/catalog`; pass the seats |

---------------------------------------------------------------------------------------------------------
## 8. Cross-lens conflicts and how they resolve

1. **GHOST_PUNISH.** DEC-V01 and BRD-10 say remove it as untested. The simulator shows 4 of its 7 units in the R0 F tier and the other 3 in the D tier. **Resolution:** the list is roughly right as a *ranking*; the harm is using it as a hard ban in the fill. Keep the ranking, drop the ban (STR-13).
2. **LIB-V05 ("no rated simulator possible") vs ENGB-01 (a rated-kit simulator, 100% frame-exact).** ENGB supersedes LIB-V05. I re-checked 9,730/9,730 winners.
3. **LIB-05 ("seat_table refusals are noise") vs its verifier (most refused units do underperform).** Both are partly right:
   - 9 of the 17 GLOBAL_REFUSE/TIPS units are negative in simulation (Deal Hunting, Hiring Signals, Site Audit, GTM Prospecting, Pipeline Pulse, Event Request, Signal Prospector, SEO, Love).
   - Company Docs, X Brief, Apple Search Ads, Sales Call Coach and Nightly Audit are positive.
   - The decisive harm is the hard-refusal mechanism, not the list itself.
4. **Honey placement.** BRD-08 notes top players honey the front 60% of the time; the simulator says back 0.813 > front 0.78. **Resolution:** simulate, defaulting to back. Top-player R0 boards score only 0.747 as played against our pool (0.804 best-ordered, n=113; `out_topplayers.txt`), so they are not an optimality reference.
5. **One reroll at R0.** OUT-06 says one reroll helps (+10 pts); ENGS-02 and DEC-02 say rerolls cause short boards. **Resolution:** exactly one is optimal (+0.18 over taking the three offered); a second is always fatal.
6. **ENGB-14 (plan against a same-round pool) vs ENGB-V01, BRD-02 and DEC-03 (plan against the exact (handle, round) board).** **Resolution:** a blend beats both. When the prediction is wrong, pure known-board play falls about 0.19–0.20 below pool-only (R1/R2: 0.651 vs 0.840, n=302; R0: 0.663 vs 0.859, n=880). The blend stays level with pool-only (0.879 and 0.846).
7. **BRD-02's R0 exact-board lever vs BRD-V02 ("unattainable, about +0.05").** Measured with the previous opponent's board as the only R0 prior: +0.059 as a blend. BRD-V02 was right.
8. **Guard.** ENGB-08 says "never at index 0"; its verifier says use the simulator. The simulator puts Company Docs in the middle 59%, back 34% and front 7%. The simulator rule wins.
9. **Collapse attribution.** PL-01, LIB-01 and OUT-02 blame recipes; LIB-V02, DEC-V04 and OUT-11 blame an opponent-pool shift at 04:00Z. This does not affect the strategy: every estimate here is paired against the same enemy boards, so pool strength cancels out.
10. **Objective.** DEC-16 says break-even win rate is mis-specified; its verifier says it is Elo equilibrium. Consistent with the verifier: the simulated round scores reproduce the observed settling rating (≈1,311 vs ≈1,300–1,322).

---------------------------------------------------------------------------------------------------------
## 9. Gaps (what this could not establish, and what would settle it)

- **S2 depth.** Only 178 S2 matches against 16 handles.
  - route and caffeinate have never been observed, so their simulator semantics are guesses. They flatter Master and Apple Dev.
  - bloom and hand_off shop buffs are not in the R1/R2 swap-in values.
  - Seat rules are known only when they captioned, so a silent Hard hat or Encore can be missing from a corpus entry.
  - **To settle:** log `state.seats`, `seatShop`, `tempAtk`, `potato` and the full frames every battle (ENGB-12), then re-run `run_all.sh` on S2 data.
- **Opponent strength at higher ratings.** The corpus ghosts are about 1,000-rated (OUT-05). The S1-late slice is the closest to a parity pool and still gives 0.88–0.98 per round, but a top-10 pool is unmeasured.
  - **To settle:** a shadow run that logs simulator-predicted vs actual results per round with the new policy, stratified by the implied opponent rating.
- **One-round horizon.** The R0 board's effect on R1 options, and an apple's future value, are not chained. The greedy search is one step deep, so a deeper search may add more.
- **Honey.** Ghost honey is unknown until one of its honeyed units faints in front of us: 97.2% winner accuracy with unknown ghost honey vs 100% with it resolved. The book should store honey inferred from Drone captions.
- **Stickiness.** The value of opponent memory depends on the matchmaker re-serving the same handles:
  - R0 prediction exact 79.6% in S1 vs 37.6% in S2.
  - R1 book exact 88–91% in S1 vs 64% in S2.
- **Final-round utility switch** (§4.3) is not quantified.
- **Match-level numbers** assume independent rounds; the per-round numbers are the reliable ones.

---------------------------------------------------------------------------------------------------------
## 10. Scripts (all in `$S/audit/strategy/`)

| Script | Purpose |
|---|---|
| `build_corpus.py`, `build_shops.py` | Build the corpus: exact inputs joined to handle and pre-shop state |
| `lib.js`, `check.js` | Shared helpers; harness validation |
| `r0_table.js`, `r0_table_early.js`, `r0_merge.js` | Exhaustive R0 table (all pools; S1-early-only for the out-of-sample test) |
| `r0_units.js`, `r0_policy.js`, `r0_eval.js`, `r0_report.js`, `r0_actual_decomp.js`, `r0_arch.js`, `r0_arch_report.js` | R0 analyses |
| `r12_policy.js` (in-sample pool, superseded), `r12b_policy.js`, `r12b_report.js` | R1/R2 counterfactual search |
| `unit_value_r12.js`, `uv_report.js` | R1/R2 unit tiers |
| `topplayers.js` | Top-player benchmark |
| `match_level.py` | Match-level conversion |
| `run_all.sh` | Re-runs everything |
