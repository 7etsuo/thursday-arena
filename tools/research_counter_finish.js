'use strict';
/** Offline experiment only. The live planner does not call this policy: validation did not improve. */
const planner = require('../lib/planner'), shop = require('../lib/shop_model');
const sim = require('../lib/sim'), shopSearch = require('../lib/shop_search'), counterModel = require('../lib/counter_model');
const entriesOf = target => Array.isArray(target) ? target : target?.entries || [];

/** A finite-scenario improvement certificate relative to one fixed shop anchor. The anchor
 * survives subsequent actions so repeated planning cannot accumulate the permitted loss.
 * No claim is made about unseen scenarios outside the specified TV uncertainty ball.
 */
function counterFinishValue(S, ctx) {
  const attack = entriesOf(ctx.target), defense = entriesOf(ctx.defenseTarget).map(e => ({ ...e, role: 'defense' }));
  if (!attack.length || !defense.length || S.board.length !== shop.BOARD_MAX) return null;
  const opts = { season: S.season, round: S.round, seats: S.seats, ourCaptain: S.captain,
    theirCaptain: S.rivalCaptain, utility: ctx.utility || planner.utility(S.round, S.series) };
  const exposure = ctx.defenseWeight == null ? 0 : Math.max(0, Math.min(1, ctx.defenseWeight));
  if (!exposure) return null;
  if (!ctx.counterAnchor) {
    const base = planner.finishValue(S, ctx.target, ctx.defenseTarget, opts.utility);
    ctx.counterAnchor = { attack: counterModel.profile(base.order, attack, opts),
      defense: counterModel.profile(base.order, defense, opts), order: base.order };
  }
  const anchor = ctx.counterAnchor;
  const radius = ctx.counterRadius == null ? 0.025 : ctx.counterRadius;
  const maxLoss = ctx.counterMaxLoss == null ? 0.05 : ctx.counterMaxLoss;
  const cache = ctx.counterCache || (ctx.counterCache = new Map());
  const units = shop.simUnits(S), cacheKey = JSON.stringify(units.map(u => JSON.stringify(u)).sort());
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  let best = null;
  for (const order of sim.permutations(units)) {
    const a = counterModel.profile(order, attack, opts);
    if (a.mean < anchor.attack.mean - maxLoss - 1e-9) continue;
    const certificate = counterModel.compare(a, anchor.attack, radius);
    if (certificate.worstGain < -maxLoss - 1e-9) continue;
    const d = counterModel.profile(order, defense, opts);
    const defensive = counterModel.compare(d, anchor.defense, radius);
    if (defensive.worstGain < -1e-9) continue;
    const value = { score: a.mean, defense: d.mean, order, certificate, defensive,
      objective: a.mean + exposure * d.mean };
    if (!best || value.objective > best.objective + 1e-9 ||
        (Math.abs(value.objective - best.objective) < 1e-9 && value.score > best.score)) best = value;
  }
  cache.set(cacheKey, best);
  return best;
}

function counterFinishMove(S, ctx) {
  if (S.season < 3 || S.round !== 2 || S.board.length !== shop.BOARD_MAX) return null;
  const base = counterFinishValue(S, ctx);
  if (!base) return null;
  const found = shopSearch.search(S, { moves: planner.singleMoves,
    value: s => counterFinishValue(s, ctx) || { objective: -Infinity },
    maxNodes: 80, width: 8, depth: 4,
    compare: (a, b) => a.objective - b.objective });
  return found.actions.length && found.value.objective > base.objective + 1e-9
    ? { actions: found.actions, base, value: found.value } : null;
}

module.exports = { counterFinishValue, counterFinishMove };
