import { type Bit, type BitVec, dot, unit } from '../lpn/bits';
import { vec } from '../lpn/bits';

/**
 * Recovering y, and impersonation, once x is known (ePrint 2005/237, §3 and
 * footnote 2).
 *
 * The attacker now plays a FALSE TAG against a legitimate reader. It sends a
 * chosen blinding vector b and answers each challenge a with z = a·x — the true
 * parity, with NO noise, which it can do because x is known. The reader's check
 * a·x ⊕ b·y = z then fails in every round exactly when b·y = 1. So:
 *
 *   session accepts  ⇒  b·y = 0
 *   session rejects  ⇒  b·y = 1
 *
 * and single-bit b's give y one bit at a time, deterministically, in k
 * sessions. With b = 0 the tag is simply accepted — that is the impersonation.
 *
 * Because the replies carry no noise, this recovery is exact and needs exactly
 * one session per bit, unlike the probabilistic man-in-the-middle recovery of
 * x. It depends on x being correct: given a WRONG x the answers are wrong and
 * the recovered y does not match (brief acceptance D). The attacker holds the
 * x it recovered; it still never holds y.
 */

export interface FalseTagOracle {
  /**
   * Run one session in which the attacker plays the tag: it supplies the
   * blinding vector b and a reply function answering each reader challenge a.
   * Returns whether the legitimate reader accepted.
   */
  runAsFalseTag(b: BitVec, answer: (a: BitVec) => Bit): boolean;
}

export interface YBitRecovery {
  readonly index: number;
  readonly b: BitVec;
  readonly accepted: boolean;
  readonly bit: Bit;
}

export interface FalseTagResult {
  readonly recoveries: readonly YBitRecovery[];
  readonly y: BitVec;
  readonly sessions: number;
}

/** The noiseless reply function a false tag uses, given a known x: answer(a) = a·x. */
export function replyWith(x: BitVec): (a: BitVec) => Bit {
  return (a: BitVec) => dot(a, x);
}

/** Recover y using the known x, one single-bit b per bit. */
export function recoverY(oracle: FalseTagOracle, knownX: BitVec, k: number): FalseTagResult {
  const answer = replyWith(knownX);
  const recoveries: YBitRecovery[] = [];
  let value = 0n;
  for (let i = 0; i < k; i++) {
    const b = unit(k, i);
    const accepted = oracle.runAsFalseTag(b, answer);
    const bit: Bit = accepted ? 0 : 1; // accept ⇒ b·y = 0
    if (bit === 1) value |= 1n << BigInt(k - 1 - i);
    recoveries.push({ index: i, b, accepted, bit });
  }
  return { recoveries, y: vec(k, value), sessions: k };
}

export interface Impersonation {
  readonly b: BitVec;
  readonly accepted: boolean;
}

/** Impersonate with b = 0 and noiseless replies z = a·x. Accepted whenever x is right. */
export function impersonate(oracle: FalseTagOracle, knownX: BitVec, k: number): Impersonation {
  const b = vec(k, 0n);
  const accepted = oracle.runAsFalseTag(b, replyWith(knownX));
  return { b, accepted };
}

/** For tests: the exact b·y, to predict accept/reject independently of recoverY. */
export function blindDotY(b: BitVec, y: BitVec): Bit {
  return dot(b, y);
}
