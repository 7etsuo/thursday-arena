'use strict';
/**
 * Chrome CDP attach for thursdayarena.com (Clerk cookies + Bearer).
 * Default: Fork-22 port 9244; auto-detects if the port moves.
 */
const { chromium } = require('playwright-core');
const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const pathLib = require('path');

const DEFAULT_PORT = 9244;
const ORIGIN = 'https://thursdayarena.com';

function httpGetJson(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout ' + url));
    });
  });
}

async function detectCdpPort(preferred = DEFAULT_PORT) {
  const candidates = new Set([preferred]);
  try {
    const out = execSync(
      "ps aux | grep -E 'remote-debugging-port=[0-9]+' | grep -v grep || true",
      { encoding: 'utf8' }
    );
    for (const m of out.matchAll(/remote-debugging-port=(\d+)/g)) {
      candidates.add(Number(m[1]));
    }
  } catch {}
  for (let p = 9222; p <= 9260; p++) candidates.add(p);

  const ordered = [
    preferred,
    ...[...candidates].filter((p) => p !== preferred),
  ];
  for (const port of ordered) {
    try {
      const list = await httpGetJson(`http://127.0.0.1:${port}/json/list`);
      if (!Array.isArray(list)) continue;
      const has = list.some(
        (t) =>
          (t.type === 'page' || t.type === 'iframe') &&
          typeof t.url === 'string' &&
          t.url.includes('thursdayarena.com')
      );
      if (has) return port;
    } catch {}
  }
  throw new Error(
    `No CDP port with thursdayarena.com tabs (tried ${ordered
      .slice(0, 15)
      .join(',')})`
  );
}

function pickPage(pages) {
  let page = pages.find(
    (p) =>
      p.url().includes('thursdayarena.com/match') &&
      !p.url().includes('/matches/')
  );
  if (page) return page;
  return pages.find((p) => p.url().includes('thursdayarena.com')) || null;
}

let _browser = null;
let _page = null;
let _port = null;
let _owned = false;   // true when we launched the browser ourselves

const PROFILE_DIR =
  process.env.ARENA_PROFILE ||
  require('path').join(require('os').homedir(), '.config', 'google-chrome-arena');

// Resolve existing ancestors too: a new profile beneath a symlink still points into its target.
function physicalPath(value) {
  let base = pathLib.resolve(value);
  const suffix = [];
  while (!fs.existsSync(base)) {
    const parent = pathLib.dirname(base);
    if (parent === base) break;
    suffix.unshift(pathLib.basename(base));
    base = parent;
  }
  return pathLib.join(fs.realpathSync(base), ...suffix);
}

function assertSafeProfile(dir, userHome = require('os').homedir()) {
  const actual = physicalPath(dir);
  for (const real of ['google-chrome', 'chromium', 'google-chrome-beta']) {
    const blocked = physicalPath(pathLib.join(userHome, '.config', real));
    if (actual === blocked || actual.startsWith(blocked + pathLib.sep)) {
      throw new Error(`refusing to automate the real Chrome profile at ${blocked}; use a dedicated profile (ARENA_PROFILE)`);
    }
  }
  return actual;
}

/**
 * Launch our own Chrome and drive it directly.
 *
 * Chrome 136+ ignores --remote-debugging-port on the default profile, and Chrome 153 gives us no
 * port even on a separate one, so attaching to the user's everyday browser is not available.
 * Playwright speaks to a browser it launched over a pipe instead, which needs no port at all.
 * The profile at ARENA_PROFILE persists, so the Clerk sign-in is a one-off.
 */
async function launch(opts = {}) {
  const dir = require('path').resolve(opts.profileDir || PROFILE_DIR);
  // NEVER the user's real profile. Playwright starts Chrome with --use-mock-keychain, so Chrome
  // cannot read the OS-keyring key its cookies are encrypted with, treats every cookie as corrupt
  // and securely wipes them — this happened on 2026-09-19 and logged the user out of every site.
  assertSafeProfile(dir);
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    // Chrome's yellow "unsupported command-line flag" bar comes from Playwright's own defaults:
    // --no-sandbox (chromiumSandbox: false is its default for a persistent context) and
    // --enable-automation. Neither is needed here, and the sandbox should stay ON in the user's
    // own browser. Dropping them changes nothing about the control channel (--remote-debugging-pipe).
    chromiumSandbox: true,
    ignoreDefaultArgs: ['--enable-automation', '--no-sandbox'],
    args: ['--no-first-run', '--no-default-browser-check'],
    // The drivers own Ctrl-C (save the book, close telemetry, then close Chrome). Playwright's own
    // handler would exit(130) first and skip all of that.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    timeout: Number(process.env.ARENA_LAUNCH_TIMEOUT_MS || 180000),
  });
  _owned = true;
  _browser = ctx;
  _page = ctx.pages()[0] || (await ctx.newPage());
  if (!_page.url().includes('thursdayarena.com')) {
    await _page.goto(ORIGIN + '/match', { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  return { browser: _browser, page: _page, port: null };
}

/** Resolve when the page has a signed-in Clerk session (GET /api/me returns 200). */
async function waitForAuth({ timeoutMs = 600000, pollMs = 3000, onWait } = {}) {
  const started = Date.now();
  let told = false;
  for (;;) {
    let status = 0;
    try {
      status = (await arenaFetch('/api/me', { timeoutMs: 10000 })).status;
    } catch {}
    if (status === 200) return true;
    if (Date.now() - started > timeoutMs) return false;
    if (!told && onWait) { onWait(status); told = true; }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

async function connect(opts = {}) {
  if (_page && !_page.isClosed()) {
    return { browser: _browser, page: _page, port: _port };
  }
  // Our own Chrome is still up but its page went away (the user closed the tab): open a new page
  // in it rather than launching a second Chrome on a profile that is already in use.
  if (_owned && _browser) {
    try {
      _page = await _browser.newPage();
      await _page.goto(ORIGIN + '/match', { waitUntil: 'domcontentloaded', timeout: 45000 });
      return { browser: _browser, page: _page, port: null };
    } catch {
      _browser = null;
      _owned = false;
    }
  }
  let port = opts.port;
  if (!port && opts.launch !== false) {
    // Attach if some browser really is exposing a port; otherwise drive our own.
    try {
      port = await detectCdpPort(opts.preferredPort || DEFAULT_PORT);
    } catch {
      return launch(opts);
    }
  }
  if (!port) port = await detectCdpPort(opts.preferredPort || DEFAULT_PORT);
  _port = port;
  _browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const pages = [];
  for (const ctx of _browser.contexts()) {
    for (const p of ctx.pages()) pages.push(p);
  }
  _page = pickPage(pages);
  if (!_page) {
    const ctx = _browser.contexts()[0];
    if (!ctx) throw new Error('CDP connected but no browser contexts');
    _page = await ctx.newPage();
    await _page.goto(ORIGIN + '/match', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  }
  return { browser: _browser, page: _page, port };
}

/** `keepOpen` leaves a browser we launched on screen (the window is the user's view of the game). */
async function disconnect({ keepOpen = false } = {}) {
  if (_owned && keepOpen) return;
  _page = null;
  _port = null;
  _owned = false;
  if (_browser) {
    try {
      await _browser.close();
    } catch {}
    _browser = null;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Authenticated fetch inside the page (Clerk Bearer + credentials).
 * `path` is site-relative (/api/...) or absolute.
 *
 * Every request carries a deadline.  page.evaluate() takes no timeout of its own
 * (playwright-core types.d.ts: evaluate(pageFunction, arg, {exposeFunctions?})), so a stalled fetch
 * used to hang the loop for ever while holding data/play_loop.lock (review R2-04).  Two belts: an
 * AbortSignal inside the page for a slow server, and a rejecting timer out here for a wedged CDP
 * channel.  A rejection is what lib/arena.js's transport retry already knows how to handle.
 *
 * `headers` comes back so lib/arena.js can honour Retry-After on a 429 (review R2-09).
 */
async function arenaFetch(path, opts = {}) {
  const { page } = await connect(opts);
  const url = path.startsWith('http') ? path : ORIGIN + path;
  const timeoutMs = opts.timeoutMs == null ? DEFAULT_TIMEOUT_MS : opts.timeoutMs;

  const run = page.evaluate(
    async ({ url, method, body, timeoutMs }) => {
      let auth = null;
      try {
        if (window.Clerk?.session) auth = await window.Clerk.session.getToken();
      } catch {}
      const headers = {
        'content-type': 'application/json',
        accept: 'application/json',
      };
      if (auth) headers.authorization = `Bearer ${auth}`;
      const init = { method: method || 'GET', credentials: 'include', headers };
      if (timeoutMs > 0 && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
        init.signal = AbortSignal.timeout(timeoutMs);
      }
      if (body !== undefined && body !== null) {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      const r = await fetch(url, init);
      const text = await r.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}
      const h = {};
      try {
        r.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
      } catch {}
      return {
        status: r.status,
        ok: r.ok,
        json,
        headers: h,
        text: text.length > 12000 ? text.slice(0, 12000) : text,
      };
    },
    { url, method: opts.method || 'GET', body: opts.body, timeoutMs }
  );

  if (!(timeoutMs > 0)) return run;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`arena fetch timed out after ${timeoutMs}ms: ${url}`)), timeoutMs + 1000);
  });
  try {
    return await Promise.race([run, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_TIMEOUT_MS,
  ORIGIN,
  PROFILE_DIR,
  detectCdpPort,
  connect,
  launch,
  waitForAuth,
  disconnect,
  arenaFetch,
  assertSafeProfile,
};
