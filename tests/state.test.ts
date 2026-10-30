import { describe, expect, it } from 'vitest';
import { advance, buy, newGame, ratePerSecond } from '../src/game/state';
import { costOf, PRODUCERS } from '../src/game/producers';

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

  it('buys when affordable and raises the price', () => {
    const s = newGame(0);
    expect(buy(s, 'collector')).toBe(false);
    advance(s, 20);
    const price = costOf(PRODUCERS[0], 1);
    expect(buy(s, 'collector')).toBe(true);
    expect(s.owned.collector).toBe(2);
    expect(s.trash.toNumber()).toBeCloseTo(20 - price.toNumber());
    expect(costOf(PRODUCERS[0], 2).gt(price)).toBe(true);
  });

  it('reveals the next producer at half its price', () => {
    const s = newGame(0);
    expect(s.revealed).toEqual(['collector']);
    advance(s, 60);
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
