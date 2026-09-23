# Supplied records: repair and offline validation (2026-09-20)

This report uses the user-supplied `thursday-arena-records-all.tgz`. It is a snapshot; local
tests and evaluations did not send rated actions. The archive remains unchanged. A full backup of
the repo before these edits is at `../thursday-arena-before-improvements-20260920.tgz`.

## Opponent book

The archived `memory/book.json` had 12,975 retained observations, newer than the repo's 10,505.
The old loop made a second round-1 or round-2 battle event when the server revealed a real match
ID after a `local_*` placeholder. The second event had an empty `us` board, and could write the
same opponent board to the book a second time. Across the non-AI records, 1,732 such empty battle
events paired uniquely with a preceding complete event. The other 68 empty events lacked a
complete nearby pair; they were left untouched. Another 660 paired duplicates had no retained
timestamp in the archived book. `tools/repair_book_archive.js` removed the other **1,072**
exactly identified timestamps, yielding **11,903** retained observations. It did not subtract
unmatched counts or restore boards evicted by the retention limit.

Four complete events under the new opening caption had enemy honey inferred incorrectly. Their
incorrect board variants had already been evicted from the archived book, so no retained stamp
could be moved. The fixed inference code recovers their honey from the frames for future records.
The repaired book was imported into `memory/book.json` as the new starting state. The original
archive book has SHA-256 `a9a9b23a105f3d1120fa0eef4f5d158b2cba293401275d1407ec6b522a7e0812`;
the repaired book has SHA-256 `3cc9c114ee5a3cf84c7ddb0d32115410f4cda57cb0c0dedc83b482a1c14d2454`.
The archive's `memory/last_opponent.json` was also imported because the local copy had none; its
last recorded handle was `the_ryyy` at 07:37:41 UTC.

Reproduce on an extracted copy of the archive:

```bash
node tools/repair_book_archive.js --records-dir /path/to/extracted-root --out /tmp/repaired-book.json
node tools/verify_archive_battles.js /path/to/extracted-root
```

## Rules and replay

The current [official rules](https://thursdayarena.com/rules.md) give each legendary half the
per-bot offer weight. They also specify that at the 40-exchange cap, total remaining HP decides
the winner, with total ATK as the next tiebreak. The shop model and simulator now implement both.
No recorded battle reached the exchange cap, so only the official text and focused unit tests
support that branch. Hot seat damage also clears stale credit for a previous hit; the recorded
2026-09-20T02:02:34.102Z battle establishes that a Hot seat KO gives no drain heal.

`tools/verify_archive_battles.js` replayed all **5,454** archive battles with complete inputs.
All **5,454 winners and full frame sequences** agree with the current simulator after treating
the old and new opening captions as equivalent. The corpus test separately checks all **10,748**
recorded winners in `data/corpus/battles.jsonl`.

## Loss audit and evaluation scope

`tools/loss_audit.js` finds 105 rated losses after 05:35 UTC, with 270 complete battle rounds and
zero simulator winner mismatches. Of 202 lost rounds, a hindsight choice of seat order with the
same units could have won 54 or drawn 29. This uses the enemy board revealed **after** shopping:
it bounds an opportunity but does not estimate a deployable win improvement. In those losses,
the as-of opponent book contained the exact eventual board in 4/105 R0, 17/105 R1 and 8/60 R2
shops. The R0 handle is usually a previous-opponent proxy rather than the current opponent.

The driver now keeps a stable `matchKey` when a `local_*` match ID becomes a server ID, writes one
battle per round, and logs accepted/rejected actions with the observed post-action state. After a
409 it leaves the current shop plan before another action. A battle reached after another actor
changed the shop has no confirmed copy of our board; telemetry marks it `inputMissing` and the
opponent book does not learn from it. A result is counted only after this process had an accepted
shop action or accepted `endShop`.

`tools/eval_recent.js` joins 1,621 rated matches and 3,803 archived shop records. It rebuilds
the book chronologically before each shop, deduplicates 346 observations shared by the older
corpus and the archive, and gives policy variants the same first offers and realized rerolls.
Its score is an isolated-shop counterfactual against the enemy board eventually faced; it cannot
measure changes to later shops caused by an earlier purchase. `tools/eval_matches.js` supplies a
separate whole-match mock check with exogenous draws keyed by match, round and shop roll.

### Weight selection

The current 50% previous-opponent weight at R0 and 75% known-handle weight at R1/R2 came from
the earlier repeat-heavy queue. We tested lower values only on the 05:35–07:00 UTC training
window, keeping the 07:00 onward records untouched for a final holdout if training supported a
candidate. The live 1,500 ms planner budget changes the amount of search slightly with machine
load, so its small score differences should not be treated as stable effects.

| Training comparison against 0.50 / 0.75 | Shops | Paired score difference, candidate minus baseline (95% interval) |
|---|---:|---:|
| R0 0.05, R1/R2 0.25, 2-hour handle recency | 120 | −0.0042 [−0.0639, +0.0555] |
| R0 0.10, R1/R2 0.50, 2-hour handle recency | 120 | +0.0042 [−0.0368, +0.0452] |
| R0 0.10 only; R1/R2 unchanged, no recency | 120 | +0.0083 [−0.0200, +0.0367] |
| R0 0.10 only, deterministic unlimited planner budget | 30 | 0.0000 (same actions and score in this subset) |

The first three rows use one seed and a 1,500 ms budget. The last row covers only nine R0
shops, so it is a reproducibility check rather than a powerful win-rate test. None justified a
live weight or recency change; the current 0.50 / 0.75 defaults remain. The optional policy
parameters in `target.build`, `eval_recent` and `eval_matches` make further checks possible when
new independent matches arrive. The untouched 07:00 onward segment was not used to select a
policy.

For example, the R0-only training comparison is reproducible with:

```bash
node tools/eval_recent.js --archive /path/to/records.tgz \
  --from 2026-09-20T05:35:00Z --to 2026-09-20T07:00:00Z \
  --limit 120 --seeds 3 --budget 1500 --candidate-r0 0.1 --candidate-r12 0.75
```

As a separate whole-match smoke check, the unchanged planner completed 30 fixed-seed mock
matches per season at an unlimited planner budget: S1 match score 0.833 (24 W / 4 L / 2 D), S2
0.867 (25 W / 3 L / 2 D), with no illegal actions or fillable short boards. The small sample
does not establish a win-rate change. The old 1,000-match mock figures used a different draw
coupling and should not be compared directly with this smoke check.
