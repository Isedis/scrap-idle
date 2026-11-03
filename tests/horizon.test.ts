import { describe, it, expect } from 'vitest';
import { D } from '../src/game/num';
import { newGame, advance, reform } from '../src/game/state';
import { serialize, deserialize } from '../src/game/save';
import { melt, pressure, supplyRate } from '../src/game/bottom';
import { HALLS, newHorizon, enterHorizon as enterLiveHorizon, canEnterHorizon, openGate, nodeCost, horizonRates, horizonTick, buyMachine, gateReady, buildTargets, nodeDone, productionPlan } from '../src/game/horizon';

// Preserve regression coverage of the original assembly equations used by later halls.
const enterHorizon:typeof enterLiveHorizon=(h,b)=>{const ok=enterLiveHorizon(h,b);if(ok){h.firstHall=null;h.points=D(20);h.autoBuild=true;h.recipe='legacy';h.routing='legacy';h.finalChecks=3;}return ok;};
const readyState=()=>{const s=newGame(0);s.bottom.open=true;s.bottom.dug=22000;s.bottom.equipment.borer=1;s.bottom.umeMade=D(1);s.bottom.ume=D(5);return s;};
describe('legacy assembly equations and later horizon halls',()=>{
  it('prices both production links when one purchase alone cannot increase output',()=>{
    const s=readyState(),h=s.horizon;enterHorizon(h,s.bottom);
    const before=serialize(s),plan=productionPlan(h,s.city)!;
    expect(plan.machines).toEqual(['transport','processing']);
    expect(plan.cost.eq(50)).toBe(true);expect(plan.gain.eq(2)).toBe(true);
    expect(serialize(s)).toBe(before);
    h.points=plan.cost;const output=horizonRates(h,s.city).production;
    for(const machine of plan.machines)expect(buyMachine(h,machine)).toBe(true);
    expect(h.points.eq(0)).toBe(true);expect(horizonRates(h,s.city).production.sub(output).eq(plan.gain)).toBe(true);
    h.levels.transport++;
    const next=productionPlan(h,s.city)!;expect(next.machines).toEqual(['processing']);
    h.points=next.cost;const old=horizonRates(h,s.city).production;
    expect(buyMachine(h,'processing')).toBe(true);expect(horizonRates(h,s.city).production.sub(old).eq(next.gain)).toBe(true);
  });
  it('accounts for external link bonuses and numerical level limits in investment advice',()=>{
    const s=readyState(),h=s.horizon;h.connections.conductor=true;
    const plan=productionPlan(h,s.city)!;
    expect(plan.machines).toEqual(['transport']);expect(plan.gain.toNumber()).toBeCloseTo(.4);
    h.levels.transport=h.levels.processing=Number.MAX_SAFE_INTEGER;
    expect(productionPlan(h,s.city)).toBeNull();
  });
  it('returns from manual work to the queue inside a long tick',()=>{
    const s=readyState(),h=s.horizon;enterHorizon(h,s.bottom);
    h.pinned=true;h.selected=0;h.mode='assembly';
    horizonTick(h,600,s.city);
    expect(h.pinned).toBe(false);expect(nodeDone(h,0)).toBe(true);
    expect(h.work[1].gt(0)).toBe(true);expect(buildTargets(h)).toContain(1);
  });
  it('recovers a legacy pin on an unavailable or completed node without overriding a disabled queue',()=>{
    const s=readyState(),h=s.horizon;enterHorizon(h,s.bottom);
    h.pinned=true;h.selected=3;
    expect(buildTargets(h)).toEqual([0]);
    horizonTick(h,1,s.city);expect(h.pinned).toBe(false);
    h.work[0]=nodeCost(h,0);h.pinned=true;h.selected=0;
    expect(buildTargets(h)).toEqual([1]);
    h.autoBuild=false;const before=h.work.map(w=>w.toString());
    horizonTick(h,600,s.city);expect(buildTargets(h)).toEqual([]);
    expect(h.work.map(w=>w.toString())).toEqual(before);
  });
  it('requires earned UME and gives the starting installation only once without resetting the mine',()=>{
    const s=readyState();s.bottom.umeMade=D(0);expect(canEnterHorizon(s.bottom)).toBe(false);
    s.bottom.money.anomaly=D(150);expect(melt(s.bottom,'anomaly')).toBe(1);
    expect(enterLiveHorizon(s.horizon,s.bottom)).toBe(true);expect(enterLiveHorizon(s.horizon,s.bottom)).toBe(false);
    expect(s.horizon.points.eq(28)).toBe(true);expect(s.bottom.dug).toBe(22000);expect(s.bottom.umeMade.eq(1)).toBe(true);
  });
  it('uses a bottleneck and keeps half of production available for investment',()=>{
    const s=readyState();enterHorizon(s.horizon,s.bottom);buyMachine(s.horizon,'transport');
    expect(horizonRates(s.horizon,s.city).production.eq(4)).toBe(true);
    horizonTick(s.horizon,60,s.city);
    expect(s.horizon.points.eq(2)).toBe(true);expect(s.horizon.work[0].eq(2)).toBe(true);
  });
  it('can assemble with zero old resources and opens a finished gate once for one UME',()=>{
    const s=readyState();enterHorizon(s.horizon,s.bottom);s.horizon.mode='assembly';
    horizonTick(s.horizon,4200,s.city);
    expect(gateReady(s.horizon)).toBe(true);const old=s.bottom.ume;const before=pressure(s.bottom,12);
    expect(openGate(s.horizon,s.bottom)).toBe(true);expect(s.bottom.ume.eq(old.sub(1))).toBe(true);
    expect(openGate(s.horizon,s.bottom)).toBe(false);expect(horizonRates(s.horizon,s.city).production.eq(8)).toBe(true);
    s.bottom.equipment.hoist=true;expect(supplyRate(s.bottom)).toBe(9);
    expect(pressure(s.bottom,12)).toBe(before);
  });
  it('shares the assembly budget between parallel targets',()=>{
    const s=readyState();const h=s.horizon;h.open=true;h.opened=2;h.routing='legacy';h.finalChecks=3;h.work=HALLS[2].nodes.map(()=>D(0));h.work[0]=nodeCost(h,0);
    horizonTick(h,60,s.city);
    expect(h.work[1].add(h.work[2]).eq(8)).toBe(true);expect(h.work[1].eq(4)).toBe(true);
  });
  it('splits offline time at completions and purchase clocks like short ticks',()=>{
    const s=readyState();const a=newHorizon(),b=newHorizon();for(const h of [a,b]){h.open=true;h.points=D(20);h.autoBuy=true;}
    horizonTick(a,7200,s.city);for(let i=0;i<7200;i++)horizonTick(b,1,s.city);
    expect(a.levels).toEqual(b.levels);expect(a.points.toNumber()).toBeCloseTo(b.points.toNumber(),5);
    a.work.forEach((w,i)=>expect(w.toNumber()).toBeCloseTo(b.work[i].toNumber(),5));
  });
  it('does not open gates offline and preserves partial work through loading and reform',()=>{
    const s=readyState();enterHorizon(s.horizon,s.bottom);s.horizon.mode='assembly';horizonTick(s.horizon,120,s.city);
    const back=deserialize(serialize(s))!;expect(back.horizon.work[0].eq(s.horizon.work[0])).toBe(true);
    horizonTick(back.horizon,7200,back.city);expect(back.horizon.opened).toBe(0);expect(back.bottom.ume.eq(5)).toBe(true);
    back.city.open=true;back.sorting.sorts=7;reform(back);expect(back.horizon.open).toBe(true);
  });
  it('finishes all five distinct dependency graphs, without a paid sixth placeholder',()=>{
    const s=readyState();enterHorizon(s.horizon,s.bottom);
    for(let n=0;n<5;n++){
      const h=s.horizon;h.mode='assembly';h.points=D('1e10');h.levels.assembly=30;
      horizonTick(h,600,s.city);expect(gateReady(h)).toBe(true);expect(openGate(h,s.bottom)).toBe(true);
    }
    expect(s.horizon.opened).toBe(5);expect(s.bottom.ume.eq(0)).toBe(true);expect(openGate(s.horizon,s.bottom)).toBe(false);
  });
  it('migrates old saves conservatively and does not give free KM before entry',()=>{
    const s=readyState();const raw=JSON.parse(serialize(s));raw.v=21;delete raw.layers.horizon;delete raw.layers.bottom.umeMade;
    raw.layers.bottom.ume='0';raw.layers.bottom.equipment.borer=1;
    const back=deserialize(JSON.stringify(raw))!;expect(back.horizon.open).toBe(false);expect(back.horizon.points.eq(0)).toBe(true);
    expect(canEnterHorizon(back.bottom)).toBe(false);
    raw.layers.bottom.equipment.borer=2;expect(canEnterHorizon(deserialize(JSON.stringify(raw))!.bottom)).toBe(true);
  });
  it('advances the horizon from the shared simulation',()=>{
    const s=readyState();enterHorizon(s.horizon,s.bottom);advance(s,60);expect(s.horizon.total.gt(0)).toBe(true);
  });
});
