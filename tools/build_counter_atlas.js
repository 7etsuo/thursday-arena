#!/usr/bin/env node
'use strict';
/** All-card matchup atlas under explicit contexts. Diagnostic only; never a runtime tier list.
 * node tools/build_counter_atlas.js --out NEW_DIRECTORY [--contexts training-contexts.json]
 * Contexts: [{id, us, them, options}], complete three-unit teams. Each ordered card pair
 * replaces the same slot on both sides; the other teammates, items, seats/captains are fixed.
 */
const fs = require('node:fs'), path = require('node:path');
const catalog = require('../lib/catalog'), model = require('../lib/counter_model');

function build(contexts = []) {
  const cards = catalog.unlockedPool(2, 3), units = cards.map(c => catalog.offerToSimUnit(c, 3));
  const settings = [{ id: 'duel', label: 'Single-card duel: base stats, no equipment, seats or captains',
    us: [], them: [], slot: 0, options: { season: 3, round: 2 }, duel: true }];
  for (const c of contexts) {
    if (c.us.length !== 3 || c.them.length !== 3 || c.options?.season !== 3 || c.options?.round !== 2) {
      throw new Error('team contexts must be complete Season 3 round-2 fights');
    }
    for (let slot = 0; slot < 3; slot++) settings.push({ ...c, slot,
      id: `${c.id}:slot${slot}`, label: `${c.id}: replace ${['front', 'middle', 'back'][slot]} on both teams` });
  }
  let fights = 0;
  const contextsOut = settings.map(c => {
    const matrix = units.map((a, i) => units.map((b, j) => {
      const us = c.duel ? [a] : c.us.map((u, k) => k === c.slot ? a : u);
      const them = c.duel ? [b] : c.them.map((u, k) => k === c.slot ? b : u);
      const valid = board => board.filter(u => catalog.byName(u.name)?.rarity === 'mythic').length <= 1;
      if (!valid(us) || !valid(them)) return null;
      fights++;
      return model.payoff(us, { board: them, theirCaptain: c.options.theirCaptain }, c.options);
    }));
    console.error(`${c.id}: ${fights} total simulated fights`);
    return { ...c, matrix };
  });
  return { format: 1, season: 3, fights,
    cards: cards.map(c => ({ id: c.id, name: c.name, kitId: c.kitId, text: c.kitText,
      atk: c.attack, hp: c.health, crew: c.crew, rarity: c.rarity, cost: catalog.PRICES[c.rarity] })),
    contexts: contextsOut,
    limits: 'Exact simulated fights in explicitly listed contexts, not empirical win probabilities or universal counters. Replacement cards have base stats and no item; other teammates retain their recorded equipment. Purchasability/budget and optimal reseating are not assumed. Runtime decisions use complete legal shop states and current battle inputs, never this atlas as card weights.' };
}

function html(atlas) {
  const json = JSON.stringify(atlas).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thursday Arena counter atlas</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;background:#101820;color:#e7eef5}h1{font-size:32px}select,input{font:inherit;padding:8px;margin:8px 12px 8px 0;max-width:100%}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{text-align:left;padding:10px;border-bottom:1px solid #394653}th{color:#9dd7ff}p{line-height:1.6}.note{color:#b0c0ce}details{margin-top:20px}#meta{white-space:pre-wrap;font:13px monospace}</style>
<h1>Thursday Arena counter atlas</h1><p>Every result comes from a simulated fight. Select an enemy card and a battle context to inspect which cards beat it in that setting.</p>
<label>Enemy card <select id="enemy"></select></label><label>Context <select id="context"></select></label><br><label>Find a counter <input id="filter" placeholder="Card name or crew"></label>
<p class="note" id="limits"></p><p id="count"></p><table><thead><tr><th>Our card</th><th>Cost / crew</th><th>Wins</th><th>Draws</th><th>Losses</th><th>Contexts checked</th></tr></thead><tbody id="rows"></tbody></table>
<details><summary>Exact context inputs</summary><pre id="meta"></pre></details>
<script>const DATA=${json};const enemy=document.querySelector('#enemy'),context=document.querySelector('#context'),filter=document.querySelector('#filter');
for(const [i,c] of DATA.cards.entries()){const o=document.createElement('option');o.value=i;o.textContent=c.name;enemy.append(o)}
for(const c of [{id:'all',label:'All illustrative contexts'},...DATA.contexts]){const o=document.createElement('option');o.value=c.id;o.textContent=c.label;context.append(o)}
document.querySelector('#limits').textContent=DATA.limits;
function render(){const j=+enemy.value,cs=context.value==='all'?DATA.contexts:DATA.contexts.filter(c=>c.id===context.value),query=filter.value.toLowerCase();
const rs=DATA.cards.map((c,i)=>{const vs=cs.map(x=>x.matrix[i][j]).filter(x=>x!==null);return {c,n:vs.length,w:vs.filter(x=>x===1).length,d:vs.filter(x=>x===.5).length,l:vs.filter(x=>x===0).length}}).filter(r=>(r.c.name+' '+r.c.crew).toLowerCase().includes(query));
rs.sort((a,b)=>(b.w+.5*b.d)/(b.n||1)-(a.w+.5*a.d)/(a.n||1)||a.c.cost-b.c.cost||a.c.name.localeCompare(b.c.name));const body=document.querySelector('#rows');body.replaceChildren();
for(const r of rs){const tr=document.createElement('tr');for(const v of [r.c.name,r.c.cost+' / '+r.c.crew,r.w,r.d,r.l,r.n]){const td=document.createElement('td');td.textContent=v;tr.append(td)}body.append(tr)}
document.querySelector('#count').textContent=DATA.cards.length+' cards; '+DATA.fights.toLocaleString()+' simulated fights. Counts describe these scenarios, not a live win rate.';
document.querySelector('#meta').textContent=JSON.stringify(cs.map(({matrix,...c})=>c),null,2)}
enemy.onchange=context.onchange=filter.oninput=render;render();</script></html>`;
}

if (require.main === module) {
  const args = process.argv.slice(2), get = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
  const out = get('--out'), input = get('--contexts');
  if (!out) throw new Error('Usage: node tools/build_counter_atlas.js --out NEW_DIRECTORY [--contexts FILE]');
  fs.mkdirSync(out); // refuses overwriting a previous research artifact
  const atlas = build(input ? JSON.parse(fs.readFileSync(input)) : []);
  fs.writeFileSync(path.join(out, 'atlas.json'), JSON.stringify(atlas));
  fs.writeFileSync(path.join(out, 'index.html'), html(atlas));
  console.log(JSON.stringify({ cards: atlas.cards.length, contexts: atlas.contexts.length, fights: atlas.fights, out }));
}
module.exports = { build, html };
