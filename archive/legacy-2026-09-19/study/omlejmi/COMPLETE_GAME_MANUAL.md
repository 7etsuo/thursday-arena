# Thursday Arena — COMPLETE GAME MANUAL & WIN PLAN

**Generated from:** `catalog.json` (72 units), `lib/arena.js` (action API), climb battle/shop logs, `study/omlejmi/*`.
**Honesty rule:** every claim tagged **PROVEN** (cited) / **LIKELY** (math from proven rules) / **UNKNOWN** (need client combat source).
**No planner code was changed while writing this document.**

---

## 1. Match & rating objective (PROVEN from climb ledger)

From last ~158 settled climb results:
- Win ≈ **+7.0** elo (range +3..+13)
- Loss ≈ **−23.3** elo (range −18..−29)
- Draw ≈ **−8.4** elo

Break-even with no draws: need WR ≥ **76.8%**.
One loss costs **~3.3 wins** to erase.
Objective function: **maximize E[Δelo] = 7p_w − 23p_l − 8p_d**, not “cool boards.”
Sticky rematches into a losing line are elo poison (e.g. one farm series −128).

---

## 2. Match structure (PROVEN from `phase.round` in match logs)

- Series of **shop → fight** rounds (`phase.kind = shop|result`, `phase.round` = 1,2,…).
- Board persists across rounds inside a match; gold refills each shop (logs show ~10–11g after sell+income patterns).
- First to win enough fights wins the match (logs show 2-0, 2-1, 0-2, 1-1 draws) — **LIKELY BO3** (first to 2).
- Opponent board (“ghost”) can change composition between rounds — **PROVEN** (same handle, different fp across rounds).

---

## 3. Shop action space (PROVEN `lib/arena.js`)

| Action | Cost | Effect |
|--------|------|--------|
| buy | unit cost (catalog `cost`) | move shop pet onto board |
| sell | refund **1** | remove board pet, +1g |
| reroll | **1** | replace unfrozen shop pets |
| freeze | **0** | toggle: pet survives reroll |
| move | **0** | change seat order |
| feed | **3** | apply `shop.food` to one board pet |
| endShop | **0** | start combat |

Shop offers **3 pets** + optional **food**.
Board max **3 pets**.

### Food (PROVEN arena notes + board `+honey` in logs)
- **apple:** +1/+1
- **honey:** applies sticky honey (boards render `+honey`; planner treats as extra eHP — combat exact honey HP bonus **LIKELY +1 or +2**, confirm in client)
- **potato:** food item in API union — exact combat effect **UNKNOWN** without client (do not invent)

### Gold / RNG (PROVEN patterns + UNKNOWN RNG seed)
- Each shop you receive gold (observe frames show spends from ~10–11 after sells).
- Shop pets are a random draw from unlock pool weighted by turn/rarity — **exact weights UNKNOWN** without server code.
- **Freeze** is the RNG hedge: lock a spine unit, reroll the rest.
- **Reroll** costs 1: positive EV when none of 3 offers advance P0–P4 priorities.
- **Sell refund 1** on a 3-cost unit = net −2 to replace — only sell when role upgrade / survival demands it.

---

## 4. Combat primitives — all kits (PROVEN `kitText` from catalog)


### Kit `backtap` — Backtap
- **Text:** Start of battle: deal 1 damage to the last living enemy
- **Units (3):**
  - **Hiring Signals** — 4/2, cost 3, common, unlock turn 1
  - **Overheard** — 4/4, cost 4, uncommon, unlock turn 2
  - **last30days** — 4/6, cost 5, rare, unlock turn 3

### Kit `bulk` — Bulk
- **Text:** Start of battle: gain +2 HP
- **Units (3):**
  - **Imogen** — 2/6, cost 3, common, unlock turn 1
  - **NYC Parent** — 2/6, cost 3, common, unlock turn 1
  - **Webby** — 3/5, cost 3, common, unlock turn 1

### Kit `cover` — Cover
- **Text:** Friend ahead faints: gain +2 ATK
- **Units (3):**
  - **Deal Inspector** — 4/4, cost 4, uncommon, unlock turn 2
  - **GTM Loop Closer** — 3/6, cost 4, uncommon, unlock turn 2
  - **Nightly Audit Engineer** — 3/6, cost 4, uncommon, unlock turn 2

### Kit `dodo` — Spot
- **Text:** Start of battle: give 50% of its ATK to the friend ahead
- **Units (2):**
  - **GTM Connections** — 2/5, cost 3, common, unlock turn 1
  - **Recruiting Coordinator** — 3/5, cost 4, uncommon, unlock turn 2

### Kit `drain` — Drain
- **Text:** Knock out: restore 2 HP
- **Units (1):**
  - **Deal Hunting** — 4/2, cost 3, common, unlock turn 1

### Kit `dump` — Dump
- **Text:** Start of battle: give 50% ATK to the friend ahead, then faint
- **Units (3):**
  - **EBR & Value Deck Builder** — 2/6, cost 4, uncommon, unlock turn 2
  - **Customer Proof Desk** — 3/6, cost 5, rare, unlock turn 3
  - **Product Idea Stress Test** — 3/7, cost 5, rare, unlock turn 3

### Kit `echo` — Echo
- **Text:** Friend ahead attacks: gain +1/+1
- **Units (4):**
  - **Call Follow-Ups** — 3/4, cost 3, common, unlock turn 1
  - **Cooper** — 2/5, cost 3, common, unlock turn 1
  - **Meeting Recap Deck** — 3/4, cost 3, common, unlock turn 1
  - **X Brief** — 2/4, cost 3, common, unlock turn 1

### Kit `first_seat` — First seat
- **Text:** Start of battle: move to the front
- **Units (4):**
  - **Home robots** — 3/3, cost 3, common, unlock turn 1
  - **Tech Demos** — 4/2, cost 3, common, unlock turn 1
  - **tinkabot** — 5/4, cost 5, rare, unlock turn 3
  - **Lingxi's Engineer Bot** — 5/6, cost 6, epic, unlock turn 3

### Kit `flamingo` — Pass it back
- **Text:** Faint: give the two friends behind +1/+1
- **Units (2):**
  - **Copy Humanizer** — 2/5, cost 3, common, unlock turn 1
  - **The Morning Newspaper** — 2/6, cost 3, common, unlock turn 1

### Kit `grow` — Grow
- **Text:** Before attack: gain +1/+1
- **Units (3):**
  - **Apple Search Ads Review** — 3/3, cost 3, common, unlock turn 1
  - **Credit Card Max** — 3/4, cost 3, common, unlock turn 1
  - **Paid Media Report Desk** — 3/5, cost 4, uncommon, unlock turn 2

### Kit `guard` — Guard
- **Text:** Start of battle: give the friend ahead +2 HP
- **Units (2):**
  - **Company Docs Q&A** — 2/6, cost 3, common, unlock turn 1
  - **Tradbot** — 3/6, cost 4, uncommon, unlock turn 2

### Kit `hold_the_line` — Hold the line
- **Text:** Hurt (front): restore 1 HP
- **Units (1):**
  - **Office Ops Desk** — 3/5, cost 3, common, unlock turn 1

### Kit `hype` — Hype
- **Text:** Start of battle: give the front-most friend +2 ATK
- **Units (5):**
  - **Luma Pages** — 2/4, cost 3, common, unlock turn 1
  - **WTD** — 3/4, cost 3, common, unlock turn 1
  - **Writing Bot** — 2/5, cost 3, common, unlock turn 1
  - **Projects Manager** — 3/5, cost 4, uncommon, unlock turn 2
  - **Executive Assistant** — 2/8, cost 5, rare, unlock turn 3

### Kit `last_word` — Last word
- **Text:** Start of battle (back): deal 3 damage to the last living enemy
- **Units (5):**
  - **Account Research Desk** — 3/5, cost 4, uncommon, unlock turn 2
  - **GTM Account Research** — 3/7, cost 5, rare, unlock turn 3
  - **Pitch Deck Coach** — 4/6, cost 5, rare, unlock turn 3
  - **Researchy** — 3/7, cost 5, rare, unlock turn 3
  - **Alfred** — 5/7, cost 6, epic, unlock turn 3

### Kit `mosquito` — Poke
- **Text:** Start of battle: deal 1 damage to the enemy front
- **Units (4):**
  - **GTM Prospecting** — 4/3, cost 3, common, unlock turn 1
  - **Outbound Prospecting** — 3/4, cost 3, common, unlock turn 1
  - **Signal Prospector** — 3/4, cost 3, common, unlock turn 1
  - **dial bot** — 3/3, cost 3, common, unlock turn 1

### Kit `patch` — Patch
- **Text:** Friend ahead hurt: restore 1 HP to that friend
- **Units (4):**
  - **Flora: Plant Care Log** — 2/6, cost 3, common, unlock turn 1
  - **Love ❤️** — 2/5, cost 3, common, unlock turn 1
  - **Product Support Inbox Assistant** — 3/6, cost 4, uncommon, unlock turn 2
  - **Chief Health Officer** — 3/8, cost 5, rare, unlock turn 3

### Kit `peacock` — Brace
- **Text:** Hurt: gain +3 ATK
- **Units (2):**
  - **Customer Call Coach & Assistant** — 3/5, cost 4, uncommon, unlock turn 2
  - **Sales Call Coach** — 4/5, cost 4, uncommon, unlock turn 2

### Kit `pin` — Pin
- **Text:** Start of battle: deal 1 damage to the enemy in the same seat
- **Units (4):**
  - **SEO & AEO Desk** — 2/5, cost 3, common, unlock turn 1
  - **Site Audit** — 3/3, cost 3, common, unlock turn 1
  - **AI Search Visibility** — 3/5, cost 4, uncommon, unlock turn 2
  - **Competitor Watch** — 4/6, cost 5, rare, unlock turn 3

### Kit `sidestep` — Sidestep
- **Text:** Start of battle: deal 1 damage to the enemy middle
- **Units (3):**
  - **Event Request Desk** — 3/4, cost 3, common, unlock turn 1
  - **Pipeline Pulse** — 3/4, cost 3, common, unlock turn 1
  - **skippy** — 2/4, cost 3, common, unlock turn 1

### Kit `snowball` — Snowball
- **Text:** Knock out: gain +2/+2
- **Units (3):**
  - **Lead Pipeline Desk** — 4/4, cost 4, uncommon, unlock turn 2
  - **Talent Discovery** — 4/3, cost 4, uncommon, unlock turn 2
  - **Stalk Bot** — 6/6, cost 6, epic, unlock turn 3

### Kit `spite` — Spite
- **Text:** Faint: deal 2 damage to the enemy front
- **Units (1):**
  - **Event Producer** — 3/3, cost 3, common, unlock turn 1

### Kit `spotlight` — Spotlight
- **Text:** Start of battle (front): deal 2 damage to the enemy front
- **Units (3):**
  - **Game Art Director** — 5/4, cost 5, rare, unlock turn 3
  - **Partnerships Call Coach** — 4/6, cost 5, rare, unlock turn 3
  - **dr eggbot** — 6/5, cost 6, epic, unlock turn 3

### Kit `sting` — Sting
- **Text:** Hurt: deal 2 damage to the enemy front
- **Units (3):**
  - **Ad Spend Watch** — 4/4, cost 4, uncommon, unlock turn 2
  - **Critiquito: Design Critique** — 3/5, cost 4, uncommon, unlock turn 2
  - **Haggle Bot** — 4/4, cost 4, uncommon, unlock turn 2

### Kit `wake` — Wake
- **Text:** Friend ahead attacks: deal 1 damage to the enemy front
- **Units (4):**
  - **Clip Bot** — 3/3, cost 3, common, unlock turn 1
  - **Stills & Clips Desk** — 2/5, cost 3, common, unlock turn 1
  - **Video Edit Desk** — 3/4, cost 3, common, unlock turn 1
  - **figma bro** — 4/4, cost 4, uncommon, unlock turn 2

---

## 5. Full card table (all 72) (PROVEN catalog)

| Name | Atk | HP | Cost | Rarity | Unlock | Kit | Ability |
|------|-----|----|------|--------|--------|-----|----------|
| Hiring Signals | 4 | 2 | 3 | common | 1 | `backtap` | Backtap |
| Overheard | 4 | 4 | 4 | uncommon | 2 | `backtap` | Backtap |
| last30days | 4 | 6 | 5 | rare | 3 | `backtap` | Backtap |
| Imogen | 2 | 6 | 3 | common | 1 | `bulk` | Bulk |
| NYC Parent | 2 | 6 | 3 | common | 1 | `bulk` | Bulk |
| Webby | 3 | 5 | 3 | common | 1 | `bulk` | Bulk |
| Deal Inspector | 4 | 4 | 4 | uncommon | 2 | `cover` | Cover |
| GTM Loop Closer | 3 | 6 | 4 | uncommon | 2 | `cover` | Cover |
| Nightly Audit Engineer | 3 | 6 | 4 | uncommon | 2 | `cover` | Cover |
| GTM Connections | 2 | 5 | 3 | common | 1 | `dodo` | Spot |
| Recruiting Coordinator | 3 | 5 | 4 | uncommon | 2 | `dodo` | Spot |
| Deal Hunting | 4 | 2 | 3 | common | 1 | `drain` | Drain |
| EBR & Value Deck Builder | 2 | 6 | 4 | uncommon | 2 | `dump` | Dump |
| Customer Proof Desk | 3 | 6 | 5 | rare | 3 | `dump` | Dump |
| Product Idea Stress Test | 3 | 7 | 5 | rare | 3 | `dump` | Dump |
| Call Follow-Ups | 3 | 4 | 3 | common | 1 | `echo` | Echo |
| Cooper | 2 | 5 | 3 | common | 1 | `echo` | Echo |
| Meeting Recap Deck | 3 | 4 | 3 | common | 1 | `echo` | Echo |
| X Brief | 2 | 4 | 3 | common | 1 | `echo` | Echo |
| Home robots | 3 | 3 | 3 | common | 1 | `first_seat` | First seat |
| Tech Demos | 4 | 2 | 3 | common | 1 | `first_seat` | First seat |
| tinkabot | 5 | 4 | 5 | rare | 3 | `first_seat` | First seat |
| Lingxi's Engineer Bot | 5 | 6 | 6 | epic | 3 | `first_seat` | First seat |
| Copy Humanizer | 2 | 5 | 3 | common | 1 | `flamingo` | Pass it back |
| The Morning Newspaper | 2 | 6 | 3 | common | 1 | `flamingo` | Pass it back |
| Apple Search Ads Review | 3 | 3 | 3 | common | 1 | `grow` | Grow |
| Credit Card Max | 3 | 4 | 3 | common | 1 | `grow` | Grow |
| Paid Media Report Desk | 3 | 5 | 4 | uncommon | 2 | `grow` | Grow |
| Company Docs Q&A | 2 | 6 | 3 | common | 1 | `guard` | Guard |
| Tradbot | 3 | 6 | 4 | uncommon | 2 | `guard` | Guard |
| Office Ops Desk | 3 | 5 | 3 | common | 1 | `hold_the_line` | Hold the line |
| Luma Pages | 2 | 4 | 3 | common | 1 | `hype` | Hype |
| WTD | 3 | 4 | 3 | common | 1 | `hype` | Hype |
| Writing Bot | 2 | 5 | 3 | common | 1 | `hype` | Hype |
| Projects Manager | 3 | 5 | 4 | uncommon | 2 | `hype` | Hype |
| Executive Assistant | 2 | 8 | 5 | rare | 3 | `hype` | Hype |
| Account Research Desk | 3 | 5 | 4 | uncommon | 2 | `last_word` | Scout |
| GTM Account Research | 3 | 7 | 5 | rare | 3 | `last_word` | Scout |
| Pitch Deck Coach | 4 | 6 | 5 | rare | 3 | `last_word` | Last word |
| Researchy | 3 | 7 | 5 | rare | 3 | `last_word` | Last word |
| Alfred | 5 | 7 | 6 | epic | 3 | `last_word` | Last word |
| GTM Prospecting | 4 | 3 | 3 | common | 1 | `mosquito` | Poke |
| Outbound Prospecting | 3 | 4 | 3 | common | 1 | `mosquito` | Poke |
| Signal Prospector | 3 | 4 | 3 | common | 1 | `mosquito` | Poke |
| dial bot | 3 | 3 | 3 | common | 1 | `mosquito` | Poke |
| Flora: Plant Care Log | 2 | 6 | 3 | common | 1 | `patch` | Patch |
| Love ❤️ | 2 | 5 | 3 | common | 1 | `patch` | Patch |
| Product Support Inbox Assistant | 3 | 6 | 4 | uncommon | 2 | `patch` | Patch |
| Chief Health Officer | 3 | 8 | 5 | rare | 3 | `patch` | Patch |
| Customer Call Coach & Assistant | 3 | 5 | 4 | uncommon | 2 | `peacock` | Brace |
| Sales Call Coach | 4 | 5 | 4 | uncommon | 2 | `peacock` | Brace |
| SEO & AEO Desk | 2 | 5 | 3 | common | 1 | `pin` | Pin |
| Site Audit | 3 | 3 | 3 | common | 1 | `pin` | Pin |
| AI Search Visibility | 3 | 5 | 4 | uncommon | 2 | `pin` | Pin |
| Competitor Watch | 4 | 6 | 5 | rare | 3 | `pin` | Pin |
| Event Request Desk | 3 | 4 | 3 | common | 1 | `sidestep` | Sidestep |
| Pipeline Pulse | 3 | 4 | 3 | common | 1 | `sidestep` | Sidestep |
| skippy | 2 | 4 | 3 | common | 1 | `sidestep` | Sidestep |
| Lead Pipeline Desk | 4 | 4 | 4 | uncommon | 2 | `snowball` | Snowball |
| Talent Discovery | 4 | 3 | 4 | uncommon | 2 | `snowball` | Snowball |
| Stalk Bot | 6 | 6 | 6 | epic | 3 | `snowball` | Snowball |
| Event Producer | 3 | 3 | 3 | common | 1 | `spite` | Spite |
| Game Art Director | 5 | 4 | 5 | rare | 3 | `spotlight` | Spotlight |
| Partnerships Call Coach | 4 | 6 | 5 | rare | 3 | `spotlight` | Spotlight |
| dr eggbot | 6 | 5 | 6 | epic | 3 | `spotlight` | Spotlight |
| Ad Spend Watch | 4 | 4 | 4 | uncommon | 2 | `sting` | Sting |
| Critiquito: Design Critique | 3 | 5 | 4 | uncommon | 2 | `sting` | Sting |
| Haggle Bot | 4 | 4 | 4 | uncommon | 2 | `sting` | Sting |
| Clip Bot | 3 | 3 | 3 | common | 1 | `wake` | Second look |
| Stills & Clips Desk | 2 | 5 | 3 | common | 1 | `wake` | Wake |
| Video Edit Desk | 3 | 4 | 3 | common | 1 | `wake` | Wake |
| figma bro | 4 | 4 | 4 | uncommon | 2 | `wake` | Wake |

---

## 6. Role taxonomy (LIKELY from kitText — seating logic)

Kit IDs present: `backtap`, `bulk`, `cover`, `dodo`, `drain`, `dump`, `echo`, `first_seat`, `flamingo`, `grow`, `guard`, `hold_the_line`, `hype`, `last_word`, `mosquito`, `patch`, `peacock`, `pin`, `sidestep`, `snowball`, `spite`, `spotlight`, `sting`, `wake`

- **Front soak / wall:** `bulk`, `hold_the_line`, `guard`, `peacock`
- **Front pass / sacrifice:** `flamingo`, `dump`
- **Scaler:** `grow`, `echo`
- **Start buff:** `hype`, `dodo`
- **Start snipe / chip:** `spotlight`, `mosquito`, `pin`, `sidestep`, `backtap`, `last_word`
- **Reactive hurt:** `sting`, `spite`, `wake`, `patch`
- **KO payoff:** `snowball`, `drain`
- **Cover / mid:** `cover`
- **Jumper:** `first_seat`

---

## 7. Counter matrix (LIKELY — derived from kitText interactions; not from vibes)

Read as: **Enemy pattern → What beats it → Why (kit math) → What loses to it**.

| Enemy pattern | Winning response | Why | Losing response |
|----------------|------------------|-----|------------------|
| Flamingo front (faint +1/+1 to two behind) | Fat non-flamingo front (bulk/hold/grow hp≥5) + echo/hype midback; kill through before grow mid stacks | Pass buffs THEIR mid; mirroring flamingo races their engine | Thin echo/hype front; flamingo mirror; toothless triple tank |
| Grow mid/front (before attack +1/+1) | Burst or wall that denies long trades; remove grow early; don't tip-trade 2hp grows into snowball | Every extra swing snowballs | Slow chip boards that let grow attack 3+ times |
| Spotlight front (SoB 2 dmg to enemy front) | Front with eHP > 2 + their atk after chip; or accept chip and wall | SoB damages before swings | 3hp glass fronts |
| First_seat jumper (SoB move front) | Treat highest threat as possibly jumping; don't assume seat0 is permanent | Seat order lies at SoB | Seating that only walls seat0 name |
| Snowball (KO +2/+2) | Deny free KOs — walls, no tip-trade into their snowball | Each KO accelerates | Glass piles that donate KOs |
| Echo mid (friend ahead attacks → +1/+1) | Break their ahead attacker OR outscale with own grow/hype; avoid pure echo mirrors (draws) | Scales with ahead attack count | Echo-vs-echo draw farms (−8 elo) |
| Hype back (SoB +2 atk front) | Higher eHP front; kill hyped front efficiently | Front hits harder from bar 1 | Under-HP fronts |
| Guard mid/back (SoB +2 HP ahead) | Threaten through buffed HP; potato/honey math uses buffed HP | Effective enemy HP higher | Ignoring SoB HP pad |
| Dump/dodo (give atk ahead) | Pressure the buffed ahead unit; dump also faints itself (dump) | Ahead becomes the real threat | Focusing the dodo/dump body |
| Last_word / backtap snipes | Don't leave last living as weak back; honey back vs snipes | Backline damage | 1hp backs |
| Mosquito/pin/sidestep chip SoB | eHP margin; outscale rather than chip war | Small SoB chips stack with spotlight | Already-thin fronts |
| Cover (ahead faints → +2 atk) | Don't free-faint into their cover; burst cover after | Death of ahead powers mid | Sacrificial trades that feed cover |
| Wake (friend ahead attacks → 1 dmg enemy front) | Wall eHP; silence by killing ahead | Extra chip each ahead swing | Low HP fronts in long fights |
| Patch (ahead hurt → restore 1) | Burst through heal; don't slow-poke | Sustains ahead | Chip-only offense |
| Sting/spite hurt/faint retaliation | Kill without prolonged hurt if possible; don't tip into spite | Punishes trading | Low HP traders |
| Drain (KO heal 2) | Deny KOs | Sustains on kill | Feeding KOs |
| Peacock (hurt +3 atk) | Burst before many hurt triggers OR accept and out-HP | Grows when punched | Slow chip into peacock |

---

## 8. Front survival inequality (PROVEN structure / LIKELY constants)

Before `endShop`, require:

```
ourFront.eHP > theirEffectiveFrontAtk
```

where:
- `eHP ≈ HP + honeyBonus + potatoBonus` (honeyBonus **LIKELY 1–2**; potato **UNKNOWN** exact)
- `theirEffectiveFrontAtk` is **NOT always seat0.atk**:
  - If seat0 is **flamingo** (or dump that dies SoB): after pass/faint, **seat1** becomes the swing threat (PROVEN chain in blacksheepjav frames: Newspaper pass → Credit Card Max grow ticks).
  - If seat1 is **grow**: add projected grow ticks for a long fight (**LIKELY +1 to +3 atk** over fight).
  - If **hype** on their back: seat0 atk +2 at SoB (PROVEN kitText).
  - If **guard** behind threat: threat HP +2 (PROVEN kitText).

---

## 9. Flawless shop policy (strategy — includes RNG)

Ordered priorities every shop (all mandatory layers):

1. **Fill 3** — never fight <3 if buy/reroll can fix (underfill = free −23s).
2. **Effective survival** — satisfy inequality in §8; sell/move/buy wall; food may complete margin.
3. **Spine roles** — Front: bulk | grow(hp≥5) | flamingo | hold_the_line | peacock. Mid: echo | guard | cover | patch. Back: hype | last_word | cover.
4. **Teeth** — if all atk ≤2 on R1+, buy ≥3 atk spine/teeth before greed rerolls.
5. **Food** — reserve 3g when food present after fill; honey prefer back→mid; potato/apple on front only if post-food still satisfies §8.
6. **Live counter** — after ghost seen, upgrade same-role into §7 answers; **max 1 sell** unless survival requires wall-swap.
7. **Anti-mirror** — ban buying their exact **names**; avoid copying their **lose-condition kit** (e.g. don't flamingo-race flamingo_pass). Still allow spine kits that are correct answers.
8. **Freeze** — freeze best unaffordable spine/counter for next reroll/shop.
9. **Reroll** — if gold≥1 and shop offers 0 advances to P1–P6, reroll once (RNG use).
10. **Series branch** — if `wins.them == 1`: bias HP/honey. If `wins.you == 1`: bias atk≥4 finishers.
11. **endShop**.

### RNG baked in (explicit)
- You cannot control shop draws; you control **freeze + reroll + sell discipline**.
- Perfect play ≠ 100% WR: variance exists. Perfect play **maximizes E[elo]** under that RNG.
- Against sticky rematch ghosts, treat each rematch as a **solved puzzle** with memory of their last fp — same policy, better information.

---

## 10. How this wins (mechanism)

1. **Elo math** forces loss-avoidance: cutting −23s > farming +7s.
2. **Fill+survival** removes the two largest self-inflicted −23 clusters (underfill, glass front).
3. **Effective threat** fixes the flamingo→grow blind spot (seat0 atk=2 decoy).
4. **Spine+teeth+food** builds boards that win combat graphs in §6–§7, not random MUST_BUY names.
5. **Freeze/reroll** converts shop RNG into consistent spine assembly across rounds.
6. **Series branching** closes out 1-0 and panic-walls 0-1.
7. **No forfeit** — rematch restart was a rated −25 path; fighting with a correct board is the only +EV line.

---

## 11. UNKNOWN / needs game client code

If client/server combat source appears, fill these — until then do **not** invent:
- Exact honey HP shield value
- Exact potato effect
- Shop rarity weights / seed
- Precise simultaneous attack order ties
- Whether spotlight `(front)` requires unit IN front seat or only targets enemy front

---

## 12. Implementation gate

No `play_loop.js` changes until you accept this plan. Implementation must ship §9 as **one ordered engine**, not isolated knobs.
