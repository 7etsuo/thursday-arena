# Thursday Arena — action schemas and engine rules

The [Season 4 notes](../docs/SEASON4.md) describe current additions. The older
[`ENGINE_SHOP`](../docs/ENGINE_SHOP.md) and [`ENGINE_BATTLE`](../docs/ENGINE_BATTLE.md) audits
document Seasons 1 and 2. Server-supplied offer prices and state fields take precedence over
historical estimates.

## Transport

```
GET  /api/arena                          -> envelope {state, version, ...}
POST /api/arena  {action, version}       -> new envelope
```

`version` is optimistic concurrency. Send the `version` from the last envelope you saw.

**HTTP 409 means the action did NOT happen.** It is a lost race, not a success. Refetch and replan.
`lib/arena.js` returns `{conflict: true, ...freshEnvelope}` for this; treating the 409 body as an
applied action is what silently dropped 31 logged actions before the rewrite
(`docs/ENGINE_SHOP.md` ENGS-16).

`429` and `5xx` are retried with exponential backoff and jitter, then raised as a typed
`ArenaError` (`code`: `rate_limited | server_error | transport | http_error | bad_action`).
An explicit `Retry-After` is a minimum wait; jitter and the exponential-backoff cap do not shorten
it. Other `4xx` responses, apart from 409 and 429, are never retried.

## Phases

`state.phase.kind` is one of `idle | shop | battle | result`, and `state.phase.round` is
**0-based** (R0, R1, R2).

| phase | what is legal |
|---|---|
| `idle` | `start` |
| `shop` | `pickCaptain` / `pickRelic` while the respective draft is pending, then `fuse` `buy` `sell` `reroll` `feed` `freeze` `equip` `freezeItem` `move` `endShop` |
| `battle` | `battleDone` |
| `result` | `restart` (or `start`) |

## Actions

| type | fields | cost | effect |
|---|---|---|---|
| `pickCaptain` | `captain` (offered id) | 0 | Season 3 captain draft, before shopping. |
| `pickRelic` | `relic` (offered id) | 0 | S4 relic draft, before shopping after the first two fights. |
| `fuse` | `boardIndex`, `withIndex` (different occupied indices) | 0 | Combines two unfused parents; first parent retains its item/food. |
| `buy` | `shopIndex` 0..2 | offered rarity price | **Appends** the bot to the END of the board. Reordering needs extra `move`s. A team can have only one mythic bot. |
| `sell` | `boardIndex` | **+1 gold** | Removes the unit; later indices shift down. Loyalty card instead refunds the rarity price. |
| `reroll` | — | server reroll cost; Scout/Fresh stock can make it free | Replaces every **unfrozen** offer and item offer, and re-rolls the food. |
| `feed` | `boardIndex` | 3, or 2 with Chef | Applies `state.shop.food` to that unit and consumes the food. |
| `freeze` | `shopIndex` 0..2 | 0 | Toggles `frozen` on an offer. |
| `equip` | `boardIndex` | `state.shop.item.cost` | Equips the offered item on that bot, replacing an existing item. |
| `freezeItem` | — | 0 | Toggles `state.shop.item.frozen`. |
| `move` | `boardIndex`, `dir` ±1 | 0 | Swaps with the adjacent unit. |
| `endShop` | — | 0 | Ends the shop and fights. |
| `battleDone` | — | 0 | Advances past the battle playback. |
| `start` | — | — | Begins / resumes a match. |
| `restart` | — | — | "Play again" from the result screen. |

Board max is 3; seat 0 is the front; the **back is the LAST index**, so a 2-unit board's back is
index 1 (`docs/ENGINE_BATTLE.md`).

### Prices

Rarity fixes both the price and the unlock round — they are not independent.

| rarity | cost | unlockTurn | first offered |
|---|---|---|---|
| common | 3 | 1 | R0 |
| uncommon | 4 | 2 | R1 |
| rare | 5 | 3 | R2 |
| epic | 6 | 3 | R2 |
| legendary | 7 | 3 | R2 |
| mythic | 8 | 3 | R2 |

Legendary is available from Season 2 and mythic from Season 3. Mythic offers have one-quarter
the per-bot ordinary offer weight and teams are limited to one mythic. The public catalog
currently contains 279 bots across four seasons. Bulk order discounts bot offers by one. The observed
server offer price takes precedence over the table; `cost = offer.cost` equalled the rarity
price in all 50,495 offers in the historical Season 1/2 audit.

### Food

| food | effect |
|---|---|
| `apple` | **Permanent** +1/+1, or +2/+2 with Grocer. Does not touch honey. |
| `honey` | A flag. On faint, a 1/1 **Drone** is inserted at the fainted unit's seat (only while that side has fewer than 3 units). Adds **no HP** to the unit itself. Clears potato and its +2 tempAtk. |
| `potato` | **+2 ATK for this battle only** (`tempAtk`), cleared at `battleDone`. **Removes honey.** |

Re-feed limits (`alreadyHasBoost`): no second honey on a honeyed unit, no second potato on a
potatoed unit in the same round. Apple is always allowed.

Food odds per shop (observed in the historical Season 1/2 data; Season 3 odds unverified):

| round | apple | honey | potato |
|---|---|---|---|
| R0 | 50% | 50% | 0 |
| R1–R2 | 33% | 50% | 17% |

A reroll re-rolls the food independently, so "one food per shop" was never an engine rule.

### Offer pool

The shop model draws bots with `unlockTurn <= round + 1`, **with replacement**. Early access
advances this threshold by one shop.
The original logs found duplicates in 8.4% of R0 shops (8.2% expected from the launch pool).
Historical catalog pool sizes are S1 **36 / 56 / 72** and S2 **38 / 61 / 81** for R0 / R1 / R2.
Ordinary bots have normal per-bot weight, legendary bots half, and mythics a quarter, per the
[official rules](https://thursdayarena.com/rules.md).

Frozen bot and item offers persist through rerolls **and into later rounds**. The item catalog
currently lists 27 items; the shop shows one item offer in addition to three bot offers. A common
item costing 2 was observed in official practice. **Prices for other item rarities and their draw
odds are not published**. `test/mock_arena.js` uses approximations for those values, while the
live bot uses the server's offered item `cost`.

### Economy

The baseline is **10 tokens per shop**. Banker carries up to 5 unspent tokens to the next shop;
Recruiter adds one token to each shop; Scout's first reroll each shop is free; Chef makes food
cost 2. Without a captain modifier, three commons cost 9, so at R0 **at most one paid reroll** is
affordable while still fielding three units. The general budget invariant before any reroll is

```
gold - current_reroll_cost >= cheapest_available_common_price * (empty seats)
```

Violating the old fixed-cost version produced short boards in 16.3% of historical R0 fights
(`docs/ENGINE_SHOP.md` ENGS-02). Scout and Recruiter change which opening lines are affordable.
S4 adds Rich income, Realtor empty-seat income, Underdog income after losses, and Bulk order
discounts (common price 2). Server `shopCosts` are authoritative.

## Series

A match is at most 3 rounds (`round` 0..2). It ends at **2 round-wins or after round 2**, and a
**drawn round still consumes a round**. The result compares round wins, so 1-1 and 0-0 are drawn
matches. Observed finals include 1-0 (108), 0-1 (65), 1-1 (310) and 0-0 (12).

Round 2 is therefore always the last shop: unspent gold, freezes and future value are worth 0
there, and the value of a draw depends on the score — at 1-0 a draw wins the match, at 0-1 a draw
loses it.

Elo is standard K=32 and rating-gap dependent, not a fixed +7/−23/−8.

## Season 4 (current as of 2026-09-23)

After each of the first two fights, `relicOffer` supplies three choices. The driver explicitly
selects one with `pickRelic`; `relics` stores owned choices and `rivalRelics` supplies enemy choices.
`fusions` describes the 15 crew recipes. A fused unit retains the first parent's `botId` and adds
`fusedWith` for the second; its battle frames include those parent IDs too. Store both IDs when
learning a replay. A fusion cannot fuse again. See [Season 4 notes](../docs/SEASON4.md) for the
shop, simulator, memory and planning changes and their verification limits.

## Season 3 (live since 2026-09-20)

Season 3 adds crews, captains, mythic bots, and items. The five crew bonuses, six captain effects,
item catalog, and known model limits are listed in [Season 3 notes](../docs/SEASON3.md).
`phase.kind` stays `shop` during the captain selection. A pending `state.captainOffer` requires
`{type: "pickCaptain", captain: "chef"}` (using one offered id) before normal shop actions.
`state.rivalCaptain` identifies the opposing captain. `state.carry`, `state.freeRerolls`, and
`state.shopCosts` expose the economy modifiers; `state.shop.item` exposes the item offer.

Season 3 matchmaking uses an aim based on rating and recent results, and ghost defenses can now
move the defender's rating at K=16 within a 400-point rating gap, or K=32 when both players
are at least 1300. That top table permits 25 repeats in the last 50 matches. See the
[live rules](https://thursdayarena.com/rules.md). Historical Season 1/2 book weights and match
scores do not establish Season 3 performance.

## Season 2 (since 2026-09-19T07:00Z)

`state` carries `seats {front, middle, back}` (all three from round 0) and
`seatShop [{seat, revealed, name, text} × 3]`, which only *reveals* one more rule per round.
**Seat i is active from round i on**, and each rule applies to **both** teams. Rule ids used by the
simulator: `spotlight | pit_stop | warm_up | encore | hot_seat | hard_hat`.
`seatShop` carries display names ("Hard hat"); `shop_model.seatsFrom(state)` maps them to rule ids.

Season 2 launched with 8 bots; DeckLens later brought its historical total to 9.
An unknown `botId` should trigger a catalog refresh
(`arena.getCatalog({refresh: true})`), as the official client does via `shopNeedsCatalogRefresh`.

## `start` and `restart` — what they really do

**"`start` during shop/battle forfeits the match" was never a supported behaviour.** It was a claim
in the old `CLAUDE.md` and `GAME_SYSTEMS.md` with no evidence behind it. The official client sends
`start` (with `version` 0) on **every mount of the match page**, including mid-match reloads, and
sends `restart` from the result screen's "Play again" in both rated and practice. The engine doc's
reading is that `start` **resumes** an existing match (`docs/ENGINE_SHOP.md` ENGS-15) — but that is
labelled **INFERRED**, and the `restart` forfeit is **unverified**.

Because the true semantics are unverified, this bot never sends `start` or `restart` while
`phase.kind` is `shop` or `battle`. `driver/play_loop.js` routes both through `lifecycleAct()`,
which throws instead, and `mcp/server.js` refuses them the same way. Treat that as a safety rule,
not as knowledge about what the server would have done.

`restart` is **not** practice-only — the old `api/ACTIONS.md` and `lib/arena.js` both said
"practice rematch" and both were wrong.

## `endShop`

"Needs at least 1 unit" is imprecise. `endShop` is refused only while the board is empty **and**
something is still affordable. With 0 units and nothing affordable, the fight is allowed and
**forfeits the round**.

## Additional read endpoints

```
GET  /api/me
GET  /api/catalog                         -> merged into data/catalog.json by lib/catalog.js
GET  /api/items                           -> public item catalog
GET  /api/season                          -> {"number":4} as of 2026-09-23
GET  /api/leaderboard
GET  /api/public/v1/matches?x_handle=H&limit=20
GET  /api/public/v1/matches/:id
```

`lib/arena.js` also offers a best-effort read-only `getPublicMatchDetail(id)` for completed replay
details. The public replay contains board items but omits some battle inputs, including the exact
captain and seat metadata needed to validate a Season 3 fight on its own.

### Anonymous practice verification

`tools/verify_live_practice.js` uses `POST /api/arena/practice` with
`{state: <entire previous response.state>, action}` and an `X-Practice-Session` UUID header.
It needs no account. Keep the raw state intact; sending the planner's normalized state loses
protocol fields. Practice rematches use `restart`: `start` returned HTTP 400 in the live check.
The verifier uses isolated local memory/logs and checks its server results against the shop and
battle models. It never calls the rated arena endpoint.

`POST /api/arena/adopt` takes `{state}` — the client state of a **guest practice run** it converts
into an account run. It does not take `{}`, and the rewritten `lib/arena.js` does not implement it.
