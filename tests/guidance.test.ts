import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { deserialize, serialize } from '../src/game/save';
import { newGame } from '../src/game/state';
import { D } from '../src/game/num';
import { nextGoal } from '../src/ui/guidance';
import { resetPreview } from '../src/ui/resetPreview';
import { DISTRICTS, canAnnex } from '../src/game/city';
import { EPOCHS, MELT } from '../src/game/bottom';

describe('operator guidance', () => {
  it('keeps the first goal on an available tab', () => {
    expect(nextGoal(newGame()).tab).toBe('dump');
  });
  it('offers a reform before another lower reset', () => {
    const s = newGame();
    s.city.open = true;
    s.sorting.sorts = 9;
    s.runTrash = D('1e30');
    expect(nextGoal(s).layer).toBe('city');
  });
  for (const [fixture, kind] of [['recycle-ready', 'recycle'], ['sorting', 'sorting'], ['city-late', 'city']] as const) {
    it(`previews ${kind} without modifying the save`, () => {
      const s = deserialize(readFileSync(`tests/fixtures/${fixture}.json`, 'utf8'))!;
      if (kind === 'sorting') s.recycle.total = D('1e100');
      if (kind === 'city') { s.city.open = true; s.sorting.sorts = 9; }
      const before = serialize(s);
      const preview = resetPreview(s, kind);
      expect(preview.length).toBeGreaterThan(1);
      expect(preview.join(' ')).not.toMatch(/NaN|undefined|Infinity/);
      expect(serialize(s)).toBe(before);
    });
  }
});

describe('goals beyond the upper resets', () => {
  it('prioritises an affordable district and the first descent over another reform', () => {
    const s = newGame(0);
    s.city.open = true;
    s.sorting.sorts = 9;
    s.city.points = D(1e6);
    expect(DISTRICTS.some((d) => canAnnex(s.city, d.id))).toBe(true);
    expect(nextGoal(s).text).toContain('квартал');
    s.city.owned = DISTRICTS.map((d) => d.id);
    expect(nextGoal(s).text).toContain('спуститься');
    expect(nextGoal(s).ready).toBe(true);
  });

  it('points to actionable bottom work even when a reform is available', () => {
    const s = newGame(0);
    s.bottom.open = true;
    s.bottom.heap = 300;
    s.city.open = true;
    s.sorting.sorts = 9;
    s.bottom.stock.sack = 3;
    expect(nextGoal(s).layer).toBe('bottom');
    expect(nextGoal(s).text).toContain('вскрытию');
    s.bottom.auto = 1;
    expect(nextGoal(s).text).toContain('до нового слоя');
    expect(nextGoal(s).ready).toBe(false);
  });

  it('requires a container that can be paid for, and excludes automated stock', () => {
    const s = newGame(0);
    s.bottom.open = true;
    s.bottom.heap = 300;
    s.bottom.stock.safe = 2;
    expect(nextGoal(s).ready).toBe(false);
    s.bottom.money.antique = D(2);
    expect(nextGoal(s).text).toContain('вскрытию');
    s.bottom.auto = 2;
    expect(nextGoal(s).text).not.toContain('вскрытию');
  });

  it('offers permanent scripts, then moves on after purchase', () => {
    const s = newGame(0);
    s.bottom.open = true;
    s.bottom.heap = 300;
    s.bottom.money.dust = D(40);
    expect(nextGoal(s).text).toContain('Закупщик');
    s.bottom.scripts.push('producers');
    expect(nextGoal(s).text).not.toContain('Закупщик');
    s.bottom.money.antique = D(3);
    expect(nextGoal(s).text).toContain('автовскрытие');
  });

  it('does not offer UME melting before the inhuman layer', () => {
    const s = newGame(0);
    s.bottom.open = true;
    s.bottom.heap = 300;
    s.bottom.money.anomaly = D(MELT.anomaly);
    expect(nextGoal(s).text).not.toContain('переплавить');
    s.bottom.dug = EPOCHS.find((e) => e.id === 'inhuman')!.depth;
    expect(nextGoal(s).text).toContain('первую УМЕ');
    s.bottom.ume = D(1);
    expect(nextGoal(s).text).not.toContain('первую');
  });

  it('sends an exhausted heap back to the available production tab', () => {
    const s = newGame(0);
    s.bottom.open = true;
    expect(nextGoal(s).tab).toBe('dump');
  });
});

describe('reset consequences from the real simulation', () => {
  it('shows retained automation, rank exceptions and lost scripts without changing the save', () => {
    const s = newGame(0);
    s.sorting.open = true;
    s.recycle.total = D(1e5);
    s.recycle.nodes = ['a1', 'a2', 's1'];
    s.scripts.bought = ['light'];
    s.bottom.scripts = ['tree'];
    const before = serialize(s);
    const lines = resetPreview(s, 'sorting');
    const tree = lines.find((line) => line.startsWith('Дерево после'))!;
    expect(tree).not.toContain('Подъёмные');
    expect(tree).not.toContain('без купленных');
    const scripts = lines.find((line) => line.startsWith('Скрипты останутся'))!;
    expect(scripts).toContain('Завхоз');
    expect(scripts).toContain('Автопрожектор');
    expect(serialize(s)).toBe(before);
  });
});
