import { describe, expect, it } from 'vitest';
import { newBottom, excavationTask, bottomTick, OBJECT_WORK, digRate, depthTarget } from '../src/game/bottom';

describe('current excavation work and ETA',()=>{
  it('accounts for increasing resistance instead of dividing all remaining depth by today\'s rate',()=>{
    const b=newBottom();b.open=true;b.route='depth';b.dug=600;
    const task=excavationTask(b,0),distance=depthTarget(b).to-b.dug;
    expect(task.kind).toBe('depth');expect(task.etaSeconds).toBeGreaterThan(distance/digRate(b,0)*60);
    bottomTick(b,task.etaSeconds!,0,()=>0);
    expect(b.dug).toBeCloseTo(task.total,7);
  });
  for(const hoist of [false,true]){
    it(`predicts object completion with the real depth allocation (hoist=${hoist})`,()=>{
      const b=newBottom();b.open=true;b.dug=4500;b.route='site';b.siteId='bench';b.equipment.hoist=hoist;
      b.objectWork.bench=100;const task=excavationTask(b,10);
      expect(task.kind).toBe('site');expect(task.name).toBe('Разборочный стол');
      expect(task.depthShare).toBe(hoist?.25:0);
      bottomTick(b,task.etaSeconds!,10,()=>0);
      expect(b.objectWork.bench).toBeCloseTo(OBJECT_WORK.bench,7);
      expect(b.dug).toBeCloseTo(hoist?4500+200/3:4500,7);
    });
  }
  it('predicts the next anomaly on the seam without claiming depth progress',()=>{
    const b=newBottom();b.open=true;b.dug=22000;b.equipment.borer=1;b.route='seam';b.seamProgress=5;
    const task=excavationTask(b,0);expect(task.kind).toBe('seam');expect(task.depthShare).toBe(0);expect(task.total).toBe(20);
    bottomTick(b,task.etaSeconds!+1e-6,0,()=>0);
    expect(b.seamFound).toBe(1);expect(b.dug).toBe(22000);
  });
  it('follows auto work and returns to depth when an object is ready; locked routes are not shown as active',()=>{
    const b=newBottom();b.open=true;b.dug=1000;
    expect(excavationTask(b).kind).toBe('site');
    b.objectWork.hoist=OBJECT_WORK.hoist;
    expect(excavationTask(b).kind).toBe('depth');
    b.route='seam';expect(excavationTask(b).kind).toBe('depth');
    b.route='site';b.siteId='borer';expect(excavationTask(b).kind).toBe('depth');
  });
});
