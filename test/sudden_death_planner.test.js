'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const rules = require('../lib/match_rules'), sim = require('../lib/sim');
const shop = require('../lib/shop_model'), planner = require('../lib/planner');
const target = require('../lib/target'), bookLib = require('../lib/book'), catalog = require('../lib/catalog');
const fixture = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,
  'fixtures/sudden-death-planner-20260924.json.gz'))));

test('official fourth-round practice proves the seed and cumulative HP/ATK adjudication', () => {
  const {before,after} = fixture.protocol['seed-probe'];
  const options = {season:4,round:3,seats:shop.seatsFrom(after),ourCaptain:after.captain,
    theirCaptain:after.rivalCaptain,ourRelics:after.relics,theirRelics:after.rivalRelics};
  const ours=before.board.map(u=>catalog.toSimUnit(u,4)), theirs=after.ghostBoard.map(u=>catalog.toSimUnit(u,4));
  assert.deepEqual(sim.simulate(ours,theirs,options).frames,after.phase.frames);
  assert.notDeepEqual(sim.simulate(ours,theirs,{...options,seed:0}).frames,after.phase.frames,
    'the previous undefined fourth seed silently became zero');
  for (const name of ['hp','atk','draw','fight']) {
    const r=fixture.protocol['forced-'+name];
    const kept=rules.addKept(r.before.kept,r.before.phase.frames.at(-1));
    assert.deepEqual(rules.decideSuddenDeath(r.before.phase.winner,kept),r.after.suddenDeath,name);
  }
});

test('match values enumerate all four rounds and retain historical three-round behavior', () => {
  const w={win:1,draw:0,loss:0},d={win:0,draw:1,loss:0},l={win:0,draw:0,loss:1};
  const opts={suddenDeathEnabled:true};
  for (const first of ['win','draw','loss']) for (const second of ['win','draw','loss'])
    for (const third of ['win','draw','loss']) for (const fourth of ['win','draw','loss']) {
      const sequence=[first,second,third,fourth];let you=0,them=0;
      for(let i=0;i<4;i++) {
        you+=+(sequence[i]==='win');them+=+(sequence[i]==='loss');
        if(you>=2||them>=2||i===2&&you!==them)break;
      }
      const expected=you>them?1:you<them?0:.5;
      const probs=Object.fromEntries(sequence.map((s,i)=>[i,{win:s==='win'?1:0,draw:s==='draw'?1:0,loss:s==='loss'?1:0}]));
      assert.equal(planner.matchValue(0,{you:0,them:0},probs,opts),expected,sequence.join(','));
    }
  assert.equal(planner.matchValue(0,{you:0,them:0},{0:w,1:l,2:d,3:w},opts),1);
  assert.equal(planner.matchValue(0,{you:0,them:0},{0:w,1:l,2:d,3:w}),.5);
  assert.equal(planner.matchValue(2,{you:1,them:0},{2:l,3:w},opts),1,
    'losing the third while ahead can still win sudden death');
  assert.equal(planner.matchValue(2,{you:0,them:1},{2:w,3:l},opts),0);
});

test('fourth-round attack and defense value a draw using survival totals, not a fixed half point', () => {
  const unit={name:'plain',kitId:null,atk:3,hp:3}, enemy=[{board:[unit],weight:1}];
  for (const [hp,atk,draw] of [[1,0,1],[-1,0,0],[0,1,1],[0,-1,0],[0,0,.5]]) {
    const kept={you:{hp:10+hp,atk:10+atk},them:{hp:10,atk:10}};
    const S={season:4,round:3,suddenDeathEnabled:true,kept};
    const utility=planner.utility(3,{you:1,them:1},S);
    assert.deepEqual(utility,{win:1,draw,loss:0});
    assert.equal(planner.evaluate([unit],enemy,{...S,utility}).score,draw);
    assert.equal(planner.defensiveValue([unit],[{...enemy[0],series:{you:1,them:1},kept}],S),draw);
    const state={...S,series:{you:1,them:1},board:[unit],relics:[],rivalRelics:[]};
    assert.equal(planner.finishValue(state,enemy,[{...enemy[0],series:state.series,kept}]).defense,draw);
  }
});

test('fourth shops retain known relics and authoritative continuation overrides stale feature flags', () => {
  const raw={season:4,phase:{kind:'shop',round:3},wins:{you:1,them:1},
    rivalRelics:['fangs','vampire'],kept:{you:{hp:7,atk:6},them:{hp:8,atk:13}}};
  const S=shop.normalize(raw,{suddenDeathEnabled:false});
  assert.equal(S.suddenDeathEnabled,true);
  assert.deepEqual(S.kept,raw.kept);
  assert.deepEqual(shop.planningRivalRelics(S),raw.rivalRelics);
  assert.equal(shop.planningRivalRelics({...S,round:2,rivalRelicsRound:1}),undefined,
    'the new exception must not revive the old third-round stale-relic bug');
  assert.equal(shop.normalize({...raw,phase:{kind:'shop',round:0},toSuddenDeath:false,
    suddenDeathEnabled:false},{suddenDeathEnabled:true}).suddenDeathEnabled,false);
});

test('unseen fourth-round opponents use prior boards until true fourth-round observations arrive', () => {
  const b=bookLib.open('/tmp/unused-sudden-planner-book',{empty:true});
  const record=(round,name,ts)=>b.record({season:4,round,handle:'rival',board:[{name,kitId:null,atk:3,hp:3}],
    ts,matchId:name,role:'attack',relics:['fangs','vampire']});
  record(2,'third',1);
  const args={book:b,season:4,round:3,handle:'rival',beforeTs:10};
  const prior=target.build(args);
  assert.ok(prior.entries.length>0);
  assert.equal(prior.sources.bookSourceRound,2);
  assert.equal(prior.components.book[0].board[0].name,'third');
  record(3,'fourth',11);
  assert.equal(target.build(args).sources.bookSourceRound,2,'future evidence cannot leak backward');
  const learned=target.build({...args,beforeTs:12});
  assert.equal(learned.sources.bookSourceRound,3);
  assert.equal(learned.components.book[0].board[0].name,'fourth');
  const unseen=target.build({book:b,season:3,round:3,handle:'new',beforeTs:12,
    previousOpponent:{round:2,board:[{name:'observed',kitId:null,atk:4,hp:4}],ts:new Date(5).toISOString()}});
  assert.equal(unseen.components.book[0].board[0].name,'observed');
});

test('the recorded fourth shop searches legal improvements instead of ending with all ten tokens', () => {
  let S=structuredClone(fixture.state);
  assert.equal(S.gold,10);assert.equal(S.round,3);
  const ctx={target:fixture.target,rng:sim.mulberry32(99),timeBudgetMs:Infinity,
    rerollSamples:2,twoStep:false,matchLevel:false,cache:new Map()};
  const initial=planner.evaluate(shop.simUnits(S),fixture.target,{season:4,round:3,seats:S.seats,
    ourCaptain:S.captain,theirCaptain:S.rivalCaptain,ourRelics:S.relics,
    theirRelics:shop.planningRivalRelics(S),utility:planner.utility(3,S.series,S)}).score;
  const plan=planner.planStep(S,ctx);
  assert.ok(plan.actions.length>0,'the original run had an empty target and sent endShop immediately');
  for(const action of plan.actions){assert.equal(shop.legal(S,action),true);S=shop.apply(S,action);}
  assert.ok(S.gold<10);
  const after=planner.evaluate(shop.simUnits(S),fixture.target,{season:4,round:3,seats:S.seats,
    ourCaptain:S.captain,theirCaptain:S.rivalCaptain,ourRelics:S.relics,
    theirRelics:shop.planningRivalRelics(S),utility:planner.utility(3,S.series,S)}).score;
  assert.ok(after>initial,'spending improves the recorded causal target, not just token usage');
});

test('modern carry projections choose the same final seating objective used for purchases in every season', () => {
  const unit = (name, kitId, atk, hp) => ({ name, kitId, atk, hp, honey:false });
  const board = [unit('echo', 'echo', 3, 7), unit('splash', 'splash', 6, 2), unit('hatch', 'hatch', 1, 3)];
  const opponents = [
    { weight:.6, board:[unit('a', 'hatch', 5, 5), unit('b', 'echo', 5, 7), unit('c', null, 3, 1)] },
    { weight:.4, board:[unit('d', 'echo', 6, 5), unit('e', 'echo', 5, 4), unit('f', 'splash', 1, 4)] },
  ];
  const fourth = [{ weight:1, board:[unit('weak', null, 0, 1)] }];
  for (const season of [1,2,3,4]) for (const futureBlend of [0,.5,1]) {
    const S = { season, round:2, suddenDeathEnabled:true, series:{you:1,them:1}, gold:0,
      board:board.map((u,i)=>({...u,uid:i+1,tempAtk:0})), offers:[null,null,null],
      frozen:[false,false,false], food:null, itemOffer:null, rerolls:0, nextUid:4 };
    const ctx = { futureMode:'carry', futureBlend, futureTargets:{3:fourth},
      defenseObjective:false, cache:new Map() };
    const VM = planner.makeStateValuer(S,ctx,planner.utility(2,S.series,S),opponents);
    const value = VM.valueOf(S), selectedUtility = VM.roundUtility(S);
    assert.deepEqual(selectedUtility,{win:1,draw:.5+.5*futureBlend,loss:0});
    let seated = S;
    for (const action of planner.seatingActions(S,opponents,ctx)) {
      assert.equal(shop.legal(seated,action),true);
      seated=shop.apply(seated,action);
    }
    const score = opponents.reduce((sum,e)=> {
      const result=sim.outcome(shop.simUnits(seated),e.board,{season,round:2});
      return sum+e.weight*selectedUtility[result==='us'?'win':result==='draw'?'draw':'loss'];
    },0);
    assert.ok(Math.abs(score-value)<1e-12,`S${season}, blend ${futureBlend}: scored ${value}, seated ${score}`);
    if (futureBlend===.5) {
      assert.ok(Math.abs(value-.45)<1e-12);
      // The old final seat order valued draws at .5 and scored only .4 under
      // this same continuation. The corrected order deliberately takes .6 draws.
      assert.equal(sim.outcome(shop.simUnits(seated),opponents[0].board,{season,round:2}),'draw');
    }
  }
});
