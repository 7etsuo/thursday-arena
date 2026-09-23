# WIN FORMULA — Thursday Arena root-cause strategy

> **CANONICAL PLAN:** [`COMPLETE_WIN_PLAN.md`](./COMPLETE_WIN_PLAN.md) — full game object model, action space, economy, multi-round theory, archetypes, shop policy P0–P7, Elo objective, gap analysis, roadmap.  
> **This file** remains the **combat appendix** (24-kit encyclopedia, flamingo-pass autopsy, front-survival math). Prefer COMPLETE_WIN_PLAN for planner work; use this for kit timing / matchup forensics.

---


**Date:** 2026-09-18 ~02:20 MT (America/Edmonton)  
**Scope:** READ-ONLY analysis. Climb left running. No edits to `play_loop.js`, `counters.js`, or climb code.  
**Primary complaint:** band-aids (anti-mirror bans, score tweaks) without a derived mathematical win formula.

### Evidence legend
- **PROVEN** — cited from match JSONL frames / result events / catalog fields
- **LIKELY** — composition math from catalog + `frontDiesTo` + kitText
- **SPECULATION** — labeled; not used as a hard rule
- **HYPOTHESIS** — `lib/counters.js` PLANS (verify before trusting)

---

## A. Combat primitives (all 24 kitIds)

Source: `catalog.json` fields `kitId`, `kitText`, `abilityName`, `flavor`. Behavior below quotes kitText; role is inferred from kitText + seating conventions in `study/omlejmi/STRATEGY.md` / `counters.sameRole`.

### `backtap` — Backtap
- **kitText:** "Start of battle: deal 1 damage to the last living enemy"
- **flavor (sample):** "Third-party mentions land on the bot they hid in back."
- **Role guess:** any SoB back-snipe
- **Units (3):** Overheard 4/4 c4 uncommon, Hiring Signals 4/2 c3 common, last30days 4/6 c5 rare
- **Combat identity:** SoB: 1 dmg last living enemy.

### `bulk` — Bulk
- **kitText:** "Start of battle: gain +2 HP"
- **flavor (sample):** "Writes the alt text, then sits there looking sturdy."
- **Role guess:** front (SoB +2hp wall)
- **Units (3):** Imogen 2/6 c3 common, Webby 3/5 c3 common, NYC Parent 2/6 c3 common
- **Combat identity:** SoB self +2 HP (wall opener).

### `cover` — Cover
- **kitText:** "Friend ahead faints: gain +2 ATK"
- **flavor (sample):** "The loop closes when the friend ahead faints."
- **Role guess:** mid/back (atk on ahead faint)
- **Units (3):** GTM Loop Closer 3/6 c4 uncommon, Nightly Audit Engineer 3/6 c4 uncommon, Deal Inspector 4/4 c4 uncommon
- **Combat identity:** When friend ahead faints: +2 ATK.

### `dodo` — Spot
- **kitText:** "Start of battle: give 50% of its ATK to the friend ahead"
- **flavor (sample):** "Preps the interviewer sitting one seat up."
- **Role guess:** SoB buff ahead
- **Units (2):** Recruiting Coordinator 3/5 c4 uncommon, GTM Connections 2/5 c3 common
- **Combat identity:** SoB: give 50% ATK to ahead (stay).

### `drain` — Drain
- **kitText:** "Knock out: restore 2 HP"
- **flavor (sample):** "Lands the price, heals on the kill."
- **Role guess:** KO sustain
- **Units (1):** Deal Hunting 4/2 c3 common
- **Combat identity:** On KO: restore 2 HP.

### `dump` — Dump
- **kitText:** "Start of battle: give 50% ATK to the friend ahead, then faint"
- **flavor (sample):** "Hands the whole deck to the closer, then sits down."
- **Role guess:** suicide buff ahead
- **Units (3):** EBR & Value Deck Builder 2/6 c4 uncommon, Customer Proof Desk 3/6 c5 rare, Product Idea Stress Test 3/7 c5 rare
- **Combat identity:** SoB: give 50% ATK to ahead, then faint.

### `echo` — Echo
- **kitText:** "Friend ahead attacks: gain +1/+1"
- **flavor (sample):** "Grows each time the speaker in front talks."
- **Role guess:** mid (copy ahead swings)
- **Units (4):** Meeting Recap Deck 3/4 c3 common, Cooper 2/5 c3 common, Call Follow-Ups 3/4 c3 common, X Brief 2/4 c3 common
- **Combat identity:** When friend ahead attacks: self +1/+1.

### `first_seat` — First seat
- **kitText:** "Start of battle: move to the front"
- **flavor (sample):** "Supervisor boards the work, then leaps to slot 0."
- **Role guess:** front jumper
- **Units (4):** Lingxi's Engineer Bot 5/6 c6 epic, tinkabot 5/4 c5 rare, Home robots 3/3 c3 common, Tech Demos 4/2 c3 common
- **Combat identity:** SoB: move to front (glass openers / jump).

### `flamingo` — Pass it back
- **kitText:** "Faint: give the two friends behind +1/+1"
- **flavor (sample):** "Dies on the draft and leaves the rewrite behind."
- **Role guess:** front (pass-on-faint)
- **Units (2):** Copy Humanizer 2/5 c3 common, The Morning Newspaper 2/6 c3 common
- **Combat identity:** Pass buff: on faint, +1/+1 to two friends behind (feeds mid grow/eggbot).

### `grow` — Grow
- **kitText:** "Before attack: gain +1/+1"
- **flavor (sample):** "Every swing maxes the points."
- **Role guess:** front/mid scaler
- **Units (3):** Credit Card Max 3/4 c3 common, Apple Search Ads Review 3/3 c3 common, Paid Media Report Desk 3/5 c4 uncommon
- **Combat identity:** Before each attack: +1/+1 (scales while trading).

### `guard` — Guard
- **kitText:** "Start of battle: give the friend ahead +2 HP"
- **flavor (sample):** "Calendar shield for the friend ahead."
- **Role guess:** mid/back (pads ahead)
- **Units (2):** Tradbot 3/6 c4 uncommon, Company Docs Q&A 2/6 c3 common
- **Combat identity:** SoB +2 HP to friend ahead (pads mid/front).

### `hold_the_line` — Hold the line
- **kitText:** "Hurt (front): restore 1 HP"
- **flavor (sample):** "Facilities front that heals while it gets punched."
- **Role guess:** front sustain
- **Units (1):** Office Ops Desk 3/5 c3 common
- **Combat identity:** When hurt while front: restore 1 HP.

### `hype` — Hype
- **kitText:** "Start of battle: give the front-most friend +2 ATK"
- **flavor (sample):** "Does not do the specialist work; it juiced whoever is in front."
- **Role guess:** back (SoB +2 atk front)
- **Units (5):** Projects Manager 3/5 c4 uncommon, Writing Bot 2/5 c3 common, Executive Assistant 2/8 c5 rare, Luma Pages 2/4 c3 common, WTD 3/4 c3 common
- **Combat identity:** SoB +2 ATK to front-most friend.

### `last_word` — Last word
- **kitText:** "Start of battle (back): deal 3 damage to the last living enemy"
- **flavor (sample):** "Fact-check from the back. Nukes their last living bot."
- **Role guess:** back snipe
- **Units (5):** Researchy 3/7 c5 rare, Pitch Deck Coach 4/6 c5 rare, GTM Account Research 3/7 c5 rare, Account Research Desk 3/5 c4 uncommon, Alfred 5/7 c6 epic
- **Combat identity:** SoB (back): 3 dmg last living enemy.

### `mosquito` — Poke
- **kitText:** "Start of battle: deal 1 damage to the enemy front"
- **flavor (sample):** "First outreach lands on whoever they parked in front."
- **Role guess:** chip SoB front
- **Units (4):** Outbound Prospecting 3/4 c3 common, Signal Prospector 3/4 c3 common, GTM Prospecting 4/3 c3 common, dial bot 3/3 c3 common
- **Combat identity:** SoB: 1 dmg enemy front.

### `patch` — Patch
- **kitText:** "Friend ahead hurt: restore 1 HP to that friend"
- **flavor (sample):** "Waters the friend ahead when they get nicked."
- **Role guess:** mid heal-ahead
- **Units (4):** Flora: Plant Care Log 2/6 c3 common, Product Support Inbox Assistant 3/6 c4 uncommon, Chief Health Officer 3/8 c5 rare, Love ❤️ 2/5 c3 common
- **Combat identity:** When friend ahead hurt: heal that friend 1.

### `peacock` — Brace
- **kitText:** "Hurt: gain +3 ATK"
- **flavor (sample):** "Takes the hit, then the next pitch is louder."
- **Role guess:** front revenge
- **Units (2):** Sales Call Coach 4/5 c4 uncommon, Customer Call Coach & Assistant 3/5 c4 uncommon
- **Combat identity:** When hurt: +3 ATK (punishes tip-tap).

### `pin` — Pin
- **kitText:** "Start of battle: deal 1 damage to the enemy in the same seat"
- **flavor (sample):** "Ranks the enemy sitting in the same seat."
- **Role guess:** chip SoB same seat
- **Units (4):** SEO & AEO Desk 2/5 c3 common, AI Search Visibility 3/5 c4 uncommon, Site Audit 3/3 c3 common, Competitor Watch 4/6 c5 rare
- **Combat identity:** SoB: 1 dmg enemy same seat.

### `sidestep` — Sidestep
- **kitText:** "Start of battle: deal 1 damage to the enemy middle"
- **flavor (sample):** "Scores the ask sitting in their middle."
- **Role guess:** chip SoB mid
- **Units (3):** Event Request Desk 3/4 c3 common, Pipeline Pulse 3/4 c3 common, skippy 2/4 c3 common
- **Combat identity:** SoB: 1 dmg enemy middle.

### `snowball` — Snowball
- **kitText:** "Knock out: gain +2/+2"
- **flavor (sample):** "Each found candidate snowballs the next swing."
- **Role guess:** mid/front KO scaler
- **Units (3):** Talent Discovery 4/3 c4 uncommon, Stalk Bot 6/6 c6 epic, Lead Pipeline Desk 4/4 c4 uncommon
- **Combat identity:** On KO: +2/+2.

### `spite` — Spite
- **kitText:** "Faint: deal 2 damage to the enemy front"
- **flavor (sample):** "Day-of chaos: it faints and still pokes their front."
- **Role guess:** faint chip
- **Units (1):** Event Producer 3/3 c3 common
- **Combat identity:** On faint: 2 dmg enemy front.

### `spotlight` — Spotlight
- **kitText:** "Start of battle (front): deal 2 damage to the enemy front"
- **flavor (sample):** "Makes the other bots. Main character wants the front."
- **Role guess:** front burst (SoB if front)
- **Units (3):** dr eggbot 6/5 c6 epic, Game Art Director 5/4 c5 rare, Partnerships Call Coach 4/6 c5 rare
- **Combat identity:** SoB **(front only per kitText)**: 2 dmg to enemy front.
- **Ambiguity note:** kitText says `(front)`. In `match-20260918-021535.log` R2, `dr eggbot` sat **mid** behind flamingo; battle captions show Tradbot pad + flamingo rally, **no** “spotlight” SoB caption. Treat mid-seat spotlight as **likely inert** until proven otherwise.

### `sting` — Sting
- **kitText:** "Hurt: deal 2 damage to the enemy front"
- **flavor (sample):** "While they cut the deal, it pokes their front back."
- **Role guess:** revenge chip
- **Units (3):** Haggle Bot 4/4 c4 uncommon, Critiquito: Design Critique 3/5 c4 uncommon, Ad Spend Watch 4/4 c4 uncommon
- **Combat identity:** When hurt: 2 dmg enemy front.

### `wake` — Wake
- **kitText:** "Friend ahead attacks: deal 1 damage to the enemy front"
- **flavor (sample):** "When the friend ahead cuts, this one clips their front."
- **Role guess:** mid chip-on-ahead-attack
- **Units (4):** Stills & Clips Desk 2/5 c3 common, figma bro 4/4 c4 uncommon, Clip Bot 3/3 c3 common, Video Edit Desk 3/4 c3 common
- **Combat identity:** When friend ahead attacks: 1 dmg to enemy front.

---

## B. Full card table (72 units)

| name | atk/hp | kit | cost | rarity | role guess |
|---|---|---|---:|---|---|
| Hiring Signals | 4/2 | `backtap` | 3 | common | any SoB back-snipe / glass |
| last30days | 4/6 | `backtap` | 5 | rare | any SoB back-snipe |
| Overheard | 4/4 | `backtap` | 4 | uncommon | any SoB back-snipe |
| Imogen | 2/6 | `bulk` | 3 | common | front (SoB +2hp wall) |
| NYC Parent | 2/6 | `bulk` | 3 | common | front (SoB +2hp wall) |
| Webby | 3/5 | `bulk` | 3 | common | front (SoB +2hp wall) |
| Deal Inspector | 4/4 | `cover` | 4 | uncommon | mid/back (atk on ahead faint) |
| GTM Loop Closer | 3/6 | `cover` | 4 | uncommon | mid/back (atk on ahead faint) |
| Nightly Audit Engineer | 3/6 | `cover` | 4 | uncommon | mid/back (atk on ahead faint) |
| GTM Connections | 2/5 | `dodo` | 3 | common | SoB buff ahead |
| Recruiting Coordinator | 3/5 | `dodo` | 4 | uncommon | SoB buff ahead |
| Deal Hunting | 4/2 | `drain` | 3 | common | KO sustain / glass |
| Customer Proof Desk | 3/6 | `dump` | 5 | rare | suicide buff ahead |
| EBR & Value Deck Builder | 2/6 | `dump` | 4 | uncommon | suicide buff ahead |
| Product Idea Stress Test | 3/7 | `dump` | 5 | rare | suicide buff ahead |
| Call Follow-Ups | 3/4 | `echo` | 3 | common | mid (copy ahead swings) |
| Cooper | 2/5 | `echo` | 3 | common | mid (copy ahead swings) |
| Meeting Recap Deck | 3/4 | `echo` | 3 | common | mid (copy ahead swings) |
| X Brief | 2/4 | `echo` | 3 | common | mid (copy ahead swings) |
| Home robots | 3/3 | `first_seat` | 3 | common | front jumper / glass |
| Lingxi's Engineer Bot | 5/6 | `first_seat` | 6 | epic | front jumper |
| Tech Demos | 4/2 | `first_seat` | 3 | common | front jumper / glass |
| tinkabot | 5/4 | `first_seat` | 5 | rare | front jumper |
| Copy Humanizer | 2/5 | `flamingo` | 3 | common | front (pass-on-faint) |
| The Morning Newspaper | 2/6 | `flamingo` | 3 | common | front (pass-on-faint) |
| Apple Search Ads Review | 3/3 | `grow` | 3 | common | front/mid scaler / glass |
| Credit Card Max | 3/4 | `grow` | 3 | common | front/mid scaler |
| Paid Media Report Desk | 3/5 | `grow` | 4 | uncommon | front/mid scaler |
| Company Docs Q&A | 2/6 | `guard` | 3 | common | mid/back (pads ahead) |
| Tradbot | 3/6 | `guard` | 4 | uncommon | mid/back (pads ahead) |
| Office Ops Desk | 3/5 | `hold_the_line` | 3 | common | front sustain |
| Executive Assistant | 2/8 | `hype` | 5 | rare | back (SoB +2 atk front) |
| Luma Pages | 2/4 | `hype` | 3 | common | back (SoB +2 atk front) |
| Projects Manager | 3/5 | `hype` | 4 | uncommon | back (SoB +2 atk front) |
| Writing Bot | 2/5 | `hype` | 3 | common | back (SoB +2 atk front) |
| WTD | 3/4 | `hype` | 3 | common | back (SoB +2 atk front) |
| Account Research Desk | 3/5 | `last_word` | 4 | uncommon | back snipe |
| Alfred | 5/7 | `last_word` | 6 | epic | back snipe |
| GTM Account Research | 3/7 | `last_word` | 5 | rare | back snipe |
| Pitch Deck Coach | 4/6 | `last_word` | 5 | rare | back snipe |
| Researchy | 3/7 | `last_word` | 5 | rare | back snipe |
| dial bot | 3/3 | `mosquito` | 3 | common | chip SoB front / glass |
| GTM Prospecting | 4/3 | `mosquito` | 3 | common | chip SoB front / glass |
| Outbound Prospecting | 3/4 | `mosquito` | 3 | common | chip SoB front |
| Signal Prospector | 3/4 | `mosquito` | 3 | common | chip SoB front |
| Chief Health Officer | 3/8 | `patch` | 5 | rare | mid heal-ahead |
| Flora: Plant Care Log | 2/6 | `patch` | 3 | common | mid heal-ahead |
| Love ❤️ | 2/5 | `patch` | 3 | common | mid heal-ahead |
| Product Support Inbox Assistant | 3/6 | `patch` | 4 | uncommon | mid heal-ahead |
| Customer Call Coach & Assistant | 3/5 | `peacock` | 4 | uncommon | front revenge |
| Sales Call Coach | 4/5 | `peacock` | 4 | uncommon | front revenge |
| AI Search Visibility | 3/5 | `pin` | 4 | uncommon | chip SoB same seat |
| Competitor Watch | 4/6 | `pin` | 5 | rare | chip SoB same seat |
| SEO & AEO Desk | 2/5 | `pin` | 3 | common | chip SoB same seat |
| Site Audit | 3/3 | `pin` | 3 | common | chip SoB same seat / glass |
| Event Request Desk | 3/4 | `sidestep` | 3 | common | chip SoB mid |
| Pipeline Pulse | 3/4 | `sidestep` | 3 | common | chip SoB mid |
| skippy | 2/4 | `sidestep` | 3 | common | chip SoB mid |
| Lead Pipeline Desk | 4/4 | `snowball` | 4 | uncommon | mid/front KO scaler |
| Stalk Bot | 6/6 | `snowball` | 6 | epic | mid/front KO scaler |
| Talent Discovery | 4/3 | `snowball` | 4 | uncommon | mid/front KO scaler / glass |
| Event Producer | 3/3 | `spite` | 3 | common | faint chip |
| dr eggbot | 6/5 | `spotlight` | 6 | epic | front burst (SoB if front) |
| Game Art Director | 5/4 | `spotlight` | 5 | rare | front burst (SoB if front) |
| Partnerships Call Coach | 4/6 | `spotlight` | 5 | rare | front burst (SoB if front) |
| Ad Spend Watch | 4/4 | `sting` | 4 | uncommon | revenge chip |
| Critiquito: Design Critique | 3/5 | `sting` | 4 | uncommon | revenge chip |
| Haggle Bot | 4/4 | `sting` | 4 | uncommon | revenge chip |
| Clip Bot | 3/3 | `wake` | 3 | common | mid chip-on-ahead-attack / glass |
| figma bro | 4/4 | `wake` | 4 | uncommon | mid chip-on-ahead-attack |
| Stills & Clips Desk | 2/5 | `wake` | 3 | common | mid chip-on-ahead-attack |
| Video Edit Desk | 3/4 | `wake` | 3 | common | mid chip-on-ahead-attack |

Source: `catalog.json` (72 entries). Kit map also in `lib/name_to_kit.json`.

---

## C. Matchup math (not vibes)

### C.1 Front-survival inequality (coded)

From `lib/counters.js` `frontDiesTo`:

```
dies  ⇔  theirFront.atk > 0  AND  (ourFront.hp + (honey ? 2 : 0)) <= theirFront.atk
survive ⇔  ourFront.effectiveHp > theirFront.atk
```

`driver/play_loop.js` `theirFrontThreat()` uses **ghost seat0 atk only** (not mid after pass, not grow projection). Potato HP is discussed in `WINNING_STRATEGY.md` but `frontDiesTo` as coded only adds honey +2.

**Bulk SoB +2 HP** is applied in battle frames (caption “bulks up: +2 HP”) but is **not** added inside `frontDiesTo` — planner sees raw board hp.

### C.2 blacksheepjav ghost boards

From `memory/ghosts/the-morning-newspaper-_-credit-card-max-_-tradbot.json` and `...-dr-eggbot-_-tradbot.json` (handle `blacksheepjav`):

| seat | unit | kit | base atk/hp | SoB helpers |
|---:|---|---|---|---|
| 0 | The Morning Newspaper | flamingo | 2/6 | faint → +1/+1 to two behind |
| 1 | Credit Card Max **or** dr eggbot | grow **or** spotlight | 3/4 **or** 6/5 | grow scales; Tradbot pads +2 HP to ahead |
| 2 | Tradbot | guard | 3/6 | SoB +2 HP to friend ahead (seat1) |

R0 often shows `... | luma pages` (hype) before pivoting Tradbot (`match-20260918-021535.log` ghost_seen sequence).

### C.3 Which of OUR common fronts die on contact?

**vs seat0 Morning Newspaper alone (atk=2 base):** almost nothing dies on first contact (Tech Demos 4/2 is the notable DIES). Hyped MN (Luma Pages +2 → atk=4) one-shots thin echos/grow-3hp/clip without honey — **LIKELY** from catalog math; **PROVEN** hyped MN in R0 of `021535` (“Luma Pages juiced The Morning Newspaper: +2 ATK”).

**vs grow mid after flamingo pass (PROVEN chain in `021535` R1):**
1. Tradbot pads CCM → CCM 3/6
2. MN dies → “rallies Credit Card Max: +1/+1” → CCM 4/7
3. CCM “grows into the swing” before attacks → 5/8, then 6/5, then 7/4
4. NYC Parent (bulk, eHP~8 after bulk) **survives MN** but **dies to scaled CCM at 5 atk** while at 3–4 hp residual
5. Tradbot (buffed by pass) holds the floor

| Our front (post-bulk if any) | vs MN atk2 | vs CCM~5 after pass+grow | vs eggbot atk6–7 (after pass; mid spotlight likely off) |
|---|---|---|---|
| NYC Parent / Imogen bulk eHP≈8 | lives | lives first hit if full; dies if already chipped | lives at 8 vs 6; **dies vs 7 if chipped or SoB−2** |
| Webby bulk eHP≈7 | lives | lives vs 5–6; **dies vs 7** | borderline |
| Copy Humanizer 2/5 | lives | **DIES vs 5** | **DIES** |
| Credit Card Max 3/4 | lives | **DIES vs 4+** | **DIES** |
| Call Follow-Ups 3/4 | lives | **DIES vs 4+** | **DIES** |
| Office Ops 3/5 | lives | **DIES vs 5** | **DIES** |

### C.4 WHY 0–2 losses happen (kit interactions)

**PROVEN** from battle frames (`match-20260918-021535.log`, rounds 1–2 winner=`them`):

1. **Flamingo pass is the engine** — MN’s faint buffs the scary mid (CCM or eggbot) and Tradbot.
2. **Grow outscales trades** — each CCM swing adds +1/+1 before attack; residual Tradbot finishes.
3. **Our boards did not delete CCM/eggbot fast enough** — bulk walls soak MN then die to scaled mid; our own flamingo mid (Morning Newspaper / Copy Humanizer) only passes to our back *after* we already lost the tempo race.
4. **Eggbot pivot (R2):** flamingo | spotlight | guard. Eggbot enters at 6/5, Tradbot pads to 6/7, pass → 7/8. NYC Parent trades into 7 atk and dies. Captions show **no spotlight SoB** while eggbot mid — consistent with kitText `(front)`.
5. **Planner telemetry:** every plan in these losses has `frontSurvival: false`. Note: that flag is set `true` only after a successful wall-swap in `planShop` — it is **not** a pure “eHP > threat” boolean. Threat itself is **seat0 atk only** (MN=2), so the real mid threat is invisible to P1.

---

## D. Empirical loss autopsy

### D.1 blacksheepjav window (~02:15–02:17 MT)

Nine logs mention `blacksheepjav`. Vs flamingo/grow/tradbot line: **1W / 6L** (plus 1W vs different fp, 1 mixed eggbot series). Ghost matchup file: 1W/5L on `credit-card-max|tradbot` fp; 0W/2L on `dr-eggbot|tradbot`.

| log | result | elo | rounds | our final board | their fp | arch |
|---|---|---:|---|---|---|---|
| `021535` | loss | −22 | 0–2 | NYC Parent(bulk) \| **Morning Newspaper(flamingo)** \| Call Follow-Ups(echo) | …dr eggbot\|tradbot | glass_burst final |
| `021546` | loss | −21 | 0–2 | NYC Parent \| Office Ops \| Event Request(sidestep) | …CCM\|tradbot | flamingo_pass |
| `021555` | **win** | +11 | 2–0 | Copy Humanizer(flamingo) \| **Credit Card Max(grow)** \| X Brief(echo) | …CCM\|tradbot | flamingo_pass |
| `021605` | loss | −21 | 0–2 | Call Follow-Ups\|Call Follow-Ups\|Luma Pages (double echo) | …CCM\|tradbot | flamingo_pass |
| `021614` | loss | −20 | 0–1 | Webby\|Copy Humanizer\|NYC Parent (all-tank-ish) | …eggbot\|tradbot | glass_burst |
| `021626` | loss | −19 | 0–2 | Docs Q&A\|Docs Q&A\|Writing Bot | …CCM\|tradbot | flamingo_pass |
| `021635` | loss | −18 | 0–2 | NYC Parent\|Webby\|Copy Humanizer | …CCM\|tradbot | flamingo_pass |
| `021645` | loss | −18 | 0–2 | Paid Media(grow)\|Office Ops\|Apple Ads(grow) | …CCM\|tradbot | flamingo_pass |

**Failure clusters (blacksheepjav):**
- Flamingo **kit** mirror (Morning Newspaper name mirror or Copy Humanizer): 3+
- Double echo / echo front: 1 (`021605`)
- All-tank / no teeth (atk≤2 walls): several (`021614`, `021635`)
- Grow tip-trade without enough HP (`021645`)
- Off-spine leftovers (sidestep) kept: `021546`
- `frontSurvival` never flipped true; food often reserved but potato/honey not fixing mid threat

**Only win (`021555`):** `flamingo | grow | echo` with **their** unit name Credit Card Max on mid — raced their grow. Anti-name-mirror (−50 / fill ban) would have **blocked this exact board**.

### D.2 Last 30 losses (broader)

Parsed from newest `matches/climb/match-*.log` with `event=result`/`loss` (multi-label):

| failure mode | count / 30 |
|---|---:|
| R0 underfill / fill3 early path | 16 |
| frontSurvival false on last plan | 11 |
| multi_sell (≥2 across plans) | 4 |
| flamingo kit mirror | 3 |
| all-tank | 3 |
| echo vs echo | 3 |
| double echo | 2 |
| name mirror | 2 |

**Arch of last ghost on losses:** glass_burst 8 · chip_snipe 6 · flamingo_pass 5 · others sparse.

**Concrete boards (quote):**
1. `021535` — `NYC Parent | The Morning Newspaper | Call Follow-Ups` vs MN|eggbot|tradbot → 0–2, elo −22
2. `021605` — `Call Follow-Ups | Call Follow-Ups | Luma Pages` vs MN|CCM|tradbot → 0–2, elo −21
3. `021645` — `Paid Media Report Desk | Office Ops Desk | Apple Search Ads Review` → 0–2, elo −18
4. `021924` — `Paid Media | Signal Prospector(mosquito) | Credit Card Max` vs tech demos|meeting recap|imogen → 1–2, elo −26
5. `021851` — `Copy Humanizer | SEO & AEO Desk(pin) | Account Research Desk` vs same glass_burst → 1–2, elo −27

Contrast wins same window: `021514` Writing Bot|WTD|Alfred vs sustain; `021555` flamingo|grow|echo vs blacksheepjav; `021654` flamingo|echo|guard vs backline_snipe.

---

## E. What top boards do

### E.1 omlejmi (public 100 matches) — `study/omlejmi/STRATEGY.md` + `analysis_full.json`

- **93W / 4D / 3L**; kits on win finals: echo 56 · hype 47 · grow 32 · bulk 29 · flamingo 21
- **Front kits:** grow 23 · bulk 22 · flamingo 19
- **Top triples:** bulk|echo|hype (8), bulk|echo|echo (5), flamingo|echo|hype (3), grow|echo|echo (3), …
- **Food:** honey 83 (back 43, mid 25, front 15); potato 19 mostly front
- **Anti-mirror:** 83/93 wins with **zero** name overlap
- Roles > one recipe; always 3 by round 1

### E.2 Our recipe ledger (`memory/recipes/`, climb-sourced)

Top kit spines by recipe win counts: `flamingo|grow|echo` (10), `bulk|grow|echo` (8), `bulk|echo|hype` (7), `bulk|flamingo|grow` (6). Name spine leaders ironically include `morning newspaper|credit card max|call follow ups` (5W) — **our own past wins on that spine**, not a proof it beats blacksheepjav’s mirror of the same names.

### E.3 Contrast vs losing boards

| Top pattern | Losing blacksheepjav boards |
|---|---|
| Front grow/bulk/flamingo with **teeth** (atk≥3) mid/back | Double echo front; all-tank bulk|bulk|flamingo; guard|guard|hype |
| ≤1 echo; honey back | Echo×2; honey on wrong seats / food without pivot |
| Zero name overlap (omlejmi) | Bought Morning Newspaper / Credit Card Max |
| Pivot seats after R0 | Kept same preview through R1–R2 while ghost pivoted eggbot |

---

## F. Root causes ranked by evidence strength

### PROVEN (logs)

1. **Flamingo → grow/eggbot pass engine beats our slow walls** — battle captions in `021535` R1/R2; 6 losses on that fp family in ghost JSON.
2. **We bought their unit names** — Morning Newspaper on `021535`; Credit Card Max on the lone win `021555` (also recipe matchups).
3. **Double-echo / glass fronts lose clean** — `021605` 0–2.
4. **Ghost pivots mid-series** — R0 luma hype → R1 tradbot → R2 eggbot (`021535` ghost_seen ×3).
5. **`frontSurvival` / threat model blind to mid** — `theirFrontThreat` = seat0 only (`play_loop.js:123–141`); MN atk=2 never forces wall vs real CCM/eggbot threat.
6. **Classifier note lag** — at loss time `ghost_seen.note` was still “outgrow flamingo — no wake/mosquito prefer”; current `counters.js` flamingo_pass note/avoid differs (mtime 02:17 MT) — band-aid landed *during* the bleed.

### LIKELY (composition math)

1. **Seat0 survival ≠ match survival** vs pass+scale arches.
2. **All-tank boards (atk≤2)** lose once grow/peacock/eggbot connects (`WINNING_STRATEGY` + loss boards).
3. **Flamingo kit mirror** is a pass-war, not a counter — omlejmi answers flamingo with grow_scale/hype (`COUNTERS.md`).
4. **Hard name ban blocks some wins** — sole blacksheepjav win used their CCM.

### SPECULATION

- Drone spawn timing may swing close trades (seen in frames) — do not build policy on drones without more n.
- Mid-seat spotlight is inert — strong log support but not a rules dump from the game engine.

---

## G. The win formula (derived from A–F)

Ordered shop priorities. Each cites evidence.

1. **Fill to 3 before any fancy counter** — omlejmi always-3 (`STRATEGY.md`); underfill flag on 16/30 losses (D).
2. **Survive the *effective* front threat, not only seat0** — include projected next-front after flamingo/dodo/dump (C, F5). Minimum: `eHP > max(seat0.atk, seat1.atk + passBonus)` when seat0 is flamingo.
3. **Install teeth (atk≥3, prefer ≥4) by end of R1** — all-tank losses (D); eggbot/CCM scale (C); omlejmi grow/hype counts (E).
4. **vs `flamingo_pass`: do not kit-mirror flamingo; prefer grow/hype/peacock/bulk wall with teeth behind** — omlejmi counter table (E, `COUNTERS.md`); our flamingo-mirror losses (D).
5. **vs grow scale: delete or outpace before 3rd grow tick** — PROVEN CCM path 3→7 atk (C). Potato/honey only if post-buff eHP beats projected atk.
6. **Commons spine seating:** front bulk|grow(hp≥5 & survives)|flamingo · mid echo|guard · back hype|cover — omlejmi (E). Cap echo at 1 vs echo ghosts.
7. **Food:** honey back→mid; potato front iff survival holds — `analysis_full.json` honey_seats (E).
8. **Anti-mirror names when a same-role alternative exists; never leave seats empty to avoid a name** — omlejmi overlap 0 on 83/93 wins (E) **and** our CCM win caveat (D). Soft −score > hard fill-ban when board<3.
9. **Re-classify every round after `ghost_seen`** — eggbot pivot (D1). No R0 sell-for-counter.
10. **Objective:** max WR×volume − 30×loss_rate (`WINNING_STRATEGY.md`).

---

## H. Change impact analysis (NO CODE)

| G rule | Files/functions that would change | Matchups helped | Matchups that could be HURT | How to measure (next 20–50) |
|---|---|---|---|---|
| G2 effective threat (flamingo→mid) | `play_loop.theirFrontThreat`, front-survival block; maybe `counters.frontDiesTo` | flamingo_pass, buff_suicide, cover_swing | False wall-swaps vs weak flamingo-only boards; gold starve food | Loss rate vs arch=`flamingo_pass`; elo on blacksheepjav rematches |
| G3 teeth gate | `planShop` teeth buy (already partial); `scoreUnit` | grow_scale, hurt_revenge, glass_burst eggbot | Overbuying spotlight glass into snowball | % boards with maxAtk≥3 at R1 end; WR when teethOk |
| G4 flamingo avoid (kit) | `counters.PLANS.flamingo_pass.avoid` (already has flamingo/echo); `scoreUnit` kit mirror −4 | pass wars | May skip Copy Humanizer when it was the only wall | Kit-mirror rate vs flamingo ghosts; WR |
| G5 grow race / potato gate | potato branch in `planShop`; grow scoring | grow_scale | Skipping potato that would have lived | Potato skips vs projected atk; R1 WR |
| G8 soften fill name-ban | fill pick predicate `ghostNames.has` hard false | underfill recoveries; CCM-like wins | Name-mirror draw farms return | Name overlap on wins vs losses; draw rate |

### Recommend ONE change first

**Implement G2 only: expand `theirFrontThreat` so when ghost seat0 kit is `flamingo` (or dump/dodo), threat.atk = max(seat0.atk, seat1.atk + 1)** (pass) **, and if seat1 is `grow`, add +1 for first grow tick** — then existing P1 wall-swap / potato skip can fire against the *real* killer.

**Why first:** PROVEN loss mechanism is mid-after-pass, not MN’s 2 atk. Current P1 is mathematically blind (`play_loop.js:123–141`). Does not require new prefer kits, does not harden name bans, does not touch climb loop. Downstream: more wall-swaps into bulk/hold_the_line/peacock vs blacksheepjav; risk is spending food gold on walls — acceptable vs −18..−22 losses.

Success bar: in next 30 settled matches vs `flamingo_pass` arch, loss rate ≤ 25% and zero 0–2 sweeps where our final front eHP ≤ ghost seat1 atk+1.

---

## I. Explicitly reject / refine band-aids

| Recent patch | Follows from G? | Verdict | Reasoning |
|---|---|---|---|
| **Fill-time hard ban of opponent names** (`ghostNames.has` → skip even while underfilled) | Partial G8 — too strong | **REFINE** | Stops Morning Newspaper mirrors (good, D1) but would have blocked `021555` CCM win and fights fill-3 (G1). Prefer: ban only when `board.length===3` or same-role alt in shop. |
| **−50 name score** in `scoreUnit` | Soft form of G8 | **KEEP** | Strong disincentive without forbidding fill. Aligns with omlejmi 0-overlap. |
| **`flamingo_pass.avoid: [flamingo, echo]`** (current counters) | G4 | **KEEP kit avoid; REFINE echo** | Avoiding flamingo kit-mirror is derived (C/D/E). Avoiding *all* echo is harsher than omlejmi (echo is his #1 kit) — prefer “≤1 echo” not “0 echo” unless ghost also has echo. |
| Score tweaks without threat model | — | **REJECT as strategy** | −4 kit mirror / MUST_BUY clamps are local; without G2 they don’t stop 0–2 vs pass+grow. |
| Rematch-bail | contradicts G10 | **REJECT** (already ALWAYS_FIGHT) | Rated forfeit ≈ −25 (`INSTRUCTION_AUDIT.md`). |

---

## Appendix — sources mined

- `catalog.json` (72 units, 24 kits)
- `lib/name_to_kit.json`, `lib/counters.js` (hypothesis PLANS + `frontDiesTo`)
- `study/omlejmi/{STRATEGY,WINNING_STRATEGY,COUNTERS,FULL_AUDIT,INSTRUCTION_AUDIT,REWRITE_NOTES,analysis_full}.md/json`
- `memory/ghosts/the-morning-newspaper-_-credit-card-max-_-tradbot.json`, `...-dr-eggbot-_-tradbot.json`
- `memory/recipes/*` win aggregations
- Match logs: `matches/climb/match-20260918-021535.log` … `021654.log` + last 30 losses
- `driver/play_loop.js` read for threat/score/fill ban only (not modified)

**Climb status at write:** `climb_loop.sh` / `play_loop.js --start` still running; this file is study-only.
