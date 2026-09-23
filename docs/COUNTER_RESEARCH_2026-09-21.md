# Counter model, learning audit, and policy experiments — September 21, 2026

This review uses `thursday-arena-all-logs-20260921-142758.tgz` from Downloads, SHA-256
`5ada40a3e28da9ac25f3e07aa6b34acb23fe0006c04258716b8bc4ff8831f64f`.
The existing installed release is the defense-fixed package with SHA-256
`159548dc9c4f84f018cee3574ba814ec63ec17b0618b5f4a7799b381904fa054`.
The live learning files were not replaced. All experiments use separate books and logs.

## The observed decline

The new installed code (`3e1fe8b142f3`) completed 562 matches from 17:49 to 20:27 UTC. There are
452 wins, 71 losses, and 39 draws. The table partitions those matches chronologically into equal
halves; incoming defenses are counted over the corresponding time windows.

| Measurement | First 281 | Last 281 | Whole run |
|---|---:|---:|---:|
| Wins / losses / draws | 231 / 30 / 20 | 221 / 41 / 19 | 452 / 71 / 39 |
| Match win rate | 82.21% | 78.65% | 80.43% |
| Match score, draw = half | 85.77% | 82.03% | 83.90% |
| Attack Elo | +535 | +446 | +981 |
| Incoming defenses | 34 | 50 | 84 |
| Defense Elo | −196 | −496 | −692 |
| Combined Elo | +339 | −50 | +289 |

The decline is real in this window, but varies by opponent:

| Opponent | First-half matches / win rate | Last-half matches / win rate |
|---|---:|---:|
| `ternquest_com` | 136 / 74.26% | 124 / 79.84% |
| `fabianhtml` | 53 / 98.11% | 119 / 73.11% |

Both changing performance against `fabianhtml` and the larger number of matches against that
opponent matter. The more severe defense losses also matter for rating. Aggregate win rate and
rating cannot identify a single causal explanation such as deteriorating learning. Opponents,
their saved teams, our shops, and ratings change throughout the run.

### Is learning from losses working?

The chronological audit reconstructs every target from the earlier book and observations available
before the decision. It found:

- 1,358 attacking-round observations, all sourced from completed public replays.
- No missing or duplicated observations; every one of the 164 rounds from the 71 lost matches
  was recorded. These include won or drawn rounds inside lost matches.
- All 1,359 shop target source counts and weights match the reconstruction.
- 596 logged defensive-round observations, including historical backfill. These are distinct
  from the 84 defenses played during this run; do not count the backfill as new incoming games.
- 7,698 legality/economy checks and 6,447 deterministic shop-state checks pass.
- No malformed telemetry lines or driver error events in the reviewed new run.

The archive contains logs, not the remote machine's final `book.json`. This establishes the
logged learning and decision inputs; it cannot independently establish the final remote disk
contents. The reconstructed ending book is used only for analysis.

Using the latest recorded opponent team to predict outcomes for the teams actually purchased,
later-round accuracy is 328/379 (86.54%) in the first half and 345/400 (86.25%) in the second.
Rows without a specific-opponent target are excluded. Against `fabianhtml`, it falls from
61/66 (92.42%) to 151/178 (84.83%). The actual enemy board appears somewhere in the modeled
target in 56/66 and 129/178 of those cases. These checks hold our historical purchases fixed;
they do not compare entire learning policies or prove that adaptation is harmless.

## Rules and battle corrections

The [official rules](https://thursdayarena.com/rules.md),
[bot catalog](https://thursdayarena.com/api/catalog), and
[item catalog](https://thursdayarena.com/api/items) were checked again. The rules match the
previously reviewed version; the catalogs still contain 179 bots and 19 items and match the
local data. Source hashes are recorded in [provenance.json](results/counter-model-2026-09-21/provenance.json).

Six new complete-input fights exposed trace discrepancies. All six previously had the correct
winner; they were not six newly explained losses. Corrections in `lib/sim.js` cover:

1. Silence emits no mute event for a unit with no kit, such as a basic summoned Drone.
2. Last-standing effects resolve before pending knockout-credit healing.
3. Glitter Bomb does not emit an empty-target blast or apply its holder's venom.
4. An immediate copied start effect includes the source holder's Hotfix modification;
   subsequent copied triggers use the copier's item.
5. Native splash and Paper Shredder damage add together, including first-strike retaliation.

The new sample improves from **1,352/1,358 exact traces to 1,358/1,358**. Winners remain
1,358/1,358. Combined with the two earlier S3 complete-input samples, regression coverage is
**4,446/4,446 winners and full frame sequences**. This is observed coverage, not proof that every
possible interaction among all cards has been validated.

## Mathematical counter model

[`lib/counter_model.js`](../lib/counter_model.js) computes contextual payoffs and a mathematically
defined bound on candidate-versus-baseline loss over a finite distribution uncertainty set.
The [model specification](COUNTER_MODEL.md) explains the proof, assumptions, implementation,
research sources, and why standalone card tiers cannot establish optimal play.

The [interactive atlas](results/counter-model-2026-09-21/atlas/index.html) evaluates all 179 cards
across **320,410 ordered simulated fights in ten explicit contexts**. It is a diagnostic artifact;
the live planner does not replace its full-team simulations with atlas averages.

## Policy experiments

All local whole-match comparisons use identical keyed external mock draws, separate learning
books, and an infinite planning budget for reproducibility. Match score is 1/0.5/0. They are
comparisons in a mock environment, **not rated win-rate estimates**. Mock future item costs and
offer odds remain approximations. Seed-clustered intervals use the available independent seeds;
small seed counts and observed zero variance should not be read as certainty.

### Deeper known-offer purchase search

The experimental search keeps legal deterministic action sequences through temporarily weaker
intermediate teams, up to 160 states, width 10, and depth 4. It excludes unresolved random shop
effects. A complete candidate is checked against the original target before commitment.

At recorded round-2 starting shops, with rerolls disabled equally in both arms because their
counterfactual contents were never observed:

| Data | Shops | Baseline round points | Deeper-search points | Better / worse rounds |
|---|---:|---:|---:|---:|
| Earlier training archive | 453 | 353.5 | 355.0 | 10 / 8 |
| New archive | 234 | 168.0 | 172.5 | 8 / 2 |

These hold earlier purchases, opponents, captains, and shops fixed. They do not measure a
whole-match improvement. The model's final target score improved in 71/453 and 34/234 shops;
it worsened in two validation shops because taking a different intermediate purchase can lead
to a different subsequent search path. A local action improvement is not a whole-policy proof.

A broader early variant enabled deeper search in rounds 1 and 2 and inside captain rollouts.
Across 200 paired complete mock matches it scored **157 W / 33 L / 10 D**, versus
**158 W / 33 L / 9 D** before changes. Score difference −0.0025, 95% seed-clustered interval
−0.0298 to +0.0248; 4 better, 6 worse, 190 equal. A smaller round-2-only comparison also failed
to establish a whole-match gain. **Deeper search stays opt-in (`plannerOpts.deepShop: true`).**

### Defense exploitation with an explicit loss bound

The research policy uses one fixed baseline per shop, total-variation radius 0.025, maximum
attack-score loss 0.05, and a nonnegative robust defensive difference. Incoming-defense exposure
is estimated from previously observed public results. The fixed anchor prevents repeated shop
actions from accumulating a fresh 0.05 loss allowance each time.

In the earlier archive, attack round points moved 2,145.5 → 2,146.0; 321 verified subsequent
defensive rounds stayed at 112 points. In the new archive, attack round points moved
1,000 → 999.5; 130 verified subsequent defensive rounds stayed at 59 points. No model certificate
was violated, which illustrates the difference between a conditional mathematical bound and
improving play against the real future distribution.

Only defense contexts whose board, source captain, and public frames agree are used. Other
public defenses can match an earlier board without agreeing on that shop's captain, so board
identity alone is insufficient to establish provenance. The 130 verified rounds do not represent
all incoming defensive rounds. **The live driver does not call this rejected research policy.**

### More captain samples

Increasing captain continuation samples from two to six tied at **28 W / 10 L / 2 D** in a
40-pair training comparison: one better and one worse match. It adds computation without a
demonstrated aggregate gain. The default remains two samples; the comparison option is now
forwarded correctly by the driver.

### Shared random draws for reroll comparisons

Alternative shop plans previously received different streams of hypothetical rerolls. The
experiment gives each decision one seed and restarts that stream for each alternative. Unfrozen
alternatives then see the same sampled offers, food, and items. Frozen slots can alter RNG
consumption, so synchronization can be partial. The server's actual draws are unaffected.

With the corrected simulator in both arms, 40 training pairs improved from **28 W / 10 L / 2 D**
to **29 W / 9 L / 2 D**, one better and none worse. Its separate validation and release decision
are recorded below. A small training improvement alone is insufficient evidence.

## Final verification and release decision

The separate 200-pair shared-draw validation scored **157 W / 35 L / 8 D**, versus the installed
version's **160 W / 34 L / 6 D**. Match-score difference −0.0100, 95% seed-clustered interval
−0.0515 to +0.0315; 9 better, 12 worse, 179 equal. This fails to establish an improvement.
**Shared reroll draws remain opt-in (`plannerOpts.pairedRerolls: true`).**

The release enables the validated battle corrections and adds the mathematical analysis tools,
counter atlas, tests, and reproducible experiments. It keeps the existing default purchase and
learning policy. No experimental policy is enabled merely because its training results looked
better. In particular, the robust defense experiment is outside the live driver, deeper purchase
search and shared reroll sampling are opt-in, and captain sampling stays at two.

The final default configuration was compared with the installed release over 100 paired matches
per supported season, using seeds 211, 223, 227, 229, and 233, 20 games per seed:

| Season | Before W / L / D | Final W / L / D | Changed match results |
|---|---:|---:|---:|
| 1 | 87 / 9 / 4 | 87 / 9 / 4 | 0 / 100 |
| 2 | 72 / 16 / 12 | 72 / 16 / 12 | 0 / 100 |
| 3 | 77 / 19 / 4 | 77 / 19 / 4 | 0 / 100 |

There were no illegal actions or fillable short boards in either arm. These comparisons verify
no observed match-result regression in the sample. **They demonstrate no match-win-rate gain.**
The concrete gain established here is a more accurate battle model and a tested framework for
analyzing counters and proposed improvements. A dramatic playing-strength improvement has not
been established; neither mathematical terminology nor more simulated searches substitutes for
that evidence.

- `npm test`: **255 passed, 0 failed**, including all 10,748 historical S1/S2 winner checks,
  the three complete-input S3 samples, the robust optimizer, and legal combination-search checks.
- Official anonymous practice, seed 20260923, default 1,500 ms budget: **two 2–0 match wins**,
  18 shop checks, four exact battle-frame checks, no driver errors or rate limits. Practice AI
  results establish operation under live rules, not rated strength.
- The atlas was opened in a separate headless Chrome session: all 179 rows render, all ten
  contexts are selectable, card/crew filtering works, and no page errors occur.
- `memory/book.json` is byte-identical to its pre-review copy. No rated action was sent and no
  remote installation was changed.

The comparison tool also now extracts an archived Season 3 runtime's own item catalog. Omitting
`data/items.json` broke `--before-tgz` for S3 backups. The reported comparisons used complete
`--before-dir` snapshots and were unaffected. A regression test covers both newer item-bearing
archives and historical archives that predate items.

## Reproducing the evidence

Results and inputs are in [`results/counter-model-2026-09-21/`](results/counter-model-2026-09-21/).
`evidence.tgz` contains the new run's chronological events, its reconstructed starting book,
completed public replays, audit script, and verified defensive contexts. Extract it into a new
scratch directory; set `ARENA_AUDIT_RUNTIME` to an absolute path to this checkout and run its
`audit.js`. It writes derived shop rows, battle rows, and a reconstructed book beside the extracted
inputs. It never writes the live memory files.

After that audit:

```sh
node tools/eval_observed_shops.js /path/to/extracted-evidence /tmp/new-shop-results.json
node tools/eval_counter_finish.js /path/to/extracted-evidence /tmp/new-defense-results.json
node tools/eval_versions.js --before-dir /path/to/before \
  --season 3 --games 20 --seeds 211,223,227,229,233 --budget Infinity --csv /tmp/pairs.csv
```

`eval_versions.js --planner-options FILE` accepts a JSON object for the current arm only, so
isolated comparisons can use `{"pairedRerolls":true}`, `{"deepShop":true}`, or
`{"captainSamples":6}` without changing production defaults. The baseline runtime and catalog
must be retained separately. All reported experimental variants, including negative results,
are preserved; there is no claim of perfect play or of a dramatic rated improvement.
