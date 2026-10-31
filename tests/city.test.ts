import { describe, expect, it } from 'vitest';
import { DISTRICTS, REFORM_SORTS, annex, annexCost, canAnnex, cityEffects, districtById, newCity, peopleLeft, plan, TOWN_PEOPLE } from '../src/game/city';
import { advance, canReform, newGame, reform, resort, scriptOwned, type GameState } from '../src/game/state';
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
    expect(c.points.eq(D(1000).sub(3).sub(5))).toBe(true);
    expect(annexCost(c, 'sad').toNumber()).toBe(7);
    expect(annexCost(c, 'pit').toNumber()).toBe(26);
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
    expect(fx.church).toBe(true);
    c.owned.push('pit');
    expect(cityEffects(c).income.div(fx.income).toNumber()).toBeCloseTo(100);
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
  it('needs enough resorts in one cycle; resorting that far opens the town', () => {
    const s = newGame(0);
    expect(canReform(s)).toBe(false);
    s.sorting.open = true;
    s.sorting.sorts = REFORM_SORTS - 1;
    s.recycle.total = D(1e20);
    resort(s);
    expect(s.city.open).toBe(true);
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
    expect(scriptOwned(s, 'endless')).toBe(false);
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
});
