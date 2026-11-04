import { describe,it,expect } from 'vitest';
import { D } from '../src/game/num';
import { newGame } from '../src/game/state';
import { restartHorizon,buildFirstHall,HALLS,nodeCost,startCommission,horizonTick,powerCapacity } from '../src/game/horizon';
import { nextGoal } from '../src/ui/guidance';
const room=()=>{const s=newGame(0);s.bottom.open=true;s.horizon=restartHorizon({source:'save',supply:0,quality:0,logistics:0,mine:0});return s;};
describe('actionable guidance across five halls',()=>{
 it('distinguishes the first purchase, active build and absent raw stock',()=>{const s=room();expect(nextGoal(s).text).toMatch(/выберите следующую машину/);expect(nextGoal(s).ready).toBe(true);buildFirstHall(s.horizon,'press');expect(nextGoal(s).text).toMatch(/идёт монтаж/);horizonTick(s.horizon,80,s.city);s.horizon.firstHall!.raw=D(0);s.horizon.firstHall!.shipment=null;expect(nextGoal(s).text).toMatch(/закажите партию/);expect(nextGoal(s).ready).toBe(true);});
 it('points to the unchosen second-hall profile',()=>{const s=room();s.horizon.opened=1;s.horizon.work=HALLS[1].nodes.map(()=>D(0));expect(nextGoal(s).text).toMatch(/крупные или точные/);expect(nextGoal(s).layer).toBe('horizon');});
 it('separates paid testing from the next test and a real UME shortage',()=>{const s=room(),h=s.horizon;h.opened=4;h.points=D(10000);h.work=HALLS[4].nodes.map((_,i)=>nodeCost(h,i));expect(nextGoal(s).text).toMatch(/проверку подачи/);startCommission(h,s.city,'feed');expect(nextGoal(s).text).toMatch(/идёт проверка подачи/);horizonTick(h,60,s.city);expect(nextGoal(s).text).toMatch(/проверку привода/);h.finalChecks=3;expect(nextGoal(s).layer).toBe('bottom');});
 it('offers a full manual battery as an action and acknowledges a completed chapter',()=>{const s=room(),h=s.horizon;h.opened=3;h.work=HALLS[3].nodes.map(()=>D(0));h.charge=powerCapacity(h,s.city);expect(nextGoal(s).text).toMatch(/запустите привод/);expect(nextGoal(s).ready).toBe(true);h.opened=5;expect(nextGoal(s).layer).toBe('horizon');expect(nextGoal(s).text).toMatch(/Контур запущен/);});
});
