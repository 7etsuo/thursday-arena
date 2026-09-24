# September 24: Season 4 relic, simulator and learning fixes

## What the logs showed

Input: `thursday-arena-all-logs-20260924-000457.tgz`, 25,026,303 bytes,
SHA-256 `5438cd04fcd5d94e2fadef0c378fe3bf9bcd0ec5ea00df33ecdbc89e8dcafda5`.
The deployed runtime was `889c4750a726`, the previous reviewed S4 release.

The latest continuous session contains **432 rated attacks: 308 wins, 80 losses,
44 draws, +417 Elo**. Its four consecutive 108-game blocks won 84.3%, 67.6%, 63.0%
and 70.4%. The final block recovered somewhat; performance was still substantially
below the first block. **85 incoming defenses lost 399 Elo**, leaving only +18 net.
Changes in opponents and their lineups also matter. The data does not support a
claim that opponent learning alone caused the entire rating trajectory.

The original audit reproduced all 1,194 reconstructable shop target counts and
weights, and all 1,123 comparable logged forecasts, using prior observations only.
There were no driver errors or rejected actions in the latest session. All 5,032
checked deterministic shop transitions matched. The problem included incorrect
prediction inputs and combat mechanics, despite records being collected correctly.

## Fixes

### Opponent relics belong to a round

In the final shop, 201 of 202 observed states exposed the opponent's previous
one-relic loadout. The code treated a non-null list as exact and overrode the
current-round two-relic loadouts already stored in the target. In the second shop,
the field was null, which already allowed the learned relics to be used.

`shop_model.normalize` now retains the observation and tags its round. Every
planner path uses `planningRivalRelics`: purchases, captain/relic choices, seating,
finishing moves, future shops and Freezer. An observation from another round does
not override a candidate enemy's own relics. Actual battle replay continues to use
the exact revealed relics. The mock now reproduces the live visibility timing,
including null before the first relic is revealed.

### Correct the combat model

The complete Sep 23–24 sample originally had **24 trace mismatches and seven wrong
winners**. The fixes cover:

- Shield absorbs a hit before Evade is consumed.
- Lifesteal heals at least one HP, including at low attack.
- A zero-attack hit does not add attack venom. An attacker that dies can still
  poison its surviving target after a positive attack.
- Mutiny retains Alchemist's bonus and clamps removed HP to keep at least one HP.
- Consuming an ally ends its aura without firing faint effects.
- Multi-target snipes retain their multiple targets in the presence of Taunt.
- The front-to-back bounce acts on the front unit.
- Jammer and silence equipment resolve by team in the observed server order.
- Repeated pickpocket triggers can copy innate Armor again; already stolen granted
  keywords are consumed.
- Heckler and capped Mutiny captions match the recorded server frames.

The [official rules](https://thursdayarena.com/rules.md), retrieved September 24,
also clarify Shield/Evade ordering, aura removal and which bonuses Mutiny removes.
Rules SHA-256: `8fec2cd04bd37af9f20fe46443d55492890556d7987ee3e888bd7a5a4fd9640b`.
These observations do not establish when each server behavior changed.

### Keep learning, discard obsolete prediction errors from calibration

S4 forecasts now carry version `s4-20260924`. Older forecasts remain in memory,
along with boards, relics, outcomes and observation receipts, but do not calibrate
the corrected model. New forecasts learn from losses and wins as before.

For book probabilities \(b_i\), population probabilities \(p_i\), and observed
outcome vectors \(y_i\), confidence still minimizes

\[
\sum_i \|\alpha b_i+(1-\alpha)p_i-y_i\|_2^2
+\lambda(\alpha-\alpha_0)^2,\qquad 0\leq\alpha\leq1.
\]

The sample is bounded: at most 400 outgoing observations per round are retained;
population uses the last 100 eligible outgoing rounds within an hour; calibration
uses at most 128, with at most 32 same-handle observations for later rounds and
prior strength 8. This cannot accumulate an unbounded lifetime confidence penalty.
It can still make imperfect predictions when opponents change.

Book imports now merge the recent outgoing sample as well as retained boards and
receipts. Importing twice does not duplicate observations. Recent saved defensive
metadata from the old combat model is recomputed once, without recording those
boards twice. Metadata refreshes have their own telemetry event and include series
context for future audits.

## Verification

- **281 offline tests pass**, including all historical gates.
- **1,190/1,190 complete live fight winners match; 1,188/1,190 full traces match.**
  All **1,066 fights in the latest continuous session match every frame**.
- The two remaining complete-input discrepancies occurred in the earlier Sep 23
  session: `9bc6dd8f-a307-4292-bf6b-6cf89f064fce` R1 and
  `335fea71-2caa-4aa8-aa35-63a30b0bf2b5` R1. Equal-attack units are knocked out in
  reversed order. The traces reconverge immediately and both winners match. Tests
  pin these exact differences; they are not counted as exact replays.
- The earlier **395 controlled S4 battles**, 101 shop transitions and 17 real-driver
  practice battles still pass. Older S1/S2 and S3 corpus gates also pass.
- **25 recent public defensive matches / 60 rounds** now have a unique active-seat
  reconstruction; two previously failed reconstruction. This is reconstruction
  from the replay itself, not an independent prediction test.
- Three new complete games on the official anonymous practice server finished
  **2 wins / 1 loss**, with **seven exact battles**, 29 shop checks and no rate
  limits. They include a final-round draft. Practice uses isolated files and
  does not change rating. [Practice log](results/live-fixes-2026-09-24/practice.json).
- Tests exercise obsolete-forecast loading, learning from new losses, confidence
  recovery, chronological cutoffs, persistence, imports and metadata refreshes
  without duplicate learning.

The two incomplete-input public traces documented in the original
[S4 report](SEASON4.md) remain separate known limitations.

## Recorded-board comparison

The comparison rebuilds both models chronologically. The corrected model records
corrected forecasts on the actual final boards and observed outcomes. Candidate
seating uses information available before each fight; exact later enemy boards
are used only for scoring. Neither arm replays shop purchasing decisions or adds
the defensive objective in this diagnostic.

| Round | Comparable forecasts | Old Brier error | Corrected Brier error | Seating improves / worsens / ties |
|---|---:|---:|---:|---:|
| First | 425 | 0.45262 | 0.45221 | 0 / 0 / 432 |
| Second | 410 | 0.24032 | 0.23264 | 1 / 0 / 431 |
| Final | 192 | 0.44247 | 0.25833 | 13 / 3 / 186 |

Lower Brier error is better. Final-round forecast error falls **41.6%**. Final-round
seating gains 9.5 round points across 202 fights (win = 1, draw = 0.5). Holding the
corrected engine and original weights fixed, the relic correction alone gains 8.5
points. These are fixed-board counterfactuals, not additional wins actually played.
[Detailed observations](results/live-fixes-2026-09-24/record-counterfactuals.json).

Reproduce after extracting the supplied archive into a separate directory:

```sh
node tools/eval_s4_records.js /path/to/extracted/data/log /path/to/previous-checkout \
  fcafefbb-ed90-4760-96df-981b23adf683
```

The previous checkout is commit `cd32aa8ea484faad42e0755a5b1abc40fe8c8917`.

## Whole-game comparisons

| S4, 100 paired games | Wins | Losses | Draws | Mean match points |
|---|---:|---:|---:|---:|
| Previous release | 64 | 27 | 9 | 0.685 |
| Corrected release | 73 | 19 | 8 | 0.770 |

The paired difference is **+0.085 match points per game**, with a seed-clustered
95% interval of **−0.0616 to +0.2316**. Nineteen pairs improve, eight worsen and
73 tie. Four seeds improve and one worsens. Both arms have zero illegal actions,
zero missing battle inputs and zero shops ended with an available affordable bot
and an empty slot. The exported worker JSON represents an infinite cheapest-offer
cost as null; the summary explicitly excludes that no-offer case from this check.

First-half match points are 0.61 / 0.69 (old / corrected); second-half points are
0.76 / 0.85. Opponent difficulty changes over that sequence, so these splits do
not isolate the effect of learning. The observed improvement is encouraging;
the interval includes no improvement and this is not a rated win-rate estimate.
[Per-game pairs](results/live-fixes-2026-09-24/paired-s4.csv),
[summary and diagnostics](results/live-fixes-2026-09-24/paired-s4-summary.json).

The S4 comparison uses five seeds, the same chronological opponent sequence and
keyed external shop draws, with separate learning for each arm. Each starts with
936 outgoing observations reconstructed before the evaluation boundary. Incoming
defensive observations retain their original timestamps. Defensive targets use
each version's reconstructed metadata.

The sequence is derived from the last 100 recorded matches: three opponents lack
any earlier third-round board and are excluded, leaving 97 eligible scenarios.
Each seed plays the first 20 eligible scenarios. Six of those 20 need a prior
third-round board/relic loadout because the recorded game ended earlier; the mock
holds the observed current captain constant. This imputation and the mock offer
distribution limit what these results say about rated play. The search budget is
Infinity for reproducibility. The initially launched 97-game-per-seed comparison
was stopped before producing any paired result because of its runtime; this is a
bounded 100-pair check, not that longer run.

The exact initial book, scenarios, worker results and evaluation scripts are
retained alongside the report. A correction to the benchmark also gives runs
without dated scenarios a fixed clock keyed by match and round. The previous
wall clock could include or exclude a just-recorded opponent depending on whether
two actions landed in the same millisecond. The exploratory S3 run using that
clock is retained as `development-s3-wall-clock.*`; final compatibility results
use the deterministic clock. The dated S4 comparison already used its recorded
scenario clock and is unchanged by this benchmark correction.

The final earlier-season compatibility comparison has **60 pairs per season**,
with identical match results in every pair: S1 51 W / 7 L / 2 D, S2 47 W / 10 L /
3 D, and S3 49 W / 10 L / 1 D for both releases. All have zero illegal actions
and zero fillable short endings. [S1/S2 pairs](results/live-fixes-2026-09-24/paired-legacy.csv),
[S3 pairs](results/live-fixes-2026-09-24/paired-s3.csv).

## Installation

Follow [the installation instructions](INSTALL_SEASON4.txt). Preserve the entire
remote `memory/` and `data/log/`; do not bootstrap or reset the book. The package
contains application files, tests and evidence. The code update and private Git
release do not install anything on the separate bot computer.

These changes fix identifiable errors. They do not guarantee a flat or rising
win rate or rating against a changing population, including incoming ghost attacks.
