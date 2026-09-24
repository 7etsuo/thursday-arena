# Season 4 opponent uncertainty research — September 24, 2026

## Decision

Keep the production **latest-only same-handle target**. Small uncertainty tails improve forecast Brier score and calibration in both chronological cohorts, but none improves fixed-board seating in both cohorts. The later cohort makes the main risk concrete: the strongest forecast candidates choose worse seats more often than better seats.

No arena request, rated game, live-memory write, or production strategy change was made.

## Question and method

The current Season 4 target gives the handle-specific share to the most recently observed board. This study tested whether a small share for older same-handle snapshots would reduce false certainty without sacrificing decisions. It also screened captain-conditioned and prior-round-trajectory-conditioned alternatives.

September 23 is causal warm-up. September 24 is split chronologically by deployed code cohort:

- **older432:** 432 completed source matches; 1,027 forecast rows from 425 matches.
- **newer177:** 177 completed source matches; 349 forecast rows from 173 matches.

For every row, the tool reconstructs the book using only observations whose `observedAt` precedes the shop. It holds the logged book blend weight fixed, evaluates latest-only and widened support through the same corrected simulator, and then compares their best seat orders against the opponent board revealed afterward. Point delta uses win = 1, draw = 0.5, loss = 0.

The logged `s4-20260924` prediction remains a separate calibration baseline. The saved audit reproduced all **393/393** shop target counts and weights and **349/349** component forecasts. This research excludes the now-changed fourth-round fallback and independently reproduces **392/392** round 0–2 targets, **349/349** component forecasts, and **349/349** latest-only negative controls.

Intervals below are 5,000 seeded bootstrap resamples clustered by match. Negative Brier delta is better.

## Older 432-match cohort

| Variant | Brier delta | 95% interval | Win ECE | Certain losses | Seating B/W/T | Point delta |
|---|---:|---:|---:|---:|---:|---:|
| latest control | 0.000000 | [0.000000, 0.000000] | 0.0417 → 0.0417 | 3 → 3 | 0/0/0 | 0.0 |
| tail2 95% | -0.001407 | [-0.002532, -0.000171] | 0.0417 → 0.0391 | 3 → 3 | 0/0/7 | 0.0 |
| tail2 90% | -0.002353 | [-0.004601, 0.000107] | 0.0417 → 0.0374 | 3 → 3 | 0/0/9 | 0.0 |
| tail3 90% | -0.002875 | [-0.004936, -0.000432] | 0.0417 → 0.0341 | 3 → 3 | 0/0/13 | 0.0 |
| tail5 90% | -0.002609 | [-0.004865, -0.000148] | 0.0417 → 0.0336 | 3 → 3 | 1/1/20 | 0.5 |
| tail5 80% | -0.003290 | [-0.007872, 0.001580] | 0.0417 → 0.0406 | 3 → 3 | 1/2/28 | 0.0 |
| decay5 h=0.5 | -0.003509 | [-0.008711, 0.002279] | 0.0417 → 0.0361 | 3 → 3 | 0/3/24 | -2.5 |
| recent2 equal | 0.006685 | [-0.004688, 0.018772] | 0.0417 → 0.0372 | 3 → 3 | 2/5/24 | -2.0 |
| decay5 h=1 | 0.001677 | [-0.008711, 0.012698] | 0.0417 → 0.0350 | 3 → 3 | 2/7/37 | -3.0 |
| captain5 | 0.050136 | [0.024145, 0.068783] | 0.0417 → 0.0398 | 3 → 3 | 7/28/69 | -15.5 |
| trajectory5 | 0.007466 | [-0.008045, 0.024781] | 0.0417 → 0.0192 | 3 → 3 | 5/15/49 | -6.5 |

The gentler tails improve prediction slightly. `tail3 90%` changes 13 seat orders, but every changed order has the same realized win/draw/loss score. `tail5 90%` produces one better and one worse seat, for a net +0.5 point in this cohort. More aggressive widening and the conditioned variants perform worse.

## Later 177-match cohort

| Variant | Brier delta | 95% interval | Win ECE | Certain losses | Seating B/W/T | Point delta |
|---|---:|---:|---:|---:|---:|---:|
| latest control | 0.000000 | [0.000000, 0.000000] | 0.0745 → 0.0745 | 9 → 9 | 0/0/0 | 0.0 |
| tail2 95% | -0.001829 | [-0.002965, -0.000152] | 0.0745 → 0.0726 | 9 → 6 | 0/2/4 | -1.0 |
| tail2 90% | -0.003354 | [-0.005621, -0.000072] | 0.0745 → 0.0706 | 9 → 6 | 0/2/5 | -1.0 |
| tail3 90% | -0.003845 | [-0.005903, -0.000652] | 0.0745 → 0.0704 | 9 → 4 | 1/3/7 | -1.5 |
| tail5 90% | -0.003676 | [-0.005177, -0.000754] | 0.0745 → 0.0704 | 9 → 2 | 1/3/9 | -1.5 |
| tail5 80% | -0.006658 | [-0.009652, -0.000975] | 0.0745 → 0.0662 | 9 → 2 | 1/3/9 | -1.5 |
| decay5 h=0.5 | -0.007086 | [-0.011948, 0.000249] | 0.0745 → 0.0613 | 9 → 2 | 1/3/10 | -1.5 |
| recent2 equal | -0.004631 | [-0.016598, 0.009142] | 0.0745 → 0.0529 | 9 → 6 | 0/2/6 | -1.0 |
| decay5 h=1 | -0.010123 | [-0.018683, 0.002988] | 0.0745 → 0.0529 | 9 → 2 | 1/3/12 | -1.5 |
| captain5 | -0.003337 | [-0.018485, 0.022610] | 0.0745 → 0.0499 | 9 → 4 | 3/2/12 | 0.5 |
| trajectory5 | -0.006419 | [-0.019729, 0.015732] | 0.0745 → 0.0591 | 9 → 2 | 1/3/11 | -1.5 |

The later sample confirms the calibration effect and does not support a play change. `tail3 90%` lowers Brier by 0.003845 and cuts certain-win losses from 9 to 4, but its changed seating is **1 better, 3 worse, 7 tied**, totaling **−1.5 points**. `tail5 90%` cuts certain-win losses to 2 and has the same 1/3/9 seating direction and −1.5-point total. Seven of the latest-only certain-win losses are against `sodiumhyrdride`; reducing certainty about those boards does not by itself choose better seats.

## Interpretation

Forecast uncertainty and decision quality separate here. A broader target assigns useful probability to omitted boards, so Brier score and win calibration improve. When the target actually changes an ordering, the later observed board more often favors the original latest-only order. This evidence does not justify a whole-match benchmark or production widening.

The full table is in [opponent-uncertainty-summary.json](./opponent-uncertainty-summary.json). The research implementation is [tools/research_s4_uncertainty.js](../../../tools/research_s4_uncertainty.js).

## Reproduction

```bash
node tools/research_s4_uncertainty.js \
  --old-log /tmp/arena-log-review-20260924-000457/records/data/log/2026-09-23.jsonl \
  --new-log /tmp/arena-log-review-20260924-133808/records/data/log/2026-09-24.jsonl \
  --out /tmp/research-s4-uncertainty.json
```

Input SHA-256:

- September 23: `69425890b494e7aa6f027b8a51ffd79bec57f0381bd17ac4c73efd38fbfbc500`
- September 24: `3134b7159890c8961b0e4053db4cbf7e568d565fe7598025a093b8d229aed489`

## Limits

- The candidate family and later cohort were inspected during exploratory analysis. The intervals are descriptive, have no multiple-comparison correction, and do not make a tuning or pristine-holdout claim.
- The forecast comparison keeps the actually played board fixed. It does not estimate changed shopping trajectories.
- The seating comparison isolates attack targeting and omits the production defense objective.
- Rows without a logged pre-battle component forecast are excluded.
