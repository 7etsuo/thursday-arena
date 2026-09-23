# Evidence for the September 21 logs review

See the [review](../../LOG_REVIEW_2026-09-21.md) for interpretation and limits.

- [Input archive checksum](INPUT_SHA256.txt) and [all-log inventory](inventory.json).
- [Runtime, replay, shop and learning audit](audit-summary.json).
- [Prediction and shopping analysis](decision-summary.json).
- [Attacking and defensive results](defense-summary.json), cross-checked against the official account history.
- [Isolated Hotfix diagnostic](status-probe.json); no application patch was installed.
- [Full-trace mismatch classification](trace-classification.json).
- [Player replay retrieval](fetch-report.json) and [defensive replay retrieval](defense-fetch-report.json).
- [Unchanged application hashes](runtime-sha256.txt).
- [Complete offline evidence archive](evidence.tgz) and [checksum](evidence.tgz.sha256).

The evidence archive contains the new-version telemetry events, starting book from the prior
user-supplied archive, all fetched public replays/history, analysis outputs, reproduction scripts,
and a snapshot of the unchanged runtime. Its README lists the four offline commands. None plays
games or modifies the real application's memory. The input logs TGZ in Downloads remains intact.

The original player replay retrieval encountered one temporary HTTP 429. A cached retry fetched
the missing match; final reports have zero missing replays. Defensive matches after 13:09 UTC
are presented separately because the local bot had stopped. The public snapshot ends at 15:08 UTC.
