# FULL PLANNER AUDIT — thursday-arena (omlejmi rewrite brief)

**Date:** 2026-09-18 ~02:05–02:10 MT (America/Edmonton)  
**Scope:** `driver/play_loop.js`, `lib/counters.js`, `lib/scout.js`, `lib/avoid.js`, `lib/ghosts.js`, `driver/climb_loop.sh`, `study/omlejmi/*`  
**Evidence:** `matches/climb/climb.log` + last **80** `match-*.log` (mtime window ~01:47–02:04 MT; climb was still writing newer matches during audit — **not restarted by this audit**)  
**Goal:** Single coherent planner policy to replace patchwork heuristics. Climb must stay paused / not started by this work.

---

## 1. Current architecture

| Module | Role |
|--------|------|
| **`driver/climb_loop.sh`** | Outer loop: rank check → `node driver/play_loop.js --start` → append `climb.log` → sticky sleep on `rematch_bail_exit` → stop at top N. |
| **`driver/play_loop.js`** | Match driver + **shop planner**. Observe → plan actions (buy/sell/reroll/feed/freeze/move) → endShop → battle → ghost fingerprint → optional rematch bail (currently forced off) → result → ledger/scout/avoid learn. |
| **`lib/counters.js`** | Kit archetype classifier + `PLANS` prefer/front/avoid + `hedgePlan` (answer their board **and** likely reply to us) + `biasScore` / `frontDiesTo` / `sameRole`. |
| **`lib/ghosts.js`** | Fingerprint opponent boards (`name \| name \| name`), persist seats + handle map, matchup→recipe scores (recipe **planner disabled** in play_loop). |
| **`lib/scout.js`** | Per-handle dossiers (kits/arch/fp/W-D-L). Supplies **prior seats** before live sight — intended soft nudge only. |
| **`lib/avoid.js`** | Rematch EV ledger; `shouldBail` currently **hard-returns always_fight** (restart was rated ~−26). |
| **`study/omlejmi/*`** | Empirical target: commons spine, fill-3, front survival, honey back→mid / potato front, anti-mirror, counter matrix. |

### Planner pipeline inside `planShop` (actual order)

1. Score shop pets (`scoreUnit` + spine gap + counter/scout bias)  
2. Opener reroll if empty + trash shop  
3. **Fill to 3** (relax anti-mirror / weak kits while underfilled)  
4. Underfill → early return with reroll (`omlejmi_v2_fill3`)  
5. **Front survival** wall-swap vs `theirFrontThreat` (ghost seats)  
6. Sell→buy upgrade loop (margins / hedge / echo-dump) — **R0 break unless trash**  
7. **Food** (honey back→mid, potato front if survival) — moved before improve_fish  
8. Deferred improve_fish reroll (R1+, gold≥2)  
9. Freeze best unaffordable rare+  
10. Seat bubble: glass off front; bulk/grow/flamingo left; hype/last_word right  

`planShopSmart` only wraps this; **recipe planner is disabled**.

---

## 2. Contradictions / conflicting heuristics in `play_loop`

These are not style nits — they fight each other every shop.

| # | Conflict | Effect |
|---|----------|--------|
| A | **MUST_BUY / GHOST_COUNTER / hot ledger** boost *Meeting Recap Deck*, *Call Follow-Ups*, *Imogen* by name **while** anti-mirror −8 and echo-vs-echo −6…−9 | Buys the exact units that cause draw farms vs echo ghosts |
| B | **`counters.PLANS` prefer `sting` / `spite` / `wake` / `mosquito`** for grow_scale, echo_hype, flamingo_pass, etc. **while** `KIT_WEAK` −2.0 and sell prefers dumping them | Counter “wins” on paper; shop refuses the kits; hedge sells thrash into junk or nowhere |
| C | **Soft scout prior** (`biasScore * 0.35`) before `seenOpponent` **vs** comments that rematch R0 must not install last-fp counters | Mild R0 bias toward stale arch; with fill-3 + MUST_BUY can seat wrong spine before live sight |
| D | **`hedgePlan` unions prefer sets** across reply arches → almost every spine kit is “prefer” | `hedgeHit` sell gates fire too often after ghost_seen → **sell thrash** |
| E | **Front survival** wants bulk/flamingo walls vs snowball **vs** spineGapBonus / grow scoring that still loves grow | Tip-trade grow kept; potato skipped on doomed grow but buy path still installs it |
| F | **Food-first** vs **fill/sell/wall spending gold first** | Food runs only if `gold >= 3` *after* buys/sells — empirical **missing food** remains high |
| G | **`desiredSeatOrder` / role sort** vs **`desiredFrontIndex`** vs emergency fill order | Mis-seats: thin/echo front, fat tank back (last_word dies; first_seat deletes front) |
| H | **Emergency buy** before endShop: any affordable pet | Can add glass / punish / mirror names just to hit 3 |
| I | **Bail codepath still present** (`rematch_bail*`) with `bail.bail = false` overlay; avoid.js dead code after early return | Historical bail forfeits dominate climb.log; dual flags invite regression |
| J | **Recipe memory still written**; planner ignores recipes | Learning channel disconnected from decisions |

---

## 3. Empirical failure rates (last ~80 match logs)

### Headline results

| Outcome | Count | % of 80 |
|---------|------:|--------:|
| win | 42 | 52.5% |
| loss | 14 | 17.5% |
| draw | 8 | 10.0% |
| bail (no settled result / rematch_bail path) | 13–14 | ~16–17.5% |
| incomplete | 2–3 | ~3% |

**Among settled fights (win+loss+draw ≈ 64):** WR ≈ **65.6%**.  
**Elo on settled sample:** wins ≈ +326, losses ≈ −335, draws ≈ −63 → **net ≈ −72** (−1.1/game across 64).  
**Loss avg ≈ −24**, **draw avg ≈ −8** — one loss ≈ 3 wins; one draw ≈ 1 win.

### Systematic flags (matches containing pattern / 80)

| Failure mode | Count | % | Notes |
|--------------|------:|--:|-------|
| **No honey on final-ish board** (2+ shop turns) | 48 | 60% | Food rule still losing to gold spend order |
| **R0 underfill / emergency_buy / short preview** | 39–45 | 49–56% | Fill-3 path returns early on reroll; often recovers, but noisy |
| **Missing feed actions** (2+ shops, no feed) | 37 | 46% | **13** of those are loss/draw (16% of all matches) |
| **R0 thin front (hp≤4)** | 34 | 42.5% | Tech Demos / first_seat meta |
| **Facing tech demos / glass_burst arch** | 31 | 39% | High volume; **~12 bails** concentrated here historically |
| **Name mirror** (our unit name ∈ ghost fp) | 17 | 21% | 4 loss/draw |
| **Bail forfeit path** | 13–14 | 16–17% | Climb.log has **hundreds** of sticky/bail lines lifetime |
| **Echo on board vs echo ghost** | 10–14 | 12–18% | Draws + losses when mirrored |
| **Mis-seat** (thin front, thicker back) | 8–11 | 10–14% | |
| **All-tank (atk≤2 board)** | 8 | 10% | 4–5 loss/draw — peacock/snowball food |
| **Sell thrash** (≥3 sells or ≥2 R0 sells) | 8–26* | 10–32%* | *Strict sell_count≥3 ≈8; looser ≥1 sell loops ≈26. **7/8 strict thrash → loss/draw** |
| **Alfred / backline_snipe losses** | 2–4 | 2.5–5% | Small n, large −elo each |
| **Tech demos / first_seat losses** (settled) | 2–3 | ~3% | Understates damage: many glass_burst ended as **bail** not loss |
| **R0 glass front hp≤3** | 1 | 1% | Rare after glass hard-punish; thin hp=4 still common |

### Archetype results (ghost_seen arch → outcome)

| Arch | W | L | D | Bail | Pattern |
|------|--:|--:|--:|------:|---------|
| glass_burst | 14 | 2 | 1 | **12** | Survive fights; **bail/rematch tax** |
| chip_snipe | 10 | 5 | 3 | 1–2 | Missing food + all-tank + sells |
| hurt_revenge | 9 | 2 | 0 | 0 | All-tank / tip-trade |
| backline_snipe | 5 | 2 | 4 | 0 | Draws; weak unhoneyed back |
| others | sparse | | | | |

### Climb.log (lifetime context)

- Logged match_end style tallies in climb.log on order **~466W / 124L / 76D** (parser-dependent)  
- **Sticky/bail-related lines ≫ 400** — rematch restart was a primary elo sink before ALWAYS_FIGHT  

---

## 4. Ordered root causes (highest elo impact first)

1. **Rematch bail / sticky restart forfeits (historical + residual path)**  
   ~−26 elo when restart counted; 16%+ of recent sample; glass_burst rematches especially. ALWAYS_FIGHT patches the symptom; code dual-path is a regression hazard.

2. **Food starvation (honey/potato never bought)**  
   46% of matches with ≥2 shops have no feed; 60% finals lack honey. Direct −elo via lost R1/R2 vs chip_snipe and backline_snipe. Caused by gold spent on fill/sell/wall/reroll before `gold>=3` food gate.

3. **Sell thrash after live counter / hedge**  
   Strict thrash rare but **~90% bad** when it fires. hedgePlan over-wide prefer + multiple sell loops delete spine into anti-kit junk or mirrors.

4. **Thin / mis-seated front vs glass_burst & hurt_revenge**  
   hp≤4 fronts 42% R0; mis-seat 10%+. Tech Demos (4 atk) and peacock lines punish. Settled losses few only because many glass_burst games were bailed.

5. **All-tank no-teeth boards**  
   10% of matches; half go loss/draw. scoreUnit mild −0.4 on 2-atk tanks is too weak vs snowball/peacock.

6. **Echo-mirror / name-mirror draw farm**  
   MUST_BUY pulls Meeting Recap / Call Follow-Ups; anti-echo penalty loses to name bonuses → −6..−14 draws.

7. **Scout/counter soft poisoning & disconnected learning**  
   Soft prior + ghost handle memory before sight; counters prefer KIT_WEAK; recipes recorded but unused — planner cannot converge.

8. *(Honorable)* **Alfred / last_word backline** — low frequency, high −elo when back is thin and unhoneyed.

---

## 5. SINGLE coherent planner policy (replaces patchwork)

### Priority order (hard sequence every shop)

```
P0  FILL 3          — never endShop / never early-fight short
P1  FRONT SURVIVE   — ourFront.effectiveHp > theirFront.atk (honey/potato counted)
P2  ANTI-MIRROR     — no ghost name overlap if any alternative exists; ≤1 echo vs echo ghost
P3  ROLE SPINE      — front wall/scaler · mid echo|guard · back hype|cover|last_word
P4  TEETH           — ≥1 unit with atk≥3 (prefer ≥4) by end of R1
P5  FOOD            — honey back→mid; potato front iff P1 holds after; never re-honey
P6  LIVE COUNTER    — only if seenOpponent; same-role upgrade / prefer kits in PLANS ∩ SPINE
P7  REROLL / FREEZE — improve_fish only with gold left AFTER P0–P5; freeze rare+ for next
```

### Round policies

**R0 (blind)**  
- Buy to 3. Prefer bulk|grow(hp≥5)|flamingo · echo|guard · hype.  
- **Never sell** except KIT_WEAK / GHOST_PUNISH.  
- Scout = score nudge ≤0.2× only; **never** hedge sells; **never** install full counter.  
- Front: refuse hp≤3; prefer hp≥5.  
- No food required if gold < 3 after fill (ok).

**R1 (after ghost_seen)**  
- Recompute arch from **live** seats only.  
- Enforce P1 wall-swap.  
- Cap echo at 1 if they have echo; dump extra echo.  
- Buy food if gold≥3 before any improve_fish.  
- Same-role upgrades only (margin≥3); hedge sells only if prefer∩SPINE and margin≥4.

**R2 (close series)**  
- If series you=1: bias atk≥4 / finish.  
- If series them=1: bias hp/honey survival.  
- Still never name-mirror; still never all-tank.

### Never-do list

1. Never rematch-bail / restart mid-match (rated forfeit).  
2. Never endShop with board.length < 3 if any buy/reroll possible.  
3. Never front hp≤3 (or hp≤ theirFront.atk without honey).  
4. Never potato a grow that still dies to their front atk.  
5. Never echo-mirror (2nd echo vs echo ghost).  
6. Never buy GHOST_PUNISH names (Clip Bot / Tech Demos / etc.).  
7. Never sell flamingo / honey / rare+ for commons hedge.  
8. Never R0 sell for counter/hedge.  
9. Never let scout prior trigger sells.  
10. Never finish R1+ with three atk≤2 tanks if shop has atk≥3 spine/teeth.  
11. Never leave last_word/backtap matchup with unhoneyed ≤4hp back.  
12. Never re-honey (invalid_action).

### Seating rules

- Seat0 = max survival score among bulk/grow(hp≥5)/flamingo/hold_the_line/peacock; HP dominates.  
- Seat1 = echo|guard|cover (echo mid, not front).  
- Seat2 = hype|last_word|cover|wake.  
- If seat0.hp≤3 and any seat has hp≥5 → bubble thick to front (hard).  
- last_word/hype never seat0.

### Sell rules

- R0: sell only KIT_WEAK or GHOST_PUNISH.  
- R1+: sell if (a) weak is trash/off-spine and best is spine margin≥1.5, OR (b) same-role upgrade margin≥3, OR (c) live prefer∩spine vs non-prefer margin≥4, OR (d) echo dump vs echo ghost.  
- Max **1** sell per shop turn unless P1 wall-swap requires it.  
- Prefer set for sells = `PLANS.prefer ∩ OMLEJMI_SPINE` (drop sting/spite/wake/mosquito from actionable prefer unless explicitly teeth exception).

### Food rules

- After P0–P1 spends, **reserve 3 gold** for food when food≠null and round≥0 and board===3 (R0 food ok if spare gold).  
- Honey: back→mid→front; skip honeyed; prefer KIT_BACK/KIT_MID.  
- Potato: front wall/grow only if postHp > theirFront.atk; else skip.  
- Apple: weakest non-honey body.  
- improve_fish only if gold≥2 **after** food decision.

### Counter / scout role

| Layer | When | Authority |
|-------|------|-----------|
| Spine + fill-3 + front survival | Always | **Hard gates** |
| Live ghost seats → classify → prefer∩spine | `seenOpponent` | Soft score + gated sells |
| Scout prior / last ghost | Before sight | **Score nudge only (≤0.2×)**; no sells; no arch commits |
| hedgePlan replies | Live only | Prefer∩spine only; widen avoid, do not widen prefer beyond spine |
| Recipes | Offline learning | Do not drive shop until re-validated |

---

## 6. Concrete file-level change list

### `driver/play_loop.js` — replace patchwork with policy engine

1. **Extract `planShop` into phased policy functions** matching P0–P7; single `goldBudget` with reserved food gold.  
2. **Delete or neutralize name-level MUST_BUY / GHOST_COUNTER score bombs** for echo skins when `ghostHasEcho`; prefer kit-level spine bonuses only.  
3. **Clamp counter bias:** `biasScore` only for kits in `OMLEJMI_SPINE ∪ TEETH_EXCEPTION`; ignore sting/spite/mosquito/wake prefers unless teeth shortfall.  
4. **Scout:** keep logging; cap soft bias at 0.2×; assert `!scoutPrior || no sells`.  
5. **Sell loop:** max 1 sell/turn; R0 trash-only; require `prefer ∩ SPINE`; remove multi-guard thrash.  
6. **Teeth gate (R1+):** if all atk≤2, force buy/sell toward atk≥3 hype/grow/peacock/spotlight before reroll.  
7. **Seating:** one pure function `seatBoard(board, threat)` — kill duplicate bubble passes that re-misorder.  
8. **Emergency buy:** score candidates with full `scoreUnit` (no raw first-affordable).  
9. **Bail:** remove rematch restart block entirely (or assert never call restart); delete `bail.bail=false` overlay dead code.  
10. **Telemetry:** log `policyPhase`, `foodReserved`, `teeth`, `frontSurvival`, `sellCount` each shop for next audit.

### `lib/counters.js` — make plans actionable

1. **Rewrite every `prefer` list** to spine-first: bulk, grow, flamingo, echo, hype, guard, hold_the_line, cover, peacock, patch.  
2. Move sting/spite/wake/mosquito/spotlight to optional `preferTeeth` (only if board lacks atk≥3).  
3. **`hedgePlan`:** do **not** union all HEDGE_VS kits into prefer; instead compute `prefer = against.prefer ∩ spine`, `avoid = union(against.avoid, reply avoids)`, `teeth = …`.  
4. Add `effectivePrefer(plan, ourBoard)` helper used by play_loop.  
5. Fix `ko_snowball` / `glass_burst` notes to match WINNING_STRATEGY (walls first; flamingo soak).  
6. Export `SPINE` / `TEETH` sets shared with play_loop (single source of truth).

### Adjacent (small, required for coherence)

- **`lib/scout.js`:** document-only + ensure prior never returned as “live” seats into full planFromKits in play_loop (already mostly true — keep assert).  
- **`lib/avoid.js`:** keep always_fight; delete unreachable bail body or gate behind env `ALLOW_BAIL=0` only.  
- **`lib/ghosts.js`:** no planner change; optional stop writing recipe matchups until recipes re-enabled.

### Out of scope / do not

- Half-measure score tweaks without kill list above.  
- Re-enable recipe planner until spine+food+teeth gates are green.  
- Restart climb as part of this rewrite.

---

## 7. Machine-readable skeleton

See `/workspace/thursday-arena/lib/policy_draft.json`.

---

## 8. Top 7 root causes (executive)

1. Rematch bail / sticky forfeits (elo sink; glass_burst rematch cluster)  
2. Missing food (honey/potato) — gold order + soft gates  
3. Hedge/counter sell thrash deleting spine  
4. Thin / mis-seated fronts vs glass_burst & revenge  
5. All-tank no-teeth losses  
6. Echo/name mirror draw farm (MUST_BUY vs anti-mirror)  
7. Scout/counter prefer sets contradicting KIT_WEAK / spine (poisoned pivots)

**Report path:** `/workspace/thursday-arena/study/omlejmi/FULL_AUDIT.md`
