import { describe, expect, it } from 'vitest';
import { buildNetwork } from '../game/mrt';
import { installZones } from '../game/playable';
import { buildIslandCatalog, initializeIsland } from './islandWorld';
import { applyCommand, createRoom, joinRoom, advanceRoom } from './simulation';
import { availableIslandTunnels, discoverIslandTunnels } from './islandSystems';
import { islandAttack, completeIslandAction } from './islandActions';
import { ITEMS } from '../game/loot';
import { SKILLS_ENABLED } from '../game/featureFlags';
import { parseEnvelope } from './protocol';

function setup() {
  installZones({ generated: 'test', land: [[[1.2,103.6],[1.5,103.6],[1.5,104],[1.2,104]]], water: [], restricted: [], vegetation: [] });
  const net = buildNetwork({ generatedAt: '', attribution: '', stations: ['A','B','C'].map((id,i) => ({id,name:id,codes:[id],lat:1.3508,lng:103.8483+i*.01})), lines:[{code:'L',name:'Line',color:'#fff',mode:'mrt',parent:null,stations:['A','B','C'],shape:[]}] });
  const catalog = buildIslandCatalog([{osmId:'a',name:'A',category:'mrt',lat:1.3508,lng:103.8483},{osmId:'middle',name:'Hidden',category:'clinic',lat:1.3508,lng:103.8533},{osmId:'evac',name:'Evac',category:'park',lat:1.39,lng:103.90}], 'test', net);
  const room = createRoom('test','seed',0);
  initializeIsland(room,catalog); joinRoom(room,'p','Player');
  room.players[0].connected=true;
  applyCommand(room,'p',{type:'start'},0,catalog);
  return {room,catalog,p:room.players[0]};
}
describe('island tunnels', () => {
  it('reveals adjacent choices and validates authoritative adjacency', () => {
    const {room,catalog,p}=setup();
    discoverIslandTunnels(room,catalog,p.site);
    expect(availableIslandTunnels(room,p.site).map(e=>e.stationId)).toEqual(['B']);
    expect(applyCommand(room,'p',{type:'tunnel',stationId:'C'},0,catalog)).toBeTruthy();
    expect(p.action).toBeNull();
    expect(applyCommand(room,'p',{type:'tunnel',stationId:'B'},0,catalog)).toBeNull();
    expect(p.action?.mode).toBe('tunnel');
    expect(p.action!.endsAt).toBeGreaterThan(3000);
    advanceRoom(room,p.action!.endsAt,catalog);
    expect(p.site).toBe('mrt:B');
    expect(room.world!.locations.middle).toBeUndefined();
  });
  it('preserves depletion and prevents spoofing via nearby nonstation POIs', () => {
    const {room,catalog,p}=setup();
    discoverIslandTunnels(room,catalog,p.site);
    room.sites['mrt:B'].searches=0;
    discoverIslandTunnels(room,catalog,p.site);
    expect(room.sites['mrt:B'].searches).toBe(0);
    room.world!.locations[p.site].category='clinic';
    expect(applyCommand(room,'p',{type:'tunnel',stationId:'B'},0,catalog)).toBeTruthy();
  });
  it('does not award practice on rejection or use guns as free ammunition', () => {
    const {room,catalog,p}=setup();
    const skills=structuredClone(p.expedition!.skills);
    expect(applyCommand(room,'p',{type:'tunnel',stationId:'C'},0,catalog)).toBeTruthy();
    expect(p.expedition!.skills).toEqual(skills);
    const fists=islandAttack(p);
    const gun=Object.values(ITEMS).find(d=>d.effect.kind==='weapon' && d.effect.ranged)!;
    p.expedition!.equipment.mainHand={uid:'gun',defId:gun.id,condition:100};
    const ammo=structuredClone(p.expedition!.items);
    expect(islandAttack(p)).toBeLessThanOrEqual(fists);
    expect(p.expedition!.items).toEqual(ammo);
    p.expedition!.equipment.mainHand=null;
    completeIslandAction(room,p,{kind:'search',startedAt:0,endsAt:1,target:'test'},catalog);
    if (SKILLS_ENABLED) expect(p.expedition!.skills.scavenging).not.toEqual(skills.scavenging);
    else expect(p.expedition!.skills.scavenging).toEqual(skills.scavenging);
  });
  it('samples straight surface routes between sparse vertices', () => {
    const {room,catalog,p}=setup();
    expect(room.world!.locations.middle).toBeUndefined();
    completeIslandAction(room,p,{kind:'travel',mode:'surface',startedAt:0,endsAt:1000,route:[{lat:1.3508,lng:103.8483},{lat:1.3508,lng:103.8583}]},catalog);
    expect(room.world!.locations.middle).toBeDefined();
  });
  it('rejects malformed protocol arrays', () => {
    for(const stationId of [[],['B'],{},null,3]) expect(parseEnvelope(JSON.stringify({type:'command',seq:1,command:{type:'tunnel',stationId}}))).toBeNull();
    expect(parseEnvelope(JSON.stringify({type:'command',seq:1,command:{type:'tunnel',stationId:'B'}}))?.command).toEqual({type:'tunnel',stationId:'B'});
  });
});
