import { type Bit, type BitVec, dot, vec } from '../lpn/bits';

/**
 * The passive eavesdropper, at TOY size only (exhibit 7).
 *
 * A passive listener records q honest rounds (a_i, z_i) and simply tries every
 * one of the 2^k candidate keys, scoring each by how many recorded rounds it
 * satisfies (z_i = a·x). The true key satisfies all but the ~ηq noisy rounds,
 * so the best-scoring candidate is almost always right — but the work DOUBLES
 * with each added key bit, which is the whole lesson: this is 2^k, feasible to
 * watch at k ≤ 16 and hopeless at k = 224. The better published algorithms
 * (BKW and its successors) are named on the page, not built.
 *
 * [extension] point — `search` is the solver seam; a BKW exhibit would swap this
 * exhaustive scorer for a sub-exponential one behind the same (rounds) → x API.
 */

export interface Recorded {
  readonly a: BitVec;
  readonly z: Bit;
}

export interface ExhaustiveResult {
  readonly k: number;
  readonly candidates: number;
  /** The best-scoring key. */
  readonly best: BitVec;
  /** Rounds it satisfies, out of q. */
  readonly bestScore: number;
  readonly q: number;
  /** All keys tying for the best score — ambiguity when too few rounds were recorded. */
  readonly ties: number;
}

/** Score one candidate: how many recorded rounds have z = a·candidate. */
export function score(candidate: BitVec, rounds: readonly Recorded[]): number {
  let s = 0;
  for (const { a, z } of rounds) if (dot(a, candidate) === z) s++;
  return s;
}

/**
 * Exhaustive search over all 2^k candidates. The cap is enforced by the caller
 * (params.validateExhaustiveK); this function trusts k ≤ 16 and would otherwise
 * loop 2^k times.
 */
export function search(k: number, rounds: readonly Recorded[]): ExhaustiveResult {
  const total = 1n << BigInt(k);
  let best = vec(k, 0n);
  let bestScore = -1;
  let ties = 0;
  for (let i = 0n; i < total; i++) {
    const cand = vec(k, i);
    const s = score(cand, rounds);
    if (s > bestScore) {
      bestScore = s;
      best = cand;
      ties = 1;
    } else if (s === bestScore) {
      ties++;
    }
  }
  return { k, candidates: Number(total), best, bestScore, q: rounds.length, ties };
}

/** Work at the next bit, for the "doubling" readout: 2^k candidates. */
export function candidateCount(k: number): bigint {
  return 1n << BigInt(k);
}
