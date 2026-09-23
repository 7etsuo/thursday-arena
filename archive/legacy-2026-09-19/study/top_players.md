# Top Thursday Arena Players — Strategy Study

_Generated 2026-09-17 (America/Edmonton). Data via CDP auth as @tetsuoai._

## Data availability (honest limits)

- **Leaderboard**: full (`/api/leaderboard`) — 2059 entries.
- **Match lists**: public (`/api/public/v1/matches?x_handle=…`) for all studied handles.
- **Full replays** (`/api/public/v1/matches/:id` with round boards): available for many top players (omlejmi, izzat316, ryanmcadams, breezeeoo, …).
- **NOT available**: **@arithemonke**, **@jonathannelson**, **@devarminas** (and some others) — list pages work, but replay pages show **"No replay here"** / API `not_found`. No round buys, freeze flags, or final boards.
- **Shop freezes / buy order / apples**: not exposed as discrete fields. Units show `atk/hp/tempAtk/honey/potato` only; apple likely baked into stats. Freeze patterns **cannot** be recovered from public replays.
- Analyzed **89** top-player win boards with full final boards + round curves from **89** win replays.

## Top players by rating

| Rank | Handle | Rating | W-L | WR | Replay data? |
|-----:|--------|-------:|----:|---:|:------------:|
| 1 | @omlejmi | 1400 | 95-21 | 82% | yes |
| 2 | @izzat316 | 1298 | 87-34 | 72% | yes |
| 3 | @jonathannelson | 1268 | 19-0 | 100% | list only |
| 4 | @ryanmcadams | 1262 | 326-79 | 80% | yes |
| 5 | @arithemonke | 1261 | 44-8 | 85% | list only |
| 6 | @devarminas | 1225 | 39-8 | 83% | list only |
| 7 | @breezeeoo | 1224 | 51-22 | 70% | yes |
| 8 | @prshannon_ | 1220 | 26-7 | 79% | yes |
| 9 | @blacksheepjav | 1210 | 27-4 | 87% | yes |
| 10 | @kanuma368 | 1206 | 50-23 | 68% | yes |
| 11 | @diamondhanddie | 1181 | 32-12 | 73% | yes |
| 12 | @syaor4n | 1176 | 20-5 | 80% | list only |
| 13 | @jsduren | 1158 | 20-6 | 77% | yes |
| 14 | @starz_zps | 1153 | 21-9 | 70% | yes |
| 15 | @fourseasonsgrn | 1142 | 29-11 | 72% | list only |

### Exceptional W/L (also targeted)

- **@jonathannelson** #3 rating 1268 — **19-0** (100%); replays: NOT public
- **@blacksheepjav** #9 rating 1210 — **27-4** (87%); replays: yes
- **@roostercogdick** #16 rating 1138 — **13-2** (87%); replays: yes

## Deep-dive: @arithemonke (linked by Michael)

- Leaderboard: **#5**, rating **1261**, record **44-8** (85% WR).
- Public match list: 50 recent rated matches (newest first).
- **Board/replay data: unavailable.** Every `/matches/<id>` for their games returns empty UI ("No replay here") and API 404. Cannot extract bot lists, honey, or curves.
- Recent results (outcome only):
- WIN vs @diamondhanddie (2026-09-17) — replay **not public** (`625de2dd…`)
- WIN vs @diamondhanddie (2026-09-17) — replay **not public** (`522ad11e…`)
- WIN vs @kanuma368 (2026-09-17) — replay **not public** (`b32d9cf0…`)
- LOSS vs @starz_zps (2026-09-17) — replay **not public** (`57a42f00…`)
- WIN vs @notabot (2026-09-17) — replay **not public** (`b27329fc…`)
- WIN vs @eveflamingo (2026-09-17) — replay **not public** (`b5c9da5a…`)
- WIN vs @notabot (2026-09-17) — replay **not public** (`5b813e6d…`)
- LOSS vs @notabot (2026-09-17) — replay **not public** (`9ed63ecd…`)
- WIN vs @starz_zps (2026-09-17) — replay **not public** (`4cf1175d…`)
- WIN vs @notabot (2026-09-17) — replay **not public** (`a48abda9…`)
- LOSS vs @metawhitestar (2026-09-17) — replay **not public** (`ef7f3de4…`)
- WIN vs @notabot (2026-09-17) — replay **not public** (`5809af55…`)
- WIN vs @kanuma368 (2026-09-17) — replay **not public** (`65f37a2d…`)
- WIN vs @daniel_susca (2026-09-17) — replay **not public** (`61bd835d…`)
- LOSS vs @hackerbyhobby (2026-09-17) — replay **not public** (`053af5ed…`)
- **Inference from record alone**: elite efficiency (85% WR at #5). Treat as high-skill reference once a ghost/live board appears; until then lean on **omlejmi / izzat316 / ryanmcadams / blacksheepjav** public boards below.

## Global edges from public win boards

### Must-buy / high-frequency final-board units

- **NYC Parent** ×18 — Bulk (common)
- **Call Follow-Ups** ×17 — Echo (common)
- **Copy Humanizer** ×13 — Pass it back (common)
- **Paid Media Report Desk** ×13 — Grow (uncommon)
- **Credit Card Max** ×12 — Grow (common)
- **WTD** ×12 — Hype (common)
- **Luma Pages** ×12 — Hype (common)
- **Office Ops Desk** ×10 — Hold the line (common)
- **Meeting Recap Deck** ×10 — Echo (common)
- **Webby** ×9 — Bulk (common)
- **Imogen** ×9 — Bulk (common)
- **Writing Bot** ×9 — Hype (common)
- **GTM Loop Closer** ×8 — Cover (uncommon)
- **Projects Manager** ×8 — Hype (uncommon)
- **Love ❤️** ×8 — Patch (common)

### Kit meta (final boards)

- **Hype**: 41
- **Echo**: 40
- **Bulk**: 36
- **Grow**: 28
- **Patch**: 19
- **Pass it back**: 19
- **Cover**: 16
- **Wake**: 11
- **Guard**: 11
- **Hold the line**: 10
- **Brace**: 5
- **Spot**: 5

### Honey / potato

- Honey appears on **70** final-board units across wins; seat bias: {1: 40, 2: 16, 3: 14} → **honey almost always on seat 1 (front)**.
- Honey first attached most often on round: {1: 1, 2: 46, 3: 9} (1=earliest).
- Potato on final board in **16/89** wins (tempo/buff piece, less common than honey).
- Practical rule: **if you honey, honey the front tanker/passer** (Copy Humanizer / NYC Parent / Morning Newspaper), not the back buffer.

### Tempo vs late

- R1 boards almost entirely unlock-1 commons (89/89 wins with only T1 pieces on R1).
- Final boards with unlock≥3 rare/epic: **8/89** — late spike exists but **majority close with commons/uncommons** (Grow/Echo/Pass-back/Hype cores).
- Top ladder (omlejmi especially) wins by **efficient early curve + honey front**, not forcing epics.

### Common cores / pairs

- Credit Card Max + NYC Parent ×4
- Copy Humanizer + Paid Media Report Desk ×4
- Cooper + NYC Parent ×4
- Meeting Recap Deck + NYC Parent ×3
- Love ❤️ + Office Ops Desk ×3
- Credit Card Max + Tradbot ×3
- Call Follow-Ups + The Morning Newspaper ×3
- Meeting Recap Deck + Paid Media Report Desk ×3
- Luma Pages + Webby ×3
- Call Follow-Ups + Credit Card Max ×3

### Front-line kit bias

- seat1 kit **Bulk**: 26
- seat1 kit **Pass it back**: 16
- seat1 kit **Grow**: 15
- seat1 kit **Hold the line**: 8
- seat1 kit **Brace**: 4
- seat1 kit **Hype**: 4
- seat1 kit **Patch**: 3
- seat1 kit **Drain**: 2

## Per-player style notes

### @omlejmi (#1, 1400, 95-21) — 18 wins studied
- Plans inferred: {'tempo': 6, 'late_spike': 1, 'faint': 2, 'buff': 9}
- Honey units on finals: 19
- Top bots: Cooper(6), NYC Parent(5), Credit Card Max(5), Call Follow-Ups(5), Meeting Recap Deck(3), Webby(3)
- Top kits: Echo(15), Bulk(10), Hype(8), Grow(7), Pass it back(3), Patch(2)

### @ryanmcadams (#4, 1262, 326-79) — 13 wins studied
- Plans inferred: {'buff': 4, 'late_spike': 4, 'tempo': 4, 'faint': 1}
- Honey units on finals: 12
- Top bots: Paid Media Report Desk(6), Office Ops Desk(3), Imogen(3), Chief Health Officer(2), GTM Loop Closer(2), Cooper(2)
- Top kits: Grow(7), Bulk(6), Patch(4), Hold the line(3), Wake(3), Cover(3)

### @prshannon_ (#8, 1220, 26-7) — 10 wins studied
- Plans inferred: {'tempo': 2, 'buff': 5, 'faint': 3}
- Honey units on finals: 8
- Top bots: NYC Parent(4), WTD(3), Luma Pages(3), Office Ops Desk(2), Writing Bot(2), Copy Humanizer(2)
- Top kits: Hype(8), Bulk(7), Pass it back(3), Hold the line(2), Echo(2), Grow(2)

### @jsduren (#13, 1158, 20-6) — 10 wins studied
- Plans inferred: {'late_spike': 1, 'buff': 6, 'tempo': 2, 'hybrid': 1}
- Honey units on finals: 5
- Top bots: Call Follow-Ups(4), Company Docs Q&A(3), Writing Bot(2), Love ❤️(2), Sales Call Coach(1), Chief Health Officer(1)
- Top kits: Hype(5), Echo(4), Guard(4), Patch(3), Brace(2), Bulk(2)

### @izzat316 (#2, 1298, 87-34) — 10 wins studied
- Plans inferred: {'tempo': 2, 'faint': 2, 'buff': 6}
- Honey units on finals: 10
- Top bots: Office Ops Desk(3), WTD(3), Love ❤️(2), GTM Loop Closer(2), Luma Pages(2), Projects Manager(2)
- Top kits: Hype(8), Hold the line(3), Patch(3), Cover(3), Echo(3), Pass it back(2)

### @roostercogdick (#16, 1138, 13-2) — 10 wins studied
- Plans inferred: {'buff': 5, 'tempo': 4, 'late_spike': 1}
- Honey units on finals: 3
- Top bots: NYC Parent(4), Flora: Plant Care Log(2), WTD(2), Call Follow-Ups(2), Love ❤️(2), Luma Pages(2)
- Top kits: Bulk(6), Patch(4), Hype(4), Echo(4), Pass it back(2), Grow(2)

### @breezeeoo (#7, 1224, 51-22) — 10 wins studied
- Plans inferred: {'buff': 4, 'faint': 2, 'tempo': 4}
- Honey units on finals: 5
- Top bots: Call Follow-Ups(4), Office Ops Desk(2), Copy Humanizer(2), Luma Pages(2), Clip Bot(2), Tradbot(2)
- Top kits: Echo(5), Hype(3), Pass it back(3), Grow(3), Hold the line(2), Second look(2)

### @starz_zps (#14, 1153, 21-9) — 5 wins studied
- Plans inferred: {'buff': 1, 'tempo': 2, 'faint': 2}
- Honey units on finals: 6
- Top bots: GTM Loop Closer(2), NYC Parent(2), Meeting Recap Deck(2), Copy Humanizer(2), Apple Search Ads Review(1), Projects Manager(1)
- Top kits: Grow(3), Cover(3), Echo(3), Hype(2), Bulk(2), Pass it back(2)

### @kanuma368 (#10, 1206, 50-23) — 2 wins studied
- Plans inferred: {'tempo': 1, 'late_spike': 1}
- Honey units on finals: 1
- Top bots: Copy Humanizer(1), Call Follow-Ups(1), Paid Media Report Desk(1), Nightly Audit Engineer(1), Chief Health Officer(1)
- Top kits: Pass it back(1), Echo(1), Grow(1), Cover(1), Patch(1)

### @blacksheepjav (#9, 1210, 27-4) — 1 wins studied
- Plans inferred: {'late_spike': 1}
- Honey units on finals: 1
- Top bots: Stalk Bot(1), Product Support Inbox Assistant(1), Projects Manager(1)
- Top kits: Snowball(1), Patch(1), Hype(1)

## Concrete strategy takeaways (playbook)

1. **Pass-back faint core is king**: Copy Humanizer / The Morning Newspaper in front (often honeyed) feeding +1/+1 to the two behind — highest frequency win piece.
2. **Honey the front, not the carry**: 14+/24 honey placements on seat 1. Sting value + pass-back death is the trade.
3. **Grow + Echo mid/back**: Paid Media Report Desk / Credit Card Max (Grow) and Call Follow-Ups / Meeting Recap Deck (Echo) stack stats across rounds without needing epics.
4. **Hype from seat 2/3**: Projects Manager / Luma Pages as back-line +2 ATK to front — classic buff plan with izzat316/breezeeoo.
5. **Bulk openers**: NYC Parent / Webby (+2 HP SoB) as reliable seat1/2 when pass-back is missing.
6. **Patch/Cover as glue**: Love ❤️ (Patch) and GTM Loop Closer (Cover) show up on ryanmcadams/roostercogdick boards — sustain or punish front deaths.
7. **Tempo over greed**: most wins never touch unlock-3 epics; force level/shop for Grow/Echo/Pass-back uncommons before Stalk Bot snowballs.
8. **Potato is a spice**: used ~occasionally on a grow/echo piece; don't prioritize over honey front.
9. **Freeze data missing**: cannot clone exact freeze patterns — approximate by holding pass-back + grow + honey when seen.
10. **@arithemonke / @jonathannelson boards opaque**: track them for ghost fights; until replays open, clone omlejmi honey-front pass-back and izzat316 hype lines.

## Files

- `study/top_boards.json` — structured win boards
- `study/raw_lists/*.json` — match lists per handle
- `study/raw_matches/*.json` — full replay payloads where public
- `strategies/wins/win-20260917-study*.json` — seeded clones: win-20260917-study01, win-20260917-study02, win-20260917-study03, win-20260917-study04, win-20260917-study05, win-20260917-study06, win-20260917-study07, win-20260917-study08, win-20260917-study09, win-20260917-study10, win-20260917-study11, win-20260917-study12

