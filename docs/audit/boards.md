# BRD: Boards, units, kits and opponents audit (thursday-arena bot "tetsuoai")

> **Historical audit (2026-09-19, before the simulator rewrite).** References below to the
> “current” or “live” code mean the old `seat_table.js` era at 07:21Z, not the code in this repo
> today. The old data and study files are in `archive/legacy-2026-09-19/`; the audit scripts are
> in the scratchpad path described below. See [AGENTS.md](../../AGENTS.md) and
> [HISTORY.md](../HISTORY.md) for the implemented rewrite and later measurements.

Scope: which of our boards, units and kits actually win, which enemy boards beat us, whether `classify()` and the counter plans do anything, and a verdict on every entry in every hardcoded unit or kit list. The audit is read-only on the repo. Every script and table is in `scratchpad/audit/boards/`, and `run_all.sh` re-runs all of them.

## 0. Data and method

- **Primary truth is the round-level fights** in `data/decisions/events.jsonl`: 9,770 fights across 3,988 finished matches, 2026-09-18T11:06Z to 2026-09-19T07:28Z. Each fight row holds our exact 3 units (name, kit, atk/hp, honey), their 3 units and the winner. Score is win=1, draw=0.5, loss=0. Results are cross-checked against `matches/log.jsonl` (3,991 rows) and `matches/climb/climb.log` (504 rank checks).
- **Opponent-adjusted lift ("lift")**: our fight score minus the mean score of all *other* fights against the identical enemy line (names + stats) in the same round, leave-one-out. It covers 9,070 of 9,770 fights. This controls for opponent strength, round and ghost identity. The CI is ±1.96·SE.
- **FE coef**: ridge regression with enemy-line fixed effects over all our units at once (controls for teammates), with a 150-rep match-clustered bootstrap CI. The file is `within_unit.csv`, plus `within_kitseat.csv` for kit×seat.
- **Engine sim**: counterfactuals use `scratchpad/engine/sim.js`, which another agent built from the client `simulateBattle` plus reverse-engineered S1 kits. I checked it on our 9,301 season-1 fights. Modal winner agreement is 93.0%. The mean sim expected score is 0.722 against 0.719 observed. On the mosquito subgroup it is 0.625 against 0.624, and on the honey subgroup 0.793 against 0.781. It is well calibrated, so sim results below are labelled SIM and taken as reliable on average.
- **Code eras**: taken from `.bak` mtimes and name stamps (local MDT = UTC−6). E0 is before 11:56Z, E1 hedge runs to 01:18Z, E2 to 01:59Z, E3 to 02:48Z, E4 refuse/isfarm runs to 04:58Z, E5 encoded-loss-fixes and recipe runs to 07:21Z, and **E6 is the current code** (`seat_table.js`, 07:20:18Z; `play_loop.js`, 07:21:24Z). **Season 2 started at about 06:59Z** (rank-check W/L reset to 1-5, and new bot ids appear from 07:00:16Z).
- **Labels**: PROVEN means computed directly from logs or read directly from code. INFERRED means a causal reading or a sim-based estimate.

## 1. Headline numbers (PROVEN unless marked)

| Metric | Value |
|---|---|
| Matches, W/L/D | 3,988, 2,906/761/322, WR 72.9% |
| Net rating over the period | **−656** (sum of `elo`) |
| Performance vs Elo expectation (K=32, E from delta) | **−0.005 per match** (S=3,066 vs E=3,086.5). No era had a real edge; E1 (n=2,196) was +0.002 |
| Mean win / loss delta | +6.05 / −20.97, so the break-even WR is about 77.6% |
| Fights (win/draw/loss) | 9,770 (6,250 / 1,253 / 2,267), score 0.704 |
| Current code (E6, 49 matches, S2 only) | **3W-42L-4D, WR 6.1% [2.1%, 16.5%]**, perf −0.143/match, **48/48 R0 fights short-handed** |
| E5 (recipe planner), 631 matches | WR 42.6% [38.8%, 46.5%] |
| Fights with fewer than 3 of our units | 690 (score 0.261). Paired against the same enemy line: **−0.456** |
| Matches whose R0 fight was short | 641: WR 41.7% [0.38, 0.46], **net Elo −1,809**. R0 full: 3,287, WR 79.2%, net +1,353 |
| Fights against an exact enemy board already seen (same opponent + round) | **8,180 / 9,770 = 83.7%** |
| Fight losses in cells (opponent, round, board) we lost at least 3 times | 1,581 / 2,267 = 70% |
| Distinct unordered boards we fielded | 5,140 across 9,770 fights (only 31 with n≥10) |
| "Template" boards (front kit in seat 0, hype/echo/last_word/cover in seat 2) | 26% of fights, score 0.876, lift **+0.140** [+0.129, +0.152]. Only 14% in E6 |
| Verdicts across 515 hardcoded list entries | 169 supported, 13 contradicted, 194 not supported (neutral), 138 insufficient, 1 unresolved |

## 2. Findings (most severe first)

### BRD-01 CRITICAL: the recipe planner makes us fight R0 with 1–2 units. This one bug accounts for the whole net rating loss.
- PROVEN. R0 fights where the shop reason was `recipe`: **446 of 449 short** (99.3%), score 0.278. Policy R0: 207 of 3,547 short (5.8%), with full boards scoring 0.725.
- PROVEN. Short boards against the *same* enemy line (169 lines, 540 short vs 2,310 full fights) lose **0.456** fight score. Matches with a short R0 went 41.7% WR and −1,809 Elo. Matches with a full R0 went 79.2% and +1,353. The whole period's −656 net therefore comes from short R0s.
- PROVEN. Share of fights fought short by era: 2–5% in E0–E4, **26% in E5 and 47% in E6**. In E6 every R0 was short (48/48, score 0.177).
- Mechanism (PROVEN from code and logs):
  - `lib/recipes.js:370-381` rerolls for missing named pieces and returns *before* buying fillers.
  - `driver/play_loop.js:2902` replans once and rerolls again. The dominant R0 pattern is 2 rerolls, then 0–2 buys (628 of 653 short R0s).
  - The "HARD FILL 3" loop at `driver/play_loop.js:2938-2970` skips any offer costing more than the remaining gold, so it cannot finish the board.
  - The CLAUDE.md claim "Never fight short" is false in practice.

### BRD-02 CRITICAL: ghosts are deterministic per (opponent, round), but the bot plans against the wrong board and keeps losing to boards it has already seen.
- PROVEN. For repeat opponents, the round-r enemy board is identical across rematches for 345/379 handles in R0, 352/379 in R1 and 255/324 in R2. **83.7% of all fights were against an exact board already seen**. Yet our score against known boards (0.710, n=8,180) is no better than against first sightings (0.718, n=1,132).
- PROVEN. 291 cells had at least 3 losses, holding 1,581 losses. Examples: cibaru R0 "Meeting Recap Deck 3/4 | Cooper 2/5 | skippy 2/4" beat us 29 times; cibaru R2 "Love | Haggle Bot | Lingxi" 26 times; _tech_lord R1 24 times; orangepeel R0 23 times. Longest streaks of consecutive losses to one opponent were 16 (josephyangx) and 10 (vibeleiz, jaimebubblehead).
- PROVEN. The planner uses the *previous* round's board:
  - `memory/ghosts/by_handle.json` stores one fp per handle, overwritten every round (`lib/ghosts.js:86-121`).
  - The fp is names-only, with no round and no stats.
  - At shop time, `ghostFp` matched the board actually fought in only 1,062/3,991 R1 fights (26.6%) and 473/1,782 R2 fights (26.5%).
  - R0 shops had no ghost in 3,607/3,996 cases, even though the opponent's R0 board was known from earlier matches.
  - With the current `classify()`, the believed arch equalled the actual arch in only 2,885/5,681 R1/R2 fights (50.8%).
- SIM. Keeping our units and choosing only the best of the 6 seat orders against the known enemy board raises 3v3 fight score from 0.749 to **0.895** (n=8,766). By round: R0 0.725→0.877, R1 0.783→0.917, R2 0.720→0.878.
- SIM. At R0, buying just the 3 first offers (no rerolls) and seating them optimally against the known ghost scores **0.774** vs the actual 0.666 (observed 0.664, n=3,796).
- SIM. An exhaustive search of all 46,656 ordered commons triples against the 7 R0 boards that beat us most found that 1.5%–40% of triples reach a sim score of at least 0.9. Every one of those boards has multiple 1.00 solutions:
  - Vs cibaru "Recap|Cooper|skippy": "Outbound Prospecting | Outbound Prospecting | Writing Bot" and others.
  - Vs josephyangx "Webby|WTD|Outbound": "Imogen | Imogen | Writing Bot".
  - The 7 boards were solved in 10 s total.

### BRD-03 HIGH: seating puts ability-dead units in the front seat in 27% of fights.
- PROVEN. In 2,438 of 9,080 3v3 fights (27%), seat 0 held a kit that needs a friend ahead or only works at the back: echo, guard, patch, wake, cover, dodo, dump or last_word. In 2,091 of those, a unit that could hold the front was sitting behind it.
- PROVEN (FE coefficients by kit and seat, with enemy-line FE):

  | Kit | Bad seat | Good seat |
  |---|---|---|
  | echo | seat 0: −0.162 [−0.243, −0.104] | seat 2: +0.089 |
  | dump | seat 0: −0.580 | — |
  | wake | seat 0: −0.097 | — |
  | sidestep | seat 0: −0.105 | — |
  | flamingo | seat 2: −0.099 | seat 0: +0.162 [+0.093, +0.216] |
  | grow | — | seat 0: +0.155 |
  | peacock | — | seat 0: +0.142 |
  | hype | — | seat 2: +0.106 |
  | last_word | — | seat 2: +0.129 |

- PROVEN. Top players (109 public replays) vs us, as the share of that kit placed in seat 0:

  | Kit | Top players | Us |
  |---|---|---|
  | echo | 3% | 16% |
  | guard | 20% | 46% |
  | patch | 15% | 40% |
  | wake | 0% | 31% |
  | cover | 7% | 34% |
  | grow | 49% | 22% |
  | flamingo | 89% | 65% |

- SIM. In the 2,015 dependent-front fights, swapping the non-dependent unit to the front raises sim score from 0.629 to **0.748**. A fixed kit-rule order with no enemy info gives 0.768 vs 0.749 actual over all 3v3 fights.
- Code: `frontSeatScore` at `driver/play_loop.js:1175-1197` scores mostly hp×1.1. Guard and patch get only −1 and echo −4. `seatBoard` (`:1213-1257`) only moves echo off the front when bulk, grow, flamingo or guard sits directly behind it.

### BRD-04 HIGH: the global ban lists are built on mis-seated, confounded data. They ban neutral and even above-average units.
- PROVEN. Several "toxic" units are only bad in seat 0 (lift by seat, n in brackets):

  | Unit | Seat 0 | Seat 1 | Seat 2 |
  |---|---|---|---|
  | X Brief | −0.327 (125) | **+0.047** (440) | +0.037 (335) |
  | Call Follow-Ups | −0.285 (155) | +0.130 (531) | — |
  | Meeting Recap Deck | −0.198 (123) | +0.087 | — |
  | Cooper | −0.130 (232) | +0.115 | — |
  | Company Docs Q&A | −0.071 (**661**, 47% of its fights) | +0.026 | — |
  | Video Edit Desk | −0.171 (122) | — | +0.062 |
  | Flora: Plant Care Log | −0.061 | — | +0.096 |

- PROVEN. `GLOBAL_REFUSE` (`lib/seat_table.js:17-37`) and `TIPS_ALWAYS` (`:40-50`) refuse and force-sell these units. Verdicts:
  - **Contradicted:** Nightly Audit Engineer (lift +0.036 [+0.001, +0.072], FE +0.061 [+0.015, +0.100], n=240) and Sales Call Coach (lift +0.055 [−0.005, +0.115], FE **+0.100 [+0.025, +0.163]**, n=125).
  - **Neutral (not supported):** X Brief (−0.006, n=874), Company Docs Q&A (−0.018, n=1,338), Video Edit Desk (−0.019), Flora (−0.019) and Product Support Inbox (−0.013, n=90).
  - **Supported (really bad on average):** Deal Hunting −0.220, Hiring Signals −0.161, GTM Prospecting −0.104, Site Audit −0.092, Pipeline Pulse −0.057, Event Request Desk −0.055, Apple Search Ads Review −0.053, SEO & AEO −0.047, Love −0.040 and Signal Prospector −0.037.
- PROVEN. Where the numbers came from: `study/FULL_AUDIT.md`, per the `seat_table.js` header. It used only the 771 matchlog matches from 04:30–07:28Z, which is the collapse window where short boards dominated. It joins the *last shop board* to the match result, ignores the 3,200 earlier matches, applies no seat control, and counts draws as losses. For example, Nightly Audit Engineer "10-6-9, 40%" is 62.5% of decisive games, and Sales Call Coach was refused on n=10.
- PROVEN. The overall effect: 19 of 72 catalog units are refused under every arch, and 14–22 of the 36 R0 commons are refused depending on the arch (`crosslist.js`). With about half the R0 pool banned, reroll pressure goes up, which feeds BRD-01.

### BRD-05 HIGH: the lists contradict each other. The same unit gets boosted and banned.
All PROVEN (`crosslist.json`):
- Company Docs Q&A and X Brief are in `MUST_BUY_NAMES` (+4, `driver/play_loop.js:488-507`) and also in `GLOBAL_REFUSE` (refuse + force-sell) under all 18 archs.
- `seat_table.js` also lists Company Docs three times as substring aliases (`company docs`, `docs q a`, `company docs q&a`).
- Product Support Inbox Assistant is in both `TIPS_ALWAYS` and `TIPS_ARCH_GATED` (`seat_table.js:40-60`), so the arch gate can never pass.
- Office Ops Desk is in MUST_BUY, GHOST_COUNTER and prefer (flamingo_pass, bulk_echo) but is refused under buff_suicide, hype_battery, hurt_revenge and grow_hype.
- Imogen is in MUST_BUY and GLOBAL_SPINE but refused under hurt_revenge. Cooper is refused under hype_battery and echo_hype. Credit Card Max is refused under bulk_echo.
- Webby and Copy Humanizer:
  - Comments call them "tip bleed — NEVER must-buy" (`play_loop.js:509`), and there is a −16 hype_battery ban plus a `seat_table` hype_battery refuse on Webby.
  - Data: Webby **+0.070 [+0.051, +0.088]** (n=1,114) and Copy Humanizer **+0.068 [+0.048, +0.087]** (n=1,121) are among our best units.
  - The comment at `play_loop.js:653` says Copy Humanizer is kit=bulk. It is flamingo.
- Nightly Audit Engineer is refused globally, yet its kit (cover) is in KIT_VALUE and SPINE. Sales Call Coach is refused globally, yet peacock is in SPINE, TEETH and KIT_FRONT.
- Luma Pages is preferred for glass_burst but refused under chip_snipe. Data for chip_snipe: +0.062 [+0.013, +0.111] (contradicted).
- Stills & Clips Desk is preferred under glass_burst and backline_snipe, but is in HARD_TIP_BAN_NAMES and refused in 16 of 18 archs.

### BRD-06 HIGH: `classify()` and the per-arch counter plans have no predictive value, and they do worse than one fixed plan.
All PROVEN; reproduced with the *current* `classify()` over all 9,770 fights, which agrees with the logged label 94.0% of the time.
- **Instability:** the enemy arch label changes between consecutive rounds of the same match in 46.6% of transitions (2,658/5,709). 70% of handles receive at least 2 labels, and one handle received 13.
- **Low information:** the arch explains R² = 0.053 of fight score (0.089 with round). Our-minus-their stat difference explains 0.248. Within one arch, difficulty ranges from 0.00 to 1.00. Example: "tech demos | …" boards score 0.78–1.00 for us, while "love | haggle bot | lingxi" scores 0.17. Both are `glass_burst`, because `first_seat` wins the priority check (`lib/counters.js:57`).
- **Placebo test (within enemy line):**

  | Plan applied | Correlation of score with plan adherence (prefer − avoid kit count) |
  |---|---|
  | PLANS[actual arch] (what the bot does) | 0.166 |
  | PLANS.flamingo_pass applied to *every* fight | 0.218 |
  | PLANS.unknown applied to every fight | 0.201 |
  | One global kit list | 0.239 |

  Arch-specific plans are worse than applying any of the better single plans everywhere.
- **Per-arch tables are mostly noise:**
  - `ARCH_SEAT_TABLE`, 120 entries: 29 supported, 51 neutral, 38 insufficient, 2 contradicted.
  - `PLANS` prefer/avoid, 230 entries: 45 supported, 99 neutral, 82 insufficient, 4 contradicted. The contradicted avoids are flamingo vs echo_hype (+0.174), echo vs sustain (+0.090), echo vs buff_suicide (+0.053) and flamingo vs buff_suicide (+0.111 [+0.063, +0.160]).
- **Dead branches:** `lib/counters.js:74, 76, 78, 80` are unreachable. `HEDGE_VS` (`:454`) is never used. `frontDiesTo` is only used by `smoke_plan.js`.

### BRD-07 MEDIUM-HIGH: the anti-mirror rules have no support.
- Code:
  - −50 for buying any unit the ghost has (`driver/play_loop.js:632-634`).
  - −4 kit anti-mirror (`:997-1004`).
  - Echo vs echo-ghost −6 and −3 (`:995`, `:1011`).
  - Hard refusal of flamingo against flamingo boards (`:1431-1436`, `:1775-1779`).
- PROVEN:
  - Same-name mirror units: lift +0.022 [+0.003, +0.042] (n=1,403) vs +0.007 for others.
  - Flamingo mirror +0.082 vs non-mirror +0.075. Echo mirror +0.050 vs +0.033.
  - Echo-vs-echo draw rate is 14.0% vs a 13.8% baseline, so the "draw machine" claim is false.
  - Flamingo against flamingo_pass: +0.091 [+0.037, +0.144]. `PLANS.flamingo_pass.prefer` includes flamingo while the code refuses it.

### BRD-08 MEDIUM: food. The honey-to-front rule is wrong, and we under-invest in stats.
- PROVEN, associational. In policy-only fights (E0–E4), paired within the enemy line: honey on the front minus honey on the back = **−0.221** (187 lines), and front minus none = −0.218. Restricted to boards with a real front kit in seat 0, it is still −0.119.
- SIM, over 2,142 R1/R2 fights with one honey:

  | Food choice | Sim score |
  |---|---|
  | No food | 0.718 |
  | Honey in seat 0 | 0.771 |
  | Honey in seat 1 | 0.775 |
  | Honey in seat 2 | 0.815 |
  | Apple on the front unit | **0.862** |
  | Potato on the front unit | 0.860 |

- Code: `lib/recipes.js:383-399` feeds honey to the recipe front, and `lib/counters.js:540` counts honey as +2 HP of front eHP.
- Top players put honey in front in 60% of R1 cases (39/63). The sim and our data both favour the back, so this should be tested live.
- PROVEN. R1 fight score by number of feeds: 0 → 0.536, 1 → 0.720, 2 → 0.858. Stat points above base at R2: ours 1.38, top players 2.91. Rerolls average 1.1 per shop at R1/R2, and 2 rerolls score worse than 1 (R1: 0.644 vs 0.834).

### BRD-09 MEDIUM: kit lists. The right core, plus dead and wrong entries.
All PROVEN, kit-level lift:
- **Supported good kits:** flamingo +0.075, hype +0.043, echo +0.039, bulk +0.037, hold_the_line +0.035, grow +0.028, last_word +0.053.
- **Supported bad kits:** dump −0.403, drain −0.220, backtap −0.150, mosquito −0.070, pin −0.067, sidestep −0.057. Boards holding a drain, dump or backtap unit (10% of fights) show lift **−0.175**.
- **Wrong or dead entries:**
  - `KIT_WEAK` lists `spot` and `poke`, and `KIT_FRONT` lists `brace`. None of these kits exist in the 80-bot catalog. `spite` only matters for Event Producer, which is already GHOST_PUNISH.
  - `KIT_VALUE` includes patch (−0.026 [−0.045, −0.007], contradicted), wake (neutral), snowball (−0.059, neutral) and cover (neutral).
  - `KIT_MID` includes guard, but guard in seat 1 has FE −0.067 [−0.133, −0.005] (contradicted). In seat 2 it is +0.038, and top players put guard at the back 43% of the time.
  - `counters.SPINE` includes patch (contradicted).
  - `isWallPunishTipKit` bans peacock (overall +0.027, seat 0 FE +0.142 [+0.041, +0.240]) and snowball (neutral).
  - `TEETH` spotlight and sting are neutral with small n.

### BRD-10 MEDIUM: `GHOST_PUNISH` permanently bans 7 units that were never tested and are easy to beat.
- Code: `driver/play_loop.js:481` bans Tech Demos, Home robots, Clip Bot, skippy, GTM Connections, dial bot and Event Producer from our buys (−4.5) and from the emergency fill (`:2952`). The basis is one ghost (jason2reynolds).
- PROVEN. We fielded these units 0 times, so there is no evidence either way. As enemies they are *easy* for us:

  | Enemy unit on their board | Our fight score |
  |---|---|
  | Tech Demos (n=1,760) | 0.783 |
  | Home robots | 0.816 |
  | Clip Bot | 0.783 |

  An enemy first_seat kit is worth +0.061 to *us* after controlling for stats.
- Top players do field them: GTM Connections 13, skippy 12, Clip Bot 11 and Event Producer 9 unit-rounds out of 780.

### BRD-11 MEDIUM: what actually beats us is scaling-engine boards, which is our own best template.
- PROVEN. Enemy effects on our score, controlling for stat difference, board sizes and round (`their_*_effects.csv`):
  - By kit and seat: grow in seat 0 **−0.223**, grow in seat 2 −0.189, echo in seat 1 −0.177, echo in seat 2 −0.180, hype in seat 2 −0.158, flamingo in seat 0 −0.100.
  - By unit: Paid Media Report Desk −0.282, Lingxi's Engineer Bot −0.244, Credit Card Max −0.218, Apple Search Ads Review −0.153, Writing Bot −0.150, X Brief −0.140, WTD −0.125, Call Follow-Ups −0.108.
- PROVEN. Worst archs for us by score:

  | Arch | Score | n |
  |---|---|---|
  | grow_hype | 0.325 | 97 |
  | echo_hype | 0.427 | 185 |
  | double_echo | 0.449 | 128 |
  | grow_scale | 0.507 | 74 |
  | hype_battery | 0.561 | 245 |
  | bulk_echo | 0.576 | 521 |
  | flamingo_pass | 0.592 | 931 |
  | glass_burst (easiest real arch) | 0.769 | 2,516 |

  PLANS.glass_burst nevertheless carries an 8-kit avoid list.
- PROVEN. Our best kit patterns (seat 0-1-2) agree:

  | Pattern | n | Score | Lift |
  |---|---|---|---|
  | bulk-echo-hype | 149 | 0.970 | +0.234 |
  | bulk-hype-hype | — | — | +0.228 |
  | bulk-echo-echo | — | — | +0.224 |
  | flamingo-hype-hype | — | — | +0.199 |
  | flamingo-echo-hype | — | — | +0.147 |
  | echo-hype-hype (echo in front, worst) | 73 | — | −0.184 |

### BRD-12 MEDIUM: Season 2 made the catalog and all lists stale. The current code has only run in Season 2.
- PROVEN. From about 06:59Z, 8 new bots appear: coffee companion (bloom), X High Coach (reach_check), Fondi (hand_off), Commitments (keep_open), Memento (recall), Apple Dev (caffeinate), Shepherd (herd) and Master (route). New seat rules also appear (`state.seats` / `seatShop`, parsed in site chunk `1ou4egaetj-op.js`).
- `catalog.json` (Sep 17) and `lib/name_to_kit.json` lack the new bots. In 469 S2 fights, 65 had one of our units with no name or kit (for example `xSfBSprfKv5h909uzrv7W`), and 52 had one on the enemy side.
- `play_loop.js` never reads `state.seats`. Every list and arch was fit on S1 data. E6 (current code) is 49 matches, all in S2, against opponents with an expected score of only 0.245 for us.

### BRD-13 MEDIUM: recipe memory has no statistical power, and the planner never assembles its targets.
- PROVEN. 3,191 recipe files for 3,989 plays; 84% have exactly 1 play.
- The recipe planner had all 3 target pieces in only 30 of 1,393 recipe-planned fights (2.2%), and none of them in 551 (40%).
- Recipe-planned fights scored 0.546 in R1 and 0.456 in R2, against 0.811 and 0.732 for the policy planner (confounded with E5/S2).
- `seedAntiTechDemos` (`lib/recipes.js:113-175`) writes invented stats (plays 5 / wins 5 / elo 40, and similar) that bias `pickRecipe`.
- The recipe-id regex ban at `driver/play_loop.js:2288` bans `luma`, whose data is neutral (+0.018).

### BRD-14 LOW: dead list code
- `driver/play_loop.js:665-992` and `:1038-1091` are `if (false)` blocks, about 380 lines holding more than 20 unit and kit lists. Examples include the "DOCS_STACK_VS_COACH −20" list and the per-arch regex boosts. `isDoubleCoachHurtGhost` is only called inside this dead code.
- `alwaysBleedBan` (`:316`) has no callers.
- These lists have no runtime effect but are what the prior AI kept patching. PROVEN.

## 3. Verdict per list (full per-entry table: `boards/list_verdicts.csv`)

| List (file:line) | Entries | Supported | Neutral | Contradicted | Insufficient | Notes |
|---|---:|---:|---:|---:|---:|---|
| GLOBAL_REFUSE (seat_table.js:17) | 19 | 10 | 7 | 2 | 0 | Contradicted: Sales Call Coach, Nightly Audit Engineer. Neutral: X Brief, Company Docs (×4 aliases), Video Edit Desk, Flora |
| TIPS_ALWAYS (seat_table.js:40) | 9 | 6 | 2 | 1 | 0 | Sales Call Coach contradicted. Product Support Inbox neutral |
| TIPS_ARCH_GATED (:53) | 6 | 2 | 4 | 0 | 0 | Only EBR and Outbound are really bad |
| GLOBAL_SPINE (:63) | 10 | 9 | 1 | 0 | 0 | Imogen neutral (+0.019) |
| ARCH_SEAT_TABLE (:77-151) | 120 | 29 | 51 | 2 | 38 | Arch-specificity not supported (BRD-06) |
| HARD_TIP_BAN_NAMES (play_loop.js:225) | 15 | 7 | 6 | 1 | 0 | "stills and clips desk" unresolvable; pipeline pulse listed twice |
| GHOST_PUNISH (:481) | 9 | 0 | 0 | 0 | 9 | Never fielded; easy as enemies |
| GHOST_COUNTER (:482) | 12 | 9 | 2 | 0 | 1 | Mostly right |
| MUST_BUY_NAMES (:488) | 18 | 13 | 4 | 0 | 1 | Company Docs and X Brief are also globally refused |
| isFlamingoHurtTipName extras (:335) | 11 | 6 | 2 | 0 | 3 | — |
| KIT_WEAK (:476) | 8 | 4 | 1 | 0 | 3 | spot/poke not in game |
| KIT_VALUE (:463) | 11 | 7 | 3 | 1 | 0 | patch contradicted |
| isWallPunishTipKit (:368) | 9 | 5 | 4 | 0 | 0 | peacock/snowball/wake/sting neutral |
| KIT_FRONT / MID / BACK (:456-459) | 13 | 9 | 2 | 1 | 1 | guard in MID contradicted; brace not in game |
| counters.SPINE / TEETH (counters.js:37, 51) | 15 | 8 | 6 | 1 | 0 | patch contradicted |
| PLANS prefer/avoid (counters.js:94-330) | 230 | 45 | 99 | 4 | 82 | — |

Supported "bad" units, the only bans worth keeping: Deal Hunting, EBR & Value Deck Builder (and the dump kit generally), Talent Discovery, Hiring Signals, GTM Prospecting, Site Audit, Outbound Prospecting (as a default), Pipeline Pulse, Event Request Desk, Apple Search Ads Review (outside seat 0), SEO & AEO, Love, Signal Prospector. Even these can be correct against a specific known board (the SIM solver picks Outbound in the front against several ghosts), so a sim should override them.

Best units, opponent-adjusted (lift / FE coefficient):

| Unit | Lift | FE coef | Notes |
|---|---|---|---|
| Paid Media Report Desk | +0.123 | +0.162 | — |
| Projects Manager | +0.091 | +0.110 | — |
| The Morning Newspaper | +0.084 | — | Front: +0.128 |
| Webby | +0.070 | — | — |
| Copy Humanizer | +0.068 | — | Front: +0.123 |
| Credit Card Max | +0.067 | — | Front: +0.115 |
| Call Follow-Ups | +0.065 | — | Seats 1/2: +0.13 |
| GTM Loop Closer | +0.055 | — | — |
| Cooper | +0.055 | — | Seat 1: +0.115 |
| WTD | +0.052 | — | Seat 2: +0.074 |
| Tradbot | +0.046 | — | Seat 1: +0.131 |
| Meeting Recap Deck | +0.045 | — | — |

Stalk Bot, Alfred and Lingxi also look strong, but with n=20–32.

## 4. Top players vs us (study/raw_matches: 109 non-us replays, mostly omlejmi, ryanmcadams, breezeeoo, izzat316)
- Round score: R0 0.62, R1 0.84, R2 0.74, against stronger opponents than ours. Board size was 3 in 100/109 R0 rounds.
- Kit seats: bulk, flamingo, grow, hold and peacock go in front; echo in the middle; hype at the back. This matches our high-lift template (BRD-03).
- Food: top players invest in stats (R2 +2.91 stat points above base vs our 1.38) and use potato on the front (15/19 R1).
- Their unit mix includes many of our banned units at R0: Apple Search Ads 24, Signal Prospector 20, Video Edit 20, Love 17, SEO 15. Their round score falls with each such unit (R0: 0.735 with none, n=34; 0.57 with one, n=49), which is consistent with our "supported bad" list. It is therefore a filler cost, not a reason to fight short.
- Leaderboard (memory/leaderboard_snapshot.json, 02:53Z): the top 10 run 81–94% WR (omlejmi 375-25). We were rank 12 at 83.3% on 4,126 games, so the WR is at break-even and the rating stays flat. The only way up is an edge against the fixed ghosts (BRD-02).

## 5. Data-grounded strategy for the rewrite (ordered by measured value)
1. **Always field 3 units.** At R0, buy 3 before any reroll (9 of 10 gold); never reroll below the cost of the remaining fill. Worth +0.456 on the affected fights and +1,809 Elo over this period.
2. **Seat by kit role.**
   - Front: flamingo, grow, bulk, hold_the_line or peacock, or any unit whose ability does not need a friend ahead.
   - Middle: echo, guard, wake or cover.
   - Back: hype, last_word, echo.
   - Never put echo, guard, patch, wake, cover, dodo or dump in seat 0.
   - Worth +0.119 (sim) on 22% of fights. Template boards score 0.876.
3. **Always spend the last 3 gold on food.** Apple or potato goes on the front unit; honey goes on the back unit. SIM: apple on front 0.862 vs honey as placed 0.795.
4. **Store each ghost per (handle, round) with stats, and choose buys and seat order with the calibrated sim** against the known board. This covers 84% of fights. Ordering alone is worth +0.146; at R0, sim-ordering just the first 3 offers is worth +0.108.
5. **Unit priors, only as tie-breaks for the sim:**
   - Avoid drain, dump and backtap kits and the supported-bad list.
   - Prefer the top-lift units above.
6. **Delete the rest:** `classify`/PLANS/REPLIES_TO_US/HEDGE_VS, ARCH_SEAT_TABLE, all anti-mirror rules, GHOST_PUNISH, the recipe planner and recipe memory, and the `if (false)` blocks.
7. **Refresh `catalog.json` and `name_to_kit.json` every session** for Season 2, and model `state.seats`.

## 6. Artifacts (scratchpad/audit/boards/)
- **Scripts:** `build.py` builds the dataset. Analysis scripts are `common.py`, `eras.py`, `units.py`, `within.py`, `matchups.py`, `planner_split.py`, `short_control.py`, `econ.py`, `honey.py`, `verdicts.py`, `classify_eval.py` (set `CURRENT_CLASSIFY=1` for the current labels), `mirror.py`, `their_units.py`, `top_players.py`, `top_vs_us.py`, `foreknow.py`, `recipe_eval.py`, `gold.py`, `template.py`, `matchup_tables.py`, `opponents.py` and `prep_sim.py`. Node scripts are `extract_lists.js`, `crosslist.js`, `reclassify.js`, `simcheck*.js`, `sim_counterfactuals.js`, `sim_front.js`, `sim_food.js`, `r0_oracle.js` and `r0_solver.js`. `run_all.sh` runs everything.
- **Tables:**
  - Our side: `units_master.csv`, `our_units.csv`, `our_units_by_seat.csv`, `our_units_by_round.csv`, `our_units_honey.csv`, `our_kits.csv`, `our_kits_by_seat.csv`, `within_unit.csv`, `within_kitseat.csv`, `within_unitseat.csv`.
  - Their side: `their_units.csv`, `their_kits.csv`, `their_units_by_seat.csv`, `their_unit_effects.csv`, `their_kit_effects.csv`, `their_kitseat_effects.csv`.
  - Matchups and boards: `arch_by_round.csv`, `enemy_boards.csv`, `our_boards.csv`, `kit_patterns.csv`, `matchup_ourfp_vs_theirfp.csv`, `matchup_ourkits_vs_theirarch.csv`, `opponents.csv`.
  - Lists and references: `list_verdicts.csv`, `lists.json`, `crosslist.json`, `top_player_rounds.csv`, `site_catalog.json` (80 bots incl. S2).
