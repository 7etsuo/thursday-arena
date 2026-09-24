# Season 4 support — updated September 24, 2026

This build supports Seasons 1–4. The earlier seasons keep their own rules. Season 4 adds
100 cards, eight items, eight captains, five seat rules, 15 fusion recipes and 19 relics.
The bundled catalogs now contain 279 bots and 27 items.

Sources checked on September 23: [official rules](https://thursdayarena.com/rules.md),
[season](https://thursdayarena.com/api/season), [bot catalog](https://thursdayarena.com/api/catalog)
and [item catalog](https://thursdayarena.com/api/items). Implementation details were checked with
anonymous requests to the official practice endpoint. No rated matches were played.

## Actions and state

- Choose a captain before the first shop. After the first and second fights, explicitly choose
  an offered relic before shopping: `{type:"pickRelic", relic:"helmets"}`. The driver never relies
  on the server's automatic first-offer selection.
- Fuse with `{type:"fuse", boardIndex:0, withIndex:1}`. Both parents must be unfused. The first
  parent supplies the item and food marks; permanent attack and health each use the larger parent
  value plus two. Temporary attack is retained from the first parent, not maximized across both.
- A fusion keeps the first `botId` and adds `fusedWith` identifying the other parent. Its display
  name joins both parent names. The simulator resolves the recipe from both crews, counting two
  crew contributions even when both parents have the same crew. Repeated fusion is disallowed.
- `relics`, `rivalRelics` and `relicOffer` are separate state fields. An explicitly empty rival
  relic list overrides historical relics; an unavailable list permits historical metadata.
- New raw seat IDs are `slowBurn`, `buddySystem`, `toolBelt`, `powerCouple`, `quietZone`.
  Normalization also accepts the six older seat rules. The server deals distinct rules.
- Server prices and reroll costs take precedence. This includes a zero item cost, discounted bot
  prices, free rerolls, and nonstandard sell refunds.

`lib/season4.js` contains the new effect definitions and fusion mappings. `lib/shop_model.js`
implements the deterministic shop transitions; `lib/sim.js` implements combat. MCP accepts
fusion parents, both relic lists and all captains, and proposes pending drafts before purchases.
See [action schemas](../api/ACTIONS.md).

## Planning

The planner evaluates candidate boards with the simulator, including both teams' relics,
captains, crews, items and active seats. It considers both ordered versions of every legal
fusion, because retained equipment and food depend on the first parent. Fusion candidates can
be completed with another purchase before scoring, avoiding an automatic penalty for opening
an affordable seat. The live driver observes the actual server state after each accepted action.

Relic selection compares the offered choices through common sampled shop draws and simulated
remaining rounds. It samples two continuations, uses up to eight target boards and eight shop
steps per round, and handles economic relics through shop transitions. Captain drafting uses
sampled continuations too. Underdog income follows sampled fight outcomes. With Freezer, the
planner compares every available freeze mask using two common next-shop draws and simulated
future purchases. Freezes are chosen only before a later shop can use them.

This is bounded search, not exhaustive game solving. Unknown future relic offers are not
searched, future shops are sampled, and later item draw odds/prices remain mock approximations.
The decision deadline is soft: final verification and bounded draft/freeze work can run beyond
it. Current offered prices are always observed directly in live play.

The [September 24 fixes and measurements](LIVE_FIXES_2026-09-24.md) supersede the initial
release where noted below. They correct stale opponent relics, combat interactions,
forecast calibration and defense-metadata refresh.

## Learning and season rollover

The [September 23 adaptation fixes](ADAPTATION_FIXES_2026-09-23.md) apply to both S3 and S4:
recent outgoing opponents determine the population forecast; recent pre-battle errors calibrate
how much to trust the named opponent; defensive observations inform a separate exposure-weighted
objective. Learning does not alter card rules or permanently rewrite the strategy.

Exact learned boards, items, fusion parents, relics and observation IDs are now also written to
book telemetry. A future export of only logs can retain this evidence after book eviction.

Shop `rivalRelics` describes the previous fight. The normalized state tags it with
`rivalRelicsRound`; planning uses each current-round target entry’s relics unless an
observation explicitly belongs to the simulated round. Battle replay uses the exact
revealed relics. Forecasts carry a model version, so obsolete S4 forecast errors no
longer calibrate confidence. Their boards, outcomes and receipts remain stored.
Recent defense metadata is recomputed once per corrected combat model.

Fusion identity and relics survive opponent-book save/reload and participate in board identity
and simulation cache keys. Completed public replay boards are preferred over frame reconstruction.
The fallback removes Alchemist's already-applied opening bonus before storing a fusion, preventing
the next simulation from applying it twice. Missing equipment cannot generally be recovered
from battle frames alone; the fallback retains that limitation.

An S4-empty book can use the bundled fixed public-board prior. It contains 49 public matches
from 12 players, with 238 round-board observations. Only observations earlier than the model
clock are eligible. This prior is not written into user memory and is superseded by available
same-season learned targets. It is a small opening sample, not a population or rating estimate.

The existing memory directory is preserved. Opening an S3 public-history ledger in S4 retains
the complete old ledger in `previousSeasons["3"]` and starts a separate current ledger. A running
driver also reopens its managed history when the season changes. Account mismatches and damaged
files remain errors. Seasons after 4 are refused before further driver game actions.

## Server verification

Automated fixtures from the initial release include:

- **395 complete-input server battles**, comparing every frame and winner. Coverage includes
  all 100 new kits, all 15 fusion recipes, all relics, new captains/items/seats, mixed teams and
  focused uneven-board cases. Two battles came from a stopped diagnostic driver run; the others
  used deliberately constructed practice states.
- **101 shop transitions**, covering every fusion recipe, all new captain and relic choices,
  purchases, food, reroll triggers and next-shop income/frozen offers. Random draws are not
  asserted as deterministic predictions; known transitions and frozen offers are checked.
- **Seven completed real-driver practice games**, checked again offline: 3 wins, 3 losses and
  1 draw, with 17 exact battles. The final four-game run had 42 shop checks, 69 accepted actions
  and zero rate limits. All files were isolated from live memory. Reports are in
  [the result directory](results/season4-2026-09-23/).

The observed server has details that the short card descriptions do not fully specify. For
example, pickpocket and attack-swap target the enemy front if their across seat is empty; ability
copy does not. Alchemist and Bubble appear in the opening frame. New volley effects preserve
board order, while Hype Machine uses the older randomly ordered targeting. “From round” thresholds
use the server's internal round index in the sampled fights. Fixtures preserve these observations
so a later server change can be detected rather than silently assumed.

A separate diagnostic examined **119 public rounds** whose input metadata is incomplete.
Of these, 117 can reproduce the entire trace: 96 uniquely identify active seats and 21 have
multiple equivalent assignments. Two historical traces still differ (one missing faint-keyword
announcement/effect, one tied knockout order); both winners match. Current controlled probes of
the affected faint keyword agree with the simulator. These two historical discrepancies remain
unexplained and are excluded from defensive planning contexts. Reconstructing inputs from the
same frames is diagnostic evidence, not an independent prediction test.

## Strength claims

Compatibility tests establish that the new actions run and sampled mechanics match the server.
They do not establish rated strength. The earlier S3 paired comparisons did not demonstrate a
reliable win-rate gain; their full counts and uncertainty are in the adaptation report. S4 has
an old/new S4 comparison in the [September 24 report](LIVE_FIXES_2026-09-24.md).
The original September 23 release could only be compared with its own learning disabled,
because the earlier release could not play S4 mechanics.
Mock learning controls and anonymous AI practice are useful checks, not estimates of the rated
ladder's win rate or a proof of optimal play.


### Development learning control

During S4 integration, 60 paired mock matches compared the same implementation with a frozen
book against learning enabled (20 matches each under seeds 197, 199 and 211). Frozen: 57 wins,
1 loss, 2 draws; adaptive: 57 wins, 2 losses, 1 draw. Adaptive-minus-frozen match-score difference
was −0.0083, with a seed-clustered 95% interval of −0.1376 to +0.1210. Three pairs improved,
three worsened, and 54 tied. Both arms had zero illegal actions and zero fillable short endings.

This control began before the final uneven-board targeting and frame-fallback corrections.
It is retained as an integration diagnostic, not a final-release win-rate estimate. The fixed
starting prior and mock opponent pool also share the small public sample, making the absolute
95% win rate optimistic. It does not demonstrate that learning improves or harms S4 rated play.
[Paired observations](results/season4-2026-09-23/development-learning-control.csv) and
[full log](results/season4-2026-09-23/development-learning-control.log).
