import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { D } from '../src/game/num';
import {
  DISTRICTS, annex, annexCost, canAnnex, canDevelop, cityEffects, cityPitRoutes, developCity,
  developmentCost, developmentIncome, newCity, pitReady, plan,
} from '../src/game/city';
import { descend, newGame, recycle, reform, resort } from '../src/game/state';
import { deserialize, serialize } from '../src/game/save';

function established() {
  const c = newCity();
  c.open = true;
  c.owned.push('prom1', 'zavod', 'rabo');
  c.points = c.total = D(1000);
  return c;
}

describe('permanent city development', () => {
  it('requires an open city and three annexed districts; rejects unaffordable purchases atomically', () => {
    const c = established();
    c.open = false;
    expect(developCity(c)).toBe(false);
    c.open = true;
    c.owned.pop();
    expect(developCity(c)).toBe(false);
    c.owned.push('rabo');
    c.points = D(24.99);
    expect(canDevelop(c)).toBe(false);
    expect(developCity(c)).toBe(false);
    expect(c.points.eq(24.99)).toBe(true);
    expect(c.development).toBe(0);
    c.points = D(25);
    expect(developCity(c)).toBe(true);
    expect(c.points.eq(0)).toBe(true);
    expect(c.development).toBe(1);
    expect(developmentCost(c).eq(43)).toBe(true);
  });

  it('invalidates cached income immediately and leaves annexation prices and services unchanged', () => {
    const c = established();
    c.owned.push('school1', 'boiler1', 'boiler2');
    const before = cityEffects(c);
    const price = annexCost(c, 'sad');
    expect(developCity(c)).toBe(true);
    const after = cityEffects(c);
    expect(after.income.div(before.income).toNumber()).toBeCloseTo(1.1);
    expect(after.schools).toBe(before.schools);
    expect(after.silencerFail).toBe(0);
    expect(after.hectares).toBe(before.hectares);
    expect(annexCost(c, 'sad').eq(price)).toBe(true);
    expect(c.total.eq(1000)).toBe(true);
  });

  it('continues beyond every illustrated stage and handles prices as Decimal', () => {
    const c = established();
    c.points = c.total = D('1e200');
    let previous = D(0);
    for (let n = 0; n < 128; n++) {
      expect(developmentCost(c).gt(previous)).toBe(true);
      previous = developmentCost(c);
      expect(developCity(c)).toBe(true);
    }
    expect(c.development).toBe(128);
    expect(developmentCost(c).gt('1e20')).toBe(true);
    expect(developmentIncome(c).toNumber()).toBeCloseTo(1.1 ** 128, 3);
  });

  it('retains development through each reset while the descent still resets territorial control', () => {
    const s = newGame(0);
    s.city.open = true;
    s.city.owned = DISTRICTS.map((d) => d.id);
    s.city.development = 8;
    s.runTrash = D('1e20');
    expect(recycle(s).gt(0)).toBe(true);
    expect(s.city.development).toBe(8);
    s.sorting.open = true;
    s.recycle.total = D('1e8');
    expect(resort(s).gt(0)).toBe(true);
    expect(s.city.development).toBe(8);
    s.sorting.sorts = 7;
    expect(reform(s).gt(0)).toBe(true);
    expect(s.city.development).toBe(8);
    expect(pitReady(s.city)).toBe(true);
    expect(descend(s)).toBe(true);
    expect(s.city.owned).toEqual(['dump']);
    expect(s.city.open).toBe(false);
    expect(s.city.points.eq(0)).toBe(true);
    expect(s.city.development).toBe(8);
    expect(cityEffects(s.city).income.eq(developmentIncome(s.city))).toBe(true);
    expect(developCity(s.city)).toBe(false);
  });

  it('lets the late-city fixture develop eight times and still finish annexation and descend', () => {
    const s = deserialize(readFileSync('tests/fixtures/city-late.json', 'utf8'))!;
    for (let i = 0; i < 8; i++) expect(developCity(s.city)).toBe(true);
    let next;
    while ((next = DISTRICTS.find((d) => canAnnex(s.city, d.id)))) expect(annex(s.city, next.id)).toBe(true);
    expect(s.city.owned).toContain('pit');
    expect(descend(s)).toBe(true);
    expect(s.city.development).toBe(8);
    expect(cityEffects(s.city).income.toNumber()).toBeCloseTo(1.1 ** 8);
  });

  it('keeps the old pit requirement independent from the optional upgrade', () => {
    const c = newCity();
    c.owned = DISTRICTS.filter((d) => d.type !== 'pit').map((d) => d.id);
    expect(c.development).toBe(0);
    expect(pitReady(c)).toBe(true);
  });
});

describe('district flows into the pit', () => {
  it('routes every annexed district to the pit with no loops or impossible jumps', () => {
    const owned = DISTRICTS.filter((d) => d.type !== 'pit').map((d) => d.id);
    const routes = cityPitRoutes(owned);
    expect(routes).toHaveLength(owned.length);
    const outgoing = new Map(routes.map((r) => [r.from, r.to]));
    for (const route of routes) {
      expect(plan().neighbours.get(route.from)).toContain(route.to);
      const seen = new Set<string>();
      let cursor = route.from;
      while (cursor !== 'pit') {
        expect(seen.has(cursor)).toBe(false);
        seen.add(cursor);
        cursor = outgoing.get(cursor)!;
        expect(cursor).toBeDefined();
      }
    }
    expect(routes.filter((r) => r.to === 'pit').reduce((sum, r) => sum + r.load, 0)).toBe(owned.length);
  });

  it('does not send conveyors through districts that have not been annexed', () => {
    expect(cityPitRoutes(['dump'])).toEqual([]);
    const owned = ['dump', ...(plan().neighbours.get('pit') ?? []).slice(0, 2)];
    const routes = cityPitRoutes(owned);
    for (const {from, to} of routes) {
      expect(owned).toContain(from);
      expect(to === 'pit' || owned.includes(to)).toBe(true);
    }
  });
});

describe('v18 migration and city development saves', () => {
  it('migrates v17 with no free levels or changes to existing territory and hectares', () => {
    const s = newGame(0); s.city = established();
    const old = JSON.parse(serialize(s));
    old.v = 17; delete old.layers.city.development;
    const back = deserialize(JSON.stringify(old))!;
    expect(back.city.development).toBe(0);
    expect(back.city.owned).toEqual(s.city.owned);
    expect(back.city.points.eq(s.city.points)).toBe(true);
    expect(JSON.parse(serialize(back)).v).toBe(20);
  });

  it('round-trips a developed city and normalises invalid levels', () => {
    const s = newGame(0); s.city = established(); s.city.development = 33;
    expect(deserialize(serialize(s))!.city.development).toBe(33);
    const data = JSON.parse(serialize(s));
    for (const [input, expected] of [[-4,0], ['32',0], [null,0], [2.9,2]] as const) {
      data.layers.city.development = input;
      expect(deserialize(JSON.stringify(data))!.city.development).toBe(expected);
    }
  });
});
