import Decimal from 'break_eternity.js';

export { Decimal };
export type Num = Decimal;

export type DecimalSource = ConstructorParameters<typeof Decimal>[0];

export const D = (value: DecimalSource): Decimal => new Decimal(value);

/** Strict parse for saved strings: Decimal reads garbage as 0, this returns null instead. */
export function parseNum(text: unknown): Decimal | null {
  if (typeof text !== 'string' && typeof text !== 'number') return null;
  const value = D(text);
  if (value.isNan()) return null;
  if (value.eq(0) && !/^\s*-?0*(\.0*)?\s*$/.test(String(text))) return null;
  return value;
}

const SUFFIXES = ['', 'тыс', 'млн', 'млрд', 'трлн', 'квдрлн', 'квинтлн'];

/**
 * Formats a number for the player: plain below a thousand, Russian short
 * suffixes up to quintillions, scientific notation after that.
 */
export function format(value: Decimal, decimals = 2): string {
  if (value.lt(0)) return '−' + format(value.neg(), decimals);
  if (value.lt(1000)) {
    const n = value.toNumber();
    // Whole numbers stay whole; small fractions keep one digit so 0.5/s reads right.
    return Number.isInteger(n) || n >= 100 ? Math.floor(n).toString() : n.toFixed(1);
  }
  const exponent = Math.floor(value.log10().toNumber());
  const group = Math.floor(exponent / 3);
  if (group < SUFFIXES.length) {
    const mantissa = value.div(Decimal.pow(10, group * 3)).toNumber();
    return `${trim(mantissa, decimals)} ${SUFFIXES[group]}`;
  }
  if (value.lt('1e1000000')) {
    const mantissa = value.div(Decimal.pow(10, exponent)).toNumber();
    return `${trim(mantissa, decimals)}e${exponent}`;
  }
  // Past a million digits only the exponent still means anything.
  return 'e' + format(value.log10(), decimals);
}

function trim(n: number, decimals: number): string {
  // Floor so 999.996 shows as 999.99 rather than rounding up to 1000.
  const factor = 10 ** decimals;
  return (Math.floor(n * factor) / factor).toFixed(decimals).replace(/\.?0+$/, '');
}
