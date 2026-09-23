'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {isDeepStrictEqual} = require('node:util');
const catalog = require('../lib/catalog');
const shop = require('../lib/shop_model');
const sim = require('../lib/sim');
const s4 = require('../lib/season4');
const bookLib = require('../lib/book');
const target = require('../lib/target');
const history = require('../lib/public_history');
const planner = require('../lib/planner');
const load = name => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,`fixtures/${name}.json.gz`))));
const fights = load('season4-controlled-20260923');
const shops = load('season4-shops-20260923');
const live = load('season4-live-practice-20260923');

function verifyFight(r) {
  const S = shop.normalize(r.before), a = r.after;
  const out = sim.simulate(shop.simUnits(S),a.ghostBoard.map(u=>catalog.toSimUnit(u,4)),{
    season:4,round:a.phase.round,seats:shop.seatsFrom(a),ourCaptain:a.captain,
    theirCaptain:a.rivalCaptain,ourRelics:a.relics,theirRelics:a.rivalRelics});
  assert.equal(out.winner === 'us' ? 'you' : out.winner,a.phase.winner,r.label);
  assert.deepEqual(out.frames,a.phase.frames,r.label);
}

test('S4 catalog covers all 100 new cards, 8 new items and 15 fusion recipes',()=>{
  const bots = catalog.getCatalog().filter(b=>b.season===4);
  assert.equal(bots.length,100); assert.ok(bots.every(b=>s4.KITS[b.kitId]));
  assert.equal(catalog.getItems().filter(i=>i.season===4).length,8);
  assert.equal(s4.FUSIONS.length,15);
  for(const f of s4.FUSIONS) assert.equal(s4.fusionFor(...f.crews),f);
});

test('395 independent S4 controlled server battles reproduce every frame and winner',()=>{
  assert.equal(fights.length,395);
  for(const r of fights) verifyFight(r);
});

test('101 S4 shop probes match deterministic transitions, including every fusion and new captain',()=>{
  assert.equal(shops.length,101);
  for(const r of shops){
    const S=shop.normalize(r.before), actual=shop.normalize(r.after);
    if(r.action.type==='battleDone'){
      const predicted=shop.sampleNextShop({...S,lastResult:r.before.phase.winner},actual.round,()=>.5);
      for(const key of ['gold','board','shopCosts']) assert.deepEqual(predicted[key],actual[key],`${r.label} ${key}`);
      for(let i=0;i<3;i++) if(S.frozen[i]) assert.deepEqual(predicted.offers[i],actual.offers[i],r.label);
      continue;
    }
    const predicted=shop.apply(S,r.action);
    for(const key of ['gold','board','relics','relicOffer','shopCosts']) assert.deepEqual(predicted[key],actual[key],`${r.label} ${key}`);
    assert.equal(predicted.freeRerolls || 0,actual.freeRerolls || 0,r.label);
    if(r.action.type!=='reroll' && r.action.relic!=='earlyAccess') for(const key of ['food','offers','itemOffer'])
      assert.deepEqual(predicted[key],actual[key],`${r.label} ${key}`);
    assert.deepEqual(S,shop.normalize(r.before),'input mutation');
  }
});

test('seven real S4 driver practice games include fusion and relics, with exact server battles',()=>{
  assert.equal(live.filter(r=>r.after.phase.kind==='result').length,7);
  assert.ok(live.some(r=>r.action.type==='fuse'));
  assert.ok(live.some(r=>r.action.type==='pickRelic'));
  for(const r of live) {
    if(r.action.type==='endShop') { verifyFight(r); continue; }
    if(r.before.phase.kind!=='shop') continue;
    const S=shop.normalize(r.before), P=shop.apply(S,r.action), A=shop.normalize(r.after);
    assert.equal(P.gold,A.gold,r.action.type);
    assert.ok(shop.simUnitsOutcomes(P).some(w=>isDeepStrictEqual(w.units,shop.simUnits(A))),r.action.type);
  }
});

test('S4 learning retains fusion parents and distinguishes relics across save and reload',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s4-book-'));
  try {
    const file=path.join(dir,'book.json'),b=bookLib.open(file,{empty:true,now:()=>3000});
    const r=fights.find(r=>r.label==='fusion:Platform'),board=shop.simUnits(shop.normalize(r.before));
    for(const [i,relics] of [['1',['fangs']],['2',['helmets']]]) b.record({season:4,round:2,handle:'enemy',board,relics,captain:'veteran',matchId:i,role:'attack',ts:Number(i)*1000});
    b.save(); const reload=bookLib.open(file);
    const rows=reload.lookup(4,'enemy',2);assert.equal(rows.length,2);
    assert.deepEqual(rows[0].board,bookLib.normBoard(board));
    assert.deepEqual(reload.pool(4,2,{policy:'recent',beforeTs:3000}).map(r=>r.relics).sort(),[['fangs'],['helmets']]);
    const built=target.build({book:reload,season:4,round:2,handle:'enemy',beforeTs:3000});
    assert.deepEqual(built.entries[0].theirRelics,['helmets']);
    const merged=path.join(dir,'merged.json');
    const merge=require('../tools/merge_book').mergeFiles;
    assert.equal(merge(file,merged).added,2);
    assert.equal(merge(file,merged).added,0);
    assert.deepEqual(bookLib.open(merged).lookup(4,'enemy',2),rows);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('S4 history rollover retains the complete S3 ledger',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s4-history-'));
  try {
    const file=path.join(dir,'history.json'),old={format:1,handle:'bot',season:3,matches:{old:{ts:123,role:'ghost',outcome:'win',elo:16,opponent:'other',rounds:[],proof:'retained'}},boundary:'old',cursor:null,head:null};
    fs.writeFileSync(file,JSON.stringify(old));
    const h=history.open({file,handle:'bot',season:4});
    assert.deepEqual(h.data().previousSeasons['3'],{...old,previousSeasons:undefined});
    assert.deepEqual(h.data().matches,{});
    assert.deepEqual(JSON.parse(fs.readFileSync(file)),old,'read did not overwrite old ledger');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('S4 relics affect cached planning scores and counter-model context',()=>{
  const S=shop.normalize(fights.find(r=>r.label==='relic:doubleTap').before);
  const enemy=[{name:'dummy',kitId:null,atk:8,hp:12}];
  const us=[{name:'dummy',kitId:null,atk:4,hp:12}];
  const cache=new Map(),opts={season:4,round:0,cache};
  const a=planner.evaluate(us,[{board:enemy}],opts),b=planner.evaluate(us,[{board:enemy}],{...opts,ourRelics:['doubleTap']});
  assert.ok(b.score>a.score);assert.ok(S.relics.length);
  const counter=require('../lib/counter_model');
  assert.throws(()=>counter.compare(counter.profile(us,[{board:enemy}],opts),counter.profile(us,[{board:enemy}],{...opts,ourRelics:['doubleTap']})),/same ordered scenarios/);
});

test('S4 frame fallback removes the Alchemist opening bonus and retains fusion identity',()=>{
  const raw=fights.find(r=>r.label==='fusion:Platform').before.board[0];
  const enemy=[catalog.toSimUnit(raw,4)];
  const ours=[{name:'Cooper',kitId:'sting',atk:6,hp:9}];
  const opts={season:4,round:2,theirRelics:['alchemist']};
  const battle=sim.simulate(ours,enemy,opts);
  const learned=bookLib.inferGhost({frames:battle.frames,ourUnits:ours,season:4,round:2});
  assert.deepEqual(learned,bookLib.normBoard(enemy));
  assert.deepEqual(sim.simulate(ours,learned,opts).frames,battle.frames);
  const {crews,...withoutCrews}=enemy[0];
  assert.deepEqual(bookLib.normBoard([withoutCrews]),bookLib.normBoard(enemy));
});

test('S4 catalog units identify the season when optional draft metadata is absent',()=>{
  const bot=catalog.getCatalog().find(b=>b.season===4);
  assert.equal(shop.seasonOf({board:[{botId:bot.id}]}),4);
  assert.equal(shop.seasonOf({shop:{pets:[{botId:bot.id}]}}),4);
});

test('a running driver migrates its S3 history when the next observed match is S4',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s4-driver-rollover-'));
  try {
    const file=path.join(dir,'history.json'),old={format:1,handle:'mockbot',season:3,
      matches:{old:{id:'old',ts:Date.now(),role:'attacker',outcome:'win',elo:8,
        opponent:'rival',rounds:[],learned:true}},boundary:null,cursor:null,head:null};
    fs.writeFileSync(file,JSON.stringify(old));
    const mock=require('./mock_arena').create({season:4,seed:29});
    const observe=mock.observe; let first=true;
    mock.observe=async()=>first ? (first=false,{state:{season:3,phase:{kind:'idle'}},version:0}) : observe();
    const simple={utility:planner.utility,chooseCaptain:S=>S.captainOffer[0],
      chooseRelic:S=>S.relicOffer[0],seatingActions:()=>[],planStep:S=>{
        const i=S.offers.findIndex(o=>o && o.cost<=S.gold);
        return S.board.length<3 && i>=0 ? {actions:[{type:'buy',shopIndex:i}]} : {actions:[],done:true};
      }};
    const events=[];
    const out=await require('../driver/play_loop').run({arena:mock,planner:simple,start:true,games:1,
      bookFile:path.join(dir,'book.json'),historyFile:file,lastOpponentFile:path.join(dir,'last.json'),
      telemetry:{event:(type,payload)=>events.push({type,...payload}),close(){}}});
    assert.equal(out.games,1);
    assert.deepEqual(events.filter(e=>e.type==='error'),[]);
    const saved=JSON.parse(fs.readFileSync(file));
    assert.equal(saved.season,4);
    assert.deepEqual(saved.previousSeasons['3'].matches,old.matches);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
