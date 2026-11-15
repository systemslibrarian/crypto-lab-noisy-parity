import { type Bit, type BitVec, dot, equal, xor, zero } from './bits';
import { type NoiseSource } from './noise';
import { type Params } from './params';

/**
 * HB, one round (Hopper–Blum, ASIACRYPT 2001; the round as drawn in Figure 1
 * of Gilbert–Robshaw–Sibert, ePrint 2005/237):
 *
 *   reader → tag :  a            a random k-bit challenge
 *   tag → reader :  z = a·x ⊕ ν  ν a noise bit, 1 with probability η
 *   reader checks:  a·x = z
 *
 * The round repeats r times and the tag is accepted when at most t of the r
 * checks fail. The verdict is computed ONLY from that failure count against t
 * (invariant 2); no other code path sets it.
 */

export interface Round {
  readonly a: BitVec;
  readonly z: Bit;
  /** a·x recomputed by the reader. */
  readonly expected: Bit;
  /** true when the reader's check failed this round. */
  readonly failed: boolean;
  /** the noise bit the tag actually drew, for the by-hand exhibit. */
  readonly nu: Bit;
}

export interface SessionResult {
  readonly rounds: readonly Round[];
  readonly failures: number;
  readonly threshold: number;
  readonly accepted: boolean;
}

/** An HB tag holds x and answers a challenge with one noisy parity bit. */
export class HBTag {
  constructor(public readonly x: BitVec, private readonly noise: NoiseSource) {}

  /** z = a·x ⊕ ν. Returns the reply and the noise bit drawn. */
  reply(a: BitVec): { z: Bit; nu: Bit } {
    const nu = this.noise.bit();
    return { z: (dot(a, this.x) ^ nu) as Bit, nu };
  }
}

/** An HB reader holds x and checks a·x = z. */
export class HBReader {
  constructor(public readonly x: BitVec) {}

  check(a: BitVec, z: Bit): { expected: Bit; failed: boolean } {
    const expected = dot(a, this.x);
    return { expected, failed: expected !== z };
  }
}

/**
 * Run one r-round authentication, given a challenge for each round. The caller
 * supplies the challenges so the attacker modules can choose them; the honest
 * flow draws them at random (see session() below).
 */
export function runSession(
  tag: HBTag,
  reader: HBReader,
  challenges: readonly BitVec[],
  t: number
): SessionResult {
  const rounds: Round[] = [];
  let failures = 0;
  for (const a of challenges) {
    const { z, nu } = tag.reply(a);
    const { expected, failed } = reader.check(a, z);
    if (failed) failures++;
    rounds.push({ a, z, expected, failed, nu });
  }
  return { rounds, failures, threshold: t, accepted: failures <= t };
}

/** Convenience: an honest session with randomly drawn challenges. */
export function honestSession(
  params: Params,
  tag: HBTag,
  reader: HBReader,
  challenge: () => BitVec
): SessionResult {
  const challenges = Array.from({ length: params.r }, challenge);
  return runSession(tag, reader, challenges, params.t);
}

/** The impersonation check in reverse: does this x authenticate as an HB tag against the reader? */
export function authenticatesHB(
  reader: HBReader,
  candidate: BitVec,
  params: Params,
  challenge: () => BitVec,
  noise: NoiseSource
): SessionResult {
  const tag = new HBTag(candidate, noise);
  return honestSession(params, tag, reader, challenge);
}

export function emptyChallenge(k: number): BitVec {
  return zero(k);
}

/** Re-export so attack code can compare recovered keys without importing bits twice. */
export { equal as sameVector, xor as xorVec };
