import { type Bit, type BitVec, vec } from './bits';
import { REFUSAL, type Refusal } from './params';

/**
 * Linear algebra over GF(2): rank, an incremental basis, and Gaussian
 * elimination that solves `a_i · x = z_i` for x and records every pivot so
 * the page can replay it.
 *
 * Each row is one augmented equation held as a bigint: the k challenge bits
 * followed by the right-hand side as the LOWEST bit, so column j (left to
 * right) is bit position k − j of the row and the constant is bit 0.
 */

export interface Equation {
  readonly a: BitVec;
  readonly z: Bit;
}

export interface EliminationStep {
  /** The column being cleared, left to right. */
  readonly col: number;
  /** The row chosen as pivot BEFORE any swap. */
  readonly pivotRow: number;
  /** When the pivot had to move up, where it came from; otherwise null. */
  readonly swappedFrom: number | null;
  /** Rows that had the column set and were XORed with the pivot row. */
  readonly eliminated: readonly number[];
  /** Row snapshots after the step, as bit strings `aaaa…|z` (only when tracing). */
  readonly rows?: readonly string[];
}

export type Solve =
  | { readonly status: 'solved'; readonly x: BitVec; readonly rank: number; readonly steps: readonly EliminationStep[] }
  | { readonly status: 'dependent'; readonly rank: number; readonly steps: readonly EliminationStep[]; readonly refusal: Refusal }
  | { readonly status: 'inconsistent'; readonly rank: number; readonly steps: readonly EliminationStep[] };

function rowString(row: bigint, k: number): string {
  const s = row.toString(2).padStart(k + 1, '0');
  return `${s.slice(0, k)}|${s.slice(k)}`;
}

/**
 * Gauss–Jordan elimination. With k independent equations the matrix reduces to
 * the identity and x is read off the constants column. Fewer independent rows
 * than unknowns is reported as `dependent` with the rank — and refused, because
 * a system that does not determine x has no answer to show.
 */
export function solve(equations: readonly Equation[], k: number, trace = false): Solve {
  for (const e of equations) {
    if (e.a.k !== k) throw new RangeError(`equation length ${e.a.k} does not match k = ${k}`);
  }
  const rows = equations.map((e) => (e.a.v << 1n) | BigInt(e.z));
  const steps: EliminationStep[] = [];
  let rank = 0;
  for (let col = 0; col < k && rank < rows.length; col++) {
    const bit = 1n << BigInt(k - col);
    let pivot = -1;
    for (let i = rank; i < rows.length; i++) {
      if ((rows[i] & bit) !== 0n) {
        pivot = i;
        break;
      }
    }
    if (pivot === -1) continue; // no pivot in this column: rank-deficient
    let swappedFrom: number | null = null;
    if (pivot !== rank) {
      [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
      swappedFrom = pivot;
    }
    const eliminated: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (i !== rank && (rows[i] & bit) !== 0n) {
        rows[i] ^= rows[rank];
        eliminated.push(i);
      }
    }
    steps.push({
      col,
      pivotRow: pivot,
      swappedFrom,
      eliminated,
      ...(trace ? { rows: rows.map((r) => rowString(r, k)) } : {}),
    });
    rank++;
  }
  // Any surviving row with no challenge bits but a 1 on the right is 0 = 1.
  for (let i = rank; i < rows.length; i++) {
    if (rows[i] === 1n) return { status: 'inconsistent', rank, steps };
  }
  if (rank < k) {
    return {
      status: 'dependent',
      rank,
      steps,
      refusal: {
        code: REFUSAL.DEPENDENT_CHALLENGES,
        message: `The ${equations.length} challenges span only ${rank} of ${k} dimensions, so they do not determine x. Refused: ${k - rank} more independent challenge${k - rank === 1 ? '' : 's'} would be needed.`,
      },
    };
  }
  // Reduced form: row i has its single 1 in column i, so x_i is its constant bit.
  let x = 0n;
  for (let i = 0; i < k; i++) {
    if ((rows[i] & 1n) !== 0n) x |= 1n << BigInt(k - 1 - i);
  }
  return { status: 'solved', x: vec(k, x), rank, steps };
}

/** Rank of a set of k-bit vectors. */
export function rank(vectors: readonly BitVec[]): number {
  if (vectors.length === 0) return 0;
  const k = vectors[0].k;
  const basis = new IndependentSet(k);
  for (const v of vectors) basis.tryAdd(v);
  return basis.size;
}

/**
 * An incrementally maintained basis in echelon form. `tryAdd` accepts a vector
 * only when it is independent of everything accepted so far, which is how the
 * attacks build a full-rank challenge set without ever having to retry.
 */
export class IndependentSet {
  /** Basis vectors indexed by their leading bit position. */
  private readonly byLead = new Map<number, bigint>();

  constructor(public readonly k: number) {}

  get size(): number {
    return this.byLead.size;
  }

  /** Reduce v against the basis; a non-zero remainder is new and gets kept. */
  tryAdd(v: BitVec): boolean {
    if (v.k !== this.k) throw new RangeError(`vector length ${v.k} does not match k = ${this.k}`);
    let r = v.v;
    while (r !== 0n) {
      const lead = r.toString(2).length - 1;
      const b = this.byLead.get(lead);
      if (b === undefined) {
        this.byLead.set(lead, r);
        return true;
      }
      r ^= b;
    }
    return false;
  }

  /** Is v in the span of the vectors accepted so far? */
  contains(v: BitVec): boolean {
    let r = v.v;
    while (r !== 0n) {
      const lead = r.toString(2).length - 1;
      const b = this.byLead.get(lead);
      if (b === undefined) return false;
      r ^= b;
    }
    return true;
  }
}
