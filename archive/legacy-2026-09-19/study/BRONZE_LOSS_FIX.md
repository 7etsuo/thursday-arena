# BRONZE LOSS FIX — evidence-backed

_Generated 2026-09-19 12:53 AM MT. Sources: `matches/climb/batch-*.log` result + fight_settled/plan; `data/matchlog/events.jsonl` match_end. No guessing. No handle-specific rules._

## 1. Inventory

| Source | W | L | D | Elo sum |
|--------|--:|--:|--:|--------:|
| ALL batch result events | 2711 | 620 | 279 | 1754 |
| last 80 batch | 33 | 36 | 11 | -50 |
| older batch | 2678 | 585 | 268 | -416 |
| matchlog match_end | 279 | 254 | 75 | -412 |

**Rank:** recent window is bleeding (last80 ≈ .500 WR, elo -50). Older history still net-positive WR but cumulative elo drag. Bronze climb fails on recent arch clusters below.

Recent loss window: `2026-09-19T04:54:55.511Z` → now (200 losses / 198 wins in same window).

## 2. Top failure modes (recent losses)

| # | Mode (enemy arch) | L | W | WR | Tip seats on L boards |
|--:|-------------------|--:|--:|---:|----------------------:|
| 1 | `glass_burst` | 42 | 59 | 58% | 12/42 |
| 2 | `chip_snipe` | 31 | 30 | 49% | 12/31 |
| 3 | `flamingo_pass` | 29 | 16 | 36% | 9/29 |
| 4 | `bulk_echo` | 26 | 23 | 47% | 7/26 |
| 5 | `backline_snipe` | 15 | 36 | 71% | 5/15 |
| 6 | `hurt_revenge` | 15 | 3 | 17% | 4/15 |
| 7 | `buff_suicide` | 12 | 10 | 45% | 5/12 |
| 8 | `grow_hype` | 12 | 2 | 14% | 2/12 |

### Top 5 with board evidence

#### 1. glass_burst — L=42 (21% of recent L)

- Losing boards overrep: Company Docs, Office Ops soft walls, Love/Video Edit tips.
- Winning boards: Imogen, Cooper, Copy Humanizer, Morning Newspaper, WTD, CCM.
- Sticky `global_hot` after ghost seen was observed on glass_burst losses (pre-fix batches).
  - L: our `Office Ops Desk | NYC Parent | Customer Call Coach & Assistant` vs `dr eggbot | projects manager | deal inspector` why=global_hot
  - L: our `Office Ops Desk | Sales Call Coach | Cooper` vs `dr eggbot | projects manager | deal inspector` why=global_hot
  - L: our `Call Follow-Ups | Company Docs Q&A | Office Ops Desk` vs `dr eggbot | projects manager | deal inspector` why=ghost_matchup
  - W: our `Copy Humanizer | Cooper | Meeting Recap Deck` vs `home robots | credit card max | talent discovery`
  - W: our `Copy Humanizer | X Brief | The Morning Newspaper` vs `home robots | credit card max | talent discovery`
  - W: our `Office Ops Desk | Cooper | Paid Media Report Desk` vs `wtd | writing bot | tinkabot`

**Global fix:** expand hard tip force-sell to glass_burst; prefer Imogen/Cooper/Copy/Newspaper; demote Docs soft; never sticky global_hot after ghost (parent LIVE REFRESH + unstick).

#### 2. chip_snipe — L=31 (16%)

- Teeth missing on losses (58% teeth vs 87% on wins). Tip seats still appear.
- Wins: Imogen|Cooper|WTD, Newspaper|Call Follow-Ups|Meeting Recap.
  - L: our `Imogen | Deal Hunting | Company Docs Q&A` vs `pipeline pulse | event producer | video edit desk` why=arch:chip_snipe
  - L: our `Outbound Prospecting | Site Audit | Luma Pages` vs `nyc parent | competitor watch | webby` why=ghost_matchup
  - L: our `Signal Prospector | Writing Bot | X Brief` vs `nyc parent | competitor watch | webby` why=ghost_matchup
  - W: our `Office Ops Desk | SEO & AEO Desk | Writing Bot` vs `pipeline pulse | event producer | video edit desk`
  - W: our `Office Ops Desk | Luma Pages | NYC Parent` vs `pipeline pulse | event producer | video edit desk`
  - W: our `SEO & AEO Desk | Meeting Recap Deck | NYC Parent` vs `pipeline pulse | event producer | video edit desk`

**Global fix:** hard tip ban always; arch recipe seats Imogen/Cooper/WTD/Call Follow-Ups; no tip lottery.

#### 3. flamingo_pass — L=29 WR vs same-arch W=16 (~36% WR)

- Losses overrep: Pipeline Pulse (8L/0W), Signal Prospector, Love, Company Docs, Projects Manager, Video Edit.
- Wins: WTD, Imogen, Call Follow-Ups, Writing Bot, Webby, Office Ops.
  - L: our `NYC Parent | Company Docs Q&A | Deal Inspector` vs `imogen | cooper | the morning newspaper` why=arch:hype_battery
  - L: our `Copy Humanizer | Event Request Desk | Projects Manager` vs `imogen | cooper | the morning newspaper` why=ghost_matchup
  - L: our `The Morning Newspaper | Pipeline Pulse | Credit Card Max` vs `imogen | cooper | the morning newspaper` why=ghost_matchup
  - W: our `Imogen | Call Follow-Ups | Office Ops Desk` vs `love | the morning newspaper | critiquito design critique`
  - W: our `Copy Humanizer | Writing Bot | WTD` vs `seo aeo desk | pipeline pulse | the morning newspaper`
  - W: our `Imogen | Product Support Inbox Assistant | WTD` vs `seo aeo desk | pipeline pulse | the morning newspaper`

**Global fix:** demote Pipeline Pulse/docs soft; prefer WTD/Imogen/Writing/Call Follow-Ups; hard tip force-sell.

#### 4. bulk_echo — L=26

- Losses: tip/soft (Love, Flora, SEO, Ads). Wins: Office Ops, Cooper, Copy, WTD, Writing, Imogen, Tradbot.
  - L: our `SEO & AEO Desk | GTM Prospecting | Office Ops Desk` vs `credit card max | meeting recap deck | imogen` why=ghost_matchup
  - L: our `Love ❤️ | Writing Bot | Writing Bot` vs `credit card max | meeting recap deck | imogen` why=ghost_matchup
  - L: our `Office Ops Desk | Webby | Paid Media Report Desk` vs `credit card max | meeting recap deck | imogen` why=ghost_matchup
  - W: our `Outbound Prospecting | Meeting Recap Deck | Hiring Signals` vs `cooper | dial bot | imogen`
  - W: our `Office Ops Desk | Credit Card Max | Company Docs Q&A` vs `cooper | dial bot | imogen`
  - W: our `Office Ops Desk | Call Follow-Ups | Office Ops Desk` vs `cooper | dial bot | imogen`

**Global fix:** tip force-sell on bulk_echo; ARCH_SEAT_PREFER wall+teeth; no echo/tip mirror (already in PLANS).

#### 5. hurt_revenge (call-coach peacock) — L=15 W=3 (~17% WR)

- Almost all recent losses vs `sales call coach | company docs…`.
- Losing boards: NYC Parent / Company Docs stacks, tip seats, wrong recipeWhy (`arch:chip_snipe` sticky).
- Evidence: NYC Parent on 7/15 losses, 0 wins. Docs walls go 0-2 into revenge.
  - L: our `Company Docs Q&A | NYC Parent | NYC Parent` vs `sales call coach | company docs q a | outbound prospecting` why=arch:chip_snipe
  - L: our `WTD | Company Docs Q&A | Copy Humanizer` vs `sales call coach | company docs q a | pitch deck coach` why=arch:chip_snipe
  - L: our `NYC Parent | Copy Humanizer | Credit Card Max` vs `sales call coach | company docs q a | outbound prospecting` why=arch:chip_snipe
  - W: our `Office Ops Desk | Meeting Recap Deck | Office Ops Desk` vs `x brief | seo aeo desk | haggle bot`
  - W: our `Webby | WTD | Company Docs Q&A` vs `gtm prospecting | haggle bot | gtm loop closer`
  - W: our `Webby | Meeting Recap Deck | Hiring Signals` vs `gtm prospecting | haggle bot | gtm loop closer`

**Global fix:** call-coach → hurt_revenge pin (parent); DOCS_STACK −20; remove contradictory +4/+3 Docs/NYC boosts; Writing/Copy/WTD/CCM teeth; reject docs recipes.

### Also bleeding

- **hype_battery** L=10 tip_boards=60% of those losses — race Copy/CCM/WTD not Hiring/Cooper soft.
- **grow_hype** L=12 WR terrible — Imogen/Writing wall, no tip/grow mirror.
- **echo_hype** soft mirrors — wall teeth (Imogen/Webby/WTD), no flamingo/peacock.

## 3. Cross-cutting bugs fixed

1. **Sticky `global_hot` after ghost** — parent: LIVE REFRESH + unstick; verify in newest batch.
2. **alwaysHardTipBan on ALL arches** — force-sell Love/Luma/Stills/Outbound/Video/Hiring/Product Support even when arch not in old HARD_TIP set; glass_burst/bulk_echo added to punish sets.
3. **Contradictory hurt_revenge tip rules** — removed Docs/NYC `+4/+3` boosts that fought DOCS_STACK `−20`.
4. **Arch mislabel** — parent: double_echo before chip_snipe; echo+sidestep → echo_hype; call-coach → hurt_revenge.
5. **ARCH_SEAT_PREFER** rebuilt from recent W boards for glass/flamingo/hurt/hype/bulk_echo/grow_hype/echo_hype.

## 4. Files changed

- `lib/counters.js` — PLANS tighten for glass_burst / flamingo_pass / hurt_revenge / hype_battery (parent classify pins preserved).
- `lib/recipes.js` — ARCH_SEAT_PREFER + tip/docs recipe rejects.
- `driver/play_loop.js` — tip punish arch expand; always force-sell hard tips; arch name scoring; hurt_revenge boost cleanup (parent LIVE REFRESH preserved).
- `study/BRONZE_LOSS_FIX.md` — this file.

## 5. Verification checklist

- [ ] `node --check` on touched files
- [ ] climb_loop + play_loop alive (do not pkill climb)
- [ ] newest batch: `recipeWhy` after ghost ≠ `global_hot`
- [ ] newest batch: no Love/Luma/Stills/Outbound on punish boards
- [ ] hurt_revenge plans buy Writing/Copy/WTD teeth not Docs stacks
