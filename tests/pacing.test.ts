import { appendFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { longestGap, simulate, type Simulation } from '../src/game/bot';

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const hm = (t: number) => `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
const hour = 3600;
/**
 * The checks below only need the first hour and a half; a full chronicle is for reading,
 * so the long horizon runs only with PACE=1.
 */
const long = Boolean(process.env.PACE);
/** Simulations take seconds by default, minutes with the long horizons; a slow CI machine must not fail them. */
const SIM_TIMEOUT = 30 * 60 * 1000;

// Simulations run in beforeAll, not in the describe body: vitest runs describe bodies even
// for skipped suites, and a skipped six-hour simulation would still cost minutes.

describe('pacing: first run', () => {
  let events: Simulation['events'] = [];
  beforeAll(() => {
    ({ events } = simulate(long ? 3 * hour : hour));
    if (long) for (const e of events) console.log(mmss(e.t).padStart(7), e.what);
  }, SIM_TIMEOUT);

  it('first ten minutes: something new at least every 2 minutes', () => {
    const gap = longestGap(events, 600);
    expect(gap.to - gap.from, `gap ${mmss(gap.from)}–${mmss(gap.to)}`).toBeLessThanOrEqual(120);
  });

  // A player recycles once it opens, so the first run is judged up to that moment.
  it('until recycling opens: no pause longer than 5 minutes', () => {
    const ready = events.find((e) => e.what === 'переработка доступна')!.t;
    const gap = longestGap(events, ready);
    expect(gap.to - gap.from, `gap ${mmss(gap.from)}–${mmss(gap.to)}`).toBeLessThanOrEqual(300);
  });
});

describe('pacing: recycling', () => {
  let runs: Simulation['runs'] = [];
  beforeAll(() => {
    const sim = simulate(long ? 6 * hour : 1.5 * hour, { recycle: true });
    runs = sim.runs;
    if (long) {
      console.log('--- with recycling ---');
      for (const e of sim.events.filter((e) => /ПЕРЕРАБОТКА|дерево|доступна/.test(e.what))) console.log(mmss(e.t).padStart(7), e.what);
      for (const [i, r] of runs.entries()) console.log(`run ${i + 1}: ready at ${r.recycleReadyAt === null ? '—' : mmss(r.recycleReadyAt)}, length ${mmss(r.seconds)}, +${r.gain}`);
    }
  }, SIM_TIMEOUT);

  it('first recycle opens between 25 and 50 minutes', () => {
    const ready = runs[0].recycleReadyAt!;
    expect(ready, mmss(ready)).toBeGreaterThan(25 * 60);
    expect(ready, mmss(ready)).toBeLessThan(50 * 60);
  });

  it('the second run reaches recycling much faster than the first', () => {
    expect(runs.length).toBeGreaterThan(2);
    expect(runs[1].recycleReadyAt!).toBeLessThan(runs[0].recycleReadyAt! * 0.6);
  });

  it('keeps recycling: several resets in the first hour and a half', () => {
    expect(runs.filter((r) => r.gain > 0).length).toBeGreaterThanOrEqual(4);
  });
});

// Six hours with Sorting take a while to simulate: run with PACE_SORT=1.
describe.runIf(process.env.PACE_SORT)('pacing: sorting', () => {
  let events: Simulation['events'] = [];
  beforeAll(() => {
    ({ events } = simulate(6 * hour, { recycle: true, sort: true }));
    for (const e of events.filter((e) => /ПЕРЕСОРТ|пересорт|сортировка|рецепт|сплав/.test(e.what))) console.log(hm(e.t).padStart(6), e.what);
  }, SIM_TIMEOUT);

  it('the line opens between 1 and 3 hours in', () => {
    const open = events.find((e) => e.what === 'сортировка открыта')!.t;
    expect(open, hm(open)).toBeGreaterThan(hour);
    expect(open, hm(open)).toBeLessThan(3 * hour);
  });

  // Chained resorts came a minute apart; right after a resort a short cycle is the point.
  it('resorts cannot be chained: each takes at least 5 minutes of a cycle', () => {
    const ready = events.filter((e) => e.what.startsWith('пересортировка доступна')).slice(1);
    for (const e of ready) expect(Number(/цикл (\d+)/.exec(e.what)![1]), e.what).toBeGreaterThanOrEqual(5);
  });
});

// Four hours with Sorting take about two minutes: run with PACE_CITY=1.
describe.runIf(process.env.PACE_CITY)('pacing: the town', () => {
  let events: Simulation['events'] = [];
  beforeAll(() => {
    ({ events } = simulate(4 * hour, { recycle: true, sort: true }));
    for (const e of events.filter((e) => /ПЕРЕСОРТ|город/.test(e.what))) console.log(hm(e.t).padStart(6), e.what);
  }, SIM_TIMEOUT);

  it('the town opens between 2 and 4 hours in', () => {
    const open = events.find((e) => e.what === 'город открыт')?.t ?? Infinity;
    expect(open, hm(open)).toBeGreaterThan(2 * hour);
    expect(open, hm(open)).toBeLessThan(4 * hour);
  });
});

// The whole town: reforms, districts, the pit. About ten minutes: run with PACE_REFORM=1
// (PACE_HOURS sets the length, 14 by default).
describe.runIf(process.env.PACE_REFORM)('pacing: the reform and the pit', () => {
  let events: Simulation['events'] = [];
  const hours = Number(process.env.PACE_HOURS ?? 14);
  beforeAll(() => {
    // Each event goes to a file as it happens: a long run can be watched, and survives a crash.
    const live = process.env.PACE_LOG;
    if (live) writeFileSync(live, '');
    ({ events } = simulate(hours * hour, {
      recycle: true,
      sort: true,
      city: true,
      snap: live ? (_s, what, t) => appendFileSync(live, `${hm(t)} ${what}\n`) : undefined,
    }));
    for (const e of events.filter((e) => /РЕФОРМА|ЯМА|город|квартал (1|10|20|30|40|47)\//.test(e.what))) console.log(hm(e.t).padStart(6), e.what);
    const districts = events.filter((e) => e.what.startsWith('квартал'));
    console.log(`кварталов: ${districts.length}, реформ: ${events.filter((e) => e.what.startsWith('РЕФОРМА')).length}`);
  }, 60 * 60 * 1000);

  // The town layer is meant to take 8-12 hours: the first reform a few hours in, the pit
  // late enough to be the end of something, early enough to be reached.
  it('the first reform comes between 3 and 5 hours in', () => {
    const first = events.find((e) => e.what.startsWith('РЕФОРМА'))?.t ?? Infinity;
    expect(first, hm(first)).toBeGreaterThan(3 * hour);
    expect(first, hm(first)).toBeLessThan(5 * hour);
  });

  it('the pit is not taken before 12 hours, and most of the town is by the end', () => {
    const pit = events.find((e) => e.what.startsWith('ЯМА'))?.t ?? Infinity;
    expect(pit, hm(pit)).toBeGreaterThan(12 * hour);
    expect(events.filter((e) => e.what.startsWith('квартал')).length).toBeGreaterThanOrEqual(hours >= 13 ? 38 : 0);
  });
});
