import { describe, expect, it } from 'vitest';
import { advance, autoBuy, buy, buyNode, buyUpgrade, canRecycle, newGame, producerRate, purchasePlan, recycle } from '../src/game/state';
import { NODES, RECYCLE_AT, nextGainAt, passiveBonus, recycleGain } from '../src/game/layers';
import { applyOffline, deserialize, serialize } from '../src/game/save';
import { D } from '../src/game/num';

describe('recycle gain', () => {
  it('is zero below the threshold and 10 at it', () => {
    expect(recycleGain(RECYCLE_AT.mul(0.99)).toNumber()).toBe(0);
    expect(recycleGain(RECYCLE_AT).toNumber()).toBe(10);
    expect(recycleGain(RECYCLE_AT.mul(1e4)).toNumber()).toBe(100);
  });

  it('next point lands exactly where the gain ticks up', () => {
    for (const run of [RECYCLE_AT, RECYCLE_AT.mul(7), RECYCLE_AT.mul(1e6)]) {
      const at = nextGainAt(run);
      expect(recycleGain(at).toNumber()).toBe(recycleGain(run).toNumber() + 1);
      expect(recycleGain(at.mul(0.999)).toNumber()).toBe(recycleGain(run).toNumber());
    }
  });

  it('passive bonus grows with the square root', () => {
    expect(passiveBonus(D(0)).toNumber()).toBe(1);
    expect(passiveBonus(D(100)).toNumber()).toBeCloseTo(3);
  });
});

describe('recycling', () => {
  it('needs the threshold this run, not over the whole game', () => {
    const s = newGame(0);
    s.totalTrash = RECYCLE_AT.mul(10);
    expect(canRecycle(s)).toBe(false);
    s.runTrash = RECYCLE_AT;
    expect(canRecycle(s)).toBe(true);
  });

  it('resets the run and keeps the layer', () => {
    const s = newGame(0);
    s.owned = { collector: 80, cart: 40, truck: 5 };
    s.revealed = ['collector', 'cart', 'truck'];
    s.upgrades = ['collector-1', 'night-shift'];
    s.trash = D(5e11);
    s.runTrash = RECYCLE_AT.mul(16);
    s.totalTrash = s.runTrash;
    s.runSeconds = 1800;
    expect(recycle(s).toNumber()).toBe(20);
    expect(s.recycle.points.toNumber()).toBe(20);
    expect(s.recycle.total.toNumber()).toBe(20);
    expect(s.recycle.resets).toBe(1);
    expect(s.recycle.bestSeconds).toBe(1800);
    expect(s.trash.toNumber()).toBe(0);
    expect(s.runTrash.toNumber()).toBe(0);
    expect(s.totalTrash.eq(RECYCLE_AT.mul(16))).toBe(true);
    expect(s.owned).toEqual({ collector: 1 });
    expect(s.revealed).toEqual(['collector']);
    expect(s.upgrades).toEqual([]);
    // The passive bonus applies right away.
    expect(producerRate(s, 'collector').toNumber()).toBeCloseTo(passiveBonus(D(20)).toNumber());
  });

  it('refuses below the threshold', () => {
    const s = newGame(0);
    advance(s, 100);
    expect(recycle(s).toNumber()).toBe(0);
    expect(s.recycle.resets).toBe(0);
  });

  it('start nodes shape the next run', () => {
    const s = newGame(0);
    s.recycle.nodes = ['s1', 's2', 's3', 's4'];
    s.revealed = ['collector', 'cart', 'truck'];
    s.upgrades = ['collector-1', 'collector-2', 'cart-1', 'night-shift'];
    s.runTrash = RECYCLE_AT;
    recycle(s);
    expect(s.owned).toEqual({ collector: 10 });
    expect(s.revealed).toEqual(['collector', 'cart', 'truck']);
    expect(s.upgrades).toEqual(['collector-1', 'cart-1']);
    expect(s.trash.toNumber()).toBe(1e8);
  });
});

describe('recycling tree', () => {
  it('nodes have unique ids and existing prerequisites', () => {
    const ids = NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of NODES) if (n.requires) expect(ids).toContain(n.requires);
  });

  it('buys in order and spends points', () => {
    const s = newGame(0);
    s.recycle.points = D(10);
    expect(buyNode(s, 'p2')).toBe(false); // needs p1
    expect(buyNode(s, 'p1')).toBe(true);
    expect(buyNode(s, 'p1')).toBe(false); // once
    expect(buyNode(s, 'p2')).toBe(true);
    expect(s.recycle.points.toNumber()).toBe(3);
    expect(buyNode(s, 'p3')).toBe(false); // too expensive
  });

  it('production and cost nodes apply', () => {
    const s = newGame(0);
    s.owned = { collector: 10 };
    const base = producerRate(s, 'collector').toNumber();
    const price = purchasePlan(s, 'collector', 'one').cost.toNumber();
    s.recycle.nodes = ['p1', 'p2', 'p4'];
    // ×2 from p1, and the milestone at 10 gives ×3 instead of ×2.
    expect(producerRate(s, 'collector').toNumber()).toBeCloseTo(base * 2 * 1.5);
    expect(purchasePlan(s, 'collector', 'one').cost.toNumber()).toBeCloseTo(price * 0.9);
  });

  it('offline nodes lengthen the offline cap', () => {
    const s = newGame(0);
    expect(applyOffline(s, 10 * 86400e3)).toBe(86400);
    const t = newGame(0);
    t.recycle.nodes = ['o1'];
    expect(applyOffline(t, 10 * 86400e3)).toBe(2 * 86400);
  });
});

describe('auto-buyer', () => {
  it('buys the producer with the best price per output', () => {
    const s = newGame(0);
    s.revealed = ['collector', 'cart'];
    s.trash = D(1e6);
    const id = autoBuy(s);
    expect(id).not.toBeNull();
    expect((s.owned[id!] ?? 0)).toBeGreaterThan(id === 'collector' ? 1 : 0);
  });

  it('does nothing when broke', () => {
    const s = newGame(0);
    expect(autoBuy(s)).toBeNull();
  });
});

describe('save v3', () => {
  it('round-trips the run and the layer', () => {
    const s = newGame(5);
    s.runTrash = D('3e15');
    s.totalTrash = D('7e15');
    s.runSeconds = 321;
    s.recycle.points = D(7);
    s.recycle.total = D(42);
    s.recycle.resets = 3;
    s.recycle.nodes = ['p1', 's1'];
    s.recycle.bestSeconds = 600;
    s.autobuy = false;
    buy(s, 'collector');
    buyUpgrade(s, 'collector-1');
    const back = deserialize(serialize(s))!;
    expect(back.runTrash.eq(s.runTrash)).toBe(true);
    expect(back.runSeconds).toBe(321);
    expect(back.recycle.points.toNumber()).toBe(7);
    expect(back.recycle.total.toNumber()).toBe(42);
    expect(back.recycle.resets).toBe(3);
    expect(back.recycle.nodes).toEqual(['p1', 's1']);
    expect(back.recycle.bestSeconds).toBe(600);
    expect(back.autobuy).toBe(false);
  });

  it('a v2 save becomes one long first run', () => {
    const s = deserialize('{"v":2,"trash":"10","totalTrash":"5e9","owned":{"collector":3},"revealed":["collector"],"upgrades":[],"seenUpgrades":[],"buyMode":"one","lastTick":0}')!;
    expect(s.runTrash.toNumber()).toBe(5e9);
    expect(s.runSeconds).toBeLessThan(0);
    expect(s.recycle.resets).toBe(0);
    s.runTrash = RECYCLE_AT;
    recycle(s);
    // An old run has no known length, so it sets no record; the next one does.
    expect(s.recycle.bestSeconds).toBeNull();
    expect(s.runSeconds).toBe(0);
    expect(s.autobuy).toBe(true);
  });

  it('drops unknown nodes and rejects broken layer numbers', () => {
    const ok = deserialize('{"v":3,"trash":"1","totalTrash":"1","runTrash":"1","runSeconds":5,"owned":{},"revealed":[],"upgrades":[],"seenUpgrades":[],"buyMode":"one","layers":{"recycle":{"points":"2","total":"2","resets":1,"nodes":["p1","zz"],"bestSeconds":9}},"autobuy":true,"lastTick":0}')!;
    expect(ok.recycle.nodes).toEqual(['p1']);
    expect(deserialize('{"v":3,"trash":"1","totalTrash":"1","runTrash":"1","owned":{},"layers":{"recycle":{"points":"x"}},"lastTick":0}')).toBeNull();
  });
});
