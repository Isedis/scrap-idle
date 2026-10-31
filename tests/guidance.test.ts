import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { deserialize, serialize } from '../src/game/save';
import { newGame } from '../src/game/state';
import { D } from '../src/game/num';
import { nextGoal } from '../src/ui/guidance';
import { resetPreview } from '../src/ui/resetPreview';

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
