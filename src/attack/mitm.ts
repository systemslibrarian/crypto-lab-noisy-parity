import { type Bit, type BitVec, bitAt, isZero, unit } from '../lpn/bits';
import { vec } from '../lpn/bits';

/**
 * The man-in-the-middle break of HB+ (ePrint 2005/237, §3).
 *
 * The attacker fixes a k-bit δ and XORs it into the reader's challenge in every
 * one of the r rounds of a session, passing b and z through untouched. The
 * tag then computes z = (a⊕δ)·x ⊕ b·y ⊕ ν, so the reader's check a·x ⊕ b·y is
 * off by exactly δ·x in every round. If δ·x = 0 the session looks honest; if
 * δ·x = 1 every noiseless round fails. Accept or reject therefore reveals δ·x,
 * and single-bit δ's give x bit by bit.
 *
 * THE HONEST SUBTLETY (brief, and this is the lab's best exhibit). The note
 * says accept/reject reveals δ·x "with overwhelming probability", but that is
 * exact for reject-means-1 only when an honest session almost always passes. At
 * the proposed threshold an honest session fails ~44% of the time, so ONE
 * session per bit is not enough: an acceptance is conclusive (δ·x = 0), a
 * rejection is ambiguous. The working attack repeats a δ until the first
 * acceptance (bit = 0) or until m rejections in a row (bit = 1, with residual
 * error P_FR^m). Nothing here papers that over.
 *
 * The attacker sees ONLY the oracle — it may run a session tampered by a δ it
 * chooses and learn accept/reject, nothing else. It never holds x or y.
 */

export interface MitmOracle {
  /** Run one full HB+ session with every challenge XORed by δ; return whether the reader accepted. */
  runTamperedSession(delta: BitVec): boolean;
}

export interface BitRecovery {
  readonly index: number;
  readonly delta: BitVec;
  /** Sessions spent on this bit. */
  readonly sessions: number;
  /** true once an acceptance was seen. */
  readonly accepted: boolean;
  /** The bit as the attack concluded it: 0 on acceptance, 1 after m rejections. */
  readonly bit: Bit;
}

export interface MitmResult {
  readonly recoveries: readonly BitRecovery[];
  readonly x: BitVec;
  readonly totalSessions: number;
}

/**
 * Recover one bit x_i with the single-bit δ = e_i and patience m.
 *
 * Returns on the first acceptance (bit 0) or after m consecutive rejections
 * (bit 1). m is the ONLY knob the learner sets; at m = 1 a single rejection
 * declares the bit 1, which is why m = 1 recovers a wrong key at the default
 * threshold (brief acceptance D) — exactly what stops a canned "recovered"
 * verdict.
 */
export function recoverBit(oracle: MitmOracle, k: number, index: number, m: number): BitRecovery {
  const delta = unit(k, index);
  // [mitm-accept-rule] A single acceptance is CONCLUSIVE (δ·x = 0, bit 0): stop
  // at once. Only m rejections in a row conclude bit 1, with residual error
  // P_FR^m. The early stop on the first acceptance is also what makes the
  // session count sub-linear in m for the many zero bits (brief acceptance D).
  let sessions = 0;
  for (let attempt = 0; attempt < m; attempt++) {
    sessions++;
    if (oracle.runTamperedSession(delta)) {
      return { index, delta, sessions, accepted: true, bit: 0 };
    }
  }
  return { index, delta, sessions, accepted: false, bit: 1 };
}

/** Recover the whole of x, bit by bit, with single-bit δ's and patience m. */
export function breakHBPlus(oracle: MitmOracle, k: number, m: number): MitmResult {
  const recoveries: BitRecovery[] = [];
  let value = 0n;
  let total = 0;
  for (let i = 0; i < k; i++) {
    const rec = recoverBit(oracle, k, i, m);
    recoveries.push(rec);
    if (rec.bit === 1) value |= 1n << BigInt(k - 1 - i);
    total += rec.sessions;
  }
  return { recoveries, x: vec(k, value), totalSessions: total };
}

/**
 * A single learner-chosen δ, for the "poke it once" control in exhibit 5. A
 * zero δ tampers with nothing and reveals nothing; it is reported as such and
 * NOT counted as a learned bit (edge case; invariant).
 */
export interface SingleDelta {
  readonly delta: BitVec;
  readonly accepted: boolean;
  readonly reveals: 'delta·x = 0' | 'delta·x = 1' | 'nothing';
  readonly degenerate: boolean;
}

export function probeDelta(oracle: MitmOracle, delta: BitVec): SingleDelta {
  if (isZero(delta)) {
    return { delta, accepted: true, reveals: 'nothing', degenerate: true };
  }
  const accepted = oracle.runTamperedSession(delta);
  return { delta, accepted, reveals: accepted ? 'delta·x = 0' : 'delta·x = 1', degenerate: false };
}

/** For tests: δ·x, so the oracle's accept/reject can be predicted independently. */
export function deltaDotX(delta: BitVec, x: BitVec): Bit {
  let acc = 0;
  for (let i = 0; i < delta.k; i++) acc ^= bitAt(delta, i) & bitAt(x, i);
  return (acc & 1) as Bit;
}
