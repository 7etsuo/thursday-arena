# Live records audit — 2026-09-21 UTC

**Follow-up:** the [implementation report](LIVE_FIXES_2026-09-21.md) records the subsequent fixes
and tests. The findings below describe the original supplied version before those changes.

The supplied records show that opponent learning is being saved and used correctly. They also
expose four battle-simulator errors, stale opponent weighting, and a concrete case where the
planner stopped shopping too early. **These issues were present in the supplied application.**
This audit changes documentation and saves evidence; it does not change or deploy application code.

## Sources and scope

The two split files in Downloads join to `thursday-arena-full-with-preupdate-backup-20260921.tgz`.
The joined bytes and the already assembled archive both match the supplied README checksum:

```text
a249d36e5ea4b915f74fa0f49e5d54192456078c3ef98b75a3396e41d0e220e5
```

The archive contains the installed tree and its pre-installation backup. Their September 19 and
20 daily logs are byte-identical copies; they were not counted twice. Active JavaScript and shell
files match the locally reviewed runtime. The new session's telemetry code ID is `2d2553e5fe48`.
Catalog contents also match. All three daily logs parsed without malformed lines.

The new live session ran September 21, 04:27:57–05:01:47 UTC (September 20, 22:27–23:01 Edmonton).
Its ID is `5fc6e525-3641-4d0e-b9fd-33bde5311ae3`. The preceding dry run accepted no actions.
All 138 completed match details were fetched from the official public match API using GET only.
For all 337 completed Season 3 battles, public frames agree with telemetry, and our public input
board agrees with the logged board. Seats and captains come from telemetry, not inference from
the resulting fight. No additional games were played.

## Actual results

| Scope | Matches | Wins | Losses | Draws | Win rate |
|---|---:|---:|---:|---:|---:|
| Entire new process | 138 | 119 | 15 | 4 | 86.2% |
| Matches played entirely in Season 3 | 137 | 119 | 14 | 4 | 86.9% |

The first result finishes an inherited Season 2 match against `izzat316`, starting at round index
1. Its loss and −9 Elo are excluded from the complete Season 3 comparison. A further Season 3
match was interrupted in round index 1 after one completed battle; it has no match result and is
excluded from both rows. The raw session therefore has 340 battles: 337 in complete Season 3
matches, two in the inherited match, and one in the interrupted match.

The 137 Season 3 matches were rated ghost matches against 20 distinct handles. Their match score,
counting draws as half, was 88.3%. Recorded played-match Elo deltas total +574 for these matches,
or +565 including the inherited loss. These are not a final account rating: ghost defenses can
also change rating. The process logged 2,894 accepted actions, zero errors, zero dropped events,
and zero AI matches, and stopped on SIGTERM.

Ten of the 14 Season 3 losses were against two opponents: `qsr_cg` (19 W / 4 L / 1 D) and
`ternquest_com` (22 W / 6 L / 2 D). The previous opponent recurred in 64/137 matches (46.7%).
That batch does not support reducing the existing 50% previous-opponent prior merely on the
basis of the earlier archive's lower repeat rate.

These are observed results of this version. Earlier logs mix different seasons, opponents,
ratings and code versions, so their aggregate win rates cannot establish a causal improvement.

## Learning from losses: verified

The remote installation preserved its original memory. It started this session with **zero
Season 3 observations**, rather than the Season 3 seed included in the reviewed package.

Reconstructing the book chronologically from the supplied backup and the new events produced:

- **Zero mismatches** in final board identities and observation counts.
- **Zero mismatches** in the logged book/pool counts and mixture weight used at each shop.
- **338 Season 3 observations written**: all 337 completed-match rounds from exact public replay
  boards, plus the interrupted match's completed round from the frame fallback.
- **Every round of all 14 Season 3 losses recorded.**
- 55 Season 3 keys, 83 distinct retained boards and 314 retained observations at shutdown.
  The difference between 338 writes and 314 retained observations is explained by the existing
  five-distinct-board retention rule; it is not lost telemetry or failed persistence.

The bot does learn opponent boards after losses and uses them in later decisions. It does not
automatically diagnose simulator errors or learn new strategy rules. A loss can be remembered
correctly while the planner still predicts the next fight incorrectly.

The empty Season 3 starting book also mattered: 40 Season 3 shops used a previous-season pool
fallback, including 12 shops in matches that ultimately lost. This is a concrete reason to
evaluate a Season 3 starting pool; it does not prove that those 12 decisions caused losses.

## Priority 1: correct the simulator

The current simulator reproduces **333/337 winners** and **306/337 complete frame sequences**.
Of the 31 frame mismatches, 11 have aligned board states with caption differences only. The
other 20 include state, ordering or frame-count differences and require investigation.

These four cases change the predicted outcome. Round indices are zero-based.

| Match and round | Predicted → actual | Behavior exposed by the official replay |
|---|---|---|
| `4d624a41-afa4-4751-adc9-0455df4ad581`, R1 | Win → draw | Silencing Spark removes its active aura immediately. The model leaves the aura active. |
| `4e58774b-8fc1-46a6-9222-63a819854ea6`, R2 | Win → loss | Megaphone hits the last enemy bot despite taunt. The model redirects it to the taunter. |
| `5a75c6d6-dd00-4845-88dd-833aa1222f34`, R2 | Draw → loss | Alchemist's Megaphone damage does not apply its venom. The model applies venom to this item hit. |
| `28d89b21-0612-40d9-88c6-e8764503edfd`, R1 | Win → loss | Hotfix does not amplify The Accountant's enemy-attack debuff aura. The model reduces attack by three instead of one. |

Temporary in-memory diagnostic changes for these four behaviors reproduce **337/337 winners**
and **314/337 full traces**, with no winner regression within this sample. They have not been
installed or subjected to the full historical regression suite. There are still 23 full-trace
mismatches under that diagnostic variant. A broad change disabling Hotfix for every aura is
incorrect: its amplification of a positive friend-attack aura is supported by another replay.

Three of the four wrong outcome predictions occurred in lost matches. Correcting the simulator
does not by itself prove that a different shopping policy would have won those matches.

## Priority 2: test more weight on recent opponent boards

The current policy weights a handle's retained boards by accumulated observation count. Older,
frequently seen lineups can outweigh the most recent lineup after an opponent changes it.

Across the 200 later-round shops, using only memory available before each decision:

| Top predicted opponent board | Exact ordered board matches |
|---|---:|
| Most frequently observed board | 127/200 (63.5%) |
| Most recently observed board | 149/200 (74.5%) |

There was prior memory in 165 shops, and the actual board was represented in 149. In those 149
covered cases it was the newest board. Matching here includes ordered unit stats and equipment;
captain handling remains separate. This comparison measures board prediction, not match wins.

A limited seating comparison held purchases, captains and final boards fixed, chose seat order
using the historical target, then evaluated against the actual opponent. It included the 306
battles whose observed full trace is reproduced exactly. Keeping the existing book/pool shares
but favoring the latest stored board improved three round outcomes and worsened one, for a net
gain of 1.5 round-score points. The frequency baseline reproduced all 306 observed outcomes.

This is promising but small evidence. It is not an end-to-end win-rate benchmark, and simulator
accuracy on an observed seat order does not certify every hypothetical ordering. A recency
policy should be tested after the engine corrections, with purchases and later rounds allowed
to respond to its decisions, and with a separate evaluation set.

## Priority 3: check the full target before ending a shop

Against `poteto`, match `334e6217-e979-4859-a2d3-8d802d302a5f`, round index 2, the bot ended
shopping with **12 tokens left**. Its target contained 40 candidate boards. The planner reduced
that to 20 and concluded its current board scored 1.000.

Re-running that saved state with a 1,500 ms budget and seed 123 reproduced:

```text
r2 done 1.000 [cut: samples 6->2, target 40->20]
```

Against the full historical target, the current board scores 0.912833. One affordable feed to
Nightly Audit Engineer raises that to 0.951574. An unrestricted planner call finds a feed with a
follow-up, estimated at 0.966102. These scores use information available at the time, without
using the future revealed opponent to choose the move. Timing and budget calibration depend
on the machine; the saved reproduction records this machine's results.

Separately, hindsight shows that equipping the available Stapler on that engineer would turn
this actual battle from loss to win in the model. That is evidence of an opportunity, not proof
that the unrestricted planner would necessarily select that item or win the whole match.

A screen of all 200 ended later-round shops found this one case with a better affordable
nonrandom single move under the full historical target. The improvement to test is a final
full-target check before declaring shopping complete. Spending every remaining token blindly
is not the proposed rule.

The rest of the sampled shop execution was consistent: 1,907 action economy checks and 1,545
deterministic board checks passed, with no model/legality mismatches. Random reroll boards were
not treated as deterministic predictions, and the initial captain action was outside those
checks. No Season 3 shop ended with an incomplete team.

## Saved evidence and next work

- [Machine-readable reports](results/live-audit-2026-09-21/README.md), including the individual
  loss-learning checks, prediction comparisons, simulator probes and budget reproduction.
- [337 complete-input battle fixtures](../data/corpus/s3_live_battles_2026-09-21.jsonl), with
  official frames and telemetry seats/captains for subsequent regression tests.
- The evidence archive linked from the reports includes scripts, intermediate decisions,
  public replays, the new daily log, before/after memory, and a snapshot of the reviewed runtime.

The next implementation should correct and regression-test the observed engine behaviors,
verify the other trace differences, then compare recency weighting and the stopping guard in
paired policy evaluations. The untouched original downloads remain the complete source archive.
The existing runtime SHA-256 manifest still passes after this audit. No live memory was merged,
no deployment was performed, and the diagnostic variant is not a release.
