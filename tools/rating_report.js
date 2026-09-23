#!/usr/bin/env node
'use strict';
// Read-only public-history ledger. Both roles cover the same fetched time window.
const fs = require('node:fs');
const history = require('../lib/public_history');
if (require.main === module) {
  const file = process.argv[2] || history.DEFAULT_FILE;
  const since = process.argv[3] == null ? -Infinity : Date.parse(process.argv[3]);
  if (Number.isNaN(since)) throw new Error('Invalid since timestamp');
  console.log(JSON.stringify(history.report(JSON.parse(fs.readFileSync(file, 'utf8')), since), null, 2));
}
