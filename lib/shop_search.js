'use strict';
/** Bounded search over observed shop offers. No guessed card values or future shop draws.
 * Keeps complete action sequences, including temporarily worse intermediate positions.
 * Node limits make infinite-budget comparisons reproducible; the live deadline can stop early.
 */
const shop = require('./shop_model');

function search(initial, { moves, value, width = 10, depth = 4, maxNodes = 160,
  deadline = Infinity, compare = (a, b) => a.score - b.score } = {}) {
  if (typeof moves !== 'function' || typeof value !== 'function' ||
      ![width, depth, maxNodes].every(n => Number.isInteger(n) && n >= 1)) throw new Error('invalid shop search');
  const base = { state: initial, actions: [], value: value(initial) };
  let best = base, frontier = [base], expanded = 0, stopped = false;
  const seen = new Set([key(initial)]);
  for (let d = 0; d < depth && frontier.length; d++) {
    const next = [];
    for (const node of frontier) {
      for (const move of moves(node.state)) {
        if (expanded >= maxNodes || Date.now() > deadline) { stopped = true; break; }
        let state = node.state, valid = true;
        for (const a of move.actions) {
          // Only concrete branches may be committed as a multi-action sequence. Random shop
          // triggers must return to ordinary planning after observing the server's actual roll.
          if (shop.legal(state, a) !== true) { valid = false; break; }
          state = shop.apply(state, a);
          if (shop.simUnitsOutcomes(state).length !== 1) { valid = false; break; }
        }
        if (!valid || state.board.length !== shop.BOARD_MAX) continue;
        const k = key(state);
        if (seen.has(k)) continue;
        seen.add(k); expanded++;
        const child = { state, actions: node.actions.concat(move.actions), value: value(state) };
        next.push(child);
        if (compare(child.value, best.value) > 1e-10) best = child;
      }
      if (stopped) break;
    }
    if (stopped) break;
    // Never require intermediate improvement. This is what permits crew transitions and
    // item combinations whose first purchase alone is weaker than the starting team.
    next.sort((a, b) => compare(b.value, a.value) || b.state.gold - a.state.gold || a.actions.length - b.actions.length);
    frontier = next.slice(0, width);
  }
  return { ...best, base: base.value, expanded, truncated: stopped };
}

function key(S) {
  // UIDs are transport identities; ordered unit properties determine future shop effects.
  // nextUid is omitted for equivalent branches reached through different purchase orders.
  return JSON.stringify({ ...S, nextUid: undefined,
    board: S.board.map(({ uid, ...u }) => u) });
}

module.exports = { search };
