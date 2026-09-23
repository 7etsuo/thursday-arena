# FULL MATCH STUDY — tetsuoai climb

_Generated 2026-09-18 ~15:26 MT (America/Edmonton). Source: 965 unique games from batch-*.log + match-*.log; avoid.json; lib/counters.js + play_loop hard refuses._

## Executive findings (ranked by impact)

1. **grow_hype is a black hole (−EV disaster).** All-time 3-0-9 / −209 elo (WR 25%, −17.4 elo/game). Last 2h: **0-0-9 / −233** — almost entirely `novagamingx4` sticky `chip_snipe→grow_hype` (n=9). PLANS.grow_hype still *prefers peacock/flamingo* and has **empty avoid** — contradicts play_loop tip refuses. **Encode: rewrite grow_hype/grow_scale like echo_hype (wall+teeth only); add HANDLE_SWAP_HEDGE novagamingx4.**

2. **echo_hype farm still unpaid.** All-time 1-1-9 / −236 (WR 9%). `aj121503` 0-1-9 / −242 with `grow_scale→echo_hype`. Plan + fill refuses exist but conversion boards still tip (peacock / wake / Love / NYC). Need stronger opener seat wall + hardAvoid rematch gate.

3. **Soft bulk tips (Webby / NYC Parent) still bleed — kit=bulk fools the wall bias.** Last 2h tip fails: Webby×11, NYC Parent×8 on L/D into wall arches. `isGlassWakeTipName` / `isFlamingoHurtTipName` ban NYC/Love/Video Edit but **NOT Webby / Copy Humanizer / Morning Newspaper**. play_loop *boosts* bulk (+4.5) on glass/chip — so Webby/NYC get preferred as “walls” then die.

4. **Asymmetric elo: 50–67% WR matchups still −EV.** `javabeanai` 8-0-4 / −64 (glass→backline_snipe×12), `thephatp` 7-0-5 / −108 (wake→chip×12), `nickhenryyy` 7-1-5 / −112 (glass), `jst_icn71` 4-0-4 / −71 (buff→hurt×8). Losses cost ~−22 to −30; wins pay ~+3 to +8. HardAvoid + swap hedges missing for most.

5. **glass_burst is the climb engine (+797 elo, WR 87%, n=323)** — protect it. Tip fails into glass still exist (NYC/Webby/Love) but net hugely +EV. Do not weaken glass plan; tighten name-level tip bans only.

6. **Mid-series ghost swaps are the rule (517 swap vs 448 sticky).** Only 4 handles in HANDLE_SWAP_HEDGE. Top −EV swappers unencoded: novagamingx4, thephatp, javabeanai, jst_icn71, fourseasonsgrn, ethanamitchell, heywoozyv3y3, kung_jook, _ebfe, 1devnn.

7. **Draws (n=73) cluster on tip/soft boards vs glass/chip/flamingo** — mirror-ish kit overlap (flamingo/patch/wake) and soft walls without teeth. Win boards: bulk front (298), flamingo (143), hold_the_line (75); teeth present on majority of wins.

8. **Rank trajectory:** started rank 9 @ 1284 → best rank 2 @ 1439 → now rank 31 @ 1177 (last check). All-time climb-log eloΔ **−208** despite 77% WR — classic asymmetric loss tax + farm handles.

---

## 1. Overall W/L/D and eloΔ

| Window | n | W | L | D | eloΔ | WR |
|---|---:|---:|---:|---:|---:|---:|
| all-time climb logs | 965 | 746 | 146 | 73 | -208 | 77.3% |
| last 2h | 263 | 198 | 41 | 24 | -349 | 75.3% |
| last 200 games | 200 | 150 | 31 | 19 | -159 | 75.0% |

Last 2h tip-fail L/D games: **42** (Webby/NYC/Love/drain still dominant).

Rank: first 9 @ 1284 → best 2 @ 1439 → last 31 @ 1177 (gap 356 to #1 omlejmi).

---

## 2. By opponent — farm us vs we farm

### Farm us (eloΣ ≤ −40, n ≥ 3) — hardAvoid candidates

| Handle | W-D-L | n | eloΣ | HA | Top close arch | Open→close swaps | Encoded hedge? |
|---|---|---:|---:|---|---|---|---|
| `aj121503` | 0-1-9 | 10 | -242 | True | echo_hype×10 | grow_scale→echo_hype×5 | NO |
| `novagamingx4` | 2-0-9 | 11 | -222 | True | grow_hype×9, hurt_revenge×2 | chip_snipe→grow_hype×9, chip_snipe→hurt_revenge×2 | NO |
| `converse1nation` | 2-0-8 | 10 | -167 | True | bulk_echo×10 | sticky | NO |
| `sandisjonass` | 4-0-5 | 9 | -124 | True | chip_snipe×9 | sticky | NO |
| `dlsusco` | 3-1-5 | 9 | -112 | True | hurt_revenge×7, flamingo_pass×2 | flamingo_pass→hurt_revenge×7 | YES |
| `nickhenryyy` | 7-1-5 | 13 | -112 | True | glass_burst×13 | sticky | NO |
| `thephatp` | 7-0-5 | 12 | -108 | True | chip_snipe×12 | wake_chip→chip_snipe×12 | NO |
| `fourseasonsgrn` | 2-2-5 | 9 | -105 | True | ko_snowball×5, grow_scale×4 | backline_snipe→ko_snowball×5, backline_snipe→grow_scale×4 | NO |
| `_ebfe` | 2-2-4 | 8 | -95 | True | chip_snipe×4, backline_snipe×4 | echo_hype→chip_snipe×4, echo_hype→backline_snipe×4 | NO |
| `ethanamitchell` | 2-0-5 | 7 | -92 | True | hype_battery×7 | backline_snipe→hype_battery×7 | NO |
| `krzyszt49207304` | 5-0-5 | 10 | -73 | True | chip_snipe×7, glass_burst×3 | glass_burst→chip_snipe×7 | YES |
| `jst_icn71` | 4-0-4 | 8 | -71 | True | hurt_revenge×8 | buff_suicide→hurt_revenge×8 | NO |
| `javabeanai` | 8-0-4 | 12 | -64 | True | backline_snipe×12 | glass_burst→backline_snipe×12 | NO |
| `heywoozyv3y3` | 2-1-4 | 7 | -64 | True | flamingo_pass×5, hurt_revenge×2 | chip_snipe→flamingo_pass×5, chip_snipe→hurt_revenge×2 | NO |
| `white1blacks` | 4-1-2 | 7 | -60 | True | flamingo_pass×7 | sticky | NO |
| `z723jz` | 6-3-2 | 11 | -59 | True | glass_burst×11 | sticky | NO |
| `thewife_` | 4-2-2 | 8 | -59 | True | buff_suicide×8 | sticky | NO |
| `kung_jook` | 5-0-4 | 9 | -55 | True | sustain×5, ko_snowball×4 | echo_hype→sustain×5, echo_hype→ko_snowball×4 | NO |
| `1devnn` | 5-2-2 | 9 | -42 | True | chip_snipe×9 | backline_snipe→chip_snipe×5, glass_burst→chip_snipe×4 | NO |

**Read:** they farm us when (a) mid-series arch swap blinds opener plan, or (b) soft tip boards into their wall/grow engine, or (c) loss elo ≫ win elo even at 50%+ WR.

### We farm them (eloΣ ≥ +30, n ≥ 5) — top 20

| Handle | W-D-L | n | eloΣ |
|---|---|---:|---:|
| `wowbaggerv2` | 10-0-0 | 10 | +106 |
| `roshan_s` | 13-0-0 | 13 | +91 |
| `_coachingportal` | 12-0-0 | 12 | +75 |
| `jgabrielgruber` | 12-0-1 | 13 | +71 |
| `jmatthewleelee` | 11-0-0 | 11 | +61 |
| `ezatwakily` | 14-0-0 | 14 | +61 |
| `mangobushmango` | 11-0-0 | 11 | +60 |
| `richhar75378` | 9-0-0 | 9 | +59 |
| `lyanlab` | 9-0-0 | 9 | +58 |
| `yakveal` | 16-0-0 | 16 | +57 |
| `sai_vajra` | 8-0-0 | 8 | +57 |
| `nehood45` | 10-1-0 | 11 | +54 |
| `fbacope88` | 12-0-0 | 12 | +53 |
| `5kongz` | 9-0-0 | 9 | +53 |
| `yaseenhq` | 6-0-0 | 6 | +51 |
| `sergiocastillop` | 14-0-1 | 15 | +50 |
| `poteto` | 9-0-0 | 9 | +46 |
| `webjuice_ie` | 9-0-0 | 9 | +45 |
| `asmgkr` | 10-1-1 | 12 | +43 |
| `brandenearp` | 7-0-0 | 7 | +43 |

---

## 3. By closing arch & fight arch

### Closing arch (game result)

| Close arch | n | W-D-L | WR | eloΣ | elo/game | tip_fail L/D |
|---|---:|---|---:|---:|---:|---:|
| `echo_hype` | 11 | 1-1-9 | 9% | -236 | -21.5 | 9 |
| `grow_hype` | 12 | 3-0-9 | 25% | -209 | -17.4 | 0 |
| `grow_scale` | 4 | 1-0-3 | 25% | -57 | -14.2 | 0 |
| `sustain` | 9 | 5-0-4 | 56% | -64 | -7.1 | 0 |
| `backline_snipe` | 67 | 43-8-16 | 64% | -191 | -2.9 | 17 |
| `hype_battery` | 29 | 19-3-7 | 66% | -72 | -2.5 | 0 |
| `bulk_echo` | 35 | 26-1-8 | 74% | -78 | -2.2 | 9 |
| `buff_suicide` | 25 | 19-3-3 | 76% | -40 | -1.6 | 6 |
| `hurt_revenge` | 82 | 62-4-16 | 76% | -74 | -0.9 | 14 |
| `flamingo_pass` | 81 | 61-9-11 | 75% | -21 | -0.3 | 11 |
| `wake_chip` | 45 | 32-9-4 | 71% | -10 | -0.2 | 12 |
| `chip_snipe` | 197 | 157-13-27 | 80% | -28 | -0.1 | 28 |
| `ko_snowball` | 45 | 36-4-5 | 80% | +75 | +1.7 | 7 |
| `glass_burst` | 323 | 281-18-24 | 87% | +797 | +2.5 | 25 |

### Fight arch (per-round fight_settled)

| Fight arch | fights | us/them/draw | fight WR |
|---|---:|---|---:|
| `glass_burst` | 861 | 649/120/92 | 75% |
| `chip_snipe` | 488 | 341/96/51 | 70% |
| `flamingo_pass` | 212 | 133/44/35 | 63% |
| `backline_snipe` | 137 | 75/43/19 | 55% |
| `hurt_revenge` | 118 | 85/21/12 | 72% |
| `wake_chip` | 112 | 69/27/16 | 62% |
| `buff_suicide` | 82 | 51/20/11 | 62% |
| `ko_snowball` | 66 | 46/13/7 | 70% |
| `bulk_echo` | 61 | 39/18/4 | 64% |
| `hype_battery` | 57 | 33/21/3 | 58% |
| `echo_hype` | 42 | 10/27/5 | 24% |
| `grow_scale` | 26 | 8/13/5 | 31% |
| `bulk_wall` | 23 | 23/0/0 | 100% |
| `sustain` | 22 | 17/4/1 | 77% |
| `grow_hype` | 14 | 4/9/1 | 29% |

**Last 2h close-arch bleed:** grow_hype 0-0-9/−233; chip_snipe −118; backline_snipe −101; hurt_revenge −59. glass_burst still +125.

---

## 4. Our boards that WIN vs LOSE by closing arch

Kit map note: **NYC Parent = bulk**, **Webby = bulk**, **Love = patch**, **Copy Humanizer / Morning Newspaper = flamingo**, **Sales Call Coach = peacock**, **Video Edit / Stills&Clips = wake**. Comments that call NYC Parent “peacock” are outdated.

### `grow_hype` (n=12, 3-0-9, elo -209)

**Win boards:**
- ×1: `Company Docs Q&A | Love ❤️ | X Brief` → kits `guard | patch | echo`
- ×1: `Imogen | X Brief | X Brief` → kits `bulk | echo | echo`
- ×1: `Imogen | Copy Humanizer | NYC Parent` → kits `bulk | flamingo | bulk`
**Lose boards:**
- ×1: `Meeting Recap Deck | Writing Bot | Luma Pages` → kits `echo | hype | hype`
- ×1: `WTD | Apple Search Ads Review | Apple Search Ads Review` → kits `hype | grow | grow`
- ×1: `Webby | Outbound Prospecting | Deal Hunting` → kits `bulk | mosquito | drain`
- ×1: `X Brief | Deal Hunting | WTD` → kits `echo | drain | hype`
- ×1: `Stills & Clips Desk | Love ❤️ | WTD` → kits `wake | patch | hype`
**Win kit sigs:** `guard|patch|echo`×1, `bulk|echo|echo`×1, `bulk|flamingo|bulk`×1
**Lose kit sigs:** `echo|hype|hype`×1, `hype|grow|grow`×1, `bulk|mosquito|drain`×1, `echo|drain|hype`×1, `wake|patch|hype`×1

### `echo_hype` (n=11, 1-1-9, elo -236)

**Win boards:**
- ×1: `Paid Media Report Desk | Flora: Plant Care Log | Overheard` → kits `grow | patch | backtap`
**Lose boards:**
- ×1: `Customer Call Coach & Assistant | Pipeline Pulse | Luma Pages` → kits `peacock | sidestep | hype`
- ×1: `Luma Pages | Customer Call Coach & Assistant | WTD` → kits `hype | peacock | hype`
- ×1: `NYC Parent | Company Docs Q&A | Customer Call Coach & Assistant` → kits `bulk | guard | peacock`
- ×1: `Imogen | Copy Humanizer | Apple Search Ads Review` → kits `bulk | flamingo | grow`
- ×1: `Stills & Clips Desk | Hiring Signals | Stills & Clips Desk` → kits `wake | backtap | wake`
**Win kit sigs:** `grow|patch|backtap`×1
**Lose kit sigs:** `peacock|sidestep|hype`×1, `hype|peacock|hype`×1, `bulk|guard|peacock`×1, `bulk|flamingo|grow`×1, `wake|backtap|wake`×1
**Tip fails on L/D:** customer call coach assistant(peacock)×3, stills clips desk(wake)×3, copy humanizer(flamingo)×2, nyc parent(bulk)×1, love(patch)×1, the morning newspaper(flamingo)×1

### `backline_snipe` (n=67, 43-8-16, elo -191)

**Win boards:**
- ×1: `Office Ops Desk | Copy Humanizer | Credit Card Max` → kits `hold_the_line | flamingo | grow`
- ×1: `Copy Humanizer | Credit Card Max | Deal Inspector` → kits `flamingo | grow | cover`
- ×1: `Imogen | SEO & AEO Desk | Product Support Inbox Assistant` → kits `bulk | pin | patch`
- ×1: `The Morning Newspaper | Tradbot | Writing Bot` → kits `flamingo | guard | hype`
- ×1: `Copy Humanizer | Tradbot | Meeting Recap Deck` → kits `flamingo | guard | echo`
**Lose boards:**
- ×1: `Webby | Company Docs Q&A | Credit Card Max` → kits `bulk | guard | grow`
- ×1: `Love ❤️ | Luma Pages` → kits `patch | hype`
- ×1: `Copy Humanizer | Credit Card Max | Pitch Deck Coach` → kits `flamingo | grow | last_word`
- ×1: `Imogen | Copy Humanizer | Webby` → kits `bulk | flamingo | bulk`
- ×1: `Imogen | Copy Humanizer | Flora: Plant Care Log` → kits `bulk | flamingo | patch`
**Win kit sigs:** `flamingo|guard|echo`×3, `hold_the_line|guard|echo`×2, `bulk|echo|hype`×2, `patch|echo|hype`×2, `hold_the_line|flamingo|grow`×1
**Lose kit sigs:** `bulk|guard|grow`×1, `patch|hype`×1, `flamingo|grow|last_word`×1, `bulk|flamingo|bulk`×1, `bulk|flamingo|patch`×1
**Tip fails on L/D:** webby(bulk)×8, copy humanizer(flamingo)×5, love(patch)×3, flora plant care log(patch)×2, stills clips desk(wake)×2, deal hunting(drain)×1

### `bulk_echo` (n=35, 26-1-8, elo -78)

**Win boards:**
- ×1: `NYC Parent | Paid Media Report Desk | Call Follow-Ups` → kits `bulk | grow | echo`
- ×1: `Webby | Tradbot | Luma Pages` → kits `bulk | guard | hype`
- ×1: `SEO & AEO Desk | Love ❤️ | X Brief` → kits `pin | patch | echo`
- ×1: `Apple Search Ads Review | Office Ops Desk | Office Ops Desk` → kits `grow | hold_the_line | hold_the_line`
- ×1: `Office Ops Desk | Paid Media Report Desk | Cooper` → kits `hold_the_line | grow | echo`
**Lose boards:**
- ×1: `Copy Humanizer | Stills & Clips Desk | Love ❤️` → kits `flamingo | wake | patch`
- ×1: `Outbound Prospecting | Site Audit | Luma Pages` → kits `mosquito | pin | hype`
- ×1: `The Morning Newspaper | Stills & Clips Desk | GTM Prospecting` → kits `flamingo | wake | mosquito`
- ×1: `Copy Humanizer | Writing Bot | The Morning Newspaper` → kits `flamingo | hype | flamingo`
- ×1: `NYC Parent | SEO & AEO Desk | Writing Bot` → kits `bulk | pin | hype`
**Win kit sigs:** `bulk|guard|hype`×2, `bulk|grow|echo`×1, `pin|patch|echo`×1, `grow|hold_the_line|hold_the_line`×1, `hold_the_line|grow|echo`×1
**Lose kit sigs:** `flamingo|wake|patch`×1, `mosquito|pin|hype`×1, `flamingo|wake|mosquito`×1, `flamingo|hype|flamingo`×1, `bulk|pin|hype`×1
**Tip fails on L/D:** nyc parent(bulk)×4, love(patch)×3, the morning newspaper(flamingo)×3, copy humanizer(flamingo)×2, stills clips desk(wake)×2, outbound prospecting(mosquito)×1

### `hurt_revenge` (n=82, 62-4-16, elo -74)

**Win boards:**
- ×1: `The Morning Newspaper | Company Docs Q&A | Meeting Recap Deck` → kits `flamingo | guard | echo`
- ×1: `The Morning Newspaper | Company Docs Q&A | Call Follow-Ups` → kits `flamingo | guard | echo`
- ×1: `Copy Humanizer | Company Docs Q&A | Meeting Recap Deck` → kits `flamingo | guard | echo`
- ×1: `The Morning Newspaper | Video Edit Desk | WTD` → kits `flamingo | wake | hype`
- ×1: `Imogen | Webby | Pipeline Pulse` → kits `bulk | bulk | sidestep`
**Lose boards:**
- ×1: `Partnerships Call Coach | Signal Prospector | X Brief` → kits `spotlight | mosquito | echo`
- ×1: `NYC Parent | NYC Parent | Projects Manager` → kits `bulk | bulk | hype`
- ×1: `Meeting Recap Deck | Projects Manager | Apple Search Ads Review` → kits `echo | hype | grow`
- ×1: `Imogen | Signal Prospector | Imogen` → kits `bulk | mosquito | bulk`
- ×1: `NYC Parent | The Morning Newspaper | Imogen` → kits `bulk | flamingo | bulk`
**Win kit sigs:** `flamingo|guard|echo`×3, `bulk|echo|hype`×2, `bulk|echo|echo`×2, `guard|echo|hype`×2, `flamingo|grow|hype`×2
**Lose kit sigs:** `bulk|flamingo|bulk`×2, `spotlight|mosquito|echo`×1, `bulk|bulk|hype`×1, `echo|hype|grow`×1, `bulk|mosquito|bulk`×1
**Tip fails on L/D:** webby(bulk)×5, nyc parent(bulk)×4, signal prospector(mosquito)×2, stills clips desk(wake)×2, copy humanizer(flamingo)×2, the morning newspaper(flamingo)×1

### `chip_snipe` (n=197, 157-13-27, elo -28)

**Win boards:**
- ×2: `The Morning Newspaper | Call Follow-Ups | Meeting Recap Deck` → kits `flamingo | echo | echo`
- ×2: `NYC Parent | Company Docs Q&A | Luma Pages` → kits `bulk | guard | hype`
- ×1: `Paid Media Report Desk | Tradbot | Luma Pages` → kits `grow | guard | hype`
- ×1: `Apple Search Ads Review | Nightly Audit Engineer | Luma Pages` → kits `grow | cover | hype`
- ×1: `Credit Card Max | Projects Manager | Pitch Deck Coach` → kits `grow | hype | last_word`
**Lose boards:**
- ×1: `Webby | Company Docs Q&A | NYC Parent` → kits `bulk | guard | bulk`
- ×1: `NYC Parent | The Morning Newspaper | Nightly Audit Engineer` → kits `bulk | flamingo | cover`
- ×1: `The Morning Newspaper | Office Ops Desk | Projects Manager` → kits `flamingo | hold_the_line | hype`
- ×1: `NYC Parent | Stills & Clips Desk | Office Ops Desk` → kits `bulk | wake | hold_the_line`
- ×1: `NYC Parent | WTD | Paid Media Report Desk` → kits `bulk | hype | grow`
**Win kit sigs:** `bulk|hype|hype`×5, `bulk|guard|hype`×5, `flamingo|echo|echo`×4, `bulk|echo|hype`×4, `bulk|flamingo|hype`×3
**Lose kit sigs:** `bulk|guard|bulk`×1, `bulk|flamingo|cover`×1, `flamingo|hold_the_line|hype`×1, `bulk|wake|hold_the_line`×1, `bulk|hype|grow`×1
**Tip fails on L/D:** nyc parent(bulk)×10, webby(bulk)×6, stills clips desk(wake)×5, the morning newspaper(flamingo)×4, copy humanizer(flamingo)×3, deal hunting(drain)×3

### `flamingo_pass` (n=81, 61-9-11, elo -21)

**Win boards:**
- ×2: `Recruiting Coordinator | Love ❤️ | X Brief` → kits `dodo | patch | echo`
- ×1: `Company Docs Q&A | Call Follow-Ups | Writing Bot` → kits `guard | echo | hype`
- ×1: `NYC Parent | Company Docs Q&A | Game Art Director` → kits `bulk | guard | spotlight`
- ×1: `Imogen | Nightly Audit Engineer | Customer Proof Desk` → kits `bulk | cover | dump`
- ×1: `Copy Humanizer | Credit Card Max | Call Follow-Ups` → kits `flamingo | grow | echo`
**Lose boards:**
- ×1: `Imogen | Video Edit Desk | Critiquito: Design Critique` → kits `bulk | wake | sting`
- ×1: `Stills & Clips Desk | Deal Inspector | Writing Bot` → kits `wake | cover | hype`
- ×1: `GTM Loop Closer | Hiring Signals | Projects Manager` → kits `cover | backtap | hype`
- ×1: `Product Support Inbox Assistant | Apple Search Ads Review | Executive Assistant` → kits `patch | grow | hype`
- ×1: `Company Docs Q&A | Hiring Signals | Haggle Bot` → kits `guard | backtap | sting`
**Win kit sigs:** `guard|echo|hype`×2, `bulk|guard|hype`×2, `bulk|hype|hold_the_line`×2, `bulk|hype|hype`×2, `dodo|patch|echo`×2
**Lose kit sigs:** `bulk|wake|sting`×1, `wake|cover|hype`×1, `cover|backtap|hype`×1, `patch|grow|hype`×1, `guard|backtap|sting`×1
**Tip fails on L/D:** stills clips desk(wake)×3, flora plant care log(patch)×2, webby(bulk)×2, video edit desk(wake)×1, critiquito design critique(sting)×1, nyc parent(bulk)×1

### `glass_burst` (n=323, 281-18-24, elo +797)

**Win boards:**
- ×3: `NYC Parent | Company Docs Q&A | WTD` → kits `bulk | guard | hype`
- ×3: `Imogen | Call Follow-Ups | WTD` → kits `bulk | echo | hype`
- ×2: `Webby | Copy Humanizer | Call Follow-Ups` → kits `bulk | flamingo | echo`
- ×2: `The Morning Newspaper | Copy Humanizer | Luma Pages` → kits `flamingo | flamingo | hype`
- ×2: `NYC Parent | WTD | Writing Bot` → kits `bulk | hype | hype`
**Lose boards:**
- ×1: `Webby | EBR & Value Deck Builder | Apple Search Ads Review` → kits `bulk | dump | grow`
- ×1: `NYC Parent | Pipeline Pulse | Writing Bot` → kits `bulk | sidestep | hype`
- ×1: `NYC Parent | Love ❤️ | Luma Pages` → kits `bulk | patch | hype`
- ×1: `Company Docs Q&A | Projects Manager | GTM Account Research` → kits `guard | hype | last_word`
- ×1: `NYC Parent | Webby | Copy Humanizer` → kits `bulk | bulk | flamingo`
**Win kit sigs:** `flamingo|hype|hype`×7, `bulk|echo|hype`×7, `bulk|guard|hype`×6, `bulk|flamingo|echo`×5, `bulk|hype|hype`×5
**Lose kit sigs:** `bulk|dump|grow`×1, `bulk|sidestep|hype`×1, `bulk|patch|hype`×1, `guard|hype|last_word`×1, `bulk|bulk|flamingo`×1
**Tip fails on L/D:** nyc parent(bulk)×9, webby(bulk)×6, love(patch)×5, copy humanizer(flamingo)×3, flora plant care log(patch)×3, product support inbox assistant(patch)×2

### `wake_chip` (n=45, 32-9-4, elo -10)

**Win boards:**
- ×1: `NYC Parent | Luma Pages | Credit Card Max` → kits `bulk | hype | grow`
- ×1: `Imogen | Company Docs Q&A | WTD` → kits `bulk | guard | hype`
- ×1: `Outbound Prospecting | Cooper | Recruiting Coordinator` → kits `mosquito | echo | dodo`
- ×1: `Event Request Desk | Signal Prospector | Projects Manager` → kits `sidestep | mosquito | hype`
- ×1: `Office Ops Desk | Meeting Recap Deck | WTD` → kits `hold_the_line | echo | hype`
**Lose boards:**
- ×1: `Imogen | Copy Humanizer | X Brief` → kits `bulk | flamingo | echo`
- ×1: `Webby | Company Docs Q&A | Customer Call Coach & Assistant` → kits `bulk | guard | peacock`
- ×1: `Nightly Audit Engineer | Cooper | Love ❤️` → kits `cover | echo | patch`
- ×1: `NYC Parent | Company Docs Q&A | Company Docs Q&A` → kits `bulk | guard | guard`
**Win kit sigs:** `bulk|hype|grow`×2, `bulk|guard|hype`×1, `mosquito|echo|dodo`×1, `sidestep|mosquito|hype`×1, `hold_the_line|echo|hype`×1
**Lose kit sigs:** `bulk|flamingo|echo`×1, `bulk|guard|peacock`×1, `cover|echo|patch`×1, `bulk|guard|guard`×1
**Tip fails on L/D:** love(patch)×5, customer call coach assistant(peacock)×3, webby(bulk)×2, nyc parent(bulk)×2, copy humanizer(flamingo)×1, gtm prospecting(mosquito)×1

### `buff_suicide` (n=25, 19-3-3, elo -40)

**Win boards:**
- ×1: `Webby | GTM Loop Closer | Luma Pages` → kits `bulk | cover | hype`
- ×1: `Webby | Office Ops Desk | Writing Bot` → kits `bulk | hold_the_line | hype`
- ×1: `Office Ops Desk | Apple Search Ads Review | Pipeline Pulse` → kits `hold_the_line | grow | sidestep`
- ×1: `The Morning Newspaper | Deal Hunting | WTD` → kits `flamingo | drain | hype`
- ×1: `Apple Search Ads Review | WTD | Imogen` → kits `grow | hype | bulk`
**Lose boards:**
- ×1: `EBR & Value Deck Builder | Outbound Prospecting | The Morning Newspaper` → kits `dump | mosquito | flamingo`
- ×1: `Pipeline Pulse | Webby | Office Ops Desk` → kits `sidestep | bulk | hold_the_line`
- ×1: `Copy Humanizer | Customer Proof Desk | WTD` → kits `flamingo | dump | hype`
**Win kit sigs:** `bulk|echo|hype`×2, `bulk|cover|hype`×1, `bulk|hold_the_line|hype`×1, `hold_the_line|grow|sidestep`×1, `flamingo|drain|hype`×1
**Lose kit sigs:** `dump|mosquito|flamingo`×1, `sidestep|bulk|hold_the_line`×1, `flamingo|dump|hype`×1
**Tip fails on L/D:** webby(bulk)×2, nyc parent(bulk)×1, outbound prospecting(mosquito)×1, the morning newspaper(flamingo)×1, video edit desk(wake)×1, copy humanizer(flamingo)×1

### `ko_snowball` (n=45, 36-4-5, elo +75)

**Win boards:**
- ×1: `Webby | The Morning Newspaper | Webby` → kits `bulk | flamingo | bulk`
- ×1: `Imogen | Video Edit Desk | Love ❤️` → kits `bulk | wake | patch`
- ×1: `Imogen | Office Ops Desk | Office Ops Desk` → kits `bulk | hold_the_line | hold_the_line`
- ×1: `The Morning Newspaper | Call Follow-Ups | Luma Pages` → kits `flamingo | echo | hype`
- ×1: `The Morning Newspaper | Tradbot | Writing Bot` → kits `flamingo | guard | hype`
**Lose boards:**
- ×1: `Company Docs Q&A | Apple Search Ads Review | Cooper` → kits `guard | grow | echo`
- ×1: `Copy Humanizer | EBR & Value Deck Builder | Luma Pages` → kits `flamingo | dump | hype`
- ×1: `NYC Parent | WTD | Office Ops Desk` → kits `bulk | hype | hold_the_line`
- ×1: `NYC Parent | Webby | Video Edit Desk` → kits `bulk | bulk | wake`
- ×1: `NYC Parent | Event Request Desk | Tradbot` → kits `bulk | sidestep | guard`
**Win kit sigs:** `flamingo|echo|hype`×4, `bulk|flamingo|bulk`×2, `bulk|hype|bulk`×2, `bulk|bulk|bulk`×2, `bulk|wake|patch`×1
**Lose kit sigs:** `guard|grow|echo`×1, `flamingo|dump|hype`×1, `bulk|hype|hold_the_line`×1, `bulk|bulk|wake`×1, `bulk|sidestep|guard`×1
**Tip fails on L/D:** copy humanizer(flamingo)×3, nyc parent(bulk)×3, customer call coach assistant(peacock)×2, webby(bulk)×1, video edit desk(wake)×1, love(patch)×1

---

## 5. Plan sticky / mid-series ghost swaps

- Sticky open=close: **448**
- Mid-series swap: **517**

### Top swap patterns (all handles)

| Open → close | n |
|---|---:|
| `glass_burst→chip_snipe` | 71 |
| `chip_snipe→hurt_revenge` | 57 |
| `wake_chip→chip_snipe` | 28 |
| `glass_burst→backline_snipe` | 25 |
| `glass_burst→bulk_echo` | 24 |
| `chip_snipe→glass_burst` | 20 |
| `bulk_wall→glass_burst` | 14 |
| `flamingo_pass→hurt_revenge` | 13 |
| `chip_snipe→backline_snipe` | 13 |
| `glass_burst→wake_chip` | 10 |
| `chip_snipe→ko_snowball` | 10 |
| `flamingo_pass→buff_suicide` | 10 |
| `buff_suicide→wake_chip` | 10 |
| `chip_snipe→flamingo_pass` | 10 |
| `chip_snipe→hype_battery` | 9 |

### −EV handles with swaps not in HANDLE_SWAP_HEDGE

| Handle | eloΣ | Swap pattern | Recommended hedge |
|---|---:|---|---|
| `novagamingx4` | -222 | chip_snipe→grow_hype ×9 | whenArch chip_snipe; alsoAvoidFrom grow_hype; stripPrefer peacock/flamingo/echo/grow/patch/wake/drain/mosquito |
| `thephatp` | -108 | wake_chip→chip_snipe ×12 | whenArch wake_chip; alsoAvoidFrom chip_snipe; stripPrefer peacock/flamingo/patch/wake |
| `javabeanai` | -64 | glass_burst→backline_snipe ×12 | whenArch glass_burst; alsoAvoidFrom backline_snipe; stripPrefer wake/flamingo/drain/mosquito |
| `jst_icn71` | -71 | buff_suicide→hurt_revenge ×8 | whenArch buff_suicide; alsoAvoidFrom hurt_revenge; stripPrefer peacock/flamingo/wake/sting/patch |
| `fourseasonsgrn` | -105 | backline_snipe→ko_snowball/grow_scale | whenArch backline_snipe; alsoAvoidFrom ko_snowball; stripPrefer grow/wake/flamingo tip |
| `ethanamitchell` | -92 | backline_snipe→hype_battery ×7 | whenArch backline_snipe; alsoAvoidFrom hype_battery |
| `heywoozyv3y3` | -64 | chip_snipe→flamingo_pass ×8 | whenArch chip_snipe; alsoAvoidFrom flamingo_pass |
| `kung_jook` | -55 | echo_hype→sustain/ko_snowball | whenArch echo_hype; alsoAvoidFrom sustain |
| `aj121503` | -242 | grow_scale→echo_hype ×5 | whenArch grow_scale/echo_hype; alsoAvoidFrom echo_hype (already plan-strong; add handle) |
| `_ebfe` | -95 | echo_hype→chip/backline | whenArch echo_hype; alsoAvoidFrom chip_snipe |
| `1devnn` | -42 | →chip_snipe from backline/glass | whenArch glass_burst/backline_snipe; alsoAvoidFrom chip_snipe |

Already encoded: `dlsusco` (flamingo→hurt), `levificati0n` (glass→wake_chip), `krzyszt49207304`, `skdonkor672`.

---

## 6. Tip / mirror failure modes — still present?

| Failure mode | Evidence | Still present last 2h? | Encoded? | Gap |
|---|---|---|---|---|
| Peacock / Sales Call Coach tip into walls | lose boards on echo_hype/wake_chip; kit refuse on flamingo/hurt/glass/chip | rare (peacock×2 L2h) | YES kit+name on most wall arches | OK |
| NYC Parent tip (kit=**bulk**) | ×22 all-time tip L/D; ×8 last 2h | **YES** | Name ban on glass/wake/flamingo/hurt — but **bulk boost** still seats it when name check misses path | Extend name ban to chip/grow_hype/backline; treat NYC as tip not wall |
| Love / Flora patch tip | ×6 Love last 2h; Flora×2 | **YES** | YES on most arches | grow_hype PLANS empty avoid still allows patch prefer path via spine |
| Flamingo mirror (Copy Humanizer / Newspaper) | ×5+×4 last 2h | **YES** | Kit flamingo refused on flamingo_pass/bulk_echo/glass fill | Add to `isGlassWakeTipName` / grow_hype / backline_snipe name bans |
| Wake / Video Edit / Stills&Clips | Video×2, Stills×3 last 2h | **YES** mild | YES kit wake refuse | OK-ish; keep double-wake ban |
| **Webby into wall arches** | ×16 all-time; **×11 last 2h** | **YES — top tip fail** | Comment mentions Webby; **NO name-level ban** (kit=bulk gets +4.5 wall boost!) | **CRITICAL: add Webby to tip-name bans; do not treat soft bulk names as walls** |
| grow_hype tip war | last 2h 0-9 | **YES catastrophic** | play_loop score refuse; PLANS still prefer peacock | Align PLANS.grow_hype avoid with play_loop |

---

## 7. Draw anatomy (n=73)

### By close arch

- `glass_burst`: 18
- `chip_snipe`: 13
- `wake_chip`: 9
- `flamingo_pass`: 9
- `backline_snipe`: 8
- `hurt_revenge`: 4
- `ko_snowball`: 4
- `hype_battery`: 3
- `buff_suicide`: 3
- `bulk_echo`: 1
- `echo_hype`: 1

### Our draw boards (top)

- ×1: `Customer Call Coach & Assistant | GTM Prospecting | Event Request Desk` (`peacock | mosquito | sidestep`)
- ×1: `NYC Parent | Credit Card Max | Nightly Audit Engineer` (`bulk | grow | cover`)
- ×1: `Credit Card Max | Product Support Inbox Assistant | Credit Card Max` (`grow | patch | grow`)
- ×1: `Imogen | Webby | Meeting Recap Deck` (`bulk | bulk | echo`)
- ×1: `Chief Health Officer | Pipeline Pulse | Meeting Recap Deck` (`patch | sidestep | echo`)
- ×1: `Love ❤️ | Video Edit Desk | Love ❤️` (`patch | wake | patch`)
- ×1: `NYC Parent | Webby | Cooper` (`bulk | bulk | echo`)
- ×1: `NYC Parent | Flora: Plant Care Log | Product Idea Stress Test` (`bulk | patch | dump`)
- ×1: `SEO & AEO Desk | EBR & Value Deck Builder | Writing Bot` (`pin | dump | hype`)
- ×1: `NYC Parent | Company Docs Q&A | Pitch Deck Coach` (`bulk | guard | last_word`)

### Kit / name overlap signals

- ×7: `bulk`
- ×4: `echo`
- ×3: `hype`
- ×2: `wake`
- ×2: `last_word`
- ×2: `NAME_OVERLAP:nightly audit engineer`
- ×1: `patch`
- ×1: `NAME_OVERLAP:projects manager`
- ×1: `grow`
- ×1: `mosquito`
- ×1: `NAME_OVERLAP:call follow ups`
- ×1: `bulk|wake`

**Pattern:** draws are tip/soft-wall boards (NYC/Webby/Love/flamingo/wake) vs glass_burst / chip_snipe / flamingo_pass — mirror-ish echo wars and soft walls without teeth. Rarely true equal fat-wall stalemates.

---

## 8. Win anatomy (n=746)

- Teeth (hype/grow/peacock/spotlight/sting) present: **461/746** wins
- Spine-kit count distribution: `{'3': 497, '1': 37, '2': 211, '0': 1}`
- Front kit: bulk×298, flamingo×143, hold_the_line×75, grow×51, guard×42, patch×26, echo×22, cover×18

### Top converting boards

- ×4: `Webby | Company Docs Q&A | Luma Pages` → `bulk | guard | hype`
- ×3: `Office Ops Desk | Copy Humanizer | Luma Pages` → `hold_the_line | flamingo | hype`
- ×3: `NYC Parent | Company Docs Q&A | WTD` → `bulk | guard | hype`
- ×3: `Webby | Office Ops Desk | Writing Bot` → `bulk | hold_the_line | hype`
- ×3: `NYC Parent | Webby | Cooper` → `bulk | bulk | echo`
- ×3: `NYC Parent | Company Docs Q&A | Luma Pages` → `bulk | guard | hype`
- ×3: `Imogen | Call Follow-Ups | WTD` → `bulk | echo | hype`
- ×2: `Imogen | Company Docs Q&A | WTD` → `bulk | guard | hype`
- ×2: `Copy Humanizer | X Brief | Luma Pages` → `flamingo | echo | hype`
- ×2: `Webby | Copy Humanizer | Call Follow-Ups` → `bulk | flamingo | echo`
- ×2: `The Morning Newspaper | Company Docs Q&A | Call Follow-Ups` → `flamingo | guard | echo`
- ×2: `Webby | Apple Search Ads Review | Webby` → `bulk | grow | bulk`

**Convert recipe:** fat eHP front (`bulk` / `hold_the_line` / `guard`, preferably Imogen/Company Docs/Office Ops — not Webby/NYC soft bulk) + mid spine + back teeth (hype/spotlight). Avoid tip names even when kit maps to bulk/flamingo.

---

## 9. Elo EV — matchup types +EV / −EV despite WR

### −EV arches (elo/game)

| Arch | n | WR | elo/game | Note |
|---|---:|---:|---:|---|
| `echo_hype` | 11 | 9% | -21.5 | REWRITE PLAN |
| `grow_hype` | 12 | 25% | -17.4 | REWRITE PLAN |
| `grow_scale` | 4 | 25% | -14.2 | REWRITE PLAN |
| `sustain` | 9 | 56% | -7.1 | hedge+avoid rematch |
| `backline_snipe` | 67 | 64% | -2.9 | hedge+avoid rematch |
| `hype_battery` | 29 | 66% | -2.5 | hedge+avoid rematch |
| `bulk_echo` | 35 | 74% | -2.2 | hedge+avoid rematch |
| `buff_suicide` | 25 | 76% | -1.6 | hedge+avoid rematch |
| `hurt_revenge` | 82 | 76% | -0.9 | hedge+avoid rematch |
| `flamingo_pass` | 81 | 75% | -0.3 | hedge+avoid rematch |
| `wake_chip` | 45 | 71% | -0.2 | hedge+avoid rematch |
| `chip_snipe` | 197 | 80% | -0.1 | hedge+avoid rematch |

### +EV arches

| Arch | n | WR | elo/game |
|---|---:|---:|---:|
| `glass_burst` | 323 | 87% | +2.5 |
| `ko_snowball` | 45 | 80% | +1.7 |

### Handles with WR ≥ 50% but eloΣ < 0 (loss tax)

| Handle | WR | W-D-L | eloΣ | avg/game |
|---|---:|---|---:|---:|
| `nickhenryyy` | 54% | 7-1-5 | -112 | -8.6 |
| `thephatp` | 58% | 7-0-5 | -108 | -9.0 |
| `krzyszt49207304` | 50% | 5-0-5 | -73 | -7.3 |
| `jst_icn71` | 50% | 4-0-4 | -71 | -8.9 |
| `javabeanai` | 67% | 8-0-4 | -64 | -5.3 |
| `white1blacks` | 57% | 4-1-2 | -60 | -8.6 |
| `z723jz` | 55% | 6-3-2 | -59 | -5.4 |
| `thewife_` | 50% | 4-2-2 | -59 | -7.4 |
| `kung_jook` | 56% | 5-0-4 | -55 | -6.1 |
| `1devnn` | 56% | 5-2-2 | -42 | -4.7 |
| `taxzy920` | 67% | 4-0-2 | -38 | -6.3 |
| `martin_maradei` | 62% | 5-1-2 | -36 | -4.5 |
| `3luedream` | 57% | 4-0-3 | -34 | -4.9 |
| `reyneill_` | 79% | 11-0-3 | -34 | -2.4 |
| `levificati0n` | 55% | 6-3-2 | -30 | -2.7 |

**Action:** hardAvoid after 2 losses or eloΣ≤−40 regardless of WR; do not “play through” 50% WR farms.

---

## 10. Gaps vs current encodes — checklist

### Already encoded

- [x] PLANS wall answers for glass_burst, chip_snipe, bulk_echo, echo_hype, flamingo_pass, wake_chip, hurt_revenge, buff_suicide, backline_snipe, ko_snowball
- [x] HANDLE_SWAP_HEDGE: dlsusco, levificati0n, krzyszt49207304, skdonkor672
- [x] play_loop kit hard refuses: peacock/patch/wake/sting/flamingo into flamingo_pass & hurt_revenge
- [x] play_loop kit hard refuses: tip kits into glass_burst / bulk_echo / chip_snipe / wake_chip / echo_hype
- [x] play_loop score penalties for grow_hype/grow_scale tip kits
- [x] Name tip bans: NYC Parent, Love, Video Edit (+ Critiquito on flamingo/hurt)
- [x] Double-wake ban; anti-echo-mirror on flamingo_pass
- [x] avoid.json hardAvoid tracking (memory)

### Still open (encode next)

- [ ] **Rewrite `PLANS.grow_hype` + `grow_scale`:** prefer `[bulk,hold_the_line,guard,hype,spotlight]`, front wall-only, avoid `[peacock,flamingo,echo,grow,patch,wake,mosquito,drain,pin,sting]` — match echo_hype strength (evidence: grow_hype n=12, −209; L2h 0-9/−233)
- [ ] **HANDLE_SWAP_HEDGE `novagamingx4`:** chip_snipe → grow_hype (n=9, −222)
- [ ] **HANDLE_SWAP_HEDGE `thephatp`:** wake_chip → chip_snipe (n=12, −108)
- [ ] **HANDLE_SWAP_HEDGE `javabeanai`:** glass_burst → backline_snipe (n=12, −64)
- [ ] **HANDLE_SWAP_HEDGE `jst_icn71`:** buff_suicide → hurt_revenge (n=8, −71)
- [ ] **HANDLE_SWAP_HEDGE `heywoozyv3y3`:** chip_snipe → flamingo_pass (n=8, −77 L2h)
- [ ] **HANDLE_SWAP_HEDGE `fourseasonsgrn`:** backline_snipe → ko_snowball/grow_scale (−105)
- [ ] **HANDLE_SWAP_HEDGE `aj121503`:** grow_scale → echo_hype (−242)
- [ ] **Name-level tip ban: Webby** on all wall arches (glass/chip/bulk_echo/flamingo/hurt/echo_hype/wake/grow_hype/backline) — evidence n=16+ all-time, n=11 L2h
- [ ] **Name-level tip ban: Copy Humanizer, Morning Newspaper** on glass/chip/backline/grow_hype (not only flamingo_pass)
- [ ] **Stop boosting soft-bulk names:** if name ∈ {NYC Parent, Webby} then do NOT apply bulk +4.5 wall bonus; apply tip penalty instead
- [ ] **backline_snipe fill refuse:** add peacock/patch/flamingo/Webby/Love (currently only wake/drain/mosquito/sidestep/sting) — L2h backline −101
- [ ] **hardAvoid rematch gate** for eloΣ≤−40 / 2-loss streak before queue (novagaming, aj121503, sandisjonass, converse1nation)
- [ ] **hype_battery / sustain** plans: tighten tip avoids (Projects Manager double-NYC draw toxic already noted; sustain −7.1 epg)

---

## Concrete encode recommendations (with evidence n=)

### A. Arch → prefer / avoid

1. **`grow_hype` / `grow_scale` → wall+teeth only** (n_close=12+4, elo −209/−57; fightWR 29%/31%; L2h grow_hype 0-9). Prefer: bulk, hold_the_line, guard, hype, spotlight. Avoid: peacock, flamingo, echo, grow, patch, wake, mosquito, drain, pin, sting. Front: bulk, hold_the_line only.
2. **`echo_hype` keep current wall plan; strengthen opener** (n=11, −236, WR 9%). Refuse any tip name on round-0 even without ghost.
3. **`backline_snipe` widen avoid** (n=67, −191; fightWR 55%). Add flamingo, peacock, patch, soft-bulk names to avoid/fill-refuse.
4. **`chip_snipe` keep wall plan; name-ban Webby/NYC** (tip_fail 28 all-time, 13 L2h).
5. **`glass_burst` keep as-is** (+797) — only add Webby to name tip ban.

### B. Handle hedges (HANDLE_SWAP_HEDGE)

```js
novagamingx4: { whenArch: ["chip_snipe","grow_hype"], alsoAvoidFrom: "grow_hype",
  stripPrefer: ["peacock","flamingo","echo","grow","patch","wake","drain","mosquito"] }, // n=9, -222
thephatp: { whenArch: ["wake_chip","chip_snipe"], alsoAvoidFrom: "chip_snipe",
  stripPrefer: ["peacock","flamingo","patch","wake","drain"] }, // n=12, -108
javabeanai: { whenArch: ["glass_burst","backline_snipe"], alsoAvoidFrom: "backline_snipe",
  stripPrefer: ["wake","flamingo","drain","mosquito","patch"] }, // n=12, -64
jst_icn71: { whenArch: ["buff_suicide","hurt_revenge"], alsoAvoidFrom: "hurt_revenge",
  stripPrefer: ["peacock","flamingo","wake","sting","patch"] }, // n=8, -71
heywoozyv3y3: { whenArch: ["chip_snipe","flamingo_pass"], alsoAvoidFrom: "flamingo_pass",
  stripPrefer: ["flamingo","peacock","wake","sting","patch","echo"] }, // n≈8, -77
aj121503: { whenArch: ["grow_scale","echo_hype"], alsoAvoidFrom: "echo_hype",
  stripPrefer: ["peacock","flamingo","wake","patch","drain","mosquito"] }, // n=10, -242
```

### C. Shop / fill hard refuses (play_loop)

1. Extend `isGlassWakeTipName` / shared `isSoftTipName` to include: **webby, copy humanizer, the morning newspaper** (and keep nyc parent, love, video edit desk).
2. Apply soft-tip name refuse on: glass_burst, chip_snipe, bulk_echo, wake_chip, echo_hype, flamingo_pass, hurt_revenge, **grow_hype, grow_scale, backline_snipe**.
3. If `isSoftTipName(n)`: skip bulk wall bonus; apply −12 tip penalty (same as NYC today).
4. hardAvoid: skip rematch when avoid record eloSum≤−40 or losses≥3 in recent window (novagamingx4, aj121503, converse1nation, sandisjonass).

---

## Appendix — tip fail name×arch (all-time aggregate)

| Tip | Arch | n |
|---|---|---:|
| nyc parent(bulk) | `chip_snipe` | 10 |
| nyc parent(bulk) | `glass_burst` | 9 |
| webby(bulk) | `backline_snipe` | 8 |
| webby(bulk) | `glass_burst` | 6 |
| webby(bulk) | `chip_snipe` | 6 |
| love(patch) | `wake_chip` | 5 |
| love(patch) | `glass_burst` | 5 |
| webby(bulk) | `hurt_revenge` | 5 |
| copy humanizer(flamingo) | `backline_snipe` | 5 |
| stills clips desk(wake) | `chip_snipe` | 5 |
| nyc parent(bulk) | `bulk_echo` | 4 |
| nyc parent(bulk) | `hurt_revenge` | 4 |
| the morning newspaper(flamingo) | `chip_snipe` | 4 |
| customer call coach assistant(peacock) | `wake_chip` | 3 |
| love(patch) | `bulk_echo` | 3 |
| the morning newspaper(flamingo) | `bulk_echo` | 3 |
| copy humanizer(flamingo) | `glass_burst` | 3 |
| flora plant care log(patch) | `glass_burst` | 3 |
| stills clips desk(wake) | `flamingo_pass` | 3 |
| copy humanizer(flamingo) | `ko_snowball` | 3 |
| nyc parent(bulk) | `ko_snowball` | 3 |
| love(patch) | `backline_snipe` | 3 |
| copy humanizer(flamingo) | `chip_snipe` | 3 |
| deal hunting(drain) | `chip_snipe` | 3 |
| customer call coach assistant(peacock) | `echo_hype` | 3 |
| stills clips desk(wake) | `echo_hype` | 3 |
| webby(bulk) | `wake_chip` | 2 |
| nyc parent(bulk) | `wake_chip` | 2 |
| copy humanizer(flamingo) | `bulk_echo` | 2 |
| stills clips desk(wake) | `bulk_echo` | 2 |

## Appendix — plan reason prefixes

- `policy_v1`: 1897
- `policy_fill3`: 388
- `policy_opener_reroll`: 55

---

_End of FULL_MATCH_STUDY. No climb restart performed._
