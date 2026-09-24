#!/usr/bin/env node
'use strict';
// Chronological, fixed-board counterfactuals. Does not play games or alter memory.
// Usage: node tools/eval_s4_records.js LOG_DIR BEFORE_CHECKOUT [SESSION_ID]
const fs = require('node:fs'), path = require('node:path');
const {isDeepStrictEqual:eq} = require('node:util');
const [dir,beforeDir,session] = process.argv.slice(2);
if (!dir || !beforeDir) throw new Error('usage: eval_s4_records.js LOG_DIR BEFORE_CHECKOUT [SESSION_ID]');
const roots = {before:path.resolve(beforeDir),current:path.resolve(__dirname,'..')};
const runtime = Object.fromEntries(Object.entries(roots).map(([name,root])=>[name,{
  sim:require(root+'/lib/sim'),target:require(root+'/lib/target'),planner:require(root+'/lib/planner'),
  book:require(root+'/lib/book').open('/unused-record-evaluation',{empty:true}),
}]));
const events = fs.readdirSync(dir).filter(f=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort()
  .flatMap(f=>fs.readFileSync(path.join(dir,f),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
const contexts = new Map(), shops = new Map(), rows = [];
const score = w => w==='us'||w==='you' ? 1 : w==='draw' ? .5 : 0;
for (const e of events) {
  if (e.type==='match_start') contexts.set(e.matchKey,e);
  if (e.type==='shop' && e.season===4) {
    const targets = Object.fromEntries(Object.entries(runtime).map(([name,m])=>[name,m.target.build({
      book:m.book,season:4,round:e.round,handle:e.handle,prevHandle:contexts.get(e.matchKey)?.prevHandle,
      seats:e.seats,beforeTs:Date.parse(e.ts),
    })]));
    shops.set(e.matchKey+':'+e.round,{shop:e,targets});
  }
  if (e.type==='battle' && e.season===4 && e.us?.length) {
    const r = shops.get(e.matchKey+':'+e.round); if (r) r.battle=e;
  }
  if (e.type!=='book' || e.season!==4) continue;
  const r = shops.get(e.matchKey+':'+e.round), forecasts = {};
  if (e.role==='attack' && r?.battle) {
    const s=r.shop,b=r.battle,base={season:4,round:s.round,seats:s.seats,ourCaptain:s.captain,
      theirCaptain:s.rivalCaptain,ourRelics:s.relics,utility:runtime.current.planner.utility(s.round,s.series)};
    const truth={...base,theirCaptain:b.rivalCaptain,theirRelics:b.rivalRelics};
    const row={matchId:e.matchId,round:s.round,ts:s.ts,handle:e.handle,actual:score(b.winner),arms:{}};
    for (const [name,m] of Object.entries(runtime)) {
      const options={...base,theirRelics:name==='before'?s.rivalRelics:undefined},t=r.targets[name];
      forecasts[name]=m.target.forecast(b.us,t,options);
      const replay=m.sim.simulate(b.us,e.board,truth);
      const seated=m.sim.bestSeating(b.us,t.entries,options)[0];
      row.arms[name]={forecast:forecasts[name],weight:t.sources.bookWeight,
        replayWinner:score(replay.winner)===row.actual,replayFrames:eq(replay.frames,b.frames),
        // Both policies are scored by the corrected engine against exact recorded opponents.
        seatScore:score(runtime.current.sim.outcome(seated.order,e.board,truth))};
    }
    // Isolate stale relic handling, holding model weights and the corrected engine fixed.
    const t=r.targets.before,m=runtime.current;
    for (const [name,relics] of [['staleRelics',s.rivalRelics],['rememberedRelics',undefined]]) {
      const options={...base,theirRelics:relics},seated=m.sim.bestSeating(b.us,t.entries,options)[0];
      row.arms[name]={forecast:m.target.forecast(b.us,t,options),weight:t.sources.bookWeight,
        seatScore:score(m.sim.outcome(seated.order,e.board,truth))};
    }
    if (!session || e.session===session) rows.push(row);
  }
  for (const [name,m] of Object.entries(runtime)) m.book.record({...e,ts:e.observedAt,
    role:e.source==='defense_replay'?'defense':e.role,
    forecast:name==='current' ? forecasts.current : e.forecast});
}
const brier = (arm,actual) => arm.forecast.book.reduce((n,p,i)=>n+
  (p*arm.weight+arm.forecast.pool[i]*(1-arm.weight)-+(i===(actual===1?0:actual===.5?1:2)))**2,0);
const summary=[0,1,2].map(round=>{
  const rs=rows.filter(r=>r.round===round),arms={};
  for (const name of ['before','current','staleRelics','rememberedRelics']) {
    const fs=rs.filter(r=>r.arms[name].forecast),vs=rs.filter(r=>r.arms.current.replayFrames);
    arms[name]={forecastN:fs.length,brier:fs.reduce((n,r)=>n+brier(r.arms[name],r.actual),0)/fs.length,
      seatingN:vs.length,seatPoints:vs.reduce((n,r)=>n+r.arms[name].seatScore,0),
      ...(name==='before'||name==='current'?{winnerMatches:rs.filter(r=>r.arms[name].replayWinner).length,
        frameMatches:rs.filter(r=>r.arms[name].replayFrames).length}:{}),
    };
  }
  const paired = (a,b) => rs.filter(r=>r.arms.current.replayFrames).reduce((n,r)=>{
    const d=r.arms[b].seatScore-r.arms[a].seatScore;n.delta+=d;n[d>0?'better':d<0?'worse':'same']++;return n;
  },{delta:0,better:0,worse:0,same:0});
  return {round,n:rs.length,arms,fullUpdate:paired('before','current'),relicOnly:paired('staleRelics','rememberedRelics')};
});
console.log(JSON.stringify({scope:'fixed observed final boards; no shop purchases or defensive objective; sequential corrected forecasts on factual outcomes',session,summary,rows},null,2));
