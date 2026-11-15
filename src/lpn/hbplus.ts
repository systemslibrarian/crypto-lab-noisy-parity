import { type Bit, type BitVec, dot } from './bits';
import { type NoiseSource } from './noise';
import { type Params } from './params';

/**
 * HB+, one round (Juels–Weis, CRYPTO 2005; the round as drawn in Figure 2 of
 * Gilbert–Robshaw–Sibert, ePrint 2005/237):
 *
 *   tag → reader :  b                    a random k-bit blinding vector
 *   reader → tag :  a                    a random k-bit challenge
 *   tag → reader :  z = a·x ⊕ b·y ⊕ ν
 *   reader checks:  a·x ⊕ b·y = z
 *
 * The secret is TWO k-bit vectors x and y. The blinding vector b, sent first by
 * the tag, is what defeats the chosen-challenge attack on HB: repeating a no
 * longer isolates a·x because b·y changes every round.
 *
 * [extension] point — the reader's acceptance rule is a single `failures <= t`
 * here; an HB#-style single-round matrix variant would replace it with a check
 * over an r-bit syndrome, which is why the count and the threshold are kept
 * separate from the per-round check.
 */

export interface RoundPlus {
  readonly b: BitVec;
  readonly a: BitVec;
  readonly z: Bit;
  readonly expected: Bit;
  readonly failed: boolean;
  readonly nu: Bit;
}

export interface SessionResultPlus {
  readonly rounds: readonly RoundPlus[];
  readonly failures: number;
  readonly threshold: number;
  readonly accepted: boolean;
}

export class HBPlusTag {
  constructor(
    public readonly x: BitVec,
    public readonly y: BitVec,
    private readonly noise: NoiseSource,
    private readonly blinding: () => BitVec
  ) {}

  /** The tag's first message: a fresh blinding vector b. */
  blind(): BitVec {
    return this.blinding();
  }

  /** z = a·x ⊕ b·y ⊕ ν. */
  reply(a: BitVec, b: BitVec): { z: Bit; nu: Bit } {
    const nu = this.noise.bit();
    return { z: (dot(a, this.x) ^ dot(b, this.y) ^ nu) as Bit, nu };
  }
}

export class HBPlusReader {
  constructor(public readonly x: BitVec, public readonly y: BitVec) {}

  check(a: BitVec, b: BitVec, z: Bit): { expected: Bit; failed: boolean } {
    const expected = (dot(a, this.x) ^ dot(b, this.y)) as Bit;
    return { expected, failed: expected !== z };
  }
}

/**
 * One honest r-round HB+ authentication. The optional `tamper` hook rewrites
 * the reader's challenge on its way to the tag — this is the single seam the
 * man-in-the-middle attack drives, and it is isolated here so the honest path
 * and the attacked path run the identical session code (invariant 3: the
 * attacker never touches x or y, only the wire).
 */
export function runSessionPlus(
  params: Params,
  tag: HBPlusTag,
  reader: HBPlusReader,
  challenge: () => BitVec,
  tamper?: (a: BitVec) => BitVec
): SessionResultPlus {
  const rounds: RoundPlus[] = [];
  let failures = 0;
  for (let i = 0; i < params.r; i++) {
    const b = tag.blind();
    const a = challenge();
    const aToTag = tamper ? tamper(a) : a;
    const { z, nu } = tag.reply(aToTag, b);
    // The reader checks against the challenge IT sent, a — not the tampered one.
    const { expected, failed } = reader.check(a, b, z);
    if (failed) failures++;
    rounds.push({ b, a, z, expected, failed, nu });
  }
  return { rounds, failures, threshold: params.t, accepted: failures <= params.t };
}

/** Does this (x, y) authenticate as an HB+ tag against the reader? Used to VERIFY a recovered key. */
export function authenticatesHBPlus(
  reader: HBPlusReader,
  x: BitVec,
  y: BitVec,
  params: Params,
  challenge: () => BitVec,
  blinding: () => BitVec,
  noise: NoiseSource
): SessionResultPlus {
  const tag = new HBPlusTag(x, y, noise, blinding);
  return runSessionPlus(params, tag, reader, challenge);
}
