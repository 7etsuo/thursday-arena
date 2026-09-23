# ENGB — Thursday Arena battle engine and historical audit

**Reading this report:** The findings and measurements below describe the bot audited on
2026-09-19, before the rewrite. References to missing code or an absent battle model are historical.
The active implementation is [`lib/sim.js`](../lib/sim.js), and `test/sim.test.js` checks winners
for all **10,748** battles in `data/corpus/battles.jsonl`. The original frame-exact audit covered
10,065 battles. That evidence and the report's 81-bot catalog refer to Seasons 1 and 2. The
live catalog now has 179 bots and 19 items. [Season 3 notes](SEASON3.md) cover the new crews,
captains, equipment, and validation limits. The original audit below does not establish full
Season 3 simulator accuracy.

**Season 1/2 replay update (2026-09-20):** Of 5,454 new battle events with complete inputs, all
winners and frame states agree with the current simulator after `book.inferGhost` accepts the
new opening caption and `sim` clears stale knock-out credit on Hot seat damage. Four archive
battle events had previously missed enemy honey; all four boards were already outside the
book's five-board retention window, so no retained book stamp required relocation. The
[official rules](https://thursdayarena.com/rules.md) specify total HP, then ATK, at the
40-exchange cap; the simulator now implements this, but no recorded battle reached that cap.

Scope: reverse-engineer the battle rules from the game client plus recorded server battles, build a faithful
simulator, validate it, and list every place where the repo's game model contradicts the engine.
All paths below are absolute, or relative to `/home/tetsuo/grok/thursday-arena` for repo files.
Scratch root: `/tmp/user/1000/claude-1000/-home-tetsuo-grok-thursday-arena/06183e91-c69d-4347-9358-42776c52875a/scratchpad` (`$S` below).

---------------------------------------------------------------------------------------------------------
## 0. Headline

* **The battle engine is fully solved and fully deterministic.** `$S/engine/sim.js` reproduces **10,065 of
  10,065** recorded server battles **frame for frame**: every caption and every unit's ATK/HP in every frame.
  The set is 9,314 S1 and 452 S2 battles of our own, plus 299 public replays of other players. PROVEN.
  - 10,030/10,065 (99.65%) reproduce using only the honey that can be read off the frames. The other 35 need a
    search over the ghost's honey, because frames never show honey. 19 S2 battles also need a search over seat
    rules, because their match was split across two climb log files.
* **There is no battle RNG in practice.** The server seeds every rated battle with the constant **101 / 202 / 303
  for round 0 / 1 / 2**. These are the same constants the client's practice reducer uses
  (`1ou4egaetj-op.js` @38161: `let r=[101,202,303]`). Every reproduced battle, ours and other players', matches
  with those seeds, and no other seed ever matched a battle those seeds failed on. So the outcome is a pure
  function of (our board, their board, round, seat rules). PROVEN.
* **At audit time, the repo had no battle model.** It used kit heuristics instead (`lib/counters.js` effectiveThreat /
  frontEhp / frontDiesTo, and `play_loop.js` seatBoard / frontSeatScore).
  - The heuristic "threat" equals the enemy front's real ATK at first contact in only **74.1% [73.2, 75.0] of
    9,314 battles**.
  - Just re-seating the **same three units** with an engine-chosen order raises the S1 battle score (W=1, D=0.5)
    from **0.720 to 0.791** (n=9,287). The order was picked against a pool of other same-round enemy boards,
    not with hindsight of the real opponent.
  - In S2 the same re-seating goes from **0.418 to 0.545** once seat rules are modelled (n=434).
* **Season 2 went live at 2026-09-19 07:00Z** (changelog in `1iil01q93t0nb.js` @15491). It brought seat rules
  and 8 launch bots; the audited bot modelled neither.
  - `catalog.json` has 72 of 80 bots. S2 bots reach the planner as a raw botId with `kitId: null` (191 offers).
  - S2 record since the change: **52 W / 102 L / 24 D**, a 29.2% [23.0, 36.3] match win rate, against 43.0%
    [38.2, 47.9] over the last 400 S1 matches.
* Three kit/food "facts" in the repo are simply wrong:
  - **potato** is +2 ATK for one battle only, not a permanent +1/+1, and it erases honey.
  - **mosquito** hits a *random* enemy (seeded), not the enemy front.
  - **honey** is not +2 HP. It is a separate 1/1 Drone that appears after the unit faints.

---------------------------------------------------------------------------------------------------------
## 1. What the client source actually contains

| Chunk | What is there | Relevance |
|---|---|---|
| `1ou4egaetj-op.js` module 59427 (@~29000–34800) | `KITS` table with 14 legacy "practice" kits (ant, beaver, cricket, duck, horse, mosquito, otter, pig, crab, dodo, flamingo, hedgehog, peacock, rat), `randStep` (mulberry32), `simulateBattle(you, them, seed)` | The **skeleton** of the server engine. The rated server runs the same skeleton with more kits. |
| same file, module 64797 | `ROSTER`, `OPPONENT_BOARDS` (3 fixed practice boards) | Practice/tutorial only |
| same file, module 74098 (@~38100–43900) | `sapMatchReducer` (buy/sell/reroll/feed/freeze/move/endShop/battleDone), constants `GOLD_PER_SHOP 10, REROLL_COST 1, SELL_REFUND 1, FOOD_COST 3, SHOP_PET_SLOTS 3, TEAM_SIZE 3`, `offerCost` 3..6 (default 3), `alreadyHasBoost`, battle seeds `r=[101,202,303]` | The client uses it to predict shop actions optimistically (`3au66v6lwsg27.js`: `u(t,e)` calls `sapMatchReducer` for buy/sell/feed/move/freeze). `endShop` and `battleDone` go to the server. |
| `1ou4egaetj-op.js` module 60145 | zod schemas: arena state has `seed`, `seats {front,middle,back}`, `seatShop[3] {seat, revealed, name, text}`, `lastSeen`, board unit `{uid, botId, atk, hp, tempAtk, honey, potato?}`; frame unit `{name, atk, hp}` (**no honey, no kit**) | Seat rules are exposed in the state the bot already receives |
| `3q0na6c5idq7f.js` module 78459 (@465 pretty) | embedded catalog of **80 bots** at audit time (72 S1 plus 8 S2), with kitId/kitText/stats/cost/unlockTurn. Extracted to `$S/audit/engb/client_catalog.json` and `$S/engine/catalog.json` | Historical snapshot; the active `data/catalog.json` now has 81. |
| `3q0na6c5idq7f.js` module 38959 | label map of 26 kit words (`backtap, brace, bulk, cover, drain, dump, echo, first_seat, grow, guard, hold_the_line, hype, last_word, pass_it_back, patch, pin, poke, scout, second_look, sidestep, snowball, spite, spot, spotlight, sting, wake`) | `brace, pass_it_back, poke, scout, second_look, spot` are used by **no** bot (label ids / ability names) |
| `3q0na6c5idq7f.js` @50987 / @51106 | card marks: "Honey: faint summons a 1/1 Drone", "Potato: +2 attack this round" | The game's own UI already says potato is +2 attack this round |
| `2yjqnsbsdx9j5.js` @6539 | "Seat rules · both teams", "one more each round", "Shows in round N" | S2 seat rules UI |
| `1iil01q93t0nb.js` | changelog: "Both teams down is a draw" (09-17), "Season clock … 12:00 AM PT … every rating resets to 1000", "Season 2: 8 new fighters", "Season 2: seat rules: Each match draws a rule for each seat. The shop shows one more each round, and each rule acts on both teams." (09-19) | S2 start = 07:00Z |

The rated battle engine itself is **not** shipped to the browser. The rated kits (bulk, hype, echo, and the
rest) appear only as text. Every rule in §2 that is not in the practice KITS table was therefore
reverse-engineered from recorded server frames: 192,841 frames with captions. Every caption in the dataset
matches one of the templates below, with 0 unmatched (`caption_counts.py`). Each rule was then confirmed by
frame-exact replay (§4).

### 1.1 The client's `simulateBattle`, de-minified (verbatim logic, names restored)

```js
function simulateBattle(you, them, seed) {
  let s = seed; const rnd = () => { const r = randStep(s); s = r.seed; return r.value; };   // mulberry32
  const st = { you: you.map(u => ({...u, fainted:false})), them: them.map(u => ({...u, fainted:false})) };
  const frames = []; const frame = cap => frames.push({ you: snap(st.you), them: snap(st.them), caption: cap });
  const byAtk = list => { const key = new Map(list.map(u => [u, rnd()]));          // ONE rnd() per element, in list order
                          return [...list].sort((a,b) => b.atk - a.atk || key.get(a) - key.get(b)); };
  const summon = (side, idx, spec) => { if (st[side].length >= 3) return;               // silently dropped when full
      const a = {...spec, kitId:null, honey:false, fainted:false}; st[side].splice(Math.min(idx, st[side].length), 0, a);
      frame(side==='you' ? `${a.name} joins your side` : `${a.name} joins the enemy side`);
      for (const n of byAtk(st[side])) if (n!==a && kit(n)?.trigger==='friendSummoned') { a.atk += 1; frame(...) } };
  const hit = (list, cap) => { const survivors = [];
      for (const {unit, amount} of list) { unit.hp -= amount; if (unit.hp > 0) survivors.push(unit); }   // hp may go negative
      frame(cap);
      for (const u of byAtk(survivors)) if (kit(u)?.trigger==='hurt' && u.hp>0) { u.atk += kit(u).effect.amount; frame(`${u.name} takes it personally: +${n} ATK`); }
      for (;;) { const dead = [...st.you, ...st.them].filter(u => u.hp<=0 && !u.fainted); if (!dead.length) return;
                 const u = byAtk(dead)[0]; u.fainted = true; const side = sideOf(u), idx = st[side].indexOf(u);
                 st[side].splice(idx,1); frame(`${u.name} is knocked out`); onFaint(u, side, idx); } };
  const onFaint = (u, side, idx) => { /* faint kit: buffRandomFriends | buffNearestBehind (slice(idx, idx+2)) | summon | damageEveryone */
      if (u.honey) summon(side, idx, {name:'Drone', atk:1, hp:1}); };
  frame('The teams square up');
  for (const u of byAtk([...st.you, ...st.them].filter(u => kit(u)?.trigger==='startOfBattle'))) {   // sorted ONCE
      if (u.hp<=0 || u.fainted) continue; /* snipeRandomEnemies | gainHealthPercentOfHealthiest | giveAttackPercentAhead */ }
  let x = 0;
  while (st.you.length && st.them.length && x < 40) { x++; const A = st.you[0], B = st.them[0];
      hit([{unit:A, amount:B.atk}, {unit:B, amount:A.atk}], `${A.name} and ${B.name} trade: -${B.atk} HP / -${A.atk} HP`); }
  const winner = !st.you.length && !st.them.length ? 'draw' : !st.them.length ? 'you' : !st.you.length ? 'them' : 'draw';
  frame(winner==='draw' ? 'Both sides are down. Draw' : winner==='you' ? 'Your side holds the floor' : 'The enemy side holds the floor');
  return { frames, winner };
}
```

`endShop` in the practice reducer passes `atk: e.atk + e.tempAtk` (@~42300). `battleDone` resets every board
unit to `tempAtk: 0, potato: false`, sets gold back to 10, and ends the match when either side has 2 wins or
when `round === 2` (@42546–42803).

---------------------------------------------------------------------------------------------------------
## 2. The server battle rules (original 10,065-battle frame audit unless marked)

### 2.1 Inputs
* Each side sends up to 3 units `{name, kitId, atk, hp, honey}`, index 0 first ("front"). The server fights with
  `atk = board.atk + tempAtk`, where potato gives tempAtk +2. HP is the board HP. PROVEN: in 1,125 of 26,373
  unit-battles, frame-0 ATK was board ATK + 2 and HP was unchanged. It was never +1/+1.
* Battle damage never carries over. The board keeps its shop stats across rounds, and honey persists. After each
  battle `tempAtk` returns to 0 and the potato flag is cleared.
* **RNG**: mulberry32 `randStep`, seeded with **101 / 202 / 303 for round 0 / 1 / 2**, the same for every player
  and match. RNG is consumed only by:
  - `byAtk(list)`: one draw per element, keyed in list order. Ties on ATK are broken by these keys.
  - `pickRandom`: one draw per pick. mosquito is the only rated kit that uses it.

  Because the seed is fixed, even "random" results can be predicted exactly.

### 2.2 Start of battle (SoB)
1. Frame `The teams square up`.
2. **Seat rules (S2)**, applied to both teams:
   - Seats are processed in order front, middle, back. Within each seat, you before them.
   - Seat unit: front = index 0, middle = index 1, **back = last index**.
   - Only seats `0..round` are active: round 0 = front, round 1 = +middle, round 2 = +back.

   PROVEN: across 180 round-0 battles, SoB rules fired on seat 0 only.

   | Rule | Caption | Effect |
   |---|---|---|
   | Spotlight | `Spotlight: X +2 ATK` | +2 ATK at SoB |
   | Pit stop | `Pit stop: X +3 HP` | +3 HP at SoB |
   | Warm-up | `Warm-up: X +1/+1` | +1/+1 at SoB |
   | Encore | `Encore: X` (printed only if X has a SoB kit) | X's SoB kit fires **twice**, back to back, at its turn in the SoB order |
   | Hot seat | `Hot seat: X -1 HP` | Before every exchange **except the first**, each unit currently in that seat loses 1 HP. This is a direct HP loss: no hurt triggers, Hard hat does not reduce it, and faints are resolved after the whole batch. |
   | Hard hat | `Hard hat: X takes 1 less` (frame after the damage frame) | Every damage instance to a unit in that seat (trade, snipe, sting, spite, last word) is reduced by 1, **only if it is 2 or more** (minimum 1). 1-damage hits are unchanged and print nothing. |

   Seat binding is **positional and live**: after deaths, whoever currently holds the seat gets the rule. A lone
   survivor is front and back at once. With two units, index 1 is both middle and back. The alternative
   "back = index 2" model reproduces only 94.5% of S2 battles (`--hyp backIsIndex2=true`).
3. **Kit SoB triggers**:
   - All SoB-kit units of both sides, `[...you, ...them]`, are sorted **once** by current ATK descending, with
     seeded tie-breaks. Seat-rule buffs are already applied at this point.
   - Processed in that order. A unit is skipped if dead (hp ≤ 0 or fainted).
   - ATK changes during SoB do **not** re-sort the list. Every position lookup ("ahead", "front", "same seat",
     "last") uses the line as it is at that moment, so an earlier first_seat move or SoB kill changes later
     targets.

### 2.3 Every kit id (trigger → effect → caption; count = captions in dataset)

| kitId | Trigger | Exact effect | Caption (n) | Repo text claims |
|---|---|---|---|---|
| bulk | SoB | self +2 HP | `X bulks up: +2 HP` (8,266) | ok |
| hype | SoB | **line[0] +2 ATK. That is the current front, which can be the hype unit itself.** Multiple hypes stack. | `X juiced Y: +2 ATK` (6,326) | "never seat0 hype" is wrong |
| dodo | SoB | friend directly **ahead** gets `floor(atk*50/100)` ATK; no effect at index 0 | `X hypes Y: +N ATK` (846) | repo treats dodo at seat0 as buffing mid |
| dump | SoB | friend ahead gets `floor(atk/2)`, then dump faints (hp=0 → faint loop, including its honey Drone). At index 0 it **faints and gives nothing**. The `hands` frame comes *after* `is knocked out`. | `X hands Y +N ATK` (131) | — |
| guard | SoB | friend directly ahead +2 HP; **nothing at index 0** | `X pads Y: +2 HP` (1,431) | repo lists guard as a front kit |
| mosquito | SoB | 1 damage to a **random** enemy (`pickRandom`, seeded). The kitText "enemy front" is wrong. | `X snipes Y for 1` (4,230) | repo says enemy front |
| pin | SoB | 1 damage to the enemy at the same index, if one exists | `X pins Y: 1` (2,161) | ok |
| sidestep | SoB | 1 damage to enemy index 1, if one exists | `X sideswipes Y: 1` (2,741) | ok |
| backtap | SoB | 1 damage to the last enemy | `X clips Y: 1` (1,113) | ok |
| last_word | SoB, **only if self is last** | 3 damage to the last enemy | `X has the last word: 3 to Y` (394) | "back" = last, so it fires for a lone unit or index 1 of 2 |
| spotlight (kit) | SoB, **only if self is index 0** | 2 damage to enemy index 0 | `X takes the spotlight: 2 to Y` (62) | inert elsewhere (0 of 85 off-front) |
| first_seat | SoB | move self to index 0 (the caption prints even if it is already front) | `X takes first seat` (2,602) | ok |
| reach_check (S2) | SoB | enemy with the highest ATK (`byAtk`, seeded tie) gets -2 ATK, floored at 0 | `X flags Y: -2 ATK` (43) | unknown kit in repo |
| route (S2) | SoB (back) | Each other friend +1/+1; the route unit itself gets no buff. Confirmed from later live frames and `test/sim.test.js`. | `X routes the work: +1/+1 to each friend` | unknown kit at audit time |
| red_flag (S2; DeckLens) | SoB | Enemy with the highest ATK loses up to 3 ATK, floored at 0. Added after the original audit; checked against later live behavior in `test/sim.test.js`. | `X flags Y: -N ATK` | absent from the 80-bot audit catalog |
| grow | before each exchange, if at front | +1/+1. Both fronts, **you first then them (no RNG)** | `X grows into the swing: +1/+1` (4,433) | ok |
| echo | the unit directly behind an attacker, recorded at attack time | +1/+1, applied **after** the exchange's hurt/faint resolution, you then them, if still alive | `X echoes the swing: +1/+1` (12,968) | docs put it before hurt |
| wake | same as echo | 1 damage to the *current* enemy front, via hit() so it has hurt effects | `X wakes on the swing: 1 to Y` (3,626) | same |
| peacock | hurt (survived damage > 0) | +3 ATK, once per hurt event, stacking (our snipes on it count too) | `X takes it personally: +3 ATK` (491) | repo adds +3 once, unconditionally |
| sting | hurt | 2 damage to enemy line[0], even if that unit is already at ≤0 HP and not yet removed | `X stings Y: 2` (355) | ok |
| hold_the_line | hurt, **only while at index 0** | +1 HP | `X holds: +1 HP` (2,542) | ok |
| patch | the friend directly ahead is hurt and survives | that friend +1 HP | `X patches Y: +1 HP` (3,238) | ok |
| flamingo | faint | the next 2 units behind (`slice(idx, idx+2)`) +1/+1 | `X rallies Y: +1/+1` (4,531) | ok |
| spite | faint | 2 damage to enemy line[0] via hit() | `X pokes Y: 2` (789) | ok |
| keep_open (S2) | faint | summon a 1/1 "Open Loop" at the fainted index | `Open Loop joins …` (16) | unknown kit |
| recall (S2) | faint | the friend now at the fainted index (previously behind) gets +ATK equal to the fainted unit's ATK | `X passes its memory to Y: +N ATK` (8) | unknown kit |
| caffeinate (S2) | lethal hit (once) | Stays at 1 HP; the trade frame already shows 1 HP, followed by `stays awake`. Checked against later live behavior in `test/sim.test.js`. | `X stays awake: 1 HP` | unknown kit at audit time |
| cover | the friend directly ahead faints | +2 ATK | `X covers the fall: +2 ATK` (876) | ok |
| herd (S2) | the friend directly ahead faints (once) | summon a 2/2 "Agent" at that index | `Agent joins …` (3) | unknown kit |
| snowball | the unit that dealt the last damage to a fainting enemy, if still alive | +2/+2 | `X snowballs the knock-out: +2/+2` (200) | ok |
| drain | same KO credit | +2 HP | `X drains the knock-out: +2 HP` (30) | ok |
| bloom, hand_off (S2) | buy / sell (shop) | random friend(s) +1/+1 in the shop | — | unknown kit |
| honey (food) | faint | a 1/1 Drone (no kit) is inserted at the fainted index, if the side has fewer than 3 units | `Drone joins your side/the enemy side` (5,251) | repo models it as +2 HP |

### 2.4 Exchange loop (at most 40 exchanges; the observed maximum is 13)
```
turn++ ; if turn>1: Hot seat batch (S2)
grow: you-front then them-front (no RNG)
behind := {you: you[1], them: them[1]}        // captured BEFORE the trade
hit([you0 <- them0.atk, them0 <- you0.atk], "A and B trade: -a HP / -b HP")   // simultaneous
   └ Hard hat frames → hurt: S = byAtk(all survivors of this hit)            // RNG: |S| draws
       pass 1: for u in S: own hurt kit (peacock / sting / hold_the_line@front)   // sting recurses into hit()
       pass 2: for u in S: patch directly behind u heals u
   └ faint loop: while dead: x = byAtk(dead)[0]; remove; "x is knocked out";
         (1) x's own faint kit (flamingo / spite / keep_open / recall)
         (2) honey → Drone at x's index
         (3) the unit that stood directly behind x at the moment of faint: cover +2 ATK / herd Agent
         (4) KO credit: killer = last damage source (if alive, enemy side): snowball / drain
echo/wake for behind.you then behind.them (skip if dead)                     // no RNG
```
Order evidence: the alternative orderings each lose exact matches (`hypscore.js`):
- hurt reactors sorted as their own list: 80.2%
- echo/wake sorted by ATK: 86.5%
- grow sorted by ATK: 97.1%
- the adopted model: 100%

### 2.5 End, draws, series
* Empty lines decide most winners: both empty is a draw. The current official rule at 40
  exchanges compares remaining total HP, then remaining total ATK, then declares a draw. The
  historical 10,065-battle audit never reached that cap. 1,275 battles (12.7%) were mutual-KO draws.
* **A match is at most 3 rounds**, because the reducer stops at `round === 2`. Draw rounds use up a round.
  Our final scores (n=3,989): 2-0 ×2298, 2-1 ×500, 0-2 ×472, **1-1 draw ×310**, 1-2 ×224, **1-0 win ×108**,
  **0-1 loss ×65**, **0-0 draw ×12**.

### 2.6 Shop and food rules that affect battles (client reducer; confirmed on the server by our logs)
* Gold resets to 10 every shop. Buy costs `cost` (3..6), sell refunds 1, reroll costs 1, feed costs 3.
* Feed:
  - apple: permanent +1/+1.
  - honey: `honey=true`, `potato=false`, and if the unit had potato, tempAtk -2.
  - potato: `potato=true`, **`honey=false`**, tempAtk +2 unless it already had potato.
  - `alreadyHasBoost` rejects honey on a honeyed unit and potato on a potato unit (HTTP 400 `invalid_action`).
    In our logs, **78** potato feeds were rejected this way.
* In our logs **74** potato feeds turned honey off (target had `+honey` before the feed and not after). No potato
  feed out of 1,141 ever changed permanent ATK/HP.

---------------------------------------------------------------------------------------------------------
## 3. The active simulator: `lib/sim.js`

CommonJS, no dependencies. It keeps the client skeleton's closure structure; the original minified names are
listed in the header comment.
```js
const sim = require('./lib/sim'); // run from the repository root
const us   = [sim.unitFromCatalog('Imogen'), sim.unitFromCatalog('Meeting Recap Deck', {food:'honey'}), sim.unitFromCatalog('WTD')];
const them = [sim.unitFromCatalog('Tech Demos'), sim.unitFromCatalog('Imogen'), sim.unitFromCatalog('Video Edit Desk')];
const seats = { front: 'hard_hat', middle: 'encore' };
sim.simulate(us, them, { round: 0, seats }); // -> {winner:'us'|'them'|'draw', frames, turns}
sim.outcome(us, them, { round: 1 });                    // fast (~6 µs), no frames
sim.bestSeating(us, [them], { round: 2, seats });       // every distinct seat order scored vs the pool, best first
sim.unitFromCatalog('X High Coach', { food: 'potato' }); // {name, kitId:'reach_check', atk:4, hp:4, honey:false}
```
* The seed defaults to `ROUND_SEEDS[round]` (101/202/303), matching the live server. `opts.seed` exists only
  for experiments.
* Seat rule ids: `spotlight | pit_stop | warm_up | encore | hot_seat | hard_hat`. The bot can read them from
  `state.seats` (all three) or `state.seatShop` (revealed ones).
* `unitFromCatalog` read the active `data/catalog.json`, then 81 bots. Potato adds +2 ATK
  and clears honey; apple adds +1/+1 (apples:N stacks).
* `opts.seed` is available for experiments. The active simulator does not expose the audit's
  rejected-model `opts.hyp` switch.

---------------------------------------------------------------------------------------------------------
## 4. Validation

The table below preserves the **original audit**. The active `test/sim.test.js` also checks
winner agreement for **10,748 / 10,748** recorded battles, including 1,018 later S2 battles; it
does not replay every frame for all 10,748 rows.

Data: `$S/audit/engb/battles.jsonl` (`extract_battles.py`). It combines 9,766 `endShop` battle frame logs from
`matches/climb/*.log` (9,314 S1 and 452 S2) with 299 rounds from `study/raw_matches/*.json`, which are public
replays with both sides' honey and tempAtk.

| Test (script) | n | Result |
|---|---|---|
| Frame-exact replay, seeds 101/202/303, honey read off frames plus honey/seat search (`validate.js --seeds 1 --honeysearch --seatsearch`) | 10,065 | **10,065 (100.00%)**. Per group: S1 climb 9,314/9,314, S2 climb 452/452, other players' replays 299/299 |
| Same, honey read off frames only (`--seatsearch`) | 10,065 | 10,030 exact (99.65%); winner 10,062 (99.97%) |
| Winner, our honey known and ghost honey unknown (= false), frame-0 stats (`--honey known`) | 10,065 | 9,785 (97.22%); S1 97.34%, S2 92.92% |
| Winner, no honey information at all (`--honey none`) | 10,065 | 9,255 (91.95%) |
| Winner from `data/decisions` **fight rows** (the bot's own logged view: our ATK *without* potato, ghost honey unknown, no seat rules) (`validate_fightrows.js`) | S1 9,319 / S2 451 | S1 **95.6% [95.2, 96.0]**, S2 **74.1% [69.8, 77.9]** |
| Is the seed fixed? Among battles the engine reproduces and whose frames depend on the seed, seeds 101/202/303 vs arbitrary seeds (`seedtest2.js`, run on an earlier model) | 6,951 | fixed 73.8% vs arbitrary 22–51%. With the final model every exact match uses the fixed seed; no other seed ever reproduces one it fails on. |

What explains the disagreements that remain:
1. **Ghost honey is invisible before the fight.** Frames carry only name/atk/hp. This costs 2.7 pts of winner
   accuracy (100 → 97.3).
2. **Potato is missing from logged stats.** The bot's fight rows and board strings drop tempAtk, costing another
   1.7 pts (97.3 → 95.6).
3. **S2 seat rules are not logged** in the fight rows (74.1% without them). The rules are in `state.seats`; the
   repo simply ignores them.

There is no residual RNG and no unexplained mechanic.

---------------------------------------------------------------------------------------------------------
## 5. How much the repo's model costs (engine counterfactuals; same recorded enemies, same seed)

These experiments compare the **pre-rewrite** heuristic model with the simulator. They do not
describe the active planner, which uses `lib/sim.js`.

| Experiment (script) | n | Result |
|---|---|---|
| Heuristic threat `effectiveThreat(their seats).atk` vs the enemy front's real ATK at first contact (`threat_model_check.js`) | 9,314 | exact **74.1%**; under-estimated 1,241, over-estimated 1,171; mean abs error 0.39 ATK |
| Causes of the under-estimates | — | dodo@mid → front 295 (+43/+19/+15/+11 combined); **hype buffing itself** 271 (+78/+12); grow's first tick 218 (+89); stacked hype 47; dump → front 40 |
| `frontDiesTo` first-contact prediction vs the actual result | 9,262 | 92.2% accurate; 457 "survives" calls died, 268 "dies" calls survived |
| Re-seat the same units, order chosen vs 150 same-round enemy boards, scored on the real enemy (`seating_robust.js`) | 9,287 | score **0.720 → 0.791**. The bot's order equalled the robust order 31.2% of the time. Changes: +532 L→W, +564 D→W, +250 L→D, −130 W→L, −188 W→D, −118 D→L |
| Same with hindsight (best order against the actual enemy) (`seating_robust.js`) | 9,287 | 0.870 |
| S2: robust re-seat, seat-rule blind / seat-rule aware / hindsight (`seating_s2.js`) | 434 | actual 0.418 → 0.518 / **0.545** / 0.613 |
| Where the engine wants each kit vs where the bot put it (front/mid/back %) (`kit_seat_pref.js`, boards with 3 different kits) | per kit | hype bot 4/15/81 → engine **30**/23/47; guard 46/40/15 → **6**/52/43; spotlight 31/20/49 → **86**/6/8; dump 32/24/44 → **0**/50/50; flamingo 70/22/7 → 96/4/0; wake 29/41/30 → 4/47/49; cover 33/21/47 → 9/45/46; backtap 1/39/59 → 49/30/21 |
| Gain by our front kit (`front_kit_breakdown.js`) | per kit | echo front 0.511→0.811 (n=456); cover front 0.704→0.869 (n=225); wake front 0.610→0.754 (n=337); guard front 0.707→0.824 (n=721); dump front 0.115→0.385 (n=26); hype front 0.675→0.788 (n=203) |
| Honey seat, one honey on a 3-board: front / mid / back (`honey_counterfactual.js`) | 2,128 | 0.780 / 0.782 / **0.813**. The repo's "honey back first" is right; WINNING_STRATEGY.md:48 "Honey on front" is wrong. |
| +2 ATK (potato) on front / mid / back (`potato_counterfactual.js`) | 8,772 | 0.877 / 0.833 / 0.820. Potato belongs on the front for the fight it is fed in. |
| Inert or self-destructive seats the bot fielded (`inert_placements.js`, all climb) | 9,766 | guard@front 776 (WR 60.2% [56.7, 63.6]); cover@front 228; dump@front 27 (WR **7.4% [2.1, 23.4]**); spotlight off-front 50; last_word not last 40; dodo@front 31 |
| Ghost continuity: the enemy line in round r+1 vs round r | 3,950 r0→r1 | identical 944 (24%), same units with different stats/order 198 (5%), **different units 2,808 (71%)** |

---------------------------------------------------------------------------------------------------------
## 6. Findings (ENGB-xx). Each one cites engine evidence and a repo file:line.

The file and line references in this section point to the **pre-rewrite** bot. Its proposed fixes
are audit history, not a list of current defects.

**ENGB-01 (critical, strategy): the repo has no battle model, although an exact deterministic one exists.**
- Engine: the seed is fixed per round (`1ou4egaetj-op.js` @38161 `let r=[101,202,303]`, and §4: 10,065/10,065
  frame-exact).
- Repo:
  - `lib/counters.js:536-619` (frontEhp / effectiveThreat / frontDiesTo) and `driver/play_loop.js:1175-1260`
    (frontSeatScore / desiredFrontIndex / seatBoard) are hand-written heuristics.
  - `grep simulat` over the repo finds nothing.
  - The threat heuristic is exact only 74.1% [73.2, 75.0] of the time (n=9,314). The first-contact survival
    call is right 92.2%.
  - Reseating the same units by engine search is worth +7.1 score points (0.720 → 0.791, n=9,287) with no
    hindsight.
- Fix:
  - Vendor `engine/sim.js` into `lib/`.
  - Replace P1 "front survive", `seatBoard` and `frontSeatScore` with `bestSeating(board, enemyPool, {round, seats})`.
  - Score each candidate buy/sell/feed with the same simulator against a pool of recent same-round ghost boards.
    Ghost boards change 71% of the time between rounds, so do not plan against only the last-seen ghost.

**ENGB-02 (critical, rules_mismatch): Season 2 is not modelled (seat rules and 8 new kits), and the catalog is stale.**
- Engine: the changelog (`1iil01q93t0nb.js` @15491) and the `seats`/`seatShop` schema (`1ou4egaetj-op.js`
  @15642). The six rules and their exact semantics are in §2.2. 439 of 449 battles since 07:00Z contain
  seat-rule frames.
- Repo:
  - `catalog.json` has 72 bots. `lib/enrich.js:28-40` falls back to `name: u.botId, kitId: ''`.
  - 191 S2 offers were enriched as raw ids with `kitId: null`, e.g. `xSfBSprfKv5h909uzrv7W` = X High Coach,
    seen 55 times.
  - S2 bots sat on our board in about 80 shop snapshots (coffee companion 34, X High Coach 31).
  - 55 ghost units had no kit. `lib/name_to_kit.json` (74 names) contains no S2 names.
  - No code reads `state.seats` or `state.seatShop` (grep finds nothing).
  - Result since the change: 52 W / 102 L / 24 D, a 29.2% [23.0, 36.3] match win rate. Fight-row prediction
    without seat rules is 74.1%.
- Fix:
  - Fetch `/api/catalog` at startup instead of the checked-in file.
  - Pass `state.seats` and `phase.round` to the simulator.
  - Add the S2 kits to every kit table.
  - Seat-rule-aware seating alone moves S2 battle score 0.418 → 0.545 (n=434).

**ENGB-03 (high, rules_mismatch): potato is modelled as a permanent +1/+1; it is really +2 ATK for this battle only, and it erases honey.**
- Engine:
  - The client card says "Potato: +2 attack this round" (`3q0na6c5idq7f.js` @51106).
  - The reducer `feed` (`1ou4egaetj-op.js` @41457) sets `honey:!1, potato:!0, tempAtk:+2`, and `battleDone`
    (@42803) resets `tempAtk:0, potato:!1`.
  - Data: 1,141 potato feeds changed permanent ATK/HP 0 times. 1,125 frame-0 units had ATK = board + 2.
    **74 feeds removed honey.** **78 feeds were rejected as `invalid_action`** (potato on a potato unit).
- Repo:
  - Docs: `study/omlejmi/GAME_SYSTEMS.md:32,78`; `COMPLETE_WIN_PLAN.md:33,71,171,270`;
    `WINNING_STRATEGY.md:21`.
  - `driver/play_loop.js:2062-2074` gates on `hp + 1`, even though potato adds 0 HP.
  - `play_loop.js:2089-2092` adds +1/+1 to the planned board.
  - The potato target search (`:2047-2059`) never checks `honey`.
  - The bot never tracks the `potato` flag (`lib/enrich.js`, and the board strings at `play_loop.js:2186`).
- Fix:
  - Model potato as `tempAtk += 2` for this fight.
  - Never potato a honeyed unit, and never potato a unit that already has potato.
  - Place potato by simulation: front scores 0.877 vs mid 0.833 vs back 0.820.
  - Value potato as one fight only, never as permanent stats.

**ENGB-04 (high, rules_mismatch): mosquito hits a random enemy, not the enemy front.**
- Engine: the server keeps the legacy `snipeRandomEnemies` (count 1), which is `k(u[p(t)],1)`
  (`1ou4egaetj-op.js` @30014/@33766). The catalog kitText "deal 1 damage to the enemy front" is wrong.
- Data:
  - A front-target model diverges on 2,942 of 9,613 S1 battles; `pickRandom` reproduces 100%.
  - Targets against 3 enemies: front 501, mid 2,280, back 498. Against 2 enemies: front 129, back 258. The
    split is skewed by the fixed seed.
- Repo: `GAME_SYSTEMS.md:114` ("PROVEN"); `COMPLETE_WIN_PLAN.md:146`; `WIN_FORMULA.md:241-244`
  ("chip SoB front"); `COUNTERS.md:29,43` ("vs mosquito → bulk wall"); `ALL_CARDS.md:29-32`.
- Fix: treat mosquito as a seeded random ping. With the fixed seed the target can be computed, so simulate it
  rather than reasoning about the front.

**ENGB-05 (high, rules_mismatch): hype "never seat 0" is wrong, because hype buffs the front-most friend including itself.**
- Engine: `X juiced X: +2 ATK` appears in the data (for example "WTD juiced WTD"). 271 threat under-estimates
  come from hype buffing itself. Hype's effect does not depend on its seat, so hype is an ideal front body when
  the other units need to sit behind (echo, wake, patch, guard, cover, dodo).
  - Engine-robust seat for hype: front 30% / mid 23% / back 47%. The bot: 4 / 15 / 81 (n=2,542).
  - Boards with hype at the front would gain +0.113 from reseating (n=203).
  - Boards with echo at the front would gain +0.300 (n=456), usually by moving hype to the front.
- Repo:
  - `driver/play_loop.js:1192` (`hype||last_word → s -= 6`), `:1236-1258` (seatBoard pushes hype right, `backish` at :1240).
  - `lib/counters.js:561` (`if (hasHype && kit0 !== 'hype') atk += 2`) ignores a hype front and adds only +2
    even when several hypes stack.
  - `GAME_SYSTEMS.md:172` and `COMPLETE_WIN_PLAN.md:303` ("Never seat0: hype").
- Fix: remove the rule. Count +2 per living hype on the front-most unit, and let the simulator choose.

**ENGB-06 (high, rules_mismatch): effectiveThreat has dodo, dump and grow backwards or missing, and a dead branch.**
- Engine: dodo and dump buff the unit **ahead** (§2.3). At index 0, dodo does nothing and dump simply faints.
  Grow adds +1/+1 before the very first exchange.
- Repo `lib/counters.js:583-591` treats dodo/dump at *seat 0* as raising mid, and misses dodo/dump at *seat 1*
  buffing the front. That gap is 295 + 43 + 19 + 15 + 11 under-estimates ('dodo_to_front') and 40 + 12
  ('dump_to_front').
- The +1/+1 grow tick on a seat-0 grow is ignored (218 + 89 + 12).
- `:563` adds +3 for a peacock front unconditionally, but peacock needs a hurt event first.
- `:595` `k === 'spotlight' && i === 0` can never be true inside a loop that starts at `i = 1` (dead code).
- It also ignores enemy SoB damage to our front: kit spotlight 2, pin 1 at the same seat, last_word/backtap
  when our side is down to one unit, and mosquito.
- Totals: 74.1% exact, 1,241 under, 1,171 over (n=9,314).
- Fix: delete effectiveThreat/frontDiesTo and use `sim.outcome`.

**ENGB-07 (medium, rules_mismatch): honey is modelled as +2 HP on the unit; it is really a 1/1 Drone that appears after the unit faints.**
- Engine: `e.honey && b(t,n,r)` (`1ou4egaetj-op.js` @33575) inserts a Drone at the fainted index, after the
  faint kit and before cover/KO. The honeyed front still dies; the Drone absorbs the next enemy swing and also
  triggers echo/wake behind it.
- Repo:
  - `lib/counters.js:532-543` (`if (unit.honey) hp += 2`) and `driver/play_loop.js:1649`.
  - `GAME_SYSTEMS.md:76,145`; `COMPLETE_WIN_PLAN.md:170`; `WIN_FORMULA.md:284`.
  - This inflates the P1 survival gate, part of the 457 "survives" calls that were wrong.
  - Contradiction: `WINNING_STRATEGY.md:48` says "Honey on front", while `COMPLETE_WIN_PLAN.md:288` and
    `GAME_SYSTEMS.md:76` say back → mid.
- Engine verdict (n=2,128): honey on back 0.813 > mid 0.782 > front 0.780. The code's honey back→mid order
  (`play_loop.js:2030-2046`) is correct; the eHP model and the WINNING_STRATEGY line are wrong.
- Fix: drop the +2 eHP. Keep honey back-first, or choose it by simulation.

**ENGB-08 (medium, rules_mismatch): guard is treated as a front kit, but it does nothing at index 0.**
- Engine: guard pads the friend **ahead**; 0 of 582 front guards ever padded.
- Repo:
  - `lib/counters.js` PLANS `front` lists include guard: chip_snipe:109, double_echo:129, grow_scale:149,
    grow_hype:159, wake_chip:179, sustain:199, backline_snipe:219.
  - `hedgePlan` falls back to `front ← {bulk, hold_the_line, guard}` (`:499-503`).
  - `frontSeatScore` gives guard only -1 (`play_loop.js:1193`).
- Data: guard@front was fielded 776 times, WR 60.2% [56.7, 63.6]. Engine-robust seats for guard: 6% front
  vs the bot's 46% (n=1,218). Reseating guard-front boards gains +0.117 (n=721).
- Fix: guard, dodo, dump, cover, patch, echo and wake never go at index 0. Let the simulator decide.

**ENGB-09 (medium, rules_mismatch): dump, spotlight and last_word are seated where they do nothing, or worse.**
- Engine: dump at index 0 faints at SoB and gives nothing; spotlight fires only at index 0; last_word fires only
  when last.
- Data:
  - dump@front: 27 battles, WR 7.4% [2.1, 23.4], reseat gain +0.269.
  - Spotlight off-front: 50 battles; it fired 0 of 85 times off-front across all boards. Engine seat 86% front
    vs the bot's 31% (n=71).
  - last_word not last: 40 battles.
- Repo:
  - `play_loop.js:1195` *penalises* spotlight at the front when hp < 5.
  - seatBoard (`:1213-1260`) has no rule for dump/dodo/spotlight.
  - `COMPLETE_WIN_PLAN.md:149` still treats mid spotlight as "LIKELY inert" rather than a certainty.
- Fix: enforce these as hard constraints, or better, use simulation-based seating.

**ENGB-10 (medium, docs): the documented trigger order and SoB sort key are wrong or unproven.**
- Engine (§2.4): trade → Hard hat → hurt (own kits by ATK, then patches) → faint loop (highest ATK first;
  faint kit → honey Drone → cover/herd → killer's KO kit) → echo/wake, you then them.
- SoB: one ATK-descending sort with seeded ties, computed after seat rules. Encore doubles a SoB kit.
- Repo: `GAME_SYSTEMS.md:94-105` and `COMPLETE_WIN_PLAN.md:113-125` put echo/wake *before* hurt/faint, list KO
  after all faints, and call the SoB sort key "SPECULATION".
- Fix: replace those sections with §2 of this report.

**ENGB-11 (medium, rules_mismatch): the series length is wrong; a match is at most 3 rounds, and draws use rounds up.**
- Engine: the reducer ends when `2 === wins || 2 === round`.
- Data: final scores 1-0 ×108, 0-1 ×65, 1-1 draw ×310, 0-0 ×12 (n=3,989). Match draws are 8.1% [7.3, 9.0].
- Repo:
  - CLAUDE.md ("first to win 2 rounds") and `GAME_SYSTEMS.md:40` ("finals cluster 2-0, 0-2, 2-1, 1-2").
  - `play_loop.js:1301,1316` treats only 1-1 as the decider. 993 of 1,782 round-2 fights were at 0-0, 1-0 or
    0-1, and round 2 is always final:
    - at 0-1 the best available is a match draw;
    - at 1-0 a draw is enough to win.
- Fix: key the decider logic on `round === 2` together with the score.

**ENGB-12 (medium, telemetry): the logged stats omit potato, so the bot's own data misreports its fighting line.**
- Board strings (`play_loop.js:2186`) and decision fight rows (`lib/decision_db.js`) log `atk` without
  `tempAtk`/`potato`, and never record `potato`.
- 1,125 logged units fought at +2 ATK. Fight-row winner replay reaches 95.6% where frames reach 100%.
- The missing flag also causes the 78 rejected potato feeds.
- Fix: log `tempAtk` and `potato`, and log `state.seats`.

**ENGB-13 (low, dead_code): the kit tables contain kit ids that do not exist.**
- `play_loop.js:456` `KIT_FRONT` contains 'brace'; `:476` `KIT_WEAK` contains 'spot' and 'poke'.
- These are label-map words or ability names (dodo's ability is "Spot", mosquito's is "Poke"). None of the 80
  catalog bots uses them as a kitId (`3q0na6c5idq7f.js` module 38959 label map vs the embedded catalog).
- Fix: delete them, and derive kit tables from the live catalog.

**ENGB-14 (low, strategy): "counter the ghost you just saw" does not survive the next round.**
- The enemy board in round r+1 has different units 71% of the time, and is identical only 24% of the time
  (n=3,950 r0→r1). The pattern for r1→r2 is the same: 1,047 different, 268 identical, 441 same units.
- Repo: `play_loop.js` main loop and `lib/ghosts.js` plan the next shop against `frames[0].them` of the last
  fight.
- Fix: choose seating and buys that are robust against a pool of same-round ghost boards (§5: 0.791 robust vs
  0.870 with hindsight).

---------------------------------------------------------------------------------------------------------
## 7. Files

These are the original audit artifacts under the `$S` scratch root shown above. The active
simulator and corpus are `lib/sim.js` and `data/corpus/battles.jsonl`.

All under `$S`:
- `engine/sim.js`: the simulator (API in §3). `engine/catalog.json`: the 80-bot client catalog.
- `audit/engb/extract_catalog.js`: pulls the embedded catalog out of `3q0na6c5idq7f.js`.
- `audit/engb/extract_battles.py`: builds `battles.jsonl` (10,065 battles with frames).
- `audit/engb/validate.js`: frame-exact validator.
  - Flags: `--s1only|--s2only`, `--honey oracle|known|none`, `--honeysearch`, `--seatsearch`,
    `--hyp k=v`, `--show N`, `--dump`.
- `audit/engb/validate_fightrows.js`: winner agreement on `data/decisions` fight rows.
- `audit/engb/hypscore.js`, `seedtest.js`, `seedtest2.js`: rule and seed hypothesis tests.
- `audit/engb/captions.py`, `caption_counts.py`, `narrate.py`, `seat_rules.py`, `seat_bind.py`,
  `seat_bind2.py`: exploration of captions and seat rules.
- `audit/engb/threat_model_check.js`: repo threat and survival model vs the engine.
- `audit/engb/seating_counterfactual.js`, `seating_robust.js`, `seating_s2.js`, `front_kit_breakdown.js`,
  `kit_seat_pref.js`, `honey_counterfactual.js`, `potato_counterfactual.js`, `inert_placements.js`: the
  counterfactual studies in §5.
- `pretty/*.js`: prettified client chunks. `site/`: the original chunks.

Re-run everything: `cd $S/audit/engb && python3 extract_battles.py && node validate.js --seeds 1 --honeysearch --seatsearch`
