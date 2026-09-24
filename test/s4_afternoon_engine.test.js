'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const sim = require('../lib/sim');

// The September 24 13:38:08 archive supplies independent live inputs/frames. Enemy
// boards are joined only to attack observations from completed public replays,
// retaining equipment and fusion metadata. The two unfinished frame-inferred
// enemy boards in the archive are excluded because they lack exact item inputs.
const fights = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,
  'fixtures/s4-afternoon-live-20260924.json.gz'))));

test('all 388 complete afternoon S4 battles reproduce frames and winners, including both engine regressions', () => {
  assert.equal(fights.length, 388);
  let copyAcross = false, reboot = false, suddenDeath = 0;
  for (const r of fights) {
    const label = `${r.matchId} round ${r.options.round}`;
    const got = sim.simulate(r.us, r.them, r.options);
    assert.equal(got.winner === 'us' ? 'you' : got.winner, r.winner, label);
    assert.deepEqual(got.frames, r.frames, label);
    if (r.matchKey.endsWith(':83') && r.options.round === 2) {
      assert.equal(got.frames[17].caption, 'Memelord mirrors Red Pen Pro × Nixie');
      copyAcross = true;
    }
    if (r.matchKey.endsWith(':156') && r.options.round === 0) {
      assert.equal(got.frames[16].them[0].hp, -7,
        'Genevieve loses its first-life vulnerability when it reboots');
      reboot = true;
    }
    if (r.options.round === 3) suddenDeath++;
  }
  assert.ok(copyAcross && reboot, 'both observed engine failures remain in the fixture');
  assert.equal(suddenDeath, 1, 'the completed fourth fight uses seed 404');
});
