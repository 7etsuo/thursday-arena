# Thursday Arena — full instruction audit

**Date:** 2026-09-18 ~02:10 MT  
**Climb:** left RUNNING (do not kill).  
**Scope:** `/workspace/thursday-arena` drivers + libs + study/omlejmi + agent profiles
(thursday pilot `3963935`, Thursday Arena `3987646`) + bootstrap skills/workflows.

---

## Contradictions (numbered)

### 1. Rematch-bail vs fight everyone
- **Source A:** Thursday Arena profile (`3987646`): *"Climb: `npm run climb` — loops rated matches, rematch-bails losses/draws, auto-stops at leaderboard #1."* / POLICY: *"treat draws like losses for rematch bail"*. Bootstrap SKILL: *"Win-seeking planner (anti-mirror, rematch-bail on losses/draws)."*
- **Source B:** `lib/avoid.js` `shouldBail`: *"ALWAYS_FIGHT (2026-09-18): never rematch-bail. restart was a rated forfeit (~-26 elo)."* returns `{ bail: false }`. `play_loop.js` also forces `bail.bail = false; // ALWAYS_FIGHT_NO_BAIL`. thursday pilot profile: *"FIGHT EVERYONE. Never rematch-bail… Bail was a rated forfeit (~−25)."*
- **Why bad play:** An agent following Thursday Arena / bootstrap will `restart` mid-match thinking it dodges a bad rematch; that is a **rated forfeit (~−25/−26)**, not a free re-roll.
- **Resolution:** **Fight everyone. Never rematch-bail / mid-match restart to dodge.** (Code + pilot win.)

### 2. Does mid-match `restart` cost elo?
- **Source A:** `play_loop.js` (dead bail block comment): *"Rematch bail: mid-match restart rolls a new seed with NO elo hit."*
- **Source B:** `lib/avoid.js`: *"restart was a rated forfeit (~-26 elo)."* Pilot profile: *"Bail was a rated forfeit (~−25)."*
- **Why bad play:** Even with bail disabled, the surviving comment teaches the next editor that restart is free → someone re-enables bail and bleeds elo.
- **Resolution:** **Restart mid-match is a rated forfeit.** Delete or rewrite the “NO elo hit” comment; keep ALWAYS_FIGHT.

### 3. Climb stop: #1 vs top 3
- **Source A:** Thursday Arena profile + bootstrap: *"auto-stops at leaderboard #1"* / *"Climb loop auto-stops at leaderboard #1."*
- **Source B:** `driver/climb_loop.sh`: `TOP_N="${CLIMB_TOP_N:-3}"`, goal `reach_top_${TOP_N}_then_stop`, flag `TOP_THREE`. Pilot: *"Stop when rank ≤ 3 (not only #1)."*
- **Why bad play:** Agent keeps climbing past top-3 goal, or refuses to treat top-3 as done; wastes matches / fights policy.
- **Resolution:** **Stop at rank ≤ 3** (`CLIMB_TOP_N=3`). #1 is nice-to-have, not the stop condition.

### 4. Recipe planner “enabled” vs disabled in code
- **Source A:** `lib/recipes.js` fully implements `pickRecipe` / `planTowardRecipe`; `ghosts.js` tracks `bestRecipeId` matchups; post-match `recipes.recordOutcome` still runs; `COUNTERS.md`: *"next step is encoding this matrix into `planShop`"*; older agent/MCP narrative of cloned recipe boards.
- **Source B:** `play_loop.js` `planShopSmart`: *"RECIPE PLANNER DISABLED — heuristic tempo only (recipe path was starving boards / tilting elo)."* returns `recipeWhy: 'disabled'`.
- **Why bad play:** Docs/agents re-enable recipe path or MCP-push recipe boards → underfill / gold starve / tilt. Learning still writes recipes that nothing shops toward → false confidence.
- **Resolution:** **Recipes OFF for shop.** Keep record-only ledger; do not call `planTowardRecipe` until a proven non-starving gate exists.

### 5. Scout full-counter vs soft prior vs live-only counter
- **Source A (historical / risk):** Early rematch R0 used last-fp as full counter (called out in `resolveCounterPlan` comments: *"rematch R0 was installing last-fp counters and sell-thrashing"*).
- **Source B:** `lib/scout.js` header: spine always; live ghost when seen; scout prior only before live sight as mild bias. `play_loop.js`: full counter only if `matchCtx.seenOpponent`; scoutPrior bias ×0.35; hedge sells require `liveCounter`.
- **Why bad play:** Treating scout/handle memory as live board → sell-thrash spine into anti-kit junk on R0.
- **Resolution:** **Live `ghost_seen` → full counter/hedge. Scout/handle memory = soft score nudge only. No scout-driven sells.**

### 6. Food-first vs early-return before food
- **Source A:** `WINNING_STRATEGY.md` gold priority includes food before improve_fish; `play_loop.js` comment *"Food FIRST (was after improve_fish return → honey/potato almost never ran)."*
- **Source B:** Still early-returns on `opener_reroll` and `omlejmi_v2_fill3` (underfill reroll) **before** the food block — by design for fill-3, but easy to misread as “food always first.”
- **Why bad play:** Editor moves food above fill, or reintroduces improve_fish-before-food; or expects food on a 1–2 unit board that just returned to reroll.
- **Resolution:** **Order: fill-3 → front survival → (live) counter sells → food → improve_fish.** Early-return only for fill/opener reroll, never for improve_fish.

### 7. improve_fish sells/rerolls vs hold spine
- **Source A:** Deferred improve_fish still pushes `{ type: 'reroll' }` when shop looks weak (R≥1, gold≥2); sell/upgrade loop can still fire on margins.
- **Source B:** Same file: *"HOLD THE SPINE. Loose hedge margins were sell-thrashing…"*; R0: *"almost never sell (fill-3 only)"*; scout prior must never trigger hedge sells.
- **Why bad play:** Fish + loose sells dump commons spine for random rares → omlejmi gap (commons-first).
- **Resolution:** **R0: no sells except trash/off-spine. Live counter sells need real margin. Fish only after food, gold≥2, board full.**

### 8. Grow tip-trade vs wall front vs grow-on-spine
- **Source A:** `STRATEGY.md` / spine: front **grow|bulk|flamingo**; `scoreUnit` boosts grow when hp≥5 (+3.0).
- **Source B:** `WINNING_STRATEGY.md` vs ko_snowball: *"Front: bulk / flamingo / hold_the_line (NOT grow tip-trading into 6 atk)"*; `counters.js` `ko_snowball.avoid` includes `grow`; potato skip on doomed grow.
- **Why bad play:** Planner seats tip-trade grow into 5–6 atk fronts → free KO feeds snowball/cover → −30 losses.
- **Resolution:** **Default spine allows grow front only if hp≥5 AND survives theirFront.atk (post-potato). vs ko_snowball / atk≥5: wall (bulk/flamingo/hold_the_line), not grow.**

### 9. Echo valued vs echo-vs-echo banned
- **Source A:** `STRATEGY.md`: echo is top kit (56/93 wins); spine mid echo|guard; max 2 prefer 1. `scoreUnit`: echo +2.8.
- **Source B:** Agents: *"no echo-vs-echo"*; `play_loop`: `ghostHasEcho` → echo −6.0 (and extra −3); avoid buying 2nd echo vs echo ghost; dump echo when avoiding.
- **Why bad play:** Blind echo greed into Meeting Recap / Call Follow-Ups ghosts → draw factories (draws ≈ −14 elo).
- **Resolution:** **≤1 echo preferred (≤2 hard cap). vs echo ghost: 0–1 echo, prefer grow/flamingo/bulk + hype; never mirror echo names.**

### 10. COUNTERS.md “burst snowball” vs wall-first code
- **Source A:** `COUNTERS.md` table: **ko_snowball** → *"spotlight / spite burst"*; recipe line *"even trades… burst race."*
- **Source B:** `WINNING_STRATEGY.md` + `counters.js` `ko_snowball`: prefer bulk/flamingo/hold_the_line/guard; **avoid grow**; note *"deny KOs — wall front, do not tip-trade grow into snowball."*
- **Why bad play:** Agent buys spotlight/spite glass to “burst” and dies to snowball stack; contradicts working wall plan.
- **Resolution:** **Wall-first deny KOs. Burst/spotlight only if it deletes snowball before stack — not default.** Update COUNTERS.md table to match `counters.js`.

### 11. Honey seat: mid/back vs “honey-front” folklore
- **Source A:** Older pilot/study folklore & some win labels: honey-front / pass-back front.
- **Source B:** `STRATEGY.md`: *"Honey back→mid; potato front"*; `WINNING_STRATEGY.md` same; `planShop` honey ranks back→mid kits first.
- **Why bad play:** Honey on doomed front wastes 3g that should wall/potato; omlejmi put honey back 43 / mid 25 / front 15.
- **Resolution:** **Honey back→mid (skip already-honeyed). Potato front only if post-buff survives their atk.**

### 12. Agent system prompts vs WINNING_STRATEGY / play_loop (split brain)
- **Source A:** Thursday Arena `3987646` + bootstrap still teach rematch-bail, stop #1, honey/tank/grow bias without live-counter / food-reserve order.
- **Source B:** thursday pilot `3963935` already points at this audit + WINNING_STRATEGY and matches ALWAYS_FIGHT / top-3 / recipes off. `play_loop.js` is the live shop brain.
- **Why bad play:** Whichever agent is invoked may override the climber with MCP clicks (bail, recipe boards, wrong food seat).
- **Resolution:** **One policy (below). Climber `play_loop` is shop source of truth. Both profiles + bootstrap must copy it. MCP = debug only while climb runs.**

### 13. MCP tool descriptions vs play_loop behavior
- **Source A:** MCP tools describe raw API (`arena_act` start|restart|buy|…|endShop|battleDone) with no strategy; `mcp/README` shows `--once` play snippets, reversible `freeze` probes.
- **Source B:** Rated climb is `play_loop` heuristic (fill-3, spine, food-first, ALWAYS_FIGHT), not free-form MCP shopping.
- **Why bad play:** Agent “helps” via MCP mid-climb → double-driver, version races, empty endShop, accidental restart forfeit.
- **Resolution:** **While climb_loop is running, do not MCP-act the same session.** MCP observe/leaderboard OK; mutations only if climb is dead.

### 14. Speed / cut sleeps vs stability
- **Source A:** `climb_loop.sh` sleeps `0.05` between matches; sticky bail path `sleep 0.15`; `avoid.js` BACKOFF_MS `[50,100]`.
- **Source B:** Battle wait timeouts 8–12s; CDP/Clerk fragility; fail backoff only after errors.
- **Why bad play:** Tiny sleeps + sticky rematch churn can spin matchmaking / CDP; abort at 15 failures.
- **Resolution:** **Prefer stability over micro-sleeps.** Keep short sleeps only if matchmaking is healthy; on sticky/CDP errors back off seconds not ms. Bail path should be deleted entirely (see #1).

### 15. Elo model inconsistency (docs vs avoid EV constants)
- **Source A:** `WINNING_STRATEGY.md` / `STRATEGY.md`: wins ≈ +2/+3, draws ≈ −14, losses ≈ −30.
- **Source B:** `lib/avoid.js`: `EV_WIN = 9`, `EV_DRAW = -7`, `EV_LOSS = -23` (climb-log means).
- **Why bad play:** If bail EV is ever re-enabled, wrong constants mis-rank farms; agents argue about “one avoided loss ≈ ten wins” vs EV table.
- **Resolution:** **Public omlejmi elo narrative for strategy docs; avoid.js constants only if EV-bail returns (it must not).** Don’t mix them in prompts.

### 16. COUNTERS “not wired” vs counters.js already wired
- **Source A:** `COUNTERS.md` Wire-in: *"next step is encoding this matrix into `planShop`."*
- **Source B:** `lib/counters.js` + `play_loop` already classify → prefer/front/avoid → biasScore / hedgePlan / front survival.
- **Why bad play:** Engineer duplicates or “enables” a second counter path; docs look unfinished so agents invent shops.
- **Resolution:** **Docs must say: matrix is in `lib/counters.js`, consumed by `planShop`. Update COUNTERS.md.**

---

## Single coherent policy (source of truth)

Ordered; later rules do not override earlier ones unless stated.

1. **Fight every rated opponent.** No rematch-bail, no handle skip, no mid-match `restart` to dodge. (Restart = forfeit ≈ −25 elo.)
2. **Climb until rank ≤ 3, then stop** (`CLIMB_TOP_N=3`). Not “only stop at #1.”
3. **Shop driver = `driver/play_loop.js` heuristic.** Recipes OFF. Ledger/ghost/scout = learning + soft bias only.
4. **Per-shop priority:**
   1. Fill to 3 (reroll if underfilled and gold≥1)
   2. Front survival invariant: `ourFront.hp (+honey/potato) > theirFront.atk` when known — wall swap to bulk/flamingo/hold_the_line
   3. Live counter/hedge kit installs only after `ghost_seen` (real margin; hold spine)
   4. Food if gold≥3: honey back→mid; potato front only if survival holds
   5. Same-role upgrade / one improve_fish reroll if gold≥2, board full, R≥1
   6. Freeze unaffordable rare+; seat spine (thick front, hype/last_word back); endShop
5. **Spine:** front bulk|grow(hp≥5 & survives)|flamingo · mid echo|guard · back hype|echo|cover. Commons-first. Sell mosquito/dodo/spite/off-spine toward spine before endShop.
6. **Anti-mirror** names when alternatives exist. **Echo:** prefer 1, hard max 2; vs echo ghost avoid stacking echo (anti-draw).
7. **Scout** = soft prior only; **full counter after live ghost.** Ghosts rebuild each round — re-classify every shop after sight.
8. **vs ko_snowball:** wall front, deny free KOs; do not tip-trade grow into high atk.
9. **API/CDP only** for shop. Screenshots = login only. No MCP mutations while climb runs.
10. **Objective:** maximize WR×volume − 30×loss_rate (never donate −30).

---

## Code / prompt change list

| File | Action |
|------|--------|
| `agents/…/Thursday Arena` `profile.json` (`3987646`) | **Replace** POLICY/CLIMB with coherent policy above (fight everyone, stop top-3, recipes off, food seats, scout soft). Match pilot. |
| `workflows/thursday-arena-bootstrap/SKILL.md` | **Delete** rematch-bail + stop-#1 lines; **keep** unpack/CDP setup; point climb to `npm run climb` / top-3. |
| `workflows/thursday-arena-bootstrap-2/SKILL.md` | Same as bootstrap. |
| `agents/…/thursday-arena-bootstrap/SKILL.md` (agent skill copy) | Same as bootstrap. |
| `agents/…/thursday pilot` `profile.json` (`3963935`) | **Keep** (already aligned). Optionally add explicit “don’t MCP-act while climb runs.” |
| `driver/play_loop.js` | **DONE (2026-09-18):** rematch-bail block removed; food gold reserve; max-1 sell; R0 trash-only; scout ≤0.2×; teeth gate; scored emergency buy; telemetry. Recipe stays disabled. See `REWRITE_NOTES.md`. |
| `lib/counters.js` | **DONE:** export SPINE/TEETH; spine-first prefer + preferTeeth; hedgePlan no HEDGE_VS prefer-union; effectivePrefer.
| `lib/avoid.js` | **DONE:** `shouldBail` → `{ bail: false, reason: 'always_fight' }`; dead EV body deleted. |
| `driver/climb_loop.sh` | **DONE:** rematch_bail_exit sticky sleep → no-op log only; `TOP_N=3` kept. |
| `study/omlejmi/COUNTERS.md` | **Fix** ko_snowball row → wall-first (match `counters.js`); **Replace** “next step encode” with “wired in `lib/counters.js` + `planShop`”. |
| `study/omlejmi/WINNING_STRATEGY.md` | **Keep** as strategy SoT; ensure agents cite it. |
| `study/omlejmi/STRATEGY.md` | **Keep**; add one-liner: grow front only if survives; recipes off. |
| `lib/recipes.js` / `lib/ghosts.js` | **Keep** for post-match learning; do **not** re-hook `planTowardRecipe` without a fill-3 + food gate. |
| `lib/scout.js` | **Keep** as soft-prior module (comments already correct). |
| `mcp/server.js` + `mcp/README.md` | **Keep** API docs; add warning: not the rated climber; no act while `climb_loop` holds the tab. |
| `README.md` | Point to this audit + WINNING_STRATEGY; document real scripts (`play`, `play:once`, `climb`, `rank`, `mcp`). |
| `package.json` | **Keep** current scripts (`climb`/`rank`/`play:once` already present). |

---

## Top 10 contradictions (parent summary)

1. **Rematch-bail (agents/bootstrap) vs ALWAYS_FIGHT (code/pilot)** — re-enabling bail = −25 forfeit.  
2. **play_loop “restart = no elo hit” vs avoid.js “restart = forfeit”** — comment lie.  
3. **Stop at #1 (Arena agent/bootstrap) vs top-3 (climb_loop/pilot).**  
4. **Recipe system alive in libs/docs vs planner disabled in play_loop.**  
5. **Scout-as-full-counter (old behavior) vs soft-prior + live-only counter (current).**  
6. **Food-first claim vs fill/opener early-returns** (and historical improve_fish-before-food bug).  
7. **Grow-on-spine scoring vs wall-not-grow vs snowball.**  
8. **Echo valued vs echo-vs-echo / anti-draw ban.**  
9. **COUNTERS.md spotlight burst vs counters.js wall-first for ko_snowball.**  
10. **Thursday Arena / bootstrap prompts vs pilot + WINNING_STRATEGY + play_loop (split brain).**

**Net:** Shop truth is already mostly in `play_loop` + `counters` + pilot profile. The self-fighting surface is **stale agent/bootstrap prompts**, **dead bail code with wrong elo comments**, and **COUNTERS.md / recipe docs** that describe a parallel brain. Align those to the single policy above; do not kill the running climb to apply doc/prompt edits.
