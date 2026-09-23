# Decision data — how we find winning patterns

## Best format
**JSONL write + CSV analyze.**

| Layer | Path | Use |
|-------|------|-----|
| Live log | `data/decisions/events.jsonl` | Every shop/fight event (nested, crash-safe) |
| Spreadsheets | `data/decisions/export/*.csv` | Stats / pivot tables |
| Rebuild CSVs | `node driver/export_decisions.js` | Anytime |

Native SQLite failed to install here; CSV is enough and portable. Python can load CSV → sqlite later if needed.

## What matters (columns)

### shops.csv — decisions under uncertainty
Our board + gold + food + **3 shop offers** + **known ghost board** + actions + reason.

### fights.csv — truth
Our 3 vs their 3 + winner. This is how we learn matchups.

### matchups.csv — rolled up
`our_fp` vs `their_fp` → wins/losses/draws. **This is the pattern table.**

### matches.csv — outcome
Opponent, result, elo delta.

## Pattern questions
1. Against `their_fp` / `their_arch`, which `our_fp` wins?
2. Which `reason`s precede losses?
3. Losses with empty food / underfill / front_survival=0?
4. Unlock mistakes (offer unlockTurn > round)?

## Fight winners (2026-09-18)
Fights are recorded **after** `battleDone` using series wins delta (`us`|`them`|`draw`). Pre-fix rows may have `winner=null` — ignore those in matchup WR.
