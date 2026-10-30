import { describe, expect, it } from 'vitest';
import { D, format } from '../src/game/num';

describe('format', () => {
  it('shows small numbers plainly', () => {
    expect(format(D(0))).toBe('0');
    expect(format(D(7))).toBe('7');
    expect(format(D(0.5))).toBe('0.5');
    expect(format(D(999.9))).toBe('999');
  });

  it('uses Russian suffixes up to quintillions', () => {
    expect(format(D(1000))).toBe('1 тыс');
    expect(format(D(1234))).toBe('1.23 тыс');
    expect(format(D(999_999))).toBe('999.99 тыс');
    expect(format(D(2.5e6))).toBe('2.5 млн');
    expect(format(D(1e18))).toBe('1 квинтлн');
  });

  it('switches to scientific notation after that', () => {
    expect(format(D('1e21'))).toBe('1e21');
    expect(format(D('4.56e1234'))).toBe('4.56e1234');
  });

  it('keeps working past e1000000', () => {
    expect(format(D('1e1e7'))).toBe('e10 млн');
  });

  it('handles negatives', () => {
    expect(format(D(-1500))).toBe('−1.5 тыс');
  });
});
