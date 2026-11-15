/**
 * Exact rationals over `bigint`, for noise rates and the binomial tails.
 *
 * Every probability this page shows is computed here as an exact fraction and
 * rounded only for display. No probability is a literal anywhere in `src/`.
 */

export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

/** Reduced fraction with a positive denominator. */
export function rational(num: bigint, den: bigint): Rational {
  if (den === 0n) throw new RangeError('zero denominator');
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return g > 1n ? { num: num / g, den: den / g } : { num, den };
}

export const ZERO: Rational = { num: 0n, den: 1n };
export const ONE: Rational = { num: 1n, den: 1n };

export function add(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mul(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new RangeError('division by zero');
  return rational(a.num * b.den, a.den * b.num);
}

export function pow(a: Rational, e: number): Rational {
  if (!Number.isInteger(e) || e < 0) throw new RangeError(`exponent must be a non-negative integer, got ${e}`);
  return rational(a.num ** BigInt(e), a.den ** BigInt(e));
}

/** −1, 0 or 1 as a < b, a = b, a > b. */
export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const l = a.num * b.den;
  const r = b.num * a.den;
  return l < r ? -1 : l > r ? 1 : 0;
}

export function equals(a: Rational, b: Rational): boolean {
  return compare(a, b) === 0;
}

/** Nearest double, for sliders and sanity checks only; never for a displayed value. */
export function toNumber(a: Rational): number {
  const scale = 10n ** 18n;
  return Number((a.num * scale) / a.den) / 1e18;
}

/**
 * Parse a noise rate typed by a learner: a decimal (`0.25`, `.125`, `0`), a
 * fraction (`1/4`, `3/16`) or a percentage (`25%`). Returns null for anything
 * else — the caller turns null into a named refusal.
 */
export function parseRational(text: string): Rational | null {
  const s = text.trim();
  let m = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) {
    const den = BigInt(m[2]);
    if (den === 0n) return null;
    return rational(BigInt(m[1]), den);
  }
  m = /^(\d*)(?:\.(\d+))?(%)?$/.exec(s);
  if (!m || (m[1] === '' && m[2] === undefined)) return null;
  const whole = m[1] === '' ? '0' : m[1];
  const frac = m[2] ?? '';
  const num = BigInt(whole + frac);
  const den = 10n ** BigInt(frac.length) * (m[3] ? 100n : 1n);
  return rational(num, den);
}

/** Round num/den · 10^digits to the nearest integer, halves up. */
function roundScaled(a: Rational, digits: number): bigint {
  const scaled = a.num * 10n ** BigInt(digits);
  return (2n * scaled + a.den) / (2n * a.den);
}

/**
 * Display form with `sig` significant digits: fixed notation at or above 0.1
 * (`0.4403`, `1.000`), scientific below it (`4.290e-6`). Exact arithmetic up
 * to the final rounding, which is the only inexact step.
 */
export function formatRational(a: Rational, sig = 4): string {
  if (a.num === 0n) return '0';
  if (a.num < 0n) return `-${formatRational({ num: -a.num, den: a.den }, sig)}`;
  if (compare(a, ONE) >= 0) {
    // 1 or more: `sig` significant digits with the integer part counted.
    const intDigits = (a.num / a.den).toString().length;
    const frac = Math.max(0, sig - intDigits);
    const r = roundScaled(a, frac);
    const s = r.toString().padStart(frac + 1, '0');
    return frac === 0 ? s : `${s.slice(0, -frac)}.${s.slice(-frac)}`;
  }
  if (10n * a.num >= a.den) {
    // 0.1 ≤ a < 1: `sig` decimals.
    let r = roundScaled(a, sig);
    if (r === 10n ** BigInt(sig)) return `1.${'0'.repeat(sig - 1)}`;
    const s = r.toString().padStart(sig, '0');
    void (r = 0n);
    return `0.${s}`;
  }
  // Below 0.1: find e ≥ 1 with 1 ≤ a·10^e < 10.
  let e = 1;
  while (10n ** BigInt(e) * a.num < a.den) e++;
  const mantissa = { num: a.num * 10n ** BigInt(e), den: a.den };
  let r = roundScaled(mantissa, sig - 1);
  if (r >= 10n ** BigInt(sig)) {
    // Rounded up to 10.000: shift the exponent.
    r = 10n ** BigInt(sig - 1);
    e -= 1;
  }
  const s = r.toString();
  return `${s[0]}.${s.slice(1)}e-${e}`;
}
