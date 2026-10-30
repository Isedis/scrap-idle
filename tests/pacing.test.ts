import { describe, expect, it } from 'vitest';
import { longestGap, simulate } from '../src/game/bot';

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

describe('pacing', () => {
  const hour = 3600;
  const events = simulate(3 * hour);

  if (process.env.PACE) {
    for (const e of events) console.log(mmss(e.t).padStart(7), e.what);
  }

  it('first ten minutes: something new at least every 2 minutes', () => {
    const gap = longestGap(events, 600);
    expect(gap.to - gap.from, `gap ${mmss(gap.from)}–${mmss(gap.to)}`).toBeLessThanOrEqual(120);
  });

  it('first hour: no pause longer than 5 minutes', () => {
    const gap = longestGap(events, hour);
    expect(gap.to - gap.from, `gap ${mmss(gap.from)}–${mmss(gap.to)}`).toBeLessThanOrEqual(300);
  });
});
