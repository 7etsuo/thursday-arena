# HISTORY — what happened, what was measured, and why the code looks like this

Written 2026-09-19/20. This is a dated account of the rewrite and its first live run, not a live
status report. The figures and rating advice below refer to those runs, before Season 3. For
current rules and evidence limits, see [Season 3 notes](SEASON3.md). For current commands and
implementation, see [AGENTS.md](../AGENTS.md); for the underlying measurements, see
[the strategy audit](STRATEGY.md) and [audit reports](audit/).

---

## 1. The first bot (2026-09-17 → 2026-09-19 07:28Z)

An earlier AI built a bot that played ~4,000 rated matches. Its design: score each shop offer with a
stack of hand-written heuristics — archetype labels for the opponent, name ban/prefer lists, "recipes"
of three named bots to assemble, a front-survival threat formula, a "hot" list of past winning boards.

**Its results.** 2,905 W / 761 L / 322 D, and a **net loss of about 640 Elo**. It peaked at rank 2
(~1,450), fell to rank ~2,450 (~830), and after the Season 2 reset dropped from 1,000 to 726 in 28
minutes. The version running when it stopped won about 7% of its matches.

**How that happened**, from the audit of its own logs:

- The recipe planner needed three specific bots. A given common appears in the round-0 offers 8% of
  the time, so it rerolled hunting for them. Two rerolls at round 0 cost 2 of the 10 gold, leaving 8
  for three units that cost 9 — **a short board, in 632 of 632 cases**. A 2-unit round-0 board won
  18.5% of its rounds; a 3-unit board won 64.1%. It completed its recipe in 21 of 629 attempts.
- Its rules were fitted to noise. One archetype's entire plan came from a 1-13 record that was a
  single opponent. Its refuse lists were fitted on the 771 worst matches, with draws counted as
  losses and thresholds as low as n=10.
- It misdiagnosed its own collapse. Win rate fell from ~93% to ~69% at 04:00Z because the opponent
  pool got stronger (implied expected score 0.84 → 0.50), not because of code. Every "fix" that
  followed chased that noise and made things worse.
- It never modelled the game. No battle simulation at all — its front-survival estimate matched the
  real enemy attack 74% of the time.

---

## 2. The audit (2026-09-19)

Seven parallel analyses of the code, the logs and the game itself, each with an adversarial verifier
re-running the numbers. 158 findings survived verification; none were refuted outright, 58 had their
numbers corrected. The reports are in [docs/audit/](audit/).

The decisive discovery: **the game's battle engine could be reconstructed exactly.** The site ships
only its practice-mode engine, but the rated kits were recoverable from ~192,000 battle captions in
the bot's own logs. The reconstruction replayed 10,065 recorded battles frame for frame, including
299 battles between other players. Battles are fully deterministic — the seed is fixed per round.

That turned every strategy question into arithmetic. Things the old bot believed, all wrong:

| it believed | actually |
|---|---|
| potato is a permanent +1/+1 | +2 ATK for one battle, and it **destroys honey** (1,141 feeds, 0 permanent changes, 74 honey wiped) |
| honey is +2 HP | a 1/1 Drone summoned when the unit faints; best on the **back** unit, not the front |
| mosquito hits the enemy front | hits a **random** enemy (front in 501 of 3,279 cases) |
| hype must not go in front | hype buffs the front-most friend **including itself** |
| guard is a front kit | guard, dodo, cover and patch buff the friend *ahead* — they do nothing at index 0. The bot put guard in front 46% of the time. |
| first to 2 round wins | at most **3 rounds**; drawn rounds are consumed; 1-1 and 0-0 are drawn matches |
| one food per shop | a reroll re-rolls the food too |
| buys go to the front | buys **append to the end** — so its sell/feed/move indices hit the wrong units |

Its seat order was the best available only 31% of the time. Re-seating the same units, with no other
change, was worth +0.07 per round.

---

## 3. The rewrite

Built to a [contract](audit/rewrite_contract.md) by parallel agents, then reviewed by three
adversarial reviewers (28 findings, 27 fixed) and a second pair on the live path (11 more).

Deleted: the archetype system, all name lists, the recipe planner, the threat formulas, the hot list,
the rematch-refusal machinery, five parallel data stores, ~6,000 lines. Replaced with: the simulator,
a pure shop model, the opponent book, and one planner that does nothing but ask the simulator.

Measured before it ever played: replaying the old bot's own 9,020 recorded shops against the enemies
it actually faced, with a leak-free book, the new planner scored **0.95** where the old bot scored
**0.71**.

Serious bugs the reviewers caught before they could cost anything:

- A result screen was counted as a played game *every time it was observed* — so every climb batch
  after the first recorded a phantom win, and `--games 15` played 14.
- Ctrl-C didn't stop the climb: the loop exited 130, bash read that as "handled", and the script
  launched another rated batch.
- `play_session.js` skipped the pid lock, so it could run alongside a climb and fight over the shop.
- An unreadable response read as `idle`, which answers with `start` — abandoning a live match.
- No request timeout: one stalled fetch would hang the loop forever holding the lock.

---

## 4. The browser incident (2026-09-19, before the first live run)

While trying to drive the game, Playwright was pointed at the user's **real Chrome profile**.
Playwright launches Chrome with `--use-mock-keychain`; Chrome could not decrypt that profile's
cookies, treated them as corrupt, and securely wiped them. The user was logged out of every site.
Recovery was attempted and is impossible: the freed database pages are zero-filled (Chrome uses
secure delete), no backup copy exists on the machine, and Chrome Sync does not sync cookies.

Saved passwords, history, bookmarks and the other Chrome profiles were unaffected.

`lib/cdp.js` now refuses `~/.config/google-chrome` outright. The bot uses its own profile, which must
be signed in once, manually, in a plain Chrome window — an automated browser is blocked by Google's
sign-in checks.

Related constraint, learned the same day: **Chrome 136+ silently refuses any debugging channel (port
or pipe) on the default profile.** It does not error; it starts, connects, and hangs. Automating the
user's everyday browser is not possible, full stop.

---

## 5. First live run (2026-09-19, 17:34–19:16Z)

474 logged results. Against real ghosts: **267 W / 8 L / 5 D, +883 in summed logged Elo deltas**,
per-round 0.87 / 0.94 / 0.83. The leaderboard showed rating 685 at 17:34Z,
**1,486 and rank #1** at 18:12Z, and **1,542 and rank #1** at the final 19:15Z check. The
leaderboard's 857-point change differs from the summed event deltas by 26; these are separate
measurements. The other 194 results were AI fills with no ghost and no Elo. The source is the
preserved `scratchpad/live/data/log/2026-09-19.jsonl` and `scratchpad/live/data/log/climb/climb.log`.

The preserved live log contains 1,410 Season 2 battle records. Reviewing the new frames led to
five engine corrections, all now pinned in tests:

- `route` (Master) buffs friends only, never itself.
- `caffeinate` (Apple Dev) clamps to 1 HP **inside** the hit, announced before the enemy's knock-out.
- A **0-damage hit still fires hurt kits** — newly relevant now that `reach_check` and `red_flag` can
  flag an attacker down to 0 ATK.
- `recall` with 0 ATK does nothing, silently.
- A new legendary bot, **DeckLens** (`red_flag`: strongest enemy −3 ATK, cost 7) — the first
  `legendary` rarity.

The current `npm test` corpus check confirms **10,748/10,748 recorded winners**. It also compares
two recorded battles frame by frame. The full 10,748-row corpus does not contain frames, so that
test does not establish frame-exact replay across the whole corpus.

---

## 6. The match-level and two-step pass (2026-09-20)

Two upgrades were compared with the previous objective using the same starting seeds, 1,000
matches per season, across eight configurations. The mock at the time used one sequential random
stream for ghosts, shops, food and rerolls. Different actions could change later draws, so these
were **not paired matches with guaranteed identical opponents and shops**. The current mock keys
those draws by match and shop roll; see `docs/RECENT_RECORDS_2026-09-20.md` for the newer test.

| configuration | Season 1 | Season 2 |
|---|---|---|
| previous objective (one round, one step) | 0.901 | 0.885 |
| two-step search only | 0.909 | 0.885 |
| round-0 match-level, full trust + two-step | 0.916 | 0.893 |
| **round-0 match-level, 50% trust + two-step (shipped)** | **0.916** | **0.899** |

Full-strength match-level valuation at round 1 was also tested: it gives back at round 1 what it
gains at round 0 (S1 0.898 vs 0.897 baseline) and is **off by default**. The knobs remain
(`ctx.matchRounds`, `ctx.futureBlend`) so the experiment can be repeated.

The reported score difference was about +0.015 per season. On that seed set, the Season 2 runs
ended with 75 losses under the shipped objective and 93 under the previous objective. Because the
draws were not truly paired, this is a historical mock comparison rather than proof of a +0.015
gain against identical matches. An earlier 320-match pilot on a different seed set favored the
previous objective; the later 1,000-match run used the 20 seeds recorded in the original task logs.
The later [paired version benchmark](VERSION_BENCHMARK_2026-09-20.md) reran those seeds against
the corrected mock and compared the backup code with the current code directly.

---

## 7. What constrained rating in that run

Two factors visible in the 2026-09-19 results:

1. **Elo at the top.** At ~1,540 against a ~1,100 pool, a win pays about +2.4 and a loss about −29.6.
   One loss undoes twelve wins. The settling point for a 0.96 score rate against that pool is roughly
   1,650, approached ever more slowly.
2. **Ghost availability.** The AI streaks are the matchmaker having nobody to serve. Nothing
   client-side changes that.

`CLIMB_TOP_N=1 npm run climb` stops when the rank check reports #1. The run did not show rating
decay during idle periods, though the Season 2 reset shows that rating is not permanent. Two losses
in ten matches are a reason to inspect the recent opponents, not proof that the pool changed.
