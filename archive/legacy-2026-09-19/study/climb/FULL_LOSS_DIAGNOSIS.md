# FULL LOSS DIAGNOSIS (all climb logs — read only)

**Scope:** 316 batch/match logs, **1860** unique series. No patches in this pass.

## Headline numbers

| | n | elo Σ | avg |
|---|---:|---:|---:|
| Win | 1467 | +7922 | **+5.4** |
| Loss | 258 | −6500 | **−25.2** |
| Draw | 135 | −1327 | **−9.8** |
| **Net** | 1860 | **+95** | WR **85%** of decided |

**Elo tax:** one loss (−25.2) needs **~4.7 wins** (+5.4 each) to break even. That is why “winning most games” still feels like bleeding.

## Problem 1 — asymmetric elo (system, not a shop bug)

Across **15** opponents we are ≥50% WR but still ≤ −40 elo (e.g. nickhenryyy 7–5 / −112, thephatp 7–5 / −108, javabeanai 8–4 / −64, desmondcheongzx 6–1–4 / −62).  
Beating them “most of the time” is not enough under this payout curve. Rematching a sticky farm after one −25/−30 is negative EV unless WR is extremely high.

## Problem 2 — tip / soft boards into wall arches (the fixable pattern)

Board kind on **all losses** (258):

- **TIP + MIXED = 180 / 258 (70%)**
- WALL-only = 67 / 258 (26%)

Units **elevated on losses** (appearance share): Love, Stills & Clips, Deal Hunting, Outbound, EBR & Value Deck, Hiring Signals, Pipeline Pulse, Apple Search Ads Review, Flora, Talent Discovery…

Units **elevated on wins**: Morning Newspaper, Call Follow-Ups, Cooper, Office Ops, Writing Bot, Credit Card Max, Tradbot, WTD, GTM Loop Closer…

**Same fingerprint, opposite result** (examples):

| Their FP | Loss board | Win board |
|---|---|---|
| paid media \| cooper \| wtd (grow_hype) | Meeting Recap / Writing / Luma, WTD+Ads, Webby tip | Imogen / Newspaper + Writing (wall) |
| writing \| haggle \| gtm closer (hurt) | Imogen\|Love\|Docs, soft mids | Imogen\|Newspaper\|Research |
| imogen \| recap \| love (bulk_echo) | Copy\|Stills\|Love, Outbound\|Audit\|Luma | NYC\|Paid Media\|Call Follow-Ups |
| office ops \| x brief \| inbox (sustain) | Imogen\|Copy\|Copy, Copy\|Love\|Newspaper | Deal Inspector\|Cooper\|WTD, double Newspaper |

So for a huge share of bleed: **we already know the counter board; we don’t seat it every rematch.**

## Problem 3 — arch black holes (even “ok” WR)

| Arch | W–L–D | WR | elo Σ | Notes |
|---|---|---:|---:|---|
| grow_hype | 6–12–0 | 33% | **−283** | tip boards dominate losses |
| echo_hype | 1–9–1 | 10% | **−236** | aj121503-class farm |
| flamingo_pass | 136–30–26 | 82% | **−285** | high WR, still elo-negative (draws + tip tax) |
| wake_chip | 45–15–14 | 75% | **−260** | |
| sustain | 25–14–4 | 64% | **−249** | |
| glass_burst | 393–35–31 | 92% | **+985** | protect this engine |

## Problem 4 — pure tip farms never converted

Top bleed handles with **0–2 wins ever** on their sticky line: aj121503 (echo_hype 0–9), novagamingx4 (grow_hype 2–9, wins were *other* arches), etc. Rematching those exact comps without a forced wall spine is how −200 holes appear.

## What is NOT the main problem

- Not “we never win” — **85% WR**, glass_burst is a machine.
- Not only recent rematches — pattern holds on **full 1860**.
- Not mysterious new arches every time — same tip-into-wall failure repeats on known FPs.

## Exact problem statement

1. **Payout math** makes every tip/soft loss catastrophic (~5 wins to repay).  
2. **Shop still seats tip/soft units** (Love / Stills / Outbound / Ads / Copy / Deal Hunting / Luma) into wall arches often enough that **70% of losses** are TIP or MIXED.  
3. **Wins against the same FP use wall spines** (Newspaper / Imogen / Ops / Docs / NYC / Cooper / Writing / Call Follow-Ups) — inconsistency of seating, not ignorance of the matchup.  
4. **Sticky rematch into echo_hype / grow_hype** with no conversion is pure elo burn.

No code changed in this pass.
