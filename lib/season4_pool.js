'use strict';
// A fixed public-board prior for an S4-empty book. Loaded lazily; never written into user memory.
const fs = require('node:fs');
const path = require('node:path');
let rows;
function pool(round, {beforeTs, excludeHandle, limit = 40} = {}) {
  if (!rows) rows = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/corpus/s4_opponents_20260923.json'), 'utf8')).rows;
  const at = beforeTs == null ? Infinity : typeof beforeTs === 'number' ? beforeTs : Date.parse(beforeTs);
  const latest = new Map();
  for (const r of rows) if (r.round === round && r.ts < at && r.handle !== excludeHandle &&
      (!latest.has(r.handle) || latest.get(r.handle).ts < r.ts)) latest.set(r.handle, r);
  return [...latest.values()].sort((a,b) => b.ts - a.ts).slice(0,limit)
    .map(r => ({board:r.board,captain:r.captain,relics:r.relics,weight:1,lastTs:r.ts}));
}
module.exports = {pool};
