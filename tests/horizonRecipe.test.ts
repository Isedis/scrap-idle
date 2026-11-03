import { describe,it,expect } from 'vitest';
import { D } from '../src/game/num';
import { newGame } from '../src/game/state';
import { serialize,deserialize } from '../src/game/save';
import { HALLS,chooseHallRecipe,nodeCost,buildTargets,horizonRates,horizonTick,openGate,gateReady,newHorizon } from '../src/game/horizon';
import { newLab } from '../src/game/horizonLab';

function second(){const s=newGame(0),h=s.horizon;s.bottom.open=true;s.bottom.ume=D(2);h.open=true;h.opened=1;h.firstHall=null;h.points=D(1000);h.work=HALLS[1].nodes.map(()=>D(0));return s;}

describe('second-hall production choice',()=>{
  it('requires one choice before automatic or manual construction and locks it after selection',()=>{
    const s=second(),h=s.horizon;expect(buildTargets(h)).toEqual([]);expect(gateReady(h)).toBe(false);
    horizonTick(h,60,s.city);expect(h.work.every(w=>w.eq(0))).toBe(true);expect(h.points.gt(1000)).toBe(true);
    expect(chooseHallRecipe(h,'heavy')).toBe(true);expect(buildTargets(h)).toEqual([0]);
    expect(chooseHallRecipe(h,'precise')).toBe(false);horizonTick(h,60,s.city);expect(h.work[0].gt(0)).toBe(true);
  });
  it('gives different immediate work and distinct permanent production bonuses',()=>{
    const a=second(),b=second();a.horizon.firstHall=b.horizon.firstHall=null;
    expect(chooseHallRecipe(a.horizon,'heavy')).toBe(true);expect(chooseHallRecipe(b.horizon,'precise')).toBe(true);
    expect(nodeCost(a.horizon,1).div(nodeCost(b.horizon,1)).toNumber()).toBeCloseTo(.8);
    expect(nodeCost(b.horizon,2).div(nodeCost(a.horizon,2)).toNumber()).toBeCloseTo(.7);
    for(const h of [a.horizon,b.horizon]){h.work=HALLS[1].nodes.map((_,i)=>nodeCost(h,i));expect(gateReady(h)).toBe(true);}
    expect(openGate(a.horizon,a.bottom)).toBe(true);expect(openGate(b.horizon,b.bottom)).toBe(true);
    const ra=horizonRates(a.horizon,a.city),rb=horizonRates(b.horizon,b.city);
    expect(ra.transport.gt(rb.transport)).toBe(true);expect(rb.processing.gt(ra.processing)).toBe(true);
    expect(ra.assembly.gt(rb.assembly)).toBe(true);expect(rb.production.gt(ra.production)).toBe(true);
    expect(a.horizon.recipe).toBe('heavy');expect(b.horizon.recipe).toBe('precise');
  });
  it('uses mine strength for heavy assembly and sorting quality for precise assembly',()=>{
    const a=second(),b=second();const profile={source:'save' as const,supply:0,quality:.1,logistics:0,mine:.9};
    for(const s of [a,b])s.horizon.firstHall=newLab(profile);
    chooseHallRecipe(a.horizon,'heavy');chooseHallRecipe(b.horizon,'precise');
    expect(horizonRates(a.horizon,a.city).assembly.gt(horizonRates(b.horizon,b.city).assembly)).toBe(true);
    a.horizon.firstHall!.profile={...profile,mine:.1,quality:.9};
    b.horizon.firstHall!.profile={...profile,mine:.1,quality:.9};
    expect(horizonRates(b.horizon,b.city).assembly.gt(horizonRates(a.horizon,a.city).assembly)).toBe(true);
  });
  it('keeps an already-paid v26 project at its exact cost and preserves old automation',()=>{
    const s=second(),h=s.horizon;h.work[0]=D(120);h.autoBuild=true;h.autoBuy=true;
    const old=JSON.parse(serialize(s));old.v=26;delete old.layers.horizon.recipe;
    const migrated=deserialize(JSON.stringify(old))!;
    expect(migrated.horizon.recipe).toBe('legacy');expect(migrated.horizon.work[0].eq(120)).toBe(true);
    expect(nodeCost(migrated.horizon,1).eq(nodeCost({...migrated.horizon,recipe:null},1))).toBe(true);
    expect(migrated.horizon.autoBuild).toBe(true);expect(migrated.horizon.autoBuy).toBe(true);
    expect(chooseHallRecipe(migrated.horizon,'heavy')).toBe(false);
    const again=deserialize(serialize(migrated))!;expect(again.horizon.recipe).toBe('legacy');expect(again.horizon.work[0].eq(120)).toBe(true);
  });
  it('offers a choice to an untouched v26 hall and retains completed halls',()=>{
    const s=second(),raw=JSON.parse(serialize(s));raw.v=26;delete raw.layers.horizon.recipe;
    expect(deserialize(JSON.stringify(raw))!.horizon.recipe).toBeNull();
    raw.layers.horizon.opened=3;raw.layers.horizon.work=HALLS[3].nodes.map(()=> '0');
    expect(deserialize(JSON.stringify(raw))!.horizon.recipe).toBe('legacy');
  });
  it('preserves a chosen recipe and identical progress across long and short ticks',()=>{
    const s=second();chooseHallRecipe(s.horizon,'precise');s.horizon.autoBuy=true;
    const b=deserialize(serialize(s))!;horizonTick(s.horizon,1800,s.city);for(let i=0;i<1800;i++)horizonTick(b.horizon,1,b.city);
    expect(b.horizon.recipe).toBe('precise');s.horizon.work.forEach((w,i)=>expect(w.toNumber()).toBeCloseTo(b.horizon.work[i].toNumber(),5));
    expect(s.horizon.points.toNumber()).toBeCloseTo(b.horizon.points.toNumber(),5);
  });
  it('never grants a choice to an already finished or closed horizon',()=>{
    expect(chooseHallRecipe(newHorizon(),'heavy')).toBe(false);const s=second();s.horizon.opened=2;expect(chooseHallRecipe(s.horizon,'precise')).toBe(false);
  });
});
