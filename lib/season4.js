'use strict';
// Public Season 4 catalog/rules, retrieved 2026-09-23. Pure data; no runtime I/O.
const CAPTAINS = ['heckler', 'veteran', 'gearhead', 'realtor', 'trainer', 'grocer', 'underdog', 'freezer'];
const SEATS = ['slowBurn', 'buddySystem', 'toolBelt', 'powerCouple', 'quietZone'];
const RELICS = ['helmets', 'fangs', 'sticky', 'doubleTap', 'vampire', 'quickDraw', 'hotfix',
  'encore', 'wideSwing', 'jammer', 'bubble', 'rich', 'bulkOrder', 'loyaltyCard', 'freshStock',
  'earlyAccess', 'itemHoarder', 'loudCrew', 'alchemist'];
const KITS = {};
function add(ids, trigger, effect, extra = {}) {
  for (const id of ids.split(' ')) KITS[id] = { trigger, effect, season: 4, ...extra };
}
add('short_squeeze', 'passive', { kind: 'leech', amount: 2 }, { firstStrike: true });
add('paper_hunt churn small_multiples skim', 'passive', { kind: 'leech', amount: 1 });
add('scrub_the_record', 'passive', { kind: 'muzzle' }, { firstStrike: true });
add('inspect voicemail', 'passive', { kind: 'muzzle' });
add('gravity_well', 'passive', { kind: 'reflect', amount: 4 });
add('pixel_match recovery decide', 'passive', { kind: 'reflect', amount: 1 });
add('claim', 'passive', { kind: 'reflect', amount: 2 });
add('watchtower', 'passive', { kind: 'reflect', amount: 2 }, { evade: 2 });
add('blip spam_filter', 'passive', { kind: 'evade', amount: 1 });
add('outer_loop reroute cut_list arc_flash', 'passive', { kind: 'overkill' });
add('newsletter', 'countdown', { kind: 'buffAllFriends', atk: 3, hp: 4 }, { exchange: 2 });
add('insights', 'countdown', { kind: 'buffAllFriends', atk: 2, hp: 0 }, { exchange: 3 });
add('spec_review', 'countdown', { kind: 'pingFront', damage: 4 }, { exchange: 3 });
add('pull_list', 'countdown', { kind: 'pingFront', damage: 2 }, { exchange: 3 });
add('filing', 'countdown', { kind: 'gainStats', atk: 3, hp: 3 }, { exchange: 3 });
add('panel_four', 'countdown', { kind: 'gainStats', atk: 2, hp: 2 }, { exchange: 3 });
add('meter', 'countdown', { kind: 'gainStats', atk: 2, hp: 0 }, { exchange: 3 });
add('bulletin', 'countdown', { kind: 'gainStats', atk: 2, hp: 0 }, { exchange: 2 });
add('city_hall', 'aura', { kind: 'aheadAttack', amount: 3 });
add('voice_over lesson', 'aura', { kind: 'aheadAttack', amount: 2 });
add('roadmap', 'aura', { kind: 'behindAttack', amount: 3 });
add('judgment_call', 'aura', { kind: 'behindAttack', amount: 2 });
add('ghostwrite repost catalog retouch', 'startOfBattle', { kind: 'copyAcross' });
add('seed_round', 'reroll', { kind: 'gainStats', atk: 2, hp: 0 });
add('routine interest itinerary reverse_search viewing', 'reroll', { kind: 'gainStats', atk: 1, hp: 0 });
add('reprint surprise lineage', 'faint', { kind: 'reboot' });
add('marketplace leftovers ticket', 'knockOut', { kind: 'gainVictimAttack' });
add('surf_report outfit_swap triage page_turn', 'hurt', { kind: 'swapBehind' }, { seat: 'front' });
add('distill', 'faint', { kind: 'grantKeyword', keyword: 'doubleHit', amount: 1 });
add('bookmark dog_ear', 'faint', { kind: 'grantKeyword', keyword: 'leech', amount: 1 });
add('axiom', 'faint', { kind: 'grantKeyword', keyword: 'armor', amount: 1 });
add('pass_butter', 'faint', { kind: 'grantKeyword', keyword: 'reflect', amount: 1 });
add('cold_shower inbox_zero skip send_back', 'startOfBattle', { kind: 'sendFrontBack' });
add('unread notes overview robocall briefing', 'startOfBattle', { kind: 'volley', damage: 1 });
add('bid_spread', 'startOfBattle', { kind: 'volley', damage: 2 });
add('pivot unfollow remittance', 'startOfBattle', { kind: 'stripBonuses' });
add('synthesis', 'startOfBattle', { kind: 'rally', atk: 2, hp: 2 });
add('breakout cheer', 'startOfBattle', { kind: 'rally', atk: 1, hp: 1 });
add('home_turf', 'startOfBattle', { kind: 'sharedCrew', atk: 3, hp: 3 }, { firstStrike: true });
add('market_share venture_brief', 'startOfBattle', { kind: 'sharedCrew', atk: 2, hp: 2 });
add('weekly_read', 'startOfBattle', { kind: 'sharedCrew', atk: 1, hp: 1 });
add('audit', 'knockOut', { kind: 'attackAgain' }, { firstStrike: true });
add('brain_dump one_more_rep', 'knockOut', { kind: 'attackAgain' });
add('pickpocket misprice sold_price', 'startOfBattle', { kind: 'copyKeywords' });
add('cost_cut second_helping pickup', 'startOfBattle', { kind: 'eatBehind' });
add('hearing', 'startOfBattle', { kind: 'fromRound', round: 3, atk: 4, hp: 4 });
add('day_plan', 'startOfBattle', { kind: 'fromRound', round: 2, atk: 2, hp: 2 });
add('tempo', 'startOfBattle', { kind: 'fromRound', round: 3, atk: 2, hp: 0 });
add('quarterly', 'startOfBattle', { kind: 'fromRound', round: 3, atk: 2, hp: 2 });
add('counteroffer clawback', 'startOfBattle', { kind: 'swapAttack' });
add('render', 'startOfBattle', { kind: 'coinStats', atk: 5, hp: 5 });
add('all_in', 'startOfBattle', { kind: 'coinStats', atk: 4, hp: 4 });
add('screening hot_take', 'beforeAttack', { kind: 'execute', hp: 2 });
add('prior_art auto_reply grudge', 'faint', { kind: 'silenceFront' });

const FUSIONS = [
  ['sales', 'sales', 'Closer', 'startOfBattle', { kind: 'stealAttack', target: 'strongest', amount: 2 }],
  ['ops', 'ops', 'Bunker', 'passive', { kind: 'armor', amount: 2 }],
  ['marketing', 'marketing', 'Hype Machine', 'startOfBattle', { kind: 'snipeRandomEnemies', count: 3, damage: 2 }],
  ['personal', 'personal', 'Confidant', 'aura', { kind: 'friendAttack', amount: 1 }],
  ['builders', 'builders', 'Foreman', 'friendFaints', { kind: 'gainStats', atk: 2, hp: 2 }],
  ['sales', 'ops', 'Pipeline', 'startOfBattle', { kind: 'buffAheadStats', atk: 2, hp: 2 }],
  ['sales', 'marketing', 'Growth Hacker', 'startOfBattle', { kind: 'snipe', target: 'front', damage: 3 }],
  ['sales', 'personal', 'Charmer', 'startOfBattle', { kind: 'jam', count: 1 }],
  ['sales', 'builders', 'Founder', 'lastStanding', { kind: 'gainStats', atk: 3, hp: 3 }],
  ['ops', 'marketing', 'Launch Team', 'passive', { kind: 'splash', amount: 2 }],
  ['ops', 'personal', 'Wellness', 'endExchange', { kind: 'healFront', amount: 1 }],
  ['ops', 'builders', 'Platform', 'startOfBattle', { kind: 'shield', target: 'self' }],
  ['marketing', 'personal', 'Influencer', 'aura', { kind: 'enemyAttack', amount: 1 }],
  ['marketing', 'builders', 'Demo Day', 'passive', { kind: 'doubleHit' }],
  ['personal', 'builders', 'Mentor', 'startOfBattle', { kind: 'buffAllFriends', atk: 1, hp: 1 }],
].map(([a, b, name, trigger, effect]) => {
  const kitId = `fusion_${name.toLowerCase().replace(/ /g, '_')}`;
  KITS[kitId] = { season: 4, trigger, effect };
  return { crews: [a, b], name, kitId };
});
const fusionFor = (a, b) => FUSIONS.find(f => (f.crews[0] === a && f.crews[1] === b) || (f.crews[1] === a && f.crews[0] === b));
module.exports = { CAPTAINS, SEATS, RELICS, KITS, FUSIONS, fusionFor };

// Only combat effects can be recovered from public captions. Economic captains/relics are
// intentionally absent: raw replay boards already include their permanent shop effects.
function combatMetadata(frames, side = 'you') {
  const captions = (frames || []).map(f => f.caption || '');
  const prefix = side === 'them' ? 'Enemy ' : '';
  const captain = ['drill','medic','heckler','veteran','gearhead'].find(id => captions.some(c => c.startsWith(prefix + id[0].toUpperCase() + id.slice(1) + ':'))) || null;
  const names = {helmets:'Helmets',fangs:'Fangs',sticky:'Sticky',doubleTap:'Double tap',vampire:'Vampire',quickDraw:'Quick draw',hotfix:'Hotfix',encore:'Encore',wideSwing:'Wide swing',jammer:'Jammer',bubble:'Bubble',loudCrew:'Loud crew',alchemist:'Alchemist'};
  const relics = [];
  for (const caption of captions) for (const [id, name] of Object.entries(names)) {
    // Seat Encore captions name a bot; relic Encore describes the team.
    if (caption.startsWith(prefix + name + ':') && (id !== 'encore' || caption.includes("bots' start-of-battle abilities")) && !relics.includes(id)) relics.push(id);
  }
  return {captain, relics};
}
module.exports.combatMetadata = combatMetadata;
