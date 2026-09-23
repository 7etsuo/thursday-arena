> **Canonical:** [`COMPLETE_WIN_PLAN.md`](./COMPLETE_WIN_PLAN.md). This file is historical/summary only.

# omlejmi — full public replay analysis

Source: https://thursdayarena.com/matches?player=omlejmi  
API: list + **all 100** match details with round boards.

Artifacts: `/tmp/omlejmi2/`, `study/omlejmi/analysis_full.json`.

## Honesty

Public replays show every round board (units, kits via catalog, atk/hp, honey/potato/tempAtk), round winners, elo. They do **not** show shop buys/sells/rerolls/freezes. This is full board-trajectory analysis of 100/100 listed matches — not shop-click telemetry. An earlier brief overfit `bulk|echo|hype`; this pass corrects that.

## Scoreboard

- **93W / 4D / 3L** (~93%)
- Elo: wins +2..+3, draws −14, losses ≈ −30
- All opponents: **ghost**
- 71 matches end in 2 rounds; 29 go to 3
- Across rounds: he wins ~189, loses ~18, draws ~22

## What he builds (93 win finals)

**Kits:** echo 56 · hype 47 · grow 32 · bulk 29 · flamingo 21 · cover 16 · wake 15 · guard 12

**Front:** grow 23 · bulk 22 · flamingo 19 (Credit Card Max / Morning Newspaper / Webby / Imogen / Copy Humanizer)

**Top kit triples:** bulk|echo|hype (8), bulk|echo|echo (5), flamingo|echo|hype (3), grow|echo|echo (3), grow|hype|grow (3), grow|guard|hype (3). Only ~1/3 are strict bulk→echo→hype. Roles matter more than one recipe.

**Food:** honey 83 (back 43, mid 25, front 15); potato 19 (front 16). Food lands round 1+, not round 0. Commons-first (206 common vs 5 epic on finals).

**Anti-mirror:** 83/93 wins have **zero** name overlap with opponent.

**Tempo:** always 3 by round 1; ~40% seat churn between rounds.

## Losses / draws

Off-spine kits (mosquito/dodo/spite), bad honey doubles, losing flamingo races, one underfilled opener.

## Vs our climber

Our recent ~63% WR with frequent 1–2 unit boards and off-spine leftovers. Gaps: overfit one triple; honey seat wrong; weak pivots; underfill; more draws/losses (elo tax).

## Copy rules

1. Always 3 after shop 0.
2. Front grow|bulk|flamingo; mid echo|guard; back hype|echo|cover.
3. Max 2 echo; prefer 1.
4. Honey back→mid; potato front round ≥1.
5. Commons first; sell into rare only on real margin.
6. Avoid ghost name overlap when alternatives exist.
7. Sell off-spine (mosquito/dodo/spite) toward spine before endShop.
