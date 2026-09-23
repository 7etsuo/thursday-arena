'use strict';
/** Contextual counter model. Every payoff comes from sim.outcome; no card tiers or recipes.
 * A scenario specifies a complete enemy team, its captain, seats and whether we defend.
 * Robust comparisons concern this finite scenario set, not every possible Arena opponent.
 */
const sim = require('./sim');

function weightsOf(scenarios) {
  const weights = scenarios.map(e => e.weight == null ? 1 : e.weight);
  if (!weights.length || weights.some(w => !Number.isFinite(w) || w < 0)) {
    throw new Error('counter model needs nonnegative finite scenario weights');
  }
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!(sum > 0) || !Number.isFinite(sum)) throw new Error('counter model needs finite positive total weight');
  return weights.map(w => w / sum);
}

function payoff(board, scenario, opts = {}) {
  if (scenario.role != null && !['attack', 'defense'].includes(scenario.role)) throw new Error('invalid scenario role');
  const defense = scenario.role === 'defense';
  const ownCaptain = opts.ourCaptain ?? opts.captains?.you;
  const enemyCaptain = opts.theirCaptain ?? opts.captains?.them ?? scenario.theirCaptain;
  const options = { ...opts, seats: scenario.seats === undefined ? opts.seats : scenario.seats,
    captains: undefined, ourCaptain: defense ? scenario.theirCaptain : ownCaptain,
    theirCaptain: defense ? ownCaptain : enemyCaptain,
    ourRelics: defense ? scenario.theirRelics : opts.ourRelics,
    theirRelics: defense ? opts.ourRelics : opts.theirRelics ?? scenario.theirRelics };
  const result = defense ? sim.outcome(scenario.board, board, options) : sim.outcome(board, scenario.board, options);
  const won = result === (defense ? 'them' : 'us');
  const utility = { win: 1, draw: 0.5, loss: 0, ...(defense ? {} : opts.utility) };
  if (Object.values(utility).some(v => !Number.isFinite(v))) throw new Error('invalid counter utility');
  return won ? utility.win : result === 'draw' ? utility.draw : utility.loss;
}

/** Exact min_q q.values with TV(q,p) <= radius; TV = 0.5*sum(abs(q-p)).
 * Transfer at most radius probability mass from highest-value to lowest-value scenarios.
 * Zero-weight scenarios remain in the uncertainty set, so can receive adversarial mass.
 */
function worstExpectation(values, weights, radius = 0) {
  if (!values.length || values.length !== weights.length || values.some(v => !Number.isFinite(v)) ||
      !Number.isFinite(radius) || radius < 0 || radius > 1) throw new Error('invalid robust expectation');
  const p = weightsOf(weights.map(weight => ({ weight })));
  const q = p.slice(), order = values.map((_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  let left = 0, right = order.length - 1, remaining = radius;
  while (left < right && remaining > 1e-12) {
    const lo = order[left], hi = order[right];
    if (values[hi] <= values[lo]) break;
    const mass = Math.min(remaining, 1 - q[lo], q[hi]);
    q[lo] += mass; q[hi] -= mass; remaining -= mass;
    if (q[lo] >= 1 - 1e-12) left++;
    if (q[hi] <= 1e-12) right--;
  }
  return { value: q.reduce((s, w, i) => s + w * values[i], 0), weights: q,
    moved: 0.5 * q.reduce((s, w, i) => s + Math.abs(w - p[i]), 0) };
}

function profile(board, scenarios, opts = {}) {
  const weights = weightsOf(scenarios), values = scenarios.map(e => payoff(board, e, opts));
  return { board, values, weights, mean: values.reduce((s, v, i) => s + v * weights[i], 0),
    worst: Math.min(...values), scenarioKey: JSON.stringify([scenarios, opts.round, opts.season,
      opts.ourRelics, opts.theirRelics, opts.seats, opts.ourCaptain, opts.theirCaptain, opts.captains, opts.seed, opts.utility]) };
}

/** Certifies the payoff difference using the SAME adversarial distribution for both teams.
 * Subtracting two independently minimized scores would not certify a safe improvement.
 */
function compare(candidate, baseline, radius = 0) {
  if (candidate.scenarioKey !== baseline.scenarioKey || candidate.values.length !== baseline.values.length ||
      candidate.weights.length !== candidate.values.length || baseline.weights.length !== baseline.values.length ||
      candidate.weights.some((w, i) => Math.abs(w - baseline.weights[i]) > 1e-10)) {
    throw new Error('counter profiles must use the same ordered scenarios and weights');
  }
  const changes = candidate.values.map((v, i) => v - baseline.values[i]);
  return { expectedGain: changes.reduce((s, v, i) => s + v * baseline.weights[i], 0),
    worstGain: worstExpectation(changes, baseline.weights, radius).value,
    perScenario: changes };
}

/** Evaluate all six seat orders against a full team distribution, optionally requiring
 * a robust loss bound relative to a specified baseline board. Stable order breaks exact ties.
 */
function rank(board, scenarios, opts = {}) {
  if (opts.maxLoss != null && (!Number.isFinite(opts.maxLoss) || opts.maxLoss < 0)) throw new Error('invalid loss bound');
  const baseline = opts.baseline ? profile(opts.baseline, scenarios, opts) : null;
  return sim.permutations(board).map(order => {
    const p = profile(order, scenarios, opts);
    const certificate = baseline ? compare(p, baseline, opts.radius ?? 0) : null;
    return { ...p, certificate };
  }).filter(p => !p.certificate || p.certificate.worstGain >= -(opts.maxLoss || 0) - 1e-10)
    .sort((a, b) => b.mean - a.mean || b.worst - a.worst);
}

module.exports = { weightsOf, payoff, worstExpectation, profile, compare, rank };
