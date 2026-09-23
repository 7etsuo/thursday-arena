# Rules cleanup — one global counter system

Climb stays **STOPPED**. No handle maps. Encoded from `study/GLOBAL_COUNTERS.md` + confirmed by `study/CURRENT_LOSS_STUDY.md` (448 climb losses: `tip_soft_into_wall_arch` 262 / 58.5%, co-tag `recipe_disabled_policy_tipped` ×255).

## Deleted handle rules

| Deleted | Where | Why |
|---|---|---|
| `HANDLE_SWAP_HEDGE` entire map (dlsusco, levificati0n, krzyszt49207304, skdonkor672, novagamingx4, sandisjonass, converse1nation, thephatp, javabeanai, jst_icn71, heywoozyv3y3, aj121503, fourseasonsgrn, ethanamitchell, nickhenryyy, logosworks, thefieldpass, chr1sr1chards, misha_erm, tspmethod, huntinglife, sean64805703, …) | `lib/counters.js` | GLOBAL_COUNTERS: “No handle rules. Delete it.” Mid-series swaps are arch/fingerprint problems, not per-person hedges. |
| `effectivePlan` handle branch (`HANDLE_SWAP_HEDGE[h]`, `stripPrefer`, `alsoAvoidFrom`, `hedgeSecondary`) | `lib/counters.js` | Same — plan is DATA arch only. |
| Export of `HANDLE_SWAP_HEDGE` | `lib/counters.js` module.exports | Gone; no new handle maps added. |
| Notes that cited specific handles as the *reason* for a plan | `PLANS.*.note` | Replaced with “DATA arch pattern only.” |

## PLANS changes (kit prefer/avoid)

Evidence one-liners from GLOBAL_COUNTERS.md:

| Arch | Change | Evidence |
|---|---|---|
| `glass_burst` | prefer flamingo/bulk/hype/guard/hold/grow; **do not avoid flamingo**; avoid peacock/wake/sting/mosquito/drain/pin/sidestep/patch | “Do: … kits flamingo/bulk with real atk.” Wins use Copy/Newspaper (flamingo). |
| `hype_battery` | prefer **hype/flamingo/sidestep** race; avoid bulk/echo/hold/guard soft walls | “only win was Copy\|Event Request\|Projects Manager”; “13 losses, 1 win”; walls with Webby/Cooper die. |
| `flamingo_pass` | prefer hype/flamingo/bulk/echo/hold/guard; **do not avoid flamingo/hype** | “wins actually use Writing Bot / Copy / Imogen / Call Follow-Ups / hype.” |
| `chip_snipe` | prefer guard/flamingo/bulk/hype/echo/hold; avoid chip-mirror mids | “Do: … kits guard/flamingo. Don’t: chip-mirror random mid.” |
| `wake_chip` | prefer guard/flamingo/hold/echo/bulk/hype; avoid wake/mosquito/outbound-ish tip kits | “Do: Tradbot/Newspaper/Ops/Flora/Cooper spines. Don’t: Outbound/Luma/Hiring.” |
| `hurt_revenge` | prefer hype/bulk/hold/grow/flamingo/spotlight; avoid guard (Docs stacks) + tip kits | “Do: Writing Bot teeth… Don’t: Company Docs Q&A stacks.” |
| Other arches | kept wall+teeth vs tip-mirror; notes de-handled | Consistency with wall+teeth pattern; no handle citations. |

## Tip policy changes (`driver/play_loop.js`)

| Change | Evidence |
|---|---|
| `HARD_TIP_BAN_NAMES` = Stills & Clips Desk, Luma Pages, Outbound Prospecting, Video Edit Desk, Hiring Signals, Product Support Inbox Assistant, Love | GLOBAL_COUNTERS tip policy hard ban list. |
| `HARD_TIP_PUNISH_ARCHES` = flamingo_pass, hype_battery, hurt_revenge, wake_chip, chip_snipe | “Hard ban always into punish walls/hype: … when enemy arch is [those].” |
| **Removed** Webby / Copy Humanizer from blanket tip lists (`isFlamingoHurtTipName` / `isGlassWakeTipName`) | “those units are **win-leaning** on glass/flamingo”; CURRENT_LOSS_STUDY: blanket tip_refuse blocked wrong seats while real tips stayed. |
| Webby/Copy: **allowed** on glass_burst + flamingo_pass; **hard banned** on hype_battery | GLOBAL_COUNTERS conditional tip gate. |
| Writing Bot: **demoted** on glass_burst; **preferred** on flamingo_pass + hurt_revenge | GLOBAL_COUNTERS conditional tip gate. |
| `tip_refuse` **force-sells** hard-banned tips on punish arches (sell loop), not only a reason string | CURRENT_LOSS_STUDY: 262 tip_soft_into_wall_arch; recipe_disabled_policy_tipped ×255 — soft refuse left tips seated. |
| `TIP_PUNISH_ARCHES` no longer includes `glass_burst` as a blanket Webby/Copy punish | glass_burst wins use Webby/Copy; kit peacock/wake bans remain via call-site gates. |
| sidestep removed from `isWallPunishTipKit` | hype_battery race prefer includes sidestep. |

## Arch stickiness

| Change | Evidence |
|---|---|
| `isHypeBatteryNameFp` + pin in `planFromSeats` when seats are imogen + writing bot + wtd | GLOBAL_COUNTERS: “Never classify this as buff_suicide / hurt_revenge mid-series if ghost fp is imogen\|writing\|wtd — keep arch sticky to hype_battery.” |
| Mid-series kit swap to peacock/sting still stays `hype_battery` when names match | Stops `wrong_plan_arch_vs_ghost` (73 primary / 189 tagged in CURRENT_LOSS_STUDY). |

## Verified

- `node --check lib/counters.js` + `node --check driver/play_loop.js` clean
- `HANDLE_SWAP_HEDGE` absent from exports
- `refuseRematchBeforeAccept` → `{ refuse: false, reason: 'play_everyone' }` (play everybody stays)
- Climb **not** restarted

## Files changed

- `lib/counters.js`
- `driver/play_loop.js`
- `study/RULES_CLEANUP.md` (this file)
