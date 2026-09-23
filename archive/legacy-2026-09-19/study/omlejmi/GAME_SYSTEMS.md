# GAME_SYSTEMS — Thursday Arena object model

**Date:** 2026-09-18 ~02:26 MT (America/Edmonton)  
**Sources:** `catalog.json` (72), `lib/arena.js`, `api/ACTIONS.md`, `api/sample_state.json`, climb battle frames, omlejmi analysis.  
**Legend:** **PROVEN** · **LIKELY** · **SPECULATION**

Companion strategy: `COMPLETE_WIN_PLAN.md`. Combat autopsy appendix: `WIN_FORMULA.md`.

---

## 1. Object model

### 1.1 Match envelope (PROVEN observe / ACTIONS.md)
| Field | Meaning |
|---|---|
| `phase.kind` | `shop` \| `battle` \| `result` (also `idle` pre-start) |
| `phase.round` | 0-based shop/battle index (R0, R1, R2…) |
| `phase.frames[]` | Battle playback: `{you[], them[], caption}` |
| `wins.{you,them}` | Series score |
| `gold` | Current shop gold |
| `board[]` | Your pets (max **3**) |
| `shop.pets[0..2]` | Offers or `null` |
| `shop.food` | `apple` \| `honey` \| `potato` \| null |
| `version` | Optimistic concurrency; stale → HTTP 409 + fresh state |
| `seed`, `rated`, `opponentHandle` | RNG / elo / ghost id |

### 1.2 Board unit (PROVEN sample_state + frames)
`uid`, `botId`, `name`, `kitId`, `kitText`, `abilityName`, `atk`, `hp`, `tempAtk`, `honey`, `cost`, `rarity`, `attackBase`, `healthBase`.

- **Seat 0 = front** (fights first); seat 2 = back. **PROVEN** captions + seating conventions.
- `honey: true` does **not** raise shop atk/hp; on faint summons **Drone 1/1**. **PROVEN** (“Drone joins … side”).
- Potato/apple permanently bump shop stats (**PROVEN** apple +1/+1 in arena docs; potato same feed signature **LIKELY**).

### 1.3 Catalog (PROVEN)
- **72** bots, **24** `kitId`s.
- Fields: `id`, `name`, `kitId`, `kitText`, `abilityName`, `attack`, `health`, `cost`, `rarity`, `unlockTurn` (1/2/3), `flavor`.
- Unlock mix: turn1×36, turn2×20, turn3×16 (**PROVEN** tally).

### 1.4 Series rules (PROVEN climb + omlejmi)
- Best of / **first to 2** round wins. Finals cluster `2-0`, `0-2`, `2-1`, `1-2`.
- Ghost **rebuilds every round**; **your board persists** (stats + honey) across shops. **PROVEN** ghost_seen sequences + board carry.

---

## 2. Actions (PROVEN `lib/arena.js` / `api/ACTIONS.md`)

| Action | Args | Cost | Notes |
|---|---|---|---|
| `buy` | `shopIndex` 0–2 | `offer.cost` (typ. 3) | Needs board \< 3 |
| `sell` | `boardIndex` | **+1** refund | Loses honey/stats; frees seat |
| `reroll` | — | **1** | Refresh unfrozen slots |
| `freeze` | `shopIndex` | 0 | Toggle; frozen persist across reroll/next shop |
| `feed` | `boardIndex` | **3** | Applies `shop.food`; never re-honey (`invalid_action`) |
| `move` | `boardIndex`, `dir` ±1 | 0 | Swap with neighbor |
| `endShop` | — | 0 | Fight; needs ≥1 on board |
| `battleDone` | — | 0 | Advance after playback |
| `start` / `restart` | — | — | Rated start; **restart mid-match ≈ rated forfeit (−25/−26)** — never on climb |

---

## 3. Gold / food economy

### 3.1 Scalars (PROVEN)
| Scalar | Value |
|---|---|
| Gold income / shop | **10** (climb applied: first R0 buy leaves 7; R1 after sell shows 11) |
| Buy | `cost` |
| Sell | +1 |
| Reroll | 1 |
| Feed | 3 |
| Move / freeze / endShop | 0 |

### 3.2 Food (PROVEN / LIKELY)
| Food | Shop effect | Combat | Seat priority (omlejmi) |
|---|---|---|---|
| **honey** | Sets `honey` flag | On faint → **Drone 1/1** (**PROVEN**). Planner models +2 eHP via Drone (**LIKELY** / coded `frontDiesTo`) | back 43 · mid 25 · front 15 |
| **apple** | **+1/+1** (**PROVEN** arena notes) | Permanent | Weakest non-honey |
| **potato** | **+1/+1** (**LIKELY** same feed path) | Permanent front pad | Front **iff** survival holds (potato 19, mostly front) |

### 3.3 Opportunity costs (LIKELY policy math)
- After 3×$3 fills → ~1g left → **cannot food** without sells/prior savings.
- Sell→$3 buy net **−2g**; must be a role upgrade.
- Spending last 3g on reroll when food present → food starvation (**PROVEN** FULL_AUDIT).
- Selling $5–6 rare for +1 refund is brutal — survival/punish only.

---

## 4. Combat timing (all kits)

### 4.1 Engine loop (PROVEN captions)
```
0. "The teams square up"
1. START OF BATTLE (SoB) — self/buff/chip/move in one SoB window
2. Attack loop (living fronts):
   a. BEFORE ATTACK (grow +1/+1)
   b. Simultaneous trade (−atk HP each)
   c. On-ahead-attack: echo +1/+1; wake 1→enemy front
   d. HURT: hold_the_line +1 HP; peacock +3 ATK; sting 2→enemy front; patch heal ahead
   e. FAINT (hp≤0): flamingo +1/+1 to two behind; spite 2→enemy front; cover ahead-faint +2 ATK;
      honey → Drone 1/1 enters
   f. KO (this unit caused faint): snowball +2/+2; drain restore 2
3. Repeat until one side empty → "holds the floor" / draw
```

Exact intra-SoB ordering between kits is **LIKELY** (observed: bulk → hype juice → trades; mosquito “snipes” early; first_seat “takes first seat”). Full engine sort key is **SPECULATION**.

### 4.2 Kit timing encyclopedia

| kitId | Timing | Effect (kitText) | Caption verb (PROVEN samples) | Tag |
|---|---|---|---|---|
| `bulk` | SoB | self +2 HP | “bulks up: +2 HP” | PROVEN |
| `hype` | SoB | front-most friend +2 ATK | “juiced …: +2 ATK” | PROVEN |
| `guard` | SoB | friend ahead +2 HP | pad visible in frames | PROVEN |
| `mosquito` | SoB | 1 dmg enemy front | “snipes … for 1” | PROVEN |
| `pin` | SoB | 1 dmg same seat | “pins …: 1” | PROVEN |
| `sidestep` | SoB | 1 dmg enemy middle | kitText; fewer captions | LIKELY |
| `backtap` | SoB | 1 dmg last living enemy | kitText | LIKELY |
| `last_word` | SoB (**back**) | 3 dmg last living enemy | kitText; thin-back losses | LIKELY |
| `spotlight` | SoB (**front**) | 2 dmg enemy front | mid-seat often no SoB caption | LIKELY inert mid |
| `first_seat` | SoB | move to front | “takes first seat” | PROVEN |
| `dodo` | SoB | give 50% ATK to ahead | kitText | LIKELY |
| `dump` | SoB | 50% ATK to ahead, then faint | “hands … +N ATK” | PROVEN (rare) |
| `grow` | Before attack | self +1/+1 | “grows into the swing: +1/+1” | PROVEN |
| `echo` | Ahead attacks | self +1/+1 | “echoes the swing: +1/+1” | PROVEN |
| `wake` | Ahead attacks | 1 dmg enemy front | “wakes on the swing: 1 to …” | PROVEN |
| `hold_the_line` | Hurt (front) | restore 1 HP | “holds: +1 HP” | PROVEN |
| `peacock` | Hurt | self +3 ATK | kitText | LIKELY |
| `sting` | Hurt | 2 dmg enemy front | “stings …: 2” | PROVEN |
| `patch` | Ahead hurt | ahead restore 1 | “patches …: +1 HP” | PROVEN |
| `flamingo` | Faint | two behind +1/+1 | “rallies …: +1/+1” | PROVEN |
| `spite` | Faint | 2 dmg enemy front | kitText | LIKELY |
| `cover` | Ahead faints | self +2 ATK | “covers the fall: +2 ATK” | PROVEN |
| `snowball` | KO | self +2/+2 | “snowballs the knock-out: +2/+2” | PROVEN |
| `drain` | KO | restore 2 HP | kitText | LIKELY |

### 4.3 Critical chains (PROVEN)
1. **flamingo pass → mid grow:** “rallies Credit Card Max” then repeated “grows into the swing” → mid becomes true threat (seat0 atk=2 is a lie).
2. **hype + front trade:** juice before first contact.
3. **guard pad + flamingo pass:** Tradbot pads mid, then pass buffs mid/back.
4. **honey Drone:** after faint, 1/1 occupies and trades.
5. **Multi-hype:** multiple “juiced” lines stack.

### 4.4 Front survival math
```
eHP = hp + (honey ? 2 : 0) + (kit==bulk ? 2 : 0)   # bulk SoB projected — LIKELY planner need
# apple/potato already in hp

effectiveThreat(seats):
  t = seats[0].atk
  if seats[0].kit in {flamingo, dump, dodo}:
    mid = seats[1]
    proj = (mid.atk||0) + 1                    # pass/buff floor
    if mid.kit == grow: proj += 1              # first grow tick
    if seats has hype: seats[0].atk may be +2  # if hype still alive SoB — LIKELY
    t = max(t, proj)
  # first_seat elsewhere: jumped unit may become front — LIKELY

dies ⇔ t > 0 AND eHP <= t
```
**PROVEN** that seat0-only threat blinds P1 vs flamingo_pass (WIN_FORMULA / COMPLETE_WIN_PLAN §4.4).

---

## 5. Role seating conventions (LIKELY from omlejmi + counters.sameRole)

| Role | Kits |
|---|---|
| Front | `bulk`, `grow` (hp≥5), `flamingo`, `hold_the_line`, `peacock`, `spotlight` (if SoB needed) |
| Mid | `echo`, `guard`, `patch`, `cover`, `wake` |
| Back | `hype`, `last_word`, `cover`, `backtap` |

Never seat0: `hype`, `last_word` (**LIKELY** — wastes SoB / dies early). Echo prefers mid (draw farm if front + echo-ghost).

---

## 6. Shop loop integration (PROVEN play_loop)

```
observe shop → plan actions → apply → (reroll → replan once) →
emergency fill-3 → endShop → ghost_seen from frames[0].them →
battleDone… → next shop or result
```

Recipes: record-only; planner disabled. Rematch bail: removed / always-fight.

---

## 7. Elo band (PROVEN climb sample ~last 120 results)

| Outcome | Typical Δ |
|---|---|
| Win | **≈ +7** (sample avg ~7.4; range ~4..16) |
| Loss | **≈ −23** (sample avg ~−21; range ~−27..−16) |
| Draw | **≈ −8** (sample avg ~−5; user/avoid band −8) |

Objective: maximize `7P(W)−23P(L)−8P(D)`. One loss ≈ 3+ wins.

---

*End GAME_SYSTEMS.md*
