import { D, parseNum, type Decimal } from './num';
import { ratePerSecond, type GameState } from './state';
import { streetsOwned } from './city';

/** Isolated first-hall experiment. Never writes or mutates a live GameState. */
export const LAB_KEY='scrap-idle-horizon-lab-v1';
export type LabModule='winch'|'press'|'frame'|'relay';
export type LabProject=LabModule|'gallery';
export interface LabProfile {
  source: 'save'|'example';
  supply:number;quality:number;logistics:number;mine:number;
}
export const EXAMPLE_PROFILE:LabProfile={source:'example',supply:.6,quality:.5,logistics:.5,mine:.5};
const clamp=(n:number)=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
export function profileOf(s:GameState):LabProfile {
  return {source:'save',
    supply:clamp(ratePerSecond(s).add(1).log10().toNumber()/60),
    quality:clamp(s.sorting.found.length/24*.4+s.sorting.total.add(1).log10().toNumber()/12*.6),
    logistics:clamp(streetsOwned(s.city)/47),
    mine:clamp(Math.log10(s.bottom.opened+1)/5*.6+Math.min(6,s.bottom.equipment.borer)/6*.4),
  };
}
export const LAB_MODULES:Record<LabModule,{name:string;cost:number;seconds:number;needs:LabModule[];effect:string}>={
  winch:{name:'Грузовая лебёдка',cost:24,seconds:90,needs:[],effect:'Подача на 60% быстрее, большие грузы и доступ к несущей раме.'},
  press:{name:'Разборочный пресс',cost:24,seconds:70,needs:[],effect:'В 1,8 раза больше КМ из той же партии. Машина начинает работать сразу после сборки.'},
  frame:{name:'Несущая рама',cost:40,seconds:150,needs:['winch'],effect:'Автоматические поставки и увеличенный бункер. Снабжение больше не требует заказов.'},
  relay:{name:'Силовая магистраль',cost:70,seconds:110,needs:['frame','press'],effect:'Соединяет работающие машины с затвором. После импульса доступна автоочередь секций.'},
};
export const LAB_ORDER:LabModule[]=['winch','press','frame','relay'];
export interface LabJob {id:LabProject;left:number;duration:number}
export interface LabShipment {quantity:Decimal;left:number;duration:number}
export interface LabState {
  v:1;profile:LabProfile;km:Decimal;raw:Decimal;
  built:Record<LabModule,boolean>;job:LabJob|null;shipment:LabShipment|null;
  autoDelivery:boolean;autoQueue:boolean;commissioned:boolean;pulses:number;gallery:number;
  elapsed:number;processed:Decimal;delivered:Decimal;lastTick:number;launchedAt:number|null;
}
export function newLab(profile:LabProfile=EXAMPLE_PROFILE,now=Date.now()):LabState {
  return {v:1,profile:{...profile},km:D(28),raw:D(8),built:{winch:false,press:false,frame:false,relay:false},
    job:null,shipment:null,autoDelivery:false,autoQueue:false,commissioned:false,pulses:1,gallery:0,
    elapsed:0,processed:D(0),delivered:D(0),lastTick:now,launchedAt:null};
}
export function labRates(s:LabState) {
  const rawPerMinute=D(4).mul(s.built.winch?1.6:1).mul(D(1.12).pow(s.gallery));
  const yieldPerRaw=D(1+s.profile.quality*.5).mul(s.built.press?1.8:1);
  const capacity=D(24+(s.built.frame?32:0)+4*s.gallery);
  const payload=D(s.built.winch?26:10).mul(1+.8*s.profile.supply).min(capacity);
  const tripSeconds=35/(1+.5*s.profile.logistics+.4*s.profile.mine);
  const crew=1+.35*s.profile.mine;
  const production=D(1).add(s.raw.gt(0)?rawPerMinute.mul(yieldPerRaw):0);
  return {rawPerMinute,yieldPerRaw,capacity,payload,tripSeconds,crew,production};
}
export const labCost=(s:LabState,id:LabProject)=>id==='gallery'?D(50).mul(D(1.55).pow(s.gallery)).ceil():D(LAB_MODULES[id].cost);
export const projectName=(id:LabProject)=>id==='gallery'?'Секция дальней галереи':LAB_MODULES[id].name;
export function projectAvailable(s:LabState,id:LabProject):boolean {
  return id==='gallery'?s.commissioned:!s.built[id]&&LAB_MODULES[id].needs.every(n=>s.built[n]);
}
export function startProject(s:LabState,id:LabProject):boolean {
  const cost=labCost(s,id);
  if(s.job||!projectAvailable(s,id)||s.km.lt(cost))return false;
  const seconds=id==='gallery'?90:LAB_MODULES[id].seconds;
  const duration=seconds/labRates(s).crew;
  s.km=s.km.sub(cost);s.job={id,left:duration,duration};return true;
}
export function requestShipment(s:LabState):boolean {
  if(s.shipment)return false;
  const r=labRates(s),quantity=r.payload.min(r.capacity.sub(s.raw));
  if(quantity.lte(1e-8))return false;
  s.shipment={quantity,left:r.tripSeconds,duration:r.tripSeconds};return true;
}
export function commissionLab(s:LabState):boolean {
  if(s.commissioned||s.pulses<1||!LAB_ORDER.every(id=>s.built[id]))return false;
  s.pulses--;s.commissioned=true;s.launchedAt=s.elapsed;return true;
}
function settle(s:LabState):void {
  if(s.raw.lte(1e-10))s.raw=D(0);
  if(s.job&&s.job.left<=1e-7){
    if(s.job.id==='gallery')s.gallery++;
    else {s.built[s.job.id]=true;if(s.job.id==='frame')s.autoDelivery=true;}
    s.job=null;
  }
  if(s.shipment&&s.shipment.left<=1e-7){
    const delivered=s.shipment.quantity.min(labRates(s).capacity.sub(s.raw).max(0));
    s.raw=s.raw.add(delivered);s.delivered=s.delivered.add(delivered);s.shipment=null;
  }
  if(s.built.frame&&s.autoDelivery&&!s.shipment&&s.raw.lte(labRates(s).capacity.mul(.5)))requestShipment(s);
  if(s.commissioned&&s.autoQueue&&!s.job)startProject(s,'gallery');
}
/** Exact splits at deliveries, construction, depleted raw stock and affordable queue orders. */
export function tickLab(s:LabState,seconds:number):void {
  if(!Number.isFinite(seconds)||seconds<=0)return;
  let left=seconds;
  while(left>1e-8){
    settle(s);
    const r=labRates(s),active=s.raw.gt(1e-10);
    const income=D(1).add(active?r.rawPerMinute.mul(r.yieldPerRaw):0);
    let dt=left;
    if(s.job)dt=Math.min(dt,s.job.left);
    if(s.shipment)dt=Math.min(dt,s.shipment.left);
    if(active)dt=Math.min(dt,s.raw.div(r.rawPerMinute).mul(60).toNumber());
    if(s.built.frame&&s.autoDelivery&&!s.shipment&&active&&s.raw.gt(r.capacity.mul(.5)))
      dt=Math.min(dt,s.raw.sub(r.capacity.mul(.5)).div(r.rawPerMinute).mul(60).toNumber());
    if(s.commissioned&&s.autoQueue&&!s.job&&s.km.lt(labCost(s,'gallery')))
      dt=Math.min(dt,labCost(s,'gallery').sub(s.km).div(income).mul(60).toNumber());
    // A very small numerical remainder is settled without losing income or duplicating a job.
    if(dt<1e-9)dt=Math.min(left,1e-8);
    const raw=active?s.raw.min(r.rawPerMinute.mul(dt/60)):D(0);
    s.raw=s.raw.sub(raw).max(0);s.processed=s.processed.add(raw);
    s.km=s.km.add(dt/60).add(raw.mul(r.yieldPerRaw));
    if(s.job)s.job.left=Math.max(0,s.job.left-dt);
    if(s.shipment)s.shipment.left=Math.max(0,s.shipment.left-dt);
    s.elapsed+=dt;left-=dt;
  }
  settle(s);
}
export function serializeLab(s:LabState):string {
  return JSON.stringify({...s,km:s.km.toString(),raw:s.raw.toString(),processed:s.processed.toString(),delivered:s.delivered.toString(),
    shipment:s.shipment?{...s.shipment,quantity:s.shipment.quantity.toString()}:null});
}
export function deserializeLab(text:string):LabState|null {
  try{
    const raw=JSON.parse(text);if(raw.v!==1||!raw.profile)return null;
    const p=raw.profile,profile:LabProfile={source:p.source==='save'?'save':'example',supply:clamp(p.supply),quality:clamp(p.quality),logistics:clamp(p.logistics),mine:clamp(p.mine)};
    const s=newLab(profile);const numbers=['km','raw','processed','delivered'] as const;
    for(const key of numbers){const n=parseNum(raw[key]);if(!n||!n.isFinite()||n.lt(0))return null;s[key]=n;}
    for(const id of LAB_ORDER)s.built[id]=raw.built?.[id]===true;
    s.commissioned=raw.commissioned===true&&LAB_ORDER.every(id=>s.built[id]);
    s.gallery=Number.isSafeInteger(raw.gallery)?Math.max(0,Math.min(100,raw.gallery)):0;
    s.autoDelivery=s.built.frame&&raw.autoDelivery===true;s.autoQueue=s.commissioned&&raw.autoQueue===true;
    s.pulses=raw.pulses===1?1:0;
    const duration=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=3600;
    if(raw.job&&(['gallery',...LAB_ORDER] as string[]).includes(raw.job.id)&&duration(raw.job.duration)&&duration(raw.job.left)&&raw.job.left<=raw.job.duration&&projectAvailable(s,raw.job.id))s.job={...raw.job};
    if(raw.shipment&&duration(raw.shipment.duration)&&duration(raw.shipment.left)&&raw.shipment.left<=raw.shipment.duration){
      const quantity=parseNum(raw.shipment.quantity);if(quantity&&quantity.isFinite()&&quantity.gt(0))s.shipment={...raw.shipment,quantity:quantity.min(labRates(s).capacity)};
    }
    s.raw=s.raw.min(labRates(s).capacity);
    s.elapsed=Number.isFinite(raw.elapsed)?Math.max(0,raw.elapsed):0;
    s.lastTick=Number.isFinite(raw.lastTick)?raw.lastTick:Date.now();
    s.launchedAt=s.commissioned&&Number.isFinite(raw.launchedAt)?raw.launchedAt:null;return s;
  }catch{return null;}
}
export function labStage(stage:string,profile=EXAMPLE_PROFILE):LabState {
  const s=newLab(profile);s.elapsed=420;s.raw=D(16);s.km=D(46);
  if(stage==='arrival'){s.raw=D(8);s.km=D(28);s.elapsed=0;}
  if(stage==='winch'){s.built.winch=true;s.job={id:'frame',duration:150,left:80};}
  if(stage==='factory'||stage==='commissioned'){
    s.built={winch:true,press:true,frame:true,relay:stage==='commissioned'};
    s.autoDelivery=true;s.shipment={quantity:D(26),duration:35,left:18};
    if(stage==='factory')s.job={id:'relay',duration:110,left:45};
    else {s.commissioned=true;s.pulses=0;s.gallery=2;s.launchedAt=400;}
  }
  return s;
}
