# FIX_NOTES — policy_v1 coherent planner rewrite

**Date:** 2026-09-18 ~02:28 MT (America/Edmonton)  
**Climb:** left running (`bash driver/climb_loop.sh` PID alive). Hot-load on next `play_loop.js --start`.  
**No reverts. No single-knob band-aids.**

## What changed

### Docs (Phase A)
| Path | Lines | Role |
|---|---:|---|
| `study/omlejmi/GAME_SYSTEMS.md` | ~200 | Object model, actions, gold/food economy, series, combat timing for all 24 kits (PROVEN/LIKELY/SPECULATION) |
| `study/omlejmi/COMPLETE_WIN_PLAN.md` | ~427 | Elo +7/−23/−8, archetypes, multi-round shop policy, P0–P7 stack, gaps, checklist |

### Code (Phase B)
| File | Change |
|---|---|
| `lib/counters.js` | `effectiveThreat(seats)` — flamingo/dump/dodo → project mid+pass(+grow tick); hype +2 on seat0; first_seat jump. `frontEhp` — honey +2, bulk SoB +2. `frontDiesTo` uses eHP. `flamingo_pass.avoid` = `[flamingo]` only (echo ≤1 enforced in planner, not hard avoid). |
| `driver/play_loop.js` | **Rewrote `planShop` as ONE policy engine** implementing COMPLETE_WIN_PLAN §7 end-to-end: P0 fill-3 (soft name mirror only when starved) → P1 survive vs **effective** threat → P2/P3/P6 max-1 disciplined sells → **P4 teeth before P5 food** → P5 feed (honey B→M, potato iff post-eHP > threat) → P7 fish only after food / never burn food gold → freeze spine rares → **single `seatBoard`**. Series lead/deficit sell margins. Telemetry: `policyPhase`, `threatAtk`, `threatReason`. Recipes still disabled. Always-fight unchanged. |
| `driver/smoke_plan.js` | Extended: effective threat, bulk eHP, soft fill mirror, teeth-before-food, policy reason, no-recipe/bail (12/12 PASS). |

## Why (cite COMPLETE_WIN_PLAN)

| Fix | Section |
|---|---|
| Effective threat ≠ seat0 | §4.4, §7 P1, gap rank #1 |
| Soft name mirror under fill-3 | §7 P0/P2, §8.3 #5 (hard ban blocked CCM-like wins) |
| Teeth before food | §7 P4 then P5 |
| Food reserve + no fish on food gold | §3.3, §7 P5/P7, gap #2 |
| Max 1 sell; R0 trash-only; scout never sells | §7 sell rules, gap #3 |
| Flamingo kit anti-mirror (not echo hard-ban) | §6C, §7 P2; WIN_FORMULA G4 refine |
| Single seatBoard | §7 seating, gap #4 |
| Series lead/deficit | §5.4, §7 R2 |
| Bulk eHP projection | §4.4, gap #7 |
| Elo objective 7/−23/−8 | §8 |

## Downstream risks

1. **Over-wall vs weak flamingo-only boards** — effective threat may force bulk when seat0 atk=2 was already safe; watch WR vs pure flamingo without scary mid.  
2. **Fewer improve_fish rerolls** — food-gold protection may slow rare hunting; acceptable vs honey starvation.  
3. **Soft mirror underfill** — may still buy Morning Newspaper when shop is empty of alts; −50 score still prefers alts when present.  
4. **Teeth sell + wall sell** — wallSold allows a second sell for teeth; rare double-sell turns if both fire (tracked).  
5. **Hot-load mid-climb** — in-flight match still on old process; next match picks up policy_v1.  
6. **Rank at verify:** `#41` / rating **1120** (`tetsuoai`); not a regression claim until 30+ settled games on policy_v1.

## Verify (Phase C)

- `node --check driver/play_loop.js` / `lib/counters.js` — OK  
- `node driver/smoke_plan.js` — **12/12 PASS**  
- `pgrep climb_loop` — still up  
- `node driver/check_rank.js` — rank 41, rating 1120 (2026-09-18 ~02:28 MT)

## Explicitly not done

- Recipe planner re-enable  
- Rematch bail  
- Climb kill/restart  
- File reverts  
