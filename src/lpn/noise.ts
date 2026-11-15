import { type Bit, type BitVec, fromBytes } from './bits';
import type { Rational } from './rational';

/**
 * Randomness for the page, in two layers.
 *
 * `RandomSource` yields uniform bytes. The page uses exactly one
 * implementation, `webCryptoSource`, which is `crypto.getRandomValues`;
 * `Math.random` appears nowhere under `src/`. Tests inject deterministic
 * sources through the same interface, so every seeded run below exercises the
 * identical sampling code the page runs.
 *
 * `BiasedBit` draws the LPN noise bit ν, equal to 1 with probability η = p/q.
 * It is rejection-sampled and the decision is an integer comparison against a
 * threshold — no modulo reduction and no floating point anywhere in the draw:
 *
 *   draw u uniform in [0, 2^W)      with W = bits(q) + 32
 *   let c = ⌊2^W / q⌋, L = c·q      (L is the largest multiple of q below 2^W)
 *   if u ≥ L, throw it away and draw again    (probability < q / 2^W ≤ 2^−32)
 *   ν = 1  iff  u < c·p
 *
 * Conditioned on u < L, u is uniform on L = c·q equally likely values and
 * exactly c·p of them lie below the threshold, so P[ν = 1] = p/q exactly.
 */

export interface RandomSource {
  /** Fill `out` with uniform random bytes. */
  fill(out: Uint8Array): void;
}

/** The only source the page uses. getRandomValues caps one call at 65 536 bytes. */
export const webCryptoSource: RandomSource = {
  fill(out: Uint8Array): void {
    // getRandomValues caps one call at 65 536 bytes. The cast pins the buffer
    // type to ArrayBuffer: a subarray's generic is ArrayBufferLike, which the
    // lib.dom signature does not accept under strict settings.
    for (let i = 0; i < out.length; i += 65536) {
      const chunk = out.subarray(i, Math.min(i + 65536, out.length)) as Uint8Array<ArrayBuffer>;
      crypto.getRandomValues(chunk);
    }
  },
};

/**
 * Buffered view over a source, so a 224-bit challenge or a noise draw does not
 * cost one `getRandomValues` call each. Hands out bytes in order; never reuses.
 */
export class RandomPool {
  private buf = new Uint8Array(0);
  private pos = 0;

  constructor(private readonly source: RandomSource, private readonly chunk = 16384) {}

  bytes(n: number): Uint8Array {
    if (n > this.chunk) {
      const out = new Uint8Array(n);
      this.source.fill(out);
      return out;
    }
    if (this.pos + n > this.buf.length) {
      this.buf = new Uint8Array(this.chunk);
      this.source.fill(this.buf);
      this.pos = 0;
    }
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  /** A uniform unsigned integer of `bits` bits, as a bigint. */
  uniformBits(bits: number): bigint {
    const nBytes = Math.ceil(bits / 8);
    const raw = this.bytes(nBytes);
    let v = 0n;
    for (const b of raw) v = (v << 8n) | BigInt(b);
    const excess = nBytes * 8 - bits;
    return excess > 0 ? v >> BigInt(excess) : v;
  }
}

function bitLength(n: bigint): number {
  return n === 0n ? 0 : n.toString(2).length;
}

/** The interface the tags consume: one noise bit per round. */
export interface NoiseSource {
  bit(): Bit;
}

/** ν = 1 with probability exactly η, by rejection sampling and a threshold compare. */
export class BiasedBit implements NoiseSource {
  private readonly width: number;
  private readonly limit: bigint;
  private readonly threshold: bigint;

  constructor(eta: Rational, private readonly pool: RandomPool) {
    if (eta.num < 0n || eta.den <= 0n || 2n * eta.num >= eta.den) {
      throw new RangeError('noise rate must satisfy 0 ≤ η < 1/2');
    }
    this.width = bitLength(eta.den) + 32;
    const space = 1n << BigInt(this.width);
    const c = space / eta.den;
    this.limit = c * eta.den;
    this.threshold = c * eta.num;
  }

  bit(): Bit {
    if (this.threshold === 0n) return 0;
    for (;;) {
      const u = this.pool.uniformBits(this.width);
      if (u >= this.limit) continue; // rejection: keeps the remaining draws exactly uniform
      return u < this.threshold ? 1 : 0;
    }
  }
}

/** No noise at all — the η = 0 case, and the false tag's deliberately noiseless replies. */
export const noiseless: NoiseSource = { bit: () => 0 };

/**
 * A scripted noise coin for the by-hand exhibit, where the learner picks ν
 * from the worked table. Throws when the script runs out rather than inventing
 * a bit, so a tag that asks for more rounds than scripted fails loudly.
 */
export function scriptedNoise(bits: readonly Bit[]): NoiseSource {
  let i = 0;
  return {
    bit(): Bit {
      if (i >= bits.length) throw new RangeError('scripted noise exhausted');
      return bits[i++];
    },
  };
}

/** A uniform k-bit vector. */
export function randomVec(k: number, pool: RandomPool): BitVec {
  return fromBytes(k, pool.bytes(Math.ceil(k / 8)));
}
