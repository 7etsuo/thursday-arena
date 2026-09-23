# Global counters (from matchlog W vs L only)

No handle rules. Climb stays off until this is encoded as one clean plan table.

Source: `data/matchlog/events.jsonl` final-fight boards.

## Contradiction we have today
- `HANDLE_SWAP_HEDGE` is per-person. Delete it.
- `TIP_PUNISH_ARCHES` includes `glass_burst` + `flamingo_pass` and treats **Webby / Copy Humanizer** as tips — but those units are **win-leaning** on those arches. Soft score `tip_refuse` blocks the wrong things and still leaves real tips (Stills, Luma, Outbound) on boards.
- `PLANS.flamingo_pass` says “wall only, avoid flamingo/hype” — wins actually use Writing Bot / Copy / Imogen / Call Follow-Ups / hype.
- `PLANS.hype_battery` pushes bulk/echo walls — **13 losses, 1 win**. Every loss faces `imogen 6/8 | writing bot | wtd`. Walls with Webby/Cooper die. The only win was `Copy Humanizer | Event Request Desk | Projects Manager`.

## Global rules (arch → do / don’t)

### glass_burst (enemy tech demos glass) — W41 L25
**Do:** teeth that punch glass — Tradbot, Copy Humanizer, Webby, X Brief, WTD, Morning Newspaper; kits flamingo/bulk with real atk.
**Don’t:** Writing Bot stacks, Company Docs Q&A soft, Cooper-only, Credit Card Max as “answer”.
**Seat0:** fat newspaper / ops / imogen OK if seat1–2 are real teeth.

### hype_battery (enemy imogen 6/8 + writing + wtd) — W1 L13
**Do:** race / sidestep pressure like the only win — Copy Humanizer + Event Request Desk + Projects Manager (hype/flamingo/sidestep).
**Don’t:** Webby, Cooper, Office Ops soft walls, Meeting Recap echo, Luma Pages. Bulk+echo “sustain” into this board is a guaranteed bleed.
**Never** classify this as buff_suicide / hurt_revenge mid-series if ghost fp is imogen|writing|wtd — keep arch sticky to hype_battery.

### flamingo_pass (enemy morning newspaper wall) — W12 L8
**Do:** Writing Bot, Copy Humanizer, Imogen, Call Follow-Ups, WTD, Office Ops; kits hype/flamingo.
**Don’t:** Stills & Clips, Luma Pages, Video Edit, Hiring Signals, Product Support Inbox, thin X Brief lines, wake kits.

### chip_snipe (enemy signal prospector lines) — W15 L6
**Do:** Company Docs Q&A, Cooper, WTD, Call Follow-Ups, Imogen; kits guard/flamingo.
**Don’t:** chip-mirror random mid (SEO, Recruiting, eggbot, Credit Card Max piles without a guard spine).

### wake_chip — W2 L3 (thin)
**Do:** Tradbot / Morning Newspaper / Ops / Flora / Cooper spines that won.
**Don’t:** Outbound Prospecting, Luma, Hiring Signals, Recruiting tip lines.

### hurt_revenge — W2 L2
**Do:** Writing Bot teeth (both wins had it) + Imogen/Ops/X Brief.
**Don’t:** Company Docs Q&A stacks (both losses).

### sustain / others
Prefer Ops + Credit Card Max / Copy + Call Follow-Ups / WTD over Writing+X Brief+Luma soft.

## Tip policy (global, not per handle)
**Hard ban always into punish walls/hype:** Stills & Clips Desk, Luma Pages, Outbound Prospecting, Video Edit Desk, Hiring Signals, Product Support Inbox Assistant, Love ❤️ when enemy arch is flamingo_pass, hype_battery, hurt_revenge, wake_chip, chip_snipe.
**Not auto-banned (win-leaning on glass/flamingo):** Copy Humanizer, Webby, Writing Bot — gate by arch:
- Writing Bot: prefer on flamingo_pass + hurt_revenge; demote on glass_burst
- Webby / Copy Humanizer: allow on glass_burst + flamingo_pass; hard ban on hype_battery

## Cleanup checklist
1. Delete `HANDLE_SWAP_HEDGE` and all handle branches in `effectivePlan`.
2. Replace `PLANS` entries for glass_burst / hype_battery / flamingo_pass / chip_snipe / wake_chip / hurt_revenge with the do/don’t above (kit+name gates).
3. Rewrite tip detection so Copy/Webby are not blanket tips; ban list is the real tip set above.
4. One arch classifier path — no mid-series rebadge of imogen|writing|wtd off hype_battery.
5. No new per-handle rules. Ever.
