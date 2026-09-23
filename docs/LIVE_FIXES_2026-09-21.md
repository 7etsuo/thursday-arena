# Fixes from the live records — 2026-09-21

This follow-up implements the corrections identified in the
[live records audit](LIVE_RECORDS_2026-09-21.md). The original application is backed up at
`../thursday-arena-before-live-fixes-20260921-000607.tgz`. No rated games or remote installation
were performed during this work.

## Battle simulator

The original version matched 333/337 winners and 306/337 full traces in the supplied complete-input
Season 3 sample. The corrected version matches **337/337 winners and 337/337 full traces**.
The whole sample is now an automated regression test, with input immutability checked as well.
Seats and captains come from independent telemetry rather than inference from expected frames.

The corrections cover all differences in that sample:

- Silence removes an active aura once, before its silence caption. Aura expiration skips dead
  recipients awaiting knockout resolution.
- Megaphone targets the last enemy despite taunt and does not apply its holder's venom.
- Hotfix amplifies positive attack auras, but not an enemy-attack debuff aura.
- Faint reactors follow team and board order. Last-standing growth precedes the next Hot seat
  tick after an exchange leaves a lone survivor.
- Periodic abilities and healing run in the same per-unit pass.
- A copier does not recursively copy an unresolved copy ability; copied snipes use the correct
  ability caption.
- Armor combines kit and equipment mitigation and reports the amount actually absorbed.
- A one-sided jam uses the ordinary attack path even when the surviving attacker has first strike.
- Kill Switch reports each silence, and unequal Marketing crews report both damage amounts.

Historical regression checks remain intact: **10,748/10,748 Season 1/2 corpus winners** in the
test suite and **7,121/7,121 complete historical archive events** replaying frame for frame.
These sets overlap; their counts should not be added as independent battles.

The two older public Season 3 samples still reproduce 497/497 winners and 494/497 traces. Their
three known discrepancies concern older crew behavior and Bulk wording, as documented in the
[original review](CODE_REVIEW_2026-09-20.md#remaining-limits). The engine does not special-case
those match IDs. These public-only diagnostics infer missing seats/captains from the frames.

## Full opponent sample before stopping

If the planner reduces its target to fit the search budget and finds no move, it now evaluates
every affordable exact single move against the original target before declaring shopping done.
This also makes the subsequent fill and permanent-apple fallback use the full target. It does
not add another stochastic reroll search or another two-step search. The bounded check can
exceed the soft search budget; the budget was already an estimate, not a hard action timeout.

In the recorded final shop against `poteto`, the old planner stopped with 12 tokens because
the reduced target scored its board at 1.000. The corrected planner finds a feed to Nightly
Audit Engineer, improving its full-target estimate from **0.912833 to 0.951574**. The regression
test forces sample reduction without depending on machine speed and verifies the returned
actions are legal and improve the full historical target. It uses no revealed enemy board to
select the move.

`plannerOpts.verifyStop: false` is retained for explicit policy comparisons; live play enables
the check by default.

## Recent opponent lineups

Season 3 now gives the handle-specific part of its target to the most recently observed lineup.
The existing 50% book / 50% pool split in round 0 and 75% / 25% split later remain intact. Older
lineups stay in the book; they are not deleted. Historical Seasons 1 and 2 retain frequency
weighting. Explicit frequency and decay overrides remain available for policy comparisons.
The same policy reaches captain drafting, current-round decisions and future-round estimates.

The chronological live audit found 149/200 correct later-round board predictions using the
latest lineup versus 127/200 using frequency. With the corrected engine, a seating-only comparison
on all 337 recorded rounds scores 259 versus 257 round points: four outcomes improve and one
worsens. Purchases, captains and final boards are held fixed, and decisions use only prior memory.
This supports the change in board prediction, but does not establish an end-to-end win-rate gain.

A separate 100-pair comparison isolating frequency versus latest-board weighting used five
handle-disjoint folds of the older public sample, five seeds, four matches per fold/seed and
a 1,500 ms budget. Seed observations excluded each held-out handle and match. Both policies
finished **91 W / 6 L / 3 D** (score 0.925), with all 100 paired outcomes unchanged and no
illegal actions or fillable short-board shops. This short sequence per fold does not establish
an advantage for either memory policy; the final version comparison below uses longer
20-match sequences with initially empty books.

## Preserving memory while seeding a new season

The old installation instructions preserved remote memory but omitted the bundled Season 3
seed. The new `tools/bootstrap_s3_book.js` installation step handles this:

- If any Season 3 observations exist, it leaves the book byte-for-byte unchanged.
- Otherwise it builds the existing public Season 3 seed, backs up the original book, and merges
  only the new season's entries. Historical observations, including truncated counts, are preserved.
- It refuses malformed memory or an arena loop lock and does not run `book:build`.

Testing on copies of the supplied books added 334 retained Season 3 observations to the old
13,396-observation book while preserving every historical entry. The current remote book, with
314 retained Season 3 observations, was left byte-for-byte unchanged. The actual local and
remote books were not modified by this verification.

## Evaluation fidelity

While checking the policy changes, the local mock was found to lack the completed public replay
endpoint. That forced simulated Season 3 learning onto the equipment-incomplete frame fallback.
The mock now supplies exact completed boards, including equipment, through the same endpoint
interface as the real client. Replays are unavailable before completion, and returned objects
cannot mutate the mock's stored records. An end-to-end driver test verifies equipped opponents
are learned exactly. Comparisons begun with the old mock were stopped and are not used as
release evidence.

The Season 1 and 2 version comparison used 100 paired matches per season, five seeds and an
unrestricted search budget. All 200 paired outcomes were unchanged: Season 1 had 81 W / 9 L /
10 D in both versions; Season 2 had 76 W / 14 L / 10 D. Neither version attempted an illegal
action or ended a shop with a fillable empty seat. With no target reduction, this comparison
checks historical behavior but does not exercise the new stopping guard.

With the corrected mock, a 100-pair Season 3 ablation of the engine and stopping fixes while
retaining frequency weighting scored 76 W / 18 L / 6 D against the old version's 77 W / 17 L /
6 D. Match score changed by −0.010, with seed-clustered 95% interval [−0.0378, +0.0178]; one pair
worsened and 99 were unchanged. A same-version rerun of the affected 20-match seed reproduced
identical outcomes in both arms. These numbers are recorded rather than presented as a gain.

Two additional official anonymous practice games, seed 20260922, both finished 2–0. All four
battles matched the server frame for frame, all 22 checked shop actions matched, and there were
no rate limits or driver errors. Practice used isolated temporary memory and logs.

Local mock and practice results are not a measured rated win-rate improvement. The new live
record fixture fixes known engine errors, but it is a regression sample rather than a guarantee
that every possible combination of game effects is modeled perfectly.

## Final version comparison

The complete updated version, including latest-board weighting, played the same 100 paired
Season 3 mock games as the original version, with five seeds, 20 matches per seed, a 1,500 ms
planning budget and initially empty books. Both versions faced the corrected mock rules and
received exact completed public replays for learning. Ghosts and exogenous shop draws were
checked for pairing.

| Version | Wins | Losses | Draws | Win rate | Match score |
|---|---:|---:|---:|---:|---:|
| Original supplied version | 77 | 17 | 6 | 77% | 0.800 |
| Complete updated version | 79 | 16 | 5 | 79% | 0.815 |

Three paired outcomes improved, none worsened, and 97 were unchanged. Neither arm made an
illegal action or ended a fillable short-board shop. The score difference is **+0.015**, with
seed-clustered 95% interval **[−0.0266, +0.0566]**. This sample shows a small local improvement,
not a statistically established or rated-queue gain. Finite search budgets depend on measured
CPU cost; results are local measurements rather than a guarantee of identical wall-clock
budget decisions on every machine.

The complete offline suite has **233 passing tests, zero failures**. Detailed outcomes and
source hashes are in the [verification evidence](results/live-fixes-2026-09-21/README.md).
