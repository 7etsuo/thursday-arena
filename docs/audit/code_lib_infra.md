# LIB / infra audit — thursday-arena (lens: everything except play_loop.js)

> **Historical audit (2026-09-19, before the simulator rewrite).** “Current” and “live” below
> mean the old code at the audit cutoff, not the code in this repo today. The old data and study
> files are in `archive/legacy-2026-09-19/`; the audit scripts are in the scratchpad path
> described below. See [AGENTS.md](../../AGENTS.md) and [HISTORY.md](../HISTORY.md) for the
> implemented rewrite and later measurements.

Scope: `lib/*.js`, `lib/*.json`, `mcp/server.js`, `driver/*` (except play_loop), `update_index.py`, `package.json`,
root junk files, `memory/*`, `data/*`, `strategies/`, `index.json`, `matches/`, `study/**/*.md`, `README.md`, `api/*`.
The repo was only read. Every script lives in `scratchpad/audit/lib/` and can be re-run (list at the end).
Labels: **PROVEN** means computed or read directly. **INFERRED** means reasoned from proven facts.

## 0. Headline numbers

| Fact | Value | Label |
|---|---|---|
| Matches in `matches/log.jsonl` (since data_wipe 2026-09-18T11:06Z) | 3,991: W2908 L761 D322. Decided WR 79.3% [77.9,80.5]. **Net rating −634** | PROVEN |
| Mean rating delta | win +6.05, loss −20.97, draw −7.03. Break-even decided WR 77.6% | PROVEN |
| Policy-only matches (recipe planner off) | 2666/3117 = **85.5%** [84.3,86.7] | PROVEN |
| Recipe-driven matches (`lib/recipes.js` path on) | 239/549 = **43.5%** [39.4,47.7] | PROVEN |
| Recipe planner re-enabled | first `recipe+` shop row at **2026-09-19T04:53:04Z** (`.bak.pre-refuse-204742` still says `RECIPE PLANNER DISABLED`) | PROVEN |
| Current code (seat_table era, ≥07:21:24Z) | **3/45 = 6.7%** [2.3,17.9], rating −224 in 49 matches | PROVEN |
| Season 2 (≥07:00Z: new bots, leaderboard reset) | 52/154 = 33.8% [26.8,41.5] | PROVEN |
| Opponent board predictability keyed by (handle, round) | same names 97.6/98.2/97.8% (R0/R1/R2; n=3547/3577/1422), same arch ~98% | PROVEN |
| Same prediction as the code keys it (handle → last-seen board) | names 18–27%, arch 43–55% | PROVEN |
| Rematch share | 3553/3996 R0 fights (89%) were against a handle already seen. Mean same-opponent run 4.7, max 18 | PROVEN |
| Matches right after ≥2 straight losses to the same handle | 80/260 = 30.8% [25.5,36.6], rating **−2,086** (−7.27/match) | PROVEN |

The bottom line in two points:

1. **The collapse from about 88% to 50% and then 7% WR is explained first by `lib/recipes.js` being switched back on, and second by `lib/seat_table.js`.** `seat_table.js` was fitted to the 771-match collapse window.
2. **The opponent model is keyed wrong.** Ghost boards are about 98% deterministic per (handle, round). The code keys them by handle → last-seen board, which is about 50% accurate. The persistence layer holds the same match 6–8 times in different schemas, and most of those stores are write-only.

---

## 1. Persistence store map (writer → reader → does any decision use it?)

| Store | Size / count | Writer(s) | Reader(s) | Affects play? | Verdict |
|---|---|---|---|---|---|
| `data/decisions/events.jsonl` | 60 MB, 65,271 rows | `decision_db.*` (every shop/applied/ghost/fight/result/end) | `driver/analyze_decisions.js`, `export_decisions.js` (offline) | No | Keep **one** telemetry log. This one is the superset, but fix the schema (§LIB-13) |
| `data/matchlog/events.jsonl` + `LATEST_MATCH_ID` | 9.7 MB, 14,056 rows (832 matches since 04:30Z) | `match_log.*` (mirrored by decision_db) | none in code (study only) | No | **Delete.** Duplicate subset that falsely claims "single source of truth" |
| `data/decisions/export/`, `data/decisions/matches/` | empty dirs | `exportCsv` (never run) | – | No | Delete |
| `matches/log.jsonl` | 1.4 MB, 3,991 results | `ledger.appendMatch` | `update_index.py` (stats only) | No | Merge into the one telemetry log |
| `strategies/{wins,losses}/*.json` | 22 MB, **5,420 files** | `ledger.record` (every match) | `update_index.py`; `ledger.hot` loads 10 static ids | Marginal (+4 name bonus, §LIB-14) | **Delete** |
| `index.json` | 452 KB | `update_index.py` (python spawned every match) | `ledger.hot` → `play_loop.hotNameSet` (only `.hot`) | Marginal and harmful | **Delete** with update_index.py |
| `memory/recipes/*.json` | 13 MB, **3,191 files** | `recipes.recordOutcome` (every match) | `recipes.pickRecipe/listRecipes/loadRecipe` (every shop) | **Yes, harmful** (§LIB-01/02) | **Delete** |
| `memory/ghosts/*.json` + `by_handle.json` | 3.8 MB, 916 files | `ghosts.observeOpponent` (every battle), `recordMatchup` | `loadGhost`/`ghostForHandle` (counter arch, recipes, threat) | Yes, but mis-keyed | **Rebuild** as `opponents/<handle>.json` with per-round boards |
| `memory/scout/dossiers.json` | 408 KB, 387 handles, 9,771 "sightings" | `scout.noteBoard/noteResult` | `priorSeats/priorArch/summary` (R0 prior) | Yes, mis-keyed | Delete (fold into the per-round opponent store) |
| `memory/avoid.json` | 476 KB, 385 handles + 635 fps | `avoid.noteResult` | `avoid.record` → only logged in `avoid_note` | No | Delete (or fold per-handle W/L into the opponent store) |
| `memory/blocklist.json` | 5 entries | `avoid.addToBlocklist` (via noteResult, avoid.js:315) and the `build_scout_lists.js` stub | nothing (`isBlocked()` returns false) | No, **write-only** | Delete |
| `memory/farmlist.json`, `memory/scout_lists.json` | stubs | `build_scout_lists.js` | `avoid.isFarm` (never called) | No | Delete |
| `memory/player_scout.json` (556 KB), `leaderboard_snapshot.json` (344 KB), `scout_summary.json`, `scout_run.log`, `scout_progress.json` | – | none left (deleted scout script) | none | No | Delete (orphans) |
| `api/last_version.json` | 118 B | `arena.remember` on **every HTTP response** | none (act uses in-memory `lastEnvelope`) | No, **write-only** | Delete the write |
| `api/sample_state.json` | from 09-17 | `arena.saveSample` (never called) | docs | No | Refresh or delete |
| `catalog.json` | 72 bots, stale | `enrich.saveCatalog` (only when cache empty) | `enrich.loadCatalog` on every observe/act | **Yes: stale** (§LIB-10) | Refresh on each process start |
| `lib/name_to_kit.json` | 74 keys | hand-written | `counters`, `ghosts`, `scout` | Yes | Replace with a lookup derived from the catalog |
| `lib/policy_draft.json` | – | hand-written | **nothing** (only cited in a doc) | No | Delete |
| `matches/climb/*` | 67 MB: 336 batch logs, 174 match logs, climb.log/out/pid, unstick.log | `climb_loop.sh`, play_loop stdout | none automated | No | Archive or delete. climb.log counts are wrong (§LIB-18) |

Count: **8 stores hold the same match outcome** (matches/log, decisions events, matchlog, strategies, recipes, ghosts matchups, scout, avoid). Six of them are never read by any decision.

---

## 2. Findings

### LIB-01 — CRITICAL — `lib/recipes.js` planner is the direct cause of the WR collapse (category: strategy)
**Evidence (PROVEN):**
- Timing. The planner was disabled in every `.bak` up to `pre-refuse-204742` (comment at line 1895: "RECIPE PLANNER DISABLED — heuristic tempo only (recipe path was starving boards / tilting elo)"). The first `recipe+` shop row is at 2026-09-19T04:53:04Z.
- Match level, whole sample. Any recipe usage: 239/549 = 43.5% [39.4,47.7], −1.35 rating/match. Policy-only: 2666/3117 = 85.5% [84.3,86.7], +0.06/match.
- Within the same time windows, which controls for opponent pool:
  - 04:53–07:00Z: recipe 197/408 = 48.3% [43.5,53.1] vs policy 27/38 = 71.1% [55.2,83.0].
  - Season 2 (≥07:00Z): recipe 35/129 = 27.1% [20.2,35.4] vs policy 17/25 = 68.0% [48.4,82.8].
  - Encoded-loss-fixes era: recipe 232/488 = 47.5% vs policy 37/51 = 72.5%.
- Same opponents: only 2 handles were seen both before and after 04:53Z. Before: 18/19 = 94.7%. After (all recipe): 2/8 = 25.0% [7.1,59.1]. poteto went 9-0 before and 0-4 after.
- Mechanism, in `planTowardRecipe` (recipes.js:311–440):
  - The recipe finishes **21/629 = 3.3% [2.2,5.0]** of the time.
  - When the pieces are missing, it pushes `reroll` and **returns early** (lines 371–380), which skips food, ordering and freeze.
  - When the board is full, it pushes a `sell` (line 355) **before** checking `if (gold < cost) continue` (line 359). It sells and then cannot buy.
  - Actions per shop changed as follows:

    | Action per shop | Before | Recipe era |
    |---|---|---|
    | reroll | 0.76 | **1.70** |
    | buy | 1.76 | **0.70** |
    | feed | 0.96 | **0.12** |
    | move | 1.15 | 0.24 |

  - Fights with fewer than 3 units: 496/1798 = 27.6% [25.6,29.7] in the recipe era vs 194/7972 = 2.4% before. Emergency fill cannot buy because the gold went to rerolls.
  - Even 3-unit boards won only 623/1093 = 57.0% in the recipe era vs 5506/6852 = 80.4% before.
- The last pre-collapse data also shows the policy path was fine at 04:00Z (68.6%, n=35). The drop to about 49% coincides with recipe take-over (133/155 matches at 05:00, 171/186 at 05:30).

**Impact:** about −40 WR points on every match it touches, plus short boards. It is the largest single loss source after 04:53Z.
**Fix:** delete `pickRecipe`/`planTowardRecipe` from the decision path, and delete `lib/recipes.js` and `memory/recipes/` entirely. The rewrite should use the per-round opponent memory from LIB-03 with a simulator.
**Safe to delete:** yes, after removing the call sites in play_loop (`planShopSmart` ~2228–2340, `recordResult` ~2551). The `recipe_id`/`plan:"recipe"` fields go too.

### LIB-02 — CRITICAL — Recipe and ghost-matchup "learning" is survivorship-biased and picks losers (category: bug)
**Evidence (PROVEN):**
- `recordOutcome(state.board)` credits the **final board's** name-id, not the recipe that was targeted (play_loop 2551, recipes.js:106). A recipe therefore only accrues results on exact completion, which happens 3.3% of the time. Examples of targeted record in the log vs what the recipe file says:

  | Recipe | Log record when targeted | Recipe file |
  |---|---|---|
  | `recipe-imogen__cooper__wtd` | **W83-L107-D34** | **W15-L1** |
  | `copy-humanizer__writing-bot__wtd` | W26-L37 | W5-L0 |
  | `office-ops-desk__x-brief__writing-bot` | W4-L8 | W5-L0 |

  38 of the 47 E13 recipe matches targeted `imogen__cooper__wtd`.
- `saveRecipe` unions tags forever (recipes.js:66). Once a recipe loses, its `recent_loss` 0.5× demote is permanent, alongside `recent_win`; 113 recipes carry both. 2,678/3,191 = 83.9% of recipes have exactly one play.
- `pickRecipe` arch path scores `hit*20 + globalRecipeScore` (line 284). `hit` counts GLOBAL_SPINE names, so any 3-spine recipe gets 60 for every arch. In a sandbox run on the real memory, **15 of 18 archetypes pick the same recipe**, `copy-humanizer__credit-card-max__wtd`. The arch routing does nothing.
- `ghosts.bestRecipeForGhost` (ghosts.js:137) returns the best-scoring matchup even when every matchup lost. **80 of 635 ghosts' "best" recipe has 0 wins** (65 of them with at least one loss). `pickRecipe` then plays it ("ghost_matchup", recipes.js:250).
- `recordMatchup` keys by `matchCtx.recipeId || finalBoardId`, so the same field mixes "targeted" and "achieved" semantics.
- Recipe ids include raw unknown botIds. `recipe-imogen__account-research-desk__xsfbsprfkv5h909uzrv7w` was targeted 5× in E13.

**Impact:** the planner keeps chasing boards it believes are 15-1 but that are really 83-107 when chased.
**Fix:** delete, as in LIB-01. Any future "memory" should record (our board at fight time) × (enemy board for that round) → round winner.
**Safe to delete:** yes.

### LIB-03 — CRITICAL — Opponent memory (ghosts.js / scout.js) is keyed by handle → last-seen board, but ghosts are deterministic per (handle, round) (category: strategy)
**Evidence (PROVEN), from `a16_round_keyed.js`, `a15_scout_prior.js`, `a09_ghost_stability.js` and `a20_repeat_losses.py`:**
- Keying the enemy board by (handle, round) and predicting from the previous match with that handle:
  - R0: same names+order 97.6%, same names+stats 97.6%, same arch 98.1% (n=3547).
  - R1: names 98.2%, arch 98.5% (n=3577).
  - R2: names 97.8%, stats 82.1%, arch 98.2% (n=1422).
- What the code uses is `ghosts.ghostForHandle` / `scout.priorSeats`, i.e. the last-seen board, usually the previous match's R1/R2:
  - R0: names 18.2%, arch **42.9%** (n=3553).
  - R1: names 26.9%, arch 54.6% (n=3959).
  - R2: arch 52.6% (n=1777).
- Within a match the enemy board changes between rounds 73% of the time (4192/5709 consecutive pairs change names). The recomputed arch persists only 53.7%. So the "live" counter, aimed at the board just fought, is also wrong about half the time. At shop time, the logged plan arch equalled the arch actually faced in only **2131/3955 = 53.9%** (R1) and **921/1760 = 52.3%** (R2).
- `ghosts.js:4` claims "Opponents are frozen snapshots — rematches are the same puzzle". That is true per round, but the implementation stores one fingerprint per board and `by_handle.json` is overwritten with the latest round (`rememberHandle`, ghosts.js:89).
- `planShopSmart` sets `counterArch` from this stale ghost at every shop, including R0 (play_loop ~2200–2221), even though `resolveCounterPlan` says a full counter should only come "after ghost_seen".
- Fingerprints are order-sensitive and name-only: 223 of 916 ghost files are permutations of another file's units (91 groups), and stats are ignored.
- Repeated exact losses: 85% of rounds (8,217/9,674) were against an exact (handle, round, names+stats) board already seen. Against boards we had **only lost to before**, the round WR was 222/690 = **32.2% [28.8,35.7]**, which means repeating the loss 68% of the time. Against boards beaten before it was 78.8%.

**Impact:** this is the largest missed lever. In 89% of matches the exact enemy board for every round is knowable before the shop, yet the bot plans against a board it guesses about 50% right.
**Fix:** replace ghosts/scout with `opponents/<handle>.json = {rounds:[{board, seen, ourBoards:[{board, result}]}]}` (seat-ordered, with stats). Plan round r against `rounds[r]`, and use a simulator to choose buys/order. Drop fingerprint files, `by_handle.json` and dossiers.
**Safe to delete:** ghosts.js/scout.js as written, yes. The data inside (per-handle boards) can be rebuilt from `data/decisions/events.jsonl` fight rows.

### LIB-04 — HIGH — The "play everyone" doctrine is the biggest rating sink; avoid.js is neutered but still writes (category: strategy)
**Evidence (PROVEN, `a14_rematch.py`):**

| Situation | WR | Rating |
|---|---|---|
| No loss streak vs that handle | 2622/3062 = 85.6% | **+2,839** (+0.86/match) |
| Right after 1 loss | 206/347 = 59.4% | −1,387 (−3.53/match) |
| After ≥2 straight losses | 80/260 = **30.8%** [25.5,36.6] | **−2,086** (−7.27/match) |

- The worst handles: cibaru −302 (9W-27L-9D), pat_lorna −272 (2-19-2), aurinkern −228 (3-15). `blocklist.json` currently shows josephyangx at 0-16, eloSum −140.
- In `lib/avoid.js`, `shouldRefuseRematch` (278), `isBlocked` (176), `isHardAvoid` (128) and `scoutFieldStats` (269) all return "no". play_loop wraps the call sites in `if (false && …)`/`if (true || …)`.

**Impact:** about −3,470 rating across the loss-streak rematches, against a whole-run net of −634.
**Fix (user decision; CLAUDE.md marks "play everyone" as deliberate):** either (a) fix LIB-03 so a rematch after a loss is a known puzzle that we counter, or (b) re-enable a real result-screen refuse gate. Whether refusing is free and effective on this site is unproven; `tmp_break_rematch.js` suggests the matchmaker is "sticky". In either case, delete the dead gate code.
**Safe to delete:** the neutered avoid.js paths, yes.

### LIB-05 — HIGH — `lib/seat_table.js` was fitted to the collapse window; its thresholds are noise and it contradicts independent data (category: data_integrity)
**Evidence (PROVEN):**
- The header says "derived from study/FULL_AUDIT.md (771 matches)… refuse WR<<50% at n≥10".
  - FULL_AUDIT uses **only** `data/matchlog/events.jsonl`: 771 matches from 04:30Z onward, the recipe-collapse window (W348 L321 D102; baseline 45.1% with draws counted as losses). It ignores the 3,217 earlier matches in `data/decisions`.
  - The global 42% threshold sits about 3 points under that baseline.
  - Per-arch refuse cells are mostly n=3–9, not ≥10. Examples: hype_battery "writing bot 0-3 n=3"; glass_burst "deal inspector 0-3".
- Replication on independent pre-04:30 data (`a12_arch_cells.js`): of 88 cells with ≥10 rounds, **27 contradict**. Examples, where the arch base is 72%: hype_battery REFUSE cooper 13/15 = 87%, writing bot 15/18 = 83%, luma pages 13/15 = 87%, webby 10/12 = 83%. Also buff_suicide REFUSE office ops desk 53/60 = 88% (base 86%), chip_snipe REFUSE luma pages 100/116 = 86% (base 82%).
- GLOBAL_REFUSE units before 04:30Z, against an 86.7% baseline: signal prospector 212/241 = 88.0%, x brief 329/372 = 88.4%, sales call coach 68/76 = 89.5%, company docs 437/510 = 85.7%, pipeline pulse 272/319 = 85.3%. These are not toxic in the large sample.
- Reach: **19/72 units are refused for every arch**. At R0 with arch unknown, **17 of 36** tier-1 units are refused. Emergency fill ignores the refusals (play_loop ~2940), so refused units get bought, then force-sold next shop.
- The table went live at 07:21:24Z. Since then: 3/45.

**Impact:** it removes about half of the round-1 pool based on noise, and adds sell churn.
**Fix:** delete. Unit choice should come from simulating against the known round board (LIB-03), not from marginal presence-WR tables, which are confounded by planner state.
**Safe to delete:** yes (also remove `TIPS_*` usage in play_loop).

### LIB-06 — HIGH — Rule tables contradict each other: 36 PLANS vs seat-table conflicts, plus unbuyable preferred kits (category: contradiction)
**Evidence (PROVEN, `a13_table_conflicts.js`):**
- There are 36 direct conflicts between `counters.PLANS` (kit level) and `seat_table.ARCH_SEAT_TABLE` (name level). Examples:
  - bulk_echo: the seat table prefers cooper (echo) and copy humanizer (flamingo), but PLANS avoids echo and flamingo.
  - hype_battery: the seat table refuses writing bot and luma pages (hype), but PLANS prefers hype. It prefers tradbot (guard), but PLANS avoids guard.
  - hurt_revenge: the seat table refuses imogen, nyc parent (bulk) and office ops (hold), but PLANS prefers bulk and hold_the_line.
  - buff_suicide: the seat table prefers 3 echo units and copy humanizer, but PLANS avoids echo and flamingo.
  - chip_snipe: the seat table prefers credit card max (grow), but PLANS avoids grow.
  - GLOBAL_SPINE members are refused per-arch: cooper, writing bot, imogen, credit card max.
- Preferred kits that no buyable unit carries:
  - peacock for ko_snowball, bulk_wall and unknown (both peacock units refused).
  - hold_the_line for grow_hype, hurt_revenge and buff_suicide (Office Ops refused).
  - guard for 11 arches is only available as Tradbot (unlock turn 2), because Company Docs is globally refused.
  - sidestep for hype_battery is only available as skippy.
- `'product support inbox assistant'` is in both `TIPS_ALWAYS` and `TIPS_ARCH_GATED` (seat_table.js:49/58).
- `index.hot` names get +4 in scoreUnit, but include Pipeline Pulse, Company Docs Q&A, Outbound and Luma, which seat_table scores −12 to −20.
- `lib/policy_draft.json` (read by nothing) lists `sidestep` as trash while PLANS.hype_battery prefers it, and uses the kit ids `spot`/`poke`, which do not exist.
- `study/GLOBAL_COUNTERS.md` rules contradict seat_table:
  - Copy Humanizer: "hard ban on hype_battery" in the doc vs prefer in the table.
  - Company Docs: "Do" on chip_snipe vs GLOBAL_REFUSE.
  - Flora: "Do" on wake_chip vs GLOBAL_REFUSE.
  - Imogen/Ops: "Do" on hurt_revenge vs refuse.

**Impact:** the buy decision depends on which layer fires last. The planner cannot express the plans it claims.
**Fix:** delete PLANS, seat_table, policy_draft and the hot-names bonus. Replace them with one evaluation function (a simulator vs the known enemy board).
**Safe to delete:** yes.

### LIB-07 — HIGH — `counters.planFromSeats` name overrides mislabel boards and encode a one-opponent rule (category: bug)
**Evidence (PROVEN):**
- `seatsLookLikeCoachRevenge` (counters.js:350–359) forces `hurt_revenge` for any "call coach"/"pitch deck coach" name. In the catalog, **Partnerships Call Coach is spotlight and Pitch Deck Coach is last_word**; only Sales Call Coach and Customer Call Coach & Assistant are peacock.
- Across 9,770 fights, the override changed the label 99 times, and **94 of those boards had no peacock or sting kit**: 60 glass_burst→hurt_revenge, 37 backline_snipe→hurt_revenge.
- `isHypeBatteryNameFp` (338) pins imogen+writing bot+wtd to hype_battery. It comes from 14 matches against **one handle (aurinkern, 13L-1W, 04:41–04:47Z)**, so it is a per-handle rule in disguise. `classify()` already returns hype_battery for that board, so it relabelled 0 fights: it is redundant.

**Fix:** delete both name overrides, or the whole archetype layer (LIB-08/11).
**Safe to delete:** yes.

### LIB-08 — MEDIUM — `counters.classify()` has dead branches, a mislabel, and is too coarse to be stable (category: dead_code)
**Evidence (PROVEN):**
- A brute force over all 24³ catalog kit combinations shows return lines **74, 76, 78 and 80 are unreachable**: the third `chip_snipe`, `wake+echo+hype`, the second `double_echo` and the second `echo_hype`.
- Line 73 returns `echo_hype` for chips+echo **without any hype** (e.g. `[mosquito, echo, patch]`), which contradicts the comment above it.
- `drain` and `spite` are never considered.
- First-match priority sends any board with Tech Demos (a common first_seat) or a spotlight unit to glass_burst: 2,516/9,770 = 25.8% of fights.
- The label persists only 53.7% round to round. PLANS.grow_hype's note ("grow+echo+hype") can never occur because echo+hype returns earlier.

**Fix:** delete archetypes as a decision key. If kept for telemetry, generate them from data.
**Safe to delete:** yes.

### LIB-09 — MEDIUM — `effectiveThreat` / `frontEhp` model the rules wrongly, and enemy honey is invisible (category: bug)
**Evidence (PROVEN unless noted):**
- `frontEhp` adds +2 HP for honey (counters.js:540). Battle frames in `study/raw_matches` show honey means that **on faint, a 1/1 Drone "joins the side"** (92 occurrences in 150 files). The front still dies; one extra 1/1 body absorbs a hit. `GAME_SYSTEMS.md:76` itself labels +2 eHP as "LIKELY", not proven.
- `effectiveThreat` (583) treats `dodo`/`dump` **at seat 0** as buffing seat 1. The kit text says they give 50% ATK to the friend **ahead**, so at seat 0 there is no target. The real case is dodo/dump at seat 1 buffing the front, and it is not modelled: 511 fights had enemy dodo/dump at seat 1 and 284 at seat 2, vs 202 at seat 0.
- `(k === 'spotlight' && i === 0)` sits inside a loop starting at `i = 1`, so it is dead code (line 595).
- Enemy honey is never captured. `frames[].them` units only have `{name, atk, hp}` (client zod schema), so **0 of 27,788 enemy seats** have honey=true, vs 4,960 of 28,582 on our side.

**Impact (INFERRED):** the P1 "front survives" gate is wrong in both directions.
**Fix:** replace hand threat formulas with a battle simulator. Log the full battle frames (captions show Drone summons, so enemy honey can be inferred).
**Safe to delete:** yes, once a simulator exists.

### LIB-10 — HIGH — Stale catalog and unhandled season-2 mechanics (category: bug)
**Evidence (PROVEN):**
- `arena.getCatalog` returns the cache whenever it is non-empty (arena.js:76). `catalog.json` has 72 bots from 09-17. The live site chunk `3q0na6c5idq7f.js` ships the season-2 bots below (8 new kits), which are absent from the cache:

  | Bot | Kit | Stats (atk/hp, cost) | Effect |
  |---|---|---|---|
  | Master | route | 5/5, 6 | SoB back: +1/+1 to each friend |
  | Shepherd | herd | – | – |
  | Apple Dev | caffeinate | – | – |
  | Commitments | keep_open | – | – |
  | Fondi | hand_off | – | – |
  | Memento | recall | – | – |
  | coffee companion | bloom | – | – |
  | X High Coach | reach_check | – | SoB: the enemy with max ATK gets −2 ATK |

- They first appeared in our shops at **07:00:16Z**, which is also when the leaderboard reset (season 2).
- Unknown units get `name = botId` and `kitId = ''` (enrich.js). 8 ids appear 146/136/44/40/29/9/7/6 times in the data. Enemy units x high coach, memento, commitments, coffee companion and shepherd have no kit mapping.
- State fields `seats`, **`seatShop`** ("Seat rules · both teams · one more each round"), `lastSeen`, `results`, `matchId`, `opponentKind` (`ghost|ai`), `season` and `tempAtk` exist in the client schema. **No lib code reads or logs them.**

**Impact:** season 2 went 52/154 = 33.8%. Seat rules are an entire mechanic the bot does not see.
**Fix:** fetch `/api/catalog` at process start (refresh always). Log the raw state envelope, and model `seatShop`.
**Safe to delete:** n/a (fix).

### LIB-11 — MEDIUM — `hedgePlan` / `REPLIES_TO_US` rest on a false premise; hedge helpers are dead (category: strategy)
**Evidence (PROVEN):**
- `hedgePlan` widens `avoid` with the avoid lists of "archetypes that answer OUR board". Ghosts are frozen per (handle, round) (LIB-03, about 98%), so they do not reply to our board.
- Averaged over 324 arch pairs, hedge puts **9.8 of 24 kits** on avoid: flamingo and echo in 156 pairs, grow in 120, peacock and patch in 288.
- Dead parts:
  - `HEDGE_VS` is defined and exported but never read.
  - `hedgeSecondary` is always null (counters.js:525), though play_loop reads it.
  - Every `handle` parameter is neutered (`handle = null`, line 482).
  - `effectivePlan`'s handle branch does nothing.
  - `normalizeHandle` is unused.
  - `frontDiesTo` is only used by the smoke test.

**Fix:** delete.
**Safe to delete:** yes.

### LIB-12 — MEDIUM — Write-only and orphan stores (category: dead_code)
See the §1 table. Each item below is PROVEN by grep over the live code.
- `memory/blocklist.json` is still written: `avoid.noteResult` → `addToBlocklist` (avoid.js:315) re-added 5 handles within 7 minutes after `build_scout_lists.js` reset it at 07:21:19Z. Nothing reads it for decisions.
- `farmlist.json` and `scout_lists.json` are stubs.
- `avoid.json` is read only for a log line.
- The `player_scout`/`leaderboard_snapshot`/`scout_*` files have no reader or writer.
- `api/last_version.json` is written on every response and never read.
- Several export dirs are empty.
- Of `index.json`, only `.hot` is used. `strategies/` exists to serve 10 static files.

**Fix:** delete them and their writer code.
**Safe to delete:** yes, all.

### LIB-13 — MEDIUM — Duplicated persistence with schema drift across the logs (category: telemetry)
**Evidence (PROVEN):**
- The same match is written to up to 8 places (§1).
- `decision_db` writes both a `result` row and a `match_end` row (3,989 each). It mirrors everything into `match_log`, which claims "single source of truth" (`match_log.js:3`, `data/matchlog/README.md`) but holds only 832 of 3,989 matches.
- The two logs use different field names: `type` vs `event`, `kitId` vs `kit`, and `fp` = normalized names vs `boardLine` with stats.
- **`match_start.handle` is null in 3,622/4,080 rows (89%)**, because `beginMatch` runs before the handle is known. There are 91 orphan `match_start` rows.
- `decision_db` makes its own random `matchId` instead of the server's `state.matchId`.
- Within a single `fight` row, `ourFp` is raw lowercase ("stills & clips desk") while `theirFp` is normalized ("stills clips desk").
- Strategy files:
  - `final_board[].kit` is the kitText **sentence** in 16,110 of 16,231 seats (README says kit id).
  - `plan` is always `tempo` (5,398/5,420).
  - `opponent_tier` is `unknown` and `curve` is null.
  - Seats are numbered from 1; everything else numbers from 0.
- No store keeps battle frames, which is the only ground truth for rule mechanics.

**Fix:** use one append-only `events.jsonl` holding the raw server envelope at each shop start, each action result and each battle (with frames), tagged with the server `matchId`/`opponentHandle`/`round`. Derive everything else offline.
**Safe to delete:** match_log.js, the matchlog data, `recordResult` duplicate rows, ledger, strategies. Keep decision_db's data as the legacy archive.

### LIB-14 — MEDIUM — `ledger.hot` / `update_index.py` produce a static "hot" list of the oldest boards (category: bug)
**Evidence (PROVEN):**
- `update_index.py` ranks wins by `(winrate, wins, plays)`. Every auto strategy is 1/1/1, so the stable sort keeps filename order.
- `index.hot` is therefore the 10 alphabetically-first wins: `win-20260918-jason-ghost-counter`, 7 files from 09-17 and 2 from 09-18T03:1x. It never changes.
- `play_loop.hotNameSet` (1095) re-reads `index.json` (452 KB) plus 10 strategy files **on every plan and every emergency-fill iteration**. It gives +4 to those names, including GLOBAL_REFUSE units (see LIB-06).
- `stats.matches` counts the `data_wipe` line (3,992 vs 3,991).
- `ledger.record` runs `python3 update_index.py` synchronously after every match (about 0.12 s warm; it rereads all 5,420 files).

**Fix:** delete `ledger.record/hot`, `update_index.py`, `index.json` and `strategies/`.
**Safe to delete:** yes. The MCP `ledger_*` tools go with them.

### LIB-15 — MEDIUM — Name normalization is inconsistent across modules, and name_to_kit duplicates the catalog (category: bug)
**Evidence (PROVEN):**
- At least 5 normalizers exist: `counters.normName`, `ghosts.normName`, `seat_table.tipBanName` (different emoji set), `decision_db.fp` (lowercase only) and play_loop `nameOf().toLowerCase()`.
- 10/72 catalog names differ between raw-lowercase and normalized forms: SEO & AEO Desk, Stills & Clips Desk, Lingxi's Engineer Bot, Critiquito: Design Critique, Flora: Plant Care Log, EBR & Value Deck Builder, Call Follow-Ups, Company Docs Q&A, Customer Call Coach & Assistant, Love ❤️.
- As a result, the anti-mirror/ghost-name sets (normalized) and scoreUnit names (raw) miss each other for those units.
- `name_to_kit.json` has no wrong mappings against the catalog, but it is a hand copy. It has 2 dead keys (`company docs q&a` and `company docs qa` normalize to `company docs q a`) and lacks all 8 season-2 bots.
- `seat_table.GLOBAL_REFUSE` carries 3 unreachable alias spellings.

**Fix:** key everything by `botId`, and derive name/kit from the catalog. Keep one `normalize()` for display only.
**Safe to delete:** name_to_kit.json, yes.

### LIB-16 — LOW — `lib/avoid.js`: mostly dead code with misleading headers and EV constants (category: dead_code)
**Evidence (PROVEN):**
- The header says "net-record / EV gate + FREE refuse-before-accept", but every gate returns false.
- 13 exports are unused anywhere: noteLoss/Win/Draw, shouldBail, isFarm, nextSoftRotateMs, scoutFieldStats, fieldStatsFromMatches, clearFieldScoutCache, expectedValue and the SOFT_ROTATE_* constants.
- `stickyMeta`, `BACKOFF_MS` and `fieldScoutCache` are dead.
- `EV_WIN=9`, `EV_DRAW=-7` and `EV_LOSS=-23` (avoid.js:43–45) are used only in `migrate()` and when `elo` is missing, which happens in 0 of 3,991 rows. The actual means are +6.05/−7.03/−20.97.
- play_loop uses `avoid.sleep` as a generic sleep.
- `driver/build_scout_lists.js` is a stub that overwrites 3 files.

**Safe to delete:** yes (move `sleep` into a util).

### LIB-17 — LOW — arena/enrich polling cost and a latent 409 bug; recipe dir scans (category: ops_reliability)
**Evidence (PROVEN code; impact INFERRED):**
- Every `observe()` → `getCatalog()` re-reads and parses `catalog.json`, and `remember()` writes `api/last_version.json`. `waitForPhase` polls every 40 ms; the median match is 8.1 s, so this is up to about 200 disk read/write pairs per match.
- `unwrap` treats HTTP 409 (stale version) as success (arena.js:62), so the `/409/` catch in play_loop's `applyActions` (2424) is unreachable. A stale action would be logged as applied, and later index-based actions would run on shifted state. This is latent: 0 same-version action pairs were found in 49,879 applied actions.
- `pickRecipe` scans 3,191 files, taking 50–80 ms per call in the sandbox, 1–2 times per shop.

**Fix:** cache the catalog in memory, drop the version file, and return `{stale:true}` on 409 so the caller replans.

### LIB-18 — LOW — Climb telemetry double-counts results; `climb_loop.sh` cd is broken (category: telemetry)
**Evidence (PROVEN):**
- `climb_loop.sh:28–30` counts matches with `grep -c '"result":"win"'`, but each match writes both an `avoid_note` line and a `result` line containing that pattern. `batch-20260919-012544.log` had 15 games (1W/12L/2D) and climb.log records `wins:2, losses:24, draws:4`.
- `cd /workspace/thursday-arena` (line 3) fails silently because there is no `set -e`.
- `TOP_THREE` was written once and later removed. `climb.pid` and `climb.out` are stale.

**Fix:** count `"event":"result"` lines, and use `cd "$(dirname "$0")/.."`.
**Safe to delete:** the stale climb artifacts.

### LIB-19 — MEDIUM — The only test suite checks a fictional catalog and cannot run (category: ops_reliability)
**Evidence (PROVEN):**
- `driver/smoke_plan.js` requires `play_loop.js` → `lib/arena` → `playwright-core`, so it cannot run without `npm install`. `npm test` is `exit 1`.
- Its `fakeCatalog` has wrong kits and stats: Cooper=grow (real: echo), Webby=flamingo (real: bulk), Meeting Recap 2/4 (real: 3/4), WTD 4/3 (real: 3/4).
- Its `no_recipe_planner` check asserts the invariant whose violation caused LIB-01, and it fails against the current code. Nobody ran it before shipping.

**Fix:** tests over the pure modules and the real catalog, with a golden-frame simulator test, wired to `npm test`.

### LIB-20 — HIGH — Study docs contradict each other and the code; several claim to be canonical (category: docs)
**Evidence (PROVEN):**
- CLAUDE.md names `GAME_SYSTEMS.md` and `COMPLETE_WIN_PLAN.md` as canonical.
  - GAME_SYSTEMS.md:184 says "Recipes: record-only; planner disabled". This has been false since 04:53Z.
  - COMPLETE_WIN_PLAN.md:391 says "Re-enable recipes only if Phases 1–3 metrics green". That was violated.
- `study/FULL_AUDIT.md` calls itself "matchlog canonical" but covers only the 771-match subset. It is the source of seat_table (LIB-05).
- `CURRENT_LOSS_STUDY.md` tags losses with `recipeWhy=disabled`. That tag was true for 100% of the policy-era matches, including the 2,633 wins, so it cannot discriminate. Its "implied fix" (line 384) is to re-enable recipes.
- `BRONZE_LOSS_FIX.md` puts the start of its "recent loss window" at 04:54:55Z, right when the recipe planner came back on, yet it blames tips and archetypes. Its own inventory table is internally inconsistent: ALL elo +1754, while older −416 plus last80 −50 does not add up to that.
- `GLOBAL_COUNTERS.md` and `RULES_CLEANUP.md` describe rules that were overturned by seat_table 2 hours later (LIB-06).
- `ALL_CARDS.md` says "Total 72 bots, 24 kits"; season 2 has 80/32.
- Two different files are both named `FULL_AUDIT.md`.
- `STRATEGY.md`, `WINNING_STRATEGY.md` and `WIN_FORMULA.md` describe themselves as historical.
- `README.md` documents the strategy/index schema, which is itself slop (LIB-13/14).
- `/workspace/thursday-arena` is hard-coded in README.md, mcp/README.md, CLAUDE.md, study/omlejmi/FULL_AUDIT.md, INSTRUCTION_AUDIT.md and both share-args files.
- **Verified correct:** `UNLOCK_SCHEDULE.md`. In the data, offered unlockTurn max is 1/2/3 at R0/R1/R2; gold is 10 per shop; food is apple/honey at R0 and potato from R1.

**Fix:** keep one new `docs/GAME_RULES.md` containing only verified mechanics (unlock schedule, economy, honey=Drone, kit texts from the live catalog, season-2 seat rules), and archive the rest of `study/` outside the repo.
**Safe to delete:** all of `study/*.md` and `study/climb/*` (analysis artifacts). Keep the raw data dumps (`raw_matches`) only if a simulator will be validated against them; they hold battle frames.

### LIB-21 — LOW — Junk and hard-coded files (category: bloat)
**Evidence (PROVEN):**
- `_share_args.json` and `create_bot_share_args.json` are `"visibility":"public"` bot-share payloads. Each embeds a gzipped tarball of a 09-17 driver (25–27 files) whose skill text advertises the **removed** "rematch-bail on losses/draws" and `/workspace` paths. No code references them.
- `tmp_break_rematch.js` navigates the live tab (a hack).
- `package.json` has `"main": "index.js"`, which is missing, and a stub test.
- The cdp and MCP comments hard-code "Fork-22 / 9244".
- `mcp/server.js` exposes `arena_act` with unguarded `start`/`restart`, which forfeits if sent mid-match. Its `ledger_*` tools depend on stores recommended for deletion.

**Safe to delete:** the share-args files and tmp_break_rematch.js, yes. For mcp/server.js, keep it (as a debug tool) and add a phase guard; otherwise delete it.

---

## 3. Study-doc verdicts (all under `study/`)

| Doc | Claims | Verdict |
|---|---|---|
| omlejmi/COMPLETE_WIN_PLAN.md | "Canonical strategy" | Stale and contradicted by the code (recipes re-enabled against its own gate). Archive |
| omlejmi/GAME_SYSTEMS.md | Canonical game model | Partly right (honey=Drone and unlocks are PROVEN). Wrong about recipes, and silent on per-round ghost determinism and season 2. Salvage the facts only |
| omlejmi/WIN_FORMULA.md, WINNING_STRATEGY.md, STRATEGY.md | Self-described historical | Delete |
| omlejmi/FULL_AUDIT.md, INSTRUCTION_AUDIT.md, REWRITE_NOTES.md, FIX_NOTES.md, MATCHUP_PATCHES.md | Change logs of 09-18 patches | Superseded. Delete |
| omlejmi/COUNTERS.md | Counter sheet from one player's replays | Unvalidated. Delete |
| omlejmi/ALL_CARDS.md/.json, live_catalog.json, UNLOCK_SCHEDULE.md | Card list, unlocks | Unlocks verified. Card list stale (72 vs 80). Regenerate from the API |
| omlejmi/DATA_SCHEMA.md | CSV export design | Export never run (dirs empty). Delete |
| FULL_AUDIT.md (+ .json, _PARTIAL, ENCODE_TABLE.json) | "matchlog canonical" | Fitted to the collapse window (LIB-05). Delete |
| SLOP_AUDIT.md, RULES_CLEANUP.md, GLOBAL_COUNTERS.md | Rule rewrites | Contradict each other and the code (LIB-06). Delete |
| CURRENT_LOSS_STUDY.md, BRONZE_LOSS_FIX.md, ALL_LOSSES_ANALYSIS.md, ALL_LOSSES_DUMP.md, ARCH_W_VS_L.md, _current_loss_study_data.json, _spine_mine.json | Loss studies | Misdiagnosed the collapse (LIB-20). Delete |
| climb/FULL_MATCH_STUDY.md, LOSS_WIN_RECIPE.md, FULL_LOSS_DIAGNOSIS.md + data | Older studies | Superseded. Delete |
| top_players.md, leaderboard*.json, top_boards.json, arithemonke_page.json, raw_lists/, api_probes.json, replay_sniff.json | Research dumps | Keep only `raw_matches/`, which holds battle frames for simulator validation |

---

## 4. Re-runnable scripts (scratchpad/audit/lib/)

- `common.py`: Wilson CI and era table.
- `a01_overview.py`: overall W/L and per-code-era results.
- `a02_recipe_by_era.py`: recipe vs policy by era, rating deltas, break-even.
- `a03_name_to_kit.py`: name_to_kit vs catalog.
- `a04_recipe_why.py`: match WR by recipe `why`.
- `a05_timeline.py`: 30-minute timeline.
- `a06_paired_opp.py`: same-opponent before/after.
- `a07_pickrecipe.js`: pickRecipe per arch and ghost best-recipe losers. Run from the sandbox copy with `node a07_pickrecipe.js sandbox`.
- `a08_recipe_attrib.py`: recipe completion rate and log vs file records.
- `a09_ghost_stability.py`: board change within and across matches.
- `a10_arch_persist.js`: arch persistence across rounds, ghost permutations.
- `a11_unit_wr.py`: seat_table lists vs pre/post data.
- `a12_arch_cells.js`: ARCH_SEAT_TABLE replication.
- `a13_table_conflicts.js`: PLANS vs seat_table conflicts, unbuyable kits.
- `a14_rematch.py`: loss-streak rematch cost.
- `a15_scout_prior.js`: scout prior accuracy.
- `a16_round_keyed.js`: (handle, round) determinism.
- `a17_label_override.js`: planFromSeats name overrides.
- `a18_classify_dead.js`: classify unreachable branches.
- `a19_hedge.js`: hedge avoid-set size.
- `a20_repeat_losses.py`: round WR vs exact previously-lost boards.
- `site_catalog.json`: 78 bots parsed from the live site chunk, including the 8 season-2 bots.
- `sandbox/`: a read-only copy of lib, catalog and memory used by the node scripts.
