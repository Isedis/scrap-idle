import { describe, expect, it } from 'vitest';
import { assembleLine, lineRecipe, planLine } from '../src/game/linePlanner';
import { FRACS, RECIPES, STATIONS, newSorting, runLine, slotCount, stationById, stationOpen } from '../src/game/sorting';
import { D } from '../src/game/num';
import { autoLine, newGame, runScripts } from '../src/game/state';
import { deserialize, serialize } from '../src/game/save';
import { simulateOffline } from '../src/game/offline';
import { sortingAdvice } from '../src/game/advice';

const automatic = () => {
  const s = newGame(0);
  s.bottom.open = true;
  s.bottom.scripts = ['line'];
  s.sorting.open = true;
  return s;
};

describe('automatic belt construction', () => {
  it('picks collectors for both missing ingredients instead of starving the next slot recipe', () => {
    const s = newSorting();
    s.open = true;
    s.recipes = ['i1', 'i2', 'l1', 'l2', 'e1', 'e2'];
    s.line = ['optic', 'sieve', null];
    expect(lineRecipe(s)?.id).toBe('l3');
    const line = planLine(s);
    expect(line).toContain('magnet');
    expect(line).toContain('blower');
    const r = runLine(line, s.levels);
    expect(r.caught.metal).toBeGreaterThan(0);
    expect(r.caught.paper).toBeGreaterThan(0);
    expect(line.indexOf('briquetter')).toBe(line.length - 1);
  });

  it('only uses unlocked, unique stations within the available slots at every stage', () => {
    const s = newSorting();
    for (const unlock of [null, 'l1', 'l2', 'l3', 'l4', 'l5', 'l6']) {
      if (unlock) s.recipes.push(unlock);
      const line = planLine(s);
      expect(line.length).toBeLessThanOrEqual(slotCount(s));
      expect(new Set(line).size).toBe(line.length);
      expect(line.every((id) => stationOpen(s, stationById(id)!))).toBe(true);
      const press = line.indexOf('briquetter');
      const crusher = line.indexOf('crusher');
      for (let i = 0; i < line.length; i++) {
        if (stationById(line[i])!.frac && press >= 0) expect(i).toBeLessThan(press);
      }
      if (crusher >= 0) expect(crusher).toBe(line.length - 1);
    }
  });

  it('fills the finished line and keeps its plan stable without spending currencies', () => {
    const s = newSorting();
    s.open = true;
    s.recipes = RECIPES.map((r) => r.id);
    s.line = [];
    for (const def of STATIONS) s.levels[def.id] = { speed: 15, purity: 15 };
    const before = JSON.stringify(s);
    const first = planLine(s);
    expect(planLine(s)).toBe(first);
    expect(first).toHaveLength(6);
    expect(JSON.stringify(s)).toBe(before);
    expect(assembleLine(s)).toBe(true);
    expect(assembleLine(s)).toBe(false);
    expect(s.line).toEqual(first);
  });

  it('keeps the player guidance aligned with the recipe it is building for', () => {
    const s = automatic();
    expect(sortingAdvice(s)).toContain(`«${lineRecipe(s.sorting)!.name}»`);
    s.scripts.lineOn = false;
    expect(sortingAdvice(s)).not.toContain('Наладчик подбирает');
  });

  it('reserves recipe ingredients instead of buying levels that prevent the unlock', () => {
    const s = automatic();
    s.sorting.fractions.paper = D(119);
    expect(lineRecipe(s.sorting)?.id).toBe('i1');
    autoLine(s);
    autoLine(s);
    expect(s.sorting.fractions.paper.eq(119)).toBe(true);
    s.sorting.fractions.paper = D(120);
    expect(autoLine(s)).toBe('Лупа');
    expect(s.sorting.recipes).toContain('i1');
  });

  it('rebuilds after a new slot opens without a manual placement', () => {
    const s = automatic();
    s.sorting.line = ['blower', null];
    s.sorting.fractions.plastic = D(150);
    expect(autoLine(s)).toBe('Третий слот');
    expect(autoLine(s)).toBe('лента: автосборка');
    expect(s.sorting.line).toHaveLength(3);
    expect(s.sorting.line).not.toContain(null);
  });

  it('can unlock the entire recipe tree using only the fractions its own layout collects', () => {
    const s = automatic();
    s.sorting.line = [null, null];
    let steps = 0;
    while (s.sorting.recipes.length < RECIPES.length && steps++ < 20000) {
      autoLine(s);
      const result = runLine(s.sorting.line, s.sorting.levels);
      for (const f of FRACS) s.sorting.fractions[f] = s.sorting.fractions[f].add(result.caught[f] * 100);
    }
    expect(s.sorting.recipes).toHaveLength(RECIPES.length);
    autoLine(s);
    expect(s.sorting.line).toHaveLength(6);
    expect(s.sorting.line).not.toContain(null);
  });

  it('preserves a full manual layout and obeys the main fitter switch', () => {
    const s = automatic();
    s.sorting.line = ['magnet', 'optic'];
    s.scripts.lineBuild = false;
    autoLine(s);
    expect(s.sorting.line).toEqual(['magnet', 'optic']);
    s.sorting.line = ['magnet', null];
    autoLine(s);
    expect(s.sorting.line).toEqual(['magnet', null]);
    s.sorting.line = ['magnet', 'optic'];
    s.scripts.lineBuild = true;
    s.scripts.lineOn = false;
    runScripts(s, 10);
    expect(s.sorting.line).toEqual(['magnet', 'optic']);
  });

  it('constructs and progresses the line offline without any manual station choices', () => {
    const s = automatic();
    s.sorting.line = [null, null];
    s.owned.collector = 1e8;
    simulateOffline(s, 4000);
    expect(s.sorting.recipes).toContain('i1');
    expect(s.sorting.recipes).toContain('l1');
    expect(s.sorting.line).not.toContain(null);
    expect(FRACS.some((f) => s.sorting.fractions[f].gt(0))).toBe(true);
  });
});

describe('v16 construction settings', () => {
  it('migrates v15 without taking over an existing manual layout', () => {
    const s = automatic();
    s.sorting.line = ['magnet', 'optic'];
    const old = JSON.parse(serialize(s));
    old.v = 15;
    delete old.scripts.lineBuild;
    const back = deserialize(JSON.stringify(old))!;
    expect(back.scripts.lineBuild).toBe(false);
    autoLine(back);
    expect(back.sorting.line).toEqual(['magnet', 'optic']);
    expect(back.bottom.scripts).toEqual(['line']);
    expect(JSON.parse(serialize(back)).v).toBe(17);
  });

  it('round-trips both modes and rejects a non-boolean enabled setting', () => {
    for (const mode of [true, false]) {
      const s = automatic();
      s.scripts.lineBuild = mode;
      expect(deserialize(serialize(s))!.scripts.lineBuild).toBe(mode);
    }
    const invalid = JSON.parse(serialize(automatic()));
    invalid.scripts.lineBuild = 'true';
    expect(deserialize(JSON.stringify(invalid))!.scripts.lineBuild).toBe(false);
  });
});
