# Season 3 rules and implementation status

**Latest verification:** the [September 23 fixes](ADAPTATION_FIXES_2026-09-23.md) reproduce all
7,250 battles in the newest supplied log segment, including the 22 previously mismatched frame
traces. The four supplied S3 regression fixtures total 11,696 exact battles. Opponent learning now
uses bounded queue samples and forecast calibration; planning also models future purchases and
recent defensive exposure. See the report for measurements and limits.

**Compatibility:** the live API reported Season 4 on September 23. This document describes Season
3. The current build also supports [Season 4](SEASON4.md), including fusion and relics.

Season 3 was the live season as of 2026-09-20 (`GET /api/season` returns `{"number":3}`). The
[official rules](https://thursdayarena.com/rules.md),
[cards page](https://thursdayarena.com/cards.md),
[bot catalog](https://thursdayarena.com/api/catalog), and
[item catalog](https://thursdayarena.com/api/items) are the current source for game rules and card text.
The Season 1 and 2 audits in this repository remain historical measurements, not Season 3 win-rate
evidence.

## New match and shop rules

- **Captains:** A match begins with three randomly offered captains. `pickCaptain` must be sent
  before shopping, while `phase.kind` is still `shop`. Drill gives the front bot +2 ATK each fight;
  Medic gives the back bot +3 HP; Banker carries up to 5 unspent tokens to the next shop; Scout's
  first reroll each shop is free; Chef reduces food cost from 3 to 2; Recruiter adds 1 token to each
  shop. The opponent's captain is visible from the first fight. The live state uses `captainOffer`,
  `captain`, `rivalCaptain`, `carry`, `freeRerolls`, `shopCosts`, and `captainShop`.
- **Crews:** Every bot has one of Sales, Ops, Marketing, Personal, or Builders. A 2-bot bonus starts
  at the beginning of a fight; 3 matching bots get a stronger bonus. Seat rules fire first, then
  crew bonuses, then kits. Sales: +2 ATK per member at 2, or +3 ATK/+1 HP at 3. Ops: +3 HP per
  member, or +1 ATK/+4 HP. Marketing: 2 damage to each enemy, or 3. Personal: +1/+1 per member,
  or +2/+2. Builders: +2 ATK/+3 HP to the front bot, or +4 ATK/+5 HP.
- **Mythics:** Cost 8, unlock on turn 3 (round index 2), appear at one quarter the per-bot weight
  of ordinary rarities, and only one mythic bot may be on a team. Legendary bots cost 7 and have
  half weight. At the S3 snapshot the public bot catalog contained 179 bots: 72 from Season 1, 9 from
  Season 2, and 98 from Season 3.
- **Items:** Season 3 introduced 19 items, including permanent
  equipment and one-use items. The live shop exposes an item offer separately from its three bot
  offers as `state.shop.item = {item, cost, rarity, frozen}`. `equip` targets a board index and
  replaces that bot's item; `freezeItem` toggles the item offer's freeze flag. The client practice
  reducer clears one-use equipment after its fight. Items have `unlockTurn` in `/api/items`. A common item costing 2 was
  observed in official practice. **The official rules do not publish item price by rarity or
  item offer probabilities**; later item prices and a uniform item draw in `test/mock_arena.js`
  are explicit approximations. Live actions use the offered `cost` from the server.

The older baseline still applies unless a captain changes it: each shop starts with 10 tokens,
buy costs are 3/4/5/6/7/8 by rarity, food costs 3, rerolls cost 1, sell refunds 1, and a board
holds at most three bots. Banker changes carry-over; Scout, Chef, and Recruiter change shop
economics. The old rule that a round-0 full board can afford only one reroll does
not hold for Scout's free reroll or Recruiter's extra token. See [action schemas](../api/ACTIONS.md).

## Rating and opponents

The current [official rules](https://thursdayarena.com/rules.md) say rated matchmaking aims at
the attacker's rating plus 23 points, adjusted by up to 70 points from the last 10 rated results.
The server searches saved same-round boards within 100, 200, then 400 points of that aim, then
any rating; it favors an unfought player and then the closest rating within the first populated
range. Repeat-ghost and high-rating exceptions are described in the official rules. A ghost's
later-round boards come from the same player. The attacker's rated result uses Elo K=32. A ghost
defense can also move the defender's rating at K=16 when the ratings are within 400 points.
When both ratings are at least 1300, Season 3 defense instead uses K=32. Those top-table opponents
can recur in 25 of the last 50 matches before the diversification preference applies. The
Season 1/2 opponent-book weights were fitted under earlier queues and have not been calibrated
for this matchmaking or the Season 3 player pool.

## What the repository can check

`lib/catalog.js` stores the public bot and item catalogs. `lib/shop_model.js` normalizes the new
state fields and models captain, mythic, item, and reroll actions. `lib/sim.js` accepts crews,
items, and captains in Season 3 battle inputs. The MCP `sim_battle` and `plan_shop` tools accept
these inputs and propose the captain draft. The planner selects an offered captain by sampling
shop continuations and simulating their fights, and can equip items or take a second affordable
round-0 reroll with Scout or Recruiter. `test/mock_arena.js` provides an offline Season 3
match path, and `test/season3_live_practice.test.js` checks an official anonymous practice trace.
The older 10,748-winner corpus and 5,454-frame archive establish Season 1/2 regression behavior;
they do not establish full Season 3 simulator accuracy. Public completed replays include board
items, but do not provide every hidden battle input (including exact captain/seat information),
so checks against them must state how those inputs were inferred. The live driver waits until a
Season 3 result, then records the exact completed public replay board with items if the match and
opponent can be matched. It retries an unavailable replay once, then falls back to the frame-inferred
board. Graceful shutdown or a driver error also saves buffered completed rounds once the opponent
handle is known. A forced kill before saving can still lose an unfinished match's buffered evidence.

The checked-in `data/corpus/s3_public_matches.jsonl` has 100 completed public Season 3 matches.
`tools/seed_s3_book.js` extracted both players' round boards and merged a seed into the local
`memory/book.json`: 334 retained observations across 116 Season 3 `(handle, round)` keys. The
seed preserves crew and item data but has no captain or seat metadata because public match
details omit it. The tool writes a **new** book path and refuses to replace an existing file;
`tools/merge_book.js` then merges that copy into the live book. It makes no arena actions.
For installation onto an existing bot, `node tools/bootstrap_s3_book.js` performs that merge
only if the preserved book has no Season 3 observations. An existing Season 3 book is unchanged.

`node tools/verify_s3_public.js` is a read-only diagnostic on those 100 matches and 239 rounds.
After the [code review](CODE_REVIEW_2026-09-20.md), it matches **239/239 winners** and
**237/239 complete frame sequences**. A second, disjoint sample of 100 public matches is saved as
`data/corpus/s3_public_matches_review_2026-09-20.jsonl`: **258/258 winners, 257/258 full traces**.
Both checks infer seat rules and fight captains from the **same replay frames**, searching seat
triplets when captions leave them ambiguous. These are diagnostic replays, **not independent
prediction benchmarks**. Two older traces lack crew effects that the current rules would apply;
the third mismatch is only historical Bulk caption wording. They remain explicit discrepancies.

`node tools/verify_live_practice.js --seed 20260921 --games 2 --budget 1500` runs the actual driver
against the official anonymous practice endpoint, with isolated book and log files. It checks
deterministic shop actions and complete battle traces against the server. Ten completed practice
matches during this review produced **9 wins and 1 loss**; the last two, after all runtime fixes,
were both wins. All **21 recorded battles** replay exactly with the server's actual board, seat
and captain inputs, without inferred metadata. The saved transcripts are offline regression
fixtures. This is a small practice sample, not a rated win-rate estimate or an old/new policy test.

The separate [live records audit](LIVE_RECORDS_2026-09-21.md) analyzes the user's 137 complete
rated Season 3 matches. No additional rated matches were played for the subsequent fixes.
Local mock scores are useful for catching
regressions and comparing policies under its assumptions; they are not a measured rated win rate.
The published 2026-09-20 paired version benchmark measures Seasons 1 and 2 only, and its
no-aggregate-gain result cannot be carried over as a Season 3 estimate.

### Historical paired Season 3 mock comparisons (before the code review)

A 50-pair local comparison on the initial Season 3 implementation used five handle-disjoint folds, five seeds, two
games per seed, a 200 ms planner budget, and books seeded from public replays outside the
evaluated handle fold. The earlier one-round/one-step objective scored **47 W / 3 L (0.940)**;
the current match-level/two-step objective scored **43 W / 4 L / 3 D (0.890)**. The paired
match-score change was **−0.050**, with a seed-clustered 95% interval **[−0.112, +0.012]**;
zero pairs improved, four worsened, and 46 were unchanged. Neither arm made an illegal action or
ended a fillable short-board shop. The [paired outcomes](results/season3-paired-mock-final-2026-09-20.csv)
are saved.

This small test does **not** show a Season 3 win-rate gain, nor does its interval establish that
the current objective is worse. Public replays omit captain and seat inputs, and the mock assumes
item odds and later-round costs that the server has not published. The sampled ghost pool and
captain offers also need not match the rated queue. A 10-pair
[same-policy control](results/season3-same-policy-control-2026-09-20.csv) under the same 200 ms
budget changed one result from a draw to a win despite identical settings. The wall-clock search
limit makes this sample timing-sensitive, so it is screening evidence rather than a stable
version comparison. The longer-budget check below uses fewer pairs.

At the live planner's default **1,500 ms** budget, a smaller 10-pair run gave the earlier
one-round/one-step objective **10 W (1.000)** and the current match-level/two-step objective
**9 W / 1 D (0.950)**. The paired change was **−0.050**, with a seed-clustered 95% interval
**[−0.685, +0.585]**: zero pairs improved, one worsened, and nine were unchanged. A
[same-policy control](results/season3-same-policy-1500ms-2026-09-20.csv) was identical in all
10 pairs; turning off two-step search also left all 10 outcomes unchanged. The
[paired outcomes](results/season3-current-vs-old-1500ms-2026-09-20.csv) and
[two-step ablation](results/season3-two-step-off-1500ms-2026-09-20.csv) are saved. Ten pairs
are too few to establish an objective improvement or deterioration. No tested Season 3 comparison
has demonstrated a win-rate gain for the current objective, and no rated Season 3 performance has
been measured.

A separate **stable-code screening ablation** kept two-step search but turned off the round-0
match-level objective. Across 50 paired mock matches, the current objective scored **44 W / 3 L /
3 D (0.910)** and the ablation **39 W / 7 L / 4 D (0.820)**. The ablation-minus-current paired
change was **−0.090**, with a seed-clustered 95% interval **[−0.192, +0.012]**; zero pairs
improved, seven worsened, and 43 were unchanged. Neither arm made an illegal action or ended a
fillable short-board shop. [Paired outcomes](results/season3-r0-match-off-2026-09-20.csv) are
saved. This favors retaining the round-0 objective in this small mock sample, while the interval
includes zero, the 200 ms search can vary with timing, and the same replay and item-model limits
apply.

## Historical defensive fixes (September 21)

See [the implementation and evidence report](DEFENSE_FIXES_2026-09-21.md). The two complete-input
S3 fixtures now reproduce 3,088/3,088 winners and frames. Public defense history feeds learned
opponent boards into the existing book and supplies recent attackers for simulator-based seating
ties. Extra tie-breaking purchases are restricted to R2 and cannot reduce the full current-target
match score. Unlimited sessions no longer stop after 4,000 lifetime loop iterations.

`node tools/rating_report.js [history-file] [since-ISO-time]` reads the local public ledger.
It reports both roles over the same observed window; `pending` and `backfillPending` expose
incomplete replay learning/history pagination. The ledger refreshes only while the bot runs.
A 100-pair S3 mock comparison tied at 67 W / 27 L / 6 D. Defensive improvement is not established.

## September 23 combat corrections

The newest complete-input replay fixes attack-venom announcement ordering, recursive faint and
last-standing timing, copied start effects, summon Hotfix bonuses, solo Team Badge/Pizza Party
captions and peacock hurt growth. S3 overtime starts at exchange 26: every living unit loses
`exchange - 25` HP directly, before the attacks; the amount increases each exchange. All new
traces and previous regression fixtures pass. The later 40-exchange tiebreak remains separately
implemented; exact replay coverage is evidence for observed cases, not every possible interaction.
