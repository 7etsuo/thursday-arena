# Coherent shop policy rewrite — 2026-09-18 ~02:10 MT

Climb left **running** the entire time. Edits to `play_loop.js` take effect on the next match start (climb spawns a fresh node each match).

## Policy locked (P0–P7)

Every shop: **fill-3 → front survive → anti-mirror → role spine → teeth → food → live counter → reroll/freeze**.

## Files changed

| File | Change |
|------|--------|
| `driver/play_loop.js` | Food gold reserve; max-1 sell; R0 trash-only sells; scout ≤0.2×; counter prefer ∩ spine∪teeth; MUST_BUY clamp vs echo ghosts; teeth gate R1+; scored emergency buy; rematch bail path removed; telemetry `sellCount/foodReserved/teethOk/frontSurvival`; `module.exports` for smoke |
| `lib/counters.js` | Export `SPINE`/`TEETH`; spine-first `prefer`; `preferTeeth`; `effectivePrefer`; `hedgePlan` prefer = against.prefer ∩ (SPINE∪TEETH) — no HEDGE_VS union into prefer |
| `lib/avoid.js` | `shouldBail` hard-returns `always_fight`; dead EV body deleted |
| `driver/climb_loop.sh` | Sticky rematch sleep → no-op log only |
| `driver/smoke_plan.js` | **New** unit smoke for reserve / max-1 sell / R0 / bail / hedge / echo clamp |
| `study/omlejmi/INSTRUCTION_AUDIT.md` | Change-list checkboxes updated |

## Key behaviors now true

1. **Food reserve** — after fill-3, if `food != null` and board===3, `spendable = gold - 3` for sells/upgrades. P1 wall-swap may spend reserved gold.
2. **Max 1 sell** — sell loop `guard < 1`; wall-swap sell tracked separately; scout prior never sells.
3. **R0 sells** — only `KIT_WEAK` or `GHOST_PUNISH` names.
4. **No bail** — rematch restart block removed from play_loop; avoid always_fight; climb sticky is no-op.
5. **Teeth** — R1+ if all atk≤2 and shop has atk≥3 spine/teeth, buy before improve_fish.
6. **Counter** — prefer actionable only via `effectivePrefer` / `COUNTER_OK`; echo name bombs clamped when `ghostHasEcho`.

## Verify

- `node --check driver/play_loop.js` / `lib/counters.js` — OK
- `node driver/smoke_plan.js` — 6/6 PASS
- `pgrep -af climb_loop` — still running
- Rank at rewrite: **#7 / 1315** (`tetsuoai`)

## Not done (out of scope per brief)

- Agent profile / bootstrap SKILL / package.json script rewrites
- Recipe planner still disabled
