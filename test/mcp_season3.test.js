'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { server, toUnits } = require('../mcp/server');
const arena = require('../lib/arena');
const planner = require('../lib/planner');
const fixture = require('./fixtures/season3-practice-seed-12345.json');
const fs = require('node:fs'), zlib = require('node:zlib'), path = require('node:path');
const s4 = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,
  'fixtures/season4-live-practice-20260923.json.gz'))));
const catalog = require('../lib/catalog');

const unpack = (result) => {
  assert.ok(!result.isError, JSON.stringify(result));
  return JSON.parse(result.content.find((c) => c.type === 'text').text);
};

test('MCP S3/S4 tools preserve combat inputs and propose captain/relic drafts', async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'season3-test', version: '1.0.0' });
  const observe = arena.observe;
  const getSeasonInfo = arena.getSeasonInfo;
  const chooseCaptain = planner.chooseCaptain;
  const chooseRelic = planner.chooseRelic;
  try {
    arena.getSeasonInfo = async () => ({number:4,suddenDeath:true});
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const filled = toUnits([{ name: 'Foundry', item: 'foamPad' }], 3)[0];
    assert.equal(filled.crew, 'builders');
    assert.equal(filled.item, 'foamPad');
    const explicitStats = toUnits([{ name: 'Foundry', atk: 4, hp: 9 }], 3)[0];
    assert.equal(explicitStats.kitId, filled.kitId, 'custom stats preserve the catalog ability');

    const battle = unpack(await client.callTool({ name: 'sim_battle', arguments: {
      season: 3, round: 0,
      us: [{ name: 'Foundry', item: 'foamPad' }, { name: 'Imogen' }],
      them: [{ name: 'Company Docs Q&A' }],
      ourCaptain: 'drill', theirCaptain: 'medic',
    } }));
    const c = battle.frames.map((f) => f.caption);
    assert.ok(c.includes('Builders crew: +2/+3 to your front bot'));
    assert.ok(c.includes('Drill: +2 ATK to your front bot'));
    assert.ok(c.includes('Enemy Medic: +3 HP to their front bot'));

    arena.observe = async () => ({ version: 1, state: fixture.initial });
    planner.chooseCaptain = () => 'chef';
    const planned = unpack(await client.callTool({ name: 'plan_shop', arguments: {} }));
    assert.equal(planned.season, 3);
    assert.deepEqual(planned.plan.actions, [{ type: 'pickCaptain', captain: 'chef' }]);

    const lookup = unpack(await client.callTool({ name: 'book_lookup', arguments: { round: 0, limit: 1 } }));
    assert.equal(lookup.season, 4);
    const legacyLookup = unpack(await client.callTool({ name: 'book_lookup', arguments: { season: 3, round: 0, limit: 1 } }));
    assert.equal(legacyLookup.season, 3);

    const fight = s4.find(r=>r.action.type==='endShop' && r.before.board.some(u=>u.fusedWith));
    const after=fight.after;
    const fusionBattle=unpack(await client.callTool({name:'sim_battle',arguments:{season:4,
      round:after.phase.round,seats:require('../lib/shop_model').seatsFrom(after),
      us:fight.before.board.map(u=>catalog.toSimUnit(u,4)),
      them:after.ghostBoard.map(u=>catalog.toSimUnit(u,4)),
      ourCaptain:after.captain,theirCaptain:after.rivalCaptain,
      ourRelics:after.relics||[],theirRelics:after.rivalRelics||[]}}));
    assert.deepEqual(fusionBattle.frames,after.phase.frames);
    const relicState=s4.find(r=>r.action.type==='pickRelic').before;
    arena.observe=async()=>({state:relicState,version:2});
    planner.chooseRelic=S=>S.relicOffer[0];
    const relicPlan=unpack(await client.callTool({name:'plan_shop',arguments:{}}));
    assert.deepEqual(relicPlan.plan.actions,[{type:'pickRelic',relic:relicState.relicOffer[0]}]);
  } finally {
    arena.observe = observe;
    arena.getSeasonInfo = getSeasonInfo;
    planner.chooseCaptain = chooseCaptain;
    planner.chooseRelic = chooseRelic;
    await client.close();
    await server.close();
  }
});
