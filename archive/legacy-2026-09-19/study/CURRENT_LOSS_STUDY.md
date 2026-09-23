# CURRENT LOSS STUDY — tetsuoai climb

_Generated 9/18/2026, 10:59:44 PM MT (America/Edmonton). Evidence-only from raw logs. No planner changes. No data deleted._

## Data sources

| Source | Scope |
|---|---|
| `matches/climb/*.log` | **456** files → **2633W / 448L / 225D**, eloΣ **-314** |
| `data/matchlog/events.jsonl` | **83W / 58L / 11D**, eloΣ **-243** (kits + fight winners; overlaps recent) |
| Prior `study/climb/*` | Cross-check only — not counted as evidence |

**Loss field coverage (climb):** 448 losses; `ourLine` **448**; `ghostFp` **448**; arch≠unknown **448**; neither board nor ghost **0** (excluded from causal claims).

## Headline totals

| | n | elo contribution notes |
|---|---:|---|
| Win | 2633 | avg **+5.0** |
| Loss | 448 | avg **-25.2** |
| Draw | 225 | |
| **Net** | 3306 | eloΣ **-314** |

Decided WR **85.5%**. One loss ≈ **5.0** wins to break even at these averages.

## Ranked primary failure modes (each loss counted once)

Tip-ban names follow `driver/play_loop.js` (`isFlamingoHurtTipName` / glass tip list + Pipeline Pulse). Punish arches = hurt_revenge, flamingo_pass, grow_hype, grow_scale, echo_hype, double_echo, sustain, wake_chip, bulk_echo, glass_burst, chip_snipe.

| Rank | Mode | Count | % losses | elo Σ |
|---:|---|---:|---:|---:|
| 1 | `tip_soft_into_wall_arch` | 262 | 58.5% | -6722 |
| 2 | `wrong_plan_arch_vs_ghost` | 73 | 16.3% | -1752 |
| 3 | `wall_board_still_lost` | 39 | 8.7% | -943 |
| 4 | `no_teeth_vs_wall` | 26 | 5.8% | -652 |
| 5 | `front_dies_before_teeth` | 19 | 4.2% | -504 |
| 6 | `tip_into_non_punish_arch` | 18 | 4.0% | -425 |
| 7 | `mirror_flamingo_echo` | 11 | 2.5% | -277 |

### Multi-label tag frequency (loss can carry several)

| Tag | Hits | % losses |
|---|---:|---:|
| `tip_soft_into_wall_arch` | 262 | 58.5% |
| `recipe_disabled_policy_tipped` | 255 | 56.9% |
| `no_teeth_vs_wall` | 230 | 51.3% |
| `front_dies_before_teeth` | 210 | 46.9% |
| `wrong_plan_arch_vs_ghost` | 189 | 42.2% |
| `wall_board_still_lost` | 128 | 28.6% |
| `tip_front_into_punish` | 103 | 23.0% |
| `plan_flagged_teethOk_false` | 71 | 15.8% |
| `plan_flagged_frontSurvival_false` | 63 | 14.1% |
| `tip_into_non_punish_arch` | 58 | 12.9% |
| `mirror_flamingo_echo` | 23 | 5.1% |
| `recipe_bought_tips_vs_wall` | 7 | 1.6% |
| `starved_board_lt3` | 5 | 1.1% |

> **Multi-label note:** `recipe_disabled_policy_tipped` (255), `no_teeth_vs_wall` (230), and `front_dies_before_teeth` (210) mostly **co-tag** with `tip_soft_into_wall_arch` — same losses, extra evidence (recipeWhy=disabled, missing teeth names, R0 fight_settled=them). Primary ranking avoids double-counting.
> `wall_board_still_lost` multi (128) is mutually exclusive with tip modes (`!tip` boards only); 39 of those are primary when no higher tag applies.

**Evidence count tip/soft → punish arch:** **262 / 448 (58.5%)**.

### Mode A — Tip/soft seats into wall/punish arches

- Primary: **262** (58.5%); tagged: **262**
- Top opponents: novagamingx4×9, converse1nation×8, logosworks×8, ahmad_alqodri×7, aj121503×7, chr1sr1chards×6
- Top arches: chip_snipe×58, glass_burst×56, flamingo_pass×39, hurt_revenge×30, bulk_echo×26, sustain×16

**Example matches:**

- `loss-202609181138290` vs **martin_maradei** · arch=`wake_chip` · elo=-27
  - our board: `Imogen 2/6 | Copy Humanizer 2/5 | X Brief 2/4`
  - ghost fp: `stills clips desk | meeting recap deck | webby`
  - last plan: `policy_v1+thr:seat0+lead+deficit` · recipeId=null · recipeWhy=disabled
  - fights: R0:them
  - evidence: tips [Copy Humanizer] into punish arch wake_chip
- `loss-202609181139201` vs **converse1nation** · arch=`bulk_echo` · elo=-25
  - our board: `Copy Humanizer 2/5 | Stills & Clips Desk 2/5 | Love ❤️ 2/5`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: tips [Copy Humanizer, Stills & Clips Desk, Love ❤️] into punish arch bulk_echo
- `loss-202609181139256` vs **converse1nation** · arch=`bulk_echo` · elo=-25
  - our board: `Outbound Prospecting 3/4 | Site Audit 3/3 | Luma Pages 2/4`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: tips [Outbound Prospecting, Luma Pages] into punish arch bulk_echo
- `loss-202609181139520` vs **converse1nation** · arch=`bulk_echo` · elo=-24
  - our board: `The Morning Newspaper 2/6 | Stills & Clips Desk 2/5 | GTM Prospecting 4/3`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: tips [Stills & Clips Desk, GTM Prospecting] into punish arch bulk_echo

**What planner did wrong (logged):** see reasons above — typically `recipeWhy=disabled` with `policy_v1+<arch>` still seating tip-ban units, or R0 before ghost with no tip_refuse.

**Precise fix implied (do not implement):** Hard-block tip-ban names/kits whenever live or scout arch ∈ TIP_PUNISH (including R0 if scoutPrior is punish). Force wall spine (Newspaper / Imogen / Ops / NYC / Cooper) + teeth (WTD / Writing / CCM) before endShop.

### Mode B — Mirror flamingo/echo into flamingo_pass / echo_* / bulk_echo

- Primary: **11** (2.5%); tagged: **23**
- Top opponents: converse1nation×3, gorikfr×3, fatkiddeals×2, jakes_twitofmi×2, feemoottaa×2, bryan_skwirut×2
- Top arches: bulk_echo×12, flamingo_pass×9, echo_hype×2

**Example matches:**

- `loss-202609181139520` vs **converse1nation** · arch=`bulk_echo` · elo=-24
  - our board: `The Morning Newspaper 2/6 | Stills & Clips Desk 2/5 | GTM Prospecting 4/3`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: flamingo/echo pieces into bulk_echo fp=imogen | meeting recap deck | love
- `loss-202609181140029` vs **converse1nation** · arch=`bulk_echo` · elo=-23
  - our board: `Copy Humanizer 3/6 | Writing Bot 2/5 | The Morning Newspaper 2/6`
  - ghost fp: `meeting recap deck | imogen | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+lead+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:us, R2:them
  - evidence: flamingo/echo pieces into bulk_echo fp=meeting recap deck | imogen | love
- `loss-202609181140183` vs **converse1nation** · arch=`bulk_echo` · elo=-22
  - our board: `The Morning Newspaper 2/6 | Company Docs Q&A 2/6 | Love ❤️ 2/5`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: flamingo/echo pieces into bulk_echo fp=imogen | meeting recap deck | love
- `loss-202609182124129` vs **heywoozyv3y3** · arch=`flamingo_pass` · elo=-22
  - our board: `Office Ops Desk 5/5 | Company Docs Q&A 2/6 | X Brief 3/5`
  - ghost fp: `the morning newspaper | haggle bot | lead pipeline desk`
  - last plan: `policy_v1+hurt_revenge+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`hurt_revenge`
  - fights: R0:them, R1:draw, R2:them
  - evidence: flamingo/echo pieces into flamingo_pass fp=the morning newspaper | haggle bot | lead pipeline desk

**What planner did wrong (logged):** see reasons above — typically `recipeWhy=disabled` with `policy_v1+<arch>` still seating tip-ban units, or R0 before ghost with no tip_refuse.

**Precise fix implied (do not implement):** On those arches, refuse Morning Newspaper / Call Follow-Ups / Cooper / X Brief mirrors; prefer bulk/hold front + non-echo teeth.

### Mode C — Front dies before teeth fire (fight_settled R0=them + tip front)

- Primary: **19** (4.2%); tagged: **210**
- Top opponents: novagamingx4×9, converse1nation×8, aj121503×7, chr1sr1chards×6, nickhenryyy×5, sandisjonass×5
- Top arches: chip_snipe×41, glass_burst×39, flamingo_pass×28, bulk_echo×20, hurt_revenge×19, sustain×12

**Example matches:**

- `loss-202609181138290` vs **martin_maradei** · arch=`wake_chip` · elo=-27
  - our board: `Imogen 2/6 | Copy Humanizer 2/5 | X Brief 2/4`
  - ghost fp: `stills clips desk | meeting recap deck | webby`
  - last plan: `policy_v1+thr:seat0+lead+deficit` · recipeId=null · recipeWhy=disabled
  - fights: R0:them
  - evidence: R0 them with tips vs wake_chip; fights=R0:them
- `loss-202609181139201` vs **converse1nation** · arch=`bulk_echo` · elo=-25
  - our board: `Copy Humanizer 2/5 | Stills & Clips Desk 2/5 | Love ❤️ 2/5`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: fights=R0:them,R1:them tipFront=Copy Humanizer
- `loss-202609181139256` vs **converse1nation** · arch=`bulk_echo` · elo=-25
  - our board: `Outbound Prospecting 3/4 | Site Audit 3/3 | Luma Pages 2/4`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: fights=R0:them,R1:them tipFront=Outbound Prospecting
- `loss-202609181139520` vs **converse1nation** · arch=`bulk_echo` · elo=-24
  - our board: `The Morning Newspaper 2/6 | Stills & Clips Desk 2/5 | GTM Prospecting 4/3`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: R0 them with tips vs bulk_echo; fights=R0:them,R1:them

**What planner did wrong (logged):** see reasons above — typically `recipeWhy=disabled` with `policy_v1+<arch>` still seating tip-ban units, or R0 before ghost with no tip_refuse.

**Precise fix implied (do not implement):** Gate endShop on frontSurvival against punish arches; sell tip fronts; do not accept tip front even with teeth behind.

### Mode D — Plan arch ≠ observed ghost arch

- Primary: **73** (16.3%); tagged: **189**
- Top opponents: novagamingx4×9, thefieldpass×8, bradvincent_×7, krzyszt49207304×5, fourseasonsgrn×5, heywoozyv3y3×5
- Top arches: chip_snipe×36, hurt_revenge×31, backline_snipe×22, glass_burst×21, flamingo_pass×14, bulk_echo×11

**Example matches:**

- `loss-202609181146560` vs **dlsusco** · arch=`hurt_revenge` · elo=-26
  - our board: `Partnerships Call Coach 6/6 | Signal Prospector 3/4 | X Brief 2/4`
  - ghost fp: `nyc parent | sales call coach | account research desk`
  - last plan: `policy_v1+flamingo_pass+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`flamingo_pass`
  - fights: R0:draw, R1:them, R2:them
  - evidence: planArch=flamingo_pass ghostArch=hurt_revenge reason=policy_v1+flamingo_pass+thr:seat0+deficit
- `loss-202609181147188` vs **dlsusco** · arch=`hurt_revenge` · elo=-25
  - our board: `NYC Parent 2/6 | NYC Parent 2/6 | Projects Manager 3/5`
  - ghost fp: `nyc parent | sales call coach | account research desk`
  - last plan: `policy_v1+flamingo_pass+thr:seat0+lead+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`flamingo_pass`
  - fights: R0:us, R1:them, R2:them
  - evidence: planArch=flamingo_pass ghostArch=hurt_revenge reason=policy_v1+flamingo_pass+thr:seat0+lead+deficit
- `loss-202609181147377` vs **dlsusco** · arch=`hurt_revenge` · elo=-25
  - our board: `Meeting Recap Deck 3/4 | Projects Manager 3/5 | Apple Search Ads Review 3/3`
  - ghost fp: `nyc parent | sales call coach | account research desk`
  - last plan: `policy_v1+flamingo_pass+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`flamingo_pass`
  - fights: R0:draw, R1:them, R2:them
  - evidence: planArch=flamingo_pass ghostArch=hurt_revenge reason=policy_v1+flamingo_pass+thr:seat0+deficit
- `loss-202609181147577` vs **dlsusco** · arch=`hurt_revenge` · elo=-23
  - our board: `Imogen 2/6 | Signal Prospector 4/5 | Imogen 2/6`
  - ghost fp: `nyc parent | sales call coach | account research desk`
  - last plan: `policy_v1+flamingo_pass+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`flamingo_pass`
  - fights: R0:draw, R1:them, R2:them
  - evidence: planArch=flamingo_pass ghostArch=hurt_revenge reason=policy_v1+flamingo_pass+thr:seat0+deficit

**What planner did wrong (logged):** see reasons above — typically `recipeWhy=disabled` with `policy_v1+<arch>` still seating tip-ban units, or R0 before ghost with no tip_refuse.

**Precise fix implied (do not implement):** When ghost_seen arch disagrees with plan reason arch, rebuild shop from ghost arch (do not keep glass_burst plan into chip_snipe, etc.).

### Mode E — Tip seats into non-punish arches (still bled)

- Primary: **18** (4.0%); tagged: **58**
- Top opponents: aurinkern×8, javabeanai×4, thefieldpass×4, ethanamitchell×3, godstorm91×3, taxzy920×2
- Top arches: backline_snipe×26, hype_battery×15, buff_suicide×12, ko_snowball×5

**Example matches:**

- `loss-202609181148482` vs **ykcxx00** · arch=`ko_snowball` · elo=-22
  - our board: `Company Docs Q&A 2/6 | Apple Search Ads Review 3/3 | Cooper 2/5`
  - ghost fp: `last30days | talent discovery | overheard`
  - last plan: `policy_v1+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - fights: R0:them
  - evidence: tips [Apple Search Ads Review] into arch ko_snowball
- `loss-202609181157583` vs **irsthaeth** · arch=`ko_snowball` · elo=-21
  - our board: `Copy Humanizer 2/5 | EBR & Value Deck Builder 2/6 | Luma Pages 2/4`
  - ghost fp: `meeting recap deck | lead pipeline desk | event producer`
  - last plan: `policy_v1+wake_chip+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`wake_chip`
  - fights: R0:them, R1:them
  - evidence: tips [Copy Humanizer, EBR & Value Deck Builder, Luma Pages] into arch ko_snowball
- `loss-202609181215242` vs **taxzy920** · arch=`backline_snipe` · elo=-28
  - our board: `Webby 3/5 | Company Docs Q&A 2/6 | Credit Card Max 5/4`
  - ghost fp: `site audit | apple search ads review | account research desk`
  - last plan: `policy_v1+flamingo_pass+thr:flamingo→mid+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`flamingo_pass`
  - fights: R0:them, R1:them
  - evidence: tips [Webby] into arch backline_snipe
- `loss-202609181215328` vs **taxzy920** · arch=`backline_snipe` · elo=-27
  - our board: `Love ❤️ 2/5 | Luma Pages 3/5`
  - ghost fp: `site audit | apple search ads review | account research desk`
  - last plan: `policy_v1+flamingo_pass+thr:flamingo→mid+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`flamingo_pass`
  - fights: R0:them, R1:them
  - evidence: tips [Love ❤️, Luma Pages] into arch backline_snipe

**What planner did wrong (logged):** see reasons above — typically `recipeWhy=disabled` with `policy_v1+<arch>` still seating tip-ban units, or R0 before ghost with no tip_refuse.

**Precise fix implied (do not implement):** Extend tip discipline beyond TIP_PUNISH for sticky farm handles; or hardAvoid those handles.

### Mode F — Wall-ish board still lost (no tip-ban units)

- Primary: **39** (8.7%); tagged: **128**
- Top opponents: edtropic×6, aurinkern×6, gorikfr×4, bankkk_than×4, krzyszt49207304×3, thephatp×3
- Top arches: glass_burst×31, chip_snipe×20, flamingo_pass×17, hurt_revenge×14, hype_battery×10, bulk_echo×8

**Example matches:**

- `loss-202609181147188` vs **dlsusco** · arch=`hurt_revenge` · elo=-25
  - our board: `NYC Parent 2/6 | NYC Parent 2/6 | Projects Manager 3/5`
  - ghost fp: `nyc parent | sales call coach | account research desk`
  - last plan: `policy_v1+flamingo_pass+thr:seat0+lead+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`flamingo_pass`
  - fights: R0:us, R1:them, R2:them
  - evidence: wall-ish board lost vs hurt_revenge: NYC Parent 2/6 | NYC Parent 2/6 | Projects Manager 3/5
- `loss-202609181147577` vs **dlsusco** · arch=`hurt_revenge` · elo=-23
  - our board: `Imogen 2/6 | Signal Prospector 4/5 | Imogen 2/6`
  - ghost fp: `nyc parent | sales call coach | account research desk`
  - last plan: `policy_v1+flamingo_pass+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`flamingo_pass`
  - fights: R0:draw, R1:them, R2:them
  - evidence: wall-ish board lost vs hurt_revenge: Imogen 2/6 | Signal Prospector 4/5 | Imogen 2/6
- `loss-202609181153578` vs **palmengine** · arch=`glass_burst` · elo=-25
  - our board: `Company Docs Q&A 2/6 | Projects Manager 3/5 | GTM Account Research 3/7`
  - ghost fp: `tech demos | meeting recap deck | imogen`
  - last plan: `policy_v1+glass_burst+thr:seat0+lead+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`glass_burst`
  - fights: R0:them, R1:us, R2:them
  - evidence: wall-ish board lost vs glass_burst: Company Docs Q&A 2/6 | Projects Manager 3/5 | GTM Account Research 3/7
- `loss-202609181156237` vs **krzyszt49207304** · arch=`chip_snipe` · elo=-25
  - our board: `NYC Parent 2/6 | The Morning Newspaper 2/6 | Nightly Audit Engineer 3/6`
  - ghost fp: `imogen | meeting recap deck | competitor watch`
  - last plan: `policy_v1+glass_burst+thr:first_seat_jump+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`glass_burst`
  - fights: R0:draw, R1:them, R2:them
  - evidence: wall-ish board lost vs chip_snipe: NYC Parent 2/6 | The Morning Newspaper 2/6 | Nightly Audit Engineer 3/6

**What planner did wrong (logged):** see reasons above — typically `recipeWhy=disabled` with `policy_v1+<arch>` still seating tip-ban units, or R0 before ghost with no tip_refuse.

**Precise fix implied (do not implement):** Treat as rematch-farm / arch black hole: hardAvoid after 2 losses or eloΣ≤−40 even at high WR; do not rematch sticky lines.

### Mode G — No teeth names vs punish arch

- Primary: **26** (5.8%); tagged: **230**
- Top opponents: edtropic×7, dlsusco×5, sandisjonass×5, novagamingx4×5, bryan_skwirut×5, ahmad_alqodri×5
- Top arches: chip_snipe×49, glass_burst×47, flamingo_pass×41, hurt_revenge×31, bulk_echo×21, wake_chip×13

**Example matches:**

- `loss-202609181138290` vs **martin_maradei** · arch=`wake_chip` · elo=-27
  - our board: `Imogen 2/6 | Copy Humanizer 2/5 | X Brief 2/4`
  - ghost fp: `stills clips desk | meeting recap deck | webby`
  - last plan: `policy_v1+thr:seat0+lead+deficit` · recipeId=null · recipeWhy=disabled
  - fights: R0:them
  - evidence: no teeth names vs wake_chip: Imogen 2/6 | Copy Humanizer 2/5 | X Brief 2/4
- `loss-202609181139201` vs **converse1nation** · arch=`bulk_echo` · elo=-25
  - our board: `Copy Humanizer 2/5 | Stills & Clips Desk 2/5 | Love ❤️ 2/5`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: no teeth names vs bulk_echo: Copy Humanizer 2/5 | Stills & Clips Desk 2/5 | Love ❤️ 2/5
- `loss-202609181139256` vs **converse1nation** · arch=`bulk_echo` · elo=-25
  - our board: `Outbound Prospecting 3/4 | Site Audit 3/3 | Luma Pages 2/4`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: no teeth names vs bulk_echo: Outbound Prospecting 3/4 | Site Audit 3/3 | Luma Pages 2/4
- `loss-202609181140301` vs **converse1nation** · arch=`bulk_echo` · elo=-21
  - our board: `NYC Parent 4/6 | SEO & AEO Desk 2/5 | Love ❤️ 2/5`
  - ghost fp: `meeting recap deck | imogen | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+lead+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:us, R2:them
  - evidence: no teeth names vs bulk_echo: NYC Parent 4/6 | SEO & AEO Desk 2/5 | Love ❤️ 2/5

**What planner did wrong (logged):** see reasons above — typically `recipeWhy=disabled` with `policy_v1+<arch>` still seating tip-ban units, or R0 before ghost with no tip_refuse.

**Precise fix implied (do not implement):** Require teethOk / teeth names (WTD, Writing Bot, Newspaper, CCM) before ending shop vs punish arches.

### Mode H — recipeWhy=disabled while policy still tipped (tag)

- Primary: **0** (0.0%); tagged: **255**
- Top opponents: novagamingx4×9, converse1nation×8, logosworks×8, aj121503×7, chr1sr1chards×6, bradvincent_×6
- Top arches: chip_snipe×58, glass_burst×50, flamingo_pass×39, hurt_revenge×30, bulk_echo×26, sustain×16

**Example matches:**

- `loss-202609181138290` vs **martin_maradei** · arch=`wake_chip` · elo=-27
  - our board: `Imogen 2/6 | Copy Humanizer 2/5 | X Brief 2/4`
  - ghost fp: `stills clips desk | meeting recap deck | webby`
  - last plan: `policy_v1+thr:seat0+lead+deficit` · recipeId=null · recipeWhy=disabled
  - fights: R0:them
  - evidence: recipeWhy=disabled; reason=policy_v1+thr:seat0+lead+deficit
- `loss-202609181139201` vs **converse1nation** · arch=`bulk_echo` · elo=-25
  - our board: `Copy Humanizer 2/5 | Stills & Clips Desk 2/5 | Love ❤️ 2/5`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: recipeWhy=disabled; reason=policy_v1+bulk_echo+thr:seat0+deficit
- `loss-202609181139256` vs **converse1nation** · arch=`bulk_echo` · elo=-25
  - our board: `Outbound Prospecting 3/4 | Site Audit 3/3 | Luma Pages 2/4`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: recipeWhy=disabled; reason=policy_v1+bulk_echo+thr:seat0+deficit
- `loss-202609181139520` vs **converse1nation** · arch=`bulk_echo` · elo=-24
  - our board: `The Morning Newspaper 2/6 | Stills & Clips Desk 2/5 | GTM Prospecting 4/3`
  - ghost fp: `imogen | meeting recap deck | love`
  - last plan: `policy_v1+bulk_echo+thr:seat0+deficit` · recipeId=null · recipeWhy=disabled
  - planArch=`bulk_echo`
  - fights: R0:them, R1:them
  - evidence: recipeWhy=disabled; reason=policy_v1+bulk_echo+thr:seat0+deficit

**What planner did wrong (logged):** see reasons above — typically `recipeWhy=disabled` with `policy_v1+<arch>` still seating tip-ban units, or R0 before ghost with no tip_refuse.

**Precise fix implied (do not implement):** Re-enable only wall-spine recipes keyed to observed fp; never allow tip fills when recipe disabled under punish arch.

## Rematch farms (≥3 losses, by elo bleed)

| Handle | W-D-L | elo Σ | top loss arch | example ids |
|---|---:|---:|---|---|
| aj121503 | 0-1-9 | -242 | echo_hype×9 | loss-202609181114556, loss-202609181115210, loss-202609181115346 |
| aurinkern | 3-0-15 | -228 | hype_battery×13 | loss-202609190441312, loss-202609190441420, loss-202609190441530 |
| novagamingx4 | 2-0-9 | -222 | grow_hype×9 | loss-202609182122310, loss-202609182122362, loss-202609182122436 |
| ahmad_alqodri | 0-2-10 | -187 | glass_burst×9 | loss-202609190453556, loss-202609190454054, loss-202609190454151 |
| bradvincent_ | 0-1-7 | -182 | glass_burst×6 | loss-202609190033284, loss-202609190033395, loss-202609190033510 |
| chr1sr1chards | 2-0-7 | -180 | hurt_revenge×7 | loss-202609182206455, loss-202609182206532, loss-202609182207012 |
| converse1nation | 2-0-8 | -167 | bulk_echo×8 | loss-202609181139201, loss-202609181139256, loss-202609181139520 |
| logosworks | 2-1-8 | -166 | sustain×8 | loss-202609182155027, loss-202609182155216, loss-202609182155274 |
| sean64805703 | 3-1-6 | -158 | hurt_revenge×6 | loss-202609182349016, loss-202609182349093, loss-202609182349284 |
| edtropic | 5-0-10 | -152 | flamingo_pass×5 | loss-202609190435496, loss-202609190436023, loss-202609190436135 |
| realvkarthik | 4-1-5 | -144 | sustain×5 | loss-202609190052196, loss-202609190052379, loss-202609190052444 |
| bryan_skwirut | 4-0-6 | -144 | bulk_echo×6 | loss-202609190056015, loss-202609190059112, loss-202609190059352 |
| seano1022 | 1-0-6 | -139 | wake_chip×3 | loss-202609182238029, loss-202609182238098, loss-202609182238151 |
| misha_erm | 4-0-5 | -135 | chip_snipe×4 | loss-202609182224357, loss-202609182224505, loss-202609182225108 |
| dc_zj | 5-4-4 | -133 | bulk_echo×4 | loss-202609190152373, loss-202609190152488, loss-202609190153559 |
| thefieldpass | 1-2-8 | -127 | buff_suicide×4 | loss-202609182125545, loss-202609182126045, loss-202609182126439 |
| jaybosshq | 6-3-4 | -126 | flamingo_pass×4 | loss-202609190116425, loss-202609190117436, loss-202609190118133 |
| sandisjonass | 4-0-5 | -124 | chip_snipe×5 | loss-202609182053349, loss-202609182053559, loss-202609182054027 |
| shymicron | 3-1-5 | -121 | chip_snipe×5 | loss-202609182305441, loss-202609182306119, loss-202609182306242 |
| dlsusco | 3-1-5 | -112 | hurt_revenge×4 | loss-202609181146475, loss-202609181146560, loss-202609181147188 |

**Fix implied:** `refuse_rematch` / hardAvoid when losses≥3 or eloΣ≤−40 on handle (already partially logged via refuse_rematch events).

## Same ghost FP — win boards vs loss boards

### `tech demos | meeting recap deck | imogen` (≈glass_burst) — 105W / 25L

- Tip-rate losses **56%** vs wins **58%**
- Win units: the morning newspaper×23, nyc parent×22, call follow ups×21, company docs q a×19, office ops desk×17, wtd×16, copy humanizer×14, writing bot×14
- Loss units: company docs q a×10, deal inspector×6, luma pages×6, writing bot×5, wtd×5, pipeline pulse×4, account research desk×3, office ops desk×3
- Win ex: `Copy Humanizer 3/6 | Writing Bot 2/5 | Luma Pages 3/5` · `policy_v1+glass_burst+thr:seat0+lead`
- Loss ex: `NYC Parent 2/6 | Pipeline Pulse 3/4 | Writing Bot 2/5` · id=`loss-202609181153091` · `policy_v1+glass_burst+thr:seat0+deficit`

### `imogen | writing bot | wtd` (≈hype_battery) — 1W / 13L

- Tip-rate losses **62%** vs wins **100%**
- Win units: copy humanizer×1, event request desk×1, projects manager×1
- Loss units: webby×5, cooper×4, office ops desk×3, call follow ups×3, luma pages×3, copy humanizer×3, tradbot×2, meeting recap deck×2
- Win ex: `Copy Humanizer 3/6 | Event Request Desk 3/4 | Projects Manager 3/5` · `policy_v1+hype_battery+thr:hype_sob+lead+deficit+decider_11`
- Loss ex: `NYC Parent 2/6 | Tradbot 3/6 | Cooper 3/6` · id=`loss-202609190441312` · `policy_v1+hype_battery+thr:hype_sob+deficit`

### `imogen | meeting recap deck | love` (≈bulk_echo) — 3W / 8L

- Tip-rate losses **75%** vs wins **33%**
- Win units: call follow ups×2, wtd×2, nyc parent×1, paid media report desk×1, x brief×1, copy humanizer×1, cooper×1
- Loss units: the morning newspaper×3, stills clips desk×2, love×2, credit card max×2, office ops desk×2, copy humanizer×1, outbound prospecting×1, site audit×1
- Win ex: `NYC Parent 4/6 | Paid Media Report Desk 3/5 | Call Follow-Ups 4/5` · `policy_v1+bulk_echo+thr:seat0+lead`
- Loss ex: `Copy Humanizer 2/5 | Stills & Clips Desk 2/5 | Love ❤️ 2/5` · id=`loss-202609181139201` · `policy_v1+bulk_echo+thr:seat0+deficit`

### `office ops desk | x brief | product support inbox assistant` (≈sustain) — 2W / 8L

- Tip-rate losses **100%** vs wins **0%**
- Win units: the morning newspaper×2, deal inspector×1, cooper×1, wtd×1, call follow ups×1
- Loss units: copy humanizer×4, flora plant care log×3, love×2, the morning newspaper×2, credit card max×2, cooper×2, imogen×1, video edit desk×1
- Win ex: `Deal Inspector 4/4 | Cooper 3/6 | WTD 3/4` · `policy_v1+sustain+thr:seat0+lead`
- Loss ex: `Imogen 2/6 | Copy Humanizer 2/5 | Copy Humanizer 2/5` · id=`loss-202609182155027` · `policy_v1+sustain+thr:seat0+deficit`

### `writing bot | haggle bot | gtm loop closer` (≈hurt_revenge) — 2W / 7L

- Tip-rate losses **86%** vs wins **0%**
- Win units: imogen×1, the morning newspaper×1, account research desk×1, nyc parent×1, event request desk×1, gtm loop closer×1
- Loss units: company docs q a×3, credit card max×2, deal inspector×2, imogen×2, love×2, apple search ads review×2, pipeline pulse×1, outbound prospecting×1
- Win ex: `Imogen 3/7 | The Morning Newspaper 3/7 | Account Research Desk 3/5` · `policy_v1+hurt_revenge+thr:seat0+lead+deficit`
- Loss ex: `Pipeline Pulse 4/5 | Credit Card Max 3/4 | Deal Inspector 4/4` · id=`loss-202609182206455` · `policy_v1+chip_snipe+thr:hype+echo_scale+deficit`

### `meeting recap deck | imogen | love` (≈bulk_echo) — 16W / 5L

- Tip-rate losses **60%** vs wins **50%**
- Win units: office ops desk×7, tradbot×4, webby×3, call follow ups×3, nyc parent×3, love×2, x brief×2, flora plant care log×2
- Loss units: seo aeo desk×2, wtd×2, copy humanizer×1, writing bot×1, the morning newspaper×1, nyc parent×1, love×1, office ops desk×1
- Win ex: `Webby 6/6 | Tradbot 3/6 | Luma Pages 2/4` · `policy_v1+bulk_echo+thr:seat0+lead+deficit`
- Loss ex: `Copy Humanizer 3/6 | Writing Bot 2/5 | The Morning Newspaper 2/6` · id=`loss-202609181140029` · `policy_v1+bulk_echo+thr:seat0+lead+deficit`

### `imogen | meeting recap deck | competitor watch` (≈chip_snipe) — 2W / 5L

- Tip-rate losses **40%** vs wins **100%**
- Win units: luma pages×2, paid media report desk×1, tradbot×1, apple search ads review×1, nightly audit engineer×1
- Loss units: nyc parent×4, the morning newspaper×2, office ops desk×2, webby×1, company docs q a×1, nightly audit engineer×1, projects manager×1, stills clips desk×1
- Win ex: `Paid Media Report Desk 4/6 | Tradbot 3/6 | Luma Pages 2/4` · `policy_v1+glass_burst+thr:first_seat_jump+lead`
- Loss ex: `Webby 4/6 | Company Docs Q&A 2/6 | NYC Parent 2/6` · id=`loss-202609181155469` · `policy_v1+glass_burst+thr:first_seat_jump+deficit`

### `webby | writing bot | wtd` (≈hype_battery) — 2W / 5L

- Tip-rate losses **60%** vs wins **50%**
- Win units: credit card max×2, the morning newspaper×1, company docs q a×1, copy humanizer×1, gtm loop closer×1
- Loss units: copy humanizer×2, nyc parent×2, company docs q a×2, imogen×2, recruiting coordinator×1, apple search ads review×1, nightly audit engineer×1, seo aeo desk×1
- Win ex: `The Morning Newspaper 3/7 | Company Docs Q&A 2/6 | Credit Card Max 3/4` · `policy_v1+hype_battery+thr:hype_sob+lead+deficit`
- Loss ex: `Copy Humanizer 3/6 | Copy Humanizer 2/5 | Recruiting Coordinator 3/5` · id=`loss-202609181224572` · `policy_v1+backline_snipe+thr:hype_sob+deficit`

### `pipeline pulse | cooper | x brief` (≈chip_snipe) — 4W / 5L

- Tip-rate losses **100%** vs wins **75%**
- Win units: imogen×4, luma pages×3, nyc parent×1, company docs q a×1, office ops desk×1, love×1, projects manager×1
- Loss units: customer call coach assistant×2, deal hunting×2, webby×2, cooper×1, overheard×1, nightly audit engineer×1, love×1, meeting recap deck×1
- Win ex: `NYC Parent 3/7 | Imogen 2/6 | Luma Pages 3/5` · `policy_v1+chip_snipe+thr:seat0+lead+deficit`
- Loss ex: `Cooper 2/5 | Customer Call Coach & Assistant 3/5 | Overheard 4/4` · id=`loss-202609182053349` · `policy_v1+chip_snipe+thr:seat0+deficit`

### `pipeline pulse | nyc parent | writing bot` (≈chip_snipe) — 2W / 5L

- Tip-rate losses **100%** vs wins **50%**
- Win units: credit card max×1, cooper×1, nightly audit engineer×1, imogen×1, meeting recap deck×1, critiquito design critique×1
- Loss units: office ops desk×2, flora plant care log×2, paid media report desk×1, researchy×1, stills clips desk×1, call follow ups×1, luma pages×1, seo aeo desk×1
- Win ex: `Credit Card Max 5/6 | Cooper 2/5 | Nightly Audit Engineer 3/6` · `policy_v1+chip_snipe+thr:hype_sob+lead+deficit`
- Loss ex: `Office Ops Desk 3/5 | Paid Media Report Desk 3/5 | Researchy 3/7` · id=`loss-202609182305441` · `policy_v1+chip_snipe+thr:hype_sob+lead+deficit`

## Unit lift (appearance share loss% − win%)

Boards parsed: 448 losses, 2633 wins.

### Elevated on losses

| Unit | loss% | win% | lift | L | W |
|---|---:|---:|---:|---:|---:|
| love | 8.3 | 3.6 | 4.7 | 37 | 94 |
| hiring signals | 6.3 | 1.7 | 4.5 | 28 | 45 |
| deal hunting | 4.9 | 0.9 | 4 | 22 | 23 |
| ebr value deck builder | 4.2 | 0.4 | 3.9 | 19 | 10 |
| seo aeo desk | 6.3 | 2.6 | 3.6 | 28 | 69 |
| flora plant care log | 8.3 | 4.9 | 3.4 | 37 | 128 |
| apple search ads review | 7.6 | 4.4 | 3.2 | 34 | 115 |
| stills clips desk | 6.5 | 3.3 | 3.2 | 29 | 87 |
| outbound prospecting | 5.1 | 2 | 3.1 | 23 | 53 |
| site audit | 3.6 | 1.1 | 2.5 | 16 | 28 |
| deal inspector | 5.4 | 3 | 2.4 | 24 | 78 |
| pipeline pulse | 6.7 | 4.6 | 2.1 | 30 | 122 |
| company docs q a | 17.9 | 15.9 | 2 | 80 | 418 |
| talent discovery | 2.5 | 0.6 | 1.9 | 11 | 15 |
| customer call coach assistant | 2.9 | 1.1 | 1.8 | 13 | 30 |
| gtm prospecting | 2.5 | 0.7 | 1.7 | 11 | 19 |
| event request desk | 4.5 | 3.2 | 1.3 | 20 | 84 |
| recruiting coordinator | 3.1 | 2.1 | 1.1 | 14 | 54 |

### Elevated on wins

| Unit | loss% | win% | lift | L | W |
|---|---:|---:|---:|---:|---:|
| the morning newspaper | 7.6 | 15.3 | -7.8 | 34 | 404 |
| call follow ups | 5.4 | 12.1 | -6.8 | 24 | 319 |
| wtd | 8.7 | 15.1 | -6.4 | 39 | 398 |
| credit card max | 6.5 | 11.1 | -4.6 | 29 | 292 |
| copy humanizer | 8.9 | 13.1 | -4.2 | 40 | 345 |
| webby | 9.8 | 13.7 | -3.9 | 44 | 361 |
| office ops desk | 13.8 | 17.6 | -3.7 | 62 | 463 |
| paid media report desk | 2.7 | 5.6 | -2.9 | 12 | 148 |
| writing bot | 13.4 | 16.2 | -2.8 | 60 | 427 |
| cooper | 7.1 | 9.8 | -2.7 | 32 | 258 |
| tradbot | 3.8 | 6 | -2.2 | 17 | 159 |
| x brief | 5.8 | 7.9 | -2.1 | 26 | 209 |
| meeting recap deck | 7.8 | 9.8 | -2 | 35 | 259 |
| projects manager | 5.8 | 7.7 | -1.9 | 26 | 202 |
| imogen | 14.1 | 15.8 | -1.7 | 63 | 415 |
| nyc parent | 13.8 | 14.8 | -1 | 62 | 391 |
| sales call coach | 1.3 | 2.2 | -0.8 | 6 | 57 |
| gtm loop closer | 4.2 | 4.8 | -0.6 | 19 | 127 |

## Losses by opponent arch

| Arch | losses | elo Σ |
|---|---:|---:|
| glass_burst | 87 | -2104 |
| chip_snipe | 78 | -2045 |
| flamingo_pass | 56 | -1424 |
| hurt_revenge | 44 | -1090 |
| bulk_echo | 34 | -901 |
| backline_snipe | 32 | -856 |
| hype_battery | 25 | -546 |
| wake_chip | 20 | -518 |
| sustain | 20 | -498 |
| buff_suicide | 13 | -313 |
| echo_hype | 13 | -340 |
| grow_hype | 12 | -316 |
| ko_snowball | 10 | -228 |
| grow_scale | 3 | -67 |
| double_echo | 1 | -29 |

## Recent window (ts ≥ 2026-09-18T20:00Z ≈ 14:00 MT)

343 losses. Primary modes:

| Mode | n |
|---|---:|
| tip_soft_into_wall_arch | 199 |
| wrong_plan_arch_vs_ghost | 59 |
| wall_board_still_lost | 32 |
| no_teeth_vs_wall | 22 |
| tip_into_non_punish_arch | 12 |
| mirror_flamingo_echo | 10 |
| front_dies_before_teeth | 9 |

## Matchlog losses (fight winners + kits)

58 match_end=loss. Primary:

- `tip_soft_into_wall_arch`: 27
  - m_mu7w3d9j_3b49 vs xrealtimeeng arch=flamingo_pass board=`Product Support Inbox Assistant 3/6 | Stills & Clips Desk 2/5 | Luma Pages 3/5` fights=R0:them,R1:them
  - m_mu7w3jh6_727d vs xrealtimeeng arch=flamingo_pass board=`Pipeline Pulse 3/4 | Hiring Signals 4/2 | X Brief+h 2/4` fights=R0:them,R1:them
- `wall_board_still_lost`: 9
  - m_mu7wcsko_c585 vs devonphp arch=glass_burst board=`Cooper 2/5 | Writing Bot+h 2/5 | Writing Bot+h 2/5` fights=R0:them,R1:us,R2:them
  - m_mu7wgn7f_a29c vs bankkk_than arch=glass_burst board=`GTM Loop Closer+h 3/6 | X Brief+h 2/4 | WTD+h 3/4` fights=R0:draw,R1:them,R2:them
- `wrong_plan_arch_vs_ghost`: 7
  - m_mu7w9vrc_cc7c vs edtropic arch=chip_snipe board=`Office Ops Desk 3/5 | Recruiting Coordinator+h 3/5 | Writing Bot+h 3/6` fights=R0:them,R1:us,R2:them
  - m_mu7wb9dk_ba17 vs edtropic arch=chip_snipe board=`Nightly Audit Engineer+h 3/6 | Credit Card Max 3/4 | GTM Loop Closer+h 3/6` fights=R0:draw,R1:draw,R2:them
- `tip_into_non_punish_arch`: 7
  - m_mu7wh5y4_6358 vs aurinkern arch=hype_battery board=`Webby 4/6 | Site Audit+h 3/3 | Partnerships Call Coach 4/6` fights=R0:draw,R1:them,R2:them
  - m_mu7whmqg_0484 vs aurinkern arch=hype_battery board=`Webby 4/6 | Call Follow-Ups+h 3/4 | Product Support Inbox Assistant 3/6` fights=R0:draw,R1:them,R2:them
- `no_teeth_vs_wall`: 6
  - m_mu7witln_a2f9 vs theretardedelon arch=glass_burst board=`Recruiting Coordinator 3/5 | Call Follow-Ups+h 3/4 | Deal Inspector 4/4` fights=R0:draw,R1:them,R2:them
  - m_mu7wr25i_0d75 vs david_x_ai arch=glass_burst board=`Office Ops Desk+h 3/5 | Company Docs Q&A+h 2/6 | Company Docs Q&A+h 2/6` fights=R0:them,R1:us,R2:them
- `mirror_flamingo_echo`: 2
  - m_mu7w9pvg_f08b vs edtropic arch=flamingo_pass board=`NYC Parent 2/6 | Cooper+h 2/5 | Office Ops Desk 3/5` fights=R0:them,R1:them
  - m_mu7wbi4g_8de4 vs edtropic arch=flamingo_pass board=`Call Follow-Ups 4/5 | Meeting Recap Deck 3/4 | NYC Parent 2/6` fights=R0:them,R1:them

## Insufficient detail

Climb losses with neither board nor ghost: **0**. No causal mode assigned beyond `insufficient_detail`.

## Bottom line (evidence only)

1. **262/448 (58.5%)** losses show tip/soft units on our final board into a logged punish arch.
2. Same-FP splits and unit lift show wins concentrate on wall spines (Newspaper, Imogen, Ops, NYC, Cooper, WTD, Writing) while losses elevate tip names (Love, Stills, Outbound, Luma, Hiring Signals, Copy Humanizer, …).
3. Rematch farms in the table above dominate elo Σ bleed; several are 0–2 wins vs 7–15 losses.
4. Planner logs repeatedly show `recipeWhy=disabled` and `policy_v1+<arch>+…` while tip units still appear — tip_refuse not always present on losing shops.
5. Avg loss elo **-25.2** vs win **+5.0** — high WR does not imply positive climb.

---
Machine-readable aggregate: [`study/_current_loss_study_data.json`](_current_loss_study_data.json)
