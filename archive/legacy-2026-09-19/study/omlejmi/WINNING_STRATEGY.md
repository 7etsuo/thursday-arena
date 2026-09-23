> **Canonical:** [`COMPLETE_WIN_PLAN.md`](./COMPLETE_WIN_PLAN.md). This file is historical/summary only.

# Winning strategy (rated climb)

There is **no forced always-win** — shop RNG + ghost pivots prevent that.
There *is* a strategy that maximizes P(win a match) and minimizes −30 losses.

## Elo truth
Wins ≈ +2/+3, draws ≈ −14, losses ≈ −30.
So the objective is **never donate −30**, not “spicy boards.”
One avoided loss ≈ ten wins.

## Match = series of 2–3 shops
Ghosts **rebuild every round**. Reading R0 is not enough — they pivot.
Treat every shop as: (1) beat what they just showed (2) don’t lose to the
most common *next* pivot (3) spend leftover gold improving.

## The invariant (front survival)
Before endShop, check:

  ourFront.hp + honeyBonus + potatoHp  >  theirFront.atk
  (strict: survive at least one hit without dying)

If false → **mandatory front fix** (sell into bulk/flamingo/hold_the_line/guard-buffed
body). Never potato a grow that still dies to their atk — that feeds snowball/cover.

## Phase playbook

### R0 (blind)
- Always 3 units.
- Default spine: fat front (bulk/grow/flamingo) · echo/guard · hype.
- Prefer fronts with hp≥5. Skip glass (≤3hp) fronts.
- Anti-mirror names.

### After first fight (information)
Classify them. Apply counter kit prefs **and** hedge their likely R+1 pivot.

Common pivots to always hedge:
- chip_snipe → often pivots to **ko_snowball** (Stalk Bot line)
- glass_burst → often pivots to bulk_echo / grow
- bulk_echo → grow_hype / flamingo

### vs ko_snowball (Stalk Bot / snowball + cover)
**Goal: deny free KOs.**
- Front: bulk / flamingo / hold_the_line (NOT grow tip-trading into 6 atk)
- Do not free-kill their weak side pieces if that leaves snowball a KO
- Burst (spotlight) only if it deletes snowball before it stacks
- Honey on front; potato only if resulting hp survives their atk

### vs chip_snipe (mosquito + patch wall)
- Outscale: bulk/grow front, echo, hype — no pin/mosquito war
- Expect snowball next round → keep a wall piece ready

### vs glass_burst (Tech Demos)
- Flamingo/bulk/grow soak; never thin wake/hype front

## Gold priority each shop
1. Fill to 3
2. Fix front survival invariant (above)
3. Install counter/hedge kit
4. Food (honey back→mid, potato front only if survival holds)
5. Same-role upgrade / improve_fish reroll
6. Never end shop with unused gold if a survival fix exists

## What “always win” really means here
Maximize: win rate × volume − 30×loss_rate.
That is: high WR commons spine + ruthless loss avoidance on pivot rounds.
