'use strict';
/**
 * Pure model of the server's shop reducer, for look-ahead.  No I/O, no Math.random: sampleReroll
 * takes a seeded rng from the caller.
 *
 * Base rules follow the client's `sapMatchReducer` (module 74098), with live catalog and season-2
 * behavior cross-checked against logged rated actions -- see docs/ENGINE_SHOP.md §1:
 *   Base shop: 10 gold; rarity costs 3/4/5/6/7/8; sell +1; reroll -1; feed -3.
 *   Season 3 captains can change carry-over, reroll, food cost, and shop income.
 *   buy APPENDS to the end of the board (15,336/15,337 logged buys landed last) and empties the slot;
 *   reroll replaces every unfrozen slot AND re-rolls the food; freeze is a toggle and survives rerolls
 *   and rounds; move swaps with a neighbour; the board holds at most 3 units.
 *
 * State (`S`) is plain data and never mutated:
 *   {round, gold, board:[u], offers:[o|null], food, frozen:[bool], series:{you,them}, seats, season,
 *    captain, rivalCaptain, captainOffer, carry, freeRerolls, shopCosts, itemOffer,
 *    rerolls, pendingBuff, nextUid}
 *   u {uid, name, kitId, atk, hp, tempAtk, honey, potato, cost, rarity, crew?, item?}
 *   o {shopIndex, name, kitId, atk, hp, cost, rarity, frozen, crew?}
 * `offers[i] === null` means the slot holds no card we know of: emptied by a buy, or unknown because a
 * reroll has not been observed yet.  `food === null` is the same for the food slot.  A reroll therefore
 * produces a state you cannot plan a buy from -- use sampleReroll() to draw a concrete one.
 */
const catalog = require('./catalog');
const s4 = require('./season4');
const { SEAT_RULES, SEAT_NAMES, KITS } = require('./sim');

const GOLD_PER_SHOP = 10;
const REROLL_COST = 1;
const SELL_REFUND = 1;
const FOOD_COST = 3;
const BOARD_MAX = 3;
const SHOP_SLOTS = 3;
const CAPTAINS = Object.freeze({ DRILL: 'drill', MEDIC: 'medic', BANKER: 'banker', SCOUT: 'scout', CHEF: 'chef', RECRUITER: 'recruiter',
  ...Object.fromEntries(s4.CAPTAINS.map(id => [id.toUpperCase(), id])) });
const hasRelic = (S, id) => S.season >= 4 && (S.relics || []).includes(id);
const sellRefund = (S, u) => hasRelic(S, 'loyaltyCard') ? catalog.PRICES[u.rarity] || u.cost || 3 : SELL_REFUND;
// Only common item cost 2 is confirmed by live R0 practice. Later rarity prices and item draw
// weights are a mock/planner approximation until the server exposes them in observed offers.
const APPROX_ITEM_PRICES = Object.freeze({ common: 2, uncommon: 3, rare: 4, epic: 5, legendary: 6, mythic: 7 });

// The kits whose effect fires in the SHOP, read off the kit table rather than spelled out here, so
// a new shop kit cannot be modelled in one place and missed in the other (review R3-8).
const shopKit = (trigger) => Object.keys(KITS).find((k) => KITS[k].trigger === trigger) || null;
const BLOOM = shopKit('buy');        // 'bloom'   — Buy: give a random friend +1/+1
const HAND_OFF = shopKit('sell');    // 'hand_off' — Sell: give two random friends +1/+1
const SHOP_KITS = new Set([BLOOM, HAND_OFF].filter(Boolean));

// state.seats carries rule ids; state.seatShop carries the display name ("Hot seat"). Accept both.
const RULE_BY_KEY = new Map([...SEAT_RULES, ...require('./season4').SEATS]
  .map((r) => [catalog.normName(r).replace(/ /g, ''), r]));

function ruleId(v) {
  if (!v) return null;
  return RULE_BY_KEY.get(catalog.normName(v).replace(/ /g, '')) || null;
}

/** {front, middle, back} rule ids from state.seats, or from the revealed state.seatShop rows. */
function seatsFrom(state) {
  if (!state) return null;
  const out = {};
  if (state.seats && typeof state.seats === 'object') {
    for (const n of SEAT_NAMES) {
      const r = ruleId(state.seats[n]);
      if (r) out[n] = r;
    }
  }
  for (const row of state.seatShop || []) {
    if (!row || row.revealed === false) continue;
    const n = typeof row.seat === 'number' ? SEAT_NAMES[row.seat] : catalog.normName(row.seat);
    const r = ruleId(row.name);
    // the derived seat name must be one the sim knows: a row labelled "middle seat" would otherwise
    // add a key sim.js silently ignores (review R3-8)
    if (n && SEAT_NAMES.includes(n) && r && !out[n]) out[n] = r;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Which season a raw arena state belongs to.  The state zod has no `season` field in practice
 * (docs/ENGINE_BATTLE.md §1). A captain, item, S3 bot, or S3 economy field signals S3;
 * seat rules alone signal S2. This avoids classifying an old S2 replay as S3 after a refresh.
 * One definition, called from normalize(), driver/play_loop.js and mcp/server.js.
 */
function seasonOf(state) {
  const st = (state && state.state) || state || {};
  if (st.season != null) return Number(st.season);
  if (st.fusions || st.relics || st.relicOffer || st.rivalRelics ||
      [...(st.board || []), ...(st.shop?.pets || [])].some(u => u &&
        (u.fusedWith || (catalog.lookup(u) || {}).season >= 4))) return 4;
  if (st.captain != null || st.rivalCaptain != null || st.captainOffer != null || st.captainShop != null || st.carry != null ||
      st.freeRerolls != null || st.shopCosts != null || (st.shop && st.shop.item != null) ||
      (st.board || []).some((u) => u.item || u.itemId || (catalog.lookup(u) || {}).season >= 3) ||
      ((st.shop && st.shop.pets) || []).some((o) => o && (catalog.lookup(o) || {}).season >= 3)) return 3;
  return st.seats || st.seatShop ? 2 : 1;
}

function captainId(value) {
  if (!value) return null;
  const raw = typeof value === 'object' ? value.id || value.name || value.captain : value;
  const key = catalog.normName(raw).replace(/ /g, '');
  return Object.values(CAPTAINS).includes(key) ? key : null;
}

function foodCost(S) {
  return S.shopCosts && Number.isFinite(S.shopCosts.food) ? S.shopCosts.food :
    (captainId(S.captain) === CAPTAINS.CHEF ? FOOD_COST - 1 : FOOD_COST);
}

function rerollCost(S) {
  if (S.freeRerolls > 0) return 0;
  if (S.shopCosts && Number.isFinite(S.shopCosts.reroll)) return S.shopCosts.reroll;
  return S.freeRerolls == null && captainId(S.captain) === CAPTAINS.SCOUT && !S.rerolls ? 0 : REROLL_COST;
}

function normOffer(p, i, season) {
  const b = catalog.lookup(p);
  const rarity = p.rarity || (b && b.rarity) || 'common';
  return {
    shopIndex: i,
    name: b ? b.name : p.name || p.botId || 'unknown',
    kitId: b ? b.kitId : p.kitId || null,
    atk: p.atk == null ? (b ? b.attack : 0) : p.atk,
    hp: p.hp == null ? (b ? b.health : 0) : p.hp,
    cost: p.cost == null ? catalog.PRICES[rarity] || 3 : p.cost,
    rarity,
    frozen: !!p.frozen,
    ...(season >= 3 ? { crew: p.crew || (b && b.crew) || null } : {}),
  };
}

function normUnit(u, i, season) {
  const b = catalog.lookup(u);
  const rarity = u.rarity || (b && b.rarity) || 'common';
  return {
    uid: u.uid == null ? i + 1 : u.uid,
    name: b ? b.name : u.name || u.botId || 'unknown',
    kitId: b ? b.kitId : u.kitId || null,
    atk: u.atk || 0,
    hp: u.hp || 0,
    tempAtk: u.tempAtk || 0,
    honey: !!u.honey,
    potato: !!u.potato,
    cost: u.cost == null ? catalog.PRICES[rarity] || 3 : u.cost,
    rarity,
    ...(season >= 3 ? { crew: u.crew || (b && b.crew) || null, item: u.item || u.itemId || null } : {}),
    ...(season >= 4 ? catalog.fusionMeta(u.fusedWith ? u : b) : null),
  };
}

/** Arena state (envelope or bare state) -> S. `opts.season` overrides the season guess. */
function normalize(arenaState, opts = {}) {
  const st = (arenaState && arenaState.state) || arenaState || {};
  const season = opts.season != null ? Number(opts.season) : seasonOf(st);
  const pets = (st.shop && st.shop.pets) || [];
  const offers = [];
  const frozen = [];
  for (let i = 0; i < SHOP_SLOTS; i++) {
    const p = pets[i] || null;
    offers.push(p ? normOffer(p, i, season) : null);
    frozen.push(!!(p && p.frozen));
  }
  const board = (st.board || []).map((u, i) => normUnit(u, i, season));
  const uids = board.map((u) => u.uid).filter((n) => typeof n === 'number');
  const round = (st.phase && st.phase.round) != null ? st.phase.round : st.round || 0;
  return {
    round,
    suddenDeathEnabled: round === 3 || !!st.toSuddenDeath || (st.suddenDeathEnabled ?? opts.suddenDeathEnabled ?? false),
    kept: require('./match_rules').normalizeKept(st.kept),
    gold: st.gold == null ? 0 : st.gold,
    board,
    offers,
    frozen,
    food: (st.shop && st.shop.food) || null,
    series: { you: (st.wins && st.wins.you) || 0, them: (st.wins && st.wins.them) || 0 },
    seats: seatsFrom(st),
    season,
    captain: season >= 3 ? captainId(st.captain || (st.captainShop && st.captainShop.you)) : null,
    rivalCaptain: season >= 3 ? captainId(st.rivalCaptain || (st.captainShop && st.captainShop.them)) : null,
    captainOffer: season >= 3 ? (st.captainOffer || (st.captainShop && st.captainShop.offer) || null) : null,
    carry: season >= 3 ? (st.carry || 0) : 0,
    freeRerolls: season >= 3 ? (st.freeRerolls == null ? null : st.freeRerolls) : 0,
    shopCosts: season >= 3 ? (st.shopCosts || null) : null,
    itemOffer: season >= 3 && st.shop ? (st.shop.item || null) : null,
    ...(season >= 4 ? { relics: [...(st.relics || [])], rivalRelics: st.rivalRelics ? [...st.rivalRelics] : null,
      // The shop exposes the previous fight's relics. The opponent drafts again
      // before the next fight; this list is exact only in the battle response.
      rivalRelicsRound: st.rivalRelicsRound ?? (st.phase?.kind === 'battle' ? round : round - 1),
      relicOffer: st.relicOffer || null, lastResult: (st.results || []).at(-1) || null } : {}),
    rerolls: st.rerolls || 0,
    pendingBuff: null,   // the server's board is concrete: any random shop buff already landed
    nextUid: st.nextUid != null ? st.nextUid : (uids.length ? Math.max(...uids) : 0) + 1,
  };
}

// Undefined lets sim.score/target.forecast use each candidate enemy's own relics.
// Keep explicit round provenance through hypothetical next-shop transitions too.
function planningRivalRelics(S, round = S.round) {
  // No relic is drafted after the third fight. Its revealed pair remains exact
  // in the sudden-death shop, including hypothetical transitions from that fight.
  if (Number(round) === 3 && S.rivalRelicsRound === 2) return S.rivalRelics;
  return Number(S.season) >= 4 && S.rivalRelicsRound !== round ? undefined : S.rivalRelics;
}

function legal(S, a) {
  if (!a || !a.type) return 'no action';
  if (S.relicOffer?.length && a.type !== 'pickRelic') return 'pick a relic before shopping';
  switch (a.type) {
    case 'pickRelic':
      return S.season >= 4 && (S.relics || []).length < 2 && s4.RELICS.includes(a.relic) &&
        S.relicOffer?.includes(a.relic) ? true : 'relic not offered';
    case 'fuse': {
      const first = S.board[a.boardIndex], second = S.board[a.withIndex];
      return S.season >= 4 && first && second && a.boardIndex !== a.withIndex &&
        !first.fusedWith && !second.fusedWith && !S.pendingBuff?.length && s4.fusionFor(first.crew, second.crew)
        ? true : 'fusion unavailable';
    }
    case 'buy': {
      const o = S.offers[a.shopIndex];
      if (!o) return `no offer in slot ${a.shopIndex}`;
      if (S.board.length >= BOARD_MAX) return 'board is full';
      if (o.rarity === 'mythic' && S.board.some((u) => u.rarity === 'mythic')) return 'only one mythic bot allowed';
      if (S.gold < o.cost) return `not enough gold (${S.gold} < ${o.cost})`;
      return true;
    }
    case 'sell':
      return S.board[a.boardIndex] ? true : `no unit at ${a.boardIndex}`;
    case 'reroll':
      return S.gold >= rerollCost(S) ? true : `not enough gold (${S.gold} < ${rerollCost(S)})`;
    case 'feed': {
      const u = S.board[a.boardIndex];
      if (!S.food) return 'no food';
      // a food this model does not know would be paid for on a guessed effect
      if (!['apple', 'honey', 'potato'].includes(S.food)) return `unknown food ${S.food}`;
      if (!u) return `no unit at ${a.boardIndex}`;
      if (S.gold < foodCost(S)) return `not enough gold (${S.gold} < ${foodCost(S)})`;
      // `alreadyHasBoost`: honey on a honeyed unit and potato on a potatoed unit are HTTP 400
      // invalid_action (78 of them in the logs). Apple is always allowed. docs/ENGINE_SHOP.md §1.
      if (S.food === 'honey' && u.honey) return 'already honeyed';
      if (S.food === 'potato' && u.potato) return 'already potatoed';
      return true;
    }
    case 'freeze':
      return S.offers[a.shopIndex] ? true : `no offer in slot ${a.shopIndex}`;
    case 'equip':
      if (!S.itemOffer) return 'no item offer';
      if (!S.board[a.boardIndex]) return `no unit at ${a.boardIndex}`;
      return S.gold >= S.itemOffer.cost ? true : `not enough gold (${S.gold} < ${S.itemOffer.cost})`;
    case 'freezeItem':
      return S.itemOffer ? true : 'no item offer';
    case 'pickCaptain':
      return captainId(a.captain) && (S.captainOffer || []).some((c) => captainId(c.captain || c) === captainId(a.captain))
        ? true : 'captain not offered';
    case 'move': {
      if (a.dir !== 1 && a.dir !== -1) return 'dir must be 1 or -1';
      if (!S.board[a.boardIndex]) return `no unit at ${a.boardIndex}`;
      if (!S.board[a.boardIndex + a.dir]) return `no neighbour at ${a.boardIndex + a.dir}`;
      return true;
    }
    default:
      return `unknown action ${a.type}`;
  }
}

/**
 * Season-2 shop kits: bloom "Buy: give a random friend +1/+1" and hand_off "Sell: give two random
 * friends +1/+1" (docs/ENGINE_SHOP.md §2, the S2 catalog row).  The reducer picks the friends at
 * random from the board without the traded unit, and the pick is not in the state we planned from,
 * so the model books the EXPECTED value: with k friends and c picks each friend gets min(c,k)/k.
 *
 * Every case is integral except one: bloom bought onto a TWO-unit board gives both friends +0.5/+0.5,
 * and the simulator has no half-HP unit -- hp 5.5 survives a 5-damage hit that hp 5 does not, which
 * changed the answer for 31.6% of those boards (review R1-03).  So that case also records which uids
 * the single +1/+1 could have landed on; simUnitsOutcomes() turns that into the concrete boards and
 * lib/planner.js averages sim.outcome over them instead of over the stats.
 */
function spreadBuff(board, exclude, count) {
  const friends = board.filter((u) => u !== exclude);
  if (!friends.length) return { board, pending: null };
  const share = Math.min(count, friends.length) / friends.length;
  const next = board.map((u) => (u === exclude ? u : { ...u, atk: u.atk + share, hp: u.hp + share }));
  // Only a non-integral share needs resolving, and it only ever arises as "exactly one of these two".
  const pending = Number.isInteger(share) ? null : { uids: friends.map((u) => u.uid), share };
  return { board: next, pending };
}

/**
 * The concrete boards the fractional spreadBuffs stand for, with their probabilities.
 * Each group in `S.pendingBuff` says "exactly one of these uids really got +1/+1"; the stored stats
 * hold the mean, so a world adds (1 - share) to that group's winner and subtracts `share` from the
 * group's other members.  A uid that has since been sold still owns its world -- the buff went to a
 * unit that is no longer on the board.  Groups are independent, so the worlds are their product; a
 * 3-seat board can hold at most two of them, so this is 4 sims at worst.
 */
function simUnitsOutcomes(S) {
  const groups = (S.pendingBuff || []).filter((g) => g && g.uids && g.uids.length > 1);
  if (!groups.length) return [{ units: simUnits(S), p: 1 }];
  let worlds = [{ p: 1, delta: new Map() }];
  for (const g of groups) {
    const next = [];
    for (const w of worlds) {
      for (const winner of g.uids) {
        const delta = new Map(w.delta);
        for (const id of g.uids) delta.set(id, (delta.get(id) || 0) + (id === winner ? 1 - g.share : -g.share));
        next.push({ p: w.p / g.uids.length, delta });
      }
    }
    worlds = next;
  }
  return worlds.map((w) => ({
    p: w.p,
    units: S.board.map((u) => {
      const d = w.delta.get(u.uid) || 0;
      return {
        name: u.name, kitId: u.kitId, atk: u.atk + (u.tempAtk || 0) + d, hp: u.hp + d,
        honey: !!u.honey,
        ...(S.season >= 3 ? { crew: u.crew || null, item: u.item || null } : {}),
        ...(S.season >= 4 && u.fusedWith ? { botId: u.botId || catalog.byName(u.name)?.id, fusedWith: u.fusedWith, crews: u.crews } : {}),
      };
    }),
  }));
}

/** Apply one action. Pure: returns a new S and never touches the input. Throws if illegal. */
function apply(S, a) {
  const why = legal(S, a);
  if (why !== true) throw new Error(`illegal ${(a && a.type) || 'action'}: ${why}`);
  switch (a.type) {
    case 'buy': {
      const o = S.offers[a.shopIndex];
      const u = {
        uid: S.nextUid,
        name: o.name,
        kitId: o.kitId,
        atk: o.atk,
        hp: o.hp + (S.season >= 4 && S.captain === 'trainer' ? 1 : 0),
        tempAtk: 0,
        honey: false,
        potato: false,
        cost: S.season >= 4 ? catalog.PRICES[o.rarity] || o.cost : o.cost,
        rarity: o.rarity,
        ...(S.season >= 3 ? { crew: o.crew || null, item: null } : {}),
      };
      let board = [...S.board, u];                       // buy appends
      let pending = S.pendingBuff || null;
      if (o.kitId === BLOOM) {
        const r = spreadBuff(board, u, 1);
        board = r.board;
        if (r.pending) pending = [...(pending || []), r.pending];
      }
      const offers = S.offers.slice();
      const frozen = S.frozen.slice();
      offers[a.shopIndex] = null;
      frozen[a.shopIndex] = false;
      return { ...S, gold: S.gold - o.cost, board, offers, frozen, pendingBuff: pending, nextUid: S.nextUid + 1 };
    }
    case 'sell': {
      const u = S.board[a.boardIndex];
      let board = S.board.filter((_, j) => j !== a.boardIndex);   // later indices shift down
      let pending = S.pendingBuff || null;
      if (u.kitId === HAND_OFF) {
        const r = spreadBuff(board, null, 2);
        board = r.board;
        if (r.pending) pending = [...(pending || []), r.pending];
      }
      return { ...S, gold: S.gold + sellRefund(S, u), board, pendingBuff: pending };
    }
    case 'reroll': {
      const cost = rerollCost(S);
      return {
        ...S,
        gold: S.gold - cost,
        ...(S.season >= 4 ? { board: S.board.map(u => {
          const k = KITS[u.kitId];
          return k?.trigger === 'reroll' ? { ...u, atk: u.atk + (k.effect.atk || 0), hp: u.hp + (k.effect.hp || 0) } : u;
        }) } : {}),
        offers: S.offers.map((o, i) => (S.frozen[i] ? o : null)),
        itemOffer: S.itemOffer && S.itemOffer.frozen ? S.itemOffer : null,
        food: null,
        rerolls: (S.rerolls || 0) + 1,
        freeRerolls: S.freeRerolls == null ? null : Math.max(0, S.freeRerolls - 1),
        shopCosts: cost === 0 && S.shopCosts ? { ...S.shopCosts, reroll: S.freeRerolls > 1 ? 0 : REROLL_COST } : S.shopCosts,
      };
    }
    case 'feed': {
      const u = { ...S.board[a.boardIndex] };
      if (S.food === 'apple') { const n = S.season >= 4 && S.captain === 'grocer' ? 2 : 1; u.atk += n; u.hp += n; }
      else if (S.food === 'honey') {
        if (u.potato) u.tempAtk -= 2;                              // honey strips potato, and its +2
        u.potato = false;
        u.honey = true;
      } else { u.honey = false; u.potato = true; u.tempAtk += 2; } // potato: +2 ATK this battle only
      const board = S.board.slice();
      board[a.boardIndex] = u;
      return { ...S, gold: S.gold - foodCost(S), board, food: null };
    }
    case 'freeze': {
      const frozen = S.frozen.slice();
      const offers = S.offers.slice();
      frozen[a.shopIndex] = !frozen[a.shopIndex];
      offers[a.shopIndex] = { ...offers[a.shopIndex], frozen: frozen[a.shopIndex] };
      return { ...S, offers, frozen };
    }
    case 'equip': {
      const board = S.board.map((u, i) => i === a.boardIndex ? { ...u, item: S.itemOffer.item } : u);
      return { ...S, gold: S.gold - S.itemOffer.cost, board, itemOffer: null };
    }
    case 'freezeItem':
      return { ...S, itemOffer: { ...S.itemOffer, frozen: !S.itemOffer.frozen } };
    case 'pickCaptain': {
      const captain = captainId(a.captain);
      return {
        ...S,
        captain,
        captainOffer: null,
        gold: S.gold + (captain === CAPTAINS.RECRUITER ? 1 : 0) +
          (S.season >= 4 && captain === 'realtor' ? BOARD_MAX - S.board.length : 0),
        freeRerolls: captain === CAPTAINS.SCOUT ? 1 : 0,
        shopCosts: { reroll: captain === CAPTAINS.SCOUT ? 0 : 1, food: captain === CAPTAINS.CHEF ? 2 : 3 },
      };
    }
    case 'pickRelic': {
      const relics = [...(S.relics || []), a.relic];
      const next = { ...S, relics, relicOffer: null };
      if (a.relic === 'rich') next.gold += 2;
      if (a.relic === 'bulkOrder') next.offers = S.offers.map(o => o ? { ...o, cost: Math.max(0, o.cost - 1) } : o);
      if (a.relic === 'itemHoarder' && S.itemOffer) next.itemOffer = { ...S.itemOffer, cost: 0 };
      if (a.relic === 'earlyAccess') { next.offers = S.offers.map((o, i) => S.frozen[i] ? o : null); next.itemOffer = S.itemOffer?.frozen ? S.itemOffer : null; next.food = null; }
      if (a.relic === 'freshStock') {
        next.freeRerolls = (S.freeRerolls || 0) + 3;
        next.shopCosts = { ...S.shopCosts, reroll: 0 };
      }
      return next;
    }
    case 'fuse': {
      const a0 = S.board[a.boardIndex], b0 = S.board[a.withIndex], recipe = s4.fusionFor(a0.crew, b0.crew);
      const other = catalog.byName(b0.name);
      if (!other) throw new Error('Unknown fusion parent');
      const fused = { ...a0, botId: catalog.byName(a0.name).id, name: `${a0.name} × ${b0.name}`, kitId: recipe.kitId,
        fusedWith: other.id, crews: [a0.crew, b0.crew], atk: Math.max(a0.atk, b0.atk) + 2, hp: Math.max(a0.hp, b0.hp) + 2 };
      return { ...S, board: S.board.map((u, i) => i === a.boardIndex ? fused : u).filter((_, i) => i !== a.withIndex) };
    }
    case 'move': {
      const board = S.board.slice();
      const j = a.boardIndex + a.dir;
      [board[a.boardIndex], board[j]] = [board[j], board[a.boardIndex]];
      return { ...S, board };
    }
    default:
      throw new Error(`unknown action ${a.type}`);
  }
}

// Food odds per fresh shop, observed over 9,825 rated shops (docs/ENGINE_SHOP.md §1):
// R0 apple 50.2 / honey 49.8, R1-R2 honey ~50 / apple ~33 / potato ~16. The same odds apply to rerolls.
function sampleFood(round, rng) {
  const r = rng();
  if (round <= 0) return r < 0.5 ? 'apple' : 'honey';
  return r < 1 / 2 ? 'honey' : r < 5 / 6 ? 'apple' : 'potato';
}

function offerFromBot(b, i, season = 1) {
  return {
    shopIndex: i,
    name: b.name,
    kitId: b.kitId,
    atk: b.attack,
    hp: b.health,
    cost: catalog.PRICES[b.rarity] || b.cost || 3,
    rarity: b.rarity,
    frozen: false,
    ...(season >= 3 ? { crew: b.crew || null } : {}),
  };
}

/** Draw one bot with the server's per-bot rarity weights, using one RNG value. */
function sampleOfferBot(pool, rng) {
  if (!pool.length) throw new Error('cannot sample an empty offer pool');
  const weight = (bot) => bot.rarity === 'mythic' ? 0.25 : bot.rarity === 'legendary' ? 0.5 : 1;
  const total = pool.reduce((n, bot) => n + weight(bot), 0);
  let draw = rng() * total;
  for (const bot of pool) {
    draw -= weight(bot);
    if (draw < 0) return bot;
  }
  return pool[pool.length - 1];
}

function sampleItemOffer(round, rng, season = 3) {
  const pool = catalog.getItems().filter((item) => item.season <= season && item.unlockTurn <= round + 1);
  if (!pool.length) return null;
  const item = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return { item: item.id, cost: APPROX_ITEM_PRICES[item.rarity], rarity: item.rarity, frozen: false };
}

/** One future shop, with real income/carry/consumption rules and sampled unknown offers.
 * Later item prices/odds remain the same explicit approximation used by the local mock.
 */
function sampleNextShop(S, round, rng) {
  const carry = S.captain === CAPTAINS.BANKER ? Math.min(5, S.gold) : 0;
  const free = (S.captain === CAPTAINS.SCOUT ? 1 : 0) + (hasRelic(S, 'freshStock') ? 3 : 0);
  const income = (S.captain === CAPTAINS.RECRUITER ? 1 : 0) + (hasRelic(S, 'rich') ? 2 : 0)
    + (S.season >= 4 && S.captain === 'realtor' ? BOARD_MAX - S.board.length : 0)
    + (S.season >= 4 && S.captain === 'underdog' && S.lastResult === 'them' ? 4 : 0);
  const next = { ...S, round, gold: GOLD_PER_SHOP + carry + income,
    carry, board: S.board.map((u) => ({ ...u, tempAtk: 0, potato: false,
      item: u.item && catalog.itemById(u.item)?.oneUse ? null : u.item })),
    offers: S.offers.map((o, i) => S.frozen[i] && o ? { ...o,
      atk: o.atk + (S.season >= 4 && S.captain === 'freezer' ? 1 : 0),
      hp: o.hp + (S.season >= 4 && S.captain === 'freezer' ? 1 : 0) } : null),
    itemOffer: S.itemOffer?.frozen ? S.itemOffer : null,
    freeRerolls: free, shopCosts: { reroll: free ? 0 : 1,
      food: S.captain === CAPTAINS.CHEF ? 2 : 3 }, rerolls: 0, pendingBuff: null };
  return sampleStock(next, rng);
}

/** Draw unknown stock after a reroll, a new shop, or Early access. */
function sampleStock(S, rng) {
  const accessRound = S.round + (hasRelic(S, 'earlyAccess') ? 1 : 0);
  const pool = catalog.unlockedPool(accessRound, S.season);
  const offers = S.offers.map((o, i) => {
    if (o) return o;
    const next = offerFromBot(sampleOfferBot(pool, rng), i, S.season);
    if (hasRelic(S, 'bulkOrder')) next.cost = Math.max(0, next.cost - 1);
    return next;
  });
  const food = sampleFood(S.round, rng);
  let itemOffer = S.itemOffer || (S.season >= 3 ? sampleItemOffer(S.round, rng, S.season) : null);
  if (itemOffer && hasRelic(S, 'itemHoarder')) itemOffer = { ...itemOffer, cost: 0 };
  return { ...S, offers, itemOffer, food };
}

/**
 * One concrete realisation of a reroll: pays the gold, keeps the frozen slots and draws the rest
 * with replacement from the unlocked pool. Legendary has half and mythic quarter per-bot weight.
 * The new item offer is sampled too, with the documented approximation above for its unknown odds.
 */
function sampleReroll(S, rng) {
  return sampleStock(apply(S, { type: 'reroll' }), rng);
}

/** Board as the battle sees it: atk includes tempAtk (docs/ENGINE_BATTLE.md §2.1). */
function simUnits(S) {
  return S.board.map((u) => ({
    name: u.name,
    kitId: u.kitId,
    atk: u.atk + (u.tempAtk || 0),
    hp: u.hp,
    honey: !!u.honey,
    ...(S.season >= 3 ? { crew: u.crew || null, item: u.item || null } : {}),
    ...(S.season >= 4 && u.fusedWith ? { botId: u.botId || catalog.byName(u.name)?.id, fusedWith: u.fusedWith, crews: u.crews } : {}),
  }));
}

module.exports = {
  sampleStock,
  hasRelic,
  sellRefund,
  sampleNextShop,
  normalize,
  planningRivalRelics,
  legal,
  apply,
  sampleReroll,
  sampleOfferBot,
  sampleItemOffer,
  sampleFood,
  simUnits,
  simUnitsOutcomes,
  offerFromBot,
  seatsFrom,
  seasonOf,
  SEAT_NAMES,
  SHOP_KITS,
  GOLD_PER_SHOP,
  REROLL_COST,
  SELL_REFUND,
  FOOD_COST,
  BOARD_MAX,
  SHOP_SLOTS,
  PRICES: catalog.PRICES,
  CAPTAINS,
  captainId,
  foodCost,
  rerollCost,
};
