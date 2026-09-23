# SLOP AUDIT — planner contradictions

Source greps: `driver/play_loop.js`, `lib/counters.js`, `lib/recipes.js`, `lib/avoid.js`.
Evidence: `study/FULL_AUDIT.md` (771 matches W348/L321/D102).

## Systems that currently fight each other

| # | System A | System B | Fight |
|---|---|---|---|
| 1 | `alwaysHardTipBan` (Stills/Luma/Outbound always) | glass_burst Phase-1 prefer (stills/luma in BUY) | Tips force-sold on the arch where they show WR≥50% |
| 2 | `alwaysBleedBan` historically banned Imogen | Full-log Imogen 73-45-20 (52.9% WR, n=138) | Bleed ban fights spine |
| 3 | `scoreUnit` demote Imogen −10 (stale comment) vs later `s += 2.0` / arch `imogen: 5` | Same function | Duplicate contradictory Imogen scoring |
| 4 | `ARCH_SEAT_PREFER` (recipes) Flora/X Brief on glass | Full-log Flora 40%, X Brief 39% toxic | Recipe prefer fights global toxic |
| 5 | `policy_v1` reason + recipe pick + `counters.PLANS` kit prefer | Three parallel prefer lists | Buy path can lock recipe seats then scoreUnit refuse-sell them |
| 6 | Per-arch regex boosts (glass/flamingo/double_echo/…) stacked | `counters.biasScore` kit prefer/avoid | Double-counting; order-dependent |
| 7 | `HARD_TIP_PUNISH_ARCHES` includes glass_burst | glass_burst data buys stills/luma | Tip punish on win arch |
| 8 | `isFlamingoHurtTipName` / `isGlassWakeTipName` / `isWallPunishTip` / `isSoftBulkTipName` | Overlapping tip detectors | Dead/duplicate paths; some never fire on buy |
| 9 | `HANDLE_*` deleted in counters but `avoid.shouldRefuseRematch` dead code still has hot_field refuse | play_everyone short-circuit hides it | Dead refuse graph still in file |
| 10 | R0 unknown-arch boost Imogen/Newspaper +5 | alwaysHardTipBan / tip force-sell | Early shop fills tips then ejects |
| 11 | `MUST_BUY_NAMES` / `GHOST_COUNTER` name bombs | Anti-mirror `gnames` −50 | Name bomb can still fire on near-matches |
| 12 | Recipes `scoreRecipeForArch` bans Imogen recipes | Imogen is spine (52.9%) | Recipe reject fights seat table |

## Dead / non-firing / stale

- `HANDLE_SWAP_HEDGE`: already deleted from `lib/counters.js` (HANDLE_ count=0). Good — keep deleted.
- `avoid.shouldRefuseRematch` body after `if (true) return play_everyone`: dead code (hot_field_wr, blocklist).
- Stale comments citing Imogen 29% WR / recent~80 — superseded by full 771-match audit.
- Duplicate `pipeline pulse` entry in `HARD_TIP_BAN_NAMES` Set.
- `isFlamingoHurtTipName` still lists Flora / Apple Search Ads as tip names while Flora is sometimes preferred on buff_suicide.
- Tip bans that only set `tipRefuse` reason without sell — partially fixed by force-sell loop, but arch-gated soft tips still linger when not in `alwaysRefuseBuy`.

## Proposed DELETIONS (Phase 3)

1. **Delete** stacked per-arch `if (matchCtx.counterArch === …) { regex ±N }` blocks inside `scoreUnit` — replace with one `seatTableScore(name, arch)`.
2. **Delete** `ARCH_SEAT_PREFER` ad-hoc lists — replace with `ENCODE_TABLE.arch_table` / `lib/seat_table.js`.
3. **Delete** Imogen from any bleed/recipe hard-ban (data: n=138 WR 52.9%).
4. **Delete** Flora / X Brief / Company Docs from prefer lists (global toxic WR<42% n≥10).
5. **Delete** blanket always-ban of Stills/Luma/Outbound — make them **arch-gated** (prefer on glass_burst; refuse on chip_snipe / flamingo_pass / hype_battery).
6. **Collapse** tip detectors to: `globalRefuse(name)` OR `archRefuse(name, arch)` OR classic tip kit into arch.refuse.
7. **Keep** play_everyone short-circuit; optionally strip dead refuse body later (not required for climb).
8. **No new HANDLE_ / hardAvoid opponent rules.**

## Encode contract (one system)

```
score = base(stats) + seatTableScore(name, arch) + kitSpine(kit, arch)
refuse_buy / force_sell = global_refuse ∪ arch.refuse ∪ tips_always_refuse
recipe pick = seats ⊆ arch.prefer∪spine, seats ∩ refuse = ∅
```

Global refuse (WR<42%, n≥10):
- **signal prospector** 6-24-7 (16%, n=37)
- **site audit** 7-17-6 (23%, n=30)
- **event request desk** 8-18-4 (27%, n=30)
- **pipeline pulse** 9-19-4 (28%, n=32)
- **sales call coach** 3-6-1 (30%, n=10)
- **deal hunting** 6-12-1 (32%, n=19)
- **hiring signals** 8-12-4 (33%, n=24)
- **gtm prospecting** 9-14-4 (33%, n=27)
- **apple search ads review** 10-16-4 (33%, n=30)
- **seo aeo desk** 18-27-2 (38%, n=47)
- **love** 14-18-4 (39%, n=36)
- **x brief** 28-32-11 (39%, n=71)
- **company docs q a** 39-52-8 (39%, n=99)
- **video edit desk** 10-13-2 (40%, n=25)
- **nightly audit engineer** 10-6-9 (40%, n=25)
- **flora plant care log** 23-26-8 (40%, n=57)

Global spine (WR≥52%, n≥15):
- **tradbot** 14-4-2 (70%, n=20)
- **the morning newspaper** 45-24-1 (64%, n=70)
- **copy humanizer** 58-22-14 (62%, n=94)
- **gtm loop closer** 12-5-3 (60%, n=20)
- **projects manager** 14-6-4 (58%, n=24)
- **cooper** 67-39-17 (55%, n=123)
- **writing bot** 69-44-15 (54%, n=128)
- **credit card max** 37-22-10 (54%, n=69)
- **wtd** 86-45-30 (53%, n=161)
- **imogen** 73-45-20 (53%, n=138)
- **luma pages** 24-19-3 (52%, n=46)
