# Review of the 1,150-match log export — September 21, 2026

> The findings below describe the audited version. The subsequent implementation and tests are
> in [DEFENSE_FIXES_2026-09-21.md](DEFENSE_FIXES_2026-09-21.md).

## What explains the losses

The installed fixed version is running and records the opponents from its actively played losses.
The larger problem is **defending with saved boards**: those losses consume rating, are absent
from local match-result logs, and are not ingested into opponent memory. The latest process also
stopped at its total loop-step limit, leaving its last losing team available for further attacks.
The new records expose additional simulator errors as well.

This is an analysis, not a deployment. Application code, the shipped TGZ, and live local memory
were not changed. No games were played. Public match details and history were read with GET only.

## Inputs and attribution

- Archive: `thursday-arena-all-logs-20260921-091341.tgz`, 10,077,252 bytes.
- SHA-256: `93471e59488e804092797fb0d79db1b107e19dd4d3f23161579baf0ec005cf3e`.
- The September 19–21 daily logs contain 154,637 valid JSON lines, with no malformed lines.
  Older results include other code versions, AI matches and historical duplicate events; they
  are not counted as matches of the new version.
- The new run's code ID is `5b818477d8cb`, identical to the local packaged runtime. Its application
  SHA-256 manifest still verifies. All new sessions use this same code ID.
- New-version local results span 07:18–13:09 UTC on September 21: **1,150 distinct completed
  matches, 998 wins, 112 losses, 40 draws; 86.8% wins**. They are rated ghost matches.
  Two matches resumed work begun in an earlier process; 1,148 have every round played and logged
  within one of the new-version match contexts.
- The initial opponent book used for reconstruction is the remote book from the previous supplied
  archive at 05:01 UTC. The new export contains logs only. Final on-disk memory is not available
  for a byte-for-byte comparison.

## Attack results versus defense results

The [official account history](https://thursdayarena.com/api/public/v1/matches?x_handle=tetsuoai&limit=100)
reports both roles. All 1,150 local results and rating deltas agree with it. It also contains one
additional win worth +5: match `8c51437a-41f1-46d2-a4d5-7c03d2dfa7bc` completed immediately before
the 09:58 SIGINT, after its battles but before a local result event. The public totals below include
that match, so they differ from the local totals by one win.

### From the fixed version's startup through its last shutdown

| Role | Matches | Wins | Losses | Draws | Rating change |
|---|---:|---:|---:|---:|---:|
| Bot attacks opponents | 1,151 | 999 | 112 | 40 | +955 |
| Opponents attack the bot's saved boards | 79 | 21 | 50 | 8 | −847 |
| Combined | 1,230 | 1,020 | 162 | 48 | **+108** |

Against `ternquest_com` specifically:

| Role | Matches | Wins | Losses | Draws | Rating change |
|---|---:|---:|---:|---:|---:|
| Bot attacks `ternquest_com` | 428 | 343 | 66 | 19 | +781 |
| `ternquest_com` attacks the bot | 71 | 18 | 46 | 7 | −778 |

Thus nearly all rating earned attacking this player was lost defending against them. Their
attacks supplied 46 of the 50 defensive losses in this period. The public rating ledger also
reproduces all three subsequent login-rating checkpoints exactly: 1,686, 1,697 and 1,533 from
the initial 1,507. This cross-check supports the accounting; played-match Elo alone is incomplete.

The [current official rules](https://thursdayarena.com/rules.md) allow more repeat encounters when
both players are at least 1,300 and use K=32 for those ghost defenses. The analysis sums the actual
published rating deltas rather than assuming every match qualified for that rule.

## The unlimited run stopped, and defenses continued

The last session ended at **13:09:12 UTC / 07:09:12 Edmonton**, with `exitReason: "max_steps"`
after 584 completed matches. `--games 0` maps to an unlimited match count, but
`driver/play_loop.js` still applies a **4,000-iteration total limit**. `play_session.js` exits
with code 3 when this happens; it does not start a replacement process.

The last completed match, `7baae507-5852-495d-a3b6-2e724739a4b6`, was a 1–2 loss to
`ternquest_com`. The driver queued another match and picked Chef, then reached the iteration
limit before shopping. That did not replace the previous match's saved boards.

From shutdown through the public snapshot's last result at **15:08:29 UTC**, the account played
no attacking matches but had **50 defenses: 7 wins, 38 losses, 5 draws, −364 rating**. Of these,
23 were against `ternquest_com`: 2 wins, 20 losses, 1 draw, −214 rating. All 129 defensive rounds
in this interval used the three boards from that last completed losing match. The defensive
captain remained Medic, as shown in the replay frames.

The rating ledger implies 1,615 at shutdown and 1,251 at the last captured public result. These
are historical ledger reconstructions, not a claim about the account's rating after the snapshot.

## Learning: working for played matches, missing defensive matches

Reconstructing the book in event order and rebuilding every shop target found:

- **2,753 opponent-board observations:** 2,749 from completed public replays and four from the
  frame fallback used when a session was interrupted.
- All **272 rounds in all 112 locally logged lost matches** have learning events.
- No missing or duplicate learning events for confirmed, logged battle inputs.
- **Zero mismatches across 2,755 shop targets** in the logged book count, pool count, book weight
  and final target size. This includes targets after process restarts.
- Zero runtime error events and zero dropped telemetry events in the new-version sessions.

This verifies the learning events and subsequent target construction. With a logs-only export,
it does not independently verify the exact bytes of the final stored book.

The recent-lineup policy is substantially more accurate than frequency on this larger sample.
For the 1,602 later-round decisions with complete replay inputs, the latest known lineup matched
1,194 actual boards (**74.5%**); the frequency leader matched 661 (**41.3%**). Against
`ternquest_com`, those figures were 436/610 (**71.5%**) versus 128/610 (**21.0%**). This uses
only previously available observations. Board identity includes order, stats, honey and items.
These are prediction figures, not a paired estimate of match wins gained.

The driver does not ingest match history where our account is the defender. In the 201 defensive
rounds before shutdown, **123 attacker boards were absent from the retained opponent book** at
the time; 108 of those belonged to `ternquest_com`. The public replays contain these boards, but
the current learning path never reads them. Merely remembering active-match losses cannot fill
that gap. Public replay captain/seat metadata must be handled carefully when adding such a path.

## Simulator: six additional wrong outcomes

Using public input boards plus independently logged seats and captains, 2,751 battles are
reconstructible. Every public frame sequence agrees with its corresponding telemetry, and every
public player board agrees with the logged player input.

| Check | Matches |
|---|---:|
| Current simulator winner | 2,745 / 2,751 |
| Current simulator full frame sequence | 2,686 / 2,751 |

There are 65 full-trace differences: 18 have identical frame-by-frame board states but different
captions; 47 include state, event-order or frame-count differences.

**All six outcome errors arise from Hotfix incorrectly amplifying vulnerability or venom.**
Examples include Homework Checker, Icebreaker and Golf Caddie with vulnerability, and Blunt with
venom. The model adds two to these status values; the observed server does not. Four affected
rounds were against `ternquest_com`, including rounds in two lost matches. This is not a claim
that correcting those predictions necessarily wins those matches.

An isolated diagnostic that removes only those two amplifications reproduces **2,751/2,751
winners and 2,696/2,751 full traces**. It runs in memory and is not installed. Fifty-five trace
differences remain, involving such cases as first-strike retaliation splash, copied abilities,
last-standing triggers and effect ordering. Full fixes need regression coverage; matching winners
alone is insufficient.

## Shopping and strategy checks

- **15,658 legality and economy checks** and **13,033 deterministic board-transition checks**
  pass against logged accepted actions. Reroll contents are not treated as deterministic.
- No ended shop has an incomplete board.
- In 1,012 later-round, frame-exact ended shops with tokens left, no affordable exact single
  move improves the existing full-target objective. The previous premature-stop fault did not
  recur in this screen. This does not rule out better rerolls, longer purchase sequences or a
  better objective.
- Seating chosen again with shop-time knowledge reproduces every observed outcome across the
  2,686 frame-exact cases. The analysis does not use the rival captain revealed after round 0
  to select a round-0 ordering.
- Hindsight can improve 179 round results by changing seats, including 48 rounds in 39 lost
  matches. Hindsight knows the eventual opponent board; this is opportunity, not an executable
  policy or 39 proven avoidable match losses.
- In 13 final-round shops, an affordable move improves ordinary round win/draw score while
  preserving the current match objective: 11 while leading 1–0 and two while trailing 0–1.
  The match objective values a draw as highly as a win when leading 1–0 in the final round.
  A stronger saved board has potential defensive value that
  this objective does not measure. The 13 cases do not establish a defensive rating gain.

## Priorities for the next implementation

1. **Make unlimited play survive healthy long runs.** Replace the lifetime step cutoff with
   appropriate progress/phase watchdogs or a clean match-boundary continuation. Preserve the
   existing no-progress, unknown-phase, lock and signal protections.
2. **Record and learn from defensive results.** Read public history with a persistent cursor,
   deduplicate match/role observations, and report attack, defense and total rating separately.
   Exact boards can be learned without inventing missing captain/seat metadata.
3. **Fix and regression-test the new simulator differences**, beginning with Hotfix's status
   amplification. The in-memory probe is evidence of the cause, not a release candidate.
4. **Evaluate defensive board quality as part of the objective.** Start with safer ties where
   current-match value is unchanged; test a broader defense objective with chronological data
   and paired evaluation. More frequent attacks alone do not prevent losing rating on defense.
5. Recheck strategy against opponents whose boards change. Latest-lineup weighting is supported
   by these records, but about 28.5% of later-round `ternquest_com` boards still differ from the
   latest observation. Keep uncertainty and population coverage in the model.

No new live win-rate improvement has been measured or claimed in this review. Detailed reports,
the input hash, unchanged runtime snapshot, public replays and offline reproduction scripts are
in the [saved evidence](results/log-review-2026-09-21/README.md).
