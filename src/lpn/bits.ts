/**
 * k-bit vectors over GF(2), and the one operation every protocol on this page
 * is built from: the parity of a bitwise AND, written `a·x`.
 *
 * REPRESENTATION. A vector is a `bigint` holding exactly k bits, carried with
 * its length. The PRINTED form reads left to right: bit i of the string
 * `10110010` is bit position k−1−i of the integer, so the string is simply the
 * integer in binary, zero-padded to k digits. k = 224 is the published size;
 * nothing here assumes a word boundary, so k = 8 (the by-hand exhibit) and
 * k ≤ 16 (the exhaustive-search exhibit) use the same code path.
 */

export type Bit = 0 | 1;

export interface BitVec {
  readonly k: number;
  readonly v: bigint;
}

export class LengthMismatch extends Error {
  constructor(public readonly left: number, public readonly right: number) {
    super(`vector lengths differ: ${left} vs ${right}`);
    this.name = 'LengthMismatch';
  }
}

function mask(k: number): bigint {
  return (1n << BigInt(k)) - 1n;
}

/** Build a vector; the value must already fit in k bits. */
export function vec(k: number, v: bigint): BitVec {
  if (!Number.isInteger(k) || k < 1) throw new RangeError(`k must be a positive integer, got ${k}`);
  if (v < 0n || v > mask(k)) throw new RangeError(`value does not fit in ${k} bits`);
  return { k, v };
}

export function zero(k: number): BitVec {
  return vec(k, 0n);
}

/** The unit vector with a single 1 at left-to-right position i. */
export function unit(k: number, i: number): BitVec {
  if (!Number.isInteger(i) || i < 0 || i >= k) throw new RangeError(`index ${i} outside 0..${k - 1}`);
  return vec(k, 1n << BigInt(k - 1 - i));
}

/** Parse a left-to-right bit string such as `10110010`. */
export function fromBits(s: string): BitVec {
  if (!/^[01]+$/.test(s)) throw new RangeError(`not a bit string: ${JSON.stringify(s)}`);
  return vec(s.length, BigInt(`0b${s}`));
}

export function toBits(x: BitVec): string {
  return x.v.toString(2).padStart(x.k, '0');
}

/** The bits, left to right, as numbers. */
export function bitsOf(x: BitVec): Bit[] {
  return Array.from(toBits(x), (c) => (c === '1' ? 1 : 0));
}

export function bitAt(x: BitVec, i: number): Bit {
  if (!Number.isInteger(i) || i < 0 || i >= x.k) throw new RangeError(`index ${i} outside 0..${x.k - 1}`);
  return ((x.v >> BigInt(x.k - 1 - i)) & 1n) === 1n ? 1 : 0;
}

/** Take the low k bits of a byte string (big-endian), discarding the rest. */
export function fromBytes(k: number, bytes: Uint8Array): BitVec {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return vec(k, v & mask(k));
}

function sameLength(a: BitVec, b: BitVec): void {
  if (a.k !== b.k) throw new LengthMismatch(a.k, b.k);
}

export function xor(a: BitVec, b: BitVec): BitVec {
  sameLength(a, b);
  return { k: a.k, v: a.v ^ b.v };
}

export function and(a: BitVec, b: BitVec): BitVec {
  sameLength(a, b);
  return { k: a.k, v: a.v & b.v };
}

export function equal(a: BitVec, b: BitVec): boolean {
  return a.k === b.k && a.v === b.v;
}

/** Number of set bits, 32 bits at a time (SWAR popcount per word). */
export function popcount(v: bigint): number {
  let count = 0;
  let rest = v;
  while (rest > 0n) {
    let n = Number(rest & 0xffffffffn);
    n -= (n >>> 1) & 0x55555555;
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    count += (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    rest >>= 32n;
  }
  return count;
}

export function parity(v: bigint): Bit {
  return (popcount(v) & 1) as Bit;
}

/** `a·x`: the parity (XOR) of the bitwise AND. Throws on unequal lengths. */
export function dot(a: BitVec, x: BitVec): Bit {
  sameLength(a, x);
  return parity(a.v & x.v);
}

/** Number of positions where the two vectors differ. */
export function hamming(a: BitVec, b: BitVec): number {
  sameLength(a, b);
  return popcount(a.v ^ b.v);
}

export function isZero(x: BitVec): boolean {
  return x.v === 0n;
}
