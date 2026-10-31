import { describe, expect, it } from 'vitest';
import { composeStep } from '../src/ui/music';
import { textBar } from '../src/ui/app';

describe('textBar', () => {
  it('fills cells by fraction and clamps', () => {
    expect(textBar(0)).toBe('[░░░░░░░░░░]');
    expect(textBar(0.62)).toBe('[██████░░░░]');
    expect(textBar(1.5)).toBe('[██████████]');
    expect(textBar(-1, 4)).toBe('[░░░░]');
  });
});

describe('stored volume', () => {
  it('reads what was saved and falls back to the default for anything else', async () => {
    const { parseVolume } = await import('../src/ui/sound');
    expect(parseVolume(null)).toBe(0.6);
    expect(parseVolume('0.3')).toBe(0.3);
    expect(parseVolume('0')).toBe(0);
    expect(parseVolume('7')).toBe(1);
    expect(parseVolume('громко')).toBe(0.6);
  });
});

describe('music', () => {
  const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const steps = (threat: number) => {
    const rand = seeded(5);
    return Array.from({ length: 64 }, (_, i) => composeStep(i, threat, rand));
  };

  it('changes chords every eight steps, with a bass under each', async () => {
    const quiet = steps(0);
    expect(quiet.filter((s) => s.pad).length).toBe(8);
    expect(quiet[0].pad).toEqual([69, 72, 76]);
    expect(quiet[8].pad).toEqual([65, 69, 72]);
    expect(quiet.every((s) => s.heart === undefined)).toBe(true);
  });

  it('quickens, goes out of key and gets a heartbeat as the threat rises', async () => {
    const quiet = steps(0);
    const loud = steps(0.95);
    expect(loud[0].seconds).toBeLessThan(quiet[0].seconds);
    expect(loud.filter((s) => s.heart).length).toBeGreaterThan(0);
    // The fourth chord turns into a cluster with a tritone in it.
    expect(loud[24].pad).toEqual([63, 69, 70]);
    // Wrong notes: in the quiet every tune note is in A minor (with the G sharp of the E chord),
    // under pressure some slip a semitone out of it.
    const allowed = new Set([0, 2, 3, 5, 7, 8, 10, 11]);
    const inKey = (n: number) => allowed.has((((n - 69) % 12) + 12) % 12);
    expect(quiet.every((s) => s.tune === undefined || inKey(s.tune))).toBe(true);
    expect(loud.some((s) => s.tune !== undefined && !inKey(s.tune))).toBe(true);
  });
});

describe('music by layer', () => {
  it('each layer opened brings its piece, and a reform or the descent keeps it', async () => {
    const { PIECES, pieceFor } = await import('../src/ui/music');
    const { newGame } = await import('../src/game/state');
    const s = newGame(0);
    expect(pieceFor(s)).toBe(0);
    s.recycle.resets = 1;
    expect(pieceFor(s)).toBe(1);
    s.sorting.open = true;
    expect(pieceFor(s)).toBe(2);
    s.city.reforms = 1;
    s.sorting.open = false;
    expect(pieceFor(s)).toBe(3);
    s.bottom.open = true;
    expect(pieceFor(s)).toBe(4);
    expect(PIECES.map((p) => p.name)).toEqual(['Свалка', 'Цех', 'Лента', 'Город', 'Дно']);
  });

  it('the line runs an arpeggio on every step, the town tolls, the plant ticks', async () => {
    const { PIECES } = await import('../src/ui/music');
    const rand = () => 0.3;
    const line = Array.from({ length: 16 }, (_, i) => composeStep(i, 0, rand, 0, PIECES[2]));
    expect(line.every((s) => s.tune !== undefined)).toBe(true);
    const town = Array.from({ length: 16 }, (_, i) => composeStep(i, 0, rand, 0, PIECES[3]));
    expect(town.filter((s) => s.toll !== undefined).length).toBe(2);
    const plant = Array.from({ length: 16 }, (_, i) => composeStep(i, 0, rand, 0, PIECES[1]));
    expect(plant.filter((s) => s.tick).length).toBe(8);
    // Slower in the shop than on the dump, quicker on the belt.
    expect(plant[0].seconds).toBeGreaterThan(composeStep(0, 0, rand).seconds);
    expect(line[0].seconds).toBeLessThan(composeStep(0, 0, rand).seconds);
  });
});
