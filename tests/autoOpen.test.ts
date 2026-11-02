import { describe, expect, it, vi, afterEach } from 'vitest';
import { autoOpen, newBottom, openOne, CONTAINERS, RARITIES, ITEMS, savingGoal, epochItems, setPower, showcaseScore, type Opening } from '../src/game/bottom';
import { newGame, advance } from '../src/game/state';
import { simulateOffline } from '../src/game/offline';
import { D } from '../src/game/num';

afterEach(()=>vi.restoreAllMocks());
const seeded=(seed=42)=>()=>((seed=seed*16807%2147483647)/2147483647);

describe('automatic container batches',()=>{
  it('opens a whole affordable stock instead of stopping at 500 per invocation',()=>{
    const b=newBottom();b.auto=1;b.stock.sack=1501;
    expect(autoOpen(b,()=>0)).toBe(1501);
    expect(b.stock.sack).toBe(0);expect(b.opened).toBe(1501);
    expect(b.autoFeed.count).toBe(1501);expect(b.recent.length).toBeLessThanOrEqual(12);
  });
  it('revisits earlier containers when a later reward makes them affordable',()=>{
    const b=newBottom();b.auto=2;b.stock.suitcase=1;b.stock.coffin=1;b.money.relic=D(1);
    expect(autoOpen(b,()=>0)).toBe(2);
    expect(b.stock.suitcase).toBe(0);expect(b.stock.coffin).toBe(0);
  });
  it('keeps purchase reserves and inaccessible stock with large batches',()=>{
    const b=newBottom();b.auto=1;b.dug=1000;b.saving='equipment:hoist';b.money.scrap=D(50);
    b.stock.sack=1501;b.stock.crate=100;b.stock.coffin=100;
    expect(autoOpen(b,()=>0)).toBe(1511);
    expect(b.money.scrap.eq(savingGoal(b)!.cost)).toBe(true);
    expect(b.stock.crate).toBe(90);expect(b.stock.coffin).toBe(100);
  });
  it('honours an explicit caller limit and does not reopen an already drained stock',()=>{
    const b=newBottom();b.auto=1;b.stock.sack=1501;
    expect(autoOpen(b,()=>0,7)).toBe(7);expect(autoOpen(b,()=>0)).toBe(1494);
    const before=b.money.dust;expect(autoOpen(b,()=>0)).toBe(0);expect(b.money.dust.eq(before)).toBe(true);
  });
  it('matches individual paid openings, including luck changing when a collection completes inside the batch',()=>{
    function stock(){
      const b=newBottom();b.auto=2;b.dug=22000;b.tools.luck=4;
      for(const c of CONTAINERS)b.stock[c.id]=250;
      for(const r of RARITIES)b.money[r]=D(1e5);
      for(const item of epochItems('ancient'))b.found[item.id]=item.rarity==='anomaly'?0:20;
      return b;
    }
    const batch=stock(),single=stock();expect(setPower(batch,'ancient')).toBe(0);
    const batchCount=autoOpen(batch,seeded()),rand=seeded();let best:Opening|null=null,count=0;
    for(const c of CONTAINERS){
      let opening:Opening|null;
      while((opening=openOne(single,c.id,rand))){
        count++;if(!best||showcaseScore(opening)>=showcaseScore(best))best=opening;
      }
    }
    expect(setPower(batch,'ancient')).toBe(2);
    expect(batchCount).toBe(count);expect(batch.found).toEqual(single.found);expect(batch.dry).toEqual(single.dry);
    expect(batch.recent).toEqual(single.recent);expect(batch.autoFeed.best).toEqual(best);
    for(const r of RARITIES)expect(batch.money[r].eq(single.money[r])).toBe(true);
  });
  it('gives the same rewards online at 50 frames/sec and offline for a pre-existing backlog',()=>{
    function state(){
      const s=newGame(0);s.owned={};s.bottom.open=true;s.bottom.dug=11000;s.bottom.firstUmeGranted=true;
      s.bottom.route='seam';s.bottom.equipment.borer=1;s.bottom.auto=2;
      for(const c of CONTAINERS)s.bottom.stock[c.id]=350;
      for(const rarity of RARITIES)s.bottom.money[rarity]=D(1e5);
      // Hold collection bonuses fixed: this test isolates opening throughput from tick approximation.
      for(const item of ITEMS)s.bottom.found[item.id]=100000;
      return s;
    }
    const online=state(),offline=state();
    vi.spyOn(Math,'random').mockImplementation(seeded());
    for(let frame=0;frame<50;frame++)advance(online,.02);
    vi.spyOn(Math,'random').mockImplementation(seeded());simulateOffline(offline,1);
    expect(offline.bottom.opened).toBe(online.bottom.opened);
    expect(offline.bottom.stock).toEqual(online.bottom.stock);
    expect(offline.bottom.found).toEqual(online.bottom.found);expect(offline.bottom.dry).toEqual(online.bottom.dry);
    for(const rarity of RARITIES)expect(offline.bottom.money[rarity].toNumber()).toBeCloseTo(online.bottom.money[rarity].toNumber(),7);
    expect(offline.bottom.autoFeed.count).toBe(online.bottom.autoFeed.count);
    expect(offline.bottom.autoFeed.best).toEqual(online.bottom.autoFeed.best);
  });
});

describe.runIf(process.env.AUTO_STRESS)('advanced mine stress check',()=>{
  it('replays the audit hour at borer level 25 without an offline opening backlog, with and without surface scripts',()=>{
    for(const scripts of [false,true]){
      function state(){
        const s=newGame(0);s.owned={};s.bottom.open=true;s.bottom.route='depth';
        s.bottom.equipment.borer=25;s.bottom.auto=1;if(scripts)s.bottom.scripts=['light'];return s;
      }
      const online=state(),offline=state();vi.spyOn(Math,'random').mockReturnValue(0);
      advance(online,3600);simulateOffline(offline,3600);
      console.log(`Audit hour (scripts=${scripts}): online ${online.bottom.opened}, offline ${offline.bottom.opened}, pending ${offline.bottom.stock.sack}`);
      expect(offline.bottom.opened).toBe(online.bottom.opened);
      expect(offline.bottom.opened).toBe(Math.floor(offline.bottom.dug));
      expect(offline.bottom.stock.sack).toBe(0);expect(offline.bottom.dug).toBeCloseTo(online.bottom.dug,6);
    }
  },60000);
  it('measures a large exact batch without expanding the visual queue',()=>{
    const b=newBottom();b.auto=2;b.dug=22000;
    for(const c of CONTAINERS)b.stock[c.id]=40000;
    for(const rarity of RARITIES)b.money[rarity]=D(1e7);
    const started=performance.now();const count=autoOpen(b,seeded(),Infinity);
    console.log(`200000 openings: ${Math.round(performance.now()-started)} ms; processed ${count}; recent ${b.recent.length}`);
    expect(count).toBe(200000);expect(b.recent.length).toBe(12);expect(b.autoFeed.count).toBe(count);
  },60000);
});
