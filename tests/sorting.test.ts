import { describe, expect, it } from 'vitest';
import { advance, autoSortDue, canResort, newGame, producerRate, resort, resortGain, scriptOwned, type GameState } from '../src/game/state';
import {
  FRACS,
  RECIPES,
  SORT_AT,
  STREAM,
  TAILS_THREAT,
  UNIQUES,
  UNKNOWN_EVERY,
  buyAlloy,
  buyLevel,
  buyRecipe,
  capture,
  impurity,
  inspectOne,
  fractionsIncome,
  lumpFor,
  moveStation,
  newSorting,
  placeStation,
  runLine,
  slotCount,
  sortNeed,
  sortingIncome,
  sortingTick,
  threatSpeed,
  type Frac,
} from '../src/game/sorting';
import { NODES } from '../src/game/layers';
import { deserialize, serialize } from '../src/game/save';
import { D } from '../src/game/num';

const rich = (n: number) => ({ plastic: D(n), metal: D(n), glass: D(n), paper: D(n) });
const zero = { plastic: D(0), metal: D(0), glass: D(0), paper: D(0) } as Record<Frac, ReturnType<typeof D>>;

/** A player with the whole Recycling tree, ready to resort. */
const ready = (): GameState => {
  const s = newGame(0);
  s.recycle.nodes = NODES.map((n) => n.id);
  s.recycle.points = D(500);
  s.recycle.total = SORT_AT.mul(4);
  s.recycle.resets = 30;
  s.recycle.repeats = { memory: 6, recipe: 3 };
  s.scripts.bought = ['upgrades', 'endless', 'light'];
  s.scripts.speed = 4;
  s.sorting.open = true;
  return s;
};

describe('sorting line', () => {
  it('a station catches its share and spoils a little of the rest', () => {
    const r = runLine(['optic'], {});
    expect(r.caught.plastic).toBeCloseTo(STREAM.plastic * capture(0));
    expect(r.slots[0].spoiled).toBeCloseTo((STREAM.paper + STREAM.metal + STREAM.glass) * impurity(0));
    expect(r.tails).toBeLessThan(1);
    expect(runLine([], {}).tails).toBe(1);
  });

  it('order matters: the first station gets the most, and its dirt costs the ones after it', () => {
    const opticFirst = runLine(['optic', 'magnet'], {});
    const magnetFirst = runLine(['magnet', 'optic'], {});
    expect(opticFirst.caught.plastic).toBeGreaterThan(magnetFirst.caught.plastic);
    expect(magnetFirst.caught.metal).toBeGreaterThan(opticFirst.caught.metal);
    // A clean first station costs the next one less.
    const clean = runLine(['magnet', 'optic'], { magnet: { speed: 0, purity: 10 } });
    expect(clean.caught.plastic).toBeGreaterThan(magnetFirst.caught.plastic);
  });

  it('the briquetter presses only what was caught before it', () => {
    const before = runLine(['optic', 'briquetter'], {}).caught.plastic;
    const after = runLine(['briquetter', 'optic'], {}).caught.plastic;
    expect(before).toBeCloseTo(after * 1.5);
  });

  it('the crusher cuts the tails, and starves the stations after it', () => {
    const plain = runLine(['optic'], {});
    const crushed = runLine(['optic', 'crusher'], {});
    expect(crushed.tails).toBeCloseTo(plain.tails / 2);
    expect(runLine(['crusher', 'optic'], {}).caught.plastic).toBeLessThan(plain.caught.plastic);
  });

  it('tails make the thing climb faster once the line is open', () => {
    const s = newSorting();
    expect(threatSpeed(s)).toBe(1);
    s.open = true;
    s.line = [null, null];
    expect(threatSpeed(s)).toBeCloseTo(1 + TAILS_THREAT);
    s.line = ['optic', 'blower'];
    expect(threatSpeed(s)).toBeLessThan(1 + TAILS_THREAT);
  });

  it('stations move, swap and only stand in open slots', () => {
    const s = newSorting();
    expect(slotCount(s)).toBe(2);
    expect(placeStation(s, 2, 'magnet')).toBe(false);
    expect(placeStation(s, 0, 'blower')).toBe(true);
    expect(s.line).toEqual(['blower', 'optic']);
    expect(moveStation(s, 0, 1)).toBe(true);
    expect(s.line).toEqual(['optic', 'blower']);
    expect(moveStation(s, 1, 1)).toBe(false);
    expect(placeStation(s, 1, 'briquetter')).toBe(false);
    s.recipes = ['l1', 'l2'];
    expect(placeStation(s, 2, 'briquetter')).toBe(true);
    expect(s.line).toEqual(['optic', 'blower', 'briquetter']);
  });

  it('levels are paid in the station\'s own fraction', () => {
    const s = newSorting();
    s.fractions = { ...zero, plastic: D(100) };
    expect(buyLevel(s, 'magnet', 'speed')).toBe(false);
    expect(buyLevel(s, 'optic', 'speed')).toBe(true);
    expect(s.levels.optic).toEqual({ speed: 1, purity: 0 });
    expect(s.fractions.plastic.toNumber()).toBe(90);
  });

  it('runs on its own and fills the fractions', () => {
    const s = ready();
    s.trash = D(0);
    s.owned = { collector: 50 };
    advance(s, 60);
    expect(s.sorting.fractions.plastic.gt(0)).toBe(true);
    expect(s.sorting.fractions.paper.gt(0)).toBe(true);
    expect(s.sorting.fractions.metal.toNumber()).toBe(0);
  });

  it('opens once Recycling earns enough in a cycle', () => {
    const s = newGame(0);
    advance(s, 1);
    expect(s.sorting.open).toBe(false);
    s.recycle.total = SORT_AT;
    advance(s, 1);
    expect(s.sorting.open).toBe(true);
  });
});

describe('inspection table', () => {
  it('items arrive, wait and fall back into the heap when the table is full', () => {
    const s = newSorting();
    s.open = true;
    s.progress = -1e9; // nothing gets looked at
    const pushed = sortingTick(s, D(1e20), UNKNOWN_EVERY * 5, false);
    expect(s.queue).toBe(3);
    expect(pushed).toBeCloseTo(0.04);
  });

  it('finds unique waste first, then every third item, in order', () => {
    const s = newSorting();
    const kinds = Array.from({ length: 9 }, () => inspectOne(s, rich(1), false).kind);
    expect(kinds).toEqual(['unique', 'fractions', 'unique', 'fractions', 'fractions', 'unique', 'fractions', 'anomaly', 'unique']);
    expect(s.found).toEqual(UNIQUES.slice(0, 4).map((u) => u.id));
  });

  it('no anomalies while away', () => {
    const s = newSorting();
    s.inspected = 7;
    expect(inspectOne(s, rich(1), true).kind).toBe('fractions');
  });

  it('a bale goes to the fraction the line takes least of', () => {
    const s = newSorting();
    s.inspected = 1;
    const r = inspectOne(s, { plastic: D(5), metal: D(0), glass: D(2), paper: D(1) }, false);
    expect(r).toMatchObject({ kind: 'fractions', frac: 'metal' });
    expect(s.fractions.metal.toNumber()).toBe(480);
  });

  it('an anomaly pushes the threat, but not over the edge', () => {
    const s = ready();
    s.threat.level = 0.9;
    s.sorting.queue = 1;
    s.sorting.inspected = 7;
    s.sorting.progress = 0.999;
    advance(s, 1);
    expect(s.threat.level).toBeCloseTo(0.95, 2);
    expect(s.sorting.news.some((n) => n.kind === 'anomaly')).toBe(true);
  });

  it('finds work: queue, speed, threat', () => {
    const s = newSorting();
    s.open = true;
    s.line = [null, null];
    const before = threatSpeed(s);
    s.found = ['lantern', 'tooth'];
    expect(threatSpeed(s)).toBeCloseTo(before * 0.95);
  });
});

describe('resorting', () => {
  it('each resort needs ten times more than the last', () => {
    const s = ready();
    resort(s);
    s.recycle.total = SORT_AT.mul(9);
    expect(canResort(s)).toBe(false);
    s.recycle.total = SORT_AT.mul(10);
    expect(canResort(s)).toBe(true);
    expect(sortNeed(3).toNumber()).toBe(1e8);
  });

  it('needs the line open and enough Recycled material this cycle', () => {
    const s = newGame(0);
    s.recycle.total = SORT_AT.mul(10);
    expect(canResort(s)).toBe(false);
    s.sorting.open = true;
    expect(canResort(s)).toBe(true);
    expect(lumpFor(SORT_AT).toNumber()).toBe(100);
    expect(lumpFor(SORT_AT.mul(100)).toNumber()).toBe(1000);
  });

  it('burns all of Recycling, scripts included, on the first resort keeps automation', () => {
    const s = ready();
    const gain = resort(s);
    expect(gain.toNumber()).toBe(200);
    expect(s.sorting.sorts).toBe(1);
    expect(s.recycle.points.toNumber()).toBe(0);
    expect(s.recycle.total.toNumber()).toBe(0);
    expect(s.recycle.resets).toBe(30);
    expect(s.recycle.repeats).toEqual({});
    expect([...s.recycle.nodes].sort()).toEqual(['a1', 'a2', 'a3']);
    expect(s.scripts.bought).toEqual(['upgrades', 'endless', 'light']);
    expect(s.scripts.speed).toBe(0);
    expect(s.runTrash.toNumber()).toBe(0);
    // Split by what the line catches: optic and blower take plastic and paper only.
    expect(s.sorting.fractions.plastic.gt(s.sorting.fractions.paper)).toBe(true);
    expect(s.sorting.fractions.metal.toNumber()).toBe(0);
  });

  it('ranks give more back the more resorts there were', () => {
    const s = ready();
    s.sorting.sorts = 14;
    s.recycle.total = sortNeed(14);
    resort(s);
    const branches = new Set(s.recycle.nodes.map((id) => NODES.find((n) => n.id === id)!.branch));
    expect(branches).toEqual(new Set(['automation', 'start', 'offline', 'production']));
    expect(s.recycle.repeats).toEqual({ memory: 3, recipe: 1 });
    expect(s.scripts.speed).toBe(4);
    expect(s.recycle.total.toNumber()).toBe(1e18);
    expect(s.recycle.points.eq(s.recycle.total.add(100))).toBe(true);
  });

  it('every fraction ever earned raises income, spent or not', () => {
    expect(fractionsIncome(D(0)).toNumber()).toBe(1);
    expect(fractionsIncome(D(100)).toNumber()).toBe(2);
    expect(fractionsIncome(D(1e4)).toNumber()).toBe(11);
  });

  it('every resort doubles income', () => {
    const s = ready();
    s.owned = { collector: 10 };
    const before = producerRate(s, 'collector');
    s.sorting.sorts = 1;
    expect(producerRate(s, 'collector').div(before).toNumber()).toBeCloseTo(2);
    expect(sortingIncome({ ...newSorting(), sorts: 20 }).toNumber() / (2 ** 20 * 3)).toBeCloseTo(1);
  });

  it('the auto-sorter waits for its share or its time', () => {
    const s = ready();
    s.sorting.recipes = ['a1'];
    expect(scriptOwned(s, 'sort')).toBe(true);
    expect(autoSortDue(s)).toBe(false);
    s.scripts.sortOn = true;
    s.sorting.total = D(1000);
    s.scripts.sortShare = 0.25;
    expect(resortGain(s).toNumber()).toBe(200);
    expect(autoSortDue(s)).toBe(false);
    s.scripts.sortShare = 0.1;
    expect(autoSortDue(s)).toBe(true);
    s.scripts.sortMode = 'time';
    s.scripts.sortMinutes = 10;
    expect(autoSortDue(s)).toBe(false);
    s.sorting.cycleSeconds = 600;
    expect(autoSortDue(s)).toBe(true);
  });
});

describe('recipes', () => {
  it('follow their chain and take the price', () => {
    const s = newSorting();
    s.fractions = rich(1e9);
    expect(buyRecipe(s, 'l2')).toBe(false);
    expect(buyRecipe(s, 'l1')).toBe(true);
    expect(slotCount(s)).toBe(3);
    expect(buyRecipe(s, 'l1')).toBe(false);
    expect(s.fractions.metal.toNumber()).toBe(1e9 - 150);
  });

  it('alloys open after the whole tree and grow the flow', () => {
    const s = newSorting();
    s.fractions = rich(1e9);
    expect(buyAlloy(s)).toBe(false);
    s.recipes = RECIPES.map((r) => r.id);
    expect(buyAlloy(s)).toBe(true);
    expect(s.alloys).toBe(1);
  });
});

describe('save v8', () => {
  it('keeps the whole sorting layer under layers.sorting', () => {
    const s = ready();
    resort(s);
    s.sorting.line = ['magnet', 'optic', null];
    s.sorting.levels = { magnet: { speed: 3, purity: 1 } };
    s.sorting.recipes = ['l1', 'i1'];
    s.sorting.found = ['lantern', 'boot'];
    s.sorting.queue = 2;
    s.sorting.inspected = 5;
    const text = serialize(s);
    expect(JSON.parse(text).layers.sorting.sorts).toBe(1);
    const back = deserialize(text)!;
    expect({ ...back.sorting, news: [] }).toEqual({ ...s.sorting, news: [] });
  });

  it('a v7 save gets a closed sorting layer', () => {
    const data = JSON.parse(serialize(newGame(0)));
    data.v = 7;
    delete data.layers.sorting;
    const back = deserialize(JSON.stringify(data))!;
    expect(back.sorting).toEqual(newSorting());
  });

  it('drops broken sorting data', () => {
    const data = JSON.parse(serialize(ready()));
    data.layers.sorting = { ...data.layers.sorting, line: ['optic', 'optic', 'zz', 'magnet'], recipes: ['l1', 'x'], found: ['boot', '?'], progress: 7 };
    const back = deserialize(JSON.stringify(data))!;
    expect(back.sorting.line).toEqual(['optic', null, null, 'magnet']);
    expect(back.sorting.recipes).toEqual(['l1']);
    expect(back.sorting.found).toEqual(['boot']);
    expect(back.sorting.progress).toBe(1);
    data.layers.sorting.fractions.metal = 'garbage';
    expect(deserialize(JSON.stringify(data))).toBeNull();
  });

  it('fractions stay Decimals', () => {
    const back = deserialize(serialize(ready()))!;
    for (const f of FRACS) expect(back.sorting.fractions[f].gte(0)).toBe(true);
  });
});
