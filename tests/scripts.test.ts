import { describe, expect, it } from 'vitest';
import {
  autoRecycleDue,
  automationOpen,
  availableUpgrades,
  buyReliability,
  buySpeed,
  installScript,
  lightFailChance,
  newGame,
  runScripts,
  scriptOwned,
  scriptTick,
  trackLevel,
} from '../src/game/state';
import { BASE_TICK, FAST_TICK, LIGHT_RETRY, failChance, newScripts } from '../src/game/scripts';
import { deserialize, serialize } from '../src/game/save';
import { D } from '../src/game/num';

/** A late-game player with plenty of Recycled material and the automation nodes. */
const veteran = () => {
  const s = newGame(0);
  s.recycle.resets = 5;
  s.recycle.points = D(1e6);
  s.recycle.total = D(1e6);
  s.recycle.nodes = ['a1', 'a2', 'a3'];
  s.threat.lights = 10;
  s.totalTrash = D(1e12);
  return s;
};

const never = () => 0.999;
const always = () => 0;

describe('installing scripts', () => {
  it('tree nodes install the buyer and the recycler; the rest are bought once offered', () => {
    const s = newGame(0);
    expect(automationOpen(s)).toBe(false);
    expect(installScript(s, 'upgrades')).toBe(false);

    const v = veteran();
    expect(scriptOwned(v, 'producers')).toBe(true);
    expect(scriptOwned(v, 'recycle')).toBe(true);
    expect(scriptOwned(v, 'light')).toBe(false);
    for (const id of ['upgrades', 'endless', 'light'] as const) expect(installScript(v, id)).toBe(true);
    expect(installScript(v, 'light')).toBe(false);
    expect(v.recycle.points.toNumber()).toBe(1e6 - 5 - 30 - 20);
    // Tree scripts cannot be bought.
    expect(installScript(v, 'producers')).toBe(false);
  });

  it('the light script is offered only after ten floodlights or a lost shift', () => {
    const s = veteran();
    s.threat.lights = 3;
    expect(installScript(s, 'light')).toBe(false);
    s.threat.losses = 1;
    expect(installScript(s, 'light')).toBe(true);
  });

  it('speed makes the buying scripts tick faster', () => {
    const s = veteran();
    expect(scriptTick(s)).toBe(FAST_TICK);
    s.recycle.nodes = ['a1'];
    expect(scriptTick(s)).toBe(BASE_TICK);
    expect(buySpeed(s)).toBe(true);
    expect(scriptTick(s)).toBeCloseTo(BASE_TICK / 1.5);
  });
});

describe('buying scripts', () => {
  it('the producer buyer follows its amount and skips switched-off producers', () => {
    const s = veteran();
    s.trash = D(1e6);
    s.revealed = ['collector', 'cart'];
    s.owned = { collector: 1, cart: 0 };
    s.scripts.producerOff = ['cart'];
    s.scripts.producerMode = 'ten';
    const notes = runScripts(s, FAST_TICK, never);
    expect(notes).toEqual([{ script: 'producers', text: 'Сборщик' }]);
    expect(s.owned.collector).toBe(11);
    expect(s.owned.cart).toBe(0);
  });

  it('does nothing when switched off', () => {
    const s = veteran();
    s.trash = D(1e6);
    s.autobuy = false;
    expect(runScripts(s, 1, never)).toEqual([]);
  });

  it('the upgrade buyer waits until an upgrade is cheap enough', () => {
    const s = veteran();
    s.autobuy = false;
    installScript(s, 'upgrades');
    s.owned = { collector: 100 };
    s.runTrash = D(1e9);
    const cheapest = availableUpgrades(s).sort((a, b) => a.cost.cmp(b.cost))[0];
    s.trash = cheapest.cost.mul(5);
    s.scripts.upgradesShare = 0.1;
    expect(runScripts(s, FAST_TICK, never)).toEqual([]);
    s.scripts.upgradesShare = 1;
    expect(runScripts(s, FAST_TICK, never)[0].script).toBe('upgrades');
    expect(s.upgrades).toContain(cheapest.id);
  });

  it('the endless buyer buys the cheapest enabled track', () => {
    const s = veteran();
    s.autobuy = false;
    installScript(s, 'endless');
    s.runTrash = D(1e12);
    s.trash = D(1e30);
    s.scripts.endlessOff = ['compact'];
    runScripts(s, FAST_TICK, never);
    expect(trackLevel(s, 'compact')).toBe(0);
    expect(trackLevel(s, 'bulk')).toBe(1);
  });
});

describe('automatic floodlight', () => {
  const lit = () => {
    const s = veteran();
    s.autobuy = false;
    installScript(s, 'light');
    s.threat.level = 0.95;
    return s;
  };

  it('switches on at the chosen threat level', () => {
    const s = lit();
    s.threat.level = 0.8;
    expect(runScripts(s, 0.1, never)).toEqual([]);
    s.threat.level = 0.95;
    const notes = runScripts(s, 0.1, never);
    expect(notes).toEqual([{ script: 'light', text: 'свет на 95%' }]);
    expect(s.threat.level).toBe(0);
    s.scripts.lightAt = 0.5;
    s.threat.level = 0.6;
    expect(runScripts(s, 0.1, never)).toHaveLength(1);
  });

  it('can fail, and then tries again after a pause', () => {
    const s = lit();
    const notes = runScripts(s, 0.1, always);
    expect(notes[0]).toMatchObject({ script: 'light', failed: true });
    expect(s.threat.level).toBe(0.95);
    expect(s.scripts.failures).toBe(1);
    expect(runScripts(s, LIGHT_RETRY - 1, never)).toEqual([]);
    expect(runScripts(s, 1, never)[0].failed).toBeUndefined();
    expect(s.threat.level).toBe(0);
  });

  it('fails more as the thing comes closer, less with reliability', () => {
    expect(failChance(D(5000), 0)).toBeCloseTo(0.1);
    expect(failChance(D(5), 0)).toBeCloseTo(0.1 + 0.08 * 3);
    expect(failChance(D('1e-50'), 0)).toBe(0.6);
    expect(failChance(D(5), 2)).toBeCloseTo((0.1 + 0.08 * 3) * 0.64);
    const s = lit();
    const before = lightFailChance(s);
    expect(buyReliability(s)).toBe(true);
    expect(lightFailChance(s)).toBeLessThan(before);
  });

  it('does not count as the brave manual floodlight', () => {
    const s = lit();
    runScripts(s, 0.1, never);
    expect(s.threat.lights).toBe(11);
    expect(s.threat.bravest).toBe(0);
  });
});

describe('auto-recycle modes', () => {
  const ready = () => {
    const s = veteran();
    s.autoRecycle.on = true;
    s.runTrash = D(1e16);
    s.runSeconds = 120;
    return s;
  };

  it('time: after the chosen run length', () => {
    const s = ready();
    s.scripts.recycleMode = 'time';
    s.scripts.recycleMinutes = 5;
    expect(autoRecycleDue(s)).toBe(false);
    s.runSeconds = 300;
    expect(autoRecycleDue(s)).toBe(true);
  });

  it('peak: once Recycled per second falls from its best', () => {
    const s = ready();
    s.scripts.recycleMode = 'peak';
    s.autobuy = false;
    runScripts(s, 0, never);
    expect(autoRecycleDue(s)).toBe(false);
    // Same gain, much longer run: the rate dropped.
    s.runSeconds = 600;
    expect(autoRecycleDue(s)).toBe(true);
  });
});

describe('save v7', () => {
  it('keeps installed scripts and settings, not the clocks', () => {
    const s = veteran();
    installScript(s, 'light');
    s.scripts.speed = 3;
    s.scripts.reliability = 2;
    s.scripts.failures = 4;
    s.scripts.producerOff = ['cart'];
    s.scripts.recycleMode = 'peak';
    s.scripts.lightAt = 0.75;
    s.scripts.cooldown = 9;
    const back = deserialize(serialize(s))!;
    expect(back.scripts).toEqual({ ...s.scripts, clock: 0, cooldown: 0, peak: 0 });
    expect(JSON.parse(serialize(s)).scripts.cooldown).toBeUndefined();
  });

  it('a v6 save starts with default scripts', () => {
    const v6 = JSON.parse(serialize(veteran()));
    v6.v = 6;
    delete v6.scripts;
    const back = deserialize(JSON.stringify(v6))!;
    expect(back.scripts).toEqual(newScripts());
    expect(scriptOwned(back, 'producers')).toBe(true);
  });

  it('drops unknown or broken script settings', () => {
    const data = JSON.parse(serialize(veteran()));
    data.scripts = { bought: ['light', 'producers', 'zz'], speed: -2, producerMode: 'all', lightAt: 0.1, recycleMinutes: 7, endlessOff: ['dark', 'x'] };
    const back = deserialize(JSON.stringify(data))!;
    expect(back.scripts.bought).toEqual(['light']);
    expect(back.scripts.speed).toBe(0);
    expect(back.scripts.producerMode).toBe('one');
    expect(back.scripts.lightAt).toBe(0.9);
    expect(back.scripts.recycleMinutes).toBe(5);
    expect(back.scripts.endlessOff).toEqual(['dark']);
  });
});
