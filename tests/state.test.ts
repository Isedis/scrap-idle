import { describe, expect, it } from 'vitest';
import { advance, availableUpgrades, buy, buyUpgrade, newGame, producerRate, purchasePlan, ratePerSecond, takeNewUpgrades } from '../src/game/state';
import { affordableCount, costOf, costOfMany, milestonesReached, nextMilestone, prevMilestone, PRODUCERS } from '../src/game/producers';
import { UPGRADES } from '../src/game/upgrades';
import { D } from '../src/game/num';

const collector = PRODUCERS[0];

describe('game state', () => {
  it('starts automatic with one free collector', () => {
    const s = newGame(0);
    expect(s.owned.collector).toBe(1);
    expect(ratePerSecond(s).toNumber()).toBe(1);
  });

  it('produces over time and the result does not depend on step size', () => {
    const a = newGame(0);
    const b = newGame(0);
    advance(a, 100);
    for (let i = 0; i < 1000; i++) advance(b, 0.1);
    expect(a.trash.toNumber()).toBeCloseTo(100);
    expect(b.trash.toNumber()).toBeCloseTo(100);
  });

  it('buys one when affordable and raises the price', () => {
    const s = newGame(0);
    expect(buy(s, 'collector')).toBe(0);
    advance(s, 20);
    const price = costOf(collector, 1);
    expect(buy(s, 'collector')).toBe(1);
    expect(s.owned.collector).toBe(2);
    expect(s.trash.toNumber()).toBeCloseTo(20 - price.toNumber());
  });

  it('buys ten at once only when all ten are affordable', () => {
    const s = newGame(0);
    s.buyMode = 'ten';
    s.trash = costOfMany(collector, 1, 10).sub(0.01);
    expect(buy(s, 'collector')).toBe(0);
    s.trash = s.trash.add(0.02);
    expect(buy(s, 'collector')).toBe(10);
    expect(s.owned.collector).toBe(11);
  });

  it('buy max spends on as many as fit', () => {
    const s = newGame(0);
    s.buyMode = 'max';
    s.trash = D(1000);
    const n = buy(s, 'collector');
    expect(n).toBe(affordableCount(collector, 1, D(1000)));
    expect(s.trash.gte(0)).toBe(true);
    expect(s.trash.lt(costOf(collector, 1 + n))).toBe(true);
  });

  it('shows the price of one in max mode when nothing is affordable', () => {
    const s = newGame(0);
    s.buyMode = 'max';
    expect(purchasePlan(s, 'collector')).toEqual({ count: 0, cost: costOf(collector, 1) });
  });

  it('series cost matches buying one by one', () => {
    let sum = D(0);
    for (let i = 0; i < 37; i++) sum = sum.add(costOf(collector, 5 + i));
    expect(costOfMany(collector, 5, 37).toNumber()).toBeCloseTo(sum.toNumber(), 3);
    expect(affordableCount(collector, 5, sum.mul(1 + 1e-9))).toBe(37);
    expect(affordableCount(collector, 5, sum.mul(0.999))).toBe(36);
  });

  it('doubles output at 10, 25, 50 and every 50 after', () => {
    expect([9, 10, 24, 25, 49, 50, 99, 100, 150].map(milestonesReached)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 5]);
    expect([0, 10, 30, 50].map(nextMilestone)).toEqual([10, 25, 50, 100]);
    expect([5, 10, 30, 120].map(prevMilestone)).toEqual([0, 10, 25, 100]);
    const s = newGame(0);
    s.owned.collector = 10;
    expect(producerRate(s, 'collector').toNumber()).toBe(20);
  });

  it('reveals the next producer at half its price', () => {
    const s = newGame(0);
    advance(s, PRODUCERS[1].baseCost.toNumber() / 2);
    expect(s.revealed).toContain('cart');
    expect(s.revealed).not.toContain('truck');
  });

  it('spending does not lower total trash', () => {
    const s = newGame(0);
    advance(s, 50);
    buy(s, 'collector');
    expect(s.totalTrash.toNumber()).toBeCloseTo(50);
  });
});

describe('upgrades', () => {
  it('have unique ids and are sorted by price', () => {
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(UPGRADES.length);
    for (let i = 1; i < UPGRADES.length; i++) expect(UPGRADES[i].cost.gte(UPGRADES[i - 1].cost)).toBe(true);
  });

  it('every producer has four tiers', () => {
    for (const p of PRODUCERS) expect(UPGRADES.filter((u) => u.effect.kind === 'producer' && u.effect.target === p.id)).toHaveLength(4);
  });

  it('unlock, announce once, and apply their effect', () => {
    const s = newGame(0);
    expect(availableUpgrades(s).map((u) => u.id)).toEqual(['collector-1']);
    expect(takeNewUpgrades(s).map((u) => u.id)).toEqual(['collector-1']);
    expect(takeNewUpgrades(s)).toEqual([]);
    expect(buyUpgrade(s, 'collector-1')).toBe(false); // too expensive
    s.trash = D(100);
    expect(buyUpgrade(s, 'collector-1')).toBe(true);
    expect(buyUpgrade(s, 'collector-1')).toBe(false); // only once
    expect(s.trash.toNumber()).toBe(0);
    expect(ratePerSecond(s).toNumber()).toBe(2);
  });

  it('global and synergy effects stack with tiers', () => {
    const s = newGame(0);
    s.owned = { collector: 20, cart: 10 };
    s.upgrades = ['night-shift', 'hitch'];
    // Carts: 10 owned × base × milestone ×2 × night shift ×1.5 × (1 + 1% × 20 collectors).
    const cart = PRODUCERS[1];
    expect(producerRate(s, 'cart').toNumber()).toBeCloseTo(cart.baseRate.toNumber() * 10 * 2 * 1.5 * 1.2);
  });

  it('cannot be bought before they unlock', () => {
    const s = newGame(0);
    s.trash = D('1e100');
    expect(buyUpgrade(s, 'collector-2')).toBe(false);
    expect(buyUpgrade(s, 'no-such')).toBe(false);
  });
});
