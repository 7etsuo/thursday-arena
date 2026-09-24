# Sudden-death fixes: final verification — September 24, 2026

This record separates compatibility checks from modern Season 4 protocol checks. The comparison baseline is commit `2b58f5c7c7719784071471b31ca3d2e212a4fff5` (`Fix S4 relic forecasts, combat rules, and learning calibration`); “current” means the reviewed working tree containing the sudden-death and persistence fixes.

No rated match was played. Every result below is offline except the explicitly identified anonymous official-practice run.

## Results

| Check | Format and sample | Result | What it establishes |
|---|---|---|---|
| Full regression suite | Clean staged installation, Node 25.9.0, offline | **299/299 passed**, 0 failed, 18.5 s | Unit, integration, historical corpus and new sudden-death gates pass together. |
| Paired Season 1 | Legacy three-round mock, 20 matched games | Baseline and current both 15W/3L/2D, score 0.800; 20/20 outcomes identical | No detected S1 behavior regression under the paired fixture. |
| Paired Season 2 | Legacy three-round mock, 20 matched games | Baseline and current both 15W/3L/2D, score 0.800; 20/20 outcomes identical | No detected S2 behavior regression under the paired fixture. |
| Paired Season 3 | Legacy three-round mock, 20 matched games | Baseline and current both 15W/4L/1D, score 0.775; 20/20 outcomes identical | No detected S3 behavior regression under the paired fixture. |
| Paired Season 4 | Legacy three-round mock, 20 matched games | Baseline and current both 18W/1L/1D, score 0.925; 20/20 outcomes identical | No detected S4 legacy-format behavior regression under the paired fixture. |
| Modern Season 4 smoke | Current tree, modern rules, 20 mock matches | 19W/1L/0D; 44 fights; 0 illegal actions; 44/44 battle and book events | Ordinary modern lifecycle completes cleanly. No match naturally needed a fourth fight. |
| Forced fourth-round driver | Current tree, modern rules, 3 controlled mock matches | 3/3 reached round index 3; 12 fights and 12 book records; 0 illegal actions or errors | The real driver and planner buy in the fourth shop, save all rounds exactly once, restart, and continue. |
| Official anonymous practice | Live official practice endpoint, 3 AI matches | Three 2–0 results; 27 protocol checks; 6 battle checks; 0 rate limits | Current action and battle schemas work against the official anonymous endpoint. This does not affect rating. |
| Afternoon replay fixture | 388 complete-input Season 4 fights | 388/388 winners and frames exact | The two corrected combat rules and the recorded fourth fight match the supplied server traces. |

## Historical paired comparison

The paired runs use seeds 271 and 277, ten games per seed, an empty learned book, unlimited planner budget, and the same current deterministic mock for both arms. The baseline arm loads strategy and loop modules from `2b58f5c7`; the current arm loads the reviewed worktree. Both arms deliberately use the historical three-round default.

| Season | Baseline | Current | Paired delta | Identical outcomes | Illegal / fillable-short |
|---:|---:|---:|---:|---:|---:|
| 1 | 15W/3L/2D, 0.800 | 15W/3L/2D, 0.800 | 0.000 | 20/20 | 0 / 0 |
| 2 | 15W/3L/2D, 0.800 | 15W/3L/2D, 0.800 | 0.000 | 20/20 | 0 / 0 |
| 3 | 15W/4L/1D, 0.775 | 15W/4L/1D, 0.775 | 0.000 | 20/20 | 0 / 0 |
| 4 | 18W/1L/1D, 0.925 | 18W/1L/1D, 0.925 | 0.000 | 20/20 | 0 / 0 |

Every completed pair had identical outcomes, zero illegal actions and zero fillable short shops. These runs test compatibility with the former format. They do not exercise the new fourth round and are not a rated strength comparison.

Evidence: [Seasons 1–2 log](paired-s1-s2.log), [Seasons 1–2 rows](paired-s1-s2.csv), [Season 3 log](paired-s3.log), [Season 3 rows](paired-s3.csv), [Season 4 log](paired-s4.log), [Season 4 rows](paired-s4.csv).

## Modern Season 4 checks

### Ordinary lifecycle

The current-only modern smoke used `suddenDeath: true`, a 1,500 ms planner budget, cold books and seeds 283 and 293. The two ten-match runs produced 9W/1L and 10W/0L. They ended with 44 complete battle events and 44 book records, no missing inputs, empty ghosts, ghost fallbacks or illegal actions.

None of these twenty matches naturally reached round index 3. The 19W/1L result is a deterministic mock outcome, not a before/after improvement or a live win-rate estimate.

Evidence: [summary log](modern-s4.log), [seed 283 detail](modern-s4-283.json), [seed 293 detail](modern-s4-293.json).

### Forced fourth-round lifecycle

A separate integration test controls the first three fights as draws, then gives the fourth shop ordinary sampled offers and the real planner. Across two matches, followed by a driver restart and one more match, it verified:

- all three matches reached the fourth shop and fight;
- the planner made a legal `buy`, `feed` or `equip` improvement instead of passing with all tokens;
- all 12 battle observations and 12 book observations were saved exactly once;
- fourth-round targets were nonempty;
- restart retained the first eight observations and added exactly four more;
- no illegal action or telemetry error occurred.

This controlled test proves the previously failing branch can execute and persist. Its forced opening draws make it a lifecycle test, not a strength measurement.

### Official anonymous practice

Three official anonymous AI practices each ended 2–0. The verifier completed 27 state/action checks and six battle checks with no rate limit. Anonymous AI practice changes no rating and did not reach the fourth round in this sample.

Evidence: [live-practice.log](live-practice.log), [report](live-practice-report.json), [anonymous request/response trace](live-practice-requests.jsonl.gz).

## Opponent-model research

The separate chronological study found that broader same-opponent targets improved forecast calibration but worsened later fixed-board seating. Production therefore retains latest-only targeting. See the [research report](opponent-uncertainty-report.md) and [numeric summary](opponent-uncertainty-summary.json).

## Commands

```sh
npm test
node tools/eval_versions.js --before-dir /tmp/arena-sudden-fixes-20260924 \
  --games 10 --seeds 271,277 --season both --budget Infinity \
  --csv docs/results/sudden-death-fixes-2026-09-24/paired-s1-s2.csv
node tools/eval_versions.js --before-dir /tmp/arena-sudden-fixes-20260924 \
  --games 10 --seeds 271,277 --season 3 --budget Infinity \
  --csv docs/results/sudden-death-fixes-2026-09-24/paired-s3.csv
node tools/eval_versions.js --before-dir /tmp/arena-sudden-fixes-20260924 \
  --games 10 --seeds 271,277 --season 4 --budget Infinity \
  --csv docs/results/sudden-death-fixes-2026-09-24/paired-s4.csv
node tools/verify_live_practice.js --seed 20260925 --games 3 --budget 1500
```

The modern smoke used the same `eval_versions.play` harness with Season 4, `suddenDeath: true`, ten games per seed, seeds 283 and 293, a 1,500 ms budget and a cold book. Its detailed JSON files preserve the full actions, rounds and counters.

## Clean installation and final review

The final runtime fingerprint is `525ee4ecf2e7`. A separate application directory was
assembled without live memory, logs or installed dependencies. On Node 25.9.0,
`npm ci` completed and reported zero vulnerabilities, `npm test` passed **299/299**,
and all **112** entries in the runtime/test/data checksum manifest verified.
The original workspace's `memory/book.json` and `memory/last_opponent.json` hashes
were unchanged after testing.

Final review added a regression for modern carry forecasts: purchase valuation and
actual final seating now agree in all four seasons at future blend settings 0, 0.5
and 1. The driver forwards those optional planning settings to its seating call.
This correction does not change the default Season 4 sampled-shop mode or the
historical-format benchmark paths above.

Evidence: [dependency installation](clean-install-npm-ci.log),
[final complete suite](clean-install-npm-test.log),
[file verification](clean-install-runtime-check.log),
[checksum manifest](runtime-sha256.txt). The earlier [298-test run](npm-test.log)
precedes the added carry/seating regression.

## Limits

- The paired benchmark uses legacy three-round rules by design. Identical outcomes establish compatibility only for those fixtures.
- The modern smoke is current-only, and none of its twenty matches naturally entered sudden death.
- The forced test reaches round 3 by controlling the first three fights. It validates execution and persistence rather than how often or how well the branch is reached in ordinary play.
- Official practice used three anonymous AI matches. It is protocol evidence, not rated-player evidence.
- Passing replay and test gates does not prove optimal strategy, a higher rated win rate, or that rating cannot decline.
