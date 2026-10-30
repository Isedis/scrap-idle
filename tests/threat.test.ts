import { describe, expect, it } from 'vitest';
import { advance, lightUp, loseShift, newGame, producerRate, recycle } from '../src/game/state';
import { OFFLINE_CAP, THREAT_STARTS_AT, climb, depthMeters, fillSeconds, formatDepth, stageIndex, threatMult } from '../src/game/threat';
import { applyOffline, deserialize, serialize } from '../src/game/save';
import { RECYCLE_AT } from '../src/game/layers';
import { D } from '../src/game/num';

const active = () => {
  const s = newGame(0);
  s.runTrash = THREAT_STARTS_AT;
  return s;
};

describe('threat level', () => {
  it('stays quiet in the first minutes of a run', () => {
    expect(climb(0, D(10), 600, false)).toBe(0);
  });

  it('fills in 15 minutes at the start, faster with more trash, never under 3', () => {
    expect(fillSeconds(D(0))).toBe(900);
    expect(fillSeconds(D(1e12))).toBeLessThan(fillSeconds(D(1e6)));
    expect(fillSeconds(D('1e100'))).toBe(180);
  });

  it('online reaches the edge; offline climbs ten times slower and stops at 90%', () => {
    const run = THREAT_STARTS_AT;
    const full = fillSeconds(run);
    expect(climb(0, run, full * 2, false)).toBe(1);
    expect(climb(0, run, full, true)).toBeCloseTo(0.1);
    expect(climb(0, run, full * 100, true)).toBe(OFFLINE_CAP);
    // Offline never pulls a higher online level down.
    expect(climb(0.95, run, 10, true)).toBe(0.95);
  });

  it('pays in the dark, then bites', () => {
    expect(threatMult(0)).toBe(1);
    expect(threatMult(0.5)).toBe(1.5);
    expect(threatMult(0.7)).toBeCloseTo(1);
    expect(threatMult(0.9)).toBeCloseTo(0.5);
    expect(threatMult(1)).toBeCloseTo(0.1);
  });

  it('names five stages', () => {
    expect([0, 0.3, 0.55, 0.75, 0.95].map(stageIndex)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('threat in the game', () => {
  it('income follows the level', () => {
    const s = active();
    const calm = producerRate(s, 'collector').toNumber();
    s.threat.level = 0.5;
    expect(producerRate(s, 'collector').toNumber()).toBeCloseTo(calm * 1.5);
  });

  it('climbs while playing and the floodlight resets it', () => {
    const s = active();
    advance(s, 60);
    expect(s.threat.level).toBeGreaterThan(0);
    lightUp(s);
    expect(s.threat.level).toBe(0);
  });

  it('stops producing at the edge', () => {
    const s = active();
    s.threat.level = 0.999;
    const before = s.trash;
    advance(s, 3600);
    expect(s.threat.level).toBe(1);
    expect(s.trash.sub(before).toNumber()).toBeLessThan(5);
  });

  it('a lost shift burns the run and keeps recycling progress', () => {
    const s = active();
    s.owned = { collector: 50, cart: 10 };
    s.recycle.points = D(7);
    s.recycle.nodes = ['s1'];
    s.threat.level = 1;
    loseShift(s);
    expect(s.threat.losses).toBe(1);
    expect(s.threat.level).toBe(0);
    expect(s.owned).toEqual({ collector: 10 });
    expect(s.runTrash.toNumber()).toBe(0);
    expect(s.recycle.points.toNumber()).toBe(7);
    expect(s.recycle.resets).toBe(0);
  });

  it('recycling also clears the threat', () => {
    const s = active();
    s.runTrash = RECYCLE_AT;
    s.threat.level = 0.8;
    recycle(s);
    expect(s.threat.level).toBe(0);
  });

  it('offline: half income, threat capped below the edge', () => {
    const s = active();
    applyOffline(s, 24 * 3600e3);
    expect(s.threat.level).toBeLessThanOrEqual(OFFLINE_CAP);
    expect(s.threat.level).toBeGreaterThan(0.5);
  });

  it('saves the level and losses; older saves start calm', () => {
    const s = active();
    s.threat = { level: 0.42, losses: 3 };
    const back = deserialize(serialize(s))!;
    expect(back.threat).toEqual({ level: 0.42, losses: 3 });
    const old = deserialize('{"v":3,"trash":"1","totalTrash":"1","runTrash":"1","runSeconds":5,"owned":{},"revealed":[],"upgrades":[],"seenUpgrades":[],"buyMode":"one","layers":{},"autobuy":true,"lastTick":0}')!;
    expect(old.threat).toEqual({ level: 0, losses: 0 });
  });
});

describe('depth', () => {
  it('starts at 5 km, comes closer forever and never reaches zero', () => {
    expect(depthMeters(D(0)).toNumber()).toBeCloseTo(5000);
    expect(depthMeters(D(1e12)).toNumber()).toBeCloseTo(500);
    const far = depthMeters(D('1e1000'));
    expect(far.gt(0)).toBe(true);
    expect(far.lt(1e-60)).toBe(true);
  });

  it('reads in sensible units', () => {
    expect(formatDepth(D(4112))).toBe('4.11 км');
    expect(formatDepth(D(37.5))).toBe('37.5 м');
    expect(formatDepth(D(0.004))).toBe('4.00 мм');
    expect(formatDepth(D(3e-12))).toBe('3.00e-12 м');
  });
});
