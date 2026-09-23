'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertSafeProfile } = require('../lib/cdp');

test('real Chrome profiles are refused through symlinks and nonexistent child paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-profile-test-'));
  try {
    const userHome = path.join(dir, 'user');
    const real = path.join(userHome, '.config', 'google-chrome');
    fs.mkdirSync(real, { recursive: true });
    const alias = path.join(dir, 'alias');
    fs.symlinkSync(real, alias);
    assert.throws(() => assertSafeProfile(real, userHome), /refusing/);
    assert.throws(() => assertSafeProfile(alias, userHome), /refusing/);
    assert.throws(() => assertSafeProfile(path.join(alias, 'new-profile'), userHome), /refusing/);
    assert.equal(assertSafeProfile(path.join(dir, 'arena'), userHome), path.join(dir, 'arena'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
