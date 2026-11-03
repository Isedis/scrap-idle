import { describe,it,expect } from 'vitest';
import { D } from '../src/game/num';
import { newGame,advance } from '../src/game/state';
import { serialize,deserialize } from '../src/game/save';
import { enterHorizon,restartHorizon,buildFirstHall,supplyFirstHall,horizonTick,gateReady,openGate,HALLS,horizonRates,startCommission,chooseHallRecipe } from '../src/game/horizon';
import { LAB_ORDER,profileOf } from '../src/game/horizonLab';

function ready(){const s=newGame(0);s.bottom.open=true;s.bottom.dug=22000;s.bottom.equipment.borer=1;s.bottom.umeMade=D(1);s.bottom.ume=D(5);enterHorizon(s.horizon,s.bottom);return s;}
function finish(s:ReturnType<typeof ready>){horizonTick(s.horizon,s.horizon.firstHall!.job!.left+.001,s.city);}
function oldSave(opened=0){const s=ready(),h=s.horizon;h.opened=opened;h.points=D(123);h.total=D(456);h.work=HALLS[opened].nodes.map(()=>D(0));h.work[0]=D(12);h.levels={transport:3,processing:4,assembly:2};h.autoBuild=true;h.autoBuy=true;h.clock=37;
  const raw=JSON.parse(serialize(s));raw.v=25;delete raw.layers.horizon.firstHall;delete raw.layers.horizon.legacyAutomation;return raw;}

describe('live receiving gallery and v26 migration',()=>{
  it('enters with the real wallet, no free UME and no initial automation',()=>{
    const s=ready(),h=s.horizon;expect(h.points.eq(28)).toBe(true);expect(h.firstHall!.pulses).toBe(0);
    expect(h.autoBuild).toBe(false);expect(h.autoBuy).toBe(false);expect(h.firstHall!.autoDelivery).toBe(false);
    expect(s.bottom.ume.eq(5)).toBe(true);expect(enterHorizon(h,s.bottom)).toBe(false);expect(h.points.eq(28)).toBe(true);
    expect(openGate(h,s.bottom)).toBe(false);
  });
  it('pays for a real project once and advances its work through the shared game simulation',()=>{
    const s=ready(),h=s.horizon;expect(buildFirstHall(h,'frame')).toBe(false);
    expect(buildFirstHall(h,'press')).toBe(true);expect(h.points.eq(4)).toBe(true);
    expect(buildFirstHall(h,'press')).toBe(false);expect(buildFirstHall(h,'winch')).toBe(false);
    advance(s,5);expect(h.firstHall!.job!.left).toBeLessThan(70);expect(h.points.gt(4)).toBe(true);expect(h.total.gt(0)).toBe(true);
    expect(h.firstHall!.profile).toEqual(profileOf(s));expect(h.firstHall!.pulses).toBe(0);
  });
  it('retains paid construction and a single shipment in the main save',()=>{
    const s=ready();buildFirstHall(s.horizon,'winch');supplyFirstHall(s.horizon);horizonTick(s.horizon,10,s.city);
    const back=deserialize(serialize(s))!;expect(back.horizon.points.eq(s.horizon.points)).toBe(true);
    expect(back.horizon.firstHall!.job).toEqual(s.horizon.firstHall!.job);expect(back.horizon.firstHall!.shipment).toEqual(s.horizon.firstHall!.shipment);
    expect(supplyFirstHall(back.horizon)).toBe(false);finish(back);expect(back.horizon.firstHall!.built.winch).toBe(true);
  });
  it('earns supply automation, requires real UME and continues into the existing second hall',()=>{
    const s=ready(),h=s.horizon;h.points=D(1000);
    for(const id of ['winch','frame','press','relay'] as const){expect(buildFirstHall(h,id)).toBe(true);finish(s);}
    expect(h.firstHall!.autoDelivery).toBe(true);expect(gateReady(h)).toBe(true);expect(h.autoBuild).toBe(false);
    s.bottom.ume=D(0);expect(openGate(h,s.bottom)).toBe(false);expect(h.opened).toBe(0);
    s.bottom.ume=D(1);expect(openGate(h,s.bottom)).toBe(true);expect(s.bottom.ume.eq(0)).toBe(true);
    expect(h.firstHall!.commissioned).toBe(true);expect(h.opened).toBe(1);expect(h.autoBuild).toBe(true);expect(h.autoBuy).toBe(false);
    expect(chooseHallRecipe(h,'heavy')).toBe(true);const before=h.work.map(n=>n.toString());horizonTick(h,60,s.city);expect(h.work.map(n=>n.toString())).not.toEqual(before);
    expect(buildFirstHall(h,'press')).toBe(false);expect(supplyFirstHall(h)).toBe(false);
  });
  it('keeps the real UME cost and no sixth gate when completing the remaining halls',()=>{
    const s=ready(),h=s.horizon;h.points=D(10000);for(const id of LAB_ORDER){buildFirstHall(h,id);finish(s);}expect(openGate(h,s.bottom)).toBe(true);
    while(h.opened<5){if(h.opened===1)chooseHallRecipe(h,'precise');h.points=D('1e12');h.levels.assembly=30;h.mode='assembly';horizonTick(h,600,s.city);if(h.opened===4){for(const kind of ['feed','drive'] as const){expect(startCommission(h,s.city,kind)).toBe(true);horizonTick(h,60,s.city);}}expect(gateReady(h)).toBe(true);expect(openGate(h,s.bottom)).toBe(true);}
    expect(s.bottom.ume.eq(0)).toBe(true);expect(openGate(h,s.bottom)).toBe(false);
  });
  it('matches one long offline interval and short ticks with shipments and a paid build',()=>{
    const a=ready();a.horizon.points=D(1000);for(const id of ['winch','frame'] as const){buildFirstHall(a.horizon,id);finish(a);}buildFirstHall(a.horizon,'press');
    const b=deserialize(serialize(a))!;horizonTick(a.horizon,7200,a.city);for(let i=0;i<14400;i++)horizonTick(b.horizon,.5,b.city);
    expect(a.horizon.points.toNumber()).toBeCloseTo(b.horizon.points.toNumber(),5);expect(a.horizon.total.toNumber()).toBeCloseTo(b.horizon.total.toNumber(),5);
    expect(a.horizon.firstHall!.raw.toNumber()).toBeCloseTo(b.horizon.firstHall!.raw.toNumber(),5);expect(a.horizon.opened).toBe(0);expect(a.bottom.ume.eq(5)).toBe(true);
  });
  it('credits every unfinished old KM, keeps upgrades and preserves previously available automation',()=>{
    const raw=oldSave(),back=deserialize(JSON.stringify(raw))!,h=back.horizon;
    expect(h.points.eq(135)).toBe(true);expect(h.total.eq(456)).toBe(true);expect(h.levels).toEqual(raw.layers.horizon.levels);
    expect(h.legacyAutomation).toBe(true);expect(h.autoBuild).toBe(true);expect(h.autoBuy).toBe(true);expect(h.firstHall).not.toBeNull();
    expect(back.bottom.ume.eq(5)).toBe(true);horizonTick(h,1800,back.city);expect(gateReady(h)).toBe(true);expect(h.opened).toBe(0);
    const again=deserialize(serialize(back))!;expect(again.horizon.points.eq(h.points)).toBe(true);expect(again.horizon.firstHall!.built).toEqual(h.firstHall!.built);
  });
  it('keeps completed old halls, partial later work and spent UME without replaying the first hall',()=>{
    const raw=oldSave(3),back=deserialize(JSON.stringify(raw))!,h=back.horizon;
    expect(h.opened).toBe(3);expect(h.points.eq(123)).toBe(true);expect(h.work[0].eq(12)).toBe(true);
    expect(LAB_ORDER.every(id=>h.firstHall!.built[id])).toBe(true);expect(h.firstHall!.commissioned).toBe(true);expect(h.firstHall!.pulses).toBe(0);
    expect(back.bottom.ume.eq(5)).toBe(true);expect(back.bottom.supplyExtension).toBe(true);
  });
  it('does not migrate a closed horizon into a free open layer, and rejects damaged first-hall data',()=>{
    const s=newGame(0),raw=JSON.parse(serialize(s));raw.v=25;expect(deserialize(JSON.stringify(raw))!.horizon.open).toBe(false);
    const broken=JSON.parse(serialize(ready()));broken.layers.horizon.firstHall='{"v":99}';expect(deserialize(JSON.stringify(broken))).toBeNull();
  });
  it('restarts only the requested horizon and permits restoring its snapshot without rewinding upper layers',()=>{
    const s=ready(),before=serialize(s),snapshot=deserialize(before)!.horizon;
    s.horizon=restartHorizon(profileOf(s));const fresh=JSON.parse(serialize(s)),old=JSON.parse(before);
    delete fresh.layers.horizon;delete old.layers.horizon;expect(fresh).toEqual(old);
    expect(s.horizon.points.eq(28)).toBe(true);expect(s.horizon.legacyAutomation).toBe(false);
    s.trash=s.trash.add(999);s.horizon=snapshot;expect(s.trash.eq(D(old.trash).add(999))).toBe(true);expect(s.bottom.ume.eq(5)).toBe(true);
  });
  it('uses current previous-layer strengths after first commissioning, not the old copied profile',()=>{
    const s=ready(),h=s.horizon;h.opened=1;h.work=HALLS[1].nodes.map(()=>D(0));
    const low=horizonRates(h,s.city);s.owned.collector=1e20;s.sorting.total=D('1e20');s.bottom.equipment.borer=6;
    horizonTick(h,1,s.city,profileOf(s));const high=horizonRates(h,s.city);
    expect(high.transport.gt(low.transport)).toBe(true);expect(high.processing.gt(low.processing)).toBe(true);expect(high.assembly.gt(low.assembly)).toBe(true);
  });
});
