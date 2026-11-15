import { add, mul, pow, rational, sub, ONE, ZERO, type Rational } from './rational';
import type { Protocol } from './params';

/**
 * The exact error rates of an r-round, threshold-t authentication with noise
 * rate η, as binomial tails over exact rationals.
 *
 *   false reject  P_FR = Σ_{i=t+1..r} C(r,i) η^i (1−η)^(r−i)
 *                   — an honest tag fails more than t checks.
 *   false accept  P_FA = 2^(−r) Σ_{i=0..t} C(r,i)
 *                   — a guesser's checks each fail with probability 1/2.
 *
 * These are the formulas used, with the same notation, in Gilbert, Robshaw and
 * Seurin's HB# paper (IACR ePrint 2008/028, Section 2), whose Table 1 the
 * brief's acceptance values were cross-checked against. Nothing here is a
 * literal: every number the page prints is computed from r, t and η.
 */

const binomialCache = new Map<string, bigint>();

/** C(n, i) by the multiplicative formula, exact. */
export function binomial(n: number, i: number): bigint {
  if (i < 0 || i > n) return 0n;
  const key = `${n},${i}`;
  const hit = binomialCache.get(key);
  if (hit !== undefined) return hit;
  let c = 1n;
  const m = Math.min(i, n - i);
  for (let j = 1; j <= m; j++) c = (c * BigInt(n - m + j)) / BigInt(j);
  binomialCache.set(key, c);
  return c;
}

/** P[Binomial(n, p) ∈ [lo, hi]] exactly. */
export function binomialRange(n: number, p: Rational, lo: number, hi: number): Rational {
  const q = sub(ONE, p);
  let total = ZERO;
  for (let i = Math.max(0, lo); i <= Math.min(n, hi); i++) {
    total = add(total, mul(rational(binomial(n, i), 1n), mul(pow(p, i), pow(q, n - i))));
  }
  return total;
}

/** An honest tag is rejected: more than t of its r noisy replies fail the check. */
export function falseReject(r: number, t: number, eta: Rational): Rational {
  return binomialRange(r, eta, t + 1, r);
}

/** A tag answering at random is accepted: at most t of r fair coins come up wrong. */
export function falseAccept(r: number, t: number): Rational {
  let sum = 0n;
  for (let i = 0; i <= Math.min(t, r); i++) sum += binomial(r, i);
  return rational(sum, 1n << BigInt(r));
}

/**
 * A tampered session with δ·x = 1 is accepted: every noiseless round now FAILS
 * and only the noisy ones pass, so the failures are Binomial(r, 1−η) and the
 * reader accepts when they number at most t.
 */
export function tamperedAccept(r: number, t: number, eta: Rational): Rational {
  return binomialRange(r, sub(ONE, eta), 0, t);
}

/** The majority of n noisy copies of one bit is wrong: at least ⌈n/2⌉ of them flipped. n odd. */
export function majorityError(n: number, eta: Rational): Rational {
  if (n % 2 === 0) throw new RangeError('majority error needs an odd n');
  return binomialRange(n, eta, (n + 1) / 2, n);
}

/**
 * Expected sessions for the repeat-until-accept man in the middle over k
 * single-bit δ's: a bit that is 0 costs a geometric number of sessions capped
 * at m, Σ_{j<m} P_FR^j; a bit that is 1 costs the full m. Half of each on
 * average.
 */
export function expectedMitmSessions(k: number, m: number, pfr: Rational): Rational {
  let zeroCost = ZERO;
  for (let j = 0; j < m; j++) zeroCost = add(zeroCost, pow(pfr, j));
  const perBit = mul(rational(1n, 2n), add(zeroCost, rational(BigInt(m), 1n)));
  return mul(rational(BigInt(k), 1n), perBit);
}

/** Bits on the air per authentication: HB sends a and z per round, HB+ adds b. */
export function transmissionBits(protocol: Protocol, k: number, r: number): number {
  return protocol === 'HB' ? r * (k + 1) : r * (2 * k + 1);
}
