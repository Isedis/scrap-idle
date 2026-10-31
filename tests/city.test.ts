import { describe, expect, it } from 'vitest';
import { CITY_OPEN_SORTS, DISTRICTS, REFORM_SORTS, annex, annexCost, canAnnex, cityEffects, districtById, newCity, peopleLeft, pitReady, plan, STREETS, TOWN_PEOPLE, visible } from '../src/game/city';
import { advance, autoLine, autoTree, canReform, newGame, reform, reformGainOf, resort, runScripts, scriptOwned, type GameState } from '../src/game/state';
import { deserialize, serialize } from '../src/game/save';
import { D } from '../src/game/num';

describe('town plan', () => {
  it('every district can be reached from the landfill, and neighbours are mutual', () => {
    const { neighbours } = plan();
    const seen = new Set(['dump']);
    const queue = ['dump'];
    while (queue.length) for (const n of neighbours.get(queue.shift()!)!) if (!seen.has(n)) seen.add(n), queue.push(n);
    expect(seen.size).toBe(DISTRICTS.length);
    for (const [id, list] of neighbours) for (const n of list) expect(neighbours.get(n), `${id}–${n}`).toContain(id);
  });

  it('the landfill starts in a corner, the pit sits inside the town', () => {
    expect(plan().neighbours.get('dump')!.length).toBeLessThanOrEqual(3);
    expect(plan().neighbours.get('pit')!.length).toBeGreaterThanOrEqual(5);
  });
});

describe('annexing', () => {
  it('only districts bordering the landfill, each dearer, the pit far dearer', () => {
    const c = newCity();
    c.points = D(1000);
    expect(canAnnex(c, 'zavod')).toBe(false);
    const first = annexCost(c, 'prom1');
    expect(annex(c, 'prom1')).toBe(true);
    expect(annexCost(c, 'zavod').gt(first)).toBe(true);
    expect(annex(c, 'zavod')).toBe(true);
    expect(c.points.eq(D(1000).sub(3).sub(6))).toBe(true);
    expect(annexCost(c, 'sad').toNumber()).toBe(8);
    expect(annexCost(c, 'pit').toNumber()).toBe(16);
    expect(peopleLeft(c)).toBe(TOWN_PEOPLE - districtById('prom1')!.people - districtById('zavod')!.people);
  });

  it('districts give their effects, stronger among their own kind', () => {
    const c = newCity();
    c.owned.push('zavod');
    expect(cityEffects(c).income.toNumber()).toBeCloseTo(1.5);
    // Two neighbouring streets: each is a quarter stronger.
    c.owned.push('rabo');
    expect(cityEffects(c).income.toNumber()).toBeCloseTo(1.625 * 1.625);
    c.owned.push('prom1', 'boiler1', 'school1', 'nikola');
    const fx = cityEffects(c);
    expect(fx.recycled.toNumber()).toBe(2);
    expect(fx.silencerFail).toBeCloseTo(0.35);
    expect(fx.schools).toBe(1);
    expect(fx.hearingFill).toBeCloseTo(0.7);
    c.owned.push('pit');
    expect(cityEffects(c).income.div(fx.income).toNumber()).toBeCloseTo(100);
  });

  it('the new kinds: hospitals slow the threat, depots pay offline, posts bring more hectares, the station cuts prices', () => {
    const c = newCity();
    const before = annexCost(c, 'prom1').toNumber();
    c.owned.push('hospital', 'autobase', 'post', 'station');
    const fx = cityEffects(c);
    expect(fx.threatSpeed).toBeCloseTo(0.85);
    expect(fx.offline).toBeCloseTo(1.2);
    expect(fx.hectares).toBeCloseTo(1.25);
    expect(fx.annexDiscount).toBeCloseTo(0.9);
    expect(before).toBe(3);
  });

  it('a post office brings a quarter more hectares from the reform', () => {
    const s = newGame();
    s.sorting.sorts = 10;
    s.sorting.total = D(1e6);
    const plain = reformGainOf(s).toNumber();
    s.city.owned.push('post');
    expect(reformGainOf(s).toNumber()).toBe(Math.floor(plain * 1.25));
  });

  it('fog: only the landfill and what borders it is seen', () => {
    const c = newCity();
    expect(visible(c, 'prom1')).toBe(true);
    expect(visible(c, 'zavod')).toBe(false);
    annex(Object.assign(c, { points: D(100) }), 'prom1');
    expect(visible(c, 'zavod')).toBe(true);
    expect(visible(c, 'mogil')).toBe(false);
  });

  it('the pit is the last purchase: only once every street is taken', () => {
    const c = newCity();
    c.points = D(1e9);
    c.owned.push(...DISTRICTS.filter((d) => d.type !== 'pit' && d.type !== 'dump' && d.id !== 'mira').map((d) => d.id));
    expect(STREETS).toBe(DISTRICTS.length - 2);
    expect(pitReady(c)).toBe(false);
    expect(canAnnex(c, 'pit')).toBe(false);
    expect(annex(c, 'mira')).toBe(true);
    expect(pitReady(c)).toBe(true);
    expect(annex(c, 'pit')).toBe(true);
  });
});

function readyToReform(): GameState {
  const s = newGame(0);
  s.city.open = true;
  s.sorting.open = true;
  s.sorting.sorts = REFORM_SORTS;
  s.sorting.total = D(1e5);
  s.sorting.found = ['radio', 'mug'];
  s.sorting.inspected = 40;
  s.sorting.fractions.metal = D(500);
  s.sorting.recipes = ['a1'];
  s.recycle.points = D(1e9);
  s.recycle.total = D(1e9);
  s.recycle.nodes = ['p1', 'a1', 'a2', 'a3'];
  s.scripts.bought = ['light'];
  s.trash = D(1e30);
  s.owned = { collector: 100, cart: 50 };
  s.upgrades = ['collector-1'];
  s.achievements = ['r1'];
  s.story.cases = ['eyes'];
  s.hearing.survived = 3;
  return s;
}

describe('reform', () => {
  it('the town opens for a look at five resorts; the reform waits for nine', () => {
    const s = newGame(0);
    expect(canReform(s)).toBe(false);
    s.sorting.open = true;
    s.sorting.sorts = CITY_OPEN_SORTS - 1;
    s.recycle.total = D(1e30);
    resort(s);
    expect(s.city.open).toBe(true);
    expect(canReform(s)).toBe(false);
    s.sorting.sorts = REFORM_SORTS;
    expect(canReform(s)).toBe(true);
  });

  it('burns nearly everything for hectares; achievements, finds, story and the town stay', () => {
    const s = readyToReform();
    s.city.owned.push('prom1');
    const gain = reform(s);
    expect(gain.gt(0)).toBe(true);
    expect(s.city.points.eq(gain)).toBe(true);
    expect(s.city.reforms).toBe(1);
    expect(s.trash.eq(0)).toBe(true);
    expect(s.owned).toEqual({ collector: 1 });
    expect(s.upgrades).toEqual([]);
    expect(s.recycle.points.eq(0)).toBe(true);
    expect(s.recycle.nodes).toEqual([]);
    expect(s.sorting.sorts).toBe(0);
    expect(s.sorting.recipes).toEqual([]);
    expect(s.sorting.fractions.metal.eq(0)).toBe(true);
    expect(s.scripts.bought).toEqual([]);
    expect(scriptOwned(s, 'recycle')).toBe(false);
    expect(s.sorting.found).toEqual(['radio', 'mug']);
    expect(s.sorting.inspected).toBe(40);
    expect(s.achievements).toEqual(['r1']);
    expect(s.story.cases).toEqual(['eyes']);
    expect(s.hearing.survived).toBe(3);
    expect(s.city.owned).toEqual(['dump', 'prom1']);
    expect(canReform(s)).toBe(false);
  });

  it('the town gives the comforts back: schools set up scripts, rivers start the cycle, the archive keeps fractions', () => {
    const s = readyToReform();
    s.city.owned.push('rynok', 'zaton', 'school2', 'archive');
    reform(s);
    expect(scriptOwned(s, 'producers')).toBe(true);
    expect(scriptOwned(s, 'upgrades')).toBe(true);
    expect(scriptOwned(s, 'endless')).toBe(true);
    expect(scriptOwned(s, 'recycle')).toBe(false);
    expect(s.recycle.points.gt(0)).toBe(true);
    expect(s.sorting.fractions.metal.toNumber()).toBe(50);
  });

  it('the boilers silence the plant at the door, unless the silencer fails', () => {
    const s = readyToReform();
    s.sorting.sorts = 0;
    s.city.owned.push('boiler1');
    s.hearing.phase = 'walk';
    s.hearing.walk = s.hearing.left = 1;
    s.hearing.noise = 1.6;
    // A run of attempts: most succeed, some fail.
    let ok = 0;
    for (let i = 0; i < 200; i++) {
      s.hearing.phase = 'walk';
      s.hearing.left = 0.5;
      s.hearing.noise = 1.6;
      advance(s, 1);
      if (s.hearing.auto === 'ok') {
        expect(s.hearing.noise).toBe(0);
        ok++;
      }
    }
    expect(ok).toBeGreaterThan(100);
    expect(ok).toBeLessThan(200);
  });

  it('saves round-trip; a v9 save starts with the town closed', () => {
    const s = readyToReform();
    s.city.owned.push('prom1', 'zavod');
    s.city.points = D(7);
    s.city.total = D(30);
    s.city.reforms = 2;
    const back = deserialize(serialize(s))!;
    expect(back.city).toEqual(s.city);
    const v9 = JSON.parse(serialize(s));
    v9.v = 9;
    delete v9.layers.city;
    const old = deserialize(JSON.stringify(v9))!;
    expect(old.city).toEqual(newCity());
    const broken = JSON.parse(serialize(s));
    broken.layers.city.owned = ['zavod', 'nowhere', 7];
    expect(deserialize(JSON.stringify(broken))!.city.owned).toEqual(['dump', 'zavod']);
  });

  it('three schools automate every earlier layer, switched on after a reform', () => {
    const s = readyToReform();
    s.city.owned.push('school1', 'school2', 'school3');
    reform(s);
    for (const id of ['producers', 'upgrades', 'endless', 'light', 'recycle', 'tree', 'sort', 'line'] as const) expect(scriptOwned(s, id), id).toBe(true);
    expect(s.autoRecycle.on).toBe(true);
    expect(s.scripts.sortOn).toBe(true);
  });

  it('the caretaker buys the tree cheapest first; the fitter fills the line, levels it, buys recipes', () => {
    const s = newGame(0);
    s.recycle.points = D(100);
    // The cheapest node first: «Подъёмные» for 1.
    expect(autoTree(s)).toBe('Подъёмные');
    expect(s.recycle.nodes).toContain('s1');
    s.sorting.open = true;
    s.sorting.fractions = { plastic: D(1e6), metal: D(1e6), glass: D(1e6), paper: D(1e6) };
    const first = autoLine(s);
    expect(first).not.toBeNull();
    let done = 0;
    while (autoLine(s) && done < 500) done++;
    expect(s.sorting.recipes.length).toBeGreaterThan(0);
    expect(Object.keys(s.sorting.levels).length).toBeGreaterThan(0);
  });

  it('the caretaker and fitter run as scripts once the schools set them up', () => {
    const s = newGame(0);
    s.city.owned.push('school1', 'school2');
    s.recycle.points = D(100);
    const notes = runScripts(s, 5);
    expect(notes.some((n) => n.script === 'tree')).toBe(true);
    s.scripts.treeOn = false;
    s.recycle.points = D(1e6);
    expect(runScripts(s, 5).some((n) => n.script === 'tree')).toBe(false);
  });

  it('a v10 save keeps the town and gets the new switches on', () => {
    const s = readyToReform();
    const v10 = JSON.parse(serialize(s));
    v10.v = 10;
    delete v10.scripts.treeOn;
    delete v10.scripts.lineOn;
    const back = deserialize(JSON.stringify(v10))!;
    expect(back.scripts.treeOn).toBe(true);
    expect(back.scripts.lineOn).toBe(true);
    s.scripts.treeOn = false;
    expect(deserialize(serialize(s))!.scripts.treeOn).toBe(false);
  });

  it('a church bell covers the plant: at full load it hears later', () => {
    const plain = newGame(0);
    plain.sorting.open = true;
    plain.hearing.noise = 2;
    const belled = newGame(0);
    belled.sorting.open = true;
    belled.hearing.noise = 2;
    belled.city.owned.push('nikola');
    for (let i = 0; i < 300; i++) {
      advance(plain, 1);
      advance(belled, 1);
    }
    expect(plain.hearing.phase).toBe('walk');
    expect(belled.hearing.phase).toBe('idle');
    expect(belled.hearing.meter).toBeCloseTo(0.7, 1);
  });

  it('with a school the buyers buy everything affordable at once', () => {
    const slow = newGame(0);
    slow.trash = D(1e12);
    const fast = newGame(0);
    fast.trash = D(1e12);
    fast.city.owned.push('school1');
    slow.recycle.nodes = ['a1'];
    slow.scripts.bought = ['upgrades'];
    const a = runScripts(slow, 0.016).length;
    runScripts(fast, 0.016);
    expect(a).toBeLessThanOrEqual(1);
    // In one frame, every producer bought to the most the trash allows.
    expect(fast.owned.collector).toBeGreaterThan(100);
    expect(fast.trash.lt(D(1e12).div(10))).toBe(true);
  });
});

