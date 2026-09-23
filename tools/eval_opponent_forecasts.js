#!/usr/bin/env node
'use strict';
// Chronological forecast check on recorded decisions, not an alternative-policy win rate.
// Input: archive audit directory containing events, shop-rows and initial-book JSON.
const fs=require('fs'),sim=require('../lib/sim'),B=require('../lib/book'),T=require('../lib/target');
if(!process.argv[2]||!process.argv[3])throw Error('Usage: eval_opponent_forecasts.js ANALYSIS_DIR NEW_OUTPUT.json');
const base=process.argv[2],events=JSON.parse(fs.readFileSync(base+'/events.json'));
const shops=new Map(JSON.parse(fs.readFileSync(base+'/shop-rows.json')).filter(r=>r.battle).map(r=>[r.matchKey+':'+r.round,r]));
const results=events.filter(e=>e.type==='result'),ix=new Map(results.map((r,i)=>[r.matchKey,i])),books=[B.open(base+'/initial-book.json'),B.open(base+'/initial-book.json')],pred=new Map(),out=[];
for(const e of events){
 if(e.type==='book'&&e.source==='defense_replay'){for(const b of books)b.record({season:e.season,handle:e.handle,round:e.round,board:e.board,captain:e.captain,seats:e.seats,ts:e.observedAt,matchId:e.matchId,observationId:e.observationId,role:'defense'});continue;}
 const row=shops.get(e.matchKey+':'+e.round);if(!row||!ix.has(e.matchKey))continue;
 if(e.type==='shop'){
  for(let v=0;v<books.length;v++){
   const t=T.build({book:books[v],beforeTs:Date.parse(e.ts),season:3,round:e.round,handle:e.handle,prevHandle:row.prevHandle,seats:e.seats,calibrate:v===1});
   const opts={season:3,round:e.round,seats:e.seats,ourCaptain:e.captain,theirCaptain:e.rivalCaptain};const f=T.forecast(row.actualUnits,t,opts);
   pred.set(v+'|'+e.matchKey+':'+e.round,{t,f});
  }
 }
 if(e.type==='book')for(let v=0;v<books.length;v++){
  const {t,f}=pred.get(v+'|'+e.matchKey+':'+e.round)||{};if(!t)throw Error('missing target');
  const w=row.battleResult,actual=w==='you'?0:w==='draw'?1:2,ps=[0,0,0];
  for(const te of t.entries){const o=sim.outcome(row.actualUnits,te.board,{season:3,round:e.round,seats:row.state.seats,ourCaptain:row.state.captain,theirCaptain:row.state.rivalCaptain??te.theirCaptain});ps[o==='us'?0:o==='draw'?1:2]+=te.weight;}
  out.push({variant:v,round:e.round,q:[1,2,3].filter(q=>ix.get(e.matchKey)>=Math.floor(results.length*q/4)).length,score:ps[0]+ps[1]/2,brier:ps.reduce((a,x,i)=>a+(x-(i===actual?1:0))**2,0),weight:t.sources.bookWeight});
  books[v].record({season:3,handle:row.opponent,round:e.round,board:row.exactThem,captain:row.simOptions.theirCaptain,seats:row.state.seats,ts:row.battle.ts,matchId:row.matchId,role:'attack',outcome:w,forecast:f,observationId:row.matchId+':'+e.round});
 }
}
const summary=[];for(let v=0;v<2;v++)for(let q=0;q<4;q++)for(let r=0;r<3;r++){const a=out.filter(x=>x.variant===v&&x.q===q&&x.round===r);summary.push({variant:v,q:q+1,round:r,n:a.length,...Object.fromEntries(['score','brier','weight'].map(k=>[k,a.reduce((s,r)=>s+r[k],0)/a.length]))});}
fs.writeFileSync(process.argv[3],JSON.stringify(summary,null,2),{flag:'wx'});console.log(JSON.stringify(summary,null,2));
