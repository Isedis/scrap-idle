import { describe, expect, it } from 'vitest';
import { longestGap, simulate } from '../src/game/bot';

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const hour = 3600;

describe('pacing: first run', () => {
  const { events } = simulate(3 * hour);

  if (process.env.PACE) {
    for (const e of events) console.log(mmss(e.t).padStart(7), e.what);
  }

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
  const { events, runs } = simulate(6 * hour, { recycle: true });

  if (process.env.PACE) {
    console.log('--- with recycling ---');
    for (const e of events.filter((e) => /ПЕРЕРАБОТКА|дерево|доступна/.test(e.what))) console.log(mmss(e.t).padStart(7), e.what);
    for (const [i, r] of runs.entries()) console.log(`run ${i + 1}: ready at ${r.recycleReadyAt === null ? '—' : mmss(r.recycleReadyAt)}, length ${mmss(r.seconds)}, +${r.gain}`);
  }

  it('first recycle opens between 25 and 50 minutes', () => {
    const ready = runs[0].recycleReadyAt!;
    expect(ready, mmss(ready)).toBeGreaterThan(25 * 60);
    expect(ready, mmss(ready)).toBeLessThan(50 * 60);
  });

  it('the second run reaches recycling much faster than the first', () => {
    expect(runs.length).toBeGreaterThan(2);
    expect(runs[1].recycleReadyAt!).toBeLessThan(runs[0].recycleReadyAt! * 0.6);
  });

  it('keeps recycling: several resets within six hours', () => {
    expect(runs.filter((r) => r.gain > 0).length).toBeGreaterThanOrEqual(4);
  });
});
