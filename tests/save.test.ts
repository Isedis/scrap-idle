import { describe, expect, it } from 'vitest';
import { advance, buy, buyUpgrade, newGame } from '../src/game/state';
import { applyOffline, deserialize, exportSave, importSave, serialize } from '../src/game/save';
import { newLayer, offlineCapSeconds } from '../src/game/layers';
import { OFFLINE_EFFICIENCY } from '../src/game/threat';

const OFFLINE_CAP_SECONDS = offlineCapSeconds(newLayer());
import { D } from '../src/game/num';

describe('saves', () => {
  it('round-trips a game', () => {
    const s = newGame(1000);
    advance(s, 500);
    buy(s, 'collector');
    buy(s, 'cart');
    buyUpgrade(s, 'collector-1');
    s.seenUpgrades = ['collector-1', 'cart-1'];
    s.buyMode = 'max';
    const back = deserialize(serialize(s))!;
    expect(back.upgrades).toEqual(['collector-1']);
    expect(back.seenUpgrades).toEqual(['collector-1', 'cart-1']);
    expect(back.buyMode).toBe('max');
    expect(back.trash.eq(s.trash)).toBe(true);
    expect(back.owned).toEqual(s.owned);
    expect(back.revealed).toEqual(s.revealed);
    expect(back.lastTick).toBe(1000);
  });

  it('keeps huge numbers exact', () => {
    const s = newGame(0);
    s.trash = D('1.2345e98765');
    expect(deserialize(serialize(s))!.trash.eq(s.trash)).toBe(true);
  });

  it('rejects damaged saves', () => {
    expect(deserialize('')).toBeNull();
    expect(deserialize('{"v":99}')).toBeNull();
    expect(deserialize('{"v":1,"trash":"abc"}')).toBeNull();
    expect(importSave('not a save')).toBeNull();
  });

  it('loads a v1 save with no upgrades yet', () => {
    const s = deserialize('{"v":1,"trash":"500","totalTrash":"900","owned":{"collector":7,"cart":2},"revealed":["collector","cart"],"lastTick":123}')!;
    expect(s.trash.toNumber()).toBe(500);
    expect(s.owned).toEqual({ collector: 7, cart: 2 });
    expect(s.upgrades).toEqual([]);
    expect(s.buyMode).toBe('one');
    expect(s.lastTick).toBe(123);
  });

  it('drops unknown upgrades and bad buy modes', () => {
    const s = deserialize('{"v":2,"trash":"1","owned":{},"revealed":[],"upgrades":["collector-1","fake",5],"seenUpgrades":[],"buyMode":"all","lastTick":0}')!;
    expect(s.upgrades).toEqual(['collector-1']);
    expect(s.seenUpgrades).toEqual(['collector-1']);
    expect(s.buyMode).toBe('one');
  });

  it('drops unknown producers and bad counts', () => {
    const s = deserialize('{"v":1,"trash":"5","owned":{"collector":3,"ufo":9,"cart":-2},"revealed":["ufo"],"lastTick":0}')!;
    expect(s.owned).toEqual({ collector: 3 });
    expect(s.revealed).toEqual(['collector']);
  });

  it('export string imports back, raw JSON too', () => {
    const s = newGame(0);
    advance(s, 42);
    expect(importSave(exportSave(s))!.trash.toNumber()).toBeCloseTo(42);
    expect(importSave(serialize(s))!.trash.toNumber()).toBeCloseTo(42);
  });

  it('applies offline progress up to a day', () => {
    const s = newGame(0);
    expect(applyOffline(s, 60_000)).toBe(60);
    // Closed, the dump works at half speed.
    expect(s.trash.toNumber()).toBeCloseTo(60 * OFFLINE_EFFICIENCY);
    const t = newGame(0);
    expect(applyOffline(t, 10 * OFFLINE_CAP_SECONDS * 1000)).toBe(OFFLINE_CAP_SECONDS);
    const u = newGame(5000);
    expect(applyOffline(u, 1000)).toBe(0); // clock moved back: no negative time
  });
});
