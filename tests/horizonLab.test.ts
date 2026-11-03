import { describe,it,expect } from 'vitest';
import { D } from '../src/game/num';
import { newGame } from '../src/game/state';
import { serialize } from '../src/game/save';
import { DISTRICTS } from '../src/game/city';
import { LAB_MODULES,LAB_ORDER,EXAMPLE_PROFILE,newLab,profileOf,labRates,startProject,requestShipment,commissionLab,tickLab,serializeLab,deserializeLab,labStage,type LabModule,type LabProfile } from '../src/game/horizonLab';

const finish=(s:ReturnType<typeof newLab>)=>tickLab(s,s.job!.left+1e-6);
function play(order:LabModule[],profile:LabProfile=EXAMPLE_PROFILE){
  const s=newLab(profile,0);let automatic=0,deliveries=0;
  while(s.elapsed<3600&&!s.commissioned){
    const r=labRates(s);
    if(!s.autoDelivery&&!s.shipment&&s.raw.lte(r.capacity.mul(.5))){if(requestShipment(s))deliveries++;}
    const next=order.find(id=>!s.built[id]);if(next&&!s.job)startProject(s,next);
    tickLab(s,1);if(s.autoDelivery&&!automatic)automatic=s.elapsed;commissionLab(s);
  }
  return {s,automatic,deliveries};
}
describe('first-hall design experiment',()=>{
  it('offers a real early fork and produces during installation',()=>{
    const a=newLab(),b=newLab();expect(startProject(a,'frame')).toBe(false);
    expect(startProject(a,'winch')).toBe(true);expect(startProject(b,'press')).toBe(true);
    expect(startProject(a,'press')).toBe(false);expect(a.km.eq(4)).toBe(true);
    tickLab(a,10);expect(a.km.gt(4)).toBe(true);expect(a.built.winch).toBe(false);
    finish(a);finish(b);
    a.raw=b.raw=D(20);
    expect(labRates(a).rawPerMinute.gt(labRates(b).rawPerMinute)).toBe(true);
    expect(labRates(b).yieldPerRaw.gt(labRates(a).yieldPerRaw)).toBe(true);
    expect(a.autoDelivery).toBe(false);expect(b.autoQueue).toBe(false);
  });
  it('earns delivery automation from the frame and queue automation from commissioning',()=>{
    const early=newLab();early.autoDelivery=early.autoQueue=true;tickLab(early,20);
    expect(early.job).toBeNull();expect(early.shipment).toBeNull();
    const s=newLab();s.km=D(1000);
    startProject(s,'winch');finish(s);startProject(s,'frame');finish(s);
    expect(s.autoDelivery).toBe(true);expect(s.shipment).not.toBeNull();expect(commissionLab(s)).toBe(false);
    startProject(s,'press');finish(s);startProject(s,'relay');finish(s);
    expect(s.autoQueue).toBe(false);expect(commissionLab(s)).toBe(true);expect(commissionLab(s)).toBe(false);
    expect(s.pulses).toBe(0);s.autoQueue=true;tickLab(s,300);
    expect(s.gallery).toBeGreaterThan(0);
  });
  it('does not consume nonexistent raw stock or stop all progress when supply is absent',()=>{
    const s=newLab();s.raw=D(0);const before=s.km;
    tickLab(s,120);expect(s.km.eq(before.add(2))).toBe(true);expect(s.raw.eq(0)).toBe(true);
    expect(requestShipment(s)).toBe(true);expect(requestShipment(s)).toBe(false);
    tickLab(s,60);expect(s.delivered.gt(0)).toBe(true);expect(s.raw.lte(labRates(s).capacity)).toBe(true);
  });
  it('matches long and short ticks through deliveries, queue affordability and completions',()=>{
    const a=labStage('commissioned'),b=labStage('commissioned');
    for(const s of [a,b]){s.km=D(100);s.raw=D(15);s.autoQueue=true;s.autoDelivery=true;}
    tickLab(a,1800);for(let i=0;i<3600;i++)tickLab(b,.5);
    expect(a.gallery).toBe(b.gallery);expect(a.km.toNumber()).toBeCloseTo(b.km.toNumber(),5);
    expect(a.raw.toNumber()).toBeCloseTo(b.raw.toNumber(),5);
    expect(a.processed.toNumber()).toBeCloseTo(b.processed.toNumber(),5);
    expect(a.job?.id??null).toBe(b.job?.id??null);expect(a.job?.left??0).toBeCloseTo(b.job?.left??0,5);
    expect(a.shipment?.left??0).toBeCloseTo(b.shipment?.left??0,5);
  });
  it('preserves an unfinished paid order and shipment through export/import',()=>{
    const s=newLab();startProject(s,'press');requestShipment(s);tickLab(s,5);
    const back=deserializeLab(serializeLab(s))!;expect(back.job).toEqual(s.job);expect(back.shipment).toEqual(s.shipment);
    expect(back.km.eq(s.km)).toBe(true);tickLab(s,180);tickLab(back,180);
    expect(serializeLab(back)).toBe(serializeLab(s));
    expect(deserializeLab('{"v":99}')).toBeNull();
    const broken=JSON.parse(serializeLab(s));broken.km='Infinity';expect(deserializeLab(JSON.stringify(broken))).toBeNull();
  });
  it('reads distinct old-layer contributions without changing the live state',()=>{
    const s=newGame();const before=serialize(s),low=profileOf(s);expect(serialize(s)).toBe(before);
    s.owned.collector=1000000;s.sorting.total=D('1e20');s.bottom.opened=100000;s.bottom.equipment.borer=6;
    s.city.owned=['dump',...DISTRICTS.filter(d=>d.id!=='dump'&&d.id!=='pit').slice(0,2).map(d=>d.id)];const high=profileOf(s);
    expect(high.supply).toBeGreaterThan(low.supply);expect(high.quality).toBeGreaterThan(low.quality);
    expect(high.logistics).toBeGreaterThan(low.logistics);expect(high.mine).toBeGreaterThan(low.mine);
  });
  it('measures both paths and stronger supply; each module is functional before the final pulse',()=>{
    const heavy=play(['winch','frame','press','relay']),production=play(['press','winch','frame','relay']);
    const weak=play(['press','winch','frame','relay'],{source:'example',supply:0,quality:0,logistics:0,mine:0});
    const strong=play(['press','winch','frame','relay'],{source:'example',supply:1,quality:1,logistics:1,mine:1});
    for(const p of [heavy,production,weak,strong])expect(p.s.commissioned).toBe(true);
    expect(heavy.automatic).toBeLessThan(production.automatic);
    expect(production.s.elapsed).toBeLessThan(heavy.s.elapsed);expect(strong.s.elapsed).toBeLessThan(weak.s.elapsed);
    if(process.env.LAB_PACE)console.log(JSON.stringify({heavy:{auto:heavy.automatic,launch:heavy.s.elapsed,deliveries:heavy.deliveries},production:{auto:production.automatic,launch:production.s.elapsed,deliveries:production.deliveries},weak:weak.s.elapsed,strong:strong.s.elapsed}));
    expect(LAB_ORDER.every(id=>LAB_MODULES[id].cost>0)).toBe(true);
  });
});
