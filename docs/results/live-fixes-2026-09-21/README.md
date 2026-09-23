# Live fixes: verification evidence

See the [implementation report](../../LIVE_FIXES_2026-09-21.md) for conclusions and limitations.

| File | Check |
|---|---|
| [final-tests.log](final-tests.log) | Full offline test suite, including all 337 supplied exact-input S3 replays |
| [archive-replay.json](archive-replay.json) | 7,121 complete historical archive events, all frames and winners reproduced |
| [public-original.json](public-original.json), [public-review.json](public-review.json) | Older public S3 diagnostics with inferred seats/captains |
| [fixed-stop.json](fixed-stop.json) | The corrected decision in the recorded 12-token final shop |
| [recorded-seating.json](recorded-seating.json) | Historical-target seating comparison on all 337 recorded battles; purchases held fixed |
| [bootstrap-verification.json](bootstrap-verification.json) | Installation seed tested on copies of both supplied memory books |
| [versions-s12.csv](versions-s12.csv), [log](versions-s12.log) | 100 paired games per historical season against the original version |
| [versions-s3-exact-frequency.csv](versions-s3-exact-frequency.csv), [log](versions-s3-exact-frequency.log) | S3 engine/stopping fixes with frequency weighting: 100 paired games |
| [versions-s3-final.csv](versions-s3-final.csv), [log](versions-s3-final.log) | Complete updated version versus original: 100 paired S3 games |
| [latest-exact-paired.csv](latest-exact-paired.csv), [log](latest-exact-paired.log) | Latest versus frequency weighting in 100 pairs with handle-disjoint training folds |
| [s3-budget-self-check.csv](s3-budget-self-check.csv), [log](s3-budget-self-check.log) | Same-version control for the S3 seed affected in the frequency ablation |
| [exact-self-check.csv](exact-self-check.csv), [log](exact-self-check.log) | Small unrestricted same-policy pairing check with the corrected mock |
| [practice.json](practice.json) | Two official anonymous practice games: four exact fights, 22 checked shop actions |
| [practice-regressions.log](practice-regressions.log) | Offline replay of old and new official practice transcripts |
| [runtime-sha256.txt](runtime-sha256.txt) | Application, tools and mock source checksums |
| [verification-summary.json](verification-summary.json) | Replay and test totals |
| [source-changes.diff](source-changes.diff) | Source changes against the pre-fix backup |
| [official-rules.md](official-rules.md) | Official rules fetched during this work |

No rated matches were played. The mock's item draw odds, later item costs and captain offers
remain approximations. The corrected mock supplies completed public replays so learning can
retain equipment. Earlier comparisons that forced frame-only learning were aborted and are
not included as release evidence.

The original complete battle fixture was verified unchanged against its audit checksum. New
anonymous practice request/response transcripts are saved in
[`test/fixtures/season3-practice-full-matches-2026-09-21.json.gz`](../../../test/fixtures/season3-practice-full-matches-2026-09-21.json.gz).
The user's actual opponent memory remained byte-identical to the pre-fix backup.
