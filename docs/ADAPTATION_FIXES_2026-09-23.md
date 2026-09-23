# September 23: opponent adaptation, planning and battle fixes

## Compatibility

The supplied logs are Season 3. The live API moved to Season 4 on September 23, and this
release includes [Season 4 support](SEASON4.md) as well as the fixes below. Seasons after 4
are refused before further driver game actions. No rated games were played, and the live local
memory was not replaced. The measurements below concern S3 unless labeled otherwise.

## What the supplied logs established

The new segment contains 2,943 matches and 7,250 rounds under code `4b9517215174`. Match win rate
fell from approximately 80% in the first three quarters to 69.6% in the last. The opponents became
stronger, while the lifetime-weighted population prior remained dominated by older lineups.
All attacking learning observations were present once, including rounds from losses. Learning
was running; its population sample and confidence assumptions were wrong for the changing queue.
Defensive rating losses also erased most of the attacking gains.

This is not evidence that every loss was caused by learning, or that disabling learning fixes the
problem. Frozen-book forecasts were substantially worse on this same session. Opponents and the
matchmaker can still make later games harder after these defects are corrected.

## Implemented changes

### Recent outgoing observations

`lib/opponent_model.js` maintains a separate, bounded sample of outgoing games. It keeps 400
observations per round and uses the latest 100 within one hour for the population forecast.
A handle's five retained distinct boards no longer determine how often that handle appears in
our queue. Incoming defenses update what we know about an opponent but never count as outgoing
matchmaking frequency. The current handle is excluded from the population component that is
mixed with its own forecast. A sample containing only that handle does not revive stale others.

Existing format-1 books remain readable. With no recent outgoing sample, the model warms up
from the latest 40 same-season sightings with equal weights. This fallback has limited information;
it does not reconstruct a historical queue from aggregate counts. The sample fills as new games
finish. No memory reset or destructive migration is required. Merging another bot's book retains
this installation's outgoing sample; another account's queue is not imported as this one's queue.

### Confidence follows observed forecast errors

Before `endShop`, the final ordered team gets two simulator forecasts: handle-specific and
population. These forecasts use only information available then, including the visible captain.
After the result, the actual outcome is recorded alongside the forecasts and exact replay board.
Own-match receipts prevent duplicate learning. Forecast components remain measurable even when
one currently has zero decision weight, so confidence can later recover.

For component probability vectors `b` and `p`, one-hot outcome `y`, and `d = b - p`, the model fits

```
alpha = clamp((lambda * prior + sum(d dot (y - p))) /
              (lambda + sum(d dot d)), 0, 1)
forecast = alpha * b + (1 - alpha) * p
```

This minimizes past multiclass Brier loss plus `lambda * (alpha - prior)^2`; `lambda = 8`.
Round 0 uses up to 128 recent samples with prior 0.5. Later rounds fit other opponents first with
prior 0.75, then shrink the named opponent's last 32 observations toward that global fit. All
samples are limited to the preceding hour. This is a finite-sample probability model, not a
proof of future wins or a guarantee that exploitation always helps.

### Future purchases in opening valuation

The S3 opening objective now models future shop income and purchases before scoring later boards.
A pure `sampleNextShop` transition handles captain income, Banker carry, frozen offers, temporary
stats and consumed items. The bounded continuation samples one common shop per future round,
compares up to three greedy deterministic purchases, and evaluates them by simulation. Target
width is four, and future outcome probabilities retain the existing 50% blend with an even
win/loss prior. Seasons 1/2 retain the historical unchanged-board model.

Unknown future offers, later item prices/odds and unrevealed seat rules remain approximations.
This rollout is not exhaustive search; it can miss rerolls, purchase combinations and worthwhile
intermediate sacrifices. `futureMode: 'carry'` is the explicit old-model control.

### Defensive exposure enters decisions

With validated recent defensive contexts, purchases and seating in all three rounds use

```
expected attacking match points + exposure * expected defensive match points
```

For fixed ratings and matching, Elo is affine in match points, so differences in this objective
correspond to expected rating differences under the supplied exposure model. Defense simulations
put the posted team on the ghost side, using the attacker's seats/captain and the defender's series
score. Unscaled match points are necessary: when leading 1–0 in the final round, winning/drawing
is worth 1 match point and losing is worth 0.5, not zero.

Exposure is the past hour's sum of observed defensive/attacking Elo-change ratios, divided by
outgoing matches plus ten zero-defense pseudo-matches. It is an estimate of relative frequency
and K factor, not a fitted guarantee. Rounding and selection of defenders affect it. The latest
24 usable contexts per round form the defensive target. Ambiguous seats and missing series
context are excluded. Old histories receive bounded context upgrades without duplicate book writes.

This model assumes future attackers resemble recent ones. It uses neutral probabilities for
unmodelled remaining rounds, approximates exposure per posted round with exposure per match,
and does not predict a strategic opponent's response. Captain drafting still scores attacking
continuations. `defenseObjective: false` selects the earlier defense tie-breaking policy.

### Battle and lifecycle corrections

All 22 new frame discrepancies are fixed: attack venom announcements, nested faint/last-standing
ordering, copied start effects, Hotfix summons, solo item announcements, peacock hurt growth and
S3 overtime from exchange 26. All 7,250 new fights now reproduce exact frames and winners.
The four supplied S3 fixture sets total 11,696 complete-input fights. Previous S1/S2 coverage is
preserved. These are observed-case checks, not a proof of all unobserved interactions.

## Measurements

### Forecasts on the actual purchased teams

Each forecast is evaluated chronologically; the future outcome is used only after prediction.
These numbers measure prediction error on the recorded policy's decisions, not a new policy's
win rate. In the last quarter:

| Round | Recorded match-point score for the round | Old forecast | New forecast | Old Brier error | New Brier error |
|---|---:|---:|---:|---:|---:|
| 0 | 0.4008 | 0.6067 | 0.4610 | 0.5668 | 0.4663 |
| 1 | 0.7228 | 0.8528 | 0.7466 | 0.3906 | 0.3546 |
| 2 | 0.8461 | 0.8899 | 0.8454 | 0.2182 | 0.2154 |

Round-0 Brier error falls 17.7%. Results are not uniformly better in every cell: for example,
third-quarter round-2 Brier error is 0.1695 versus 0.1646 before. See the complete
[old](results/adaptation-fixes-2026-09-23/forecast-before-summary.json) and
[new](results/adaptation-fixes-2026-09-23/forecast-final.json) summaries.

### Recorded defensive counterfactuals

The evaluator links only the last posted board and a later defense that reproduces the entire
trace with independently logged board/captain data and uniquely reconstructed seats. Training
uses only defenses available before the original decision. It starts from recorded final shops,
so it cannot measure changed earlier purchasing, ghost selection or the attacker's response.

| Check | Sample | Before points | After points | Better / worse |
|---|---:|---:|---:|---:|
| Attacking rounds from linked shops | 328 | 205 | 206.5 | 4 / 1 |
| Later defensive rounds | 340 | 102 | 105.5 | 5 / 1 |
| Recorded defensive matches with replaced linked rounds | 217 | 63.5 | 65 | 5 / 1 |

Twenty-one shops changed. Replacing recorded rounds cannot recover an unplayed deciding round;
the match row is a conditional replay statistic, not an estimate of live match win rate.
[Full comparisons](results/adaptation-fixes-2026-09-23/defense-objective.json).

### Whole-match comparisons and operational checks

Score is wins plus half of draws, divided by matches. Paired seeds share external draws.
The intervals below are 95% intervals clustered by seed; small seed counts make them wide.

| Comparison | Pairs | Before W/L/D | After W/L/D | Score difference | Interval |
|---|---:|---:|---:|---:|---:|
| Cold-book S3 training sample | 50 | 34/13/3 | 36/11/3 | +0.0400 | −0.028 to +0.108 |
| Chronological late-session opponents | 100 | 80/17/3 | 78/16/6 | −0.0050 | −0.1669 to +0.1569 |
| Same fixed S3 implementation: frozen vs adaptive learning | 60 | 41/13/6 | 47/11/2 | +0.0667 | −0.0282 to +0.1615 |

The late-session comparison is essentially tied. The learning control favors adaptation in this
sample, but its interval includes zero. Neither establishes improved live win rate. Prediction
error improvements must not be described as proven match-win improvements.

The late-session cases use a causal initial book and preceding defensive contexts. Twenty
chronological opponent trajectories are repeated under five shop seeds. Some unplayed future
boards are imputed only from earlier observations of the same handle. These are replay-informed
mock matches, not observed counterfactual rated games. Seed sensitivity was substantial: the
first four seeds favored the old version, while the last favored the new one by 22.5 score points.

S1 and S2 each ran 100 paired matches and tied on every pair (S1: 81/9/10 each; S2: 76/14/10 each).
All comparisons had zero illegal actions and zero fillable short-board endings. A separate
1500 ms budget check completed eight S3 games (7 wins, 1 loss): median planning step 390 ms,
95th percentile 1830 ms, maximum 1922 ms; captain drafting peaked at 2148 ms. The budget is soft.

These S3 measurements predate the S4 mock correction to deal distinct seat rules. They used the
same mock in both arms, but the distribution is not identical to the server. After S4 integration,
an additional 20 pairs per legacy season tied on every match against the S3-fixed snapshot:
S1 15/1/4, S2 16/4/0, S3 12/5/3 in each arm. That is a compatibility check, not a new gain estimate.

[Late-session CSV](results/adaptation-fixes-2026-09-23/late-final.csv),
[complete comparison log](results/adaptation-fixes-2026-09-23/late-final.log),
[frozen/adaptive CSV](results/adaptation-fixes-2026-09-23/learning-control.csv),
[learning-control log](results/adaptation-fixes-2026-09-23/learning-control.log),
[finite-budget report](results/adaptation-fixes-2026-09-23/budget-check.json).

## Reproduction and evidence

The input archive hash, segment and fixture provenance are in
[provenance.json](results/adaptation-fixes-2026-09-23/provenance.json).
`tools/eval_opponent_forecasts.js ANALYSIS_DIR NEW_OUTPUT.json` consumes the archive audit's
`events.json`, `shop-rows.json` and `initial-book.json`.
`tools/eval_defense_objective.js ANALYSIS_DIR DEFENSE_DETAILS_DIR NEW_OUTPUT.json` additionally
uses cached completed public defensive match details. Both run locally and refuse to overwrite
the requested output. Neither reads or changes the live opponent book.

`tools/eval_versions.js` now supports `--initial-book`, chronological `--scenarios`, and
`--freeze-before`. Scenario clocks govern model observation time; search deadlines still use real
time. Fixed ghost sequences use recorded boards, seats and captains, while the mock generates shops.
Missing deciding-round ghosts may use an earlier observed board of the same handle; this is marked
in scenario metadata and is never filled from a later match. Seeds pair external draws across arms.
Finite planner budgets remain dependent on CPU timing; unlimited budgets are used for policy
comparisons. A frozen-book comparison uses the same current implementation in both arms.


The [comparison input archive](results/adaptation-fixes-2026-09-23/comparison-inputs.tgz)
retains the before/after S3 runtime snapshots, the then-current mock, and causal late-session
inputs. After extracting it to a separate research directory, make the release's `data/corpus`
available at `s3-fixed/data/corpus` and its installed dependencies available through `NODE_PATH`.
Then run, from that research directory:

```bash
node s3-fixed/tools/eval_versions.js --before-dir before --season 3 --games 20 \
  --seeds 137,139,149,151,157 --budget Infinity \
  --initial-book late-final-initial.json --scenarios late-final-scenarios.json
node s3-fixed/tools/eval_versions.js --before-dir s3-fixed --season 3 --games 20 \
  --seeds 163,167,173 --budget Infinity --freeze-before \
  --initial-book late-final-initial.json --scenarios late-final-scenarios.json
```

Those snapshots are research controls. Install the current application, not a snapshot.
