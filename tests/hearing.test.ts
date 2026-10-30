import { describe, expect, it } from 'vitest';
import { CHECK_SECONDS, HOLD_SECONDS, holdCheck, WALK_MAX, WALK_MIN, hearingTick, heardLine, HEARD, nearness, newHearing, setNoise } from '../src/game/hearing';
import { advance, buyNode, loseToHearing, newGame, ratePerSecond, type GameState } from '../src/game/state';
import { deserialize, serialize } from '../src/game/save';
import { D } from '../src/game/num';

/** Runs the thing second by second. */
function run(h: ReturnType<typeof newHearing>, seconds: number, open = true) {
  const out: string[] = [];
  for (let t = 0; t < seconds; t++) {
    const e = hearingTick(h, 1, open, false, () => 0);
    if (e) out.push(e);
  }
  return out;
}

describe('hearing', () => {
  it('stays asleep before the line opens, at any load', () => {
    const h = newHearing();
    setNoise(h, 2);
    expect(run(h, 3600, false)).toEqual([]);
    expect(h.meter).toBe(0);
  });

  it('normal load is safe; above it the meter fills, full load in five minutes, half the extra in ten', () => {
    const h = newHearing();
    run(h, 3600);
    expect(h.meter).toBe(0);
    setNoise(h, 2);
    run(h, 299);
    expect(h.phase).toBe('idle');
    expect(run(h, 1)).toEqual(['heard']);
    const half = newHearing();
    setNoise(half, 1.5);
    run(half, 599);
    expect(half.phase).toBe('idle');
    expect(run(half, 1)).toEqual(['heard']);
  });

  it('quiet drains the meter', () => {
    const h = newHearing();
    h.meter = 0.5;
    run(h, 90);
    expect(h.meter).toBeCloseTo(0, 5);
  });

  it('walks three to five minutes whatever the load, then gives a minute to go silent', () => {
    const h = newHearing();
    h.meter = 1;
    setNoise(h, 2);
    run(h, 1);
    expect(h.phase).toBe('walk');
    expect(h.walk).toBeGreaterThanOrEqual(WALK_MIN);
    expect(h.walk).toBeLessThanOrEqual(WALK_MAX);
    // Going quiet does not stop it.
    setNoise(h, 0);
    expect(run(h, WALK_MIN - 1)).toEqual([]);
    expect(nearness(h)).toBeGreaterThan(0.9);
    expect(run(h, 1)).toEqual(['check']);
    expect(h.left).toBe(CHECK_SECONDS);
  });

  function atCheck() {
    const h = newHearing();
    h.phase = 'check';
    h.left = CHECK_SECONDS;
    return h;
  }

  it('ten seconds of silence within the minute: it leaves, and tells a little more', () => {
    const h = atCheck();
    setNoise(h, 1);
    run(h, 30);
    setNoise(h, 0);
    expect(run(h, HOLD_SECONDS)).toEqual(['survived']);
    expect(h.phase).toBe('idle');
    expect(h.meter).toBe(0);
    expect(h.survived).toBe(1);
    expect(h.noise).toBe(1);
    expect(heardLine(1)).toBe(HEARD[0]);
    expect(heardLine(999)).toBe(HEARD[HEARD.length - 1]);
  });

  it('any sound once the silence has started is heard', () => {
    const h = atCheck();
    setNoise(h, 0);
    run(h, 3);
    setNoise(h, 0.01);
    expect(h.phase).toBe('caught');
  });

  it('the minute waits under a screen over the game', () => {
    const h = atCheck();
    setNoise(h, 1);
    for (let t = 0; t < 120; t++) {
      holdCheck(h, 1);
      hearingTick(h, 1, true);
    }
    expect(h.phase).toBe('check');
    expect(h.left).toBeGreaterThanOrEqual(CHECK_SECONDS - 1);
  });

  it('no silence within the minute is heard too', () => {
    const h = atCheck();
    setNoise(h, 0.5);
    expect(run(h, CHECK_SECONDS)).toEqual(['caught']);
  });

  it('closed, nothing moves: leaving the game neither fills nor empties the meter, nor moves the walk or the minute', () => {
    const h = newHearing();
    setNoise(h, 2);
    h.meter = 0.9;
    hearingTick(h, 3600, true, true);
    expect(h.phase).toBe('idle');
    expect(h.meter).toBe(0.9);
    h.phase = 'walk';
    h.walk = h.left = 200;
    hearingTick(h, 3600 * 8, true, true);
    expect(h.phase).toBe('walk');
    expect(h.left).toBe(200);
    h.phase = 'check';
    h.left = 12;
    h.held = 4;
    hearingTick(h, 600, true, true);
    expect(h).toMatchObject({ phase: 'check', left: 12, held: 4 });
  });
});

function sortingGame(): GameState {
  const s = newGame(0);
  s.sorting.open = true;
  s.recycle.points = D(1e6);
  s.recycle.total = D(1e6);
  s.owned.collector = 50;
  return s;
}

describe('hearing in the game', () => {
  it('load multiplies income; closed, the plant runs at normal load and keeps the setting', () => {
    const s = sortingGame();
    const normal = ratePerSecond(s);
    setNoise(s.hearing, 2);
    expect(ratePerSecond(s).div(normal).toNumber()).toBeCloseTo(2, 5);
    setNoise(s.hearing, 0);
    expect(ratePerSecond(s).eq(0)).toBe(true);
    setNoise(s.hearing, 2);
    const before = s.trash;
    advance(s, 100, true);
    const quiet = sortingGame();
    advance(quiet, 100, true);
    expect(s.trash.sub(before).div(quiet.trash).toNumber()).toBeCloseTo(1, 3);
    expect(s.hearing.noise).toBe(2);
    expect(s.hearing.meter).toBe(0);
    // A meter half full stays half full through a minute in the background.
    s.hearing.meter = 0.5;
    advance(s, 60, true);
    expect(s.hearing.meter).toBe(0.5);
  });

  it('production stops the moment it hears', () => {
    const s = sortingGame();
    s.hearing.phase = 'check';
    s.hearing.left = 1;
    setNoise(s.hearing, 1);
    advance(s, 10);
    expect(s.hearing.phase).toBe('caught');
    expect(s.runSeconds).toBeLessThan(3);
  });

  it('a loss burns the whole of Recycling, keeps Sorting', () => {
    const s = sortingGame();
    buyNode(s, 'p1');
    s.scripts.bought = ['light'];
    s.sorting.sorts = 3;
    s.trash = D(1e20);
    s.upgrades = ['collector-1'];
    s.hearing.phase = 'caught';
    loseToHearing(s);
    expect(s.trash.eq(0)).toBe(true);
    expect(s.upgrades).toEqual([]);
    expect(s.recycle.points.eq(0)).toBe(true);
    expect(s.recycle.total.eq(0)).toBe(true);
    expect(s.recycle.nodes).toEqual([]);
    expect(s.scripts.bought).toEqual([]);
    expect(s.sorting.sorts).toBe(3);
    expect(s.sorting.open).toBe(true);
    expect(s.hearing.phase).toBe('idle');
    expect(s.hearing.noise).toBe(1);
    expect(s.hearing.losses).toBe(1);
  });

  it('saves round-trip; a v8 save starts at normal load with nothing heard', () => {
    const s = sortingGame();
    setNoise(s.hearing, 1.7);
    s.hearing.phase = 'walk';
    s.hearing.walk = 100;
    s.hearing.left = 100;
    s.hearing.survived = 4;
    const back = deserialize(serialize(s))!;
    expect(back.hearing).toEqual(s.hearing);

    // A walk saved longer than a walk now lasts is cut down on load.
    const long = JSON.parse(serialize(s));
    long.hearing.walk = long.hearing.left = 280;
    const cut = deserialize(JSON.stringify(long))!.hearing;
    expect(cut.walk).toBe(WALK_MAX);
    expect(cut.left).toBe(WALK_MAX);

    const v8 = JSON.parse(serialize(s));
    v8.v = 8;
    delete v8.hearing;
    const old = deserialize(JSON.stringify(v8))!;
    expect(old.hearing).toEqual(newHearing());
    expect(old.sorting.open).toBe(true);

    const broken = JSON.parse(serialize(s));
    broken.hearing = { noise: 99, meter: -1, phase: 'dancing', left: 'x' };
    const fixed = deserialize(JSON.stringify(broken))!;
    expect(fixed.hearing.noise).toBe(2);
    expect(fixed.hearing.meter).toBe(0);
    expect(fixed.hearing.phase).toBe('idle');
  });
});
