'use strict';

// The live format has three ordinary rounds and, only when tied, one sudden-death
// round. Historical evaluators opt out explicitly so old records keep their rules.
const NORMAL_ROUNDS = 3;
const MAX_ROUND = 3;

function normalizeKept(value) {
  if (!value || !['you', 'them'].every(side => value[side] &&
      ['hp', 'atk'].every(k => Number.isFinite(value[side][k]) && value[side][k] >= 0))) return null;
  return { you: { hp: value.you.hp, atk: value.you.atk },
    them: { hp: value.them.hp, atk: value.them.atk } };
}

function addKept(previous, frame) {
  const kept = normalizeKept(previous) || { you: { hp: 0, atk: 0 }, them: { hp: 0, atk: 0 } };
  for (const side of ['you', 'them']) for (const unit of frame?.[side] || []) {
    if (unit.hp > 0) { kept[side].hp += unit.hp; kept[side].atk += Math.max(0, unit.atk); }
  }
  return kept;
}

function tieWinner(kept) {
  const k = normalizeKept(kept);
  if (!k) return 'draw'; // Unknown survival totals do not establish either winner.
  for (const field of ['hp', 'atk']) {
    if (k.you[field] > k.them[field]) return 'you';
    if (k.you[field] < k.them[field]) return 'them';
  }
  return 'draw';
}

function decideSuddenDeath(winner, kept) {
  if (!['you', 'them', 'draw'].includes(winner)) throw new Error('Invalid sudden-death fight winner');
  const k = normalizeKept(kept);
  if (!k) throw new Error('Sudden death needs cumulative surviving HP and ATK');
  if (winner !== 'draw') return { winner, decider: 'fight', kept: k };
  const result = tieWinner(k);
  return { winner: result, decider: k.you.hp !== k.them.hp ? 'hp'
    : k.you.atk !== k.them.atk ? 'atk' : 'draw', kept: k };
}

function drawValue(options = {}) {
  const winner = tieWinner(options.kept);
  return winner === 'you' ? 1 : winner === 'them' ? 0 : 0.5;
}

function matchValue(round, series, probs, options = {}) {
  const you = series?.you || 0, them = series?.them || 0;
  if (you >= 2) return 1;
  if (them >= 2) return 0;
  if (round >= NORMAL_ROUNDS) {
    if (you !== them) return you > them ? 1 : 0;
    if (!options.suddenDeathEnabled) return 0.5;
    if (round > MAX_ROUND) return drawValue(options);
  }
  const p = probs[round];
  if (!p) return you > them ? 1 : you < them ? 0 : 0.5;
  return p.win * matchValue(round + 1, { you: you + 1, them }, probs, options)
    + p.draw * matchValue(round + 1, { you, them }, probs, options)
    + p.loss * matchValue(round + 1, { you, them: them + 1 }, probs, options);
}

function matchUtility(round, series, options = {}) {
  const out = {}, last = options.suddenDeathEnabled ? MAX_ROUND : NORMAL_ROUNDS - 1;
  for (const result of ['win', 'draw', 'loss']) {
    const p = {};
    for (let r = round; r <= last; r++) p[r] = r === round
      ? { win: +(result === 'win'), draw: +(result === 'draw'), loss: +(result === 'loss') }
      : { win: 0.5, draw: 0, loss: 0.5 };
    out[result] = matchValue(round, series, p, options);
  }
  return out;
}

module.exports = { NORMAL_ROUNDS, MAX_ROUND, normalizeKept, addKept, tieWinner,
  decideSuddenDeath, drawValue, matchValue, matchUtility };
