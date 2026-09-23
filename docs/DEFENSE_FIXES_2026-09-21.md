# Defensive learning, battle corrections and continuous play — September 21, 2026

The later [afternoon review](COUNTER_RESEARCH_2026-09-21.md) adds 1,358 complete-input battles
and refines several interactions below, including Hotfix on an immediate copied start effect.

Implemented locally after the [1,150-match audit](LOG_REVIEW_2026-09-21.md). No rated games were
played and no remote installation was changed. Local `memory/book.json` is byte-for-byte unchanged.
The pre-change backup is `thursday-arena-before-defense-fixes-20260921-095355.tgz`; its SHA-256 is
`7c6100a8c5c1712e736ddd99c867755d7f56e26d87153d61f3b4b59ece7a85d5`.

## Changes

### Battle simulation

The newly supplied complete-input battles improve from **2,745/2,751 correct winners and
2,686/2,751 exact traces to 2,751/2,751 for both**. The earlier 337 fights still match completely.
Corrections cover:

- Hotfix modifies direct ability damage and positive stats, not venom or vulnerability stacks.
- The original fix left an immediately copied start effect unmodified; the later afternoon
  records establish that it uses the source holder's Hotfix. Subsequent triggers and Encore
  repetitions use the copier's Hotfix. See the later review for the corrected implementation.
- First-strike retaliation includes splash. Splash damage does not apply the attacker's venom.
- S3 knockout credit follows faint reactions, aura removal and attack venom.
- Last-standing effects occur before follower reactions, including at the end of a fight.
- Kit periodic effects precede Cold brew's item pass.
- Seeded hurt ordering handles a double hit whose first hit is shielded correctly.
- Self-shields, solo Medic, boosted back-target attacks, alerts and zero-ATK steals use the
  observed server captions. All-legacy unequipped fights retain the legacy Bulk caption.

The code uses rules and effects, with no match IDs or card-name exceptions. New fixtures retain
all complete input boards, actual items, logged seats/captains and every server frame. Defensive
public replays are a separate diagnostic because their seat/captain metadata must be inferred.

### Continuous play

`--games 0` has no lifetime iteration limit. The 4,000-step safety limit now applies between
counted completed matches, and resets after each one. Unknown phases, stalled state, explicit
`maxSteps`, AI streak limits, safe lifecycle actions and signal handling remain guarded.
A changing version number alone cannot reset the per-match limit.

This fixes the observed healthy-session stop at 584 games. Stopping the bot deliberately can
still leave its saved boards available for attack; the client cannot prevent that server behavior.

### Learning and rating reporting

`lib/public_history.js` polls the signed-in account's Season 3 public match history at startup
and match boundaries, at most once per minute. It reads at most two pages and twelve defensive
replays per poll, with a 12-second scheduling budget and five-second request timeouts. A running
request may finish after the scheduling budget. No rated actions are sent by this component.

- Up to 30 days of history are backfilled through a persistent pagination cursor. New results
  are fetched from the head after that scan completes. History includes attacks and defenses.
- Both won and lost defenses teach the exact attacker boards and equipment. Played timestamps
  preserve chronological recency, even when older pages arrive after newer ones.
- Learned boards and idempotency receipts are committed together in `memory/book.json`, before
  `memory/public_history.json` marks a replay learned. A restart or failed history write cannot
  double-count the same defensive round. Failed replays remain pending with backoff.
- IDs, account roles, season, timestamps, rated status and outcomes are checked. Malformed local
  history or a different account is reported, never replaced silently.
- Every learned defensive board is written to ordinary JSONL telemetry with its observation ID,
  actual played time and source. Subsequent log-only exports retain this learning evidence.
- History failures are logged and retried while play continues. Anonymous practice never polls
  account history. The ledger refreshes only while the bot runs.

Run `node tools/rating_report.js` to read the cached ledger, or provide a history file and an ISO
start timestamp as positional arguments. It reports attack, defense and combined rating movement
for the same fetched window, plus per-opponent totals, pending replays and backfill status.
These public-history totals are separate from the current process's played-match counters.

The real-record test imports all **129 defenses / 330 rounds** once across pagination and process
restarts. It reconciles 1,151 attacks (+955 Elo) and 129 defenses (−1,211 Elo), combined **−256**,
for the archived window ending 2026-09-21 15:08:29 UTC. This is a historical ledger, not the current
rating. The ordinary book still retains only five distinct boards per opponent/round; receipts
retain import identity independently of board eviction.

This learns opponent boards. It does not retrain scoring weights or rewrite strategy after losses.

### Saved-board decisions

Among seat orders with equal full-target current-match score, S3 now prefers the better simulated
defense against the last 24 usable defensive rounds, then the better ordinary round score.
The opponent is simulated as the attacker and our board as the ghost. Their observed seats and
combat captain are used; the active opponent's captain is not substituted into defensive fights.

Only a uniquely reconstructed active seat assignment enters that defensive target. In the 330
recorded defensive rounds, 326 have unique assignments and four are ambiguous. All 330 boards
can enter general opponent learning. Unknown economic captains are never invented.

At R2 only, when the ordinary search would stop, a bounded pass checks exact legal single moves
(including sell/buy pairs) for the same ordered objectives. It cannot reduce the full-target match
score. Uncertain shop-trigger outcomes stay with the existing stochastic search. Earlier rounds
get seating tie-breaking; this patch does not add speculative early spending for defense.
`finishTies: false` disables the finishing policy for comparisons.

## Verification and measured performance

| Check | Result |
|---|---|
| Offline suite | 247 passed, zero failed |
| Complete-input S3 replays | 3,088/3,088 winners and every frame |
| Historical S1/S2 corpus | 10,748/10,748 winners |
| Complete historical archive | 7,121/7,121 winners and every frame |
| Unlimited lifecycle test | 900 completed mock matches, over 4,000 iterations, zero illegal actions |
| Public defensive learning | 129 matches, 330 round receipts, no duplicate imports |
| Official anonymous practice | 2 matches won 2–0; 22 shop checks, 4 exact battle traces; no rate limits |

The lifecycle test uses a simple filling policy to isolate the driver. It is not a strategy win-rate
benchmark. The historical archive check uses the pre-S3 archive tree. Raw S3 telemetry can omit
enemy equipment and is not a substitute for the complete-input fixtures enriched from public replays.

### Paired whole-match comparison

Each arm played 100 games per season: ten matches for each seed
`101,103,107,109,113,127,131,137,139,149`, an empty initial book, identical exogenous mock draws,
and an unlimited planning budget. The old arm loads the exact pre-change application; both arms
play the current mock rules.

| Season | Before W / L / D | Updated W / L / D |
|---|---|---|
| 1 | 73 / 17 / 10 | 73 / 17 / 10 |
| 2 | 60 / 29 / 11 | 60 / 29 / 11 |
| 3 | 67 / 27 / 6 | 67 / 27 / 6 |

Every paired match score tied; both arms made zero illegal actions and ended no fillable short
shops. This sample establishes **no win-rate gain**. The mock does not generate incoming public
defenses, so defensive ingestion is covered separately by real-record and driver integration tests.
S3 mock item economics and captain offers remain approximations.

### Chronological shop counterfactual

The finishing policy was checked on all 2,751 recorded completed shops. Its defensive training
uses only matches played at least 60 seconds before the shop; 2,098 shops have prior defensive
evidence. It makes additional purchases in 17 final shops and never lowers the full-target match
score. Against the actual subsequently faced attacker-side opponent, two round scores improve
and none worsen (total round-score points 2,144.5 → 2,145.5).

For 321 later defensive rounds whose original saved board can be matched to a recorded shop,
the counterfactual score is **unchanged: 112 → 112**. These rounds come from 182 source shop
rounds, with repeated attacks on the same boards. This is neither an independent 321-game
sample nor a rated win-rate estimate. Incoming opponents are held fixed; learning could alter
subsequent shopping in live play, which this final-shop comparison does not measure.

The run-limit fix and defensive learning/reporting faults are verified. A defensive win-rate
improvement has **not** been demonstrated, and this package does not promise optimal play.

## Reproduction and installation

Evidence, logs and per-match comparisons are in
[`results/defense-fixes-2026-09-21`](results/defense-fixes-2026-09-21/README.md).
The original supplied records remain in the [audit evidence](results/log-review-2026-09-21/evidence.tgz).
Use [the installation-only instructions](INSTALL_PROMPT.txt) on the bot's own computer. Preserve
the entire live memory directory, logs, configuration and browser profile. No remote path is assumed.
