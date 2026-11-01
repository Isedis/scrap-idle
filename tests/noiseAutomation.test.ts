import { afterEach, describe, expect, it, vi } from 'vitest';
import { advance, fullNoiseAutomation, newGame, reform } from '../src/game/state';
import { afterLoss, setNoise, setNoiseAutomation } from '../src/game/hearing';
import { cityEffects } from '../src/game/city';
import { deserialize, serialize } from '../src/game/save';
import { simulateOffline } from '../src/game/offline';

afterEach(() => vi.restoreAllMocks());
const automated = () => {
  const s = newGame(0);
  s.city.open = s.sorting.open = true;
  s.city.owned.push('boiler1', 'boiler2');
  s.hearing.noise = 1.75;
  s.hearing.phase = 'walk';
  s.hearing.walk = 60;
  s.hearing.left = 0.5;
  return s;
};

describe('complete noise automation', () => {
  it('finishes reliability with both actual boilers; the first retains its old risk', () => {
    const s = automated();
    expect(cityEffects(s.city).silencerFail).toBe(0);
    expect(fullNoiseAutomation(s)).toBe(true);
    s.city.owned = ['dump', 'boiler1'];
    expect(cityEffects(s.city).silencerFail).toBeCloseTo(0.35);
    expect(fullNoiseAutomation(s)).toBe(false);
  });

  it('handles repeated door checks without failures or resetting the chosen load', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const s = automated();
    for (let i = 0; i < 5; i++) {
      s.hearing.phase = 'walk';
      s.hearing.left = 0.5;
      advance(s, 1);
      expect(s.hearing.phase).toBe('check');
      expect(s.hearing.noise).toBe(0);
      expect(s.hearing.resumeNoise).toBe(1.75);
      advance(s, 11);
      expect(s.hearing.phase).toBe('idle');
      expect(s.hearing.noise).toBe(1.75);
      expect(s.hearing.resumeNoise).toBeNull();
      expect(s.hearing.survived).toBe(i + 1);
    }
  });

  it('does not upgrade a single boiler into guaranteed or self-restoring automation', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const s = automated();
    s.city.owned = ['dump', 'boiler1'];
    advance(s, 1);
    expect(s.hearing.auto).toBe('fail');
    expect(s.hearing.noise).toBe(1.75);
    setNoise(s.hearing, 0);
    advance(s, 11);
    expect(s.hearing.noise).toBe(1);
    expect(s.hearing.resumeNoise).toBeNull();
  });

  it('respects manual mode even with both boilers', () => {
    const s = automated();
    setNoiseAutomation(s.hearing, false);
    advance(s, 1);
    expect(s.hearing.phase).toBe('check');
    expect(s.hearing.noise).toBe(1.75);
    expect(s.hearing.resumeNoise).toBeNull();
    setNoise(s.hearing, 0);
    advance(s, 11);
    expect(s.hearing.noise).toBe(1);
  });

  it('can take over safely when enabled at the door', () => {
    const s = automated();
    setNoiseAutomation(s.hearing, false);
    advance(s, 1);
    s.hearing.left = 2;
    setNoiseAutomation(s.hearing, true);
    advance(s, 1);
    expect(s.hearing.noise).toBe(0);
    expect(s.hearing.resumeNoise).toBe(1.75);
    advance(s, 11);
    expect(s.hearing.noise).toBe(1.75);
  });

  it('keeps a changed target quiet until the automatic check finishes, including a chosen stop', () => {
    const s = automated();
    advance(s, 1);
    setNoise(s.hearing, 2);
    expect(s.hearing.noise).toBe(0);
    expect(s.hearing.phase).toBe('check');
    advance(s, 11);
    expect(s.hearing.noise).toBe(2);
    s.hearing.phase = 'walk';
    s.hearing.left = 0.5;
    advance(s, 1);
    setNoise(s.hearing, 0);
    advance(s, 11);
    expect(s.hearing.noise).toBe(0);
  });

  it('keeps the pending target through reload and produces offline without advancing the check', () => {
    const s = automated();
    advance(s, 1);
    const back = deserialize(serialize(s))!;
    expect(back.hearing.resumeNoise).toBe(1.75);
    const before = { held: back.hearing.held, left: back.hearing.left, trash: back.totalTrash };
    simulateOffline(back, 60);
    expect(back.totalTrash.gt(before.trash)).toBe(true);
    expect(back.hearing.held).toBe(before.held);
    expect(back.hearing.left).toBe(before.left);
    expect(back.hearing.noise).toBe(0);
    expect(back.hearing.resumeNoise).toBe(1.75);
    advance(back, 11);
    expect(back.hearing.noise).toBe(1.75);
  });

  it('preserves the selected automatic load across reforms while the boilers remain', () => {
    const s = automated();
    advance(s, 1);
    s.sorting.sorts = 7;
    expect(reform(s).gt(0)).toBe(true);
    expect(s.hearing.noise).toBe(1.75);
    expect(s.hearing.resumeNoise).toBeNull();
    expect(s.sorting.open).toBe(false);
    expect(fullNoiseAutomation(s)).toBe(true);
  });

  it('cancels pending restoration when switched off or after a loss', () => {
    const s = automated();
    advance(s, 1);
    setNoiseAutomation(s.hearing, false);
    expect(s.hearing.resumeNoise).toBeNull();
    advance(s, 11);
    expect(s.hearing.noise).toBe(1);
    s.hearing.resumeNoise = 2;
    afterLoss(s.hearing);
    expect(s.hearing.resumeNoise).toBeNull();
    expect(s.hearing.noiseAuto).toBe(false);
  });
});

describe('v17 noise settings', () => {
  it('migrates a v16 silenced check to its original 100% restart', () => {
    const s = automated();
    s.hearing.phase = 'check';
    s.hearing.noise = 0;
    const old = JSON.parse(serialize(s));
    old.v = 16;
    delete old.hearing.noiseAuto;
    delete old.hearing.resumeNoise;
    const back = deserialize(JSON.stringify(old))!;
    expect(back.hearing.noiseAuto).toBe(true);
    expect(back.hearing.resumeNoise).toBe(1);
    advance(back, 11);
    expect(back.hearing.noise).toBe(1);
    expect(JSON.parse(serialize(back)).v).toBe(17);
  });

  it('round-trips manual mode and discards an invalid pending target', () => {
    const s = automated();
    s.hearing.noiseAuto = false;
    expect(deserialize(serialize(s))!.hearing.noiseAuto).toBe(false);
    const data = JSON.parse(serialize(s));
    data.hearing.noiseAuto = true;
    data.hearing.phase = 'check';
    data.hearing.noise = 0;
    data.hearing.resumeNoise = 'broken';
    expect(deserialize(JSON.stringify(data))!.hearing.resumeNoise).toBeNull();
  });
});
