import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRoom, joinRoom, setConnected, applyCommand, advanceRoom } from './simulation';
import { buildIslandCatalog, initializeIsland } from './islandWorld';
import { installZones } from '../game/playable';
import { clearRouteMemo } from '../game/route';
import type { RawPoi } from '../game/overpass';
import type { ZonesData } from '../game/playable';
import revision from '../game/data/poiRevision.json';
import { SPAWN_DISTRICTS } from './islandModel';

const pois: RawPoi[] = [
  { osmId: 'spawn', name: 'Start', lat:1.3508,lng:103.8483,category:'convenience' },
  { osmId: 'clinic', name:'Clinic',lat:1.3509,lng:103.849,category:'clinic' },
  { osmId:'evac',name:'Evac',lat:1.36,lng:103.91,category:'community' },
];
function setup() {
  installZones({ generated:'test',land:[[[1.2,103.6],[1.5,103.6],[1.5,104],[1.2,104]]],water:[],restricted:[],vegetation:[] }); clearRouteMemo();
  const catalog=buildIslandCatalog(pois,'test');
  const room=createRoom('ABCDEF123456','island-test',0); initializeIsland(room,catalog);
  for(const id of ['a','b']) { joinRoom(room,id,id); setConnected(room,id,true,0,catalog); }
  applyCommand(room,'a',{type:'start'},0,catalog);
  return {room,catalog};
}
describe('authoritative island expedition',()=>{
  it('advances independent actions once and conserves contested loot',()=>{
    const {room,catalog}=setup();
    room.sites.spawn.searches=3;
    expect(applyCommand(room,'a',{type:'search'},0,catalog)).toBeNull();
    expect(applyCommand(room,'b',{type:'search'},0,catalog)).toBeNull();
    advanceRoom(room,15000,catalog);
    const cache=room.sites.spawn.items!;
    expect(cache.length).toBeGreaterThan(1);
    expect(new Set(cache.map(i=>i.uid)).size).toBe(cache.length);
    const uid=cache[0].uid;
    expect(applyCommand(room,'a',{type:'takeItem',uid},15000,catalog)).toBeNull();
    expect(applyCommand(room,'b',{type:'takeItem',uid},15000,catalog)).toMatch(/no longer/);
    expect(room.players.flatMap(p=>p.expedition!.items).filter(i=>i.uid===uid)).toHaveLength(1);
    expect(room.simMs).toBe(15000);
    expect(room.sites.spawn.searches).toBe(1);
  });
  it('supports real travel while a teammate rests and rejects remote teleporting',()=>{
    const {room,catalog}=setup();
    expect(applyCommand(room,'a',{type:'travel',site:'evac'},0,catalog)).toMatch(/closer/);
    expect(applyCommand(room,'a',{type:'travel',site:'clinic'},0,catalog)).toBeNull();
    expect(applyCommand(room,'b',{type:'rest'},0,catalog)).toBeNull();
    const end=room.players[0].action!.endsAt;
    advanceRoom(room,end,catalog);
    expect(room.players[0].site).toBe('clinic');
    expect(room.players[1].site).toBe('spawn');
    expect(room.players[1].action?.kind).toBe('rest');
    expect(room.world!.locations.clinic.visited).toBe(true);
  });
  it('consumes a real medical charge only when a nearby rescue completes',()=>{
    const {room,catalog}=setup();
    const target=room.players[0], rescuer=room.players[1];
    target.status='downed';target.hp=0;target.downedUntil=30000;
    for(const part of Object.values(target.expedition!.bodyParts)) part.hp=0;
    const charges=rescuer.medical;
    expect(applyCommand(room,'b',{type:'rescue',playerId:'a'},0,catalog)).toBeNull();
    expect(rescuer.medical).toBe(charges);
    advanceRoom(room,5000,catalog);
    expect(target.status).toBe('active');expect(target.hp).toBeGreaterThan(0);
    expect(rescuer.medical).toBe(charges-1);
    expect(target.wounds).toBe(1);
  });
  it('keeps applied care committed through cancel and another command until its deadline',()=>{
    const {room,catalog}=setup();
    const p=room.players[0], survivor=p.expedition!;
    survivor.bodyParts.leftArm={...survivor.bodyParts.leftArm,hp:3,bleed:'major',wound:'deep'};
    survivor.items.push({uid:'care-stack',defId:'bandage',stack:2,container:'backpack',x:0,y:0,rotated:false});
    room.sites.spawn.searches=3;
    expect(applyCommand(room,'a',{type:'useItem',uid:'care-stack',part:'leftArm'},0,catalog)).toBeNull();
    const action={...p.action!};
    expect(action.kind).toBe('treat');
    expect(survivor.bodyParts.leftArm.bleed).toBe('none');
    expect(applyCommand(room,'a',{type:'cancel'},0,catalog)).toMatch(/treatment/i);
    expect(applyCommand(room,'a',{type:'search'},0,catalog)).toBeTruthy();
    expect(applyCommand(room,'a',{type:'useItem',uid:'care-stack',part:'leftArm'},0,catalog)).toBeTruthy();
    expect(survivor.items.find(i=>i.uid==='care-stack')?.stack).toBe(1);
    expect(room.simMs).toBe(0);
    expect(room.sites.spawn.searches).toBe(3);
    expect(p.action).toEqual(action);
    advanceRoom(room,action.endsAt-1,catalog);
    expect(p.action).toEqual(action);
    advanceRoom(room,action.endsAt,catalog);
    expect(p.action).toBeNull();
    expect(applyCommand(room,'a',{type:'search'},action.endsAt,catalog)).toBeNull();
  });
  it('stops automatic fighting during care and rejects fleeing before treatment completes',()=>{
    const {room,catalog}=setup();
    const p=room.players[0], survivor=p.expedition!;
    survivor.bodyParts.leftArm={...survivor.bodyParts.leftArm,hp:3,bleed:'major',wound:'deep'};
    survivor.items.push({uid:'combat-care',defId:'bandage',stack:2,container:'backpack',x:0,y:0,rotated:false});
    room.sites.spawn.enemyHp=100;
    expect(applyCommand(room,'a',{type:'fight'},0,catalog)).toBeNull();
    expect(applyCommand(room,'a',{type:'useItem',uid:'combat-care',part:'leftArm'},0,catalog)).toBeNull();
    const action={...p.action!};
    expect(p.fighting).toBe(false);
    expect(applyCommand(room,'a',{type:'flee'},0,catalog)).toMatch(/treatment/i);
    expect(p.action).toEqual(action);
    expect(p.site).toBe('spawn');
    expect(survivor.items.find(i=>i.uid==='combat-care')?.stack).toBe(1);
    advanceRoom(room,2000,catalog);
    expect(room.sites.spawn.enemyHp).toBe(100);
    expect(p.action).toEqual(action);
    advanceRoom(room,action.endsAt,catalog);
    expect(p.action).toBeNull();
  });
  it('loads every selectable district from the actual committed map',()=>{
    const index=JSON.parse(readFileSync(`public/poi-data/${revision}/index.json`,'utf8')) as {pois:RawPoi[]};
    const zones=JSON.parse(readFileSync('public/zones.json','utf8')) as ZonesData;
    installZones(zones);clearRouteMemo();
    const catalog=buildIslandCatalog(index.pois,revision);
    expect(catalog.pois.size).toBeGreaterThan(10000);
    for(const district of SPAWN_DISTRICTS){
      const room=createRoom('ABCDEF123456','real-island',0);
      initializeIsland(room,catalog,district.id);
      expect(room.world!.locations[room.world!.spawn]).toBeDefined();
      expect(Object.keys(room.world!.locations).length).toBeGreaterThan(5);
      expect(room.world!.evac).not.toBe(room.world!.spawn);
    }
  });
});
