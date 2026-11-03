import { describe, it, expect } from 'vitest';
import { simulateBottom } from './bottom.sim.test';
import { newCity } from '../src/game/city';
import { D } from '../src/game/num';
import { autoOpen, bottomTick, buyBorer, borerCost, melt } from '../src/game/bottom';
import { newHorizon, enterHorizon, horizonTick, gateReady, openGate, buildFirstHall, supplyFirstHall } from '../src/game/horizon';
import { labRates, projectAvailable } from '../src/game/horizonLab';

describe.runIf(process.env.HORIZON_SIM)('horizon and mine pacing',()=>{
  it('builds all five gates while paying their UME and preserving the next opening reserve',()=>{
    for(const seed of [1,42,98765]){
      const b=simulateBottom(20,()=>{},seed,true);const h=newHorizon(),city=newCity();
      b.ume=D(0);b.money.anomaly=D(0);
      expect(enterHorizon(h,b)).toBe(true);h.autoBuy=true;
      let rng=seed;const rand=()=>((rng=rng*16807%2147483647)/2147483647);
      const milestones:number[]=[];let waiting=0;
      for(let minute=1;minute<=1440&&h.opened<5;minute++){
        b.route=b.ume.lt(1)?'seam':'depth';
        bottomTick(b,60,30,rand);autoOpen(b,rand);melt(b,'anomaly',1e6);
        // A player may keep upgrading the mine, while leaving the declared gate reserve.
        if(b.ume.gte(borerCost(b).add(1)))buyBorer(b);
        if(h.opened===0&&h.firstHall){
          const f=h.firstHall;
          if(f.raw.lte(labRates(f).capacity.mul(.5)))supplyFirstHall(h);
          const next=(['press','winch','frame','relay'] as const).find(id=>projectAvailable(f,id));
          if(next&&!f.job)buildFirstHall(h,next);
        }
        horizonTick(h,60,city);
        if(gateReady(h)){
          if(openGate(h,b))milestones.push(minute);else waiting++;
        }
      }
      console.log(`seed ${seed}: gates at minutes ${milestones.join(', ')}, UME wait ${waiting} min`);
      expect(h.opened).toBe(5);expect(milestones[0]).toBeGreaterThan(5);expect(milestones[0]).toBeLessThan(45);expect(milestones[4]).toBeLessThan(900);
    }
  });
});
