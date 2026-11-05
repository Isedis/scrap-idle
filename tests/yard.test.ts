import { describe,it,expect } from 'vitest';
import { D } from '../src/game/num';
import { newGame,recycle,loseShift,advance,lightUp,storyTick } from '../src/game/state';
import { serialize,deserialize } from '../src/game/save';
import { record,eventById } from '../src/game/story';
import { rememberYard,yardStage } from '../src/game/yard';

describe('the permanent yard and a new production batch',()=>{
  it('keeps built machinery and modifications without retaining their economic production',()=>{
    const s=newGame(0);s.owned={collector:25,truck:10,press:25};s.upgrades=['truck-2','press-2'];s.runTrash=D(1e12);s.totalTrash=D(1e12);
    const gain=recycle(s);expect(gain.gt(0)).toBe(true);expect(s.owned).toEqual({collector:1});expect(s.upgrades).toEqual([]);
    expect(s.yard.built).toMatchObject({truck:10,press:25});expect(s.yard.upgrades).toEqual(['truck-2','press-2']);expect(s.yard.batches).toBe(1);
    expect(recycle(s).eq(0)).toBe(true);expect(s.yard.batches).toBe(1);
  });
  it('preserves traces after a loss and after the archive rotates them out',()=>{
    const s=newGame(0);record(s.story,eventById('fridge')!,0);record(s.story,eventById('lamp-turn')!,1);record(s.story,eventById('breathe')!,2);
    loseShift(s);expect(s.story.traces).toEqual([]);expect(s.yard.evidence).toEqual(expect.arrayContaining(['fridge','lamp-turn','breathe']));
    for(let i=0;i<30;i++)record(s.story,eventById('gull')!,i+3);
    rememberYard(s.yard,s.owned,s.upgrades,s.story);expect(s.yard.evidence).toContain('breathe');
  });
  it('does not farm atmospheric progression by repeating resets or observing a future-stage case',()=>{
    const s=newGame(0);for(let i=0;i<100;i++){s.runTrash=D(1e12);recycle(s);}
    record(s.story,eventById('breathe')!,0);rememberYard(s.yard,s.owned,s.upgrades,s.story);
    expect(s.yard.wakeSeconds).toBe(0);expect(yardStage(s.yard)).toBe(0);expect(s.yard.batches).toBe(100);
  });
  it('remembers experienced tension while the light and recycling still clear immediate danger',()=>{
    const s=newGame(0);s.threat.level=.75;lightUp(s);expect(s.threat.level).toBe(0);expect(yardStage(s.yard)).toBe(3);
    s.runTrash=D(1e12);recycle(s);expect(s.threat.level).toBe(0);expect(yardStage(s.yard)).toBe(3);
  });
  it('advances slowly with time and available industry, including quieter offline time',()=>{
    const a=newGame(0);a.totalTrash=D(1e12);a.owned={collector:1,cart:1};advance(a,3600,false,60,true);
    expect(a.yard.wakeSeconds).toBeCloseTo(3600);expect(yardStage(a.yard)).toBe(1);
    a.owned.sorter=1;rememberYard(a.yard,a.owned,a.upgrades,a.story);expect(yardStage(a.yard)).toBe(2);
    const b=newGame(0);b.totalTrash=D(1e12);advance(b,3600,true);expect(b.yard.wakeSeconds).toBeCloseTo(180);expect(b.threat.level).toBeLessThan(1);
  });
  it('allows narrative events after a batch clears run trash without inventing danger',()=>{
    const s=newGame(0);s.totalTrash=D(1e12);s.yard.stage=3;s.runTrash=D(0);s.story.nextIn=0;
    expect(storyTick(s,1)).not.toBeNull();expect(s.threat.level).toBe(0);
  });
  it('round-trips permanent history and migrates v32 from genuine construction and recordings',()=>{
    const s=newGame(0);s.owned={collector:1,press:25};s.upgrades=['press-2'];record(s.story,eventById('fridge')!,0);
    rememberYard(s.yard,s.owned,s.upgrades,s.story);s.yard.wakeSeconds=1400;s.yard.batches=8;
    const back=deserialize(serialize(s))!;expect(back.yard).toEqual(s.yard);
    const old=JSON.parse(serialize(s));old.v=32;delete old.yard;const migrated=deserialize(JSON.stringify(old))!;
    expect(migrated.yard.built.press).toBe(25);expect(migrated.yard.built.orbital).toBeUndefined();expect(migrated.yard.evidence).toContain('fridge');expect(migrated.trash.eq(s.trash)).toBe(true);
  });
  it('rejects corrupt memory instead of losing the existing save silently',()=>{
    const raw=JSON.parse(serialize(newGame(0)));raw.yard.wakeSeconds='Infinity';expect(deserialize(JSON.stringify(raw))).toBeNull();
    raw.yard.wakeSeconds=0;raw.yard.built.press=-2;expect(deserialize(JSON.stringify(raw))).toBeNull();
  });
});
