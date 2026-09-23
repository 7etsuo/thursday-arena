'use strict';
/**
 * Bot catalog: live public rows across seasons 1–4 in data/catalog.json.
 *
 * data/catalog.json began as the catalog embedded in the game client (docs/ENGINE_SHOP.md §2).
 * The current copy is the public /api/catalog snapshot; setCatalog() merges later live rows.
 *
 * Rarity, price and unlock round are tied together (official /rules.md):
 *   common 3 gold / unlockTurn 1, uncommon 4 / 2, rare 5 / 3, epic 6 / 3,
 *   legendary 7 / 3, mythic 8 / 3. Legendary offers have half weight, mythic quarter.
 */
const fs = require('fs');
const path = require('path');
const season4 = require('./season4');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const PRICES = { common: 3, uncommon: 4, rare: 5, epic: 6, legendary: 7, mythic: 8 };
const ITEMS_PATH = path.join(__dirname, '..', 'data', 'items.json');

let file = CATALOG_PATH;
let bots = null;
let byIdMap = null;
let byNameMap = null;
let poolCache = null;
let maxSeason = 1;
let items = null;
let itemByIdMap = null;
const warned = new Set();

/**
 * Point the module at another catalog file and drop the caches.  Exists so a test can exercise
 * setCatalog() without rewriting the live data/catalog.json that every other test file reads
 * (review R1-01: the shared rewrite made `npm test` flaky, 3 red runs in ~15).
 */
function setCatalogPath(p) {
  file = p || CATALOG_PATH;
  bots = null;
  byIdMap = null;
  byNameMap = null;
  poolCache = null;
  maxSeason = 1;
  return file;
}

const catalogPath = () => file;

/** Public /api/items catalog, separate from bot offers. */
function getItems() {
  if (!items) {
    try { items = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf8')); }
    catch (e) { throw new Error(`catalog: cannot read ${ITEMS_PATH}: ${e.message}`); }
    itemByIdMap = new Map(items.map((item) => [item.id, item]));
  }
  return items;
}

function itemById(id) {
  getItems();
  return (id && itemByIdMap.get(id)) || null;
}

/** case/punctuation-insensitive key: "Company Docs Q&A" -> "company docs q a" */
function normName(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function rows(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.bots)) return data.bots;
  return [];
}

function index(list) {
  bots = list;
  byIdMap = new Map();
  byNameMap = new Map();
  poolCache = new Map();
  maxSeason = 1;
  for (const b of list) {
    if (b.id) byIdMap.set(b.id, b);
    const k = normName(b.name);
    if (k && !byNameMap.has(k)) byNameMap.set(k, b);
    if ((b.season || 1) > maxSeason) maxSeason = b.season || 1;
  }
  return bots;
}

function getCatalog() {
  if (!bots) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      // A torn or missing catalog used to surface as a bare SyntaxError out of whichever module
      // happened to touch the catalog first (review R1-01); name the file instead.
      throw new Error(`catalog: cannot read ${file}: ${e.message}`);
    }
    index(rows(data));
  }
  return bots;
}

/** Merge live /api/catalog rows over the stored ones, persist and reset the caches. */
function setCatalog(live) {
  const merged = new Map(getCatalog().map((b) => [b.id, b]));
  for (const r of rows(live)) {
    const id = r.id || r.botId;
    if (!id) continue;
    merged.set(id, { ...(merged.get(id) || {}), ...r, id });
  }
  const list = [...merged.values()];
  // pid-tagged tmp, like lib/book.js: two processes refreshing the catalog at once (a live loop and
  // the MCP arena_catalog tool) must not write the same tmp file (review R2-08).
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 1) + '\n');
  fs.renameSync(tmp, file); // atomic: a crash never leaves a half-written catalog
  return index(list);
}

function byId(id) {
  getCatalog();
  return (id && byIdMap.get(id)) || null;
}

function byName(name) {
  getCatalog();
  const found = byNameMap.get(normName(name));
  if (found) return found;
  const parents = String(name || '').split(' × ');
  if (parents.length !== 2) return null;
  const a = byNameMap.get(normName(parents[0])), b = byNameMap.get(normName(parents[1]));
  const recipe = a && b && season4.fusionFor(a.crew, b.crew);
  return recipe ? { ...a, name: `${a.name} × ${b.name}`, kitId: recipe.kitId,
    crews: [a.crew, b.crew], fusedWith: b.id, season: 4 } : null;
}

function fusionMeta(u) {
  if (!u?.fusedWith) return null;
  const a = byId(u.botId || u.id) || byName(String(u.name || '').split(' × ')[0]);
  const b = byId(u.fusedWith);
  const recipe = a && b && season4.fusionFor(a.crew, b.crew);
  if (!recipe) throw new Error('Unknown fusion parents; refresh the catalog before planning');
  return { botId: a.id, name: `${a.name} × ${b.name}`, kitId: recipe.kitId, crew: a.crew,
    crews: [a.crew, b.crew], fusedWith: b.id };
}

/** Bots offerable at `round` in `season` (default: the newest season in the catalog). */
function unlockedPool(round, season) {
  getCatalog();
  const s = season == null ? maxSeason : season;
  const r = Math.max(0, Math.min(2, Math.trunc(round) || 0));
  const key = r + ':' + s;
  let pool = poolCache.get(key);
  if (!pool) {
    pool = bots.filter((b) => (b.season || 1) <= s && (b.unlockTurn || 1) <= r + 1);
    poolCache.set(key, pool);
  }
  return pool;
}

/**
 * Resolve an arena row (board unit or shop offer) to its catalog bot: by id, by name, and by an id
 * carried in `name` (the old logs recorded season-2 bots that way). A miss is counted so the loop's
 * mid-run catalog refresh can fire — this is the only resolver the live path uses.
 */
function lookup(u) {
  if (!u) return null;
  const b = byId(u.botId || u.id) || byName(u.name) || byId(u.name);
  if (!b && (u.botId || u.id || u.name)) unknown(u);
  return b;
}

function unknown(u) {
  const key = u.botId || u.id || u.name || '?';
  if (warned.has(key)) return;
  warned.add(key);
  // A bot the stored catalog does not know means a new season shipped: refresh /api/catalog.
  // driver/play_loop.js polls unknownCount() and refreshes mid-run (docs/ENGINE_SHOP.md ENGS-01).
  console.warn('[catalog] unknown bot %s — refresh /api/catalog', key);
}

/** How many distinct bots the stored catalog could not resolve: a season change, seen live. */
const unknownCount = () => warned.size;

/** The newest season the stored catalog knows about; the season a state with seat rules is in. */
function newestSeason() {
  getCatalog();
  return maxSeason;
}

/**
 * Arena board unit -> sim unit. atk MUST carry tempAtk: the server fights with atk + tempAtk
 * (potato is +2 tempAtk for this battle only, docs/ENGINE_BATTLE.md §2.1).
 *
 * toSimUnit / offerToSimUnit are the contract's catalog surface (contract §lib/catalog.js) and the
 * shape mcp/server.js hands out; the live loop goes through shop_model.normUnit/normOffer instead,
 * which needs cost/rarity/uid as well (review R3-7.7).
 */
function toSimUnit(u, season = 1) {
  if (!u) return null;
  const b = lookup(u);
  if (!b) unknown(u);
  return {
    name: b ? b.name : u.name || u.botId || 'unknown',
    kitId: b ? b.kitId : u.kitId || null,
    atk: (u.atk || 0) + (u.tempAtk || 0),
    hp: u.hp || 0,
    honey: !!u.honey,
    ...(season >= 3 ? { crew: u.crew || (b && b.crew) || null, item: u.item || u.itemId || null } : {}),
    ...(season >= 4 || u.fusedWith ? fusionMeta(u.fusedWith ? u : b) : null),
  };
}

/** Shop offer -> sim unit (shop stats, no food applied). */
function offerToSimUnit(o, season = 1) {
  if (!o) return null;
  const b = lookup(o);
  if (!b) unknown(o);
  return {
    name: b ? b.name : o.name || o.botId || 'unknown',
    kitId: b ? b.kitId : o.kitId || null,
    atk: o.atk == null ? (b ? b.attack : 0) : o.atk,
    hp: o.hp == null ? (b ? b.health : 0) : o.hp,
    honey: false,
    ...(season >= 3 ? { crew: o.crew || (b && b.crew) || null, item: null } : {}),
  };
}

module.exports = {
  fusionMeta,
  getCatalog,
  setCatalog,
  setCatalogPath,
  catalogPath,
  byId,
  byName,
  lookup,
  unlockedPool,
  newestSeason,
  unknownCount,
  toSimUnit,
  offerToSimUnit,
  normName,
  PRICES,
  CATALOG_PATH,
  ITEMS_PATH,
  getItems,
  itemById,
};
