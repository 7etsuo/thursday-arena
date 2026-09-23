# LOSS vs WIN RECIPE — tetsuoai climb

_Generated 2026-09-18 16:55 MT (America/Edmonton). Analysis only — no play_loop patches._

## Data inventory (read-only)

| Source | Files / rows | Notes |
|---|---:|---|
| `matches/climb/batch-*.log` | 120 files / 27365 lines | batch-20260918-053826.log → batch-20260918-165532.log |
| `matches/climb/match-*.log` | 174 files / 3172 lines | early single-match runs |
| `matches/log.jsonl` | 1541 lines | board_summary + rating_delta |
| `data/decisions/events.jsonl` | 24559 lines | shop/ghost/fight/match_end |
| `memory/ghosts/*.json` | 386 | fingerprints (not mutated) |
| Parsed unique series | **1539** | climb logs primary; +4 decisions-only |

**Parse issues:** 4 files empty/corrupt (listed in `_inventory_snapshot.json`). No data deleted.

---

## Executive summary — why we lose (evidence)

1. **Asymmetric elo tax:** overall **1194-118-227** (W-D-L) / eloΣ **-6** at WR 78% — wins pay ~+3–8, losses cost ~−20–30.
2. **Top bleed farms:** `aj121503` 0-1-9 (-242, arch=echo_hype); `novagamingx4` 2-0-9 (-222, arch=grow_hype); `chr1sr1chards` 2-0-7 (-180, arch=hurt_revenge); `converse1nation` 2-0-8 (-167, arch=bulk_echo); `logosworks` 2-1-8 (-166, arch=sustain).
3. **Worst opponent arches by elo:** `grow_hype` 3-0-12 (-292); `flamingo_pass` 110-24-27 (-286); `sustain` 15-4-13 (-251); `echo_hype` 1-1-9 (-236); `wake_chip` 39-13-12 (-205).
4. **Soft-tip / glass seats over-index on losses:** Love ❤️ (lift+7%), Hiring Signals (lift+6%), Deal Hunting (lift+5%), Pipeline Pulse (lift+5%). These tip into flamingo_pass / hurt_revenge / chip_snipe / grow_hype walls.
5. **Process vs strategy:** `36` shop `error` events (`unit is not defined`×24, `k is not defined`×10) across 36 log files; 0 series still recorded a result after error (0-0-0, eloΣ +0). Soft-tip L/D boards remain the main strategy bleed; post-fix batches show no new `k is not defined` after latest fix window.

---

## Overall W/L/D + elo

| Window | n | W | D | L | eloΣ | WR |
|---|---:|---:|---:|---:|---:|---:|
| All parsed | 1539 | 1194 | 118 | 227 | -6 | 77.6% |
| Last 2h (since 14:55 MT) | 765 | 591 | 62 | 112 | +24 | 77.3% |
| Series with error→result | 0 | 0 | 0 | 0 | +0 | — |

## Top 10 loss opponents (by elo bleed)

| # | Opponent | W-D-L | eloΣ | Top loss arch | Win board (mode) | Loss board (mode) |
|---:|---|---:|---:|---|---|---|
| 1 | `aj121503` | 0-1-9 | -242 | echo_hype | — | Customer Call Coach & Assistant | Pipeline Pulse | Luma Pages |
| 2 | `novagamingx4` | 2-0-9 | -222 | grow_hype | Imogen | Meeting Recap Deck | Writing Bot | Meeting Recap Deck | Writing Bot | Luma Pages |
| 3 | `chr1sr1chards` | 2-0-7 | -180 | hurt_revenge | Imogen | The Morning Newspaper | Account Research Desk | Pipeline Pulse | Credit Card Max | Deal Inspector |
| 4 | `converse1nation` | 2-0-8 | -167 | bulk_echo | NYC Parent | Paid Media Report Desk | Call Follow-Ups | Copy Humanizer | Stills & Clips Desk | Love ❤️ |
| 5 | `logosworks` | 2-1-8 | -166 | sustain | Deal Inspector | Cooper | WTD | Imogen | Copy Humanizer | Copy Humanizer |
| 6 | `seano1022` | 1-0-6 | -139 | wake_chip | The Morning Newspaper | Office Ops Desk | Writing Bot | Imogen | Meeting Recap Deck | EBR & Value Deck Builder |
| 7 | `misha_erm` | 4-0-5 | -135 | chip_snipe | The Morning Newspaper | Copy Humanizer | Paid Media Report Desk | Imogen | Webby | Love ❤️ |
| 8 | `thefieldpass` | 1-2-8 | -127 | buff_suicide | NYC Parent | The Morning Newspaper | Writing Bot | SEO & AEO Desk | Signal Prospector | EBR & Value Deck Builder |
| 9 | `sandisjonass` | 4-0-5 | -124 | chip_snipe | NYC Parent | Imogen | Luma Pages | Cooper | Customer Call Coach & Assistant | Overheard |
| 10 | `dlsusco` | 3-1-5 | -112 | hurt_revenge | Company Docs Q&A | Call Follow-Ups | Writing Bot | Imogen | Video Edit Desk | Critiquito: Design Critique |

### Also: top 10 by raw loss count

| Opponent | W-D-L | eloΣ | Losses |
|---|---:|---:|---:|
| `aj121503` | 0-1-9 | -242 | 9 |
| `novagamingx4` | 2-0-9 | -222 | 9 |
| `converse1nation` | 2-0-8 | -167 | 8 |
| `logosworks` | 2-1-8 | -166 | 8 |
| `thefieldpass` | 1-2-8 | -127 | 8 |
| `chr1sr1chards` | 2-0-7 | -180 | 7 |
| `seano1022` | 1-0-6 | -139 | 6 |
| `misha_erm` | 4-0-5 | -135 | 5 |
| `sandisjonass` | 4-0-5 | -124 | 5 |
| `dlsusco` | 3-1-5 | -112 | 5 |

---

## Archetype / ghostFp loss matrix

### By close-arch (sorted by eloΣ)

| Arch | n | W-D-L | eloΣ | WR | Loss fronts (us) | Win fronts (us) |
|---|---:|---:|---:|---:|---|---|
| `grow_hype` | 15 | 3-0-12 | -292 | 20% | Stills & Clips Desk×2, Office Ops Desk×2, Meeting Recap Deck×1, WTD×1, Webby×1 | Imogen×2, Company Docs Q&A×1 |
| `flamingo_pass` | 161 | 110-24-27 | -286 | 68% | Imogen×5, Company Docs Q&A×5, Office Ops Desk×3, Flora: Plant Care Log×2, EBR & Value Deck Builder×2 | Imogen×23, NYC Parent×16, Webby×10, Company Docs Q&A×9, Office Ops Desk×9 |
| `sustain` | 32 | 15-4-13 | -251 | 47% | Outbound Prospecting×2, Copy Humanizer×2, Flora: Plant Care Log×2, Love ❤️×1, Signal Prospector×1 | The Morning Newspaper×4, Office Ops Desk×3, NYC Parent×2, Cooper×1, Copy Humanizer×1 |
| `echo_hype` | 11 | 1-1-9 | -236 | 9% | Imogen×2, Customer Call Coach & Assistant×1, Luma Pages×1, NYC Parent×1, Stills & Clips Desk×1 | Paid Media Report Desk×1 |
| `wake_chip` | 64 | 39-13-12 | -205 | 61% | Imogen×2, NYC Parent×2, Webby×1, Nightly Audit Engineer×1, GTM Loop Closer×1 | Imogen×8, The Morning Newspaper×7, NYC Parent×5, Webby×5, Paid Media Report Desk×3 |
| `hurt_revenge` | 172 | 131-9-32 | -173 | 76% | Imogen×9, NYC Parent×5, Partnerships Call Coach×2, Webby×2, Office Ops Desk×2 | The Morning Newspaper×20, Office Ops Desk×18, Imogen×15, Copy Humanizer×12, NYC Parent×12 |
| `bulk_echo` | 41 | 31-1-9 | -74 | 76% | Copy Humanizer×2, The Morning Newspaper×2, NYC Parent×2, Outbound Prospecting×1, Webby×1 | NYC Parent×7, Office Ops Desk×7, Webby×5, SEO & AEO Desk×2, Tradbot×2 |
| `hype_battery` | 29 | 19-3-7 | -72 | 66% | Office Ops Desk×2, NYC Parent×2, Copy Humanizer×1, Imogen×1, Nightly Audit Engineer×1 | Imogen×3, Webby×2, NYC Parent×2, Flora: Plant Care Log×2, The Morning Newspaper×2 |
| `grow_scale` | 7 | 4-0-3 | -36 | 57% | Company Docs Q&A×1, SEO & AEO Desk×1, Imogen×1 | Copy Humanizer×2, Webby×1, Ad Spend Watch×1 |
| `backline_snipe` | 145 | 117-12-16 | +61 | 81% | Imogen×4, Webby×2, Office Ops Desk×2, Love ❤️×1, Copy Humanizer×1 | Imogen×27, The Morning Newspaper×15, Office Ops Desk×13, Copy Humanizer×10, NYC Parent×7 |
| `chip_snipe` | 295 | 240-15-40 | +152 | 81% | NYC Parent×5, Webby×4, Flora: Plant Care Log×4, The Morning Newspaper×3, Company Docs Q&A×3 | Imogen×40, Office Ops Desk×35, The Morning Newspaper×30, NYC Parent×26, Webby×24 |
| `ko_snowball` | 73 | 61-5-7 | +189 | 84% | NYC Parent×3, Company Docs Q&A×1, Copy Humanizer×1, Imogen×1, figma bro×1 | Webby×10, Imogen×10, The Morning Newspaper×9, Office Ops Desk×7, Copy Humanizer×4 |
| `buff_suicide` | 88 | 77-3-8 | +291 | 88% | EBR & Value Deck Builder×1, SEO & AEO Desk×1, Paid Media Report Desk×1, Imogen×1, Event Request Desk×1 | Imogen×13, Office Ops Desk×9, The Morning Newspaper×8, Webby×7, NYC Parent×6 |
| `glass_burst` | 405 | 345-28-32 | +923 | 85% | NYC Parent×6, Company Docs Q&A×4, Office Ops Desk×3, Imogen×3, Webby×2 | Webby×43, The Morning Newspaper×43, NYC Parent×41, Imogen×36, Office Ops Desk×32 |

### Top bleeding ghost fingerprints

| ghostFp | n | W-D-L | eloΣ | Arch | Top opp |
|---|---:|---:|---:|---|---|
| `paid media report desk | cooper | wtd` | 9 | 0-0-9 | -233 | grow_hype | `novagamingx4` |
| `writing bot | haggle bot | gtm loop closer` | 9 | 2-0-7 | -180 | hurt_revenge | `chr1sr1chards` |
| `office ops desk | x brief | product support inbox assistant` | 11 | 2-1-8 | -166 | sustain | `logosworks` |
| `webby | writing bot | call follow ups` | 6 | 0-0-6 | -156 | echo_hype | `aj121503` |
| `imogen | meeting recap deck | love` | 7 | 1-0-6 | -131 | bulk_echo | `converse1nation` |
| `pipeline pulse | cooper | x brief` | 9 | 4-0-5 | -124 | chip_snipe | `sandisjonass` |
| `ai search visibility | flora plant care log | call follow ups` | 6 | 2-0-4 | -110 | chip_snipe | `misha_erm` |
| `imogen | meeting recap deck | competitor watch` | 7 | 2-0-5 | -100 | chip_snipe | `krzyszt49207304` |
| `the morning newspaper | video edit desk | writing bot` | 4 | 0-0-4 | -100 | flamingo_pass | `fatkiddeals` |
| `nyc parent | sales call coach | account research desk` | 7 | 2-1-4 | -92 | hurt_revenge | `dlsusco` |
| `webby | writing bot | wtd` | 7 | 2-0-5 | -92 | hype_battery | `ethanamitchell` |
| `nyc parent | company docs q a | projects manager` | 5 | 1-0-4 | -90 | sustain | `kung_jook` |
| `webby | call follow ups | writing bot` | 4 | 0-1-3 | -86 | echo_hype | `aj121503` |
| `webby | wtd | credit card max` | 3 | 0-0-3 | -83 | grow_hype | `scottmrisk` |
| `webby | stills clips desk | figma bro` | 4 | 1-0-3 | -82 | wake_chip | `darkwidowxx` |

---

## CRITICAL: Win vs Loss board contrast (top bleed lines)

### `aj121503` — 0-1-9 / -242 elo (arch=echo_hype)

- **When we WON** fronts: —
- **When we LOST** fronts: Imogen×2, Customer Call Coach & Assistant×1, Luma Pages×1, NYC Parent×1, Stills & Clips Desk×1
- Win boards: _(none captured)_
- Loss boards: `Customer Call Coach & Assistant | Pipeline Pulse | Luma Pages` ×1; `Luma Pages | Customer Call Coach & Assistant | WTD` ×1; `NYC Parent | Company Docs Q&A | Customer Call Coach & Assistant` ×1; `Imogen | Copy Humanizer | Apple Search Ads Review` ×1
- Mid-series arch swaps in sample: 5; shop_errors: 0
- **Global wins vs `echo_hype`** (n=1): fronts Paid Media Report Desk×1; boards `Paid Media Report Desk | Flora: Plant Care Log | Overheard` ×1
- **RECIPE:** No win sample vs this handle — use global wins vs `echo_hype` above; or hardAvoid.

### `novagamingx4` — 2-0-9 / -222 elo (arch=grow_hype)

- **When we WON** fronts: Imogen×1, The Morning Newspaper×1
- **When we LOST** fronts: Stills & Clips Desk×2, Meeting Recap Deck×1, WTD×1, Webby×1, X Brief×1
- Win boards: `Imogen | Meeting Recap Deck | Writing Bot` ×1; `The Morning Newspaper | Lead Pipeline Desk | Writing Bot` ×1
- Loss boards: `Meeting Recap Deck | Writing Bot | Luma Pages` ×1; `WTD | Apple Search Ads Review | Apple Search Ads Review` ×1; `Webby | Outbound Prospecting | Deal Hunting` ×1; `X Brief | Deal Hunting | WTD` ×1
- Mid-series arch swaps in sample: 11; shop_errors: 0
- **Global wins vs `grow_hype`** (n=3): fronts Imogen×2, Company Docs Q&A×1; boards `Company Docs Q&A | Love ❤️ | X Brief` ×1; `Imogen | X Brief | X Brief` ×1; `Imogen | Copy Humanizer | NYC Parent` ×1
- **RECIPE:** Prefer front `Imogen`; refuse/sell `Stills & Clips Desk` into this line.

### `chr1sr1chards` — 2-0-7 / -180 elo (arch=hurt_revenge)

- **When we WON** fronts: Imogen×1, NYC Parent×1
- **When we LOST** fronts: Imogen×2, Company Docs Q&A×2, Pipeline Pulse×1, Product Support Inbox Assistant×1, The Morning Newspaper×1
- Win boards: `Imogen | The Morning Newspaper | Account Research Desk` ×1; `NYC Parent | Event Request Desk | GTM Loop Closer` ×1
- Loss boards: `Pipeline Pulse | Credit Card Max | Deal Inspector` ×1; `Imogen | Love ❤️ | Company Docs Q&A` ×1; `Company Docs Q&A | Outbound Prospecting | Love ❤️` ×1; `Product Support Inbox Assistant | Stills & Clips Desk | Apple Search Ads Review` ×1
- Mid-series arch swaps in sample: 9; shop_errors: 0
- **Global wins vs `hurt_revenge`** (n=131): fronts The Morning Newspaper×20, Office Ops Desk×18, Imogen×15, Copy Humanizer×12, NYC Parent×12; boards `Copy Humanizer | Company Docs Q&A | Meeting Recap Deck` ×3; `The Morning Newspaper | Company Docs Q&A | Meeting Recap Deck` ×1; `The Morning Newspaper | Company Docs Q&A | Call Follow-Ups` ×1; `The Morning Newspaper | Video Edit Desk | WTD` ×1
- **RECIPE:** Keep winning pattern — front `Imogen` / boards above.

### `converse1nation` — 2-0-8 / -167 elo (arch=bulk_echo)

- **When we WON** fronts: NYC Parent×1, Webby×1
- **When we LOST** fronts: Copy Humanizer×2, The Morning Newspaper×2, NYC Parent×2, Outbound Prospecting×1, Webby×1
- Win boards: `NYC Parent | Paid Media Report Desk | Call Follow-Ups` ×1; `Webby | Tradbot | Luma Pages` ×1
- Loss boards: `Copy Humanizer | Stills & Clips Desk | Love ❤️` ×1; `Outbound Prospecting | Site Audit | Luma Pages` ×1; `The Morning Newspaper | Stills & Clips Desk | GTM Prospecting` ×1; `Copy Humanizer | Writing Bot | The Morning Newspaper` ×1
- Mid-series arch swaps in sample: 0; shop_errors: 0
- **Global wins vs `bulk_echo`** (n=31): fronts NYC Parent×7, Office Ops Desk×7, Webby×5, SEO & AEO Desk×2, Tradbot×2; boards `NYC Parent | Paid Media Report Desk | Call Follow-Ups` ×1; `Webby | Tradbot | Luma Pages` ×1; `SEO & AEO Desk | Love ❤️ | X Brief` ×1; `Apple Search Ads Review | Office Ops Desk | Office Ops Desk` ×1
- **RECIPE:** Prefer front `NYC Parent`; refuse/sell `Copy Humanizer` into this line.

### `logosworks` — 2-1-8 / -166 elo (arch=sustain)

- **When we WON** fronts: Deal Inspector×1, The Morning Newspaper×1
- **When we LOST** fronts: Copy Humanizer×2, Flora: Plant Care Log×2, Imogen×1, Video Edit Desk×1, The Morning Newspaper×1
- Win boards: `Deal Inspector | Cooper | WTD` ×1; `The Morning Newspaper | The Morning Newspaper | Call Follow-Ups` ×1
- Loss boards: `Imogen | Copy Humanizer | Copy Humanizer` ×1; `Copy Humanizer | Love ❤️ | The Morning Newspaper` ×1; `Video Edit Desk | Outbound Prospecting | Credit Card Max` ×1; `The Morning Newspaper | Flora: Plant Care Log | Love ❤️` ×1
- Mid-series arch swaps in sample: 0; shop_errors: 0
- **Global wins vs `sustain`** (n=15): fronts The Morning Newspaper×4, Office Ops Desk×3, NYC Parent×2, Cooper×1, Copy Humanizer×1; boards `The Morning Newspaper | Call Follow-Ups | Pipeline Pulse` ×1; `Office Ops Desk | Recruiting Coordinator | Luma Pages` ×1; `NYC Parent | Copy Humanizer | Writing Bot` ×1; `Office Ops Desk | Luma Pages | Luma Pages` ×1
- **RECIPE:** Prefer front `Deal Inspector`; refuse/sell `Copy Humanizer` into this line.

### `seano1022` — 1-0-6 / -139 elo (arch=wake_chip)

- **When we WON** fronts: The Morning Newspaper×1
- **When we LOST** fronts: Imogen×2, Love ❤️×1, Event Request Desk×1, Sales Call Coach×1, The Morning Newspaper×1
- Win boards: `The Morning Newspaper | Office Ops Desk | Writing Bot` ×1
- Loss boards: `Imogen | Meeting Recap Deck | EBR & Value Deck Builder` ×1; `Imogen | Site Audit | Apple Search Ads Review` ×1; `Love ❤️ | GTM Prospecting | Credit Card Max` ×1; `Event Request Desk | Signal Prospector | Account Research Desk` ×1
- Mid-series arch swaps in sample: 3; shop_errors: 0
- **Global wins vs `wake_chip`** (n=39): fronts Imogen×8, The Morning Newspaper×7, NYC Parent×5, Webby×5, Paid Media Report Desk×3; boards `NYC Parent | Luma Pages | Credit Card Max` ×1; `Imogen | Company Docs Q&A | WTD` ×1; `Outbound Prospecting | Cooper | Recruiting Coordinator` ×1; `Event Request Desk | Signal Prospector | Projects Manager` ×1
- **Global wins vs `hurt_revenge`** (n=131): fronts The Morning Newspaper×20, Office Ops Desk×18, Imogen×15, Copy Humanizer×12, NYC Parent×12; boards `Copy Humanizer | Company Docs Q&A | Meeting Recap Deck` ×3; `The Morning Newspaper | Company Docs Q&A | Meeting Recap Deck` ×1; `The Morning Newspaper | Company Docs Q&A | Call Follow-Ups` ×1; `The Morning Newspaper | Video Edit Desk | WTD` ×1
- **RECIPE:** Prefer front `The Morning Newspaper`; refuse/sell `Imogen` into this line.

### `misha_erm` — 4-0-5 / -135 elo (arch=chip_snipe)

- **When we WON** fronts: The Morning Newspaper×1, Imogen×1, NYC Parent×1, Signal Prospector×1
- **When we LOST** fronts: Imogen×1, Product Idea Stress Test×1, GTM Loop Closer×1, Copy Humanizer×1, Paid Media Report Desk×1
- Win boards: `The Morning Newspaper | Copy Humanizer | Paid Media Report Desk` ×1; `Imogen | Product Idea Stress Test | WTD` ×1; `NYC Parent | WTD | Webby` ×1; `Signal Prospector | Hiring Signals | Writing Bot` ×1
- Loss boards: `Imogen | Webby | Love ❤️` ×1; `Product Idea Stress Test | WTD | Account Research Desk` ×1; `GTM Loop Closer | Webby | Stills & Clips Desk` ×1; `Copy Humanizer | Deal Hunting | Recruiting Coordinator` ×1
- Mid-series arch swaps in sample: 9; shop_errors: 0
- **Global wins vs `chip_snipe`** (n=240): fronts Imogen×40, Office Ops Desk×35, The Morning Newspaper×30, NYC Parent×26, Webby×24; boards `Imogen | Cooper | WTD` ×3; `The Morning Newspaper | Call Follow-Ups | Meeting Recap Deck` ×2; `NYC Parent | Company Docs Q&A | Luma Pages` ×2; `Imogen | Company Docs Q&A | Projects Manager` ×2
- **Global wins vs `glass_burst`** (n=345): fronts Webby×43, The Morning Newspaper×43, NYC Parent×41, Imogen×36, Office Ops Desk×32; boards `NYC Parent | Company Docs Q&A | WTD` ×3; `Imogen | Call Follow-Ups | WTD` ×3; `Webby | Copy Humanizer | Call Follow-Ups` ×2; `The Morning Newspaper | Copy Humanizer | Luma Pages` ×2
- **RECIPE:** Prefer front `The Morning Newspaper`; refuse/sell `Imogen` into this line.

### `thefieldpass` — 1-2-8 / -127 elo (arch=buff_suicide)

- **When we WON** fronts: NYC Parent×1
- **When we LOST** fronts: NYC Parent×2, Office Ops Desk×2, SEO & AEO Desk×1, Paid Media Report Desk×1, Imogen×1
- Win boards: `NYC Parent | The Morning Newspaper | Writing Bot` ×1
- Loss boards: `SEO & AEO Desk | Signal Prospector | EBR & Value Deck Builder` ×1; `NYC Parent | Copy Humanizer | Luma Pages` ×1; `Paid Media Report Desk | Apple Search Ads Review | X Brief` ×1; `NYC Parent | SEO & AEO Desk | X Brief` ×1
- Mid-series arch swaps in sample: 11; shop_errors: 0
- **Global wins vs `buff_suicide`** (n=77): fronts Imogen×13, Office Ops Desk×9, The Morning Newspaper×8, Webby×7, NYC Parent×6; boards `Imogen | The Morning Newspaper | Writing Bot` ×2; `Webby | GTM Loop Closer | Luma Pages` ×1; `Webby | Office Ops Desk | Writing Bot` ×1; `Office Ops Desk | Apple Search Ads Review | Pipeline Pulse` ×1
- **Global wins vs `hurt_revenge`** (n=131): fronts The Morning Newspaper×20, Office Ops Desk×18, Imogen×15, Copy Humanizer×12, NYC Parent×12; boards `Copy Humanizer | Company Docs Q&A | Meeting Recap Deck` ×3; `The Morning Newspaper | Company Docs Q&A | Meeting Recap Deck` ×1; `The Morning Newspaper | Company Docs Q&A | Call Follow-Ups` ×1; `The Morning Newspaper | Video Edit Desk | WTD` ×1
- **RECIPE:** Keep winning pattern — front `NYC Parent` / boards above.

### `sandisjonass` — 4-0-5 / -124 elo (arch=chip_snipe)

- **When we WON** fronts: Imogen×2, NYC Parent×1, Office Ops Desk×1
- **When we LOST** fronts: Cooper×1, Nightly Audit Engineer×1, Company Docs Q&A×1, Webby×1, Customer Call Coach & Assistant×1
- Win boards: `NYC Parent | Imogen | Luma Pages` ×1; `Imogen | Company Docs Q&A | Imogen` ×1; `Office Ops Desk | Love ❤️ | Projects Manager` ×1; `Imogen | Luma Pages | Luma Pages` ×1
- Loss boards: `Cooper | Customer Call Coach & Assistant | Overheard` ×1; `Nightly Audit Engineer | Love ❤️ | Meeting Recap Deck` ×1; `Company Docs Q&A | Deal Hunting | Projects Manager` ×1; `Webby | Webby | Deal Hunting` ×1
- Mid-series arch swaps in sample: 0; shop_errors: 0
- **Global wins vs `chip_snipe`** (n=240): fronts Imogen×40, Office Ops Desk×35, The Morning Newspaper×30, NYC Parent×26, Webby×24; boards `Imogen | Cooper | WTD` ×3; `The Morning Newspaper | Call Follow-Ups | Meeting Recap Deck` ×2; `NYC Parent | Company Docs Q&A | Luma Pages` ×2; `Imogen | Company Docs Q&A | Projects Manager` ×2
- **RECIPE:** Prefer front `Imogen`; refuse/sell `Cooper` into this line.

### `dlsusco` — 3-1-5 / -112 elo (arch=hurt_revenge)

- **When we WON** fronts: NYC Parent×2, Company Docs Q&A×1
- **When we LOST** fronts: Imogen×2, Partnerships Call Coach×1, NYC Parent×1, Meeting Recap Deck×1
- Win boards: `Company Docs Q&A | Call Follow-Ups | Writing Bot` ×1; `NYC Parent | Webby | Imogen` ×1; `NYC Parent | X Brief | Projects Manager` ×1
- Loss boards: `Imogen | Video Edit Desk | Critiquito: Design Critique` ×1; `Partnerships Call Coach | Signal Prospector | X Brief` ×1; `NYC Parent | NYC Parent | Projects Manager` ×1; `Meeting Recap Deck | Projects Manager | Apple Search Ads Review` ×1
- Mid-series arch swaps in sample: 7; shop_errors: 0
- **Global wins vs `hurt_revenge`** (n=131): fronts The Morning Newspaper×20, Office Ops Desk×18, Imogen×15, Copy Humanizer×12, NYC Parent×12; boards `Copy Humanizer | Company Docs Q&A | Meeting Recap Deck` ×3; `The Morning Newspaper | Company Docs Q&A | Meeting Recap Deck` ×1; `The Morning Newspaper | Company Docs Q&A | Call Follow-Ups` ×1; `The Morning Newspaper | Video Edit Desk | WTD` ×1
- **Global wins vs `flamingo_pass`** (n=110): fronts Imogen×23, NYC Parent×16, Webby×10, Company Docs Q&A×9, Office Ops Desk×9; boards `Recruiting Coordinator | Love ❤️ | X Brief` ×2; `Company Docs Q&A | Call Follow-Ups | Writing Bot` ×1; `NYC Parent | Company Docs Q&A | Game Art Director` ×1; `Imogen | Nightly Audit Engineer | Customer Proof Desk` ×1
- **RECIPE:** Prefer front `NYC Parent`; refuse/sell `Imogen` into this line.

### `nickhenryyy` — 7-1-5 / -112 elo (arch=glass_burst)

- **When we WON** fronts: Company Docs Q&A×1, Copy Humanizer×1, Nightly Audit Engineer×1, Game Art Director×1, Flora: Plant Care Log×1
- **When we LOST** fronts: EBR & Value Deck Builder×1, Video Edit Desk×1, NYC Parent×1, Deal Inspector×1, Pipeline Pulse×1
- Win boards: `Company Docs Q&A | Tradbot | Company Docs Q&A` ×1; `Copy Humanizer | Outbound Prospecting | Credit Card Max` ×1; `Nightly Audit Engineer | Flora: Plant Care Log | Cooper` ×1; `Game Art Director | Projects Manager | Apple Search Ads Review` ×1
- Loss boards: `EBR & Value Deck Builder | Flora: Plant Care Log | Site Audit` ×1; `Video Edit Desk | Talent Discovery` ×1; `NYC Parent | Copy Humanizer | Overheard` ×1; `Deal Inspector | Luma Pages | Writing Bot` ×1
- Mid-series arch swaps in sample: 0; shop_errors: 0
- **Global wins vs `glass_burst`** (n=345): fronts Webby×43, The Morning Newspaper×43, NYC Parent×41, Imogen×36, Office Ops Desk×32; boards `NYC Parent | Company Docs Q&A | WTD` ×3; `Imogen | Call Follow-Ups | WTD` ×3; `Webby | Copy Humanizer | Call Follow-Ups` ×2; `The Morning Newspaper | Copy Humanizer | Luma Pages` ×2
- **RECIPE:** Prefer front `Company Docs Q&A`; refuse/sell `EBR & Value Deck Builder` into this line.

### `thephatp` — 7-0-5 / -108 elo (arch=chip_snipe)

- **When we WON** fronts: Office Ops Desk×2, Copy Humanizer×2, Imogen×2, Credit Card Max×1
- **When we LOST** fronts: Flora: Plant Care Log×1, Company Docs Q&A×1, Imogen×1, Tradbot×1, GTM Loop Closer×1
- Win boards: `Office Ops Desk | Copy Humanizer | WTD` ×1; `Office Ops Desk | Tradbot | Projects Manager` ×1; `Copy Humanizer | Pipeline Pulse | Nightly Audit Engineer` ×1; `Copy Humanizer | Flora: Plant Care Log | Deal Inspector` ×1
- Loss boards: `Flora: Plant Care Log | Site Audit | Call Follow-Ups` ×1; `Company Docs Q&A | Hiring Signals | Account Research Desk` ×1; `Imogen | WTD | NYC Parent` ×1; `Tradbot | Meeting Recap Deck | Cooper` ×1
- Mid-series arch swaps in sample: 12; shop_errors: 0
- **Global wins vs `chip_snipe`** (n=240): fronts Imogen×40, Office Ops Desk×35, The Morning Newspaper×30, NYC Parent×26, Webby×24; boards `Imogen | Cooper | WTD` ×3; `The Morning Newspaper | Call Follow-Ups | Meeting Recap Deck` ×2; `NYC Parent | Company Docs Q&A | Luma Pages` ×2; `Imogen | Company Docs Q&A | Projects Manager` ×2
- **RECIPE:** Prefer front `Office Ops Desk`; refuse/sell `Flora: Plant Care Log` into this line.

---

## Win recipe per major arch

### `glass_burst` — 345-28-32 / +923 (n=405)

- **BUY / FRONT:** Webby×43, The Morning Newspaper×43, NYC Parent×41, Imogen×36, Office Ops Desk×32
- **REFUSE / don't tip:** NYC Parent×6, Company Docs Q&A×4, Office Ops Desk×3, Imogen×3, Webby×2
- Units over-index on wins: The Morning Newspaper (Δ+17%), Call Follow-Ups (Δ+11%), Credit Card Max (Δ+11%), Cooper (Δ+8%), Office Ops Desk (Δ+7%)
- Units over-index on losses: Pipeline Pulse (Δ-14%), EBR & Value Deck Builder (Δ-9%), Writing Bot (Δ-7%), Flora: Plant Care Log (Δ-7%), Deal Hunting (Δ-6%)
- Win board modes: `NYC Parent | Company Docs Q&A | WTD` ×3; `Imogen | Call Follow-Ups | WTD` ×3; `Webby | Copy Humanizer | Call Follow-Ups` ×2; `The Morning Newspaper | Copy Humanizer | Luma Pages` ×2
- Loss board modes: `Webby | EBR & Value Deck Builder | Apple Search Ads Review` ×1; `NYC Parent | Pipeline Pulse | Writing Bot` ×1; `NYC Parent | Love ❤️ | Luma Pages` ×1; `Company Docs Q&A | Projects Manager | GTM Account Research` ×1

### `chip_snipe` — 240-15-40 / +152 (n=295)

- **BUY / FRONT:** Imogen×40, Office Ops Desk×35, The Morning Newspaper×30, NYC Parent×26, Webby×24
- **REFUSE / don't tip:** NYC Parent×5, Webby×4, Flora: Plant Care Log×4, The Morning Newspaper×3, Company Docs Q&A×3
- Units over-index on wins: Office Ops Desk (Δ+15%), Imogen (Δ+14%), Copy Humanizer (Δ+10%), Credit Card Max (Δ+9%), Luma Pages (Δ+8%)
- Units over-index on losses: Hiring Signals (Δ-14%), Deal Hunting (Δ-12%), Stills & Clips Desk (Δ-10%), Site Audit (Δ-7%), Love ❤️ (Δ-5%)
- Win board modes: `Imogen | Cooper | WTD` ×3; `The Morning Newspaper | Call Follow-Ups | Meeting Recap Deck` ×2; `NYC Parent | Company Docs Q&A | Luma Pages` ×2; `Imogen | Company Docs Q&A | Projects Manager` ×2
- Loss board modes: `Webby | Company Docs Q&A | NYC Parent` ×1; `NYC Parent | The Morning Newspaper | Nightly Audit Engineer` ×1; `The Morning Newspaper | Office Ops Desk | Projects Manager` ×1; `NYC Parent | Stills & Clips Desk | Office Ops Desk` ×1

### `hurt_revenge` — 131-9-32 / -173 (n=172)

- **BUY / FRONT:** The Morning Newspaper×20, Office Ops Desk×18, Imogen×15, Copy Humanizer×12, NYC Parent×12
- **REFUSE / don't tip:** Imogen×9, NYC Parent×5, Partnerships Call Coach×2, Webby×2, Office Ops Desk×2
- Units over-index on wins: Writing Bot (Δ+17%), Call Follow-Ups (Δ+13%), WTD (Δ+12%), The Morning Newspaper (Δ+10%), Office Ops Desk (Δ+8%)
- Units over-index on losses: Imogen (Δ-25%), Apple Search Ads Review (Δ-12%), Love ❤️ (Δ-10%), Deal Inspector (Δ-9%), Pipeline Pulse (Δ-8%)
- Win board modes: `Copy Humanizer | Company Docs Q&A | Meeting Recap Deck` ×3; `The Morning Newspaper | Company Docs Q&A | Meeting Recap Deck` ×1; `The Morning Newspaper | Company Docs Q&A | Call Follow-Ups` ×1; `The Morning Newspaper | Video Edit Desk | WTD` ×1
- Loss board modes: `Partnerships Call Coach | Signal Prospector | X Brief` ×1; `NYC Parent | NYC Parent | Projects Manager` ×1; `Meeting Recap Deck | Projects Manager | Apple Search Ads Review` ×1; `Imogen | Signal Prospector | Imogen` ×1

### `flamingo_pass` — 110-24-27 / -286 (n=161)

- **BUY / FRONT:** Imogen×23, NYC Parent×16, Webby×10, Company Docs Q&A×9, Office Ops Desk×9
- **REFUSE / don't tip:** Imogen×5, Company Docs Q&A×5, Office Ops Desk×3, Flora: Plant Care Log×2, EBR & Value Deck Builder×2
- Units over-index on wins: NYC Parent (Δ+16%), Call Follow-Ups (Δ+14%), Luma Pages (Δ+10%), Meeting Recap Deck (Δ+10%), Writing Bot (Δ+9%)
- Units over-index on losses: Hiring Signals (Δ-12%), EBR & Value Deck Builder (Δ-10%), Event Request Desk (Δ-10%), Apple Search Ads Review (Δ-9%), Company Docs Q&A (Δ-9%)
- Win board modes: `Recruiting Coordinator | Love ❤️ | X Brief` ×2; `Company Docs Q&A | Call Follow-Ups | Writing Bot` ×1; `NYC Parent | Company Docs Q&A | Game Art Director` ×1; `Imogen | Nightly Audit Engineer | Customer Proof Desk` ×1
- Loss board modes: `Imogen | Video Edit Desk | Critiquito: Design Critique` ×1; `Stills & Clips Desk | Deal Inspector | Writing Bot` ×1; `GTM Loop Closer | Hiring Signals | Projects Manager` ×1; `Product Support Inbox Assistant | Apple Search Ads Review | Executive Assistant` ×1

### `backline_snipe` — 117-12-16 / +61 (n=145)

- **BUY / FRONT:** Imogen×27, The Morning Newspaper×15, Office Ops Desk×13, Copy Humanizer×10, NYC Parent×7
- **REFUSE / don't tip:** Imogen×4, Webby×2, Office Ops Desk×2, Love ❤️×1, Copy Humanizer×1
- Units over-index on wins: NYC Parent (Δ+18%), The Morning Newspaper (Δ+15%), WTD (Δ+11%), Call Follow-Ups (Δ+10%), X Brief (Δ+10%)
- Units over-index on losses: Copy Humanizer (Δ-17%), Luma Pages (Δ-14%), Paid Media Report Desk (Δ-14%), Love ❤️ (Δ-12%), Credit Card Max (Δ-10%)
- Win board modes: `Office Ops Desk | Copy Humanizer | Credit Card Max` ×1; `Copy Humanizer | Credit Card Max | Deal Inspector` ×1; `Imogen | SEO & AEO Desk | Product Support Inbox Assistant` ×1; `The Morning Newspaper | Tradbot | Writing Bot` ×1
- Loss board modes: `Webby | Company Docs Q&A | Credit Card Max` ×1; `Love ❤️ | Luma Pages` ×1; `Copy Humanizer | Credit Card Max | Pitch Deck Coach` ×1; `Imogen | Copy Humanizer | Webby` ×1

### `buff_suicide` — 77-3-8 / +291 (n=88)

- **BUY / FRONT:** Imogen×13, Office Ops Desk×9, The Morning Newspaper×8, Webby×7, NYC Parent×6
- **REFUSE / don't tip:** EBR & Value Deck Builder×1, SEO & AEO Desk×1, Paid Media Report Desk×1, Imogen×1, Event Request Desk×1
- Units over-index on wins: Writing Bot (Δ+18%), Company Docs Q&A (Δ+14%), Credit Card Max (Δ+14%), NYC Parent (Δ+12%), Webby (Δ+10%)
- Units over-index on losses: Apple Search Ads Review (Δ-15%), Copy Humanizer (Δ-15%), Outbound Prospecting (Δ-9%), Pipeline Pulse (Δ-7%), Flora: Plant Care Log (Δ-6%)
- Win board modes: `Imogen | The Morning Newspaper | Writing Bot` ×2; `Webby | GTM Loop Closer | Luma Pages` ×1; `Webby | Office Ops Desk | Writing Bot` ×1; `Office Ops Desk | Apple Search Ads Review | Pipeline Pulse` ×1
- Loss board modes: `EBR & Value Deck Builder | Outbound Prospecting | The Morning Newspaper` ×1; `SEO & AEO Desk | Signal Prospector | EBR & Value Deck Builder` ×1; `Paid Media Report Desk | Apple Search Ads Review | X Brief` ×1; `Imogen | Luma Pages | Copy Humanizer` ×1

### `ko_snowball` — 61-5-7 / +189 (n=73)

- **BUY / FRONT:** Webby×10, Imogen×10, The Morning Newspaper×9, Office Ops Desk×7, Copy Humanizer×4
- **REFUSE / don't tip:** NYC Parent×3, Company Docs Q&A×1, Copy Humanizer×1, Imogen×1, figma bro×1
- Units over-index on wins: The Morning Newspaper (Δ+23%), Webby (Δ+19%), Credit Card Max (Δ+16%), Writing Bot (Δ+13%), Call Follow-Ups (Δ+13%)
- Units over-index on losses: NYC Parent (Δ-57%), WTD (Δ-20%), Video Edit Desk (Δ-8%), Meeting Recap Deck (Δ-6%), Tradbot (Δ-4%)
- Win board modes: `Imogen | The Morning Newspaper | Webby` ×2; `Webby | The Morning Newspaper | Webby` ×1; `Imogen | Video Edit Desk | Love ❤️` ×1; `Imogen | Office Ops Desk | Office Ops Desk` ×1
- Loss board modes: `Company Docs Q&A | Apple Search Ads Review | Cooper` ×1; `Copy Humanizer | EBR & Value Deck Builder | Luma Pages` ×1; `NYC Parent | WTD | Office Ops Desk` ×1; `NYC Parent | Webby | Video Edit Desk` ×1

### `wake_chip` — 39-13-12 / -205 (n=64)

- **BUY / FRONT:** Imogen×8, The Morning Newspaper×7, NYC Parent×5, Webby×5, Paid Media Report Desk×3
- **REFUSE / don't tip:** Imogen×2, NYC Parent×2, Webby×1, Nightly Audit Engineer×1, GTM Loop Closer×1
- Units over-index on wins: WTD (Δ+28%), Credit Card Max (Δ+15%), Video Edit Desk (Δ+10%), Apple Search Ads Review (Δ+10%), Paid Media Report Desk (Δ+10%)
- Units over-index on losses: Company Docs Q&A (Δ-15%), Cooper (Δ-9%)
- Win board modes: `NYC Parent | Luma Pages | Credit Card Max` ×1; `Imogen | Company Docs Q&A | WTD` ×1; `Outbound Prospecting | Cooper | Recruiting Coordinator` ×1; `Event Request Desk | Signal Prospector | Projects Manager` ×1
- Loss board modes: `Imogen | Copy Humanizer | X Brief` ×1; `Webby | Company Docs Q&A | Customer Call Coach & Assistant` ×1; `Nightly Audit Engineer | Cooper | Love ❤️` ×1; `NYC Parent | Site Audit | Writing Bot` ×1

### `bulk_echo` — 31-1-9 / -74 (n=41)

- **BUY / FRONT:** NYC Parent×7, Office Ops Desk×7, Webby×5, SEO & AEO Desk×2, Tradbot×2
- **REFUSE / don't tip:** Copy Humanizer×2, The Morning Newspaper×2, NYC Parent×2, Outbound Prospecting×1, Webby×1
- Units over-index on wins: Office Ops Desk (Δ+35%), Call Follow-Ups (Δ+23%), Webby (Δ+15%), Cooper (Δ+13%), Lead Pipeline Desk (Δ+13%)
- Units over-index on losses: The Morning Newspaper (Δ-27%), Love ❤️ (Δ-24%), SEO & AEO Desk (Δ-16%), Writing Bot (Δ-16%), Copy Humanizer (Δ-13%)
- Win board modes: `NYC Parent | Paid Media Report Desk | Call Follow-Ups` ×1; `Webby | Tradbot | Luma Pages` ×1; `SEO & AEO Desk | Love ❤️ | X Brief` ×1; `Apple Search Ads Review | Office Ops Desk | Office Ops Desk` ×1
- Loss board modes: `Copy Humanizer | Stills & Clips Desk | Love ❤️` ×1; `Outbound Prospecting | Site Audit | Luma Pages` ×1; `The Morning Newspaper | Stills & Clips Desk | GTM Prospecting` ×1; `Copy Humanizer | Writing Bot | The Morning Newspaper` ×1

### `sustain` — 15-4-13 / -251 (n=32)

- **BUY / FRONT:** The Morning Newspaper×4, Office Ops Desk×3, NYC Parent×2, Cooper×1, Copy Humanizer×1
- **REFUSE / don't tip:** Outbound Prospecting×2, Copy Humanizer×2, Flora: Plant Care Log×2, Love ❤️×1, Signal Prospector×1
- Units over-index on wins: Writing Bot (Δ+26%), The Morning Newspaper (Δ+25%), Luma Pages (Δ+12%), Cooper (Δ+5%)
- Units over-index on losses: Copy Humanizer (Δ-17%), Credit Card Max (Δ-17%), NYC Parent (Δ-10%)
- Win board modes: `The Morning Newspaper | Call Follow-Ups | Pipeline Pulse` ×1; `Office Ops Desk | Recruiting Coordinator | Luma Pages` ×1; `NYC Parent | Copy Humanizer | Writing Bot` ×1; `Office Ops Desk | Luma Pages | Luma Pages` ×1
- Loss board modes: `Love ❤️ | Pipeline Pulse | Credit Card Max` ×1; `Outbound Prospecting | Signal Prospector | Apple Search Ads Review` ×1; `Signal Prospector | X Brief | Writing Bot` ×1; `Outbound Prospecting | Credit Card Max | Hiring Signals` ×1

### `hype_battery` — 19-3-7 / -72 (n=29)

- **BUY / FRONT:** Imogen×3, Webby×2, NYC Parent×2, Flora: Plant Care Log×2, The Morning Newspaper×2
- **REFUSE / don't tip:** Office Ops Desk×2, NYC Parent×2, Copy Humanizer×1, Imogen×1, Nightly Audit Engineer×1
- Units over-index on wins: Writing Bot (Δ+32%), Luma Pages (Δ+26%), Webby (Δ+21%), Apple Search Ads Review (Δ+7%)
- Units over-index on losses: Meeting Recap Deck (Δ-18%), NYC Parent (Δ-18%), Copy Humanizer (Δ-13%), Office Ops Desk (Δ-13%), Imogen (Δ-8%)
- Win board modes: `Webby | Copy Humanizer | Webby` ×1; `NYC Parent | Apple Search Ads Review | Copy Humanizer` ×1; `NYC Parent | Apple Search Ads Review | Cooper` ×1; `Imogen | Office Ops Desk | Office Ops Desk` ×1
- Loss board modes: `Office Ops Desk | Meeting Recap Deck | AI Search Visibility` ×2; `Copy Humanizer | Copy Humanizer | Recruiting Coordinator` ×1; `NYC Parent | Apple Search Ads Review | Company Docs Q&A` ×1; `Imogen | Company Docs Q&A | Imogen` ×1

### `grow_hype` — 3-0-12 / -292 (n=15)

- **BUY / FRONT:** Imogen×2, Company Docs Q&A×1
- **REFUSE / don't tip:** Stills & Clips Desk×2, Office Ops Desk×2, Meeting Recap Deck×1, WTD×1, Webby×1
- Units over-index on wins: X Brief (Δ+92%)
- Win board modes: `Company Docs Q&A | Love ❤️ | X Brief` ×1; `Imogen | X Brief | X Brief` ×1; `Imogen | Copy Humanizer | NYC Parent` ×1
- Loss board modes: `Meeting Recap Deck | Writing Bot | Luma Pages` ×1; `WTD | Apple Search Ads Review | Apple Search Ads Review` ×1; `Webby | Outbound Prospecting | Deal Hunting` ×1; `X Brief | Deal Hunting | WTD` ×1

---

## Process bugs vs true strategy losses

| Category | n series | W-D-L | eloΣ | Notes |
|---|---:|---:|---:|---|
| Shop / planner `error` events | 36 events / 0 with result | 0-0-0 | +0 | `unit is not defined` early (AM); `k is not defined`×10 afternoon — latest 2026-09-18T22:38:47.190Z |
| Empty / missing board on L/D | 0 | — | +0 | Logging gap or crash mid-shop |
| Soft-tip units on L/D boards | 147 | — | -2871 | peacock/Love/Webby/Video Edit/NYC/… |
| True strategy L/D (no shop_error) | 345 | — | -6799 | Dominant remaining problem |

### Soft-tip unit lift (loss rate − win rate on boards)

| Unit | on losses | on wins | lift |
|---|---:|---:|---:|
| Love ❤️ | 25 | 47 | +7.1% |
| Hiring Signals | 16 | 17 | +5.6% |
| Deal Hunting | 14 | 9 | +5.4% |
| Pipeline Pulse | 21 | 50 | +5.1% |
| EBR & Value Deck Builder | 12 | 6 | +4.8% |
| SEO & AEO Desk | 16 | 29 | +4.6% |
| Stills & Clips Desk | 19 | 47 | +4.4% |
| Site Audit | 10 | 12 | +3.4% |
| Flora: Plant Care Log | 19 | 60 | +3.3% |
| Apple Search Ads Review | 21 | 71 | +3.3% |
| GTM Prospecting | 8 | 9 | +2.8% |
| Outbound Prospecting | 10 | 28 | +2.1% |
| Customer Call Coach & Assistant | 8 | 18 | +2.0% |

---

## Recent post-fix climb (last 2 hours)

Window: **2026-09-18 14:55 → 16:55 MT** — 765 games, 591-62-112, eloΣ +24.

| Opponent | W-D-L | eloΣ | Arches | Loss/Draw boards | shop_err |
|---|---:|---:|---|---|---:|
| `novagamingx4` | 2-0-9 | -222 | grow_hype×9, hurt_revenge×2 | `Meeting Recap Deck | Writing Bot | Luma Pages` ×1; `WTD | Apple Search Ads Review | Apple Search Ads Review` ×1 | 0 |
| `chr1sr1chards` | 2-0-7 | -180 | hurt_revenge×9 | `Pipeline Pulse | Credit Card Max | Deal Inspector` ×1; `Imogen | Love ❤️ | Company Docs Q&A` ×1 | 0 |
| `logosworks` | 2-1-8 | -166 | sustain×11 | `Imogen | Copy Humanizer | Copy Humanizer` ×1; `Copy Humanizer | Love ❤️ | The Morning Newspaper` ×1 | 0 |
| `seano1022` | 1-0-6 | -139 | wake_chip×4, hurt_revenge×3 | `Imogen | Meeting Recap Deck | EBR & Value Deck Builder` ×1; `Imogen | Site Audit | Apple Search Ads Review` ×1 | 0 |
| `misha_erm` | 4-0-5 | -135 | chip_snipe×6, glass_burst×3 | `Imogen | Webby | Love ❤️` ×1; `Product Idea Stress Test | WTD | Account Research Desk` ×1 | 0 |
| `thefieldpass` | 1-2-8 | -127 | hurt_revenge×6, buff_suicide×5 | `SEO & AEO Desk | Signal Prospector | EBR & Value Deck Builder` ×1; `NYC Parent | Copy Humanizer | Luma Pages` ×1 | 0 |
| `scottmrisk` | 2-3-3 | -106 | flamingo_pass×5, grow_hype×3 | `Paid Media Report Desk | X Brief | Luma Pages` ×1; `Office Ops Desk | Cooper | Writing Bot` ×1 | 0 |
| `fourseasonsgrn` | 2-2-5 | -105 | ko_snowball×5, grow_scale×4 | `Company Docs Q&A | X Brief | Nightly Audit Engineer` ×1; `dr eggbot | Hiring Signals | Luma Pages` ×1 | 0 |
| `sheilamoonready` | 2-2-4 | -103 | flamingo_pass×8 | `Webby | Deal Inspector | WTD` ×1; `Flora: Plant Care Log | Deal Hunting | Webby` ×1 | 0 |
| `fatkiddeals` | 2-2-4 | -99 | flamingo_pass×4, backline_snipe×4 | `Deal Inspector | Cooper | Hiring Signals` ×1; `NYC Parent | SEO & AEO Desk | Projects Manager` ×1 | 0 |
| `_ebfe` | 2-2-4 | -95 | chip_snipe×4, backline_snipe×4 | `Pipeline Pulse | Company Docs Q&A | Pipeline Pulse` ×1; `Paid Media Report Desk | Copy Humanizer | Talent Discovery` ×1 | 0 |
| `heywoozyv3y3` | 3-3-5 | -77 | flamingo_pass×8, hurt_revenge×3 | `Imogen | Copy Humanizer | Apple Search Ads Review` ×1; `Office Ops Desk | Company Docs Q&A | X Brief` ×1 | 0 |
| `s3xyfuture` | 3-3-3 | -65 | wake_chip×8, bulk_echo×1 | `Cooper | tinkabot | The Morning Newspaper` ×1; `Lingxi's Engineer Bot | Company Docs Q&A | Pipeline Pulse` ×1 | 0 |
| `darkwidowxx` | 6-0-3 | -62 | backline_snipe×5, wake_chip×4 | `NYC Parent | Site Audit | Writing Bot` ×1; `GTM Loop Closer | SEO & AEO Desk | Event Request Desk` ×1 | 0 |
| `1devnn` | 5-2-2 | -42 | chip_snipe×9 | `The Morning Newspaper | Apple Search Ads Review | Product Idea Stress Test` ×1; `NYC Parent | Event Request Desk | Deal Inspector` ×1 | 0 |

**Recent L/D arch mix:** flamingo_pass×39, chip_snipe×25, hurt_revenge×24, glass_burst×20, sustain×13, grow_hype×12, wake_chip×12, backline_snipe×11

Same-pattern bleed if top recent bleed opps overlap all-time farms (aj121503, novagamingx4, converse1nation, sandisjonass, echo/grow/chip lines).

---

## Concrete encode list (ranked by |elo impact|, evidence-only)

| Rank | Action | Elo impact | Evidence |
|---:|---|---:|---|
| 1 | Hard-ban front/tip seat: Love ❤️ | -633 | On loss boards 25x (11%) vs win 47x (4%), lift=7% |
| 2 | Hard-ban front/tip seat: Pipeline Pulse | -511 | On loss boards 21x (9%) vs win 50x (4%), lift=5% |
| 3 | Hard-ban front/tip seat: Apple Search Ads Review | -491 | On loss boards 21x (9%) vs win 71x (6%), lift=3% |
| 4 | Hard-ban front/tip seat: Flora: Plant Care Log | -473 | On loss boards 19x (8%) vs win 60x (5%), lift=3% |
| 5 | Hard-ban front/tip seat: Stills & Clips Desk | -435 | On loss boards 19x (8%) vs win 47x (4%), lift=4% |
| 6 | Hard-ban front/tip seat: Hiring Signals | -419 | On loss boards 16x (7%) vs win 17x (1%), lift=6% |
| 7 | Hard-ban front/tip seat: Deal Hunting | -359 | On loss boards 14x (6%) vs win 9x (1%), lift=5% |
| 8 | Hard-ban front/tip seat: SEO & AEO Desk | -356 | On loss boards 16x (7%) vs win 29x (2%), lift=5% |
| 9 | Hard-ban front/tip seat: EBR & Value Deck Builder | -309 | On loss boards 12x (5%) vs win 6x (1%), lift=5% |
| 10 | Rewrite plan for arch grow_hype (wall+teeth, refuse tips) | -292 | 3-0-12 / -292 (WR 20%) |
| 11 | Rewrite plan for arch flamingo_pass (wall+teeth, refuse tips) | -286 | 110-24-27 / -286 (WR 68%) |
| 12 | Hard-ban front/tip seat: Site Audit | -267 | On loss boards 10x (4%) vs win 12x (1%), lift=3% |
| 13 | Rewrite plan for arch sustain (wall+teeth, refuse tips) | -251 | 15-4-13 / -251 (WR 47%) |
| 14 | Hard-ban front/tip seat: Outbound Prospecting | -248 | On loss boards 10x (4%) vs win 28x (2%), lift=2% |
| 15 | HANDLE_SWAP_HEDGE / hardAvoid: aj121503 | -242 | 0-1-9 / -242 elo; top arch echo_hype |
| 16 | Rewrite plan for arch echo_hype (wall+teeth, refuse tips) | -236 | 1-1-9 / -236 (WR 9%) |
| 17 | HANDLE_SWAP_HEDGE / hardAvoid: novagamingx4 | -222 | 2-0-9 / -222 elo; top arch grow_hype |
| 18 | Hard-ban front/tip seat: Customer Call Coach & Assistant | -211 | On loss boards 8x (4%) vs win 18x (2%), lift=2% |
| 19 | Rewrite plan for arch wake_chip (wall+teeth, refuse tips) | -205 | 39-13-12 / -205 (WR 61%) |
| 20 | Hard-ban front/tip seat: GTM Prospecting | -194 | On loss boards 8x (4%) vs win 9x (1%), lift=3% |

Details:

1. **Hard-ban front/tip seat: Love ❤️**
   - Why: On loss boards 25x (11%) vs win 47x (4%), lift=7%
   - Evidence: n_loss_boards_with=25, n_win=47

2. **Hard-ban front/tip seat: Pipeline Pulse**
   - Why: On loss boards 21x (9%) vs win 50x (4%), lift=5%
   - Evidence: n_loss_boards_with=21, n_win=50

3. **Hard-ban front/tip seat: Apple Search Ads Review**
   - Why: On loss boards 21x (9%) vs win 71x (6%), lift=3%
   - Evidence: n_loss_boards_with=21, n_win=71

4. **Hard-ban front/tip seat: Flora: Plant Care Log**
   - Why: On loss boards 19x (8%) vs win 60x (5%), lift=3%
   - Evidence: n_loss_boards_with=19, n_win=60

5. **Hard-ban front/tip seat: Stills & Clips Desk**
   - Why: On loss boards 19x (8%) vs win 47x (4%), lift=4%
   - Evidence: n_loss_boards_with=19, n_win=47

6. **Hard-ban front/tip seat: Hiring Signals**
   - Why: On loss boards 16x (7%) vs win 17x (1%), lift=6%
   - Evidence: n_loss_boards_with=16, n_win=17

7. **Hard-ban front/tip seat: Deal Hunting**
   - Why: On loss boards 14x (6%) vs win 9x (1%), lift=5%
   - Evidence: n_loss_boards_with=14, n_win=9

8. **Hard-ban front/tip seat: SEO & AEO Desk**
   - Why: On loss boards 16x (7%) vs win 29x (2%), lift=5%
   - Evidence: n_loss_boards_with=16, n_win=29

9. **Hard-ban front/tip seat: EBR & Value Deck Builder**
   - Why: On loss boards 12x (5%) vs win 6x (1%), lift=5%
   - Evidence: n_loss_boards_with=12, n_win=6

10. **Rewrite plan for arch grow_hype (wall+teeth, refuse tips)**
   - Why: 3-0-12 / -292 (WR 20%)
   - Evidence: loss fronts=[('Stills & Clips Desk', 2), ('Office Ops Desk', 2), ('Meeting Recap Deck', 1), ('WTD', 1)]; win fronts=[('Imogen', 2), ('Company Docs Q&A', 1)]

11. **Rewrite plan for arch flamingo_pass (wall+teeth, refuse tips)**
   - Why: 110-24-27 / -286 (WR 68%)
   - Evidence: loss fronts=[('Imogen', 5), ('Company Docs Q&A', 5), ('Office Ops Desk', 3), ('Flora: Plant Care Log', 2)]; win fronts=[('Imogen', 23), ('NYC Parent', 16), ('Webby', 10), ('Company Docs Q&A', 9)]

12. **Hard-ban front/tip seat: Site Audit**
   - Why: On loss boards 10x (4%) vs win 12x (1%), lift=3%
   - Evidence: n_loss_boards_with=10, n_win=12

---

## What NOT to change (already works)

### Positive-EV arches — protect these plans

| Arch | n | W-D-L | eloΣ | Keep doing |
|---|---:|---:|---:|---|
| `glass_burst` | 405 | 345-28-32 | +923 | fronts: Webby×43, The Morning Newspaper×43, NYC Parent×41, Imogen×36, Office Ops Desk×32 |
| `buff_suicide` | 88 | 77-3-8 | +291 | fronts: Imogen×13, Office Ops Desk×9, The Morning Newspaper×8, Webby×7, NYC Parent×6 |
| `ko_snowball` | 73 | 61-5-7 | +189 | fronts: Webby×10, Imogen×10, The Morning Newspaper×9, Office Ops Desk×7, Copy Humanizer×4 |
| `chip_snipe` | 295 | 240-15-40 | +152 | fronts: Imogen×40, Office Ops Desk×35, The Morning Newspaper×30, NYC Parent×26, Webby×24 |
| `backline_snipe` | 145 | 117-12-16 | +61 | fronts: Imogen×27, The Morning Newspaper×15, Office Ops Desk×13, Copy Humanizer×10, NYC Parent×7 |

### Handles we farm — do not hardAvoid

| Handle | W-D-L | eloΣ |
|---|---:|---:|
| `3dkelvic` | 15-0-0 | +149 |
| `wowbaggerv2` | 10-0-0 | +106 |
| `morgeninamerica` | 7-0-0 | +101 |
| `roshan_s` | 13-0-0 | +91 |
| `devs_machina` | 8-0-0 | +76 |
| `torstenbremeyer` | 9-0-0 | +76 |
| `_coachingportal` | 12-0-0 | +75 |
| `jgabrielgruber` | 12-0-1 | +71 |
| `jmatthewleelee` | 11-0-0 | +61 |
| `ezatwakily` | 14-0-0 | +61 |
| `arnavprs` | 10-0-1 | +61 |
| `mangobushmango` | 11-0-0 | +60 |

- Do **not** weaken `glass_burst` / wall+teeth conversion that is net +EV.
- Do **not** remove existing tip refuses for peacock/Love/Video Edit — extend them to Webby/NYC/Copy Humanizer if lift confirms.
- Do **not** chase mid-series band-aids without HANDLE_SWAP_HEDGE for proven farm handles.

---

## Winning recipe (coherent, evidence-backed)

1. **Seat a real wall, not a soft bulk tip.** Winning fronts skew to: Imogen×179, The Morning Newspaper×144, Office Ops Desk×136, NYC Parent×127, Webby×124. Losing fronts skew to: Imogen×32, NYC Parent×28, Company Docs Q&A×16, Webby×15, Office Ops Desk×15.
2. **Into chip/wake/flamingo/hurt/grow walls: refuse peacock, Love, Webby, Video Edit, NYC Parent, Copy Humanizer as tip/front** — these names lift on loss boards. Prefer Newspaper / Docs / Credit Card Max / Hold-style eHP + teeth.
3. **Don't mirror chip into mosquito+pin+bulk.** Against wake_chip/chip_snipe, win samples use walls + patch/guard, not chip mirrors.
4. **HardAvoid / swap-hedge the elo farms** (see encode list): especially echo_hype / grow_hype sticky rematches and mid-series arch swappers.
5. **Keep farming glass_burst and other +EV arches**; tighten name-level tip bans only — don't rewrite the climb engine.

---

_Companion CSV: `study/climb/loss_summary.csv`. Inventory: `study/climb/_inventory_snapshot.json`._


---

## Addendum A — Shop/planner errors (corrected)

Parser initially under-counted because errors are JSON `{"event":"error"}` and often abort before `result`.

| Error message | Events | Distinct log files | Era |
|---|---:|---:|---|
| `unit is not defined` | 24 | 24 | Early match-* (~05:29–05:33 MT) |
| `k is not defined` | 10 | 10 | Afternoon batches; latest 2026-09-18T22:38:47.190Z |
| **Total** | **36** | **36** | |

Series that still emitted `result` after an error: **0** → 0-0-0, eloΣ +0.
Many error files never got a clean result (farm/crash streak). **No new `k is not defined` in the freshest post-fix tail should be re-checked each climb**; last 2h shop_err column in opponent table was 0 on completed series.

---

## Addendum B — Top 5 bleed farms: concrete win recipe (verified boards)

### 1. `aj121503` (0-1-9 / −242) — arch `echo_hype`, fp `webby | writing bot | call follow ups`
- **No wins vs this handle.** Global `echo_hype` is 1-1-9.
- Loss boards tip/soft: Imogen, Stills & Clips, NYC Parent, Newspaper without teeth.
- **RECIPE:** HardAvoid rematch. If forced: wall eHP + teeth only (Docs/Newspaper/Credit Card Max); **zero** peacock/wake/Love/Webby/Imogen tip into their Webby+Writing Bot echo. Prefer sell-reroll until wall seated.

### 2. `novagamingx4` (2-0-9 / −222) — sticky `chip_snipe→grow_hype`, fp `paid media report desk | cooper | wtd`
- **Wins were vs `hurt_revenge` swap** (`Imogen | Meeting Recap | Writing Bot`, `Newspaper | Lead Pipeline | Writing Bot`) — **not** vs grow_hype.
- Losses into grow_hype: Meeting Recap/Writing Bot/Luma, WTD/Apple Search, Call Follow-Ups chips — soft/chip boards.
- **RECIPE:** HANDLE_SWAP_HEDGE: on sight of grow_hype fp (Paid Media|Cooper|WTD), rebuild to **Company Docs / Newspaper wall + teeth**, refuse Writing Bot/Luma/Meeting Recap as core. Do not keep chip opener after swap.

### 3. `chr1sr1chards` (2-0-7 / −180) — `hurt_revenge`, fp `writing bot | haggle bot | gtm loop closer`
- **WIN boards:** `Imogen | Morning Newspaper | Account Research Desk`; `NYC Parent | Event Request Desk | GTM Loop Closer`.
- **LOSS boards:** `Pipeline Pulse | Credit Card Max | Deal Inspector`; `Imogen | Love | Docs`; `Docs | Outbound | Love`.
- **RECIPE:** Same arch is beatable — **front wall (Newspaper/NYC/Docs)** + support; **refuse Love** on this line. Pipeline Pulse / Love on board correlates with losses.

### 4. `converse1nation` (2-0-8 / −167) — `bulk_echo`, fp `imogen | meeting recap | love`
- **WIN:** `NYC Parent | Paid Media Report Desk | Call Follow-Ups`; `Webby | Tradbot | Luma Pages`.
- **LOSS:** `Copy Humanizer | Stills & Clips | Love`; `Outbound | Site Audit | Luma`; Newspaper+Stills chips.
- **RECIPE:** Front **NYC Parent / real bulk wall**, not Copy Humanizer+Love mirror into their Love backline. Refuse Love tip entirely vs this fp.

### 5. `logosworks` (2-1-8 / −166) — `sustain`, fp `office ops | x brief | product support`
- **WIN:** `Deal Inspector | Cooper | WTD`; `Morning Newspaper | Morning Newspaper | Call Follow-Ups`.
- **LOSS:** `Imogen | Copy Humanizer | Copy Humanizer`; `Copy Humanizer | Love | Newspaper`; `Video Edit | Outbound | Credit Card Max`.
- **RECIPE:** Double-Newspaper or Deal Inspector wall; **ban Copy Humanizer double + Love + Video Edit** into sustain.

---

## Addendum C — Front-seat lift (loss% − win%, from log.jsonl boards)

| Front unit | on losses | on wins | lift |
|---|---:|---:|---:|
| EBR & Value Deck Builder | 6 | 0 | +2.6% |
| Stills & Clips Desk | 8 | 11 | +2.6% |
| Flora: Plant Care Log | 10 | 24 | +2.3% |
| Pipeline Pulse | 7 | 10 | +2.2% |
| Company Docs Q&A | 17 | 63 | +2.1% |
| Love ❤️ | 6 | 12 | +1.6% |
| NYC Parent | 28 | 128 | +1.5% |
| Deal Inspector | 4 | 5 | +1.3% |
| Call Follow-Ups | 5 | 11 | +1.3% |
| Partnerships Call Coach | 3 | 3 | +1.1% |
| Meeting Recap Deck | 3 | 5 | +0.9% |
| SEO & AEO Desk | 4 | 11 | +0.8% |

_Generated addendum 2026-09-18 16:56 MT. Still analysis-only._
