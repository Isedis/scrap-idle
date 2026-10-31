import { describe, expect, it } from 'vitest';
import {
  EPOCHS,
  ITEMS,
  MELT,
  RARITIES,
  START_HEAP,
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

  it('digs what has fallen in, a container per tonne', () => {
    const b = newBottom();
    b.open = true;
    b.heap = 1;
    // 2 t/min for a minute, but only one tonne lies there.
    expect(bottomTick(b, 60, 0, () => 0)).toBe(1);
    expect(b.heap).toBe(0);
    expect(b.stock.sack).toBe(1);
    expect(bottomTick(b, 60, 60, () => 0)).toBe(2);
    expect(START_HEAP).toBeGreaterThan(0);
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
