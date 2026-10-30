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
