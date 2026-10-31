import { describe, expect, it } from 'vitest';
import {
  autoRecycleAt,
  autoRecycleDue,
  buyRepeat,
  buyTrack,
  currentGain,
  depthOf,
  lightUp,
  milestoneUnits,
  newGame,
  producerRate,
  recycle,
  repeatsOpen,
  trackLevel,
  visibleTracks,
} from '../src/game/state';
import { COMPACT_DEPTH_DIGITS, TRACKS, trackCost } from '../src/game/infinite';
import { NODES, RECYCLE_AT, REPEATS, nextGainAt, recycleGain, repeatCost } from '../src/game/layers';
import { ACHIEVEMENTS, ACH_BONUS, checkAchievements } from '../src/game/achievements';
import { deserialize, serialize } from '../src/game/save';
import { D } from '../src/game/num';

const rich = () => {
  const s = newGame(0);
  s.runTrash = D('1e15');
  s.trash = D('1e80');
  return s;
};

describe('endless upgrades', () => {
  it('show up as the run grows', () => {
    const s = newGame(0);
    expect(visibleTracks(s)).toEqual([]);
    s.runTrash = D(1e9);
    expect(visibleTracks(s).map((t) => t.id)).toEqual(['compact']);
    s.runTrash = D(1e12);
    expect(visibleTracks(s)).toHaveLength(3);
  });

  it('have no top level and get dearer each time', () => {
    const s = rich();
    for (let i = 0; i < 40; i++) expect(buyTrack(s, 'compact')).toBe(true);
    expect(trackLevel(s, 'compact')).toBe(40);
    const t = TRACKS[0];
    expect(trackCost(t, 41).div(trackCost(t, 40)).toNumber()).toBeCloseTo(t.growth);
  });

  it('compaction multiplies income, bulk brings milestones closer, the dark pact raises the peak', () => {
    const s = rich();
    const rate = producerRate(s, 'collector').toNumber();
    buyTrack(s, 'compact');
    expect(producerRate(s, 'collector').toNumber()).toBeCloseTo(rate * 1.25);
    // 47 collectors: two Bulk levels count ten more, past the milestone at 50.
    s.owned = { collector: 47 };
    expect(milestoneUnits(s, 'collector')).toBe(47);
    const before = producerRate(s, 'collector').toNumber();
    buyTrack(s, 'bulk');
    buyTrack(s, 'bulk');
    expect(milestoneUnits(s, 'collector')).toBe(57);
    expect(milestoneUnits(s, 'cart')).toBe(0);
    expect(producerRate(s, 'collector').toNumber()).toBeCloseTo(before * 2);
    s.threat.level = 0.5;
    const dark = producerRate(s, 'collector').toNumber();
    buyTrack(s, 'dark');
    expect(producerRate(s, 'collector').toNumber()).toBeCloseTo((dark / 1.5) * 1.55);
  });

  it('start over with the run, but compaction keeps the thing closer', () => {
    const s = rich();
    const deep = depthOf(s);
    buyTrack(s, 'compact');
    buyTrack(s, 'compact');
    expect(s.compacted).toBe(2);
    expect(depthOf(s).toNumber()).toBeCloseTo(deep.div(Math.pow(10, (2 * COMPACT_DEPTH_DIGITS) / 12)).toNumber());
    s.runTrash = RECYCLE_AT;
    recycle(s);
    expect(s.tracks).toEqual({});
    expect(s.compacted).toBe(2);
  });

  it('cannot be bought before they show up or without the money', () => {
    const s = newGame(0);
    s.trash = D('1e40');
    expect(buyTrack(s, 'compact')).toBe(false);
    s.runTrash = D(1e9);
    s.trash = D(1);
    expect(buyTrack(s, 'compact')).toBe(false);
  });
});

describe('endless recycling nodes', () => {
  it('open after the whole tree and raise income and gain', () => {
    const s = newGame(0);
    s.recycle.points = D(1e6);
    expect(buyRepeat(s, 'memory')).toBe(false);
    s.recycle.nodes = NODES.map((n) => n.id);
    expect(repeatsOpen(s)).toBe(true);
    const rate = producerRate(s, 'collector').toNumber();
    expect(buyRepeat(s, 'memory')).toBe(true);
    expect(producerRate(s, 'collector').toNumber()).toBeCloseTo(rate * 1.2);
    s.runTrash = RECYCLE_AT.mul(16);
    const before = currentGain(s).toNumber();
    expect(buyRepeat(s, 'recipe')).toBe(true);
    expect(currentGain(s).toNumber()).toBe(Math.floor(before * 1.05));
    expect(s.recycle.points.toNumber()).toBe(1e6 - repeatCost(REPEATS[0], 0).toNumber() - repeatCost(REPEATS[1], 0).toNumber());
  });

  it('the next-point goal respects the recipe', () => {
    for (const mult of [1, 1.3, 2.7]) {
      const run = RECYCLE_AT.mul(50);
      const at = nextGainAt(run, mult);
      expect(recycleGain(at, mult).toNumber()).toBe(recycleGain(run, mult).toNumber() + 1);
    }
  });
});

describe('auto-recycler', () => {
  it('needs the node, the switch, and a gain worth the threshold', () => {
    const s = newGame(0);
    s.runTrash = RECYCLE_AT.mul(16);
    s.runSeconds = 60;
    s.recycle.total = D(150);
    expect(autoRecycleDue(s)).toBe(false);
    s.recycle.nodes = ['a3'];
    s.autoRecycle.on = true;
    expect(autoRecycleAt(s).toNumber()).toBe(15); // 10% of 150
    expect(autoRecycleDue(s)).toBe(true); // gain 20 >= 15
    s.autoRecycle.factor = 0.25;
    expect(autoRecycleDue(s)).toBe(false); // needs 38
  });

  it('does not wait forever: once the rate falls to half its best, it recycles anyway', () => {
    const s = newGame(0);
    s.recycle.nodes = ['a3'];
    s.autoRecycle = { on: true, factor: 0.25 };
    s.runTrash = RECYCLE_AT.mul(16);
    s.runSeconds = 600;
    s.recycle.total = D(1e6);
    s.scripts.peak = 0;
    expect(autoRecycleDue(s)).toBe(false);
    // The best rate this run was far higher than now.
    s.scripts.peak = (20 / 600) * 3;
    expect(autoRecycleDue(s)).toBe(true);
  });
});

describe('achievements', () => {
  it('there are 47 with unique ids', () => {
    expect(ACHIEVEMENTS).toHaveLength(47);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(47);
  });

  it('are earned once and add 1% each', () => {
    const s = newGame(0);
    s.totalTrash = D(2e6);
    const rate = producerRate(s, 'collector').toNumber();
    const got = checkAchievements(s, depthOf(s)).map((a) => a.id);
    expect(got).toContain('kg1e3');
    expect(got).toContain('kg1e6');
    expect(checkAchievements(s, depthOf(s)).filter((a) => a.id.startsWith('kg'))).toEqual([]);
    expect(producerRate(s, 'collector').toNumber()).toBeCloseTo(rate * (1 + ACH_BONUS * s.achievements.length));
  });

  it('count lights and the bravest one', () => {
    const s = newGame(0);
    s.threat.level = 0.96;
    lightUp(s);
    expect(s.threat.lights).toBe(1);
    expect(checkAchievements(s, depthOf(s)).map((a) => a.id)).toContain('edge');
  });
});

describe('save v6', () => {
  it('round-trips everything new', () => {
    const s = rich();
    buyTrack(s, 'compact');
    s.recycle.repeats = { memory: 3 };
    s.achievements = ['kg1e3', 'rec1'];
    s.autoRecycle = { on: true, factor: 0.05 };
    s.threat.lights = 4;
    const back = deserialize(serialize(s))!;
    expect(back.tracks).toEqual({ compact: 1 });
    expect(back.compacted).toBe(1);
    expect(back.recycle.repeats).toEqual({ memory: 3 });
    expect(back.achievements).toEqual(['kg1e3', 'rec1']);
    expect(back.autoRecycle).toEqual({ on: true, factor: 0.05 });
    expect(back.threat.lights).toBe(4);
  });

  it('a v5 save starts with none of it', () => {
    const v5 = JSON.parse(serialize(newGame(0)));
    v5.v = 5;
    for (const k of ['tracks', 'compacted', 'achievements', 'autoRecycle']) delete v5[k];
    const back = deserialize(JSON.stringify(v5))!;
    expect(back.tracks).toEqual({});
    expect(back.achievements).toEqual([]);
    expect(back.autoRecycle).toEqual({ on: false, factor: 0.1 });
  });

  it('a v11 save resets the old multiple to the default share', () => {
    const v11 = JSON.parse(serialize(newGame(0)));
    v11.v = 11;
    v11.autoRecycle = { on: true, factor: 2 };
    expect(deserialize(JSON.stringify(v11))!.autoRecycle).toEqual({ on: true, factor: 0.1 });
  });

  it('drops junk', () => {
    const s = JSON.parse(serialize(newGame(0)));
    s.tracks = { compact: -3, fake: 9, bulk: 2.7 };
    s.achievements = ['nope', 'kg1e3'];
    s.autoRecycle = { on: 'yes', factor: 3 };
    const back = deserialize(JSON.stringify(s))!;
    expect(back.tracks).toEqual({ bulk: 2 });
    expect(back.achievements).toEqual(['kg1e3']);
    expect(back.autoRecycle).toEqual({ on: false, factor: 0.1 });
  });
});
