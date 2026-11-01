import { describe, expect, it } from 'vitest';
import { newGame } from '../src/game/state';
import { simulateOffline, offlineActivity, offlineStep } from '../src/game/offline';
import { D } from '../src/game/num';
import { awaySnapshot, awayReport } from '../src/game/away';

function automated() {
  const s = newGame(0);
  s.recycle.nodes = ['a1', 'a3'];
  s.trash = D(1e6);
  s.revealed = ['collector', 'cart', 'truck'];
  return s;
}

describe('offline automation', () => {
  it('runs permanent support scripts after descent without schools', () => {
    const s = newGame(0);
    s.bottom.open = true;
    s.bottom.scripts = ['tree', 'line'];
    s.recycle.points = D(1);
    s.sorting.open = true;
    s.sorting.line = [null, null];
    simulateOffline(s, 4);
    expect(s.recycle.nodes).toContain('s1');
    expect(s.sorting.line.some((station) => station !== null)).toBe(true);
    expect(offlineActivity(s).purchases).toBeGreaterThan(0);
  });
  it('buys with owned scripts and respects the off switch', () => {
    const s = automated();
    simulateOffline(s, 5);
    expect(offlineActivity(s).purchases).toBeGreaterThan(0);
    expect(s.owned.collector).toBeGreaterThan(1);
    const off = automated(); off.autobuy = false;
    simulateOffline(off, 5);
    expect(off.owned).toEqual({ collector: 1 });
    expect(offlineActivity(off).purchases).toBe(0);
    const locked = newGame(0); locked.trash = D(1e6);
    simulateOffline(locked, 5);
    expect(locked.owned).toEqual({ collector: 1 });
  });
  it('performs an enabled automatic recycle and reports gross collection', () => {
    const s = automated();
    s.autobuy = false; s.runTrash = D(1e15); s.runSeconds = 60;
    s.autoRecycle.on = true;
    const before = awaySnapshot(s);
    simulateOffline(s, 10);
    expect(offlineActivity(s).recycles).toBe(1);
    expect(s.recycle.points.gt(0)).toBe(true);
    expect(s.runTrash.lt(1e15)).toBe(true);
    expect(awayReport(before, s, 10).trash.gt(0)).toBe(true);
  });
  it('preserves paused hearing and its noise without losing an offline shift', () => {
    const s = automated();
    s.sorting.open = true; s.hearing.noise = 2;
    s.hearing.phase = 'walk'; s.hearing.left = 42; s.hearing.walk = 60;
    s.runTrash = D(1e12);
    const losses = s.threat.losses;
    simulateOffline(s, 600);
    expect(s.hearing.noise).toBe(2);
    expect(s.hearing.phase).toBe('walk');
    expect(s.hearing.left).toBe(42);
    expect(s.threat.level).toBeLessThanOrEqual(0.9);
    expect(s.threat.losses).toBe(losses);
  });
  it('resorts only with the installed and enabled sorter', () => {
    const s = automated(); s.autobuy = false;
    s.sorting.open = true; s.sorting.recipes = ['a1'];
    s.recycle.total = D(1e6); s.scripts.sortOn = true;
    simulateOffline(s, 1);
    expect(s.sorting.sorts).toBe(1);
    expect(offlineActivity(s).resorts).toBe(1);
    const off = automated(); off.sorting.open = true;
    off.sorting.recipes = ['a1']; off.recycle.total = D(1e6);
    simulateOffline(off, 1);
    expect(off.sorting.sorts).toBe(0);
  });
  it('respects producer exclusions and upgrade spending switches', () => {
    const s = automated(); s.scripts.producerOff = ['collector', 'cart', 'truck'];
    s.scripts.bought = ['upgrades']; s.scripts.upgradesOn = false;
    simulateOffline(s, 5);
    expect(s.owned).toEqual({ collector: 1 });
    expect(s.upgrades).toEqual([]);
    s.scripts.upgradesOn = true;
    simulateOffline(s, 5);
    expect(s.upgrades.length).toBeGreaterThan(0);
  });
  it('catches up a full day of automation without losing the shift', () => {
    const s = automated(); s.autoRecycle.on = true;
    simulateOffline(s, 86400);
    expect(offlineActivity(s).purchases).toBeGreaterThan(0);
    expect(s.totalTrash.isFinite()).toBe(true);
    expect(s.threat.level).toBeLessThanOrEqual(0.9);
    expect(s.threat.losses).toBe(0);
  }, 20_000);
  it('uses bounded elapsed-time bands and clears stale reports', () => {
    expect([0, 600, 3600, 86400].map(offlineStep)).toEqual([1, 5, 30, 300]);
    const s = automated(); simulateOffline(s, 5);
    simulateOffline(s, 0);
    expect(offlineActivity(s)).toMatchObject({ purchases: 0, recycles: 0, resorts: 0 });
  });
});
