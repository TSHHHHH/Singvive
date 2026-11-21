import { generateDungeon, UNIT_META, type HdbFloor, type HdbUnitType } from '../game/hdbDungeon';
import { Rng } from '../game/rng';
import type { IslandLocation } from './islandModel';
import type { Command, RoomState, Survivor } from './model';

export type IslandInteriorCommand = {type:'enterBuilding'|'leaveUnit'|'exitBuilding'} | {type:'stairs';level:number} | {type:'enterUnit';unitId:string};
export interface IslandInteriorChoice {
  kind:'enter'|'stairs'|'unit'|'leaveUnit'|'exit'; label:string; command:IslandInteriorCommand;
  available:boolean; reason?:string; storey?:number; unitLabel?:string; unitType?:HdbUnitType;
  reasonCode?:'sealed'|'locked'|'unsupported'|'unavailable';
}
const landingId = (parent:string,level:number) => `hdb:${parent}:floor:${level}`;
const roomId = (parent:string,level:number,unit:string) => `${landingId(parent,level)}:unit:${unit}`;
const supported = (type:HdbUnitType) => UNIT_META[type].lootTable !== null;

/** Layout is shared; survivor position is always the exact child site ID. */
export function ensureIslandBuilding(room:RoomState, parent:IslandLocation):void {
  if (parent.building || parent.interior || parent.category !== 'residential') return;
  const dungeon=generateDungeon(new Rng(room.seed).fork(`hdb:${parent.id}`), {id:parent.id,name:parent.name,currentDanger:parent.danger}, 'estate');
  parent.building={floors:dungeon.floors};
}
/** Pure discovery/choice selector. Authority uses these same restrictions. */
export function availableIslandInteriorChoices(room:RoomState,playerId:string):IslandInteriorChoice[] {
  const p=room.players.find(p=>p.id===playerId);
  const current=p && room.world?.locations[p.site];
  if (!current) return [];
  if (!current.interior) return current.category==='residential' ? [{kind:'enter',label:'Enter block',command:{type:'enterBuilding'},available:true}] : [];
  const {parent,level,unit}=current.interior;
  const floors=room.world!.locations[parent]?.building?.floors;
  if (!floors) return [];
  if (unit) return [{kind:'leaveUnit',label:'Return to landing',command:{type:'leaveUnit'},available:true}];
  const floor=floors.find(f=>f.level===level);
  if (!floor) return [];
  const choices:IslandInteriorChoice[]=floors.filter(f=>f.level!==level).map(f=>({
    kind:'stairs',label:`Storey ${f.storey??f.level}`,storey:f.storey??f.level,command:{type:'stairs',level:f.level},
    available:!f.sealed,
    ...(f.sealed?{reasonCode:'sealed' as const,reason:'This landing is permanently sealed.'}:{}),
  }));
  for (const u of floor.units) {
    const reasonCode=!u.available?'unavailable':!supported(u.type)?'unsupported':u.entry==='locked'||u.entry==='barricaded'?'locked':undefined;
    choices.push({kind:'unit',label:u.label,unitLabel:u.label,unitType:u.type,command:{type:'enterUnit',unitId:u.id},available:!reasonCode,
      ...(reasonCode?{reasonCode,reason:reasonCode==='locked'?'Locked and barricaded doors cannot be opened yet.':reasonCode==='unsupported'?'This unit service is unavailable.':'This unit is inaccessible.'}:{})});
  }
  if (level===1) choices.push({kind:'exit',label:'Exit block',command:{type:'exitBuilding'},available:true});
  return choices;
}
function materialize(room:RoomState,parent:IslandLocation,floor:HdbFloor,unitId?:string):string {
  const id=unitId?roomId(parent.id,floor.level,unitId):landingId(parent.id,floor.level);
  if (room.world!.locations[id]) return id;
  const unit=floor.units.find(u=>u.id===unitId);
  const meta=unit&&UNIT_META[unit.type];
  room.world!.locations[id]={id,name:unit?`${parent.name} · ${unit.label}`:`${parent.name} · Storey ${floor.storey??floor.level}`,lat:parent.lat,lng:parent.lng,category:meta?.lootTable??'waypoint',danger:parent.danger,faction:parent.faction,visited:false,interior:{parent:parent.id,level:floor.level,storey:floor.storey??floor.level,...(unitId?{unit:unitId}:{})}};
  const rng=new Rng(room.seed).fork(`interior:${id}`);
  room.sites[id]={searches:meta?.lootTable?rng.int(1,3):0,medical:0,food:0,enemyHp:0,round:0,items:[]};
  return id;
}
export function islandInteriorUnit(room:RoomState,site:string) {
  const interior=room.world?.locations[site]?.interior;
  return interior?.unit ? room.world!.locations[interior.parent]?.building?.floors.find(f=>f.level===interior.level)?.units.find(u=>u.id===interior.unit) : undefined;
}
/** Returns a trap cost; caller applies it through the authoritative health path. */
export function arriveIslandInterior(room:RoomState,p:Survivor):number {
  const location=room.world!.locations[p.site];
  if (!location.interior || location.visited) return 0;
  location.visited=true;
  const unit=islandInteriorUnit(room,p.site);
  if (!unit) return 0;
  const meta=UNIT_META[unit.type];
  const rng=new Rng(room.seed).fork(`interior-arrival:${p.site}`);
  room.sites[p.site].enemyHp=meta.verb==='fight'?(meta.fightElite?105:65):rng.chance(location.danger*0.08*(meta.encounterMod??1))?25+location.danger*10:0;
  return meta.trapped?8:0;
}
export function startIslandInterior(room:RoomState,p:Survivor,command:Command):string|null|undefined {
  if (!['enterBuilding','stairs','enterUnit','leaveUnit','exitBuilding'].includes(command.type)) return undefined;
  const current=room.world!.locations[p.site];
  if (room.sites[p.site].enemyHp>0) return 'Flee to disengage from this encounter.';
  const choice=availableIslandInteriorChoices(room,p.id).find(c=>c.command.type===command.type && (command.type!=='stairs'||(c.command.type==='stairs'&&c.command.level===command.level)) && (command.type!=='enterUnit'||(c.command.type==='enterUnit'&&c.command.unitId===command.unitId)));
  if (!choice?.available) return choice?.reason??'Choose an accessible landing or door from your current location.';
  let target:string; let duration=3000;
  if (command.type==='enterBuilding') {
    ensureIslandBuilding(room,current);
    target=materialize(room,current,current.building!.floors.find(f=>f.level===1)!);
  } else {
    const at=current.interior!; const parent=room.world!.locations[at.parent];
    if (command.type==='exitBuilding') target=parent.id;
    else {
      const level=command.type==='stairs'?command.level:at.level;
      const floor=parent.building!.floors.find(f=>f.level===level)!;
      target=materialize(room,parent,floor,command.type==='enterUnit'?command.unitId:undefined);
      if (command.type==='stairs') duration=Math.max(3000,Math.abs((floor.storey??floor.level)-at.storey)*1500);
    }
  }
  startInteriorTravel(room,p,target,duration); return null;
}
function startInteriorTravel(room:RoomState,p:Survivor,target:string,duration:number) {
  p.previousSite=p.site; p.fighting=false;
  p.action={kind:'travel',mode:'interior',target,startedAt:room.simMs,endsAt:room.simMs+duration,travelHours:duration/60000};
}
export function fleeIslandInterior(room:RoomState,p:Survivor):string|null {
  const current=room.world!.locations[p.site]; const at=current.interior!;
  const parent=room.world!.locations[at.parent];
  const previous=p.previousSite?room.world!.locations[p.previousSite]:undefined;
  let target:string;
  if (at.unit) target=landingId(at.parent,at.level);
  else if (at.level===1) target=parent.id;
  else if (previous?.interior?.parent===at.parent&&!previous.interior.unit&&previous.interior.level!==at.level) target=previous.id;
  else return 'No valid interior retreat is available.';
  // Existing nodes only: retreat never creates/replenishes a room or escapes the block.
  if (!room.world!.locations[target]) return 'No valid interior retreat is available.';
  const destination=room.world!.locations[target];
  const duration=Math.max(3000,Math.abs(at.storey-(destination.interior?.storey??1))*1500);
  startInteriorTravel(room,p,target,duration); return null;
}
