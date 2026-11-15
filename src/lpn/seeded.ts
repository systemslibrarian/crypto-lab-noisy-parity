import { type RandomSource } from './noise';

/**
 * A deterministic RandomSource for tests and for seeded page runs. It
 * implements the SAME interface the page's WebCrypto source does (invariant 1:
 * "Tests inject a deterministic source through the same interface"), so a
 * seeded run exercises the identical sampling, challenge-drawing and noise code
 * the live page runs — only the byte stream is reproducible.
 *
 * The stream is splitmix64, a standard, well-distributed counter-based PRNG.
 * It is NOT cryptographic and is never used for anything on the live page
 * except an explicit "seeded run" the learner asks for; `crypto.getRandomValues`
 * is the page's only other source.
 */
export class SeededSource implements RandomSource {
  private state: bigint;
  private static readonly MASK = (1n << 64n) - 1n;

  constructor(seed: number | bigint) {
    this.state = BigInt(seed) & SeededSource.MASK;
  }

  private next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & SeededSource.MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & SeededSource.MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & SeededSource.MASK;
    return z ^ (z >> 31n);
  }

  fill(out: Uint8Array): void {
    let i = 0;
    while (i < out.length) {
      let word = this.next();
      for (let b = 0; b < 8 && i < out.length; b++) {
        out[i++] = Number(word & 0xffn);
        word >>= 8n;
      }
    }
  }
}
