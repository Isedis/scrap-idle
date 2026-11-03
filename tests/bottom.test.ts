import { describe, expect, it } from 'vitest';
import {
  EPOCHS,
  ITEMS,
  MELT,
  RARITIES,
  START_HEAP,
  startHeap,
  autoOpen,
  CONTAINERS,
  containerOdds,
  DIG_SCRAP,
  DIG_NONFERROUS,
  savingGoal,
  buySavingGoal,
  EQUIPMENT,
  buyEquipment,
  buyBorer,
  borerCost,
  depthTarget,
  digRate,
  findMultiplier,
  bottomTick,
  buyAuto,
  buyTool,
  canOpen,
  melt,
  newBottom,
  openOne,
  umeOpen,
} from '../src/game/bottom';
import { D } from '../src/game/num';

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('the bottom of the pit', () => {
  it('forty finds, ten per epoch, every rarity in every epoch', () => {
    expect(ITEMS).toHaveLength(40);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(40);
    for (const e of EPOCHS) for (const r of RARITIES) expect(ITEMS.some((i) => i.epoch === e.id && i.rarity === r), `${e.id} ${r}`).toBe(true);
  });

  it('excavates old strata even with no incoming surface waste', () => {
    const b = newBottom();
    b.open = true;
    expect(bottomTick(b, 61, 0, () => 0)).toBe(2);
    expect(b.heap).toBe(0);
    expect(b.stock.sack).toBe(2);
    expect(b.dug).toBeGreaterThan(2);
    expect(b.money.dust.eq(0)).toBe(true);
    expect(START_HEAP).toBeGreaterThan(0);
  });

  it('uses pre-descent production for the one-time starting heap', () => {
    expect(startHeap(D(0))).toBe(300);
    expect(startHeap(D('1e40'))).toBe(500);
    expect(startHeap(D('1e200'))).toBe(800);
  });

  it('digs a side object for ordinary materials without advancing depth', () => {
    const b = newBottom();
    b.open = true; b.dug = 1000;
    bottomTick(b, 600, 0, () => 0);
    expect(b.dug).toBe(1000);
    expect(b.objectWork.hoist).toBeGreaterThan(17);
    expect(b.money.scrap.toNumber()).toBeCloseTo(b.objectWork.hoist * 0.5);
    expect(b.stock.sack).toBe(Math.floor(b.objectWork.hoist));
  });

  it('grants the first UME exactly once at real depth 11000', () => {
    const b = newBottom();
    b.open = true; b.dug = 10999;
    b.route = 'depth';
    bottomTick(b, 120, 0, () => 0);
    expect(b.dug).toBeGreaterThan(11000);
    expect(b.ume.toNumber()).toBe(1);
    expect(b.firstUmeGranted).toBe(true);
    bottomTick(b, 120, 0, () => 0);
    expect(b.ume.toNumber()).toBe(1);
  });

  it('makes the seam a guaranteed source of anomalies after starting the borer', () => {
    const b = newBottom();
    b.open = true; b.dug = 11000; b.equipment.borer = 1;
    b.route = 'seam';
    bottomTick(b, 1800, 0, () => 0);
    expect(b.dug).toBe(11000);
    expect(b.money.anomaly.toNumber()).toBe(Math.floor((b.dig + b.stock.sack) / 20));
    expect(b.money.anomaly.toNumber()).toBeGreaterThan(0);
  });

  it('splits long excavation at object boundaries like short ticks do', () => {
    const a = newBottom(); const b = newBottom();
    a.open = b.open = true;
    a.dug = b.dug = 998;
    bottomTick(a, 5400, 0, () => 0);
    for (let i = 0; i < 90; i++) bottomTick(b, 60, 0, () => 0);
    expect(a.objectWork.hoist).toBe(120);
    expect(a.objectWork.hoist).toBeCloseTo(b.objectWork.hoist, 7);
    expect(a.dug).toBeCloseTo(b.dug, 6);
    expect(a.stock).toEqual(b.stock);
  });

  it('separates fresh waste recovery from excavation and never buries depth', () => {
    const a = newBottom(), b = newBottom();
    a.open = b.open = true;
    a.heap = 1;
    bottomTick(a, 60, 0, () => 0);
    bottomTick(b, 60, 60, () => 0);
    expect(b.dug).toBeGreaterThan(a.dug);
    expect(b.stock.sack).toBeGreaterThan(a.stock.sack);
    expect(a.money.dust.toNumber()).toBe(1);
    expect(b.money.dust.toNumber()).toBe(2);
    expect(b.heap).toBe(58);
    expect(b.supplied).toBe(2);
  });

  it('integrates excavation and supply consistently online and offline', () => {
    const a = newBottom(), b = newBottom();
    a.open = b.open = true;
    a.equipment = b.equipment = { hoist: true, bench: true, borer: 2 };
    a.heap = b.heap = 300;
    a.tools.pick = b.tools.pick = 12;
    bottomTick(a, 3600, 4, () => 0);
    for (let i = 0; i < 3600; i++) bottomTick(b, 1, 4, () => 0);
    expect(a.dug).toBeCloseTo(b.dug, 7);
    expect(a.dig).toBeCloseTo(b.dig, 7);
    expect(a.stock).toEqual(b.stock);
    expect(a.heap).toBeCloseTo(b.heap, 7);
    expect(a.money.scrap.toNumber()).toBeCloseTo(b.money.scrap.toNumber(), 7);
  });

  it('equipment requires depth and resources; UME permanently upgrades the borer', () => {
    const b = newBottom();
    b.open = true;
    b.money.scrap = D(40);
    expect(buyEquipment(b, 'hoist')).toBe(false);
    b.dug = EQUIPMENT[0].depth;
    b.objectWork.hoist = 120;
    const rate = digRate(b);
    expect(buyEquipment(b, 'hoist')).toBe(true);
    expect(digRate(b)).toBeCloseTo(rate * 1.25);
    expect(b.money.scrap.eq(0)).toBe(true);
    expect(buyEquipment(b, 'hoist')).toBe(false);
    b.ume = D(3);
    expect(buyBorer(b)).toBe(false);
    b.dug = 11000;
    b.objectWork.borer = 600;
    const before = digRate(b);
    expect(buyBorer(b)).toBe(true);
    expect(b.ume.toNumber()).toBe(2);
    expect(digRate(b)).toBeCloseTo(before * 1.5);
    expect(borerCost(b).toNumber()).toBe(2);
    expect(buyBorer(b)).toBe(true);
    expect(buyBorer(b)).toBe(false);
    expect(b.equipment.borer).toBe(2);
  });

  it('deep sectors continue progress without demanding complete collections', () => {
    const b = newBottom();
    b.dug = 11000;
    expect(depthTarget(b).to).toBe(22000);
    expect(findMultiplier(b)).toBe(1);
    b.dug = 22000;
    expect(depthTarget(b).to).toBe(33000);
    expect(findMultiplier(b)).toBe(1.1);
    b.stock.sack = 1;
    expect(openOne(b, 'sack', () => 0)!.amount.toNumber()).toBeCloseTo(13.2);
  });

  it('keeps the best actual automatic reward beyond the recent list, without paying twice', () => {
    const b = newBottom();
    b.auto = 2;
    b.stock.sack = 40;
    b.dry.relic = 199;
    expect(autoOpen(b, () => 0)).toBe(40);
    expect(b.autoFeed.count).toBe(40);
    expect(b.autoFeed.best!.item.rarity).toBe('relic');
    expect(b.autoFeed.best!.container).toBe('sack');
    expect(b.recent.some((o) => o.item.rarity === 'relic')).toBe(false);
    expect(b.money.relic.toNumber()).toBe(1);
    const best = b.autoFeed.best;
    b.stock.sack = 1;
    autoOpen(b, () => 0);
    expect(b.autoFeed.count).toBe(41);
    expect(b.autoFeed.best).toBe(best);
    expect(b.money.relic.toNumber()).toBe(1);
  });

  it('pays ordinary metals per excavated tonne regardless of rarity upgrades', () => {
    const a = newBottom(), b = newBottom();
    a.open = b.open = true;
    b.tools.lamp = b.tools.luck = 15;
    bottomTick(a, 600, 0, () => 0);
    bottomTick(b, 600, 0, () => 0);
    expect(a.money.scrap.toNumber()).toBeCloseTo(a.dug * DIG_SCRAP);
    expect(a.money.nonferrous.toNumber()).toBeCloseTo(a.dug * DIG_NONFERROUS);
    expect(a.money.scrap.eq(b.money.scrap)).toBe(true);
    expect(a.money.nonferrous.eq(b.money.nonferrous)).toBe(true);
  });

  it('guaranteed metals cover average crate and suitcase fees at every lamp level, before bonus finds', () => {
    const b = newBottom();
    for (let lamp = 0; lamp <= 15; lamp++) {
      b.tools.lamp = lamp;
      const weights = containerOdds(b), total = weights.reduce((a, n) => a + n, 0);
      for (const [id, income] of [['crate', DIG_SCRAP], ['suitcase', DIG_NONFERROUS]] as const) {
        const i = CONTAINERS.findIndex(c => c.id === id);
        expect(weights[i] / total * CONTAINERS[i].cost).toBeLessThan(income);
      }
    }
  });

  it('reserves the chosen upgrade while free containers and paid surplus keep opening', () => {
    const b = newBottom();
    b.open = true; b.auto = 2; b.saving = 'equipment:hoist'; b.dug = 1000;
    b.objectWork.hoist = 120;
    b.money.scrap = D(42); b.stock.crate = 10; b.stock.sack = 1;
    // High luck makes bonus scrap negligible; a relic is returned in each opening.
    b.tools.luck = 15;
    autoOpen(b, () => 0.999999);
    expect(b.money.scrap.gte(40)).toBe(true);
    expect(b.stock.sack).toBe(0);
    expect(b.stock.crate).toBeGreaterThan(0);
    expect(savingGoal(b)!.cost.toNumber()).toBe(40);
    expect(buySavingGoal(b)).toBe(true);
    expect(b.equipment.hoist).toBe(true);
    expect(b.saving).toBeNull();
    expect(b.money.scrap.lt(40)).toBe(true);
  });

  it('can build a reserved balance from below its price, with free sacks still available', () => {
    const b = newBottom(); b.open = true; b.auto = 1; b.saving = 'tool:lamp';
    b.money.scrap = D(7); b.stock.crate = 3; b.stock.sack = 1;
    autoOpen(b, () => 0);
    expect(b.money.scrap.toNumber()).toBe(7);
    expect(b.stock.crate).toBe(3);
    expect(b.stock.sack).toBe(0);
    bottomTick(b, 120, 0, () => 0);
    autoOpen(b, () => 0.999999);
    expect(b.money.scrap.gte(8)).toBe(true);
    expect(buySavingGoal(b)).toBe(true);
    expect(b.tools.lamp).toBe(1);
  });

  it('a sack is free, a crate takes scrap, and the finds pay in their own currency', () => {
    const b = newBottom();
    b.stock.sack = 1;
    b.stock.crate = 1;
    expect(canOpen(b, 'crate')).toBe(false);
    const r = openOne(b, 'sack', () => 0)!;
    expect(r.item.rarity).toBe('dust');
    expect(r.item.epoch).toBe('medieval');
    expect(b.money.dust.toNumber()).toBe(12);
    expect(r.fresh).toBe(true);
  });

  it('deeper epochs turn up only once the miner has dug that deep', () => {
    const b = newBottom();
    b.stock.sack = 200;
    for (let i = 0; i < 200; i++) expect(openOne(b, 'sack', Math.random)!.item.epoch).toBe('medieval');
    b.dug = 1e6;
    b.stock.sack = 400;
    const epochs = new Set(Array.from({ length: 400 }, () => openOne(b, 'sack', Math.random)!.item.epoch));
    expect(epochs.size).toBe(4);
  });

  it('pity: an antique at least every 50 openings', () => {
    const b = newBottom();
    b.stock.sack = 50;
    const got = Array.from({ length: 50 }, () => openOne(b, 'sack', seq(0, 0))!.item.rarity);
    expect(got.slice(0, 49).every((r) => r === 'dust')).toBe(true);
    expect(got[49]).toBe('antique');
  });

  it('melting goes up the ladder; the УМЕ only down where the inhuman things lie', () => {
    const b = newBottom();
    b.money.dust = D(MELT.dust * 3);
    expect(melt(b, 'dust', 5)).toBe(3);
    expect(b.money.scrap.toNumber()).toBe(3);
    b.money.anomaly = D(MELT.anomaly);
    expect(umeOpen(b)).toBe(false);
    expect(melt(b, 'anomaly')).toBe(0);
    b.dug = 1e6;
    expect(melt(b, 'anomaly')).toBe(1);
    expect(b.ume.toNumber()).toBe(1);
  });

  it('tools and automatic opening are bought with currencies', () => {
    const b = newBottom();
    b.money.dust = D(60);
    expect(buyTool(b, 'pick')).toBe(true);
    expect(buyTool(b, 'pick')).toBe(false);
    b.money.antique = D(3);
    expect(buyAuto(b)).toBe(true);
    expect(b.auto).toBe(1);
  });
});

describe('the descent and the save', () => {
  it('opens the bottom only once the pit is taken, and starts the world above over', async () => {
    const { newGame, descend, advance } = await import('../src/game/state');
    const s = newGame(0);
    expect(descend(s)).toBe(false);
    s.city.owned.push('pit');
    s.sorting.found = ['lantern'];
    s.achievements = ['kg1e3'];
    s.trash = D(1e30);
    expect(descend(s)).toBe(true);
    expect(s.bottom.open).toBe(true);
    expect(s.bottom.heap).toBeGreaterThan(0);
    expect(s.city.owned).toEqual(['dump']);
    expect(s.sorting.found).toEqual(['lantern']);
    expect(s.achievements).toEqual(['kg1e3']);
    expect(s.trash.lt(1e30)).toBe(true);
    // The world above keeps falling in, and Ignatyev digs.
    advance(s, 120);
    expect(s.bottom.dug).toBeGreaterThan(0);
    const depth = s.bottom.dug;
    s.bottom.equipment = { hoist: true, bench: true, borer: 2 };
    s.bottom.supplied = 50;
    s.city.owned.push('pit');
    expect(descend(s)).toBe(false);
    expect(s.bottom.dug).toBe(depth);
    expect(s.bottom.supplied).toBe(50);
    expect(s.bottom.equipment).toEqual({ hoist: true, bench: true, borer: 2 });
  });

  it('migrates v18 without losing depth, unopened finds, currencies or UME', async () => {
    const { newGame } = await import('../src/game/state');
    const { serialize, deserialize } = await import('../src/game/save');
    const state = newGame(0);
    Object.assign(state.bottom, { open: true, dug: 12000, heap: 45, ume: D(3), found: { bell: 2 } });
    state.bottom.stock.safe = 4;
    state.bottom.money.nonferrous = D(17);
    const old = JSON.parse(serialize(state));
    old.v = 18;
    delete old.layers.bottom.supplied;
    delete old.layers.bottom.equipment;
    for (const key of ['route', 'siteId', 'objectWork', 'benchMode', 'seamProgress', 'seamFound', 'firstUmeGranted', 'firstUmePresented']) delete old.layers.bottom[key];
    const back = deserialize(JSON.stringify(old))!;
    expect(back.bottom.dug).toBe(12000);
    expect(back.bottom.heap).toBe(45);
    expect(back.bottom.stock.safe).toBe(4);
    expect(back.bottom.found).toEqual({ bell: 2 });
    expect(back.bottom.ume.toNumber()).toBe(3);
    expect(back.bottom.money.nonferrous.toNumber()).toBe(17);
    expect(back.bottom.supplied).toBe(0);
    expect(back.bottom.equipment).toEqual({ hoist: false, bench: false, borer: 0 });
    expect(JSON.parse(serialize(back)).v).toBe(27);
  });

  it('gives an old deep save its first UME once without replaying old excavation', async () => {
    const { newGame } = await import('../src/game/state');
    const { serialize, deserialize } = await import('../src/game/save');
    const state = newGame(0);
    state.bottom.open = true;
    state.bottom.dug = 11000;
    const old = JSON.parse(serialize(state));
    old.v = 20;
    for (const key of ['route', 'siteId', 'objectWork', 'benchMode', 'seamProgress', 'seamFound', 'firstUmeGranted', 'firstUmePresented']) delete old.layers.bottom[key];
    const back = deserialize(JSON.stringify(old))!;
    expect(back.bottom.ume.toNumber()).toBe(1);
    expect(back.bottom.objectWork.borer).toBe(600);
    expect(back.bottom.firstUmePresented).toBe(false);
    expect(deserialize(serialize(back))!.bottom.ume.toNumber()).toBe(1);
  });

  it('migrates v19 without changing currencies, and persists or sanitises the chosen goal', async () => {
    const { newGame } = await import('../src/game/state');
    const { serialize, deserialize } = await import('../src/game/save');
    const state = newGame(0);
    state.bottom.open = true; state.bottom.money.scrap = D(17); state.bottom.saving = 'tool:lamp';
    expect(deserialize(serialize(state))!.bottom.saving).toBe('tool:lamp');
    const old = JSON.parse(serialize(state)); old.v = 19; delete old.layers.bottom.saving;
    const back = deserialize(JSON.stringify(old))!;
    expect(back.bottom.money.scrap.eq(17)).toBe(true);
    expect(back.bottom.saving).toBeNull();
    old.v = 20; old.layers.bottom.saving = 'invalid';
    expect(deserialize(JSON.stringify(old))!.bottom.saving).toBeNull();
  });

  it('round-trips bottom progress; a v12 save loads with the bottom closed', async () => {
    const { newGame } = await import('../src/game/state');
    const { deserialize, serialize } = await import('../src/game/save');
    const s = newGame(0);
    const b = s.bottom;
    b.open = true;
    b.heap = 120.5;
    b.supplied = 87.25;
    b.equipment = { hoist: true, bench: true, borer: 3 };
    b.dug = 3000;
    b.stock.safe = 2;
    b.money.relic = D(7);
    b.tools.pick = 4;
    b.auto = 1;
    b.found = { bell: 3 };
    b.ume = D(2);
    b.scripts = ['producers', 'nope'];
    const back = deserialize(serialize(s))!;
    expect(back.bottom.open).toBe(true);
    expect(back.bottom.heap).toBe(120.5);
    expect(back.bottom.supplied).toBe(87.25);
    expect(back.bottom.equipment).toEqual(b.equipment);
    expect(back.bottom.stock.safe).toBe(2);
    expect(back.bottom.money.relic.toNumber()).toBe(7);
    expect(back.bottom.tools.pick).toBe(4);
    expect(back.bottom.found).toEqual({ bell: 3 });
    expect(back.bottom.ume.toNumber()).toBe(2);
    expect(back.bottom.scripts).toEqual(['producers']);
    const v12 = JSON.parse(serialize(newGame(0)));
    v12.v = 12;
    delete v12.layers.bottom;
    v12.autoRecycle = { on: true, factor: 0.25 };
    const old = deserialize(JSON.stringify(v12))!;
    expect(old.bottom.open).toBe(false);
    expect(old.autoRecycle.factor).toBe(0.25);
  });
});
