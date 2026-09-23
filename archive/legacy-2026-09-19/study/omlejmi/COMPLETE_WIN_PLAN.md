# COMPLETE_WIN_PLAN — Thursday Arena (canonical)

**Date:** 2026-09-18 ~02:25 MT (America/Edmonton)  
**Status:** Canonical strategy. **Implemented** in `policy_v1` (`driver/play_loop.js` + `lib/counters.js` effectiveThreat) 2026-09-18 ~02:28 MT. Climb left running (hot-load). See `FIX_NOTES.md`.  
**Supersedes as strategy source of truth:** this file.  
**Combat appendix:** `WIN_FORMULA.md` (kit encyclopedia + flamingo-pass autopsy).  

### Evidence legend
- **PROVEN** — catalog fields, API action docs, climb/match JSONL, battle-frame captions, omlejmi 100-match analysis
- **LIKELY** — composition math from kitText + frames + planner code
- **SPECULATION** — labeled; never a hard gate

---

## 1. Game object model

### 1.1 Match / series
| Field | Meaning | Evidence |
|---|---|---|
| `phase.kind` | `shop` \| `battle` \| `result` | PROVEN `api/ACTIONS.md`, observe |
| `phase.round` | Shop/battle index **0-based** (R0, R1, R2) | PROVEN sample_state + climb logs |
| `wins.you` / `wins.them` | Series score; **first to 2** wins match (BO3) | PROVEN omlejmi: 71/100 end in 2 rounds, 29 go to 3 |
| `rated` | Elo applies | PROVEN |
| `seed` / `version` | RNG + optimistic concurrency | PROVEN observe envelope |

Ghost **rebuilds every round** (new board fingerprint each shop after R0). Your board **persists** across rounds (stats + honey flag). PROVEN: omlejmi + climb ghost_seen sequences; board carry in climb applied logs.

### 1.2 Board (you)
| Field | Notes |
|---|---|
| Seats `0..n-1`, **max 3** | Seat 0 = **front** (fights first). Seat 2 = back. PROVEN frames + endShop needs ≥1 |
| Per unit: `botId`, `name`, `kitId`, `atk`, `hp`, `cost`, `rarity`, `honey`, `tempAtk`, `uid` | `honey: true` does **not** change atk/hp in shop; battle summons **Drone 1/1** on faint. PROVEN frames (“Drone joins your side”) |
| Potato/apple | Permanent **+1/+1** on feed (shop atk/hp update). PROVEN climb feed: `2/6 → 3/7` without honey flag |

### 1.3 Shop
| Field | Notes |
|---|---|
| `shop.pets[0..2]` | Up to 3 offers; may be `null` after buy |
| Offer: `cost` (3 common … 6 epic), `atk`/`hp`, `kitId`, `rarity`, `unlockTurn` (1/2/3), **frozen** toggle | PROVEN catalog + freeze action |
| `shop.food` | `apple` \| `honey` \| `potato` \| null — **one** food per shop | PROVEN ACTIONS.md |
| Frozen pets **persist** across reroll into next shop | PROVEN freeze semantics + climb freeze→next round |

### 1.4 Economy scalars (shop)
| Scalar | Value | Evidence |
|---|---|---|
| Gold income / shop | **10** | PROVEN: R0 first buy leaves gold=7 ⇒ started 10; R1/R2 first sell → gold=11 ⇒ started 10 +1 sell |
| Buy | `offer.cost` (usually 3) | PROVEN |
| Sell refund | **+1** | PROVEN ACTIONS.md + climb |
| Reroll | **1** | PROVEN |
| Feed | **3** | PROVEN |
| Move / freeze / endShop / battleDone | **0** | PROVEN |

### 1.5 Catalog inventory
- **72** units, **24** kits (PROVEN `catalog.json` / `arena_catalog`)
- Cost curve: 36×$3, 20×$4, 12×$5, 4×$6 (LIKELY from catalog tally)
- Unlock: turn1 commons-heavy → turn2/3 rares/epics (PROVEN `unlockTurn`)

### 1.6 Ghost fingerprint
`name | name | name` of opponent seats after each battle. Used for anti-mirror (name) and kit classify (archetype). PROVEN `lib/ghosts.js` + study.

---

## 2. Action space (every legal shop action)

| Action | Args | Cost | Constraints | Downstream unlock |
|---|---|---|---|---|
| **buy** | `shopIndex` 0–2 | `cost` | Phase shop; gold≥cost; board\<3; offer non-null | Fills spine role; spend→blocks food if gold\<3; can fix survival |
| **sell** | `boardIndex` | **−1 gold net** (+1 refund) | Board nonempty | Frees seat; funds upgrade; **loses honey/stats**; enables pivot |
| **reroll** | — | 1 | Gold≥1 | Burns shop; keeps **frozen**; unlocks new draws (higher unlockTurn pool as rounds advance) |
| **freeze** | `shopIndex` | 0 | Toggle | Holds rare/spine for **next** shop; opportunity cost = shop slot clutter |
| **feed** | `boardIndex` | 3 | `shop.food` set; never re-honey (invalid) | apple/potato +1/+1; honey→Drone on faint |
| **move** | `boardIndex`, `dir` ±1 | 0 | Neighbor swap | Seating: front survival, hype/last_word back, echo mid |
| **endShop** | — | 0 | ≥1 on board | Locks board → battle |
| **battleDone** | — | 0 | Phase battle | Advance to next shop or result |
| **start** / **restart** | — | — | idle/result | Rated start; **restart = practice/forfeit path — never on rated climb** |

---

## 3. Economy math

### 3.1 Per-round budget
```
gold_start(R) = 10                         # PROVEN
after_fill3_commons ≈ 10 - 9 = 1           # R0 typical if 3×$3
sell+buy same-cost net = +(1) - cost       # sell then buy $3 ⇒ net -2
food = 3                                    # often exactly the leftover after light pivot
reroll = 1                                  # EV tool, not filler
```

### 3.2 Opportunity costs
| Spend | Opportunity cost |
|---|---|
| Buy 4th intent via sell+buy | −2 gold vs hold; loses sticky honey if sold |
| Reroll before fill-3 | Can strand gold on empty seats if shop still trash — only EV+ if board\<3 or shop all KIT_WEAK |
| Food skipped | Permanent −1/−1 or −Drone for **rest of series** — compounds R1→R2 |
| Freeze unaffordable epic | Forgoes reroll slot clarity; good if score≥ rare spine and gold\<cost |
| Sell spine for counter junk | High — omlejmi losses cluster on off-spine leftovers |

### 3.3 When reroll EV is positive (policy)
1. **board.length \< 3** and no affordable non-punish pet → **mandatory** (fill) — PROVEN fill-3 invariant  
2. R0 opener: empty board + all offers score trash → 1 opener reroll — LIKELY  
3. R1+: gold≥2 **after** food decision, shop best \< boardAvg+margin, no frozen gem → improve_fish — LIKELY  
4. **Negative EV:** reroll that spends the last 3 gold that would buy honey/potato — PROVEN food-starvation losses in FULL_AUDIT  

### 3.4 Sell math
- Refund always +1 (not half cost) → **selling $6 epic for $1 is brutal**; only for hard survival / punish  
- Net sell→$3 buy = −2 gold; must buy a **role upgrade**, not a lateral  

---

## 4. Combat engine (full kit graph)

### 4.1 Timing order (PROVEN from battle captions)
```
0. Square up
1. START OF BATTLE (SoB) — order observed: bulk self-HP, hype→front ATK, guard→ahead HP,
   mosquito/pin/sidestep/backtap/last_word/spotlight chips, first_seat move, dodo/dump buffs…
2. Attack loop (front vs front):
   a. BEFORE ATTACK triggers (grow +1/+1)
   b. Simultaneous trade (each deals atk to other)
   c. On-ahead-attack: echo +1/+1; wake 1 dmg to enemy front
   d. HURT triggers: hold_the_line heal, peacock +3 ATK, sting 2 to enemy front, patch heal ahead
   e. If HP≤0 → FAINT: flamingo +1/+1 to two behind; spite 2 to enemy front; cover ahead-faint +2 ATK;
      honey → Drone 1/1 enters front
   f. If faint caused by this unit’s damage → KO: snowball +2/+2; drain restore 2 HP
3. Next living fronts repeat until one side empty
```

### 4.2 All 24 kits (kitText-normalized)

| kitId | Timing | Effect | Role |
|---|---|---|---|
| `bulk` | SoB | self +2 HP | Front wall |
| `grow` | Before attack | self +1/+1 | Front/mid scaler |
| `flamingo` | Faint | two behind +1/+1 | Front pass engine |
| `hold_the_line` | Hurt (front) | restore 1 HP | Front sustain |
| `peacock` | Hurt | self +3 ATK | Front revenge |
| `guard` | SoB | ahead +2 HP | Mid pad |
| `echo` | Ahead attacks | self +1/+1 | Mid scale |
| `patch` | Ahead hurt | ahead restore 1 | Mid heal |
| `wake` | Ahead attacks | 1 dmg enemy front | Mid chip |
| `cover` | Ahead faints | self +2 ATK | Mid/back swing |
| `hype` | SoB | front-most +2 ATK | Back battery |
| `last_word` | SoB (**back**) | 3 dmg last enemy | Back snipe |
| `backtap` | SoB | 1 dmg last enemy | Back poke |
| `mosquito` | SoB | 1 dmg enemy front | Chip |
| `pin` | SoB | 1 dmg same seat | Chip |
| `sidestep` | SoB | 1 dmg enemy mid | Chip |
| `spotlight` | SoB (**front**) | 2 dmg enemy front | Front burst (mid **LIKELY inert**) |
| `first_seat` | SoB | move to front | Glass jump |
| `dodo` | SoB | 50% ATK to ahead | Buff stay |
| `dump` | SoB | 50% ATK to ahead, faint | Suicide buff |
| `snowball` | KO | self +2/+2 | KO scaler |
| `drain` | KO | restore 2 HP | KO sustain |
| `sting` | Hurt | 2 dmg enemy front | Revenge chip |
| `spite` | Faint | 2 dmg enemy front | Faint chip |

### 4.3 Critical interaction chains (PROVEN / LIKELY)
1. **flamingo → grow:** faint pass +1/+1 then grow ticks → mid becomes real threat (PROVEN blacksheepjav / Morning Newspaper frames)  
2. **hype → front:** SoB +2 ATK before first trade (PROVEN “juiced … +2 ATK”)  
3. **guard → ahead:** SoB +2 HP pad (PROVEN Tradbot pad captions)  
4. **echo on ahead attack:** scales every swing (PROVEN “echoes the swing”)  
5. **snowball on KO:** free +2/+2 if you tip-trade into them (LIKELY/PROVEN kitText; deny KOs)  
6. **dump/dodo SoB:** juice ahead then (dump) leave — punish spent front  
7. **honey Drone:** after faint, 1/1 occupies front and can soak/chip (PROVEN)  
8. **Multi-hype:** multiple hype SoB stack on same front (PROVEN double juice frames)

### 4.4 Front survival inequality
```
effectiveHp = hp + (honey ? 2 : 0)   # honey modeled as +2 eHP via Drone — PROVEN counters.frontDiesTo
# potato/apple already in hp
# bulk SoB +2 NOT in shop planner hp — apply in threat projection (LIKELY gap)

dies_to_contact ⇔ their_effective_front_atk > 0 AND effectiveHp <= their_effective_front_atk
```
**Effective threat ≠ seat0 atk** when seat0 is flamingo/dump: project **seat1 after pass** (seat1.atk+1, +1 more if grow). PROVEN loss mechanism in WIN_FORMULA §C–F; current `theirFrontThreat` seat0-only = **planner blindness**.

---

## 5. Multi-round decision theory

### 5.1 Information structure
| Round | Info | Policy |
|---|---|---|
| **R0** | Blind (scout prior soft only) | Fill-3 commons spine; no hedge sells; anti-mirror soft; food if gold≥3 leftover |
| **R1** | Live ghost seats + kits | Reclassify arch; front survive vs **effective** threat; echo cap; food before fish; ≤1 sell |
| **R2** | Series state + second pivot | If **you 1–0**: bias teeth/finish (atk≥4). If **them 1–0**: bias HP/honey/wall. Still fill-3, anti-mirror, teeth |

### 5.2 What persists vs resets
- **Persists:** your units’ atk/hp/honey, series score  
- **Resets:** shop offers (except frozen), food, gold→10, **ghost board** (rebuild)  

### 5.3 Lock vs burn
| Lock | Burn / sell |
|---|---|
| Honeyed unit | Off-spine mosquito/dodo/spite/pin/sidestep |
| Flamingo/bulk wall that still beats effective threat | Extra echo vs echo ghost (keep ≤1) |
| Rare+ spine on-role | Glass first_seat front on R0 |
| Frozen unaffordable rare for R+1 | Name-mirror when same-role alt exists |

### 5.4 Series score pivots
- **1–0 lead:** protect EV — don’t sell thrash; add teeth; freeze win-more rare  
- **0–1 deficit:** allow **one** spine pivot sell if margin≥4 into prefer∩spine wall/teeth; never empty-board gamble  
- **1–1:** maximize P(win round) under loss-avoidance (Elo §8)

---

## 6. Archetypes of viable spines (4–8)

Roles: **F** front · **M** mid · **B** back. Shop pattern = what to buy/freeze.

### A. Bulk Echo Hype (omlejmi #1)
- Seats: F bulk · M echo · B hype  
- Wins: SoB HP + echo scale + hyped trades  
- Loses: snowball tip-trades; last_word into thin back; all-tank if hype missing  
- Shop: commons Imogen/Webby/NYC → Meeting Recap/Call Follow-Ups → Luma/WTD/Writing Bot; honey B→M  

### B. Grow Echo Hype
- F grow (hp≥5 prefer) · M echo · B hype  
- Wins: before-attack scale outpaces chip  
- Loses: dies on contact to hyped glass / peacock; feeds snowball if tip-trades  
- Shop: Credit Card Max / Paid Media; potato F iff post eHP > threat  

### C. Flamingo Echo Hype (pass engine)
- F flamingo · M echo · B hype  
- Wins: pass buffs mid/back; Drone soak  
- Loses: **mirror pass wars**; enemy grow after their pass faster  
- Shop: Morning Newspaper / Copy Humanizer; **do not** kit-mirror enemy flamingo — answer with bulk/grow instead when they’re flamingo_pass  

### D. Bulk Guard Hype (pad wall)
- F bulk · M guard · B hype  
- Wins: SoB +4 effective front HP (bulk+guard) vs burst  
- Loses: no echo scale → long games favor enemy grow/echo  
- Shop: Tradbot / Docs Q&A mid  

### E. Flamingo Grow Cover (pass→scale→swing)
- F flamingo · M grow · B cover  
- Wins: pass into grow; cover swings after F dies  
- Loses: if F deleted without trading; snowball enemy  

### F. Peacock Patch / Hold (revenge sustain)
- F peacock or hold_the_line · M patch · B hype/cover  
- Wins: punish tip-tap; heal through chip  
- Loses: true burst (spotlight front / double hype)  

### G. Snowball denial answer (meta-archetype)
- F bulk/flamingo/hold · M guard/patch · B hype/spotlight  
- Wins: deny free KOs; optional spotlight delete snowball  
- Loses: if you keep grow tip-trading (avoid grow front here)  

### H. Late last_word battery (R1+ unlock)
- F bulk/grow · M echo · B last_word (Alfred line)  
- Wins: SoB 3 dmg deletes thin back  
- Loses: unhoneyed ≤4hp back vs their last_word; needs honey B  

---

## 7. Perfect shop policy (ordered priorities)

Hard sequence **every** shop. Each rule cites §§2–6.

### P0 — FILL 3 (§2 buy, §5 R0, §6)
Never endShop / early-fight with \<3 if any buy or reroll can fill. Emergency buy uses full scoreUnit (no raw first-affordable). Soften anti-mirror only while underfilled; **never** leave seat empty to avoid a name.

### P1 — FRONT SURVIVE vs *effective* threat (§4.4, §6G)
```
threatAtk = seat0.atk
if seat0.kit in {flamingo, dump}: threatAtk = max(threatAtk, seat1.atk+1 + (seat1.kit==grow?1:0))
if seat0.kit==first_seat or enemy mid first_seat: project jumped front atk
survive ⇔ ourFront.hp + honeyBonus + potatoAlreadyInHp + (bulkSoB?2:0 projected) > threatAtk
```
If false → wall-swap into bulk/flamingo/hold_the_line/peacock (sell front if needed). P1 may spend food reserve.

### P2 — ANTI-MIRROR (§5, omlejmi 83/93 zero name overlap)
- Prefer zero **name** overlap with ghost fp when alternative exists  
- Echo: ≤1 vs echo ghost; never 3 echoes  
- Soft −score \> hard fill-ban while board\<3  

### P3 — ROLE SPINE (§6)
Target roles: F ∈ {bulk,grow hp≥5,flamingo,hold_the_line,peacock} · M ∈ {echo,guard,cover,patch} · B ∈ {hype,last_word,cover}  
Dump KIT_WEAK: mosquito,dodo,spite,sidestep,backtap,pin (unless teeth exception).

### P4 — TEETH (§6, FULL_AUDIT all-tank)
By end of R1: ≥1 unit with atk≥3 (prefer ≥4). If all atk≤2 and shop has spine/teeth atk≥3 → buy/sell toward teeth before improve_fish.

### P5 — FOOD (§2 feed, §3, omlejmi honey seats)
After P0–P1, **reserve 3g** when food≠null & board==3.  
- **honey:** back→mid→front; skip honeyed; prefer echo/hype/guard/last_word/cover  
- **potato:** front wall/grow **iff** postHp > effective threat; else skip (don’t potato doomed grow)  
- **apple:** weakest non-honey body  
Never re-honey.

### P6 — LIVE COUNTER (§5 R1+, counters PLANS ∩ spine)
Only if `seenOpponent`. prefer = PLANS.prefer ∩ SPINE (teeth via preferTeeth only if P4 short). Hedge sells: max **1**/shop; margin≥4; never scout-prior sells; never R0 counter sells.

### P7 — REROLL / FREEZE (§2, §3.3)
- improve_fish only with gold left **after** P5  
- Freeze best unaffordable rare+/high-score spine for next shop  
- Opener reroll if empty+trash  

### Seating (after spends)
- Seat0 = max survival among front kits (HP dominates)  
- Never seat0: hype, last_word, echo  
- Bubble hp≥5 over glass hp≤3  
- last_word/hype → back  

### Sell max rules
| Round | Allowed sells |
|---|---|
| R0 | KIT_WEAK or GHOST_PUNISH only; max 1 |
| R1+ | trash→spine margin≥1.5; same-role≥3; hedge∩spine≥4; echo-dump; + optional P1 wall sell |
| Always | Never sell honey/flamingo/rare+ for commons hedge |

---

## 8. Elo objective

### 8.1 Payoff (climb band)
Approximate rated deltas (PROVEN FULL_AUDIT sample / user):  
**Win ≈ +7 · Loss ≈ −23 · Draw ≈ −8**  
(High-ladder omlejmi sees smaller win deltas +2..+3 — same asymmetry shape.)

### 8.2 Objective
Maximize `E[Δelo] = 7 P(W) - 23 P(L) - 8 P(D)` (and volume).

### 8.3 Implications (loss avoidance > thin edges)
1. One loss ≈ **3.3 wins**; one draw ≈ **1.1 wins**  
2. Prefer **safe spine + food** over spicy glass that raises variance  
3. Ban rematch-bail / rated restart (≈ −26 historical)  
4. Cutting draw farms (echo mirror) is +EV even if WR dips slightly  
5. Thin +EV name-mirror bans that cause underfill are **−EV** (refine to soft score)  

Break-even WR vs always-fight garbage: need WR ≫ 23/(7+23) ≈ **77%** to climb fast if draws=0; with draws, push P(L) down first.

---

## 9. Gap analysis vs current planner

Mapped COMPLETE policy (§7) → `driver/play_loop.js` + `lib/counters.js` (read-only). Ranked by Elo impact.

| Rank | Gap | Policy says | Code today | Elo impact |
|---:|---|---|---|---|
| 1 | **Effective threat blindness** | flamingo/dump → project mid+pass(+grow) | `theirFrontThreat` ≈ seat0 atk only | **Critical** — 0–2 sweeps vs pass+grow (WIN_FORMULA) |
| 2 | **Food still starved in practice** | Reserve 3g after fill; feed before fish | Reserve exists but P1/sells/reroll paths still zero food often (FULL_AUDIT 46% no feed) | **Critical** |
| 3 | **Sell thrash / wide hedge** | max 1; prefer∩spine; margins≥4 | Partially patched (max 1, spine prefer) but residual multi-path sells + MUST_BUY tension | **High** |
| 4 | **Thin / mis-seated fronts** | hp≥5 prefer; bubble thick | R0 hp≤4 still common; duplicate bubble passes | **High** |
| 5 | **All-tank / teeth late** | P4 by R1 | Teeth gate present; still 10% all-tank games | **High** |
| 6 | **Echo/name mirror draws** | ≤1 echo; soft name −score | MUST_BUY name bombs vs anti-mirror −8 | **High** (draw −8) |
| 7 | **Bulk SoB not in survival math** | project +2 HP for bulk fronts | frontDiesTo uses raw hp+honey | **Medium** |
| 8 | **Scout prior / recipe disconnect** | nudge ≤0.2×; recipes offline | Soft prior OK-ish; recipes written unused | **Medium** |
| 9 | **Freeze underused / wrong targets** | freeze unaffordable rare spine | Freeze best rare exists; little EV vs pivot needs | **Medium** |
| 10 | **Series 0–1 / 1–0 bias weak** | R2 branch teeth vs wall | Partial comments; soft | **Medium** |
| 11 | **Bail path residue** | never restart | ALWAYS_FIGHT but dead code paths remain | **Low** (regression risk) |
| 12 | **Spotlight mid inert handling** | don’t seat mid spotlight for SoB | Weak | **Low** |

Implemented as `policy_v1` (see FIX_NOTES). Continue measuring §10 metrics on climb logs.

---

## 10. Implementation roadmap (ordered, non-rabbithole)

### Phase 0 — Measurement (no behavior change)
- **Files:** play_loop telemetry only *when* next allowed edit window opens — until then parse climb `match-*.log` offline  
- **Metrics:** foodReserved∧fed rate; frontSurvival vs effectiveThreat; sellCount; teethOk; nameOverlap; arch W/L/D  
- **Success:** dashboard of last 50 settled matches; climb untouched  
- **Risk:** none  

### Phase 1 — Economy / fill / food
- **Files:** `play_loop.js` gold budget + feed ordering; no counters rewrite  
- **Changes:** hard food reserve after fill; forbid improve_fish spending last 3g; scored emergency fill  
- **Risk:** slightly fewer rerolls → slower rare hunting  
- **Metric:** feed rate ≥70% on matches with ≥2 shops; underfill \<10%  

### Phase 2 — Combat threat + spine seating
- **Files:** `play_loop.js` `theirFrontThreat`; optional `counters.frontDiesTo` projected bulk  
- **Changes:** flamingo/dump effective threat (§4.4); single `seatBoard()`; bulk +2 projection  
- **Risk:** over-wall vs weak flamingo-only  
- **Metric:** loss rate vs `flamingo_pass` ≤25% / 30 games; zero 0–2 where eHP≤mid threat  

### Phase 3 — Pivot / freeze / series
- **Files:** play_loop R2 branch; freeze candidate EV; counters preferTeeth only  
- **Changes:** 0–1 survival bias; 1–0 teeth; freeze spine rares; kill MUST_BUY vs echo ghosts  
- **Risk:** over-pivot when ahead  
- **Metric:** draw rate down; rematch mirror draws down; E[Δelo]≥0 on 50-game window  

### Phase 4 — Counter coherence (only after 1–3 green)
- **Files:** `counters.js` hedge no prefer-union; export SPINE/TEETH already present — finish effectivePrefer call sites  
- **Metric:** sell thrash \<3%; spine retention  

### Phase 5 — Learning channel (optional)
- Re-enable recipes only if Phases 1–3 metrics green  

**Explicit non-goals:** one-off flamingo name bans; rematch bail; rabbit-hole single-unit patches without Phase 0 baseline.

---

## Appendix A — Food reference
| Food | Shop effect | Combat | Seat priority |
|---|---|---|---|
| honey | flag `honey` | On faint: **Drone 1/1** joins (PROVEN) | B→M→F |
| apple | +1/+1 (PROVEN) | permanent stats | weakest non-honey |
| potato | +1/+1 (LIKELY; same feed signature) | permanent; use as front pad | front iff survival holds |

## Appendix B — Source index
- `catalog.json` / MCP `arena_catalog` (72/24)  
- `api/ACTIONS.md`, `api/sample_state.json`  
- `study/omlejmi/{STRATEGY,WINNING_STRATEGY,FULL_AUDIT,COUNTERS,analysis_full}.md/json`  
- `WIN_FORMULA.md` (combat appendix)  
- Climb applied logs (gold=10, feed +1/+1, honey)  
- Battle frames (SoB → grow → trade → echo/wake → faint/KO → Drone)  
- `driver/play_loop.js`, `lib/counters.js` (gap map only)

## Appendix C — One-page checklist (tape next to planner)
1. Fill 3  
2. eHP_front > effective_threat  
3. No name mirror if alt; ≤1 echo vs echo  
4. Roles F wall/scaler · M echo/guard · B hype  
5. Teeth atk≥3 by R1  
6. Buy food (honey back, potato front if safe)  
7. Live counter ∩ spine (max 1 sell)  
8. Fish/freeze with leftovers  
9. Seat thick front / hype back  
10. Optimize +7/−23/−8 — don’t donate losses  

---

*End COMPLETE_WIN_PLAN.md — canonical.*
