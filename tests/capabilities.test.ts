import { describe, expect, it } from 'vitest';
import { coveredNodes, coveredRecipes, nodeSources, recipeSources } from '../src/game/capabilities';
import { NODES, canBuyNode, nodeById } from '../src/game/layers';
import { RECIPES, FRACS, alloysOpen, buyRecipe, canBuyRecipe } from '../src/game/sorting';
import { affordableLineRecipes, lineRecipe } from '../src/game/linePlanner';
import { D } from '../src/game/num';
import { autoLine, autoTree, autoRecycleDue, buyNode, descend, lightFailChance, newGame, reform, repeatsOpen, scriptOwned } from '../src/game/state';
import { deserialize, serialize } from '../src/game/save';

describe('replacement capabilities', () => {
  it('does not sell duplicate tree abilities or lock the next useful upgrade behind them', () => {
    const s = newGame();
    s.bottom.scripts = ['producers', 'recycle'];
    s.recycle.points = D(1000);
    const before = s.recycle.points;
    expect(buyNode(s, 'a1')).toBe(false);
    expect(buyNode(s, 'a3')).toBe(false);
    expect(s.recycle.points.eq(before)).toBe(true);
    expect(buyNode(s, 'a2')).toBe(true);
    expect(buyNode(s, 'a4')).toBe(false); // useful, but not affordable yet
    s.recycle.points = D(5000);
    expect(buyNode(s, 'a4')).toBe(true); // a3 is supplied by the bottom
    expect(s.recycle.nodes).toEqual(['a2', 'a4']);
  });

  it('a school replaces buying speed and dispatcher, but not a useful recycler or floodlight bonus', () => {
    const s = newGame();
    s.city.owned.push('school1');
    s.recycle.points = D(1e6);
    expect(nodeSources(s).a5).toBe('Школа города');
    for (const id of ['a1', 'a2', 'a4', 'a5']) expect(buyNode(s, id), id).toBe(false);
    expect(canBuyNode(s.recycle, nodeById('a3')!, coveredNodes(s))).toBe(true);
    s.recycle.nodes.push('t3');
    const fail = lightFailChance(s);
    expect(buyNode(s, 't4')).toBe(true);
    expect(lightFailChance(s)).toBeCloseTo(fail / 2);
  });

  it('a fully reliable installed floodlight replaces the second lamp, while partial reliability does not', () => {
    const s = newGame();
    s.recycle.nodes = ['t3'];
    s.scripts.bought = ['light'];
    s.scripts.reliability = 8;
    s.recycle.points = D(5000);
    expect(buyNode(s, 't4')).toBe(false);
    expect(s.recycle.points.eq(5000)).toBe(true);
    s.scripts.reliability = 7;
    expect(buyNode(s, 't4')).toBe(true);
  });

  it('replacement nodes count for completion, and the caretaker buys real upgrades', () => {
    const s = newGame();
    s.city.owned.push('school1', 'school2');
    const covered = coveredNodes(s);
    s.recycle.nodes = NODES.filter((n) => !covered.includes(n.id)).map((n) => n.id);
    s.recycle.points = D(1e6);
    s.scripts.reliability = 8;
    expect(repeatsOpen(s)).toBe(true);
    expect(autoTree(s)).toBe('Память кучи');
    expect(s.recycle.repeats.memory).toBe(1);
    expect(s.recycle.nodes.some((id) => covered.includes(id))).toBe(false);
  });

  it('the fitter skips supplied auto-sorting and opens alloys without buying the duplicate', () => {
    const s = newGame();
    s.bottom.scripts = ['sort'];
    const so = s.sorting;
    so.open = true;
    so.recipes = RECIPES.filter((r) => r.id !== 'a1').map((r) => r.id);
    for (const f of FRACS) so.fractions[f] = D(1e6);
    const covered = coveredRecipes(s);
    expect(recipeSources(s).a1).toBe('Постоянный скрипт дна');
    expect(canBuyRecipe(so, RECIPES.find((r) => r.id === 'a1')!, covered)).toBe(false);
    expect(buyRecipe(so, 'a1', covered)).toBe(false);
    expect(so.fractions.paper.eq(1e6)).toBe(true);
    expect(lineRecipe(so, covered)).toBeUndefined();
    expect(affordableLineRecipes(so, covered)).toEqual([]);
    expect(alloysOpen(so, covered)).toBe(true);
    s.scripts.lineBuild = false;
    so.line = [];
    expect(autoLine(s)).toBe('сплав 1');
    expect(so.alloys).toBe(1);
    expect(so.fractions.paper.eq(9e5)).toBe(true);
  });

  it('city grants disappear on descent, while bottom rights remain', () => {
    const s = newGame();
    s.city.owned.push('school1', 'school2', 'school3', 'pit');
    s.bottom.scripts = ['producers'];
    expect(coveredRecipes(s)).toEqual(['a1']);
    expect(descend(s)).toBe(true);
    expect(coveredRecipes(s)).toEqual([]);
    expect(coveredNodes(s)).toEqual(['a1']);
    expect(scriptOwned(s, 'recycle')).toBe(false);
    expect(buyNode(s, 'a1')).toBe(false);
  });
});

describe('reset preferences', () => {
  it('remembers an enabled recycler while unavailable, then resumes when its right returns', () => {
    const s = newGame();
    s.city.owned.push('pit');
    s.autoRecycle = { on: true, factor: 0.05 };
    expect(descend(s)).toBe(true);
    s.runTrash = D('1e16');
    expect(s.autoRecycle.on).toBe(true);
    expect(autoRecycleDue(s)).toBe(false);
    s.bottom.scripts.push('recycle');
    expect(autoRecycleDue(s)).toBe(true);
  });
  for (const kind of ['reform', 'descent'] as const) it(`${kind} retains operator settings without retaining purchased script progress`, () => {
    const s = newGame();
    s.city.open = true;
    s.city.owned.push('school1', 'school2', 'school3', 'pit');
    s.sorting.sorts = 9;
    s.autoRecycle = { on: false, factor: 0.25 };
    Object.assign(s.scripts, { recycleMode: 'time', recycleMinutes: 15, sortOn: false, sortMode: 'time', sortMinutes: 30,
      treeOn: false, lineOn: false, lineBuild: false, lightOn: false, producerMode: 'ten',
      producerOff: ['cart'], bought: ['upgrades'], speed: 4, reliability: 5 });
    if (kind === 'reform') expect(reform(s).gt(0)).toBe(true);
    else expect(descend(s)).toBe(true);
    const back = deserialize(serialize(s))!;
    expect(back.autoRecycle).toEqual({ on: false, factor: 0.25 });
    expect(back.scripts).toMatchObject({ recycleMode: 'time', recycleMinutes: 15, sortOn: false, sortMode: 'time', sortMinutes: 30,
      treeOn: false, lineOn: false, lineBuild: false, lightOn: false, producerMode: 'ten',
      producerOff: ['cart'], bought: [], speed: 0, reliability: 0 });
  });
});
