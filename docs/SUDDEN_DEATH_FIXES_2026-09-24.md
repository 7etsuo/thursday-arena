# Sudden-death and persistence fixes — September 24, 2026

This update addresses the repeated stopping reported with
`thursday-arena-all-logs-20260924-133808.tgz`. It also corrects two combat discrepancies
found in that archive. It preserves the existing opponent book, logs and configuration.
No rated matches were played during development and no live user memory was reset.

## What failed

The game added a fourth shop and fight for series tied after three rounds. The deployed
bot could acknowledge that round and record its opponent, but the outgoing-observation
validator still accepted only round indices 0–2. The saved book then failed subsequent
validation, producing `Invalid opponent book … outgoing observations`; restarting reused
the same rejected file. This was a reproducible compatibility and persistence failure.

The recorded fourth shop also had an empty opponent target and ended with all ten tokens
unspent. Four-round public defensive replays were rejected. These were separate gaps in
the same three-round assumption. One earlier termination was a SIGTERM; the available
logs do not establish who sent it, and this update does not claim to fix external stops.

The archive was truncated. Its complete recovered records are usable evidence; missing
tail data cannot establish what happened after the available logs end.

## Current protocol

The [official rules](https://thursdayarena.com/rules.md) and
[season endpoint](https://thursdayarena.com/api/season) were checked on September 24.
The latter returned `{"number":4,"suddenDeath":true}`. The format is:

1. End the match when a side reaches two round-wins.
2. After the third fight, end an unequal series in favor of the higher score.
3. An even series opens one more shop and fight against the same rival.
4. A non-drawn fourth fight decides the match. Otherwise compare cumulative surviving
   HP from the final frame of **every** fight, then cumulative ATK, then draw.

Only living bots contribute to those totals. They are battle-end values, including
summons and temporary combat effects, rather than shop-board stats. No third relic is
drafted; the third fight's revealed relics remain valid in the fourth shop.

| Field | Meaning |
|---|---|
| `phase.round: 3` | Fourth shop/fight; the first round has index 0 |
| `toSuddenDeath: true` | The series entered the fourth round |
| `kept` | Cumulative `{you:{hp,atk},them:{hp,atk}}`, updated by `battleDone` |
| `suddenDeath` | Final `winner`, `decider` (`fight`, `hp`, `atk`, `draw`) and `kept` |
| `results` | Raw fight winners, including a raw fourth-fight draw |
| `wins` | Round totals including the adjudicated fourth-round winner |

The fourth fight uses seed **404**. A targeted official anonymous practice fight with
three random-target abilities reproduced every frame at 404; seeds 0, 101, 202, 303
and 505 differed. The old undefined fourth seed silently became zero, which happened
to reproduce the supplied fourth fight because its trace did not distinguish the seeds.

The public rated replay
[`9a28c153-a735-4c79-9500-8770f09271c9`](https://thursdayarena.com/api/public/v1/matches/9a28c153-a735-4c79-9500-8770f09271c9)
contains four rounds and the final decision metadata. Targeted practice also verified
each adjudication branch using deliberately supplied test states. Ordinary anonymous
practice returned a result after a tied third fight in a separate probe, despite the
season flag. Those synthetic probes establish reducer behavior, not automatic
extension in the anonymous endpoint or a rated win-rate estimate.

## Implemented corrections

### Memory and continued operation

- Accept round indices 0–3 consistently in recording, outgoing samples, reload and import.
- Validate an outgoing sample before appending it and validate serialized book contents
  before atomically replacing a previous saved file.
- Preserve observations, receipts and pending writes. A book rejected solely for containing
  a fourth-round observation now opens directly; deleting learning is unnecessary.
- Accept complete four-round public defensive replays, check their final adjudication,
  and preserve cumulative totals in the defender's perspective for planning.
- Continue across a fourth-round result into later matches and survive a driver restart
  with all four rounds saved exactly once.

### Planning and protocol

- Read the season's format flag and recognize an already active fourth round even if a
  feature lookup is stale. Preserve explicit historical format selection in evaluators.
- Extend match values, captain/relic continuations and eligible Freezer decisions through
  a possible fourth shop. Only an even three-round series reaches that branch.
- Score fourth-round draws using known cumulative HP/ATK, including defensive contexts.
  Future survival comparisons remain neutral when intervening fight outcomes are unknown.
- Use prior third-round opponent boards when no fourth-round observation exists, with
  explicit source-round metadata. True fourth-round observations supersede that fallback.
  A just-observed third-fight board can provide an additional fallback; frame-inferred
  equipment remains incomplete and is described as such.
- Retain the already known two opponent relics in the fourth shop. Do not revive stale
  one-relic overrides for the third shop.
- Keep purchase valuation and final seating on the same projected match objective, including optional carry forecasts and earlier-season compatibility controls.
- Accept round 3 in MCP planning, simulation and book inspection. Result telemetry records
  the authoritative sudden-death decision as well as the displayed score.

The fallback board is a prior, not a claim that the rival cannot improve its team. Sampled
future shops, limited search and unknown rival choices still constrain planning accuracy.

### Combat

Two new live discrepancies are fixed:

- **Copy-across:** reads the actual unit in the corresponding seat; Taunt does not redirect
  copying that unit's ability.
- **Reboot:** clears vulnerability carried by the first life, alongside the existing
  poison reset.

The complete afternoon fixture contains **388 fights**, all matching both winners and
every frame, including the recorded fourth round and both affected mechanics. Two
unfinished enemy boards were excluded from that complete-input fixture because their
equipment was unavailable.

## Verification and limits

The regression suite covers:

- The confirmed 404 seed and official HP/ATK/fight/draw protocol responses.
- Every deterministic four-fight outcome sequence through match-value calculation.
- The recorded fourth shop choosing a legal improvement instead of passing with ten tokens.
- Book save/reopen/import and public defensive replay handling for fourth rounds.
- Modern mock behavior across Seasons 1–4 and preservation of the historical default.
- Three four-round matches using the real driver, planner and simulator across a restart:
  12 battle observations saved once, fourth-shop purchases, no illegal actions or errors.

The mock lifecycle test controls the first three shops to guarantee draws. Its fourth
shop uses ordinary sampled offers and the real planner. It verifies continued operation,
not playing strength. `mock.create({suddenDeath:true})` enables the modern format;
historical benchmarks retain three rounds by default. A missing fourth ghost snapshot
falls back to its third board/relics and is reported in `stats.ghostFallbacks`.

All earlier corpus gates remain required. The earlier September 24 fixture retains
1,190 matching winners and 1,188 exact traces. Its two old tied-knockout-order
discrepancies remain documented and have matching winners. Two separate older
incomplete-input public traces also remain unresolved. The new 388 exact fights do
not establish exhaustive engine correctness or eliminate those historical limits.

Final suite, installation and paired-run outputs are recorded in
[`results/sudden-death-fixes-2026-09-24/`](results/sudden-death-fixes-2026-09-24/).
These compatibility fixes do not by themselves prove an improved rated win rate, optimal
play, or that rating can never decline. Previous three-round comparison results are
retained as dated evidence and must not be represented as four-round measurements.

### Completed verification matrix

The comparison baseline is commit `2b58f5c7c7719784071471b31ca3d2e212a4fff5`;
the current arm is the reviewed working tree. The completed checks were:

- The full Node 25.9.0 regression suite passed **299/299**, with no failures, in a clean staged installation after `npm ci`. All 112 runtime, test and data checksum entries passed.
- Twenty paired legacy-format games per season produced identical baseline/current
  outcomes: S1 15W/3L/2D, S2 15W/3L/2D, S3 15W/4L/1D and S4 18W/1L/1D.
  All 80 pairs had zero illegal actions and zero fillable short shops.
- Twenty current-only Season 4 mock matches with modern rules completed 19W/1L/0D,
  with 44 battle and book records and no illegal actions. None naturally reached the
  fourth round.
- A separate controlled driver test forced three complete four-round matches across a
  restart. It saved all 12 battle/book observations exactly once, used nonempty
  fourth-round targets, spent tokens on legal fourth-shop improvements and emitted no
  errors or illegal actions.
- Three official anonymous practice matches each finished 2–0 and passed 27 protocol
  checks and six battle checks without a rate limit. Anonymous practice does not affect
  rating, and these three matches did not reach a fourth round.

The paired runs deliberately retain legacy three-round rules, so they establish historical
compatibility rather than modern sudden-death performance. The modern smoke checks
ordinary operation, while the controlled driver test covers the fourth-round branch that
ordinary samples did not reach. The 19W/1L mock result and three anonymous AI wins are
not rated strength estimates. Commands, exact scores, output links and further limits are
in the [final verification record](results/sudden-death-fixes-2026-09-24/verification.md).

## Opponent-model research

The investigation also considered keeping a small share of older known lineups instead
of putting the named opponent's entire share on its latest board. Forecast calibration
improved in chronological experiments, but the newer holdout's fixed-board seating
choices became worse overall. Giving the latest board 90% of its component's weight
and the next two older boards the remaining 10% reduced
false-certain losses from nine to four while producing one improved and three worsened
seating outcomes, with seven changed orders having the same outcome. This did not
justify changing the production policy. Forecast improvements alone are insufficient
evidence of stronger decisions. See the
[research report](results/sudden-death-fixes-2026-09-24/opponent-uncertainty-report.md)
and [numeric summary](results/sudden-death-fixes-2026-09-24/opponent-uncertainty-summary.json).

The production opponent policy remains unchanged by that experiment. Rating also
depends on opponent strength, Elo payouts and losses while defending offline; a series
of attack wins does not guarantee increasing rating.

## Installation

Repository: [7etsuo/thursday-arena](https://github.com/7etsuo/thursday-arena), **public**
at the user's request.

Release: [`sudden-death-fixed-20260924`](https://github.com/7etsuo/thursday-arena/releases/tag/sudden-death-fixed-20260924).
Package: `thursday-arena-sudden-death-fixed-20260924.tgz`.

Use the reviewed release package and [installation instructions](INSTALL_SEASON4.txt)
on the bot's own computer. Back up the complete installation and preserve **all of
`memory/`, all logs, prior corpus files, local configuration, launch configuration and
the dedicated Chrome profile**. Do not replace current learning with Git snapshots or
reset/rebuild/bootstrap the book. No remote code editing is required.

On Node 25, run `npm ci`, `npm test` and:

```sh
sha256sum -c docs/results/sudden-death-fixes-2026-09-24/runtime-sha256.txt
```

Compare preserved memory/log hashes with the pre-install copies. Stop and report an
exact verification error if anything fails. Keep rated play stopped after installation
until the user instructs the remote bot to resume it.
