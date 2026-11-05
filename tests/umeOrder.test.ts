import { afterEach, describe, expect, it, vi } from 'vitest';
import { newGame, advance, reform } from '../src/game/state';
import { D } from '../src/game/num';
import * as bottom from '../src/game/bottom';
import { canOrderUme, requestUme, settleUmeOrder, umeOrderShortfall, openGate, HALLS, nodeCost } from '../src/game/horizon';
import { deserialize, serialize, applyOffline } from '../src/game/save';
import { awayReport, awaySnapshot } from '../src/game/away';

const ready=()=>{
  const s=newGame(0);s.bottom.open=true;s.bottom.dug=22000;s.bottom.firstUmeGranted=true;
  s.bottom.equipment.borer=1;s.bottom.umeMade=D(1);s.horizon.open=true;return s;
};
afterEach(()=>vi.restoreAllMocks());

describe('one UME for a gate',()=>{
  it('stays hidden before a manual melt and before the horizon, and refuses a second order',()=>{
    const s=ready(),h=s.horizon,b=s.bottom;
    b.umeMade=D(0);expect(canOrderUme(h,b)).toBe(false);expect(requestUme(h,b)).toBe(false);
    b.money.anomaly=D(150);expect(bottom.melt(b,'anomaly')).toBe(1);
    expect(canOrderUme(h,b)).toBe(false);b.ume=D(0);h.open=false;
    expect(requestUme(h,b)).toBe(false);h.open=true;
    expect(requestUme(h,b)).toBe(true);expect(requestUme(h,b)).toBe(false);
  });
  it('converts exactly one unit at the real price and never restarts after manual spending',()=>{
    const s=ready(),h=s.horizon,b=s.bottom;
    b.money.anomaly=D(1000);b.money.relic=D(17);b.money.scrap=D(123);b.saving='tool:lamp';b.route='depth';
    requestUme(h,b);settleUmeOrder(h,b);
    expect(b.ume.eq(1)).toBe(true);expect(b.money.anomaly.eq(850)).toBe(true);expect(b.umeMade.eq(2)).toBe(true);
    expect(h.umeOrder).toBe(false);expect(b.route).toBe('depth');expect(b.saving).toBe('tool:lamp');
    expect(b.money.relic.eq(17)).toBe(true);expect(b.money.scrap.eq(123)).toBe(true);
    b.ume=D(0);settleUmeOrder(h,b);expect(b.ume.eq(0)).toBe(true);expect(b.money.anomaly.eq(850)).toBe(true);
  });
  it('respects an anomaly-priced purchase reserve rather than consuming its balance',()=>{
    const s=ready(),h=s.horizon,b=s.bottom;
    vi.spyOn(bottom,'savingGoal').mockReturnValue({id:'reserved',name:'Reserved purchase',cost:D(40),costIn:'anomaly',unlocked:true});
    b.money.anomaly=D(189);requestUme(h,b);settleUmeOrder(h,b);
    expect(h.umeOrder).toBe(true);expect(b.ume.eq(0)).toBe(true);expect(umeOrderShortfall(b).eq(1)).toBe(true);
    b.money.anomaly=D(190);settleUmeOrder(h,b);expect(b.money.anomaly.eq(40)).toBe(true);expect(b.ume.eq(1)).toBe(true);
  });
  it('uses the melting bonus and does not consume a large surplus',()=>{
    const s=ready(),b=s.bottom;
    for(const item of bottom.epochItems('inhuman'))b.found[item.id]=1;
    const cost=bottom.meltCost(b,'anomaly');expect(cost).toBeLessThan(150);
    b.money.anomaly=D(1000);requestUme(s.horizon,b);settleUmeOrder(s.horizon,b);
    expect(b.money.anomaly.eq(1000-cost)).toBe(true);expect(b.ume.eq(1)).toBe(true);
  });
  it('completes after seam production online and offline, leaving the chosen route intact',()=>{
    for(const offline of [false,true]){
      const s=ready(),b=s.bottom;s.owned={};b.route='seam';b.money.anomaly=D(149);
      requestUme(s.horizon,b);expect(s.horizon.umeOrder).toBe(true);
      if(offline)applyOffline(s,3600_000);else advance(s,3600);
      expect(b.ume.eq(1)).toBe(true);expect(s.horizon.umeOrder).toBe(false);expect(b.route).toBe('seam');
    }
  });
  it('supports cancellation and does not repeat when an existing unit fulfils the target',()=>{
    const s=ready(),h=s.horizon,b=s.bottom;
    requestUme(h,b);h.umeOrder=false;b.money.anomaly=D(150);settleUmeOrder(h,b);
    expect(b.ume.eq(0)).toBe(true);requestUme(h,b);b.ume=D(1);settleUmeOrder(h,b);
    expect(h.umeOrder).toBe(false);expect(b.money.anomaly.eq(150)).toBe(true);
    expect(requestUme(h,b)).toBe(false);
  });
  it('reports the completed offline order without claiming completion for cancellation',()=>{
    const s=ready();s.owned={};s.bottom.money.anomaly=D(150);requestUme(s.horizon,s.bottom);
    const before=awaySnapshot(s);applyOffline(s,60_000);
    expect(awayReport(before,s,60).horizon.umeCompleted).toBe(true);
    s.bottom.ume=D(0);requestUme(s.horizon,s.bottom);const cancelled=awaySnapshot(s);s.horizon.umeOrder=false;
    expect(awayReport(cancelled,s,60).horizon.umeCompleted).toBe(false);
  });
  it('clears the order on gate opening, including the fifth, and preserves orders through reform',()=>{
    const s=ready(),h=s.horizon,b=s.bottom;requestUme(h,b);
    s.city.open=true;s.sorting.sorts=9;expect(reform(s).gt(0)).toBe(true);expect(h.umeOrder).toBe(true);
    h.opened=4;h.finalChecks=3;h.work=HALLS[4].nodes.map((_,i)=>nodeCost(h,i));b.ume=D(1);
    expect(openGate(h,b)).toBe(true);expect(h.umeOrder).toBe(false);expect(requestUme(h,b)).toBe(false);
  });
  it('round-trips a pending order; saves predating v24 never opt in or lose existing progress',()=>{
    const s=ready();requestUme(s.horizon,s.bottom);s.horizon.points=D(123);s.horizon.work[0]=D(12);
    s.city.total=D(1000);const raw=JSON.parse(serialize(s));expect(raw.v).toBe(33);
    const copy=deserialize(JSON.stringify(raw))!;expect(copy.horizon.umeOrder).toBe(true);
    raw.v=23;
    const old=deserialize(JSON.stringify(raw))!;
    expect(old.horizon.umeOrder).toBe(false);expect(old.horizon.points.eq(135)).toBe(true);
    expect(old.horizon.work[0].eq(0)).toBe(true);expect(old.city.total.eq(1000)).toBe(true);
    raw.v=24;raw.layers.bottom.ume='1';expect(deserialize(JSON.stringify(raw))!.horizon.umeOrder).toBe(false);
  });
});
