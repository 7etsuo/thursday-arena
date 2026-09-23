# Offline version benchmark (2026-09-20)

This benchmark answers whether the code after the archive and rule fixes wins more local mock
matches than the pre-change code. It uses no rated API actions.

## Historical test to reproduce

The previous match-level evaluation used **50 games for each of 20 seeds, per season**:

```text
101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197
```

Its raw outputs remain in the prior task directory:
`/tmp/user/1000/claude-1000/-home-tetsuo-grok-thursday-arena/06183e91-c69d-4347-9358-42776c52875a/tasks/`.
The published old-objective file is `b4yikoirm.output`; the shipped match-level objective file
is `b2o0y0242.output`. The old-objective run scored **0.901 S1 / 0.885 S2**; the shipped
objective run scored **0.916 S1 / 0.899 S2**. `--old` means the earlier planning objective in the
same codebase, not a frozen previous code revision.

The old mock consumed one sequential random stream for ghost choice, seat rules, offers, food,
rerolls and enemy-board choice. When policies made different actions, their future opponents and
shops could differ even with the same starting seeds. Those historical aggregates therefore do
not establish a paired gain. The current mock keys external draws by match, round and shop roll,
and its tests check pairing across different reroll choices.

## Current version comparison

`tools/eval_versions.js` runs the code from
`../thursday-arena-before-improvements-20260920.tgz` and the current code against the **same
current mock**. Each version gets its own cold opponent book. It checks that corresponding matches
start with the same opponent handle, offers, food and seat rules. The battle engine and shop draws
are the current arena rules for both arms, while each version uses its own driver, planner, shop
model, target, simulator and learning code. The planner budget is unlimited to make actions
reproducible regardless of machine load.

The backup's SHA-256 is
`7c6247e8aebb38065fc611156ee17515a93e4c46851df6743ab55ad6efade939`. The measured
run extracted that backup and ran one seed per parallel worker; the command below reproduces the
same sample in one process.

```bash
node tools/eval_versions.js --games 50 --seeds \
  101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197 \
  --season both --budget Infinity --csv /tmp/thursday-arena-versions-exact.csv
```

The older objective within the **current** version was rerun with the same historical seed
schedule using this command for each seed:

```bash
node tools/eval_matches.js --old --games 50 --seeds SEED --season both --budget Infinity
```

The current objective is the current arm of the version comparison above: both call the same
driver and planner defaults, use the same cold-book setup, and face the corrected mock. These
current-mock scores can be compared with each other; neither is directly comparable with the old
mock's published score. Per-seed old-objective results are in
[`results/old-objective-rerun-2026-09-20.csv`](results/old-objective-rerun-2026-09-20.csv).

## Results

The full paired run completed all **20 seeds × 50 matches × two seasons = 2,000 matches per
version**. The [2,000 paired outcomes](results/version-benchmark-2026-09-20.csv) are saved with
their seeds, match numbers and opponent handles (SHA-256
`15c47889e2d8f578b580c562947df973f3dcd0759dbfd6cc3d3f07865c0f303f`). Both versions
made zero illegal actions and zero fillable short-shop endings.

| Season | Before code | Current code | Win rate, both | Match score, both | Paired score change, current minus before |
|---|---:|---:|---:|---:|---:|
| 1 | 895 W / 61 L / 44 D | 895 W / 61 L / 44 D | 89.5% | 0.917 | 0.000; all 1,000 outcomes identical |
| 2 | 868 W / 78 L / 54 D | 868 W / 78 L / 54 D | 86.8% | 0.895 | 0.000; 95% seed-clustered interval −0.0064 to +0.0064 |

In season 2, seven paired matches improved, six worsened and 987 were unchanged. The score is
`(wins + 0.5 × draws) / matches`; win rate counts only wins. The interval uses the 20 independent
seed-level score differences, because a seed's 50 matches share a learning book. Season 1 has no
observed difference to estimate from: every paired result was identical. These results **do not
show a win-rate improvement from the code revision** on this test.

### Previous planning objective on the corrected mock

This is a different comparison: `--old` switches the *current code* to the former one-round,
one-step planning objective. The 40 per-seed totals are saved in
[`results/old-objective-rerun-2026-09-20.csv`](results/old-objective-rerun-2026-09-20.csv).

| Season | Previous objective | Current objective | Score change | 95% seed-clustered interval |
|---|---:|---:|---:|---:|
| 1 | 882 W / 72 L / 46 D; score 0.905 | 895 W / 61 L / 44 D; score 0.917 | +0.012 | −0.0008 to +0.0248 |
| 2 | 863 W / 85 L / 52 D; score 0.889 | 868 W / 78 L / 54 D; score 0.895 | +0.006 | −0.0097 to +0.0217 |

The current objective scored higher in both reruns, but both intervals include zero. The old
published scores in the first section came from an earlier mock and should not be used as a
before/after result for the code revision.

### Late match-ID sensitivity

The normal mock exposes a match ID at the start, so it cannot exercise the duplicate-learning bug
fixed in the current driver. A separate check hid the opponent handle through round 0 and withheld
the ID until after the round-1 shop, then ran
**five new seeds × 20 season-2 matches**:

```bash
node tools/eval_versions.js --games 20 --seeds 211,223,227,229,233 \
  --season 2 --late-id --csv /tmp/thursday-arena-late-id.csv
```

The [100 paired outcomes](results/version-late-id-s2-2026-09-20.csv) were 71 W / 17 L / 12 D
(score 0.770) before and 72 W / 16 L / 12 D (score 0.780) current. The paired difference was
+0.010, with a 95% seed-clustered interval of −0.0178 to +0.0378. There was one improved match
and no worsened match, which is too little evidence for a win-rate claim. The old driver emitted
338 battle events for 238 actual rounds, including 100 duplicates; the current driver emitted
exactly 238. It wrote 319
versus 225 opponent-book records. The current book intentionally skips the mock handle `ai`,
which accounted for 13 rounds, so it recorded each of the 225 genuine-ghost rounds once.

### Scope

These are deterministic **local mock** results, not rated arena results. The mock draws opponents
from a fixed recorded corpus rather than the current rated matchmaking distribution. The main
comparison starts with empty opponent books, so it does not measure the repaired historical book
deployed with the current code. The late-ID check isolates that driver behavior but has only 100
matches. The test suite passed all 158 tests, including checks that shops stay paired when
policies choose different rerolls.
