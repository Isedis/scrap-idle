import { describe, expect, it } from 'vitest';
import { D } from '../src/game/num';
import { newGame } from '../src/game/state';
import { HALLS, nodeCost, buildTargets, horizonTick, assemblyFlow, assemblyForecast, gateReady, nodeDone, openGate } from '../src/game/horizon';
import { serialize, deserialize } from '../src/game/save';

function hall(opened=3) {
  const s=newGame(0),h=s.horizon;
  h.open=true;h.opened=opened;h.work=HALLS[opened].nodes.map(()=>D(0));h.work[0]=nodeCost(h,0);
  return s;
}

describe('assembly allocation and dispatcher forecast',()=>{
  it('concentrates the same flow in one node or shares it between two',()=>{
    const a=hall(),b=hall();a.horizon.parallel=false;
    const flow=assemblyFlow(a.horizon,a.city);expect(flow.eq(assemblyFlow(b.horizon,b.city))).toBe(true);
    expect(buildTargets(a.horizon)).toEqual([1]);expect(buildTargets(b.horizon)).toEqual([1,2]);
    horizonTick(a.horizon,60,a.city);horizonTick(b.horizon,60,b.city);
    expect(a.horizon.work[1].eq(flow)).toBe(true);expect(a.horizon.work[2].eq(0)).toBe(true);
    expect(b.horizon.work[1].eq(flow.div(2))).toBe(true);expect(b.horizon.work[2].eq(flow.div(2))).toBe(true);
    expect(a.horizon.points.eq(b.horizon.points)).toBe(true);
  });
  for(const opened of [0,1]){
    it(`does not grant a second work slot before the second gate (opened=${opened})`,()=>{
      const s=hall(opened);expect(s.horizon.parallel).toBe(true);expect(buildTargets(s.horizon)).toHaveLength(1);
    });
  }
  for(const opened of [0,1,2,3,4])for(const mode of ['balance','assembly'] as const){
    it(`predicts the same total completion for focus and parallel, hall ${opened+1}/${mode}`,()=>{
      const predictions=[];
      for(const parallel of [false,true]){
        const s=hall(opened),h=s.horizon;h.parallel=parallel;h.mode=mode;h.points=D(7);
        h.levels.transport=h.levels.processing=6;h.levels.assembly=5;
        const before=serialize(s),prediction=assemblyForecast(h,s.city)!;
        expect(serialize(s)).toBe(before);predictions.push(prediction);
        const first=prediction.nextSeconds.toNumber();
        horizonTick(h,Math.max(0,first-.01),s.city);
        expect(prediction.next.some(id=>nodeDone(h,id))).toBe(false);
        horizonTick(h,.02,s.city);expect(prediction.next.every(id=>nodeDone(h,id))).toBe(true);
        horizonTick(h,Math.max(0,prediction.totalSeconds.toNumber()-first-.02),s.city);
        expect(gateReady(h)).toBe(false);
        horizonTick(h,.02,s.city);expect(gateReady(h)).toBe(true);
      }
      expect(predictions[0].totalSeconds.toNumber()).toBeCloseTo(predictions[1].totalSeconds.toNumber(),6);
      expect(predictions[0].nextSeconds.lte(predictions[1].nextSeconds)).toBe(true);
    });
  }
  it('handles supply exhaustion, rich stock and a paused queue without consuming work',()=>{
    const s=hall(0),h=s.horizon;h.work=HALLS[0].nodes.map(()=>D(0));h.mode='assembly';
    h.points=D(0);expect(assemblyForecast(h,s.city)!.totalSeconds.toNumber()).toBeCloseTo(4200);
    h.points=D(10000);expect(assemblyForecast(h,s.city)!.totalSeconds.toNumber()).toBeCloseTo(1400);
    h.mode='growth';expect(assemblyForecast(h,s.city)).toBeNull();expect(assemblyFlow(h,s.city).eq(0)).toBe(true);
    h.mode='balance';h.autoBuild=false;expect(assemblyForecast(h,s.city)).toBeNull();
    h.autoBuild=true;h.work=HALLS[0].nodes.map((_,i)=>nodeCost(h,i));expect(assemblyForecast(h,s.city)).toBeNull();
  });
  it('keeps manual assignment exclusive and returns to the selected allocation after completion',()=>{
    const s=hall(),h=s.horizon;h.selected=2;h.pinned=true;h.points=D(1e6);h.levels.assembly=10;h.mode='assembly';
    expect(buildTargets(h)).toEqual([2]);
    const first=assemblyForecast(h,s.city)!;
    horizonTick(h,first.nextSeconds.toNumber()+.01,s.city);
    expect(h.pinned).toBe(false);expect(nodeDone(h,2)).toBe(true);expect(buildTargets(h)).toEqual([1]);
    h.parallel=false;const a=assemblyForecast(h,s.city)!;h.forecast=true;
    expect(assemblyForecast(h,s.city)).toEqual(a);
    h.work=HALLS[h.opened].nodes.map((_,i)=>nodeCost(h,i));s.bottom.ume=D(1);
    expect(openGate(h,s.bottom)).toBe(true);expect(h.parallel).toBe(false);expect(h.forecast).toBe(true);
  });
  it('matches long and short ticks with auto investments in either allocation',()=>{
    for(const parallel of [false,true]){
      const a=hall(),b=hall();
      for(const s of [a,b]){s.horizon.parallel=parallel;s.horizon.autoBuy=true;s.horizon.points=D(2000);}
      horizonTick(a.horizon,1800,a.city);for(let i=0;i<1800;i++)horizonTick(b.horizon,1,b.city);
      expect(a.horizon.levels).toEqual(b.horizon.levels);
      expect(a.horizon.points.toNumber()).toBeCloseTo(b.horizon.points.toNumber(),6);
      a.horizon.work.forEach((w,i)=>expect(w.toNumber()).toBeCloseTo(b.horizon.work[i].toNumber(),6));
    }
  });
  it('migrates the legacy smart flag to a forecast, retains two-slot behaviour, and preserves all work and UME orders',()=>{
    const s=hall(),h=s.horizon;s.bottom.open=true;s.bottom.dug=22000;s.bottom.firstUmeGranted=true;s.bottom.umeMade=D(1);h.umeOrder=true;
    h.points=D(123);h.work[1]=D(456);const raw=JSON.parse(serialize(s));raw.v=24;raw.layers.horizon.smart=true;
    delete raw.layers.horizon.forecast;delete raw.layers.horizon.parallel;
    const old=deserialize(JSON.stringify(raw))!;
    expect(old.horizon.parallel).toBe(true);expect(old.horizon.forecast).toBe(true);expect(old.horizon.umeOrder).toBe(true);
    expect(old.horizon.points.eq(123)).toBe(true);expect(old.horizon.work[1].eq(456)).toBe(true);
    old.horizon.parallel=false;
    const back=deserialize(serialize(old))!;expect(back.horizon.parallel).toBe(false);expect(back.horizon.forecast).toBe(true);
    expect(JSON.parse(serialize(back)).v).toBe(26);expect('smart' in JSON.parse(serialize(back)).layers.horizon).toBe(false);
  });
});
