# Live audit evidence — 2026-09-21 UTC

Read the [main findings](../../LIVE_RECORDS_2026-09-21.md) first. No application code was changed.

| File | Contents |
|---|---|
| [inventory.json](inventory.json) | Input integrity, daily log/code counts, identical backup log overlap |
| [audit-summary.json](audit-summary.json) | New-session results, opponent breakdown, memory reconciliation, replay differences |
| [decision-audit.json](decision-audit.json) | Shop checks, chronological board prediction comparisons, evidence for all losses being learned |
| [sim-probes.json](sim-probes.json) | In-memory diagnostic simulator variants; not deployed fixes |
| [trace-classification.json](trace-classification.json) | Caption-only versus state/order/frame-count differences |
| [seating-comparison.json](seating-comparison.json) | Limited comparison of historical-target seating policies; not match win rates |
| [stop-audit.json](stop-audit.json) | Screen of 200 ended later-round shops for affordable improvements |
| [budget-reproduction.json](budget-reproduction.json) | Same saved shop with a 1,500 ms and unrestricted planning budget |
| [fetch-report.json](fetch-report.json) | All 138 official public match details fetched successfully |
| [evidence.tgz](evidence.tgz) | Scripts, intermediate data, public replays, new daily log, before/after memory, reviewed library/catalog snapshot |
| [manifest.json](manifest.json) | Checksums for these results and the new battle corpus |

`evidence.tgz` is an analysis dossier, not an installation package. Its README explains offline
reproduction. The original Downloads archive remains the complete supplied data, including the
older logs and backup tree.

The [new corpus](../../../data/corpus/s3_live_battles_2026-09-21.jsonl) has 337 JSONL rows with
`us`, `them`, `options`, `winner` and `frames`, plus raw public boards and provenance. Inputs
include exact telemetry seats/captains. Winner values use public replay labels `you`, `them`
and `draw`; the simulator calls our side `us`. The corpus has its own schema marker and has
not been silently added to a historical test runner or substituted for an older corpus.
