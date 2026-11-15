import { describe, expect, it } from 'vitest';
import { add, compare, div, formatRational, mul, parseRational, pow, rational, sub, toNumber, ONE, ZERO } from './rational';

describe('exact rationals', () => {
  it('reduces and keeps the denominator positive', () => {
    expect(rational(2n, 4n)).toEqual({ num: 1n, den: 2n });
    expect(rational(1n, -2n)).toEqual({ num: -1n, den: 2n });
  });
  it('arithmetic is exact', () => {
    expect(add(rational(1n, 3n), rational(1n, 6n))).toEqual({ num: 1n, den: 2n });
    expect(sub(ONE, rational(1n, 4n))).toEqual({ num: 3n, den: 4n });
    expect(mul(rational(2n, 3n), rational(3n, 4n))).toEqual({ num: 1n, den: 2n });
    expect(div(rational(1n, 2n), rational(1n, 4n))).toEqual({ num: 2n, den: 1n });
    expect(pow(rational(1n, 2n), 3)).toEqual({ num: 1n, den: 8n });
  });
  it('compares without floating point', () => {
    expect(compare(rational(1n, 3n), rational(1n, 2n))).toBe(-1);
    expect(compare(rational(2n, 4n), rational(1n, 2n))).toBe(0);
  });
  it('parses decimals, fractions and percentages', () => {
    expect(parseRational('0.25')).toEqual({ num: 1n, den: 4n });
    expect(parseRational('1/4')).toEqual({ num: 1n, den: 4n });
    expect(parseRational('25%')).toEqual({ num: 1n, den: 4n });
    expect(parseRational('.125')).toEqual({ num: 1n, den: 8n });
    expect(parseRational('0')).toEqual(ZERO);
    expect(parseRational('nonsense')).toBeNull();
    expect(parseRational('1/0')).toBeNull();
  });
  it('formats fixed at/above 0.1 and scientific below', () => {
    expect(formatRational(rational(4403n, 10000n))).toBe('0.4403');
    expect(formatRational(rational(1n, 1n))).toBe('1.000');
    expect(formatRational(ZERO)).toBe('0');
    expect(formatRational(rational(429n, 100000000n))).toBe('4.290e-6');
    // boundary: exactly 0.1 is fixed, just below is scientific
    expect(formatRational(rational(1n, 10n))).toBe('0.1000');
    expect(formatRational(rational(99n, 1000n))).toBe('9.900e-2');
  });
  it('toNumber approximates for sliders only', () => {
    expect(toNumber(rational(1n, 4n))).toBeCloseTo(0.25, 12);
  });
});
