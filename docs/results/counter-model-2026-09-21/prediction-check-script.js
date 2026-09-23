'use strict';
const fs=require('fs'), sim=require('../../../lib/sim'), book=require('../../../lib/book');
const rows=JSON.parse(fs.readFileSync(require('node:path').join(process.argv[2], 'shop-rows.json'))).filter(r=>r.battle&&r.round>0);
const mid=Date.parse('2026-09-21T19:08:28.050Z'), groups={};
for(const r of rows){const half=Date.parse(r.ts)<mid?'first':'last';const opts=r.simOptions,actual=sim.outcome(r.actualUnits,r.exactThem,opts);const entries=r.target.entries.filter(e=>e.source==='book');const e=entries[0];if(!e)continue;const pred=sim.outcome(r.actualUnits,e.board,{...opts,seats:e.seats===undefined?opts.seats:e.seats});for(const h of ['all',r.opponent]){const k=half+':'+h,g=groups[k]||(groups[k]={n:0,correct:0,boardInTarget:0});g.n++;g.correct+=pred===actual;g.boardInTarget+=r.target.entries.some(e=>book.boardKey(book.normBoard(e.board))===book.boardKey(book.normBoard(r.exactThem)));}}
fs.writeFileSync(require('node:path').join(process.argv[2], 'prediction-check.json'),JSON.stringify(groups,null,2));console.log(Object.fromEntries(Object.entries(groups).filter(([k])=>['all','fabianhtml','ternquest_com'].includes(k.split(':')[1]))));
