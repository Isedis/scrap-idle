import { describe, expect, it } from 'vitest';
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
