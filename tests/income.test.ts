import { describe, expect, it } from 'vitest';
import { incomeBreakdown, newGame, ratePerSecond } from '../src/game/state';
import { D } from '../src/game/num';

describe('income breakdown', () => {
  it('a fresh game is just the producers', () => {
    const { base, parts } = incomeBreakdown(newGame(0));
    expect(base.toNumber()).toBe(1);
    expect(parts).toEqual([]);
  });

  it('parts multiply back to the income exactly', () => {
    const s = newGame(0);
    s.owned = { collector: 60, cart: 25, truck: 10 };
    s.upgrades = ['bags-1', 'cart-1'];
    s.recycle.total = D(400);
    s.recycle.nodes = ['p1', 'p3'];
    s.threat.level = 0.4;
    s.tracks = { compact: 3 };
    s.achievements = ['kg1e3', 'crew10'];
    s.sorting.sorts = 2;
    s.sorting.total = D(900);
    const { base, parts } = incomeBreakdown(s);
    const product = parts.reduce((m, p) => m.mul(p.mult), base);
    expect(product.div(ratePerSecond(s)).toNumber()).toBeCloseTo(1, 9);
    const labels = parts.map((p) => p.label);
    expect(labels).toEqual(expect.arrayContaining(['Переработка', 'Тьма', 'Уплотнение', 'Достижения', 'Пересортировки', 'Фракции', 'Улучшения и пороги']));
  });

  it('shows the dark as a loss near the edge', () => {
    const s = newGame(0);
    s.threat.level = 0.95;
    const dark = incomeBreakdown(s).parts.find((p) => p.label === 'Тьма')!;
    expect(dark.mult.lt(1)).toBe(true);
  });
});
