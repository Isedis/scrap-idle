import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { D } from '../src/game/num';
import { DISTRICTS, annex, annexCost, canAnnex, cityEffects, cityPitRoutes, syncDevelopment,
  developmentThreshold, developmentIncome, newCity, pitReady, plan } from '../src/game/city';
import { descend, newGame, recycle, reform, resort } from '../src/game/state';
import { deserialize, serialize } from '../src/game/save';

describe('automatic permanent city development', () => {
  it('earns levels at lifetime thresholds without spending available hectares', () => {
    const c=newCity();c.points=D(17);c.total=D(24.99);syncDevelopment(c);
    expect(c.development).toBe(0);c.total=D(25);syncDevelopment(c);
    expect(c.development).toBe(1);expect(c.points.eq(17)).toBe(true);
    c.total=developmentThreshold(9);syncDevelopment(c);expect(c.development).toBe(9);
    syncDevelopment(c);expect(c.development).toBe(9);
    const almost=newCity();almost.total=developmentThreshold(9).sub(.000001);syncDevelopment(almost);
    expect(almost.development).toBe(8);
  });
  it('keeps spent hectares counted and does not change prices or district services', () => {
    const c=newCity();c.open=true;c.owned.push('school1','boiler1','boiler2');c.points=D(1000);
    const before=cityEffects(c),price=annexCost(c,'sad');
    c.total=D(25);syncDevelopment(c);const after=cityEffects(c);
    expect(after.income.div(before.income).toNumber()).toBeCloseTo(1.1);
    expect(after.schools).toBe(before.schools);expect(after.silencerFail).toBe(0);
    expect(after.hectares).toBe(before.hectares);expect(annexCost(c,'sad').eq(price)).toBe(true);
    c.points=D(0);syncDevelopment(c);expect(c.development).toBe(1);expect(c.total.eq(25)).toBe(true);
  });
  it('grows beyond illustrated stages in constant time with large Decimal earnings', () => {
    const c=newCity();c.total=D('1e200');syncDevelopment(c);
    expect(c.development).toBeGreaterThan(1000);
    expect(developmentThreshold(c.development).lte(c.total)).toBe(true);
    expect(developmentThreshold(c.development+1).gt(c.total)).toBe(true);
  });
  it('preserves the lifetime counter through every reset and earns levels on reform', () => {
    const s=newGame(0);s.city.open=true;s.city.owned=DISTRICTS.map(d=>d.id);
    s.city.total=D(24);s.city.points=D(0);s.runTrash=D('1e20');
    recycle(s);expect(s.city.total.eq(24)).toBe(true);
    s.sorting.open=true;s.recycle.total=D('1e8');resort(s);expect(s.city.total.eq(24)).toBe(true);
    s.sorting.sorts=7;expect(reform(s).gt(0)).toBe(true);expect(s.city.development).toBeGreaterThan(0);
    const total=s.city.total,level=s.city.development;
    expect(descend(s)).toBe(true);expect(s.city.total.eq(total)).toBe(true);
    expect(s.city.development).toBe(level);expect(s.city.points.eq(0)).toBe(true);
    expect(deserialize(serialize(s))!.city.total.eq(total)).toBe(true);
  });
  it('leaves the late-city fixture able to buy territory and descend', () => {
    const s=deserialize(readFileSync('tests/fixtures/city-late.json','utf8'))!;
    const points=s.city.points;syncDevelopment(s.city);expect(s.city.points.eq(points)).toBe(true);
    let next;while((next=DISTRICTS.find(d=>canAnnex(s.city,d.id))))expect(annex(s.city,next.id)).toBe(true);
    expect(s.city.owned).toContain('pit');const level=s.city.development;
    expect(descend(s)).toBe(true);expect(s.city.development).toBe(level);
    expect(cityEffects(s.city).income.eq(developmentIncome(s.city).mul(100))).toBe(true);
  });
  it('does not make development a requirement for opening the pit', () => {
    const c=newCity();c.owned=DISTRICTS.filter(d=>d.type!=='pit').map(d=>d.id);
    expect(c.development).toBe(0);expect(pitReady(c)).toBe(true);
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


describe('v23 lifetime migration', () => {
  it('preserves bought levels and unspent balance, using proven spending only once', () => {
    const s=newGame(0);const raw=JSON.parse(serialize(s));raw.v=22;
    raw.layers.city.development=12;raw.layers.city.total='0';raw.layers.city.points='17';
    const back=deserialize(JSON.stringify(raw))!;
    expect(back.city.development).toBeGreaterThanOrEqual(12);
    expect(back.city.total.gt(10000)).toBe(true);expect(back.city.points.eq(17)).toBe(true);
    const again=deserialize(serialize(back))!;
    expect(again.city.total.eq(back.city.total)).toBe(true);
    expect(again.city.development).toBe(back.city.development);
    expect(JSON.parse(serialize(again)).v).toBe(29);
  });
  it('uses recorded lifetime hectares for saves predating purchased development', () => {
    const raw=JSON.parse(serialize(newGame(0)));raw.v=17;delete raw.layers.city.development;
    raw.layers.city.total='1000';raw.layers.city.points='5';
    const back=deserialize(JSON.stringify(raw))!;expect(back.city.development).toBeGreaterThan(0);
    expect(back.city.total.eq(1000)).toBe(true);expect(back.city.points.eq(5)).toBe(true);
  });
});
