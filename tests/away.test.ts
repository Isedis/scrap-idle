import { describe, expect, it } from 'vitest';
import { awayReport, awaySnapshot } from '../src/game/away';
import { applyOffline } from '../src/game/save';
import { newGame } from '../src/game/state';
import { D } from '../src/game/num';

describe('coming back after a while', () => {
  it('says what was collected and how far the threat rose', () => {
    const s = newGame(0);
    s.owned = { collector: 50 };
    s.runTrash = D(1e6);
    s.totalTrash = D(1e6);
    const before = awaySnapshot(s);
    const seconds = applyOffline(s, 3600 * 1000);
    const r = awayReport(before, s, seconds);
    expect(r.seconds).toBe(3600);
    expect(r.trash.gt(0)).toBe(true);
    expect(r.threatRose).toBe(true);
    expect(r.threat).toBeLessThanOrEqual(0.9);
    expect(r.recordings).toBeGreaterThanOrEqual(1);
  });

  it('counts what the inspection table turned up', () => {
    const s = newGame(0);
    s.sorting.open = true;
    s.owned = { collector: 50 };
    const before = awaySnapshot(s);
    applyOffline(s, 3600 * 1000);
    const r = awayReport(before, s, 3600);
    expect(r.finds.length + r.bales).toBeGreaterThan(0);
    expect(r.finds[0]).toBe('lantern');
  });
});

it('separates gross receipt, purchases and remaining balances through a reset', () => {
  const s = newGame(0);
  s.recycle.nodes = ['a1', 'a3'];
  s.autoRecycle.on = true;
  s.trash = D(1e6); s.runTrash = D(1e15); s.runSeconds = 60;
  const before = awaySnapshot(s);
  applyOffline(s, 60_000);
  const r = awayReport(before, s, 60);
  expect(r.automation.recycles).toBeGreaterThan(0);
  expect(r.automation.recycled.gt(0)).toBe(true);
  expect(r.automation.producers).toBeGreaterThan(0);
  expect(r.automation.spentTrash.gt(0)).toBe(true);
  expect(r.balance.trash.eq(s.trash)).toBe(true);
  expect(r.balance.recycled.eq(s.recycle.points)).toBe(true);
  expect(r.trash.eq(s.totalTrash.sub(before.totalTrash))).toBe(true);
});
