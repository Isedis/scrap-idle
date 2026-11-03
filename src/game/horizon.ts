import { D, Decimal } from './num';
import { melt, meltCost, savingGoal, umeOpen, type BottomState } from './bottom';
import { streetsOwned, type CityState } from './city';
import { newLab, labRates, tickLab, startProject, requestShipment, LAB_ORDER, labCost, projectAvailable, type LabState, type LabModule, type LabProfile } from './horizonLab';

export type Machine = 'transport' | 'processing' | 'assembly';
export type BuildMode = 'growth' | 'balance' | 'assembly';
export type HallRecipe = 'heavy' | 'precise' | 'legacy';
export interface HallNode { name: string; purpose: string; share: number; needs: number[] }
export interface Hall { name: string; reward: string; nodes: HallNode[] }
const node = (name: string, purpose: string, share: number, needs: number[] = []): HallNode => ({ name, purpose, share, needs });
export const HALLS: readonly Hall[] = [
  { name: 'Приёмная галерея', reward: 'Постоянное снабжение · автомонтаж следующего зала', nodes: [
    node('Основание', 'Держит направляющую обеих створок', 1/7), node('Левый привод', 'Соединяет тягу с левой створкой', 2/7, [0]),
    node('Правый привод', 'Приводит правую створку в движение', 5/14, [0]), node('Магистраль', 'Передаёт импульс УМЕ обоим приводам', 3/14, [0])] },
  { name: 'Подъёмный зал', reward: 'Выпуск ×2 · две монтажные цели', nodes: [
    node('Нижняя опора', 'Несёт подъёмную платформу', .2), node('Платформа', 'Поднимает монтаж к верхнему затвору', .3, [0]),
    node('Силовая линия', 'Питает верхний привод', .2, [0]), node('Верхняя тяга', 'Соединяет платформу и створ', .3, [1])] },
  { name: 'Распределительный зал', reward: 'Выпуск ×2 · диспетчер прогноза', nodes: [
    node('Общая шина', 'Соединяет две стороны зала', .2), node('Левый участок', 'Подводит тягу к боковой створке', .3, [0]),
    node('Правый участок', 'Замыкает второй контур привода', .3, [0]), node('Замыкатель', 'Объединяет обе готовые ветви', .2, [1, 2])] },
  { name: 'Поворотный зал', reward: 'Выпуск ×2 · монтаж ×1,25', nodes: [
    node('Опорное кольцо', 'Удерживает поворотную платформу', .2), node('Поворотная платформа', 'Разворачивает механизм к выходу', .3, [0]),
    node('Боковой привод', 'Вращает платформу по направляющей', .3, [0]), node('Стопор', 'Фиксирует собранный механизм', .2, [1, 2])] },
  { name: 'Главный створ', reward: 'Выпуск ×2 · обзор системы сопряжения', nodes: [
    node('Основание', 'Держит две несущие рамы', .15), node('Левая рама', 'Несёт левую половину большого створа', .25, [0]),
    node('Правая рама', 'Несёт правую половину большого створа', .25, [0]), node('Общая направляющая', 'Соединяет обе рамы', .2, [1, 2]),
    node('Сопрягающий узел', 'Передаёт импульс главному створу', .15, [3])] },
];
export type Routing = 'even'|'left'|'right'|'auto'|'legacy';
export type CommissionKind='feed'|'drive';
export interface HorizonState {
  finalChecks:number; trial:{kind:CommissionKind;left:number;duration:number}|null;
  powerMode:'steady'|'charge'|'legacy'; charge:Decimal; regulator:boolean; powerShots:number;
  routing:Routing; dispatcher:boolean;
  recipe: HallRecipe | null;
  firstHall: LabState | null;
  legacyAutomation: boolean;
  open: boolean; points: Decimal; total: Decimal; opened: number;
  levels: Record<Machine, number>; work: Decimal[];
  mode: BuildMode; autoBuild: boolean; autoBuy: boolean; forecast: boolean; parallel: boolean;
  selected: number; pinned: boolean; reserveUme: boolean; clock: number;
  /** One manual order for the current gate; stops once the shared wallet has one UME. */
  umeOrder: boolean;
  nextPurchase: Machine | null; connections: { frame: boolean; conductor: boolean };
}
export const newHorizon = (): HorizonState => ({ finalChecks:0,trial:null,powerMode:'steady',charge:D(0),regulator:false,powerShots:0,routing:'even',dispatcher:false,recipe:null, firstHall:null, legacyAutomation:false, open: false, points: D(0), total: D(0), opened: 0,
  levels: { transport: 0, processing: 0, assembly: 0 }, work: HALLS[0].nodes.map(() => D(0)),
  mode: 'balance', autoBuild: true, autoBuy: false, forecast: false, parallel: true, selected: 0, pinned: false,
  reserveUme: true, umeOrder: false, clock: 0, nextPurchase: null, connections: { frame: false, conductor: false } });
export const canEnterHorizon = (b: BottomState) => b.open && b.dug >= 22000 && b.equipment.borer > 0 && b.umeMade.gte(1);
export function restartHorizon(profile:LabProfile):HorizonState {
  const h=newHorizon();h.open=true;h.points=D(28);h.autoBuild=false;h.autoBuy=false;
  h.firstHall=newLab(profile);h.firstHall.pulses=0;h.firstHall.km=h.points;return h;
}
export function enterHorizon(h: HorizonState, b: BottomState, profile:LabProfile={source:'save',supply:0,quality:0,logistics:0,mine:0}): boolean {
  if (h.open || !canEnterHorizon(b)) return false;
  h.open = true; h.points = h.points.add(28); h.firstHall=newLab(profile);
  h.firstHall.pulses=0;h.firstHall.km=h.points;h.autoBuild=false;h.autoBuy=false;return true;
}
export function buildFirstHall(h:HorizonState,id:LabModule):boolean {
  if(!h.open||h.opened!==0||!h.firstHall)return false;
  h.firstHall.km=h.points;const started=startProject(h.firstHall,id);h.points=h.firstHall.km;return started;
}
export function supplyFirstHall(h:HorizonState):boolean {
  return h.open&&h.opened===0&&!!h.firstHall&&requestShipment(h.firstHall);
}
export const hallCost = (h: HorizonState) => D(280).mul(Decimal.pow(8, h.opened));
export const nodeCost = (h: HorizonState, i: number) => hallCost(h).mul(HALLS[h.opened]?.nodes[i]?.share ?? 0).mul(h.opened===1&&h.recipe==='heavy'&&i===1?.8:h.opened===1&&h.recipe==='precise'&&i===2?.7:1);
export function chooseHallRecipe(h:HorizonState,recipe:'heavy'|'precise'):boolean {
  if(!h.open||h.opened!==1||h.recipe!==null||h.work.some(n=>n.gt(0)))return false;
  h.recipe=recipe;return true;
}
export const nodeDone = (h: HorizonState, i: number) => !!HALLS[h.opened]?.nodes[i] && h.work[i].gte(nodeCost(h, i).mul(1 - 1e-12));
export const nodeAvailable = (h: HorizonState, i: number) => !(h.opened===1&&h.recipe===null) && !!HALLS[h.opened]?.nodes[i] && !nodeDone(h, i) && HALLS[h.opened].nodes[i].needs.every(n => nodeDone(h, n));
export const assemblyReady = (h: HorizonState) => h.open && h.opened < 5 && !(h.opened===1&&h.recipe===null) && (h.opened===0&&h.firstHall?LAB_ORDER.every(id=>h.firstHall!.built[id]):HALLS[h.opened].nodes.every((_, i) => nodeDone(h, i)));
export const gateReady=(h:HorizonState)=>assemblyReady(h)&&(h.opened!==4||h.finalChecks===3);
export const umeReserved = (h: HorizonState) => h.open && h.opened < 5 && h.reserveUme ? 1 : 0;
export const canOrderUme = (h: HorizonState, b: BottomState) => h.open && h.opened < HALLS.length && b.open && b.umeMade.gte(1) && umeOpen(b) && b.ume.lt(1);
export function requestUme(h: HorizonState, b: BottomState): boolean {
  if (h.umeOrder || !canOrderUme(h,b)) return false;
  h.umeOrder = true;
  return true;
}
export function umeOrderShortfall(b: BottomState): Decimal {
  const goal=savingGoal(b);
  const reserved=goal?.costIn==='anomaly'?goal.cost:D(0);
  return D(meltCost(b,'anomaly')).add(reserved).sub(b.money.anomaly).max(0);
}
/** Melts anomalies only, never takes the selected purchase's reserve or repeats an order. */
export function settleUmeOrder(h: HorizonState, b: BottomState): void {
  if (!h.umeOrder) return;
  if (!canOrderUme(h,b)) { h.umeOrder=false; return; }
  if (umeOrderShortfall(b).gt(0)) return;
  if (melt(b,'anomaly',1)>0) h.umeOrder=false;
}
export function openGate(h: HorizonState, b: BottomState): boolean {
  if (!gateReady(h) || b.ume.lt(1)) return false;
  b.ume = b.ume.sub(1); h.opened++; h.umeOrder=false;
  if(h.opened===4){h.points=h.points.add(h.charge);h.charge=D(0);}
  if(h.opened===1&&h.firstHall){h.firstHall.commissioned=true;h.firstHall.launchedAt=h.firstHall.elapsed;h.firstHall.pulses=0;h.autoBuild=true;}
  b.supplyExtension = true;
  h.work = (HALLS[h.opened]?.nodes ?? []).map(() => D(0)); h.selected = 0; h.pinned = false;
  return true;
}
export function horizonRates(h: HorizonState, city: CityState) {
  if(h.opened===0&&h.firstHall){const r=labRates(h.firstHall);return {transport:r.rawPerMinute,processing:r.rawPerMinute.mul(r.yieldPerRaw),assembly:D(r.crew),production:r.production};}
  const multiplier = Decimal.pow(2, h.opened);
  const p=h.firstHall?.profile;
  const network=h.routing!=='legacy'&&h.opened>=2;
  const left=network&&(h.opened>2||nodeDone(h,1));
  const right=network&&(h.opened>2||nodeDone(h,2));
  const transport = D(4).mul(Decimal.pow(1.5, h.levels.transport)).mul(multiplier).mul(streetsOwned(city) >= 10 ? 1.1 : 1).mul(p?1+.8*p.supply:1).mul(h.recipe==='heavy'&&h.opened>=2?1.2:1);
  const processing = D(4).mul(Decimal.pow(1.5, h.levels.processing)).mul(multiplier).mul(h.connections.conductor ? 1.1 : 1).mul(p?1+.5*p.quality:1).mul(h.recipe==='precise'&&h.opened>=2?1.2:1);
  const craft=h.opened===1?(h.recipe==='heavy'?1+.6*(p?.mine??0):h.recipe==='precise'?1+.6*(p?.quality??0):1):1;
  const assembly = D(12).mul(Decimal.pow(1.5, h.levels.assembly)).mul(h.opened >= 4 ? 1.25 : 1).mul(h.connections.frame ? 1.1 : 1).mul(p?1+.35*p.mine:1).mul(craft).mul(right?1.2:1).mul(network?1+.3*(p?.logistics??0):1).mul(h.recipe==='heavy'&&h.opened>=2?1.1:1);
  return { transport, processing, assembly, production: transport.min(processing).mul(left?1.15:1).mul(h.recipe==='precise'&&h.opened>=2?1.08:1) };
}
export const machineCost = (h: HorizonState, id: Machine) => D(id === 'transport' ? 20 : id === 'processing' ? 30 : 25).mul(Decimal.pow(1.8, h.levels[id])).ceil();
/** The cheapest next investment that actually increases the bottleneck output. */
export function productionPlan(h: HorizonState, city: CityState): { machines: Machine[]; cost: Decimal; gain: Decimal } | null {
  const before = horizonRates(h, city).production;
  const choices: Machine[][] = [['transport'], ['processing'], ['transport', 'processing']];
  return choices.filter(machines=>machines.every(id=>Number.isSafeInteger(h.levels[id]+1))).map(machines => {
    const levels = { ...h.levels };
    for (const id of machines) levels[id]++;
    return { machines, cost: machines.reduce((sum, id) => sum.add(machineCost(h, id)), D(0)), gain: horizonRates({ ...h, levels }, city).production.sub(before) };
  }).filter(plan => plan.gain.gt(0)).sort((a,b) => a.cost.cmp(b.cost))[0] ?? null;
}
const canAfford = (balance: Decimal, cost: Decimal) => balance.gte(cost.mul(1 - 1e-12));
export function buyMachine(h: HorizonState, id: Machine): boolean {
  const cost = machineCost(h, id);
  if (!h.open || (h.opened===0&&!!h.firstHall) || !canAfford(h.points, cost) || !Number.isSafeInteger(h.levels[id] + 1)) return false;
  h.points = h.points.sub(cost).max(0); h.levels[id]++; if (h.nextPurchase === id) h.nextPurchase = null;
  return true;
}
export function connectHorizon(h: HorizonState, b: BottomState, id: 'frame' | 'conductor'): boolean {
  const currency = id === 'frame' ? 'scrap' : 'nonferrous'; const price = id === 'frame' ? 100 : 40;
  if (!h.open || h.connections[id] || b.money[currency].lt(price)) return false;
  b.money[currency] = b.money[currency].sub(price); h.connections[id] = true; return true;
}
export function buildTargets(h: HorizonState): number[] {
  if(h.opened===0&&h.firstHall)return [];
  if(h.opened===1&&h.recipe===null)return [];
  if (!h.autoBuild) return [];
  if (h.pinned && nodeAvailable(h, h.selected)) return [h.selected];
  const ids = (HALLS[h.opened]?.nodes ?? []).map((_, i) => i).filter(i => nodeAvailable(h, i));
  if (ids.includes(h.selected)) ids.sort((a, b) => Number(b === h.selected) - Number(a === h.selected) || a - b);
  return ids.slice(0, h.opened===2&&h.routing!=='legacy'?2:h.opened >= 2 && h.parallel ? 2 : 1);
}

export function setRouting(h:HorizonState,route:'even'|'left'|'right'|'auto'):boolean {
  if(!h.open||h.opened!==2||h.routing==='legacy'||route==='auto'&&!h.dispatcher)return false;
  h.routing=route;h.parallel=true;h.pinned=false;return true;
}
export function installDispatcher(h:HorizonState):boolean {
  if(!h.open||h.opened!==2||h.routing==='legacy'||h.dispatcher||!nodeDone(h,0)||h.points.lt(200))return false;
  h.points=h.points.sub(200);h.dispatcher=true;h.routing='auto';h.parallel=true;h.pinned=false;return true;
}
/** Shares always sum to one; a lone available job receives the entire budget. */
export function routingShares(h:HorizonState,city:CityState,targets=buildTargets(h)):number[] {
  if(targets.length!==2||h.opened!==2||h.routing==='legacy')return targets.map(()=>1/targets.length);
  let route=h.routing;
  if(route==='auto'){const r=horizonRates(h,city);route=r.assembly.lt(r.production.mul(h.mode==='balance'?.5:1))?'right':'left';}
  return targets.map(id=>route==='even'?.5:route==='left'?(id===1?.8:.2):(id===2?.8:.2));
}

export function powerCapacity(h:HorizonState,city:CityState):Decimal {return horizonRates(h,city).production.mul(2);}
export function chargeRate(h:HorizonState,city:CityState):Decimal {
  return h.open&&h.opened===3&&h.powerMode==='charge'&&h.charge.lt(powerCapacity(h,city))?horizonRates(h,city).production.mul(.25):D(0);
}
export function setPowerMode(h:HorizonState,mode:'steady'|'charge'):boolean {
  if(!h.open||h.opened!==3||h.powerMode==='legacy')return false;h.powerMode=mode;return true;
}
export function installRegulator(h:HorizonState):boolean {
  if(!h.open||h.opened!==3||h.powerMode==='legacy'||h.regulator||!nodeDone(h,0)||h.points.lt(400))return false;
  h.points=h.points.sub(400);h.regulator=true;return true;
}
export function launchPower(h:HorizonState):boolean {
  if(!h.open||h.opened!==3||h.powerMode==='legacy'||h.charge.lte(1e-8))return false;
  const ids=HALLS[3].nodes.map((_,i)=>i).filter(i=>nodeAvailable(h,i));
  const id=ids.includes(h.selected)?h.selected:ids[0];if(id===undefined)return false;
  const work=nodeCost(h,id).sub(h.work[id]).min(h.charge.mul(1.5));
  if(work.lte(1e-8))return false;
  h.work[id]=h.work[id].add(work);h.charge=h.charge.sub(work.div(1.5)).max(0);h.powerShots++;return true;
}

export const commissionCost=(h:HorizonState,city:CityState)=>horizonRates(h,city).production;
export function canCommission(h:HorizonState,kind:CommissionKind):boolean {
  if(!h.open||h.opened!==4||h.trial||(h.finalChecks&(kind==='feed'?1:2)))return false;
  return kind==='feed'?nodeDone(h,1)&&nodeDone(h,2):assemblyReady(h);
}
export function startCommission(h:HorizonState,city:CityState,kind:CommissionKind):boolean {
  const cost=commissionCost(h,city);if(!canCommission(h,kind)||h.points.lt(cost))return false;
  const p=h.firstHall?.profile;
  const strength=kind==='feed'?(p?.supply??0)+(p?.quality??0)+(p?.logistics??0):(p?.mine??0)+(h.dispatcher?.25:0)+(h.regulator?.25:0);
  const duration=60/(1+strength);h.points=h.points.sub(cost);h.trial={kind,left:duration,duration};return true;
}

function autoPower(h:HorizonState,city:CityState):boolean {
  if(h.opened!==3||!h.regulator||!h.autoBuild||h.mode==='growth'||h.charge.lte(1e-8))return false;
  const remaining=HALLS[3].nodes.reduce((sum,_,i)=>sum.add(nodeCost(h,i).sub(h.work[i]).max(0)),D(0));
  return (h.charge.gte(powerCapacity(h,city).mul(1-1e-12))||h.charge.mul(1.5).gte(remaining.mul(1-1e-12)))&&launchPower(h);
}

function flowAt(h: HorizonState, r: ReturnType<typeof horizonRates>): Decimal {
  if (!h.autoBuild || h.mode==='growth') return D(0);
  const income=h.opened===3&&h.powerMode==='charge'&&h.charge.lt(r.production.mul(2))?r.production.mul(.75):r.production;
  const cap=h.mode==='balance'?income.mul(.5).min(r.assembly):r.assembly;
  return h.mode==='assembly'&&h.points.lte(1e-10)?cap.min(income):cap;
}

/** Actual shared flow now, including a manual assignment or a single available node. */
export function assemblyFlow(h: HorizonState, city: CityState): Decimal {
  return h.open&&buildTargets(h).length?flowAt(h,horizonRates(h,city)):D(0);
}

/** Constant-power forecast; investments and manual gate opening are deliberately outside it. */
export function assemblyForecast(h: HorizonState, city: CityState) {
  const targets=buildTargets(h),r=horizonRates(h,city);
  if(!h.open||h.opened>=HALLS.length||h.opened===3&&h.powerMode==='charge'||h.opened===2&&h.routing!=='legacy'||h.mode==='growth'||!targets.length)return null;
  const cap=h.mode==='balance'?r.production.mul(.5).min(r.assembly):r.assembly;
  if(cap.lte(0)||r.production.lte(0))return null;
  const timeFor=(work:Decimal)=>{
    const capacity=work.div(cap);
    return (h.mode==='assembly'?capacity.max(work.sub(h.points).max(0).div(r.production)):capacity).mul(60);
  };
  const left=(id:number)=>nodeCost(h,id).sub(h.work[id]).max(0);
  const smallest=targets.reduce((min,id)=>min.min(left(id)),left(targets[0]));
  const remaining=HALLS[h.opened].nodes.reduce((sum,_,id)=>sum.add(left(id)),D(0));
  return {next:targets.filter(id=>left(id).eq(smallest)),nextSeconds:timeFor(smallest.mul(targets.length)),totalSeconds:timeFor(remaining)};
}
function autoPurchase(h: HorizonState, city: CityState): void {
  if (!h.autoBuy) return;
  if (h.nextPurchase) { buyMachine(h, h.nextPurchase); return; }
  const r = horizonRates(h, city); const ids: Machine[] = [];
  if (r.transport.lte(r.processing)) ids.push('transport');
  if (r.processing.lte(r.transport)) ids.push('processing');
  if (h.mode !== 'growth' && r.assembly.lt(r.production.mul(h.mode === 'balance' ? .5 : 1))) ids.push('assembly');
  ids.sort((a, b) => machineCost(h, a).cmp(machineCost(h, b)));
  const id = ids.find(id => canAfford(h.points, machineCost(h, id))); if (id) buyMachine(h, id);
}
/** Split at node completion and fixed purchase clocks, independent of render frequency. */
export function horizonTick(h: HorizonState, seconds: number, city: CityState, profile?:LabProfile): void {
  if (!h.open || !Number.isFinite(seconds) || seconds <= 0) return;
  if(h.firstHall&&profile)h.firstHall.profile={...profile};
  if(h.firstHall&&h.opened===0){
    h.clock%=1;
    const f=h.firstHall;f.km=h.points;
    let remaining=seconds;
    while(remaining>1e-8){
      const step=Math.min(remaining,1-h.clock);
      const before=f.km;tickLab(f,step);h.total=h.total.add(f.km.sub(before));remaining-=step;h.clock+=step;
      if(h.clock>=1-1e-8){h.clock=0;
        if(h.legacyAutomation&&h.autoBuild&&h.mode!=='growth'){
          if(!f.shipment&&f.raw.lte(labRates(f).capacity.mul(.5)))requestShipment(f);
          const id=(['winch','frame','press','relay'] as LabModule[]).find(id=>projectAvailable(f,id));
          if(id&&!f.job&&f.km.gte(labCost(f,id)))startProject(f,id);
        }
      }
    }
    h.points=f.km;return;
  }
  let remaining = seconds;
  while (remaining > 1e-8) {
    if(autoPower(h,city))continue;
    // A completed or obsolete manual assignment returns to the normal queue.
    if (h.pinned && !nodeAvailable(h, h.selected)) h.pinned = false;
    const r = horizonRates(h, city); const targets = h.mode === 'growth' ? [] : buildTargets(h);
    const charging=chargeRate(h,city),income=r.production.sub(charging);
    const flow = flowAt(h,r);const shares=routingShares(h,city,targets);
    let dt = Math.min(remaining, 60 - h.clock);
    if(h.trial)dt=Math.min(dt,h.trial.left);
    if(charging.gt(0))dt=Math.min(dt,powerCapacity(h,city).sub(h.charge).div(charging).mul(60).toNumber());
    if(h.opened===3&&h.regulator&&h.autoBuild&&h.mode!=='growth'){
      const rest=HALLS[3].nodes.reduce((sum,_,i)=>sum.add(nodeCost(h,i).sub(h.work[i]).max(0)),D(0));
      const need=rest.sub(h.charge.mul(1.5)),speed=flow.add(charging.mul(1.5));
      if(need.gt(1e-8)&&speed.gt(0))dt=Math.min(dt,need.div(speed).mul(60).toNumber());
    }
    if (targets.length && flow.gt(0)) {
      for (const [index,id] of targets.entries()) dt = Math.min(dt, nodeCost(h, id).sub(h.work[id]).div(flow.mul(shares[index])).mul(60).toNumber());
      if (flow.gt(income) && h.points.gt(1e-10)) dt = Math.min(dt, h.points.div(flow.sub(income)).mul(60).toNumber());
    }
    if (dt < 1e-9) {
      for (const id of targets) if (nodeCost(h, id).sub(h.work[id]).lt(1e-8)) h.work[id] = nodeCost(h, id);
      dt = Math.min(remaining, 1e-7);
    }
    const gained = income.mul(dt / 60);h.charge=h.charge.add(charging.mul(dt/60));let spent = D(0);
    for (const [index,id] of targets.entries()) {
      const work = flow.mul(dt / 60).mul(shares[index]).min(nodeCost(h, id).sub(h.work[id]));
      h.work[id] = h.work[id].add(work); spent = spent.add(work);
      if (nodeCost(h, id).sub(h.work[id]).lte(nodeCost(h, id).mul(1e-12))) h.work[id] = nodeCost(h, id);
    }
    h.points = h.points.add(gained).sub(spent).max(0); h.total = h.total.add(r.production.mul(dt/60));
    if (h.pinned && nodeDone(h, h.selected)) h.pinned = false;
    if(h.trial){h.trial.left=Math.max(0,h.trial.left-dt);if(h.trial.left<=1e-7){h.finalChecks|=h.trial.kind==='feed'?1:2;h.trial=null;}}
    h.clock += dt; remaining -= dt;
    if (h.clock >= 60 - 1e-8) { h.clock = 0; autoPurchase(h, city); }
  }
  while(autoPower(h,city)){ /* Settle a launch at the exact end of an offline interval. */ }
}
