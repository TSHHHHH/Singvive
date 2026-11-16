import { describe, expect, it } from 'vitest';
import { parseEnvelope } from './protocol';
import { applyCommand, advanceRoom, createRoom, joinRoom } from './simulation';
import { initializeIsland, buildIslandCatalog, projectIslandRoom } from './islandWorld';
import { installZones } from '../game/playable';

function setup() {
  installZones({ generated:'test', land:[[[1.2,103.6],[1.5,103.6],[1.5,104],[1.2,104]]],water:[],restricted:[],vegetation:[] });
  const catalog = buildIslandCatalog([{osmId:'block',name:'Block',category:'residential',lat:1.3508,lng:103.8483}], 'test');
  const room = createRoom('ROOM','building-seed',0);
  initializeIsland(room,catalog); joinRoom(room,'a','A'); joinRoom(room,'b','B');
  room.players.forEach(p => {p.connected=true;}); room.phase='running';
  return {room,catalog};
}
describe('shared block interiors', () => {
  it('parses bounded interior commands', () => {
    expect(parseEnvelope(JSON.stringify({type:'command',seq:1,command:{type:'enterBuilding'}}))?.command).toEqual({type:'enterBuilding'});
    expect(parseEnvelope(JSON.stringify({type:'command',seq:1,command:{type:'stairs',level:2.5}}))).toBeNull();
  });
  it('enters independently without surface discovery and blocks surface escape', () => {
    const {room,catalog}=setup(); const explored=structuredClone(room.world!.explored);
    expect(applyCommand(room,'a',{type:'enterBuilding'},0,catalog)).toBeNull();
    expect(room.players[0].action?.mode).toBe('interior');
    advanceRoom(room,3000,catalog);
    const a=room.players[0]; expect(room.world!.locations[a.site].interior?.level).toBe(1);
    expect(room.players[1].site).toBe('block'); expect(room.world!.explored).toEqual(explored);
    expect(applyCommand(room,'a',{type:'travel',site:'block'},3000,catalog)).toBeTruthy();
    expect(applyCommand(room,'a',{type:'trek',lat:1.351,lng:103.8483},3000,catalog)).toBeTruthy();
    expect(projectIslandRoom(room,'b').sites[a.site]).toBeUndefined();
    expect(applyCommand(room,'a',{type:'exitBuilding'},3000,catalog)).toBeNull();
    advanceRoom(room,6000,catalog); expect(a.site).toBe('block');
  });
});
import { availableIslandInteriorChoices } from './islandBuildings';
import { UNIT_META } from '../game/hdbDungeon';
function enter() {
  const s=setup(); applyCommand(s.room,'a',{type:'enterBuilding'},0,s.catalog); advanceRoom(s.room,3000,s.catalog);
  const go=(id:string, command:Parameters<typeof applyCommand>[2]) => {
    const err=applyCommand(s.room,id,command,s.room.wallAt,s.catalog);
    if (err) throw new Error(err);
    const p=s.room.players.find(p=>p.id===id)!;
    if(p.action) advanceRoom(s.room,s.room.wallAt+p.action.endsAt-s.room.simMs,s.catalog);
  };
  return {...s,go};
}
describe('interior isolation and conservation',()=>{
  it('rejects sealed, roof, locked and cross-floor door targets',()=>{
    const {room,catalog,go}=enter(); const a=room.players[0];
    const floors=room.world!.locations.block.building!.floors;
    for(const floor of floors.filter(f=>f.sealed||f.roof)) {
      expect(applyCommand(room,'a',{type:'stairs',level:floor.level},room.wallAt,catalog)).toBeTruthy();
    }
    const floor=floors.find(f=>!f.sealed&&!f.roof&&f.level!==1&&f.units.length)!;
    const u=floor.units[0]; u.type='flat';u.available=true;u.entry='locked';
    expect(applyCommand(room,'a',{type:'enterUnit',unitId:u.id},room.wallAt,catalog)).toBeTruthy();
    go('a',{type:'stairs',level:floor.level});
    expect(applyCommand(room,'a',{type:'enterUnit',unitId:u.id},room.wallAt,catalog)).toBeTruthy();
    expect(availableIslandInteriorChoices(room,a.id).find(c=>c.command.type==='enterUnit'&&c.command.unitId===u.id)?.reasonCode).toBe('locked');
  });
  it('keeps rescue, trade and combat bound to exact floor identities',()=>{
    const {room,catalog,go}=enter();go('b',{type:'enterBuilding'});
    const a=room.players[0], b=room.players[1];
    const floor=room.world!.locations.block.building!.floors.find(f=>!f.sealed&&!f.roof&&f.level!==1)!;
    go('a',{type:'stairs',level:floor.level});
    b.status='downed';b.downedUntil=room.simMs+30000;
    expect(applyCommand(room,'a',{type:'rescue',playerId:'b'},room.wallAt,catalog)).toBeTruthy();
    b.status='active';b.downedUntil=null;
    expect(applyCommand(room,'a',{type:'giveItem',playerId:'b',uid:a.expedition!.items[0].uid},room.wallAt,catalog)).toBeTruthy();
    room.sites[a.site].enemyHp=500;
    const hp=b.hp; const enemy=room.sites[a.site].enemyHp;
    expect(applyCommand(room,'b',{type:'fight'},room.wallAt,catalog)).toBeTruthy();
    advanceRoom(room,room.wallAt+2000,catalog);
    expect(b.hp).toBe(hp);expect(room.sites[a.site].enemyHp).toBe(enemy);
    expect(projectIslandRoom(room,b.id).sites[a.site]).toBeUndefined();
  });
  it('reserves finite room searches once and keeps loot, drop cache and layout across revisit and restart',()=>{
    const {room,catalog,go}=enter();go('b',{type:'enterBuilding'});
    const floors=room.world!.locations.block.building!.floors;
    const floor=floors.find(f=>!f.sealed&&!f.roof&&f.units.some(u=>u.available&&['open','ajar'].includes(u.entry)&&UNIT_META[u.type].lootTable))!;
    const u=floor.units.find(u=>u.available&&['open','ajar'].includes(u.entry)&&UNIT_META[u.type].lootTable)!;
    if(floor.level!==1) {go('a',{type:'stairs',level:floor.level});go('b',{type:'stairs',level:floor.level});}
    go('a',{type:'enterUnit',unitId:u.id});room.sites[room.players[0].site].enemyHp=0;
    go('b',{type:'enterUnit',unitId:u.id});
    const site=room.players[0].site;room.sites[site].searches=1;
    expect(applyCommand(room,'a',{type:'search'},room.wallAt,catalog)).toBeNull();
    expect(applyCommand(room,'b',{type:'search'},room.wallAt,catalog)).toBeTruthy();
    advanceRoom(room,room.wallAt+15000,catalog);expect(room.sites[site].items!.length).toBeGreaterThan(0);
    const item=room.sites[site].items![0];
    expect(applyCommand(room,'a',{type:'takeItem',uid:item.uid},room.wallAt,catalog)).toBeNull();
    expect(applyCommand(room,'b',{type:'takeItem',uid:item.uid},room.wallAt,catalog)).toBeTruthy();
    const before=structuredClone(room.sites[site]);const layout=structuredClone(floors);
    go('a',{type:'leaveUnit'});go('a',{type:'enterUnit',unitId:u.id});
    expect(room.sites[site]).toEqual(before);expect(room.world!.locations.block.building!.floors).toEqual(layout);
    const restarted=JSON.parse(JSON.stringify(room));
    expect(availableIslandInteriorChoices(restarted,'a')).toEqual(availableIslandInteriorChoices(room,'a'));
    expect(restarted.sites[site]).toEqual(before);
  });
  it('flees only one room transition, pays damage and never teleports to spawn',()=>{
    const {room,catalog,go}=enter();
    const floor=room.world!.locations.block.building!.floors.find(f=>!f.sealed&&!f.roof&&f.level!==1&&f.units.some(u=>u.available&&['open','ajar'].includes(u.entry)&&UNIT_META[u.type].lootTable))!;
    go('a',{type:'stairs',level:floor.level});
    const a=room.players[0];const landing=a.site;const u=floor.units.find(u=>u.available&&['open','ajar'].includes(u.entry)&&UNIT_META[u.type].lootTable);
    if(!u) throw new Error('Fixture requires an open searchable unit');
    go('a',{type:'enterUnit',unitId:u.id});room.sites[a.site].enemyHp=500;const hp=a.hp;
    expect(applyCommand(room,'a',{type:'flee'},room.wallAt,catalog)).toBeNull();
    expect(a.action?.target).toBe(landing);expect(a.action?.mode).toBe('interior');expect(a.hp).toBeLessThan(hp);
    advanceRoom(room,room.wallAt+3000,catalog);expect(a.site).toBe(landing);
  });
});
it('marks a lethal arrival trap downed at the arrival deadline',()=>{
  const {room,catalog,go}=enter(); room.seed+='0'; const a=room.players[0];
  const floor=room.world!.locations.block.building!.floors.find(f=>!f.sealed&&!f.roof&&f.units.length)!;
  if(floor.level!==1) go('a',{type:'stairs',level:floor.level});
  const u=floor.units[0];u.type='trapped';u.entry='open';u.available=true;
  for(const part of Object.values(a.expedition!.bodyParts)) part.hp=0;
  a.expedition!.bodyParts.head.hp=1;
  a.expedition!.bodyParts.torso.maxHp=0;
  expect(applyCommand(room,'a',{type:'enterUnit',unitId:u.id},room.wallAt,catalog)).toBeNull();
  const end=a.action!.endsAt;
  advanceRoom(room,room.wallAt+end-room.simMs,catalog);
  expect(a.hp).toBe(0);expect(a.status).toBe('downed');expect(a.downedUntil).toBe(end+30000);
});
