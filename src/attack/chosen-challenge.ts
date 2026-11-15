import { type Bit, type BitVec, dot, unit } from '../lpn/bits';
import { type Equation, solve, type Solve, IndependentSet } from '../lpn/gf2';

/**
 * The chosen-challenge break of HB by a malicious reader (ePrint 2005/237, §2):
 * since ν is biased below 1/2, sending the SAME challenge a many times and
 * taking the majority of the replies recovers a·x; k linearly independent
 * challenges then give x by Gaussian elimination over GF(2).
 *
 * The attacker sees ONLY the oracle — it may send a challenge and read the
 * noisy reply, nothing else. It never holds x. (Invariant 3.)
 */

export interface HBChallengeOracle {
  /** The tag's reply z = a·x ⊕ ν to a chosen challenge a. */
  query(a: BitVec): Bit;
}

export interface MajorityVote {
  readonly a: BitVec;
  readonly ones: number;
  readonly total: number;
  /** The majority bit, taken as a·x. */
  readonly bit: Bit;
}

export interface ChosenChallengeResult {
  readonly votes: readonly MajorityVote[];
  readonly solve: Solve;
  /** Recovered x when the system solved, else null — the attack code never calls it "correct". */
  readonly x: BitVec | null;
}

/**
 * Recover x. Challenges default to the k single-bit unit vectors, which are
 * independent by construction, so each majority directly measures one bit of x
 * (e_i · x = x_i) and the "Gaussian elimination" is the identity — the honest
 * demonstration that at η = 0, n = 1 the attack is immediate. A caller may pass
 * its own independent challenge set to show the elimination doing real work.
 *
 * `n` is the repetitions per challenge; it must be odd so a majority exists.
 */
export function breakHB(
  oracle: HBChallengeOracle,
  k: number,
  n: number,
  challenges?: readonly BitVec[],
  trace = false
): ChosenChallengeResult {
  if (n % 2 === 0) throw new RangeError('n must be odd');
  const set = challenges ?? Array.from({ length: k }, (_, i) => unit(k, i));
  const votes: MajorityVote[] = [];
  const equations: Equation[] = [];
  for (const a of set) {
    let ones = 0;
    for (let j = 0; j < n; j++) ones += oracle.query(a);
    const bit: Bit = ones * 2 > n ? 1 : 0;
    votes.push({ a, ones, total: n, bit });
    equations.push({ a, z: bit });
  }
  const result = solve(equations, k, trace);
  return { votes, solve: result, x: result.status === 'solved' ? result.x : null };
}

/**
 * The same attack run against an HB+ oracle fails: the b·y term changes every
 * round, so repeating a no longer isolates a·x and the recovered vector does
 * not authenticate. This helper exists so exhibit 4 can run the identical
 * majority-vote logic against an HB+ tag and SHOW the recovered vector is wrong
 * rather than assert that it is.
 */
export function breakHBPlusAttempt(
  oracle: HBChallengeOracle,
  k: number,
  n: number,
  trace = false
): ChosenChallengeResult {
  return breakHB(oracle, k, n, undefined, trace);
}

/** Verify a recovered vector against the oracle by re-deriving one more parity. */
export function independentChallengeSet(k: number): BitVec[] {
  const set: BitVec[] = [];
  const basis = new IndependentSet(k);
  for (let i = 0; i < k; i++) {
    const u = unit(k, i);
    if (basis.tryAdd(u)) set.push(u);
  }
  return set;
}

/** For tests: the exact parity a·x, so an oracle can be checked independently of breakHB. */
export function parityOf(a: BitVec, x: BitVec): Bit {
  return dot(a, x);
}
