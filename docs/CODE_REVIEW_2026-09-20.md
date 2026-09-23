# Code review and verification — 2026-09-20

**Follow-up:** the [September 21 UTC live records audit](LIVE_RECORDS_2026-09-21.md) finds four
additional simulator outcome errors in this reviewed version. The measurements below describe
the original review sample; they do not establish correctness on the subsequently supplied games.

Reviewed the active code in `lib/`, `driver/`, `mcp/`, `tools/`, and the mock/test infrastructure,
then checked the live [rules](https://thursdayarena.com/rules.md),
[catalog](https://thursdayarena.com/api/catalog), [items](https://thursdayarena.com/api/items),
and [season endpoint](https://thursdayarena.com/api/season). The site reports Season 3 as
`{"number":3}`; its 179 bots and 19 items match the local catalogs. Historical audit documents
remain labeled as historical. No rated matches were played during this review.

## Changes

### Battle model

Corrected behavior against actual recorded server frames:

- Double attacks resolve armor and shields per hit. Laser Pointer boosts both components of
  the first double attack. Survivor ordering consumes one random draw per unit.
- Shielded hits do not fire hurt abilities or consume survivor-order randomness. Armor/shield
  messages retain damage order, and simultaneous splash is grouped with the defending team.
- Venom accumulates. Dead units cannot react to other knockouts. Last-standing growth happens
  before the next attack, after all pending knockouts, and can activate for an initially lone bot.
- Shorty's `jump_cut` includes both double hit and growth when an enemy faints.
- Auras affect their initial recipients; later summons do not inherit them. Encore repeats auras
  and the appropriate copied effect. Copied start abilities run immediately.
- Silence equipment runs before item stat bonuses; Megaphone runs after both teams' bonuses.
  Mute Button respects taunt. Repeated silence does not generate a duplicate message.
- Periodic effects follow the recorded exchange ordering. Hotfix does not increase passive
  splash damage. A jammed first striker allows the other bot's ordinary attack.
- Updated several messages to match recorded traces, including periodic friend buffs and shields.

These are rules corrections, not named-bot preferences or a new strategy heuristic.

### Learning and persistence

- A visible rival captain takes priority over a captain from historical opponent records.
- Season 3 result handling retries a delayed public replay once, then saves the frame fallback.
  It records each round once and retains public replay items when available.
- Buffered completed rounds with a known human opponent are saved on graceful interruption,
  driver error, or a new match context. Practice/AI matches never enter the opponent book.
- Failed saves retain pending observations for retry and remove the failed temporary file.
  Corrupt, unreadable or unsupported existing books now raise an error instead of being silently
  replaced by an empty book. Missing files still start empty.
- Book merges preserve counts above the 64 retained timestamps. If overlapping truncated
  histories cannot be merged exactly, the tool refuses without changing either file.
- Targets retain distinctions in equipment, crew and captain when blending a thin season pool.
- MCP reads current opponent memory on each request. Supplying explicit stats for a known bot
  no longer discards its catalog ability.

A regression test drives a completed loss through delayed public-replay enrichment, confirms
that its equipped enemy board is saved once, and verifies that the subsequent target uses it.
This is the implemented form of learning: storing observations and using them in later
simulations. It does not train a new policy or guarantee a different move after each loss.

### Driver, transport and tools

- Practice rematches use `restart`; the official practice endpoint rejects `start` with HTTP 400.
- Added a practice-only adapter that runs the real driver/planner with isolated memory and logs,
  respects rate limits, and checks shop actions and complete battles against server replies.
- Explicit `Retry-After` waits are no longer shortened by jitter or the backoff cap.
- Exhausting the loop's step budget reports `max_steps` and a nonzero CLI exit.
- Shop and battle telemetry retain Season 3 economy/captain fields.
- Chrome profile protection resolves symlinks and existing parent directories before launch.
- Historical shop evaluation/loss-audit and honey-repair tools refuse Season 3 inputs instead
  of silently stripping their item/captain behavior.
- Public replay diagnostics search ambiguous seat triplets, with their inferred-input limitation
  explicit. Added a second disjoint sample of 100 public matches and 23 recorded regression cases.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **226 passed, 0 failed** |
| Historical Season 1/2 recorded winners | **10,748 / 10,748** |
| Supplied archive, complete Season 1/2 battles | **5,454 / 5,454 winners and full traces** |
| Original Season 3 public sample | **239 / 239 winners; 237 / 239 full traces** |
| Additional Season 3 public sample | **258 / 258 winners; 257 / 258 full traces** |
| Official anonymous practice, 10 completed matches | **9 wins, 1 loss**, 191 accepted actions, no driver/action errors |
| Practice shop comparisons | **115 passed** |
| Saved practice fights, exact server inputs | **21 / 21 winners and full traces** |

The last two practice matches used the final runtime fixes and both finished 2–0. The first eight
ran during review. All 21 saved fights were subsequently checked against the final simulator.
Their exact enemy boards, seats and captains come from the practice server; no replay metadata
was inferred for these checks. An earlier practice harness attempt finished one match, then
stopped at an HTTP 400 rematch request; this exposed the `start`/`restart` fix. That incomplete
attempt is excluded from the ten-match table.

For a direct simulator comparison, both the pre-review and final engines received identical
reconstructed inputs for the 497 public rounds:

| Simulator | Winners matched | Complete traces matched |
| --- | --- | --- |
| Before battle review | 493 / 497 | 398 / 497 |
| After battle review | 497 / 497 | 494 / 497 |

This measures replay fidelity. The missing seats/captains were reconstructed from these same
frames using the final engine, so it is not an independent prediction benchmark. The additional
sample initially scored 258/258 winners and 230/258 full traces against the partially corrected
engine before its discrepancies were investigated; it is now regression data, not a held-out set.

Saved evidence:

- [Test output](results/code-review-tests-2026-09-20.txt)
- [Archive replay](results/code-review-archive-2026-09-20.json)
- [Simulator comparison](results/code-review-s3-replay-2026-09-20.json)
- [Practice reports](results/code-review-practice-2026-09-20.json)
- [Original public discrepancies](results/code-review-public-original-2026-09-20.json)
- [Additional public discrepancies](results/code-review-public-new-2026-09-20.json)
- [Runtime source hashes](results/code-review-runtime-sha256-2026-09-20.txt)
- Complete practice transcripts: `test/fixtures/season3-practice-full-matches-2026-09-20.json.gz`

## Remaining limits

Two rounds of public match `eb9da821-bcb1-4e54-acaa-6a202a27c4fc` omit crew effects that the
current rules/catalog would apply. They are not reproduced exactly. Round 0 of
`bb1df549-c881-44f3-a77f-d91a69a6d705` uses older Bulk caption wording; its unit states agree.
The verifier reports these discrepancies rather than special-casing match IDs in the engine.

Practice results do not establish a rated win-rate improvement, and this review did not run a
paired old/new policy match benchmark. Earlier mock strategy comparisons in `SEASON3.md` used
the pre-review simulator. Item draw odds and later item prices remain mock assumptions; live
play uses the server's actual offer prices. Current opponent-prior weights remain uncalibrated
for the new matchmaking pool.

If a public replay remains unavailable, frame fallback cannot recover every equipped item.
Graceful shutdown saves known-opponent evidence, but a forced kill can lose buffered evidence,
and an unidentified opponent cannot be assigned a reliable book key. Atomic saves protect file
replacement and sequential writers; the book does not implement a general concurrent-writer lock.
The driver lock still permits only one rated loop. Historical archive replay totals above cover
Season 1/2; ordinary Season 3 battle telemetry may still contain a frame-inferred enemy board.

## Reproduce

```sh
npm test
node tools/verify_s3_public.js
node tools/verify_s3_public.js data/corpus/s3_public_matches_review_2026-09-20.jsonl
node tools/verify_archive_battles.js /path/to/extracted/thursday-arena-records-all
node tools/verify_live_practice.js --seed 20260921 --games 2 --budget 1500
```

The last command uses the live anonymous practice service. Planner search has a wall-clock
budget, so repeating its seed need not reproduce the identical action sequence. The saved
server transcripts replay deterministically offline.
