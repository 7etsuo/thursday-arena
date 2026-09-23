# ENGS — Shop, economy, series and catalog rules (reverse-engineered) vs the repo

**Reading this report:** The findings and "Repo" observations below describe the bot audited on
2026-09-19, before the rewrite. They are retained as evidence of the defects that prompted the
rewrite, not as claims about the current implementation. The active shop model is
[`lib/shop_model.js`](../lib/shop_model.js). This document's 81-bot catalog and **36 / 56 / 72**
S1 and **38 / 61 / 81** S2 unlocked-pool figures are historical snapshots. The live Season 3
catalog contains 179 bots and 19 items; [Season 3 notes](SEASON3.md) describe its current
captain, crew, mythic, item, economy, and matchmaking rules.

**Season 1/2 rule update (2026-09-20):** The [official rules](https://thursdayarena.com/rules.md)
give each legendary **half** the per-bot shop weight of other rarities. The active shop model's
offer and reroll draws now use that weight. The uniform-offer claims below describe the earlier
audit pool, before the first legendary was added. The official rules also say that, after 40
exchanges, remaining total health and then total attack decide the round; the active simulator
now applies that tiebreak. None of the 7,862 new battle telemetry events reached the cap
(maximum observed: 13 exchanges), so rated behavior at the cap remains unverified.

Lens: rules of the shop/economy/series/catalog, taken from the game client source and checked against the bot's own logs (`data/decisions/events.jsonl`, 65,271 events, 2026-09-18T11:06Z → 2026-09-19T07:28Z, 3,989 finished matches).
Scripts (re-runnable, read-only on the repo) are in `scratchpad/audit/engs/`. Beautified client chunks are in `scratchpad/audit/engs/pretty/`.
Labels: **PROVEN** means read directly from source or computed from the logs. **INFERRED** means a reasoned conclusion that was not directly observed.

---

## 0. Headline

1. **At audit time, Season 2 was live but the bot could not see it.** From 2026-09-19T07:00Z the rated game had 8 launch bots with 8 new kits and a new "seat rules" system. The audited repo had neither. Results over the 178 S2 matches in that log: **29.2 % wins [23.0, 36.3]** (S1: 74.9 % [73.5, 76.2], n=3,811), and **−311 Elo in 28 minutes**.
2. **The audited bot broke its gold budget at R0.** A shop gives 10 gold, and 3 commons cost 9. Any second reroll at R0 therefore guarantees a short board. **651 of 3,994 R0 fights (16.3 %) were fought with fewer than 3 bots**, and every one of the 629 R0 shops with 2 rerolls ended short. Matches with a short R0 won **41.6 % [37.8, 45.4] (n=642)** against **79.2 % [77.8, 80.6] (n=3,286)** with a full R0.
3. **The recipe planner cannot work in this economy.** It needs 3 specific named bots. A specific common shows up in a 3-offer shop only 8.1 % of the time, and 52 % of the 3,191 recipes need a bot that R0 cannot offer. What it actually does is "reroll, reroll, fight": 734 R1/R2 shops ended with 8 of 10 gold unspent, and 442 of 444 recipe-led R0 shops fought short. In the same S1 time window, recipe-led matches won 38.6 % [33.5, 43.9] (n=337) against 55.4 % [50.2, 60.5] (n=350) for policy-led matches.
4. **The old food model was wrong.** Potato is **+2 ATK for the current round only** and it **removes honey**. The audited code and two strategy docs treated it as permanent +1/+1. Rerolling also re-rolls the food, so the old "one food per shop / never spend the last 3 gold" doctrine rested on a false premise.
5. **The old series and Elo descriptions were wrong.** A match has at most 3 rounds and a drawn round still uses one up. 12.7 % of the audited matches ended 1-0, 0-1, 1-1 or 0-0. 55.7 % of R2 shops happened at a score other than 1-1, and the old planner had no final-round logic. Elo was consistent with rating-gap-dependent K=32, rather than the constant "+7 / −23 / −8" in the old docs.

---

## 1. Engine rules (client source) with data agreement

Client-only caveat. The client holds `sapMatchReducer` (module 74098 in `site/1ou4egaetj-op.js`, pretty lines 2072–2457). The rated client uses it only to *predict* the result of buy/sell/feed/move/freeze. It explicitly does **not** predict rerolls (`3au66v6lwsg27.js` pretty 272–285). The rated server decides everything: offer rolls, the unlock pool, food, seat rules and battles. The client's `simulateBattle` and `KITS` (ant, beaver, cricket, …, rat) and its 19-entry practice `ROSTER` are an **offline practice legacy**. In that roster "Haggle Bot" is pig, "dr eggbot" is hedgehog and "Stalk Bot" is rat. **Its kits must not be used for rated reasoning.** Only the structural rules carry over. Every rule below was cross-checked in the logs.

| Rule | Client source | Observed in rated logs | Status |
|---|---|---|---|
| Gold per shop = **10**, no carry-over | `GOLD_PER_SHOP 10` (pretty 2162); `battleDone` sets `gold: 10` (2402); help: "They do not carry over" (05a pretty 14) | 9,771/9,825 first-of-round snapshots show 10 (the 54 exceptions are process restarts mid-shop). R1 start is 10 even after R0 ended with 8 left | PROVEN |
| Buy cost = rarity price common 3 / uncommon 4 / rare 5 / epic 6 (`offerCost` clamps to 3–6) | `offerCost`, `rarityFromCost` (2091–2113) | 50,495/50,495 offers had cost equal to the rarity price and to catalog `cost`. 15,335/15,337 buys reduced gold by exactly the cost | PROVEN |
| Buy **appends** the bot to the end of the board (first open seat). Placing it elsewhere needs extra `move`s | `i=[...e.board,a]` (2206); UI emits buy followed by moves (2yj pretty 255–275); help "first open seat" (05a 42) | 15,336/15,337 bought units landed at the last index | PROVEN |
| Sell refund = **+1 flat** (a pig sell kit exists only in the practice legacy) | `SELL_REFUND 1`, `r=e.gold+1` (2243) | 4,595/4,595 sells gave +1, including 148 uncommons | PROVEN |
| Reroll = 1 gold. It replaces every **unfrozen** offer **and re-rolls the food** | `reroll` → `l(e.seed, pets)` returns new pets **and** `food` (2275–2287); "Frozen cards stay" (05a 46) | 9,105 rerolls at −1. Unfed: food changed 1,670 / unchanged 1,508 (an independent redraw). After a feed, a reroll restocked the food in 3,614/3,840 cases; the 226 exceptions are feed-after-reroll ordering | PROVEN |
| Feed = 3 gold, needs a food and a bot, and consumes the food (`food:null`) | `feed` (2288–2316), `FOOD_COST 3` | 7,722 feeds at −3 | PROVEN |
| **apple** = permanent +1/+1 and does not touch honey | reducer 2293–2296 | 2,541 apple feeds all +1/+1. Apple on a honeyed bot kept honey (20/20) | PROVEN |
| **honey** = flag. On faint, a 1/1 "Drone" is inserted **at the fainted bot's seat** (only if the side has <3 units). Honey removes potato, including its +2 tempAtk | reducer 2297–2301; sim `w()` → `e.honey && b(t,n,r)`, `r={Drone,1,1}` (1844–1848, 1958); summon cap `r.length>=3` (1906) | 3,764 honey feeds: atk/hp +0, honey false→true. Rated captions "Drone joins … side" match the sim caption format | PROVEN (flag), INFERRED (the rated sim uses the same placement) |
| **potato** = `tempAtk +2` **this round only**, **removes honey**, and is cleared at `battleDone` | reducer 2302–2306, `battleDone` resets `tempAtk:0, potato:false` (2380–2384); UI "Potato: +2 attack this round" (2yj 430; 3q0 PocketCard mark) | 1,136/1,136 potato feeds show atk+0/hp+0 on the permanent stats. **74 potato feeds turned honey true→false** | PROVEN |
| Re-feed limits (`alreadyHasBoost`): no honey on a honeyed bot, no potato on a potatoed bot (per round); apple is always allowed | 2078–2089 | 89 feed errors: **77/78 potato errors hit a bot already potato-fed that round**; 11 were honey-on-honey | PROVEN |
| Freeze toggles, costs 0, and the frozen offer **stays until bought or unfrozen**, through rerolls and into later rounds | `freeze` (2317–2331); roll keeps `frozen` (2126); help (05a 50) | Same card after a reroll 560/562, after a round change 1,293/1,295 | PROVEN |
| Shop = exactly 3 offer slots plus 1 food | zod `pets.length(SHOP_PET_SLOTS=3)` (851) | all 16,849 snapshots have 3 slots | PROVEN |
| Board max 3; seat 0 = front | `TEAM_SIZE 3` (1868), zod `.max(TEAM_SIZE)` (849) | — | PROVEN |
| Move swaps with the adjacent bot and costs 0 | `move` (2332–2341) | 9,637 moves at 0 | PROVEN |
| `endShop` is refused only while the board is empty **and** something is still affordable. With 0 bots and nothing affordable, Fight **forfeits the round** | `endShop` + `canStillAct` (2342–2343, 2096–2098); `FIGHT_FORFEIT_HINT` | — | PROVEN (client) |
| Offer pool = bots with `unlockTurn ≤ round+1`, drawn **uniformly per bot, with replacement** | not in the client (server-side); the practice roll is uniform with replacement (2127) | Fresh (unfrozen) slots: R0 100 % common (n=18,558 known). R1 uncommon 34.9 % of known (uniform expectation 20/56 = 35.7 %). R2 common 49.4 / uncommon 28.6 / rare 16.4 / epic 5.6 % (uniform 50 / 27.8 / 16.7 / 5.6). Duplicate bot within one shop at R0: 8.4 % [7.7, 9.1] (theory 1−(35/36)(34/36) = 8.2 %). 0 unlock violations in 50k offers | PROVEN (pool), INFERRED (uniform weights) |
| Food odds | practice: 50/50 apple/honey (2137) | Rated R0: apple 50.2 / honey 49.8 / potato 0 (n=4,015). R1: honey 50.4 / apple 33.2 / potato 16.2 (n=4,020). R2: honey 50.1 / apple 34.0 / potato 15.6 (n=1,790). The same odds hold after rerolls | PROVEN (observed) |
| Series: `round ∈ {0,1,2}`; the match ends at 2 wins **or after round index 2**; a draw uses up a round; the result compares wins (`matchResult`) | zod round union 0\|1\|2 (790), wins `max(2)` (778), `battleDone` (2385), `matchResult` (2184–2186), public replay `rounds.max(3)` (952); help "best of three" | Final scores 2-0 2,298 · 2-1 500 · **1-0 108** · 0-2 472 · 1-2 224 · **0-1 65** · **1-1 draw 310** · **0-0 draw 12**. Drawn rounds 1,253/9,770 (12.8 %). Examples: (draw, draw, us) → win 1-0; (draw, draw, draw) → draw 0-0 | PROVEN |
| Battle loop cap in the audited practice client: 40 trades, then draw. Both lines empty = draw | sim (1985–1999); changelog 2026-09-17 "Both teams down is a draw" | — | PROVEN (historical client); rated cap unverified, and the current official rules specify an HP/ATK tiebreak |
| Opponent = `opponentKind` "ghost" (another player's recorded line) or "ai" (rated with no ghost is labelled "AI · no ghost") | zod `f=enum(ghost,ai)` (792); labels (05a 291–326) | 3,989/3,989 results had a handle, so no AI games were observed | PROVEN |
| A ghost is **one player's run, recorded per round**: the handle is fixed for the whole match and the line changes as their run progresses. Help: "Your rival builds a line in secret while you shop" | 05a help `rival` | Handle constant in 4,060/4,080 matches. Line fingerprint changed r0→r1 in 2,904/3,949 (73.5 %) and r1→r2 in 1,285/1,756 (73.2 %). Ghost units follow the unlock schedule by round (R0: all 9,229 units unlockTurn 1) | PROVEN |
| Elo | `ELO_STAKE 32` (2055) is for the legacy "fight" mode. Tiers: bronze <900, silver ≥900, gold ≥1000, platinum ≥1100, diamond ≥1200 | S1 win +2…+18, loss −30…−14, draw −14…+2 (each band spans 32, as K=32 predicts). S2 at a rating reset (everyone at 1000): mode +16 / −16, draws 0…+1 | INFERRED (standard K=32 Elo) |
| `start` / `restart` | The official client sends `start` (version 0) **on every mount of the match page**, including mid-match reloads, and `restart` (with version) from the result screen "Play again" in **both** rated and practice (2yj 160–176, 1738) | — | PROVEN (client behaviour); INFERRED: `start` resumes an existing match |
| Practice | `/api/arena/practice` with client-held state plus an `X-Practice-Session` header. "Practice matches never touch" rating. `/api/arena/adopt {state}` converts a guest practice run into an account run | — | PROVEN (client) |
| **Season 2 seat rules** | state has `seats:{front,middle,back}` and `seatShop:[{seat,revealed,name,text}×3]` (zod 841–870). UI: "Seat rules · both teams", "one more each round", "Shows in round n+1" (2yj 392–414). Changelog 2026-09-19: "Each match draws a rule for each seat. The shop shows one more each round, and each rule acts on both teams." Rule texts come from the server only | Never logged by the repo | PROVEN (exists) |
| **Season 2 bots** | 80-bot embedded catalog, 8 with `season:2` (3q0 module 78459). Changelog "Season 2: 8 new fighters". Season clock: S2 starts 12:00 AM PT and every rating resets to 1000 | First S2 offer at 2026-09-19T07:00:16Z. The 8 S2 bots appeared at the correct unlock rounds (191 offers) | PROVEN |

Budget math that follows from these rules (PROVEN arithmetic):
- **R0:** 10 gold and commons only (3 gold each). Filling 3 seats costs 9, so **at most one reroll is affordable while still fielding 3 bots**. No food fits at R0 unless you field fewer than 3 bots, and the bot fed 0 times at R0 in all 4,009 R0 shops, which is correct.
- **R1/R2 with a full board:** a round's 10 gold can go on feeds (3), rerolls (1) and upgrades (sell +1, buy −cost). Food odds are honey ½, apple ⅓, potato ⅙, and a reroll re-rolls both the food and the offers. A Monte Carlo of the "feed apple if offered, else reroll while gold ≥ 4" policy gives **1.50 permanent +1/+1 per 10 gold** (`food_mc.py`).
- **R2 is always the last shop.** Unspent gold, freezes and future-value purchases are all worth 0 there.

---

## 2. Catalog

The audit's full table was `scratchpad/audit/catalog_table.json` (80 bots: name, id, season, kitId, abilityName, kitText, atk/hp, rarity, cost, unlockTurn, first round index, whether it was in the repo catalog, and the name_to_kit key/value/ok). A markdown copy was at `scratchpad/audit/engs/catalog_table.md`. For the active catalog use `data/catalog.json`.

- Fixed mapping in the audit catalog: common = 3 gold, unlock 1 (R0). Uncommon = 4, unlock 2 (R1). Rare = 5 and epic = 6, both unlock 3 (R2). The later legendary DeckLens costs 7 and unlocks at R2 in the active catalog.
- S1: 72 bots, 24 kits; pools by round 36 / 56 / 72. **S2 launched with 8**: coffee companion `bloom` (common, "Buy: give a random friend +1/+1"), X High Coach `reach_check` (common, "SoB: give the enemy with the most ATK −2 ATK"), Fondi `hand_off` (uncommon, "Sell: give two random friends +1/+1"), Commitments `keep_open` (uncommon, "Faint: summon a 1/1 Open Loop"), Memento `recall` (uncommon, "Faint: give its ATK to the friend behind"), Apple Dev `caffeinate` (rare, "Faint (once): stay at 1 HP"), Shepherd `herd` (rare, "Friend ahead faints (once): summon a 2/2 Agent"), Master `route` (epic, "SoB (back): give each friend +1/+1"). The launch pools were **38 / 61 / 80**; the current R2 pool is **81** with DeckLens (`red_flag`: strongest enemy loses up to 3 ATK).
- Audit-time repo `catalog.json`: 72 bots. **0 field discrepancies** against the client for the 72 S1 bots (name, kitId, kitText, attack, health, rarity, cost, unlockTurn, abilityName). The same held for the three redundant copies `study/catalog_api.json`, `study/omlejmi/ALL_CARDS.json` and `study/omlejmi/live_catalog.json`. All four copies were **missing the 8 S2 launch bots**.
- `lib/name_to_kit.json`: 74 keys. **All 72 S1 names map to the correct kit.** 2 keys are dead aliases that `normName` can never produce: `"company docs q&a"` and `"company docs qa"` (the live key is `"company docs q a"`). **8 S2 names are missing.** Battle frames carry only name, atk and hp, so this file is the *only* source of opponent kits (`counters.js:26–30`, `ghosts.js:26–39`). S2 opponents are therefore unclassifiable.
- Ability labels differ from kit ids: dodo is labelled "Spot", mosquito "Poke", flamingo "Pass it back", peacock "Brace", Clip Bot's wake "Second look", and Account Research Desk / GTM Account Research's last_word "Scout". Any code or doc that keys on `abilityName` gets the kit wrong. Key on `kitId`.

---

## 3. Historical findings (most costly first)

### ENGS-01 · CRITICAL · Season 2 (new bots and seat rules) is live and the bot is blind to it
- **Evidence (PROVEN):**
  - Client catalog has 80 bots (8 `season:2`). Changelog 2026-09-19: "Season 2: 8 new fighters", "Season 2: seat rules", rating reset to 1000.
  - The first S2 offer in our logs is at 2026-09-19T07:00:16Z. 191 S2 offers were logged with `name` equal to the raw botId and `kitId: null`, because `lib/enrich.js:30–41` falls back to the botId when the id is missing from `catalog.json`.
  - `arena.getCatalog()` returns the cached 72-bot file forever (`lib/arena.js:75–84`; `driver/play_loop.js:2622` never passes `refresh`).
  - `state.seats` / `state.seatShop` are never read or logged (grep: 0 hits in driver/ and lib/).
  - 52/451 S2 ghost lines contained a kit-less unit (x high coach 15, commitments 14, memento 14, coffee companion 9, shepherd 3). The bot bought 16 kit-less S2 units blind.
  - **S2 results: n=178, W 52 / L 102 / D 24 = 29.2 % [23.0, 36.3], loss 57.3 % [50.0, 64.3], ΣElo −311** (S1: 74.9 % [73.5, 76.2], n=3,811).
- **Cause (INFERRED):** the collapse cannot be pinned on one factor. Seat rules apply to every match, the ghost pool changed and there are new kits, all at once. The bot is blind to all three.
- **Fix:**
  - Refresh the catalog on every process start, and whenever an unknown `botId` appears in the shop or board (the client does the same via `shopNeedsCatalogRefresh`).
  - Add the 8 S2 kits to `name_to_kit.json`, to `counters` and to the planner's kit tables.
  - Parse `seatShop` (the revealed rules) every shop and log `seats` / `seatShop`.
  - Until an S2 model exists, stop rated climbing and use practice games (no rating cost) to learn the seat rules.

### ENGS-02 · CRITICAL · R0 double reroll guarantees a short board ("never fight short" is violated 16 % of the time)
- **Evidence (PROVEN):**
  - 651/3,994 R0 fights had fewer than 3 bots (615 with 2 bots, 38 with 1).
  - (rerolls at R0, board size): 0 rerolls → 1,797 full; 1 reroll → 1,545 full; **2 rerolls → 629/629 short** (100 % [99.4, 100]).
  - Round win at R0: 3 bots 64.0 % [62.3, 65.6] (n=3,343); 2 bots 18.7 % [15.8, 22.0] (n=615); 1 bot 0/38.
  - Match level: short R0 41.6 % [37.8, 45.4] (n=642) against full R0 79.2 % [77.8, 80.6] (n=3,286). Losses: 44.7 % against 13.9 %.
- **Causes, by code path** (first plan of the round → the replan):

  | Path | Short / total | Code |
  |---|---|---|
  | recipe → recipe | 442/444 | `lib/recipes.js:370–380`, "Fish for missing pieces" |
  | opener reroll → fill3 reroll | 95/95 | `driver/play_loop.js:1391–1404` then `:1613–1631` |
  | fill3 → fill3 | 43/43 | `driver/play_loop.js:1613–1631` |
  | opener → opener | 28/28 | `driver/play_loop.js:1391–1404` |

  The `:1613–1631` path is the "Underfill → mandatory reroll (never lock short board)" branch, and it is what *causes* the short board. The emergency fill (`driver/play_loop.js:2938–2970`) can only buy what the remaining 8 gold allows, which is 2 commons.
- **Engine rule:** 10 gold, commons cost 3 at R0, so after the first reroll exactly 9 gold remain.
- **Fix:** hard invariant `gold − 1 ≥ Σ min_cost(empty seats)` before any reroll, with `min_cost` = 3. At R0 this allows at most one reroll, and only if it comes before the third buy.
- **Impact (INFERRED):** worth about 240 match wins over this sample. (79.2 − 41.6) × 642 ≈ 241, though the matches are not randomized.

### ENGS-03 · CRITICAL · The recipe planner cannot work in this economy (and was re-enabled around 04:00Z)
- **Evidence (PROVEN):**
  - `pickRecipe` (`lib/recipes.js:243–309`) has no round or `unlockTurn` awareness. 1,656/3,191 recipes (51.9 %) contain a bot R0 cannot offer, and 277 contain a bot R1 cannot offer.
  - A specific common appears in a 3-offer R0 shop with p = 1 − (35/36)³ = 8.1 %, so assembling 3 named bots with 1 spare reroll is essentially impossible.
  - The planner returns `[reroll]` whenever any piece is missing (`recipes.js:370–380`). The main loop replans only **once** after a reroll (`driver/play_loop.js:2902–2934`), so the second reroll strands the gold. 734 R1/R2 shops (406 at R1, 328 at R2) ended "reroll, reroll, fight" with **8 gold unspent**.
  - Round win for recipe-led vs policy-led shops, same S1 window 04:00–07:00Z: R0 19.4 % [15.6, 23.9] (n=340) vs 49.6 % [44.4, 54.8] (n=353); R1 49.9 % vs 61.8 %; R2 41.5 % vs 51.0 %. Match level: **38.6 % [33.5, 43.9] (n=337) vs 55.4 % [50.2, 60.5] (n=350)**.
  - Also in `recipes.js`:
    - The freeze step (`:420–429`) freezes a *duplicate* of an already-owned recipe piece, including in the final round.
    - Food (`:383–405`, non-honey branch `:395–396`) puts non-honey food on the "front" bot with no potato or honey checks.
    - Tip-stripped buys (`play_loop.js:2316–2342`) shift the indices of later feeds and moves.
- **Fix:** delete the recipe planner, `memory/recipes/` and `pickRecipe` from the rated path. Keep, at most, learned per-kit priors.

### ENGS-04 · HIGH · Potato mis-modelled as permanent +1/+1; potato also destroys honey
- **Engine (PROVEN):** potato sets `tempAtk += 2`, which is cleared at `battleDone`, and sets `honey:false`. Honey removes potato. The same bot cannot eat a second potato in the same round (`site/1ou4egaetj-op.js` pretty 2078–2089, 2297–2306, 2380–2384).
- **Repo:**
  - `driver/play_loop.js:2089–2092` adds +1/+1 for potato.
  - `:2064–2071` "survives after potato" check uses `hp+1`. Potato adds 0 HP, so the check is meaningless and skipped a potato in 113 shops that had 3+ gold.
  - `:2047–2061` target choice ignores honey.
  - `lib/recipes.js:395–396` feeds non-honey food to the front with no checks.
  - Docs: `study/omlejmi/GAME_SYSTEMS.md:32,78,146`; `COMPLETE_WIN_PLAN.md:33,71,270,289,402` (line 33 "PROVEN" cites a 2/6→3/7 feed, which was an apple). These contradict `UNLOCK_SCHEDULE.md:120` ("+2 ATK this round only").
- **Data (PROVEN):**
  - 1,136/1,136 potato feeds left atk/hp unchanged.
  - **74 potato feeds stripped honey** from a honeyed bot.
  - **77 invalid_action errors** were a second potato on the same bot in the same round.
- **Fix:** model potato as a +2 attack burst this round only, and never feed it to a honeyed bot unless that is intended. Track `potato` per round from `state.board[i].potato`. Delete the +1/+1 claims from the docs.

### ENGS-05 · HIGH · Gold is left unspent although it never carries over (worst in the final round)
- **Evidence (PROVEN)**, gold left at the fight, emergency buys included:

  | Round | n | Mean left | ≥ 3 gold left | 8 left |
  |---|---|---|---|---|
  | R0 | 3,994 | 0.79 | — | — |
  | R1 | 3,990 | 2.06 | 1,238 (31.0 %) | — |
  | R2 | 1,782 | 3.43 | **816 (45.8 % [43.5, 48.1])** | 333 |

  707 R1/R2 shops ended with a full board, ≥ 3 gold and a fresh food that was never evaluated (the food arrived with the second reroll, and no replan followed).
- **Engine:** gold is reset to 10 each round (pretty 2402; help "They do not carry over"), and R2 is the last shop.
- **Fix:** loop plan → apply → observe until no useful action remains (no one-replan cap). In R2, spend to 0 on apples, rerolls for upgrades and feeds.

### ENGS-06 · HIGH · "One food per shop" is false: a reroll re-rolls and restocks the food
- **Engine:** `reroll` returns a new `food` (pretty 2277–2284).
- **Data (PROVEN):** without a feed, the food changed on 1,670 rerolls and stayed the same on 1,508 (an independent redraw). After a feed, a reroll brought a fresh food 3,614 times out of 3,840.
- **Repo:**
  - `COMPLETE_WIN_PLAN.md:40` ("**one** food per shop"), `:103` ("reroll that spends the last 3 gold … food starvation").
  - `driver/play_loop.js:2115–2124`: P7 will not reroll while an unused food is present, even when that food is unusable, such as honey with every bot already honeyed (22 R2 shops).
  - P5 feeds at most once per plan (`:2027`).
- **Fix:** treat food as a re-rollable resource. With a full board, apple-fishing yields about 1.5 permanent +1/+1 per 10 gold (Monte Carlo).

### ENGS-07 · HIGH · The planner's board model disagrees with the server: bought bots are appended, but the model puts the "wall" at the front
- **Engine (PROVEN):** buy appends (pretty 2206). 15,336/15,337 bought units landed last.
- **Repo:**
  - `driver/play_loop.js:1374` `if (unshift) board.unshift(unit)` via `pushBuy(wall, true)` at `:1694`. No `move`s are emitted. `seatBoard` (`:1213–1257`) then computes moves on the wrong order, and later `feed` / `sell` indices point at different bots.
- **Data (PROVEN):**
  - 458/15,722 planned batches (2.9 %) ended in a board order different from `boardPreview`. 228 of those had the same bots in a different order (econ_audit5).
  - Example: plan `[Office Ops Desk, Call Follow-Ups, Projects Manager]` came out as `[Call Follow-Ups, Projects Manager, Office Ops Desk]`: the survival wall sat in the back.
  - In the 209 rounds where the planned front bot ended up elsewhere, round win was 58.9 % [52.1, 65.3] against 65.8 % [64.8, 66.7] (confounded).
  - 11 honey-on-honey errors come from the same index drift.
- **Fix:** simulate actions with the engine's reducer semantics (append, then explicit moves) and assert that the plan matches the observed state after every action.

### ENGS-08 · HIGH · Actions chosen from the pre-reroll shop run after a reroll in the same batch
- **Data (PROVEN):** 357 `freeze` actions were issued after a reroll in the same batch. They froze whatever new card now sat in that slot (a planned tinkabot freeze at index 1 froze "Hiring Signals"). 288 `feed` actions ran after a reroll, with a food that had been redrawn (148 turned out honey, 70 apple, 68 potato-like).
- **Source:** P6 "FIX 4" reroll `driver/play_loop.js:1792–1800` falls through to P4/P5 using stale `pets` / `food`. P7 reroll at `:2116–2127` is followed by a freeze chosen from the old `scored` at `:2131–2148`.
- **Fix:** a reroll must end the batch, followed by observe and replan.

### ENGS-09 · MEDIUM · Series rules misstated; no final-round logic
- **Engine (PROVEN):** at most 3 rounds (round ∈ {0,1,2}); a drawn round is consumed; the result compares wins.
- **Data (PROVEN):**
  - 507/3,989 matches (12.7 %) ended 1-0, 0-1, 1-1 or 0-0.
  - R2 was reached at 1-0 in 637 fights, at 0-1 in 271 and at 0-0 in 84, which is **992/1,781 (55.7 %)** of R2 fights.
  - Stakes differ by score. At 1-0 a draw wins the match. At 0-1 a win only draws the series (about −7 Elo instead of −21 in S1).
- **Repo:**
  - "first to 2 / BO3": `CLAUDE.md:80` ("A series goes to the first player to win 2 rounds"), `GAME_SYSTEMS.md:40`, `COMPLETE_WIN_PLAN.md:22`.
  - The planner has a decider mode only for 1-1 (`driver/play_loop.js:1301,1316`) and no `round===2` logic anywhere (the grep finds only `round===0` / `round>=1`).
  - Stale-result heuristic `driver/play_loop.js:2720–2727` tests `max(wins) ≥ 3` and `wins sum < 5`. Both are impossible, because the schema caps wins at 2.
- **Fix:** add an explicit final-round objective per score: 1-0 → minimize P(loss); 0-1 → maximize P(win); 0-0 and 1-1 → maximize P(win). Delete the impossible checks and use `state.results` / `state.eloDelta`.

### ENGS-10 · MEDIUM · Freeze misuse: never unfrozen, mostly never bought, a third issued in the final round
- **Engine (PROVEN):** a frozen card persists across rerolls (560/562) and rounds (1,293/1,295) until it is bought or unfrozen. Each frozen slot means fewer fresh cards per reroll.
- **Data (PROVEN):**
  - 3,323 freezes; **0 unfreezes**; only 554 (16.7 %) bought; **2,743 still frozen at match end**.
  - **1,126 freezes (33.9 %) were issued in round 2**, the last shop, where they have zero value.
  - 749 rerolls ran with 1–2 of our slots frozen.
  - Frozen rare-or-better cards get `+4` in `scoreUnit` (`driver/play_loop.js:1018`) and extra sell-for-it paths (`:1947`).
- **Fix:** freeze only a card that cannot be afforded now and will be bought next round. Never freeze in R2. Unfreeze a card that is no longer wanted before rerolling.

### ENGS-11 · MEDIUM · The Elo model is a rating-gap artifact, not a rule
- **Data (PROVEN):** S1 deltas: win +2…+18 (mode +3/+4), loss −30…−14, draw −14…+2. S2 at the reset: win mode +16, loss mode −16, draws 0…+1.
- **Interpretation (INFERRED):** consistent with standard K=32 Elo (each band is 32 wide).
- **Repo:** `GAME_SYSTEMS.md:190–196`, `COMPLETE_WIN_PLAN.md:320–333` and `COMPLETE_GAME_MANUAL.md:12–14` hard-code "+7 / −23 / −8" and derive "one loss ≈ 3.3 wins, one draw ≈ 1.1 wins". Those figures come from farming ghosts rated far below us. At parity (S2), a draw is worth about 0 and a win about +16.
- **Fix:** compute EV from the current rating gap, or ignore Elo and maximize P(win) − P(loss).

### ENGS-12 · MEDIUM · Ghost lines evolve every round; the planner fights the previous round's line
- **Data (PROVEN):** fixed handle per match (4,060/4,080). Line fingerprint changes between rounds 73 % of the time. Units follow the per-round unlock pool.
- **Repo:**
  - `lib/ghosts.js:3–4` ("Opponents are frozen snapshots — rematches are the same puzzle") contradicts `GAME_SYSTEMS.md:41` ("Ghost rebuilds every round").
  - Survival and counter gates (`driver/play_loop.js:1652–1707`, `theirFrontThreat`) use the line seen last round. Its R2 composition will differ in about 73 % of cases and can include rares and epics that did not exist at R1.
- **Fix:** model the opponent as a distribution over the next-round pool (at minimum, assume +1 round of unlocks and ~10 gold of upgrades) rather than as a fixed board.

### ENGS-13 · MEDIUM · Honey modelled as +2 HP on the unit
- **Engine:** honey does not add HP. On faint, a separate 1/1 Drone is inserted at the fainted bot's seat (pretty 1944–1958; UI "Honey: faint summons a 1/1 Drone"). It absorbs one enemy attack and deals 1 damage.
- **Repo:** `lib/counters.js:531–543` (`hp += 2` if honey), `driver/play_loop.js:1649`, `GAME_SYSTEMS.md:145`, `COMPLETE_WIN_PLAN.md:170`. This mis-values honey in both the survival gate and the food choice (honey targeting prefers back/mid, `play_loop.js:2030–2046`).
- **Fix:** model the Drone as a unit.

### ENGS-14 · LOW · Offer and price rules documented loosely; unlock doc stale for S2
- **Repo:**
  - `api/ACTIONS.md:17` ("cost = offer.cost, usually 3").
  - `CLAUDE.md:80` ("Buying costs about 3").
  - `GAME_SYSTEMS.md:48` ("typ. 3").
  - `UNLOCK_SCHEDULE.md` is correct for S1 (36 / 56 / 72 and the tier mix) but omits S2 (38 / 61 / 80). Its line 8 "72" and its pool table are stale.
- **Engine:** price is fixed by rarity at 3 / 4 / 5 / 6. Offers are uniform over the unlocked pool, drawn with replacement.
- **Fix:** replace these with the table in §1.

### ENGS-15 · LOW · start/restart/adopt/endShop semantics wrong in API docs
- **`restart`:** `api/ACTIONS.md:13`, `lib/arena.js:12,186` ("practice rematch") are contradicted by the client's use of `restart` for the rated "Play again" and by the repo itself (`driver/play_loop.js:2691,2742,2779`).
- **`start`:** `CLAUDE.md:81` and `GAME_SYSTEMS.md:57` claim `start` during shop/battle forfeits. The official client sends `start` (version 0) on every page mount, including mid-match reloads (`2yjqnsbsdx9j5.js` pretty 160–176 and the mount effect ~1640–1655; the result-screen "Play again" dispatches `restart` at 1738). INFERRED: `start` resumes rather than forfeits. The `restart` forfeit is unverified.
- **`adopt`:** `api/ACTIONS.md:25` / `lib/arena.js:96–101` POST `{}`. The endpoint takes `{state}` of a guest practice run (pretty 1102–1113).
- **`endShop`:** "needs ≥ 1 bot" is imprecise. With 0 bots and nothing affordable, Fight is allowed and forfeits the round.

### ENGS-16 · LOW · HTTP 409 treated as success silently drops actions
- **Repo:** `lib/arena.js:61–63` returns the 409 state as if the action had been applied. `applyActions` then continues the pre-planned index-based batch against a changed state.
- **Data (PROVEN):** 27 feeds with a 0 gold delta, plus 1 reroll, 2 buys and 1 move whose gold changes are impossible, all logged as "applied".
- **Fix:** on a 409, stop the batch and replan.

### ENGS-17 · LOW · Telemetry cannot audit the economy
- **Missing from `lib/decision_db.js:20–33` (`pet()`) / `lib/match_log.js:31–42` (`unit()`):** `tempAtk`, `potato`, `frozen`, `seats` / `seatShop`, `state.results`, the server `matchId`, `eloDelta` timing, `recipeId` / `missing`, and the `emergency_buy` actions. Emergency buys go only to stdout, so gold-left and fill analysis has to reconstruct them.
- **Also:** `boardPreview` for recipe plans is the *current* board minus sells (`play_loop.js:2365`), not the plan.
- **Fix:** log the raw server state for every shop and every action.

### ENGS-18 · LOW · Dead aliases and 4 redundant catalog copies
- **Dead aliases:** `name_to_kit.json` keys `"company docs q&a"` and `"company docs qa"` cannot match `normName` output.
- **Redundant copies:** `catalog.json`, `study/catalog_api.json`, `study/omlejmi/ALL_CARDS.json` and `study/omlejmi/live_catalog.json` are identical and stale (72 bots).
- **Fix:** keep one catalog refreshed from `/api/catalog`, and derive `name_to_kit` from it at load time.

Confirmed correct in the repo (no action needed): `SELL_REFUND = 1`, `MAX_BOARD = 3` (`play_loop.js:1293–1294`), reroll cost 1, feed cost 3, the "never re-honey" rule, 0-based `phase.round`, and seat 0 = front.

---

## 4. Recommendations recorded for the rewrite (grounded in §1)

1. **Budget invariant (every reroll).** Reroll only if `gold − 1 ≥ Σ min_cost over empty seats`, with `min_cost` = 3. At R0 that means at most one reroll, and only before the 3rd buy. Never fight short while an affordable offer exists.
2. **Spend to zero.** Gold never carries over. Plan, act and observe repeatedly until no positive-value action remains. There is no one-replan limit.
3. **Food is re-rollable.**
   - Apple is the only permanent stat food: +1/+1 for 3 gold. With a full board, rerolling for apples yields about 1.5 per 10 gold.
   - Honey is a one-time 1/1 Drone at that seat and persists until sold.
   - Potato is +2 ATK this round only. Use it only on a bot that attacks this round, and never on a honeyed bot, because it strips the honey.
   - No second potato or second honey on the same bot.
4. **Sell math.** Sell is a flat +1. Swapping a bot costs `cost − 1` gold and discards its stats and honey, so upgrade only when the gain exceeds the lost apples and honey.
5. **Offers and odds** (per fresh slot, S1; S2 adds 2 / 3 / 3 bots):
   - R0: common 100 %.
   - R1: uncommon ≈ 35 %, so ≥ 1 uncommon among 3 offers ≈ 73 %.
   - R2: rare ≈ 16.7 %, epic ≈ 5.6 %, so ≥ 1 rare-or-epic among 3 offers ≈ 53 % and ≥ 1 epic ≈ 16 %.
   - Plan builds around kits and roles, never around specific names.
6. **Freeze** only an unaffordable card you will buy next round. Never freeze in R2. Unfreeze stale freezes before rerolling.
7. **Final round (R2) by score:**
   - 1-0: a draw is enough, so maximize P(not lose).
   - 0-1: only a win avoids the loss (it yields a series draw).
   - 0-0 and 1-1: maximize P(win).
   - Spend all gold.
8. **Opponent model.** A ghost is a real player's run one round ahead in development. Expect the next line to change (73 %) and to draw from the next unlock tier.
9. **Season 2.** Refresh the catalog, add the S2 kits, read `seatShop` every shop (one rule is revealed per round; rules apply to both teams), and learn the rules in practice before rated play.

---

## 5. Artifacts

| File | What it does |
|---|---|
| `scratchpad/audit/engs/extract_catalog.js` | Extracts the embedded client catalog to `embedded_catalog.json` |
| `scratchpad/audit/engs/compare_catalog.py`, `build_catalog_table.py` | Build `scratchpad/audit/catalog_table.json` and `engs/catalog_table.md` |
| `scratchpad/audit/engs/econ_audit.py` (`.out`) | Gold, food, offers, action deltas, errors, leftover gold, series, Elo, ghost unlock |
| `scratchpad/audit/engs/econ_audit2.py` (`.out`) | Freeze persistence, fresh-slot rarity odds, food across rerolls, potato errors |
| `scratchpad/audit/engs/econ_audit3.py` (`.out`) | Short R0 boards (cause and match impact), leftover gold including emergency buys |
| `scratchpad/audit/engs/econ_audit4.py` (`.out`) | Clean freeze-persistence check, freeze-after-reroll, frozen lifecycle |
| `scratchpad/audit/engs/food_mc.py` | Expected apples per 10 gold |
| `scratchpad/audit/engs/pretty/*.js` | Beautified client chunks (the line numbers cited above) |

| `scratchpad/audit/engs/econ_audit5.py` (`.out`) | S1/S2 split, S2 kit-less units, recipe vs policy (same window), recipe unlock infeasibility, plan/actual order and front-misplaced win rate, R2 series states, series sequences, Elo distributions, ghost line change, R0 short-board causes |
