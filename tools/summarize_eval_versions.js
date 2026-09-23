#!/usr/bin/env node
'use strict';
/** Combine independent --seeds SEED jobs from tools/eval_versions.js. */
const fs = require('fs');
const path = require('path');
const { parseArgs, clusteredInterval } = require('./eval_versions');

function summarize(dir, seeds = parseArgs([]).seeds, games = 50) {
  const bySeason = new Map([[1, []], [2, []]]);
  const seen = new Set();
  for (const seed of seeds) {
    const file = path.join(dir, `seed-${seed}.csv`);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    if (lines.shift() !== 'season,seed,match,handle,before,current,before_score,current_score,delta') {
      throw new Error(`bad CSV header: ${file}`);
    }
    if (lines.length !== games * 2) throw new Error(`${file}: expected ${games * 2} rows, got ${lines.length}`);
    for (const line of lines) {
      const m = line.match(/^(\d+),(\d+),(\d+),"(?:[^"]|"")*",(win|loss|draw),(win|loss|draw),([\d.]+),([\d.]+),(-?[\d.]+)$/);
      if (!m) throw new Error(`bad CSV row: ${line}`);
      const [season, rowSeed, match] = m.slice(1, 4).map(Number);
      if (!bySeason.has(season) || rowSeed !== seed || match < 1 || match > games) {
        throw new Error(`unexpected season/seed/match: ${line}`);
      }
      const key = `${season}|${seed}|${match}`;
      if (seen.has(key)) throw new Error(`duplicate ${key}`);
      seen.add(key);
      const score = (r) => r === 'win' ? 1 : r === 'draw' ? 0.5 : 0;
      const beforeScore = score(m[4]), currentScore = score(m[5]);
      if (beforeScore !== Number(m[6]) || currentScore !== Number(m[7]) ||
          currentScore - beforeScore !== Number(m[8])) throw new Error(`score mismatch: ${line}`);
      bySeason.get(season).push({ seed, before: m[4], current: m[5], delta: Number(m[8]) });
    }
  }
  const out = [];
  for (const season of [1, 2]) {
    const rows = bySeason.get(season);
    const expected = seeds.length * games;
    if (rows.length !== expected) throw new Error(`S${season}: expected ${expected} rows, got ${rows.length}`);
    const tally = (key) => rows.reduce((n, r) => { n[r[key]]++; return n; }, { win: 0, loss: 0, draw: 0 });
    const a = tally('before'), b = tally('current');
    const mean = rows.reduce((n, r) => n + r.delta, 0) / rows.length;
    const seedMeans = seeds.map((seed) => {
      const subset = rows.filter((r) => r.seed === seed);
      if (subset.length !== games) throw new Error(`S${season} seed=${seed}: expected ${games} rows`);
      return subset.reduce((n, r) => n + r.delta, 0) / games;
    });
    const [lo, hi] = clusteredInterval(seedMeans);
    const better = rows.filter((r) => r.delta > 0).length;
    const worse = rows.filter((r) => r.delta < 0).length;
    out.push({ season, n: rows.length, before: a, current: b,
      beforeWinRate: a.win / rows.length, currentWinRate: b.win / rows.length,
      beforeMatchScore: (a.win + 0.5 * a.draw) / rows.length,
      currentMatchScore: (b.win + 0.5 * b.draw) / rows.length,
      pairedDelta: mean, seedClustered95: [lo, hi], better, worse,
      same: rows.length - better - worse, seedMeans });
  }
  return out;
}

if (require.main === module) {
  const dir = process.argv[2];
  const output = process.argv[3];
  if (!dir) throw new Error('usage: node tools/summarize_eval_versions.js DIR [MERGED_CSV]');
  const results = summarize(path.resolve(dir));
  if (output) {
    const seeds = parseArgs([]).seeds;
    const head = 'season,seed,match,handle,before,current,before_score,current_score,delta';
    const chunks = [head];
    for (const seed of seeds) {
      const lines = fs.readFileSync(path.join(dir, `seed-${seed}.csv`), 'utf8').trim().split('\n');
      chunks.push(...lines.slice(1));
    }
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(path.resolve(output), chunks.join('\n') + '\n');
    console.log(`merged ${chunks.length - 1} rows to ${path.resolve(output)}`);
  }
  for (const r of results) console.log(JSON.stringify(r));
}

module.exports = { summarize };
