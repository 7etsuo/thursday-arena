'use strict';
/*
 * Thursday Arena battle simulator (CommonJS, no deps).
 *
 * PROVENANCE
 * ----------
 * The skeleton is lifted from the game client's own battle function
 * `simulateBattle` (module 59427 in /_next/static/chunks/1ou4egaetj-op.js,
 * byte offset ~31668).  Names of the minified closures are kept in comments:
 *   a -> randStep (mulberry32 step)      l -> rnd()
 *   u -> st {you, them}                  h -> frame(caption)
 *   p -> other(side)                     f -> sideOf(unit)
 *   m -> byAtk(list)  (atk desc, ties broken by a fresh random key per element)
 *   g -> kitOf(unit)                     b -> summon(side, index, spec)
 *   y -> hit(list, caption)              k -> pickRandom(list, n)
 *   w -> onFaint(unit, side, index)
 *
 * The client copy only knows the 14 legacy "practice" kits (ant, beaver, cricket, ...).
 * Rated matches are simulated SERVER-side with the same skeleton plus the Season-1/2
 * kits (bulk, hype, echo, ...) and the Season-2 seat rules.  Everything that is not in
 * the client chunk was reverse-engineered from ~10k recorded server battle frame
 * sequences (captions + per-frame stats); the historical audit validated 10,065/10,065
 * frame for frame.  The rules are written up in docs/ENGINE_BATTLE.md; test/sim.test.js
 * checks the winner of all 10,748 battles in data/corpus/battles.jsonl and selected frame traces.
 *
 * API
 * ---
 *   simulate(ourUnits, theirUnits, opts) -> { winner: 'us'|'them'|'draw', frames, turns }
 *     units: {name, kitId, atk, hp, honey, crew?, item?, botId?, fusedWith?, crews?} (atk includes tempAtk / potato)
 *     opts.round     : 0|1|2|3 (default 0) -> selects fixed seed 101/202/303/404 and active seats
 *     opts.seed      : override the RNG seed (only for experiments; the live server always uses ROUND_SEEDS)
 *     opts.seats     : Season-2 seat rules, e.g. {front:'hard_hat', middle:'spotlight', back:'encore'}
 *                      ids: spotlight | pit_stop | warm_up | encore | hot_seat | hard_hat.
 *                      Only seats 0..round are active (front, +middle, +back).
 *     opts.frames    : false to skip building frames (faster)
 *     opts.season    : 1|2|3|4; enables the rules for that season
 *     opts.ourCaptain / opts.theirCaptain: captain IDs, including S4
 *     opts.ourRelics / opts.theirRelics: S4 relic IDs; see docs/SEASON4.md
 *   simulateBattle(you, them, seed, opts) -> { frames, winner: 'you'|'them'|'draw' }  (server naming)
 *   unitFromCatalog(nameOrId, {food, apples, extraAtk, extraHp, tempAtk}) -> unit
 *   outcome(us, them, opts) -> 'us'|'them'|'draw'   (no frames; ~6us)
 *   bestSeating(units, enemyPool, opts) -> [{order, score}] sorted best-first
 *
 * The rule hypotheses that validate 100% are inlined here; the rejected alternatives
 * (backIsIndex2, zeroDamageIsHurt, koOnlyFromTrade, hurtMode, growMode, followMode) are not needed
 * to play and live on only in the audit's validate.js.
 * Season-3 public match details omit seats and captains. tools/verify_s3_public.js
 * reconstructs them from captions for a diagnostic replay; it is not independent validation.
 */

const catalog = require('./catalog');
const season4Rules = require('./season4');

// ---------------------------------------------------------------- RNG (verbatim from client `a`)
function randStep(e) {
  const t = (e + 0x6d2b79f5) | 0;
  let n = Math.imul(t ^ (t >>> 15), 1 | t);
  return {
    value: (((n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n) ^ (n >>> 14)) >>> 0) / 0x100000000,
    seed: t,
  };
}

/**
 * The seeded [0,1) stream every caller shares.  randStep IS mulberry32 with the seed threaded out,
 * so this is bit-identical to the five hand-rolled copies it replaces (review R3-7.1).
 */
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    const r = randStep(s);
    s = r.seed;
    return r.value;
  };
}

// ---------------------------------------------------------------- kit table
// trigger names follow the client's KITS table vocabulary.
const KITS = {
  // ---- Start of battle -------------------------------------------------
  bulk:        { trigger: 'startOfBattle', effect: { kind: 'gainHp', amount: 2 } },
  hype:        { trigger: 'startOfBattle', effect: { kind: 'buffFrontmost', atk: 2 } },          // front-most friend, may be itself
  dodo:        { trigger: 'startOfBattle', effect: { kind: 'giveAttackPercentAhead', percent: 50 } },
  dump:        { trigger: 'startOfBattle', effect: { kind: 'giveAttackPercentAheadThenFaint', percent: 50 } },
  guard:       { trigger: 'startOfBattle', effect: { kind: 'buffAhead', hp: 2 } },
  mosquito:    { trigger: 'startOfBattle', effect: { kind: 'snipeRandomEnemies', count: 1, damage: 1 } },   // kitText says 'enemy front' but server = legacy random snipe
  pin:         { trigger: 'startOfBattle', effect: { kind: 'snipe', target: 'sameSeat', damage: 1 } },
  sidestep:    { trigger: 'startOfBattle', effect: { kind: 'snipe', target: 'middle', damage: 1 } },
  backtap:     { trigger: 'startOfBattle', effect: { kind: 'snipe', target: 'last', damage: 1 } },
  last_word:   { trigger: 'startOfBattle', seat: 'back', effect: { kind: 'snipe', target: 'last', damage: 3 } },
  spotlight:   { trigger: 'startOfBattle', seat: 'front', effect: { kind: 'snipe', target: 'front', damage: 2 } },
  first_seat:  { trigger: 'startOfBattle', effect: { kind: 'moveToFront' } },
  reach_check: { trigger: 'startOfBattle', effect: { kind: 'debuffStrongestEnemy', atk: 2 } },       // S2
  red_flag:    { trigger: 'startOfBattle', effect: { kind: 'debuffStrongestEnemy', atk: 3 } },       // S2 legendary (DeckLens), live 2026-09-19
  route:       { trigger: 'startOfBattle', seat: 'back', effect: { kind: 'buffAllFriends', atk: 1, hp: 1 } }, // S2, confirmed live 2026-09-19
  // ---- attack-time --------------------------------------------------------
  grow:        { trigger: 'beforeAttack', effect: { kind: 'gainStats', atk: 1, hp: 1 } },
  echo:        { trigger: 'friendAheadAttacks', effect: { kind: 'gainStats', atk: 1, hp: 1 } },
  wake:        { trigger: 'friendAheadAttacks', effect: { kind: 'pingFront', damage: 1 } },
  // ---- hurt -----------------------------------------------------------------
  peacock:     { trigger: 'hurt', effect: { kind: 'gainAttack', amount: 3 } },
  sting:       { trigger: 'hurt', effect: { kind: 'pingFront', damage: 2 } },
  hold_the_line: { trigger: 'hurt', seat: 'front', effect: { kind: 'heal', amount: 1 } },
  patch:       { trigger: 'friendAheadHurt', effect: { kind: 'healAhead', amount: 1 } },
  // ---- faint / knock-out ----------------------------------------------------
  flamingo:    { trigger: 'faint', effect: { kind: 'buffNearestBehind', count: 2, atk: 1, hp: 1 } },
  spite:       { trigger: 'faint', effect: { kind: 'pingFront', damage: 2 } },
  keep_open:   { trigger: 'faint', effect: { kind: 'summon', atk: 1, hp: 1, name: 'Open Loop', side: 'ally' } }, // S2
  recall:      { trigger: 'faint', effect: { kind: 'giveAtkBehind' } },                                         // S2
  caffeinate:  { trigger: 'faint', effect: { kind: 'surviveOnce' } },                                           // S2, unseen
  cover:       { trigger: 'friendAheadFaints', effect: { kind: 'gainAttack', amount: 2 } },
  herd:        { trigger: 'friendAheadFaints', once: true, effect: { kind: 'summonInPlace', atk: 2, hp: 2, name: 'Agent' } }, // S2
  snowball:    { trigger: 'knockOut', effect: { kind: 'gainStats', atk: 2, hp: 2 } },
  drain:       { trigger: 'knockOut', effect: { kind: 'heal', amount: 2 } },
  // ---- shop-only kits (no battle effect) -----------------------------------
  bloom: { trigger: 'buy' }, hand_off: { trigger: 'sell' },
};

const LEGACY_KITS = new Set(Object.keys(KITS));

// Season 3 introduced several cards with the same effect under different names.
// Keep the ID table explicit so an unknown live kit remains visible rather than
// silently borrowing an unrelated effect.  These descriptions come from the
// public catalog, https://thursdayarena.com/api/catalog (2026-09-20).
function addKits(ids, trigger, effect, extra = {}) {
  for (const id of ids.split(' ')) KITS[id] = { trigger, effect: { ...effect }, ...extra };
}
addKits('copycat lowball poach price_cut', 'startOfBattle', { kind: 'stealAttack', target: 'front', amount: 1 });
addKits('roast', 'startOfBattle', { kind: 'stealAttack', target: 'strongest', amount: 1 });
addKits('best_find reclaim', 'startOfBattle', { kind: 'stealAttack', target: 'strongest', amount: 2 });
addKits('red_light recut clamp', 'startOfBattle', { kind: 'jam', count: 1 });
addKits('on_hold merge_gate focus_block', 'startOfBattle', { kind: 'jam', count: 2 });
addKits('standby', 'startOfBattle', { kind: 'jam', count: 1 }, { seat: 'front' });
addKits('read_the_green cold_call red_pen', 'startOfBattle', { kind: 'vulnerable', amount: 1 });
addKits('deduce front_page', 'startOfBattle', { kind: 'vulnerable', amount: 2 });
addKits('defuse quarantine quiet_please no_source weed_out', 'startOfBattle', { kind: 'silence', target: 'across' });
addKits('scrub', 'startOfBattle', { kind: 'silence', target: 'front' });
addKits('pre_review hold_calls site_safety morning_brief', 'startOfBattle', { kind: 'shield', target: 'ahead' });
addKits('paper_shield', 'startOfBattle', { kind: 'shield', target: 'front' });
addKits('safe_week', 'startOfBattle', { kind: 'shield', target: 'friends' }, { seat: 'back' });
addKits('rollback', 'startOfBattle', { kind: 'shield', target: 'self' });
addKits('onboard', 'startOfBattle', { kind: 'fillEmpty' });
addKits('swipe_file remix study_up relay trace', 'startOfBattle', { kind: 'copyAhead' });
addKits('command now_playing mission_control headroom kickoff', 'aura', { kind: 'friendAttack', amount: 1 });
addKits('clear_path game_plan house_voice quorum', 'aura', { kind: 'friendAttack', amount: 2 });
addKits('throttle soft_room tighten hex', 'aura', { kind: 'enemyAttack', amount: 1 });
addKits('bedrock sandbox checklist', 'passive', { kind: 'armor', amount: 1 });
addKits('door_check', 'passive', { kind: 'armor', amount: 2 });
addKits('first_paint scoop quick_reply', 'passive', { kind: 'firstStrike' });
addKits('hammer swipe crosspost jump_cut', 'passive', { kind: 'doubleHit' });
addKits('engrave wide_net share_link', 'passive', { kind: 'splash', amount: 2 });
addKits('outbound wide_search', 'passive', { kind: 'splash', amount: 1 });
addKits('acid_test the_memo', 'passive', { kind: 'venom', amount: 1 });
addKits('front_desk objection take_the_call', 'passive', { kind: 'taunt' });
addKits('archive cashback tally_up shout_out next_question hot_thread jump_cut', 'enemyFaints', { kind: 'gainStats', atk: 1, hp: 1 });
addKits('on_call waitlist', 'friendFaints', { kind: 'gainStats', atk: 1, hp: 1 });
addKits('alert', 'friendFaints', { kind: 'buffAllFriends', atk: 1, hp: 1 });
addKits('backfill', 'friendFaints', { kind: 'fillEmpty' });
addKits('book_loan sitter_sheet', 'faint', { kind: 'shieldBehind' });
addKits('home_base pep_talk renew check_in', 'endExchange', { kind: 'healFront', amount: 1 });
addKits('digest new_listing iterate nudge', 'everySecondExchange', { kind: 'gainStats', atk: 2, hp: 2 });
addKits('close_it paper_route', 'everySecondExchange', { kind: 'snipeLast', damage: 2 });
addKits('weekend_plan', 'everySecondExchange', { kind: 'buffAllFriends', atk: 1, hp: 1 });
addKits('rank_one go_live solo_run', 'lastStanding', { kind: 'gainStats', atk: 2, hp: 2 });
Object.assign(KITS, season4Rules.KITS);

const CREWS = Object.freeze({
  sales: { 2: { atk: 2, hp: 0 }, 3: { atk: 3, hp: 1 } },
  ops: { 2: { atk: 0, hp: 3 }, 3: { atk: 1, hp: 4 } },
  personal: { 2: { atk: 1, hp: 1 }, 3: { atk: 2, hp: 2 } },
  builders: { 2: { atk: 2, hp: 3 }, 3: { atk: 4, hp: 5 } },
  marketing: { 2: { damage: 2 }, 3: { damage: 3 } },
});
const DRONE = { name: 'Drone', atk: 1, hp: 1 };

const SEAT_RULES = ['spotlight', 'pit_stop', 'warm_up', 'encore', 'hot_seat', 'hard_hat'];
const SEAT_NAMES = ['front', 'middle', 'back'];

// ---------------------------------------------------------------- core
function simulateBattle(e, t, seed, opts = {}) {
  let s = seed | 0;
  const season4 = Number(opts.season) >= 4;
  const season3 = Number(opts.season) >= 3 || opts.season === 'Season 3' ||
    !!(opts.ourCaptain || opts.theirCaptain || opts.captains) ||
    [...e, ...t].some((x) => x.crew || x.item || x.itemId);
  // All-legacy, unequipped fights retain the server's legacy effect captions.
  const modernEffects = season3 && [...e, ...t].some((x) => x.item || x.itemId || (x.kitId && !LEGACY_KITS.has(x.kitId)));
  const wantFrames = opts.frames !== false;
  const rnd = () => { const r = randStep(s); s = r.seed; return r.value; };            // client `l`
  const st = {                                                                          // client `u`
    you: e.map((x) => ({ ...x, fainted: false, _shield: season3 && (x.itemId || x.item) === 'firewall' ? 1 : (x._shield || 0) })),
    them: t.map((x) => ({ ...x, fainted: false, _shield: season3 && (x.itemId || x.item) === 'firewall' ? 1 : (x._shield || 0) })),
  };
  for (const side of ['you', 'them']) for (const x of st[side]) {
    x._side = side; x._baseAtk = x.atk; x._baseHp = x.hp;
  }
  const relics = { you: season4 ? opts.ourRelics || [] : [], them: season4 ? opts.theirRelics || [] : [] };
  const frames = [];
  const snap = (arr) => arr.map((x) => {
    const out = { name: x.name, atk: x.atk, hp: x.hp };
    if (season4 && x.fusedWith) { out.botId = x.botId || catalog.byName(x.name)?.id; out.fusedWith = x.fusedWith; }
    if (season3 && x._shield) out.shield = x._shield;
    if (season3 && x._poison) out.venom = x._poison;
    return out;
  });
  const frame = (caption) => { if (wantFrames) frames.push({ you: snap(st.you), them: snap(st.them), caption }); }; // client `h`
  const other = (side) => (side === 'you' ? 'them' : 'you');                            // client `p`
  const sideOf = (x) => (season4 && x?._side) || (st.you.includes(x) ? 'you' : 'them');                          // client `f`
  const byAtk = (list) => {                                                             // client `m`
    const key = new Map(list.map((x) => [x, rnd()]));
    return [...list].sort((a, b) => b.atk - a.atk || key.get(a) - key.get(b));
  };
  const kitOf = (x) => {
    if (!x || x._silenced) return null;
    const k = KITS[x._copiedKitId || x.kitId];
    return k?.season === 4 && !season4 ? null : k || null;
  };
  const itemOf = (x) => season3 ? (x.itemId || x.item || null) : null;
  const eff = (x, value) => value ? value + (itemOf(x) === 'hotfix' ? 2 : 0) + (season4 && relics[sideOf(x)].includes('hotfix') ? 1 : 0) : 0;
  const shield = (x) => { if (x) x._shield = (x._shield || 0) + 1; };
  const tauntTarget = (side) => st[side].find((x) => kitOf(x)?.effect?.kind === 'taunt') || null;
  const targeted = (side, preferred) => season3 ? (tauntTarget(other(side)) || preferred) : preferred;
  const keyword = (x, kind) => {
    if (!x) return 0;
    const k = kitOf(x);
    return Math.max(0, (k?.effect?.kind === kind ? k.effect.amount || 1 : 0) +
      (k?.[kind] ? Number(k[kind]) : 0) + (season4 ? x._keywords?.[kind] || 0 : 0) - (x._removedKeywords?.[kind] || 0));
  };
  const giveKeyword = (x, kind, n = 1) => { if (x) { x._keywords = { ...x._keywords, [kind]: (x._keywords?.[kind] || 0) + n }; (x._keywordGrants ||= []).push([kind,n]); } };
  const hasFirstStrike = (x) => !x?._removedKeywords?.firstStrike && ( ['first_paint', 'scoop', 'quick_reply', 'archive', 'quorum'].includes(x?._copiedKitId || x?.kitId) && !x?._silenced || season4 && !!keyword(x, 'firstStrike'));
  const hasDoubleHit = (x) => !x?._removedKeywords?.doubleHit && ( ['hammer', 'swipe', 'crosspost', 'jump_cut'].includes(x?._copiedKitId || x?.kitId) && !x?._silenced || season4 && !!keyword(x, 'doubleHit'));

  // Both fainting and silence end an active aura. Clear its bookkeeping so a silenced
  // source cannot remove the same bonus a second time when it later faints.
  const fadeAura = (x) => {
    if (!x._aura) return;
    for (const [unit, delta] of x._aura.deltas) {
      if (unit.hp > 0 && !unit.fainted && (st.you.includes(unit) || st.them.includes(unit))) {
        unit.atk = Math.max(0, unit.atk - delta);
      }
    }
    x._aura = null;
    frame(`${x.name}'s aura fades`);
  };
  const silence = (source, target) => {
    if (!target || target._silenced || !kitOf(target)) return;
    fadeAura(target);
    target._silenced = true;
    frame(`${source.name} mutes ${target.name}: no ability this fight`);
  };

  // ----- Season-2 seat rules. Seat of a unit is POSITIONAL, evaluated at the moment:
  // front = index 0, middle = index 1, back = LAST index (so a lone unit is front AND back).
  const round = opts.round == null ? 2 : opts.round;
  const seatRule = [null, null, null];
  if (opts.seats) SEAT_NAMES.forEach((n, i) => { if (i <= round) seatRule[i] = ({pitStop:'pit_stop',warmUp:'warm_up',hotSeat:'hot_seat',hardHat:'hard_hat'})[opts.seats[n]] || opts.seats[n] || null; });
  const rulesAt = (side, x) => {
    const arr = st[side]; const i = arr.indexOf(x); const out = [];
    if (i < 0) return out;
    if (i === 0 && seatRule[0]) out.push(seatRule[0]);
    if (i === 1 && seatRule[1]) out.push(seatRule[1]);
    if (i === arr.length - 1 && seatRule[2]) out.push(seatRule[2]);
    return out;
  };
  const hasRule = (side, x, r) => rulesAt(side, x).includes(r);
  const seatOk = (kit, side, x) => {
    if (!kit.seat) return true;
    const arr = st[side]; const i = arr.indexOf(x);
    if (kit.seat === 'front') return i === 0;
    if (kit.seat === 'back') return i === arr.length - 1;
    return true;
  };

  // ----- summon (client `b`)
  const summon = (side, idx, spec) => {
    const arr = st[side];
    if (arr.length >= 3) return null;
    const a = { _side: side, _baseAtk: spec.atk, _baseHp: spec.hp, name: spec.name, atk: spec.atk, hp: spec.hp, kitId: null, honey: false, fainted: false };
    arr.splice(Math.min(idx, arr.length), 0, a);
    // Auras affect the friends present when they fire. Recorded honey summons do not inherit
    // them (f865efe4, round 1); removal later applies only to the original recipients.
    frame(side === 'you' ? `${a.name} joins your side` : `${a.name} joins the enemy side`);
    // legacy friendSummoned (horse) — not in rated catalog; kept for fidelity with the client
    for (const n of byAtk(arr)) {
      if (n !== a && kitOf(n)?.trigger === 'friendSummoned') { a.atk += kitOf(n).effect.amount; frame(`${n.name} pumps up ${a.name}: +1 ATK`); }
    }
    return a;
  };

  const excessHit = (source, target, damage) => {
    let hp = target.hp, shields = target._shield || 0, evades = target._evaded || 0;
    const count = hasDoubleHit(source) ? 2 : 1;
    for (let i = 0; i < count; i++) {
      let n = damage / count;
      
      if (n > 0) {
        if (shields) { shields--; n = 0; }
        else if (keyword(target, 'evade') > evades) { evades++; n = 0; }
      }
      hp -= n;
    }
    return Math.max(0, -hp);
  };

  // ----- damage (client `y`), extended with Hard hat, KO credit and S1/S2 hurt triggers
  const hit = (list, caption, venomAllowed = true, attackEffects = false, reflectEffects = true) => {
    const hurt = [];
    const survivors = [];
    const reduced = [];
    const awake = [];
    const mitigationNotes = [];
    const poisoned = [];
    const unblocked = new Set();
    for (const { unit, amount, source, venom = true } of list) {
      let amt = amount;
      const side = sideOf(unit);
      // Hard hat: every damage instance (trade, snipe, sting, spite, last word...) is reduced by 1 but never
      // below 1 -- a 1-damage hit is not reduced and prints no "Hard hat" caption. Hot seat bypasses it.
      if (seatRule.some(Boolean) && hasRule(side, unit, 'hard_hat') && amt > 1) { amt -= 1; reduced.push(unit); }
      if (season3) {
        if (amt > 0) {
          amt += unit._vulnerable || 0;
          const kitArmor = kitOf(unit)?.effect?.kind === 'armor' ? kitOf(unit).effect.amount :
            ((unit._copiedKitId || unit.kitId) === 'alert' && !unit._silenced ? 1 : 0);
          const armor = Math.max(0, kitArmor + (season4 ? unit._keywords?.armor || 0 : 0) + (itemOf(unit) === 'foamPad' ? 1 : 0) - (unit._removedKeywords?.armor || 0));
          if (armor && amt > 1) {
            const absorbed = Math.min(armor, amt - 1);
            amt -= absorbed;
            mitigationNotes.push(`${unit.name}'s armor: ${absorbed} less`);
          }
          // Armor captions precede the shield caption even when the shield
          // ultimately blocks the whole hit (public S3 record 36aee6...).
          if (unit._shield) { unit._shield -= 1; amt = 0; mitigationNotes.push(`${unit.name}'s shield blocks the hit`); }
          else if (season4 && keyword(unit, 'evade') > (unit._evaded || 0)) { unit._evaded = (unit._evaded || 0) + 1; amt = 0; mitigationNotes.push(`${unit.name} evades the hit`); }
        }
      }
      // caffeinate, "Faint (once): stay at 1 HP": the clamp happens INSIDE the hit -- the trade frame
      // already shows the unit at 1 HP, then "stays awake: 1 HP" is announced, then the other side's
      // knock-outs resolve (live 2026-09-19).
      if (unit.hp - amt <= 0 && (kitOf(unit)?.effect?.kind === 'surviveOnce' || itemOf(unit) === 'backupDrive') && !unit._usedOnce) {
        unit._usedOnce = true;
        unit.hp = 1;
        awake.push(unit);
      } else {
        unit.hp -= amt;
      }
      if (source) unit._lastHitBy = source;
      if (!(season3 && amt === 0 && amount > 0)) unblocked.add(unit);
      if (unit.hp > 0) survivors.push(unit);
      // a 0-damage hit still counts as "hurt": live 2026-09-19, an attacker flagged down to 0 ATK
      // produced "trade: -0 HP" followed by "holds: +1 HP" (hold_the_line fired)
      if (unit.hp > 0 && !(season3 && amt === 0 && amount > 0)) hurt.push(unit);
      // Hotfix boosts direct kit damage and positive stats, not venom or vulnerability stacks.
      if (venomAllowed && venom && season3 && amount > 0 && source && (!season4 && keyword(source, 'venom') || season4 && !attackEffects && kitOf(source)?.effect?.kind === 'venom')) poisoned.push([source, unit, keyword(source, 'venom'), sideOf(source)]);
    }
    frame(caption);
    for (const x of reduced) frame(`Hard hat: ${x.name} takes 1 less`);
    for (const c of mitigationNotes) frame(c);
    for (const x of awake) frame(`${x.name} stays awake: 1 HP`);
    // hurt handling. Client (`y`): for (e of m(survivors)) { own hurt trigger }.  The server adds
    // "friend ahead hurt" (patch) in a SECOND pass over the same ATK order -- the one-pass and
    // reactor-list orderings reproduce only 80-87% of the corpus (docs/ENGINE_BATTLE.md §2.4).
    const fireSelf = (who) => {
      const k = kitOf(who);
      if (!k || k.trigger !== 'hurt' || who.hp <= 0 || who.fainted) return;
      const side = sideOf(who);
      if (!seatOk(k, side, who)) return;
      const ef = k.effect;
      if (ef.kind === 'gainAttack') { const n = ef.amount; who.atk += n; frame(`${who.name} takes it personally: +${n} ATK`); }
      else if (ef.kind === 'heal') { const n = eff(who, ef.amount); who.hp += n; frame(`${who.name} holds: +${n} HP`); }
      else if (ef.kind === 'swapBehind') {
        const arr = st[side], i = arr.indexOf(who), a = arr[i + 1];
        if (i === 0 && a) { [arr[0], arr[1]] = [arr[1], arr[0]]; frame(`${who.name} tags out: ${a.name} takes the front`); }
      } else if (ef.kind === 'pingFront') {
        const tgt = targeted(side, st[other(side)][0]);
        if (tgt) hit([{ unit: tgt, amount: eff(who, ef.damage), source: who }], `${who.name} stings ${tgt.name}: ${eff(who, ef.damage)}`);
      }
    };
    const firePatch = (hurtUnit) => {
      if (hurtUnit.hp <= 0 || hurtUnit.fainted) return;
      const side = sideOf(hurtUnit); const arr = st[side]; const i = arr.indexOf(hurtUnit);
      const who = i >= 0 ? arr[i + 1] : null;
      if (!who || who.fainted || who.hp <= 0 || kitOf(who)?.trigger !== 'friendAheadHurt') return;
      const n = eff(who, kitOf(who).effect.amount);
      hurtUnit.hp += n; frame(`${who.name} patches ${hurtUnit.name}: +${n} HP`);
    };
    const sorted = byAtk(season3 ? [...new Set(survivors.filter((x) => unblocked.has(x)))] : survivors);                // one draw per distinct intermediate survivor if any hit was unblocked
    for (const x of sorted) if (hurt.includes(x)) fireSelf(x);
    for (const x of sorted) if (hurt.includes(x)) firePatch(x);
    const credits = [];
    resolveFaints(credits);
    // Attack venom is announced attacker-side first, independently of incoming-hit order.
    poisoned.sort((a, b) => (a[3] === 'you' ? 0 : 1) - (b[3] === 'you' ? 0 : 1));
    for (const [source, unit, n] of poisoned) {
      if (st.you.includes(unit) || st.them.includes(unit)) {
        unit._poison = (unit._poison || 0) + n;
        frame(`${source.name} poisons ${unit.name}: venom ${unit._poison}`);
      }
    }
    if (season4 && attackEffects) {
      const attacks = list.filter(h => h.source && h.venom !== false).sort((a, b) => (sideOf(a.source) === 'you' ? 0 : 1) - (sideOf(b.source) === 'you' ? 0 : 1));
      const seen = new Set();
      for (const {source, unit, amount} of attacks) {
        if (seen.has(source)) continue; seen.add(source);
        const alive = unit.hp > 0 && !unit.fainted && st[sideOf(unit)].includes(unit);
        if (alive && amount > 0 && keyword(source, 'venom')) { unit._poison = (unit._poison || 0) + keyword(source, 'venom'); frame(`${source.name} poisons ${unit.name}: venom ${unit._poison}`); }
        if (source.hp <= 0 || source.fainted || !st[sideOf(source)].includes(source)) continue;
        if (keyword(source, 'lifesteal')) { const n = Math.max(1, Math.floor((source._attackPower ?? source.atk) / 2)); source.hp += n; frame(`${source.name} drinks the hit: +${n} HP`); }
        if (alive && keyword(source, 'leech')) { const n = Math.min(unit.atk, keyword(source, 'leech')); if (n) { source.atk += n; unit.atk -= n; frame(`${source.name} leeches ${n} ATK from ${unit.name}`); } }
        if (alive && keyword(source, 'muzzle')) silence(source, unit);
      }
      const reflected = new Set();
      for (const {source, unit} of attacks) {
        if (reflected.has(unit) || !reflectEffects) continue; reflected.add(unit);
        const n = keyword(unit, 'reflect');
        if (n && unit.hp > 0 && !unit.fainted && source.hp > 0 && !source.fainted) hit([{unit:source,amount:n,source:unit,venom:false}], `${unit.name} reflects ${n} to ${source.name}`, false);
      }
    }
    if (credits.length && faintDepth === 0) lastStanding();
    for (const [unit, side] of credits) creditKnockout(unit, side);
    if (season4 && attackEffects && frenzyDepth === 0) for (const killer of new Set(credits.map(([x])=>x._lastHitBy))) {
      if (killer && !killer.fainted && killer.hp > 0 && itemOf(killer) === 'scoreboard') {
        killer.atk += 3; killer.hp += 3; frame(`Scoreboard: ${killer.name} +3/+3`);
      }
    }
  };

  let faintDepth = 0, frenzyDepth = 0;
  const resolveFaints = (credits = null) => {                                                       // client inner IIFE of `y`
    faintDepth++;
    try {
    for (;;) {
      const dead = [...st.you, ...st.them].filter((x) => x.hp <= 0 && !x.fainted);
      if (dead.length === 0) return;
      const x = byAtk(dead)[0];
      // (caffeinate is resolved inside hit(): a unit with it unused never reaches 0 HP from a hit)
      x.fainted = true;
      const side = sideOf(x); const idx = st[side].indexOf(x);
      st[side].splice(idx, 1);
      frame(`${x.name} is knocked out`);
      onFaint(x, side, idx);
      if (season3) {
        // Aura bonuses persist only while the source lives.  Remove them after
        // its faint effect, before subsequent reactors inspect current ATK.
        fadeAura(x);
        // Reactors run in board order, our team before theirs, regardless of
        // which side lost the unit. They are not sorted by attack.
        for (const reactor of [...st.you, ...st.them]) {
          if (reactor.hp <= 0 || reactor.fainted) continue;
          const k = kitOf(reactor);
          const reactorSide = sideOf(reactor);
          if (k?.trigger === 'enemyFaints' && reactorSide !== side) {
            reactor.atk += eff(reactor, k.effect.atk); reactor.hp += eff(reactor, k.effect.hp);
            frame(`${reactor.name} gains +${eff(reactor, k.effect.atk)}/+${eff(reactor, k.effect.hp)}`);
            continue;
          }
          if (k?.trigger !== 'friendFaints' || reactorSide !== side) continue;
          if (k.effect.kind === 'gainStats') {
            reactor.atk += eff(reactor, k.effect.atk); reactor.hp += eff(reactor, k.effect.hp);
            frame(`${reactor.name} gains +${eff(reactor, k.effect.atk)}/+${eff(reactor, k.effect.hp)}`);
          } else if (k.effect.kind === 'buffAllFriends') {
            for (const a of st[side]) if (a !== reactor) { a.atk += eff(reactor, k.effect.atk); a.hp += eff(reactor, k.effect.hp); }
            frame(`${reactor.name} routes the work: +${eff(reactor, k.effect.atk)}/+${eff(reactor, k.effect.hp)} to each friend`);
          } else if (k.effect.kind === 'fillEmpty') {
            while (st[side].length < 3) summon(side, st[side].length, { name: 'Specialist', atk: 1, hp: 1 });
          }
        }
        if (credits) credits.push([x, side]);
        else creditKnockout(x, side);
      }
    }
    } finally {
      // Nested faint damage must finish summons and every faint reactor first.
      // This also fires after direct seat/venom damage ends the battle.
      if (--faintDepth === 0) lastStanding();
    }
  };

  const pickRandom = (list, n) => {                                                     // client `k`
    const pool = [...list]; const out = [];
    while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  };

  const onFaint = (x, side, idx) => {                                                   // client `w`
    const k = kitOf(x);
    const behindAtFaint = st[side][idx] || null;
    if (k?.trigger === 'faint') {
      const ef = k.effect;
      if (ef.kind === 'buffRandomFriends') {
        for (const n of pickRandom(st[side], ef.count)) { n.atk += eff(x, ef.atk); n.hp += eff(x, ef.hp); frame(`${x.name} hands ${n.name} +${eff(x, ef.atk)}/+${eff(x, ef.hp)}`); }
      } else if (ef.kind === 'buffNearestBehind') {
        for (const a of st[side].slice(idx, idx + ef.count)) { a.atk += eff(x, ef.atk); a.hp += eff(x, ef.hp); frame(`${x.name} rallies ${a.name}: +${eff(x, ef.atk)}/+${eff(x, ef.hp)}`); }
      } else if (ef.kind === 'summon') {
        summon(ef.side === 'ally' ? side : other(side), ef.side === 'ally' ? idx : 0,
          { ...ef, atk: eff(x, ef.atk), hp: eff(x, ef.hp) });
      } else if (ef.kind === 'damageEveryone') {
        hit([...st.you, ...st.them].map((u) => ({ unit: u, amount: eff(x, ef.damage), source: x })), `${x.name} blows up: ${eff(x, ef.damage)} damage to everyone`);
      } else if (ef.kind === 'pingFront') {
        const tgt = targeted(side, st[other(side)][0]);
        if (tgt) hit([{ unit: tgt, amount: eff(x, ef.damage), source: x }], `${x.name} pokes ${tgt.name}: ${eff(x, ef.damage)}`);
      } else if (ef.kind === 'giveAtkBehind') {
        // nothing to pass (flagged down to 0 ATK) = no effect and no caption (live 2026-09-19)
        const tgt = st[side][idx];
        if (tgt && x.atk > 0) { tgt.atk += x.atk; frame(`${x.name} passes its memory to ${tgt.name}: +${x.atk} ATK`); }
      } else if (ef.kind === 'reboot' && !x._rebooted && st[side].length < 3) {
        // A reboot clears damage debuffs. Genevieve's recorded second life no
        // longer takes the extra damage from its first life's vulnerability.
        x._rebooted = true; x._poison = 0; x._vulnerable = 0; x.fainted = false; x.hp = 1; x._lastHitBy = null;
        st[side].push(x); frame(`${x.name} reboots: back at 1 HP`);
      } else if (ef.kind === 'grantKeyword') {
        const a = st[side][idx]; if (a) { giveKeyword(a, ef.keyword, ef.amount);
          const name = {doubleHit:'Double hit',armor:'Armor',leech:'Leech',reflect:'Reflect'}[ef.keyword];
          frame(`${x.name} leaves ${name}${ef.keyword === 'doubleHit' ? '' : ' ' + ef.amount} to ${a.name}`); }
      } else if (ef.kind === 'silenceFront') { const a = targeted(side, st[other(side)][0]); if (a?.hp > 0) { frame(`${x.name} has the last laugh`); silence(x, a); }
      } else if (ef.kind === 'shieldBehind') {
        const tgt = st[side][idx];
        if (tgt) { shield(tgt); frame(`${x.name} shields ${tgt.name}`); }
      }
    }
    if (x.honey) summon(side, idx, DRONE);
    if (season3) {
      if (itemOf(x) === 'spareParts') summon(side, idx, { name: 'Spare bot', atk: 2, hp: 2 });
      else if (itemOf(x) === 'rallyFlag') {
        for (const a of st[side]) a.atk += 2;
        frame(`Rally flag: each friend of ${x.name} +2 ATK`);
      } else if (itemOf(x) === 'glitterBomb' && st[other(side)].length) {
        hit(st[other(side)].map((a) => ({ unit: a, amount: 2, source: x })), 'Glitter bomb: 2 damage to each enemy', false);
      }
    }
    // honey (client `w`: `e.honey && b(t, n, r)`) happens right after the faint kit, BEFORE the
    // server-only reactors below; the unit that stood behind is captured before the Drone lands.
    const behind = behindAtFaint;
    if (behind && !behind.fainted) {
      const bk = kitOf(behind);
      if (bk?.trigger === 'friendAheadFaints') {
        if (bk.effect.kind === 'gainAttack') { const n = eff(behind, bk.effect.amount); behind.atk += n; frame(`${behind.name} covers the fall: +${n} ATK`); }
        else if (bk.effect.kind === 'summonInPlace' && !behind._usedOnce) { behind._usedOnce = true; summon(side, idx, bk.effect); }
      }
    }
    if (!season3) creditKnockout(x, side);
  };

  // Season 3 awards KO credit after faint reactors and attack venom have resolved.
  const creditKnockout = (x, side) => {
    const killer = x._lastHitBy;
    if (killer && !killer.fainted && killer.hp > 0 && sideOf(killer) !== side) {
      const kk = kitOf(killer);
      if (kk?.trigger === 'knockOut') {
        if (kk.effect.kind === 'gainVictimAttack') { killer.atk += x.atk; frame(`${killer.name} takes the trophy: +${x.atk} ATK`); }
        else if (kk.effect.kind === 'attackAgain') { const a = st[side][0]; if (a) {
          frame(`${killer.name} goes into a frenzy: swings at ${a.name}`);
          const power = killer.atk, twice = hasDoubleHit(killer), damage = power * (twice ? 2 : 1);
          killer._attackPower = power;
          const hits = Array.from({length:twice ? 2 : 1}, () => ({unit:a,amount:power,source:killer}));
          const behind = st[side][1], splash = keyword(killer, 'splash') + (itemOf(killer) === 'shredder' ? 3 : 0);
          const excess = behind && keyword(killer, 'overkill') ? excessHit(killer,a,damage) : 0;
          if (behind && splash) hits.push({unit:behind,amount:splash,source:killer,venom:false});
          if (behind && excess) hits.push({unit:behind,amount:excess,source:killer,venom:false});
          frenzyDepth++;
          try { hit(hits, `${killer.name} hits ${a.name}: -${damage} HP${behind && splash ? `; ${killer.name} splashes ${behind.name}: -${splash} HP` : ''}${excess ? `; ${killer.name}'s overkill hits ${behind.name}: -${excess} HP` : ''}`, true, true, false); } finally { frenzyDepth--; }
        } }
        if (kk.effect.kind === 'gainStats') { killer.atk += eff(killer, kk.effect.atk); killer.hp += eff(killer, kk.effect.hp); frame(`${killer.name} snowballs the knock-out: +${eff(killer, kk.effect.atk)}/+${eff(killer, kk.effect.hp)}`); }
        else if (kk.effect.kind === 'heal') { const n = eff(killer, kk.effect.amount); killer.hp += n; frame(`${killer.name} drains the knock-out: +${n} HP`); }
      }
    }
  };

  // ================================================================ start of battle
  if (season4) for (const side of ['you', 'them']) {
    if (relics[side].includes('bubble')) shield(st[side][0]);
    if (relics[side].includes('alchemist')) for (const x of st[side]) if (x.fusedWith) { x.atk += 2; x.hp += 2; }
    // Mutiny removes seat/crew/captain bonuses, not the Alchemist relic bonus.
    for (const x of st[side]) { x._baseAtk = x.atk; x._baseHp = x.hp; }
  }
  frame(season3 ? 'The fight starts' : 'The teams square up');
  if (season4) for (const side of ['you', 'them']) for (const id of relics[side]) {
    const mine = st[side], front = mine[0], your = side === 'you' ? 'your' : 'their';
    const names = {helmets:'Helmets',fangs:'Fangs',sticky:'Sticky',doubleTap:'Double tap',vampire:'Vampire',quickDraw:'Quick draw',hotfix:'Hotfix',encore:'Encore',wideSwing:'Wide swing',jammer:'Jammer',bubble:'Bubble',loudCrew:'Loud crew',alchemist:'Alchemist'};
    let caption;
    if (id === 'helmets' || id === 'fangs' || id === 'vampire') {
      const kind = {helmets:'armor',fangs:'venom',vampire:'lifesteal'}[id];
      mine.forEach(x => giveKeyword(x, kind));
      caption = `all ${your} bots have ${id === 'helmets' ? 'Armor 1' : id === 'fangs' ? 'Venom 1' : 'Lifesteal'}`;
    } else if (id === 'sticky') { mine.forEach(x => x.honey = true); caption = `all ${your} bots have honey`; }
    else if (id === 'doubleTap' || id === 'quickDraw' || id === 'wideSwing') {
      giveKeyword(front, {doubleTap:'doubleHit',quickDraw:'firstStrike',wideSwing:'splash'}[id]);
      caption = `${your} front bot has ${id === 'doubleTap' ? 'Double hit' : id === 'quickDraw' ? 'First strike' : 'Splash 1'}`;
    } else if (id === 'bubble') { caption = `${your} front bot starts with Shield`; }
    else if (id === 'hotfix') caption = `every number in ${your} bots' abilities is +1`;
    else if (id === 'encore') caption = `${your} bots' start-of-battle abilities fire twice`;
    else if (id === 'jammer') caption = `${your} front bot silences ${side === 'you' ? 'the enemy' : 'your bot'} across`;
    else if (id === 'loudCrew') caption = `${your} crews turn on with one bot fewer`;
    else if (id === 'alchemist') { caption = `${your} Fusions get +2/+2 more`; }
    if (caption) frame(`${side === 'them' ? 'Enemy ' : ''}${names[id]}: ${caption}`);
  }
  // Season-2 seat rules that act at start of battle (seat-major, you before them)
  const encore = new Set();
  for (let si = 0; si < 3; si++) {
    const rule = seatRule[si];
    if (!rule) continue;
    for (const side of ['you', 'them']) {
      const arr = st[side];
      const x = si === 2 ? arr[arr.length - 1] : arr[si];   // back = LAST unit, not index 2
      if (!x) continue;
      if (rule === 'spotlight') { x.atk += 2; frame(`Spotlight: ${x.name} +2 ATK`); }
      else if (rule === 'pit_stop') { x.hp += 3; frame(`Pit stop: ${x.name} +3 HP`); }
      else if (rule === 'warm_up') { x.atk += 1; x.hp += 1; frame(`Warm-up: ${x.name} +1/+1`); }
      else if (season4 && rule === 'buddySystem') {
        const i = arr.indexOf(x);
        for (const a of [arr[i - 1], arr[i + 1]].filter(Boolean)) { a.hp += 2; frame(`Buddy system: ${a.name} +2 HP`); }
      } else if (season4 && (rule === 'toolBelt' && itemOf(x) || rule === 'powerCouple' && x.fusedWith)) {
        x.atk += 2; x.hp += 2; frame(`${rule === 'toolBelt' ? 'Tool belt' : 'Power couple'}: ${x.name} +2/+2`);
      } else if (season4 && rule === 'quietZone') { x._silenced = true; frame(`Quiet zone: ${x.name} has no ability this fight`); }
      else if (rule === 'encore') { if (['startOfBattle', 'aura'].includes(kitOf(x)?.trigger) && kitOf(x)?.effect?.kind !== 'fromRound') { encore.add(x); frame(`Encore: ${x.name}`); } }
    }
  }
  if (season3) {
    // Crews use the opening board, before any unit can be summoned or faint.
    // The public rules place them after seats and before abilities.
    const active = {};
    const crewsOf = x => x.crews || (x.crew ? [x.crew] : catalog.byName(x.name)?.crews || [catalog.byName(x.name)?.crew].filter(Boolean));
    for (const side of ['you', 'them']) {
      const counts = {};
      for (const x of st[side]) for (const crew of crewsOf(x)) counts[crew] = (counts[crew] || 0) + 1;
      const loud = season4 && relics[side].includes('loudCrew') ? 1 : 0;
      active[side] = Object.keys(counts).filter(c => counts[c] + loud >= 2 && CREWS[c]).map(crew => ({crew,
        n: Math.min(3, counts[crew] + loud), units: st[side].filter(x => crewsOf(x).includes(crew))}));
      for (const a of active[side]) {
        if (a.crew === 'marketing') continue;
        const b = CREWS[a.crew][a.n];
        const targets = a.crew === 'builders' ? st[side].slice(0, 1) : a.units;
        for (const x of targets) { x.atk += b.atk; x.hp += b.hp; }
        const prefix = side === 'you' ? '' : 'Enemy ';
        const scope = a.crew === 'builders' ? (side === 'you' ? 'your front bot' : 'their front bot')
          : season4 && a.units.length === 1 && [st[side][0], st[side].at(-1)].includes(a.units[0]) ? `${side === 'you' ? 'your' : 'their'} ${a.units[0] === st[side][0] ? 'front' : 'back'} bot` : `${season4 ? a.units.length : a.n} of ${side === 'you' ? 'your' : 'their'} bots`;
        const stat = b.atk && b.hp ? `+${b.atk}/+${b.hp}` : b.atk ? `+${b.atk} ATK` : `+${b.hp} HP`;
        frame(`${prefix}${a.crew[0].toUpperCase() + a.crew.slice(1)} crew: ${stat} to ${scope}`);
      }
    }
    for (const side of ['you', 'them']) {
      const captain = side === 'you' ? (opts.ourCaptain || opts.captains?.you) : (opts.theirCaptain || opts.captains?.them);
      if (captain === 'drill' && st[side][0]) {
        st[side][0].atk += 2;
        frame(`${side === 'you' ? 'Drill' : 'Enemy Drill'}: +2 ATK to ${side === 'you' ? 'your' : 'their'} front bot`);
      } else if (season4 && captain === 'heckler' && st[other(side)][0]) {
        const x = st[other(side)][0], n = Math.min(2, x.atk); x.atk -= n;
        frame(`${side === 'you' ? '' : 'Enemy '}Heckler: -2 ATK to ${side === 'you' ? 'their' : 'your'} front bot`);
      } else if (season4 && (captain === 'veteran' || captain === 'gearhead')) {
        const targets = captain === 'veteran' ? st[side].slice(1, 2) : st[side].filter(x => itemOf(x));
        const n = captain === 'veteran' ? round : 1;
        for (const x of targets) { x.atk += n; x.hp += n; }
        if (targets.length && n) frame(`${side === 'you' ? '' : 'Enemy '}${captain === 'veteran' ? 'Veteran' : 'Gearhead'}: +${n}/+${n} to ${targets.length === 1 && [st[side][0],st[side].at(-1)].includes(targets[0]) ? `${side === 'you' ? 'your' : 'their'} ${targets[0] === st[side][0] ? 'front' : 'back'} bot` : `${targets.length} of ${side === 'you' ? 'your' : 'their'} bots`}`);
      } else if (captain === 'medic' && st[side].length) {
        st[side][st[side].length - 1].hp += 3;
        frame(`${side === 'you' ? 'Medic' : 'Enemy Medic'}: +3 HP to ${side === 'you' ? 'your' : 'their'} ${st[side].length === 1 ? 'front' : 'back'} bot`);
      }
    }
    if (season4) for (const x of [...st.you, ...st.them]) { x._bonusAtk = Math.max(0, x.atk - x._baseAtk); x._bonusHp = Math.max(0, x.hp - x._baseHp); }
    const marketing = ['you', 'them'].flatMap((side) => {
      const a = active[side].find(a => a.crew === 'marketing');
      return a ? st[other(side)].map((unit) => ({ unit, amount: CREWS.marketing[a.n].damage })) : [];
    });
    if (marketing.length) {
      const ya = active.you.find(a => a.crew === 'marketing'), ta = active.them.find(a => a.crew === 'marketing');
      const caption = ya && ta
        ? ya.n === ta.n
          ? `Both Marketing crews: ${CREWS.marketing[ya.n].damage} damage to each enemy`
          : `Marketing crews: ${CREWS.marketing[ya.n].damage} damage to each enemy, ${CREWS.marketing[ta.n].damage} to each of your bots`
        : ya ? `Marketing crew: ${CREWS.marketing[ya.n].damage} damage to each enemy`
          : `Enemy Marketing crew: ${CREWS.marketing[ta.n].damage} damage to each of your bots`;
      hit(marketing, caption);
    }
    // Silence equipment resolves before equipped start effects and before kits.
    for (const side of ['you', 'them']) {
      if (season4 && relics[side].includes('jammer') && st[side][0]) silence(st[side][0], targeted(side, st[other(side)][0]));
      for (const x of [...st[side]]) {
        const item = itemOf(x);
        const enemy = st[other(side)];
        if (item === 'killSwitch') {
          for (const a of enemy) silence(x, a);
        } else if (item === 'muteButton') {
          const target = targeted(side, enemy[st[side].indexOf(x)]);
          silence(x, target);
        }
      }
    }
    for (const side of ['you', 'them']) for (const x of [...st[side]]) {
      if (x.hp <= 0 || x.fainted) continue;
      const item = itemOf(x);
      if (item === 'muteButton') { x.hp += 1; frame(`Mute button: ${x.name} +1 HP`); }
      else if (item === 'killSwitch') { x.hp += 1; frame(`Kill switch: ${x.name} +1 HP`); }
      else if (item === 'stapler') { x.atk += 2; frame(`Stapler: ${x.name} +2 ATK`); }
      else if (item === 'bubbleWrap') { x.hp += 3; frame(`Bubble wrap: ${x.name} +3 HP`); }
      else if (item === 'backupDrive') { x.hp += 1; frame(`Backup drive: ${x.name} +1 HP`); }
      else if (item === 'energyDrink') { x.atk += 3; frame(`Energy drink: ${x.name} +3 ATK`); }
      else if (item === 'echoChip') { x.hp += 2; frame(`Echo chip: ${x.name} +2 HP`); if (!encore.has(x) && ['startOfBattle', 'aura'].includes(kitOf(x)?.trigger) && kitOf(x)?.effect?.kind !== 'fromRound') { encore.add(x); frame(`Echo chip: ${x.name} will fire twice`); } }
      else if (item === 'teamBadge' && st[side].length > 1) { for (const a of st[side]) if (a !== x) a.hp += 1; frame(`Team badge: each friend of ${x.name} +1 HP`); }
      else if (item === 'pizzaParty' && st[side].length > 1) { for (const a of st[side]) if (a !== x) { a.atk += 1; a.hp += 1; } frame(`Pizza party: each friend of ${x.name} +1/+1`); }
      if (season4 && relics[side].includes('encore') && !encore.has(x) && ['startOfBattle', 'aura'].includes(kitOf(x)?.trigger) && kitOf(x)?.effect?.kind !== 'fromRound') {
        encore.add(x); frame(`Encore: ${x.name} will fire twice`);
      }
      if (season4 && item === 'espressoShot') { giveKeyword(x, 'firstStrike'); frame(`Espresso shot: ${x.name} strikes first this fight`); }
      else if (season4 && item === 'hotSauce') { giveKeyword(x, 'venom'); frame(`Hot sauce: ${x.name} poisons with each hit this fight`); }
      else if (season4 && item === 'candyBar') { giveKeyword(x, 'doubleHit'); frame(`Candy bar: ${x.name} hits twice this fight`); }
      else if (season4 && item === 'umbrella') { const a = st[side][st[side].indexOf(x) + 1]; if (a) { shield(a); frame(`Umbrella: ${x.name} shields ${a.name}`); } }
      else if (season4 && (item === 'onion' || item === 'tipJar')) {
        const a = targeted(side, st[other(side)][st[side].indexOf(x)]);
        if (a) { const n = Math.min(a.atk, item === 'onion' ? 3 : 2); a.atk -= n;
          if (item === 'tipJar') { x.atk += n; frame(`Tip jar: ${x.name} steals ${n} ATK from ${a.name}`); }
          else frame(`Onion: ${a.name} -${n} ATK`);
        }
      }

    }
      // (Relic Encore is announced in board order alongside item starts.)
    // Damage equipment fires only after both teams' item stat bonuses.
    for (const side of ['you', 'them']) for (const x of [...st[side]]) {
      if (x.hp <= 0 || x.fainted) continue;
      if (itemOf(x) === 'megaphone') {
        // The item hits the back directly; it neither follows kit taunt targeting nor
        // applies the holder's venom (complete live records, 2026-09-21).
        const target = st[other(side)].at(-1);
        if (target) hit([{ unit: target, amount: 4, source: x }], `Megaphone: ${x.name} hits ${target.name} for 4`, false);
      }
    }
  }
  // Copies immediately fire start effects. An Encore repetition can then fire the copied
  // effect even when its usual trigger is later (recorded LearnBot copying Echo).
  const fireStartEffect = (x, depth = 0, copiedFrom = null) => {
    if (depth > 3) return;
    // The immediate copy uses the source's modified effect. Subsequent triggers use the
    // copying holder's item (including an Encore repetition of the copied ability).
    const power = (value) => eff(copiedFrom || x, value);
    if (x.hp <= 0 || x.fainted) return;
    const side = sideOf(x); const k = kitOf(x);
    if (season3 && k?.trigger === 'aura') {
      const targets = k.effect.kind === 'friendAttack' ? st[side].filter((a) => a !== x)
        : k.effect.kind === 'aheadAttack' ? st[side].slice(Math.max(0, st[side].indexOf(x) - 1), st[side].indexOf(x))
        : k.effect.kind === 'behindAttack' ? st[side].slice(st[side].indexOf(x) + 1, st[side].indexOf(x) + 2) : st[other(side)];
      const sign = k.effect.kind === 'enemyAttack' ? -1 : 1;
      const amount = k.effect.kind === 'enemyAttack' ? k.effect.amount : power(k.effect.amount);
      const deltas = x._aura?.deltas || new Map();
      for (const a of targets) {
        const delta = Math.max(0, a.atk + sign * amount) - a.atk;
        a.atk += delta; deltas.set(a, (deltas.get(a) || 0) + delta);
      }
      x._aura = { kind: k.effect.kind, amount, deltas };
      frame(`${x.name} lights its aura`);
      return;
    }
    if (!k || !k.effect) return;
    const ef = k.effect;
    if (!seatOk(k, side, x)) return;
    const mine = st[side]; const theirs = st[other(side)];
    const i = mine.indexOf(x);
    if (ef.kind === 'gainStats') { x.atk += power(ef.atk); x.hp += power(ef.hp); frame(`${x.name} gains +${power(ef.atk)}/+${power(ef.hp)}`); }
    else if (ef.kind === 'gainHp') { const n = power(ef.amount); x.hp += n; frame(modernEffects ? `${x.name} gains +${n} HP` : `${x.name} bulks up: +${n} HP`); }
    else if (ef.kind === 'buffFrontmost') { const a = mine[0]; if (a) { const n = power(ef.atk); a.atk += n; frame(`${x.name} juiced ${a.name}: +${n} ATK`); } }
    else if (ef.kind === 'giveAttackPercentAhead') {
      const a = i > 0 ? mine[i - 1] : null;
      if (a) { const n = Math.floor((x.atk * ef.percent) / 100); a.atk += n; frame(`${x.name} hypes ${a.name}: +${n} ATK`); }
    } else if (ef.kind === 'giveAttackPercentAheadThenFaint') {
      const a = i > 0 ? mine[i - 1] : null;
      const n = Math.floor((x.atk * ef.percent) / 100);
      if (a) a.atk += n;
      x.hp = 0; resolveFaints();
      if (a) frame(`${x.name} hands ${a.name} +${n} ATK`);
    } else if (ef.kind === 'buffAhead') {
      const a = i > 0 ? mine[i - 1] : null;
      if (a) { const n = power(ef.hp); a.hp += n; frame(`${x.name} pads ${a.name}: +${n} HP`); }
    } else if (ef.kind === 'healFront') {
      const a = mine[0];
      if (a) { const n = power(ef.amount); a.hp += n; frame(`${x.name} heals ${a === x ? 'itself' : a.name}: +${n} HP`); }
    } else if (ef.kind === 'snipe' || ef.kind === 'snipeLast') {
      let tgt = null;
      if (ef.target === 'front') tgt = theirs[0];
      else if (ef.target === 'middle') tgt = theirs[1];
      else if (ef.target === 'last' || ef.kind === 'snipeLast') tgt = theirs[theirs.length - 1];
      else if (ef.target === 'sameSeat') tgt = theirs[i];
      tgt = targeted(side, tgt);
      if (!tgt) return;
      const n = power(ef.damage);
      const kitId = x._copiedKitId || x.kitId;
      const cap = kitId === 'mosquito' ? `${x.name} snipes ${tgt.name} for ${n}`
        : kitId === 'pin' ? `${x.name} pins ${tgt.name}: ${n}`
        : kitId === 'sidestep' ? `${x.name} sideswipes ${tgt.name}: ${n}`
        : (kitId === 'backtap' || ef.kind === 'snipeLast') && n <= 2 ? `${x.name} clips ${tgt.name}: ${n}`
        : ef.kind === 'snipeLast' ? `${x.name} has the last word: ${n} to ${tgt.name}`
        : (kitId === 'last_word' || kitId === 'backtap') ? `${x.name} has the last word: ${n} to ${tgt.name}`
        : `${x.name} takes the spotlight: ${n} to ${tgt.name}`;
      hit([{ unit: tgt, amount: n, source: x }], cap);
    } else if (ef.kind === 'snipeRandomEnemies') {                                  // verbatim client branch
      const chosen = pickRandom(st[other(side)], ef.count);
      const forced = season3 && ef.count === 1 ? tauntTarget(other(side)) : null;
      const r = forced ? [forced] : chosen;
      if (r.length > 0) hit(r.map((u) => ({ unit: u, amount: power(ef.damage), source: x })), `${x.name} snipes ${r.map((u) => u.name).join(', ')} for ${power(ef.damage)}`);
    } else if (ef.kind === 'moveToFront') {
      if (i > 0) { mine.splice(i, 1); mine.unshift(x); }
      frame(`${x.name} takes first seat`);
    } else if (ef.kind === 'debuffStrongestEnemy') {
      if (theirs.length === 0) return;
      const tgt = targeted(side, byAtk(theirs)[0]);
      const n = Math.min(ef.atk, tgt.atk);
      tgt.atk -= n; frame(`${x.name} flags ${tgt.name}: -${n} ATK`);
    } else if (ef.kind === 'buffAllFriends') {
      // "each friend": every OTHER unit on its side, never itself (live 2026-09-19: Master's own
      // ATK stays at its board value in every recorded frame)
      for (const a of mine) if (a !== x) { a.atk += power(ef.atk); a.hp += power(ef.hp); }
      frame(`${x.name} routes the work: +${power(ef.atk)}/+${power(ef.hp)} to each friend`);
    } else if (ef.kind === 'stealAttack') {
      const preferred = ef.target === 'strongest' ? (theirs.length ? byAtk(theirs)[0] : null) : theirs[0];
      const tgt = targeted(side, preferred);
      if (tgt) {
        const n = Math.min(ef.amount, tgt.atk);
        tgt.atk -= n; x.atk += n;
        if (n > 0) frame(`${x.name} steals ${n} ATK from ${tgt.name}`);
      }
    } else if (ef.kind === 'jam') {
      const tgt = targeted(side, theirs[0]);
      if (tgt) { tgt._skipAttacks = (tgt._skipAttacks || 0) + ef.count; frame(`${x.name} jams ${tgt.name}: skips its next ${ef.count === 1 ? 'attack' : `${ef.count} attacks`}`); }
    } else if (ef.kind === 'vulnerable') {
      const tgt = targeted(side, theirs[0]);
      if (tgt) { tgt._vulnerable = (tgt._vulnerable || 0) + ef.amount; frame(`${x.name} exposes ${tgt.name}: +${tgt._vulnerable} damage per hit`); }
    } else if (ef.kind === 'silence') {
      const tgt = targeted(side, ef.target === 'front' ? theirs[0] : theirs[i]);
      silence(x, tgt);
    } else if (ef.kind === 'shield' || ef.kind === 'shieldBehind') {
      const targets = ef.target === 'self' || ef.kind === 'shieldBehind' ? [x] : ef.target === 'front' ? mine.slice(0, 1)
        : ef.target === 'friends' ? mine.filter((a) => a !== x) : i > 0 ? [mine[i - 1]] : [];
      for (const a of targets) { shield(a); frame(a === x ? `${x.name} raises a shield` : `${x.name} shields ${a.name}`); }
    } else if (ef.kind === 'fillEmpty') {
      while (mine.length < 3) summon(side, mine.length, { name: 'New Hire', atk: 1, hp: 1 });
    } else if (ef.kind === 'buffAheadStats') {
      const a = mine[i - 1]; if (a) { a.atk += power(ef.atk); a.hp += power(ef.hp); frame(`${x.name} pads ${a.name}: +${power(ef.atk)}/+${power(ef.hp)}`); }
    } else if (ef.kind === 'sendFrontBack') {
      if (theirs.length > 1) { const a = theirs.shift(); theirs.push(a); frame(`${x.name} bounces ${a.name} to the back`); }
    } else if (ef.kind === 'volley') {
      if (theirs.length) hit(theirs.map(a => ({unit:a,amount:power(ef.damage),source:x})), `${x.name} volleys: ${power(ef.damage)} to each enemy`);
    } else if (ef.kind === 'stripBonuses') {
      const a = targeted(side, theirs[0]);
      if (a && (a._bonusAtk || a._bonusHp)) {
        const atk = Math.min(a.atk, a._bonusAtk), hp = Math.min(Math.max(0, a.hp - 1), a._bonusHp);
        a.atk = Math.max(0, a.atk - atk); a.hp = Math.max(1, a.hp - hp); a._bonusAtk = 0; a._bonusHp = 0;
        const stats = atk && hp ? `+${atk}/+${hp}` : atk ? `+${atk} ATK` : `+${hp} HP`;
        frame(`${x.name} leads a mutiny: ${a.name} loses its ${stats} bonus`);
      }
    } else if (ef.kind === 'rally') {
      const friends = mine.filter(a => a !== x);
      const atk = power(ef.atk) * friends.length, hp = power(ef.hp) * friends.length; x.atk += atk; x.hp += hp;
      if (friends.length) frame(`${x.name} rallies ${friends.length} friends: +${atk}/+${hp}`);
    } else if (ef.kind === 'sharedCrew') {
      const crews = x.crews || [x.crew]; const a = theirs.find(a => [a.crew].some(c => crews.includes(c)));
      if (a) { x.atk += power(ef.atk); x.hp += power(ef.hp); frame(`${x.name} fights for its turf against ${a.name}: +${power(ef.atk)}/+${power(ef.hp)}`); }
    } else if (ef.kind === 'copyKeywords') {
      // Server falls back to the front on an empty across seat (unlike copyAcross).
      const a = targeted(side, theirs[i] || theirs[0]); if (!a) return;
      const names = {armor:'Armor',firstStrike:'First strike',doubleHit:'Double hit',splash:'Splash',lifesteal:'Lifesteal',venom:'Venom',leech:'Leech',reflect:'Reflect',evade:'Evade',muzzle:'Muzzle',overkill:'Overkill',taunt:'Taunt'};
      const found = [], native = [], ak = kitOf(a);
      if (names[ak?.effect?.kind]) native.push([ak.effect.kind, ak.effect.amount || 1]);
      for (const kind of ['firstStrike','evade']) if (ak?.[kind]) native.push([kind,Number(ak[kind])]);
      if (!a._silenced && ['archive','quorum'].includes(a._copiedKitId || a.kitId)) native.push(['firstStrike',1]);
      if (!a._silenced && (a._copiedKitId || a.kitId) === 'jump_cut') native.push(['doubleHit',1]);
      if (!a._silenced && (a._copiedKitId || a.kitId) === 'alert') native.push(['armor',1]);
      if (itemOf(a) === 'foamPad') native.push(['armor',1]);
      // Innate keywords remain discoverable by repeated pickpocket triggers even
      // after their combat effect is suppressed. Granted keywords are consumed.
      const nativeTotals = {};
      for (const [kind, amount] of native) {
        nativeTotals[kind] = (nativeTotals[kind] || 0) + amount;
        giveKeyword(x, kind, amount);
        found.push(names[kind] + (['armor','splash','venom','leech','reflect','evade'].includes(kind) ? ` ${amount}` : ''));
      }
      const removed = { ...a._removedKeywords };
      for (const [kind, amount] of Object.entries(nativeTotals)) {
        removed[kind] = Math.max(0, (removed[kind] || 0) - amount);
        a._removedKeywords = { ...a._removedKeywords, [kind]: Math.max(amount, a._removedKeywords?.[kind] || 0) };
      }
      for (const [kind, amount] of a._keywordGrants || []) {
        const used = Math.min(amount, removed[kind] || 0); removed[kind] = (removed[kind] || 0) - used;
        const n = amount - used; if (!n) continue;
        giveKeyword(x, kind, n);
        a._removedKeywords = { ...a._removedKeywords, [kind]: (a._removedKeywords?.[kind] || 0) + n };
        found.push(names[kind] + (['armor','splash','venom','leech','reflect','evade'].includes(kind) ? ` ${n}` : ''));
      }
      frame(`${x.name} picks ${a.name}'s pocket: ${found.length ? 'takes ' + found.join(', ') : 'empty'}`);
    } else if (ef.kind === 'eatBehind') {
      const a = mine[i + 1]; if (a) { const atk = a.atk, hp = a.hp; x.atk += atk; x.hp += hp; mine.splice(i + 1, 1); a.fainted = true; frame(`${x.name} eats ${a.name}: +${atk}/+${hp}`); fadeAura(a); }
    } else if (ef.kind === 'fromRound') {
      if (round >= ef.round) { x.atk += power(ef.atk); x.hp += power(ef.hp); frame(`${x.name} reads round ${round}: +${power(ef.atk)}${ef.hp ? `/+${power(ef.hp)}` : ' ATK'}`); }
    } else if (ef.kind === 'swapAttack') {
      const a = targeted(side, theirs[i] || theirs[0]); if (a && a.atk !== x.atk) { const prev = x.atk; x.atk = a.atk; a.atk = prev; frame(`${x.name} barters with ${a.name}: ${x.atk} ATK for ${prev}`); }
    } else if (ef.kind === 'coinStats') {
      if (rnd() < 0.5) { x.atk += power(ef.atk); x.hp += power(ef.hp); frame(`${x.name} flips heads: +${power(ef.atk)}/+${power(ef.hp)}`); }
      else frame(`${x.name} flips tails: nothing`);
    } else if (ef.kind === 'copyAcross' || ef.kind === 'copyAhead') {
      // Copy-across reads the ability in this seat directly; Taunt does not
      // redirect the copy (Memelord public replay, September 24).
      const ahead = ef.kind === 'copyAcross' ? theirs[i] : i > 0 ? mine[i - 1] : null;
      if (ahead && kitOf(ahead) && !['copyAhead','copyAcross'].includes(kitOf(ahead).effect?.kind)) {
        x._copiedKitId = ahead._copiedKitId || ahead.kitId;
        frame(`${x.name} ${ef.kind === 'copyAcross' ? 'mirrors' : 'copies'} ${ahead.name}`);
        if (['startOfBattle', 'aura'].includes(kitOf(x)?.trigger) && kitOf(x)?.effect?.kind !== 'fromRound') fireStartEffect(x, depth + 1, ahead);
      }
    }
  };
  // One attack ordering, with the same seeded tie breaks as the server.
  const sob = byAtk([...st.you, ...st.them].filter((x) => ['startOfBattle', 'aura'].includes(kitOf(x)?.trigger) && kitOf(x)?.effect?.kind !== 'fromRound' && !(kitOf(x)?.effect?.kind === 'fromRound' && round < kitOf(x).effect.round)));
  for (const x of sob) {
    const times = encore.has(x) || season4 && relics[sideOf(x)].includes('encore') ? 2 : 1;
    for (let rep = 0; rep < times; rep++) {
      fireStartEffect(x);
    }
  }

  if (season4) for (const x of [...st.you, ...st.them]) if (kitOf(x)?.effect?.kind === 'fromRound') fireStartEffect(x);

  // ================================================================ exchanges
  function lastStanding() {
    if (!season3) return;
    for (const side of ['you', 'them']) {
      const last = st[side].length === 1 ? st[side][0] : null, k = kitOf(last);
      if (last && k?.trigger === 'lastStanding' && !last._lastStandingUsed) {
        last._lastStandingUsed = true;
        last.atk += eff(last, k.effect.atk); last.hp += eff(last, k.effect.hp);
        frame(`${last.name} gains +${eff(last, k.effect.atk)}/+${eff(last, k.effect.hp)}`);
      }
    }
  }
  let turn = 0;
  for (; st.you.length > 0 && st.them.length > 0 && turn < 40;) {
    // A survivor becomes last standing after the previous exchange resolves,
    // before the following Hot seat tick can kill it.
    lastStanding();
    turn += 1;
    if (turn > 1) hotSeat();
    if (season4 && turn > 1) for (const side of ['you', 'them']) for (const x of st[side]) {
      if (hasRule(side, x, 'slowBurn') && (x._slowBurn || 0) < 2) {
        x._slowBurn = (x._slowBurn || 0) + 1; x.atk++; x.hp++; frame(`Slow burn: ${x.name} +1/+1`);
      }
    }
    if (season4 && turn > 1) resolveFaints();
    if (st.you.length === 0 || st.them.length === 0) break;
    if (season3 && turn > 1) {
      for (const side of ['you', 'them']) for (const x of [...st[side]]) {
        if (!x._poison) continue;
        x.hp -= x._poison;
        if (season4) x._lastHitBy = null;
        frame(`Venom: ${x.name} -${x._poison} HP`);
      }
      resolveFaints();
      if (st.you.length === 0 || st.them.length === 0) break;
      for (const side of ['you', 'them']) for (const x of [...st[side]]) {
        if (x.hp <= 0 || x.fainted) continue;
        const k = kitOf(x), item = itemOf(x);
        if (k?.trigger === 'endExchange' && k.effect.kind === 'healFront') {
          const front = st[side][0];
          if (front) { front.hp += eff(x, k.effect.amount); frame(`${x.name} heals ${front === x ? 'itself' : front.name}: +${eff(x, k.effect.amount)} HP`); }
        }
        if (season4 && k?.trigger === 'countdown' && turn - 1 >= k.exchange && !x._timerUsed) {
          x._timerUsed = true; const ef = k.effect, atk = eff(x, ef.atk), hp = eff(x, ef.hp), stats = hp ? `+${atk}/+${hp}` : `+${atk} ATK`;
          if (ef.kind === 'gainStats') { x.atk += atk; x.hp += hp; frame(`${x.name}'s timer ends: ${stats}`); }
          else if (ef.kind === 'buffAllFriends') { for (const a of st[side]) if (a !== x) { a.atk += atk; a.hp += hp; } frame(`${x.name}'s timer ends: ${stats} to each friend`); }
          else if (ef.kind === 'pingFront') { const a = targeted(side, st[other(side)][0]), n = eff(x, ef.damage); if (a) hit([{unit:a,amount:n,source:x}], `${x.name}'s timer ends: ${n} to ${a.name}`); }
        }

        // Healing and every-second-exchange abilities share the same per-unit
        // pass, rather than completing all healing on both teams first.
        if ((turn - 1) % 2 !== 0 || k?.trigger !== 'everySecondExchange') continue;
        if (k.effect.kind === 'gainStats') {
          x.atk += eff(x, k.effect.atk); x.hp += eff(x, k.effect.hp);
          frame(`${x.name} gains +${eff(x, k.effect.atk)}/+${eff(x, k.effect.hp)}`);
        } else if (k.effect.kind === 'buffAllFriends') {
          for (const a of st[side]) if (a !== x) { a.atk += eff(x, k.effect.atk); a.hp += eff(x, k.effect.hp); }
          frame(`${x.name} routes the work: +${eff(x, k.effect.atk)}/+${eff(x, k.effect.hp)} to each friend`);
        } else if (k.effect.kind === 'snipeLast') {
          const target = targeted(side, st[other(side)].at(-1));
          const n = eff(x, k.effect.damage);
          if (target) hit([{ unit: target, amount: n, source: x }], n <= 2 ? `${x.name} clips ${target.name}: ${n}` : `${x.name} has the last word: ${n} to ${target.name}`);
        }
      }
    }
    if (season4 && turn === 3) for (const x of [...st.you, ...st.them]) if (itemOf(x) === 'eggTimer') { x.atk += 2; x.hp += 2; frame(`Egg timer: ${x.name} +2/+2`); }
    if (season3 && turn > 1) for (const x of [...st.you, ...st.them]) {
      if (x.hp > 0 && !x.fainted && itemOf(x) === 'coldBrew') { x.hp += 1; frame(`Cold brew: ${x.name} +1 HP`); }
    }
    if (season3 && turn > 25 && st.you.length && st.them.length) {
      const damage = turn - 25;
      for (const x of [...st.you, ...st.them]) { x.hp -= damage; x._lastHitBy = null; }
      frame(`Overtime: each bot -${damage} HP`);
      resolveFaints();
    }
    if (!st.you.length || !st.them.length) break;
    // Hot seat, venom or a periodic snipe can leave a different last survivor.
    lastStanding();
    if (season4) for (const side of ['you', 'them']) {
      const x = st[side][0], k = kitOf(x), a = st[other(side)][0];
      if (k?.effect?.kind === 'execute' && a && a.hp <= eff(x, k.effect.hp)) {
        const hp = a.hp; a.hp = 0; a._lastHitBy = x;
        frame(`${x.name} culls ${a.name}: ${hp} HP or less`); resolveFaints();
      }
    }
    if (!st.you.length || !st.them.length) break;
    const A = { you: st.you[0], them: st.them[0] };
    const skipped = {};
    // Before-attack kits fire even if the attack will be jammed. Recorded S3
    // Grip vs Apple Search Ads Review: Grow +1/+1, then the attack is skipped.
    const isGrow = (x) => kitOf(x)?.trigger === 'beforeAttack' && kitOf(x)?.effect?.kind === 'gainStats';
    const growers = [A.you, A.them].filter(isGrow);                                  // you first, no RNG
    for (const x of growers) { const n = eff(x, 1); x.atk += n; x.hp += n; frame(`${x.name} grows into the swing: +${n}/+${n}`); }
    if (season3) for (const side of ['you', 'them']) {
      const x = A[side];
      if (x._skipAttacks > 0) {
        x._skipAttacks -= 1; skipped[side] = true;
        frame(`${x.name} is jammed and skips its attack`);
      }
    }
    const behind = { you: st.you[1] || null, them: st.them[1] || null };               // captured BEFORE the trade
    if (!season3) {
      hit([
        { unit: A.you, amount: A.them.atk, source: A.them },
        { unit: A.them, amount: A.you.atk, source: A.you },
      ], `${A.you.name} and ${A.them.name} trade: -${A.them.atk} HP / -${A.you.atk} HP`);
    } else {
      const damage = {};
      for (const side of ['you', 'them']) {
        const x = A[side];
        x._attackPower = x.atk;
        damage[side] = skipped[side] ? 0 : x.atk * (hasDoubleHit(x) ? 2 : 1);
        if (!skipped[side] && itemOf(x) === 'laserPointer' && !x._laserUsed) {
          x._laserUsed = true; x._attackPower += 4; damage[side] += 4 * (hasDoubleHit(x) ? 2 : 1);
          frame(`Laser pointer: ${x.name}'s first hit deals +4`);
        }
      }
      // The server combines the exchange caption but resolves armor/shields per hit.
      const attackHits = (attacker, target, total) => hasDoubleHit(attacker)
        ? [{ unit: target, amount: total / 2, source: attacker },
          { unit: target, amount: total / 2, source: attacker }]
        : [{ unit: target, amount: total, source: attacker }];
      const attack = (side, kind = 'hits') => {
        if (skipped[side]) return;
        const foe = other(side), attacker = A[side], target = A[foe];
        if (!st[side].includes(attacker) || !st[foe].includes(target)) return;
        const splash = keyword(attacker, 'splash')
          + (itemOf(attacker) === 'shredder' ? 3 : 0);
        const next = behind[foe] && st[foe].includes(behind[foe]) ? behind[foe] : null;
        const hits = attackHits(attacker, target, damage[side]);
        if (splash && next) hits.push({ unit: next, amount: splash, source: attacker, venom: false });
        const overkill = season4 && keyword(attacker, 'overkill') && next ? excessHit(attacker, target, damage[side]) : 0;
        if (overkill) hits.push({unit:next,amount:overkill,source:attacker,venom:false});
        const caption = kind === 'hits' ? `${attacker.name} hits ${target.name}: -${damage[side]} HP`
          : `${attacker.name} ${kind}: -${damage[side]} HP to ${target.name}`;
        hit(hits, `${caption}${splash && next ? `; ${attacker.name} splashes ${next.name}: -${splash} HP` : ''}${overkill ? `; ${attacker.name}'s overkill hits ${next.name}: -${overkill} HP` : ''}`, true, true, kind !== 'hits');
      };
      const firstYou = hasFirstStrike(A.you) && !hasFirstStrike(A.them);
      const firstThem = hasFirstStrike(A.them) && !hasFirstStrike(A.you);
      if (!skipped.you && !skipped.them && (firstYou || firstThem)) {
        const first = firstYou ? 'you' : 'them', second = other(first);
        attack(first, 'strikes first');
        attack(second, 'hits back');
      } else if (skipped.you && skipped.them) {
        // The per-unit jam captions above are the complete server trace for this exchange.
      } else if (skipped.you || skipped.them) {
        attack(skipped.you ? 'them' : 'you');
      } else {
        const hits = [];
        const splash = [];
        // Incoming hits are grouped by defending team. The caption lists the
        // attackers in the opposite order, independently of damage resolution.
        for (const side of ['them', 'you']) {
          const x = A[side], foe = other(side);
          hits.push(...attackHits(x, A[foe], damage[side]));
          const n = keyword(x, 'splash')
            + (itemOf(x) === 'shredder' ? 3 : 0);
          if (season4 && keyword(x, 'overkill') && behind[foe]) {
            const excess = excessHit(x, A[foe], damage[side]);
            if (excess) { hits.push({unit:behind[foe],amount:excess,source:x,venom:false}); splash.unshift(`${x.name}'s overkill hits ${behind[foe].name}: -${excess} HP`); }
          }
          if (n && behind[foe]) {
            hits.push({ unit: behind[foe], amount: n, source: x, venom: false });
            splash.unshift(`${x.name} splashes ${behind[foe].name}: -${n} HP`);
          }
        }
        hit(hits, `${A.you.name} and ${A.them.name} trade: -${damage.them} HP / -${damage.you} HP${splash.length ? '; ' + splash.join('; ') : ''}`, true, true);
      }
    }
    lastStanding();
    // friend-ahead-attacks (echo / wake): units that stood right behind an attacker
    const isFol = (x) => x && kitOf(x)?.trigger === 'friendAheadAttacks';
    const followers = ['you', 'them'].map((sd) => behind[sd]).filter(isFol);           // you first, no RNG
    for (const x of followers) {
      if (x.fainted || x.hp <= 0) continue;
      const side = sideOf(x); const ef = kitOf(x).effect;
      if (ef.kind === 'gainStats') { x.atk += eff(x, ef.atk); x.hp += eff(x, ef.hp); frame(`${x.name} echoes the swing: +${eff(x, ef.atk)}/+${eff(x, ef.hp)}`); }
      else if (ef.kind === 'pingFront') {
        const tgt = targeted(side, st[other(side)][0]);
        if (tgt) hit([{ unit: tgt, amount: eff(x, ef.damage), source: x }], `${x.name} wakes on the swing: ${eff(x, ef.damage)} to ${tgt.name}`);
      }
    }

  }
  function hotSeat() {
    if (!seatRule.includes('hot_seat')) return;
    const list = [];
    for (const side of ['you', 'them']) for (const x of st[side]) if (hasRule(side, x, 'hot_seat')) list.push(x);
    // Direct HP loss, one caption per unit, NO hurt triggers (patch/hold/peacock/sting never react),
    // faints resolved once after the whole batch (evidence: validate.js S2 set).
    for (const x of list) {
      x.hp -= 1;
      // This is seat damage, not a hit from the previous attacker. A Hot seat KO gives no
      // knock-out credit to that attacker (recorded 2026-09-20T02:02:34.102Z).
      x._lastHitBy = null;
      frame(`Hot seat: ${x.name} -1 HP`);
    }
    if (list.length && !season4) resolveFaints();
  }

  let winner = st.you.length === 0 && st.them.length === 0 ? 'draw'
    : st.them.length === 0 ? 'you' : st.you.length === 0 ? 'them' : 'draw';
  if (turn === 40 && st.you.length && st.them.length) {
    const total = (side, field) => st[side].reduce((n, x) => n + x[field], 0);
    const hp = total('you', 'hp') - total('them', 'hp');
    const atk = total('you', 'atk') - total('them', 'atk');
    winner = hp > 0 ? 'you' : hp < 0 ? 'them' : atk > 0 ? 'you' : atk < 0 ? 'them' : 'draw';
  }
  frame(winner === 'draw' ? 'Both sides are down. Draw' : winner === 'you' ? 'Your side holds the floor' : 'The enemy side holds the floor');
  return { frames, winner, turns: turn };
}

// ---------------------------------------------------------------- public helpers
// The server seeds every rated battle with a FIXED per-round constant (same as the client practice reducer's
// `[101, 202, 303, 404]`). Historical audit: 10,065/10,065 battles reproduced frame for frame.
// Battles are therefore fully deterministic given (our board, their board, round, seat rules).
// The fourth seed is independently verified with a random-target practice fight.
const ROUND_SEEDS = [101, 202, 303, 404];

function simulate(ourUnits, theirUnits, opts = {}) {
  const round = opts.round == null ? 0 : opts.round;
  if (!Number.isInteger(round) || round < 0 || round >= ROUND_SEEDS.length) throw new Error(`Unsupported battle round ${round}`);
  const seed = opts.seed == null ? ROUND_SEEDS[round] : opts.seed;
  const r = simulateBattle(ourUnits, theirUnits, seed, { ...opts, round });
  return { winner: r.winner === 'you' ? 'us' : r.winner, frames: r.frames, turns: r.turns };
}

/** fast deterministic result: 'us' | 'them' | 'draw' */
function outcome(ourUnits, theirUnits, opts = {}) {
  return simulate(ourUnits, theirUnits, { ...opts, frames: false }).winner;
}

const permutations = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));

const unitKey = (u) => `${u.name}/${u.kitId}/${u.atk}/${u.hp}/${u.honey ? 1 : 0}/${u.crew || ''}/${u.itemId || u.item || ''}`;

/**
 * Score every distinct seat order of `units` against a pool of enemy boards; best first.
 *   pool : [board] or [{board, weight, seats}]   (per-entry seats override opts.seats)
 *   opts.utility : {win, draw, loss}, default 1 / 0.5 / 0.  Round 2 changes it: at 1-0 a draw wins
 *                  the match, at 0-1 it loses it (docs/ENGINE_SHOP.md §4.7).
 * Seat orders that differ only in which copy of a duplicate unit sits where are scored once.
 */
function bestSeating(units, pool, opts = {}) {
  const items = pool.map((e) => (Array.isArray(e) ? { board: e, weight: 1 } : e));
  const wsum = items.reduce((s, e) => s + (e.weight == null ? 1 : e.weight), 0) || 1;
  const u = opts.utility || {};
  const win = u.win == null ? 1 : u.win;
  const draw = u.draw == null ? 0.5 : u.draw;
  const loss = u.loss == null ? 0 : u.loss;
  const seen = new Set();
  const rows = [];
  for (const order of permutations(units)) {
    const k = order.map(unitKey).join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    let sc = 0;
    let pw = 0;
    let pd = 0;
    for (const e of items) {
      const battleOpts = { ...opts };
      if (e.seats !== undefined) battleOpts.seats = e.seats;
      // A live opponent captain is known after the first fight. Book entries can describe a
      // different match by that handle, so their captain is only a prior while it is hidden.
      if (opts.theirCaptain == null && opts.captains?.them == null &&
          (e.theirCaptain !== undefined || e.captain !== undefined)) {
        battleOpts.theirCaptain = e.theirCaptain ?? e.captain;
      }
      if (opts.theirRelics == null && e.theirRelics != null) battleOpts.theirRelics = e.theirRelics;
      const w = outcome(order, e.board, battleOpts);
      const wt = e.weight == null ? 1 : e.weight;
      sc += wt * (w === 'us' ? win : w === 'draw' ? draw : loss);
      if (w === 'us') pw += wt; else if (w === 'draw') pd += wt;
    }
    // wdl: the weighted win/draw/loss fractions behind the score, for match-level valuation
    rows.push({ order, score: sc / wsum, wdl: { win: pw / wsum, draw: pd / wsum, loss: 1 - (pw + pd) / wsum } });
  }
  rows.sort((x, y) => y.score - x.score);
  return rows;
}

/** Build a battle unit from catalog by name or bot id.
 *  food: 'honey' | 'potato' | 'apple' (apple may be given as apples:N for stacked apples)
 *  potato adds +2 ATK for this battle only (tempAtk), honey adds the Drone-on-faint flag;
 *  honey and potato are mutually exclusive on a unit (client reducer `feed`). */
function unitFromCatalog(nameOrId, o = {}) {
  const b = catalog.byId(nameOrId) || catalog.byName(nameOrId);
  if (!b) throw new Error('unknown bot ' + nameOrId);
  const apples = (o.apples || 0) + (o.food === 'apple' ? 1 : 0);
  let atk = b.attack + apples + (o.extraAtk || 0);
  const hp = b.health + apples + (o.extraHp || 0);
  let honey = !!o.honey || o.food === 'honey';
  let temp = o.tempAtk || 0;
  if (o.food === 'potato' || o.potato) { temp += 2; honey = false; }
  atk += temp;
  return { name: b.name, kitId: b.kitId, atk, hp, honey };
}

module.exports = { simulate, outcome, bestSeating, simulateBattle, unitFromCatalog, randStep, mulberry32, permutations, KITS, SEAT_RULES, SEAT_NAMES, ROUND_SEEDS };
