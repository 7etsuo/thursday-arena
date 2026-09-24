'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const sim = require('../lib/sim');
const shop = require('../lib/shop_model');
const planner = require('../lib/planner');
const target = require('../lib/target');
const model = require('../lib/opponent_model');
const bookLib = require('../lib/book');
const fights = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'fixtures/s4-live-20260924.json.gz'))));

test('1,190 complete S4 live fights reproduce all winners and 1,188 complete traces', () => {
  assert.equal(fights.length,1190);
  // Two Sep 23 traces differ only in simultaneous, equal-ATK knockout order.
  // Pin the exact discrepancy rather than silently treating it as a full match.
  const unresolved = new Set(['9bc6dd8f-a307-4292-bf6b-6cf89f064fce','335fea71-2caa-4aa8-aa35-63a30b0bf2b5']);
  let exact = 0, known = 0;
  for (const r of fights) {
    const out = sim.simulate(r.us,r.them,r.options), label = `${r.matchId} r${r.options.round}`;
    assert.equal(out.winner === 'us' ? 'you' : out.winner,r.winner,label);
    if (unresolved.has(r.matchId) && r.options.round === 1) {
      assert.deepEqual(out.frames.slice(0,15),r.frames.slice(0,15),label);
      assert.deepEqual(out.frames.slice(17),r.frames.slice(17),label);
      assert.deepEqual(out.frames.slice(15,17).map(f=>f.caption).reverse(),r.frames.slice(15,17).map(f=>f.caption),label);
      known++;
    } else { assert.deepEqual(out.frames,r.frames,label); exact++; }
  }
  assert.equal(exact,1188); assert.equal(known,2);
});

test('shop relic metadata belongs to the previous fight; next-shop rollouts cannot reuse it as current', () => {
  const raw = {season:4,phase:{kind:'shop',round:2},relics:['bubble','hotfix'],rivalRelics:['vampire']};
  const S = shop.normalize(raw);
  assert.equal(S.rivalRelicsRound,1);
  assert.equal(shop.planningRivalRelics(S),undefined);
  assert.deepEqual(S.rivalRelics,['vampire'],'raw observed data is retained');
  const battle = shop.normalize({...raw,phase:{kind:'battle',round:1}});
  assert.deepEqual(shop.planningRivalRelics(battle),['vampire']);
  const next = shop.sampleNextShop(battle,2,sim.mulberry32(123));
  assert.equal(shop.planningRivalRelics(next),undefined);
  assert.equal(shop.planningRivalRelics(battle,2),undefined);
  assert.equal(shop.planningRivalRelics({...S,rivalRelics:['vampire','bubble']}),undefined,
    'a coincidentally matching list length is not evidence of the observation round');
});

test('current enemy relics stay attached to each target scenario in scoring and forecasts', () => {
  const us = [{name:'ours',kitId:null,atk:4,hp:12}];
  const enemy = [{name:'enemy',kitId:null,atk:4,hp:12}];
  const S = shop.normalize({season:4,phase:{kind:'shop',round:2},rivalRelics:[]});
  const options = {season:4,round:2,theirRelics:shop.planningRivalRelics(S)};
  const a = {board:enemy,weight:.75,theirRelics:['doubleTap']};
  const b = {board:enemy,weight:.25,theirRelics:[]};
  assert.equal(sim.outcome(us,enemy,{...options,theirRelics:a.theirRelics}),'them');
  assert.equal(sim.outcome(us,enemy,{...options,theirRelics:b.theirRelics}),'draw');
  const entries = [a,b], t = {entries,components:{book:entries,pool:entries}};
  assert.deepEqual(target.forecast(us,t,options),{version:model.S4_FORECAST_VERSION,book:[0,.25,.75],pool:[0,.25,.75]});
  assert.equal(planner.evaluate(us,t,options).score,.125);
  // The direct simulator API still honors callers that supply exact relics.
  assert.deepEqual(target.forecast(us,t,{...options,theirRelics:[]}).book,[0,1,0]);
});

test('S4 confidence ignores obsolete forecasts, learns from new losses and recovers; imports preserve it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'s4-calibration-'));
  try {
    const file = path.join(dir,'book.json'), merged = path.join(dir,'merged.json');
    const b = bookLib.open(file,{empty:true,now:()=>1000});
    const board = [{name:'Cooper',kitId:'sting',atk:3,hp:5}];
    const add = (i,outcome,version) => b.record({season:4,round:2,handle:'alice',board,
      relics:['fangs','vampire'],matchId:`m${i}`,ts:i+1,role:'attack',outcome,
      observationId:`m${i}:2`,forecast:{book:[1,0,0],pool:[0,0,1],...(version ? {version} : {})}});
    for (let i=0;i<32;i++) add(i,'them');
    assert.equal(b.confidence(4,2,'alice',.75),.75);
    assert.equal(b.pool(4,2,{policy:'recent'}).length,1,'old boards remain useful');
    b.save();
    assert.equal(bookLib.open(file).data().outgoing.length,32,'old forecasts still load');
    for (let i=32;i<64;i++) add(i,'them',model.S4_FORECAST_VERSION);
    const low = b.confidence(4,2,'alice',.75);
    assert.ok(low < .15);
    for (let i=64;i<96;i++) add(i,'you',model.S4_FORECAST_VERSION);
    assert.equal(b.confidence(4,2,'alice',.75,65),low,'later wins cannot change past confidence');
    assert.ok(b.confidence(4,2,'alice',.75) > .9);
    b.save();
    const before = bookLib.open(file).data();
    const merge = require('../tools/merge_book').mergeFiles;
    merge(file,merged); merge(file,merged);
    const loaded = bookLib.open(merged);
    assert.deepEqual(loaded.data().outgoing,before.outgoing);
    assert.deepEqual(loaded.data().receipts,before.receipts);
    assert.deepEqual(loaded.lookup(4,'alice',2),bookLib.open(file).lookup(4,'alice',2));
    assert.equal(loaded.confidence(4,2,'alice',.75),b.confidence(4,2,'alice',.75));
    assert.equal(loaded.data().outgoing.filter(r=>r.forecast.version).length,64);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('S4 mock reveals new ghost relics at battle time, as the live protocol does', async () => {
  const r = fights[0], ghost = {handle:'rival',rounds:[0,1,2].map(()=>[r.them]),relics:[[],['fangs'],['fangs','vampire']]};
  const arena = require('./mock_arena').create({season:4,seed:123,ghosts:[ghost]});
  let env = await arena.act({type:'start'});
  env = await arena.act({type:'pickCaptain',captain:env.state.captainOffer[0]});
  for (let i=0;i<3;i++) env = await arena.act({type:'buy',shopIndex:i});
  env = await arena.act({type:'endShop'});
  assert.deepEqual(env.state.rivalRelics,[]);
  env = await arena.act({type:'battleDone'});
  assert.equal(env.state.phase.round,1);
  assert.equal(env.state.rivalRelics,null,'the R1 draft has not been revealed');
  env = await arena.act({type:'pickRelic',relic:env.state.relicOffer[0]});
  env = await arena.act({type:'endShop'});
  assert.deepEqual(env.state.rivalRelics,['fangs']);
});

test('old S4 defense metadata refreshes once after an engine correction, without duplicate learning', async () => {
  const fixture = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'fixtures/s4-defense-history-20260924.json.gz'))));
  const H = require('../lib/public_history');
  let rounds = 0;
  for (const raw of fixture.history) {
    const resolved = H.replayInputs(fixture.details[raw.id],H.rowOf(raw,'tetsuoai',4),'tetsuoai',4);
    assert.ok(resolved.every(r=>r.metadata==='unique_trace_match'),raw.id);
    rounds += resolved.length;
  }
  assert.equal(rounds,60);
  const raw = fixture.history[0], dir = fs.mkdtempSync(path.join(os.tmpdir(),'s4-history-refresh-'));
  try {
    const file = path.join(dir,'history.json'), now = () => Date.parse(raw.played_at)+1000;
    const book = bookLib.open(path.join(dir,'book.json'),{empty:true,now});
    let calls = 0;
    const arena = {playerMatches:async()=>({data:[raw],next_cursor:null}),
      getPublicMatchDetail:async()=>{calls++;return fixture.details[raw.id];}};
    const open = () => H.open({file,handle:'tetsuoai',season:4,now});
    await open().poll({arena,book});
    const saved = JSON.parse(fs.readFileSync(file)), expected = structuredClone(saved.matches[raw.id].rounds);
    delete saved.matches[raw.id].replayVersion;
    for (const r of saved.matches[raw.id].rounds) { r.seats=null; r.metadata='unmatched_trace'; }
    fs.writeFileSync(file,JSON.stringify(saved));
    const before = structuredClone(book.data()), store = open(), events = [];
    const telemetry = require('../lib/telemetry').open({dir:path.join(dir,'log')});
    const result = await store.poll({arena,book,event:(type,p)=>{telemetry.event(type,p);events.push({type,...p});}});
    await telemetry.close();
    assert.equal(result.upgraded,1); assert.equal(result.learned,0);
    assert.deepEqual(store.data().matches[raw.id].rounds,expected);
    assert.deepEqual(book.data(),before,'observations and receipts must not be counted twice');
    assert.equal(events.filter(e=>e.type==='book').length,0);
    assert.equal(events.filter(e=>e.type==='defense_metadata').length,expected.length);
    await open().poll({arena,book});
    assert.equal(calls,2,'current metadata does not refetch on every restart');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
