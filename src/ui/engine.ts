import { type BitVec } from '../lpn/bits';
import { HBReader, HBTag, runSession } from '../lpn/hb';
import { BiasedBit, RandomPool, webCryptoSource, randomVec, type NoiseSource } from '../lpn/noise';
import { SeededSource } from '../lpn/seeded';
import { type Params } from '../lpn/params';

/**
 * Shared live engine for the panels: one WebCrypto-backed pool, and helpers
 * that run REAL sessions so every observed frequency on the page comes from
 * sessions actually executed here, never from a formula (invariant 1, and the
 * exhibit-2 requirement). A panel may pass a SeededSource for a reproducible
 * run; the default is `crypto.getRandomValues`.
 */

export function livePool(): RandomPool {
  return new RandomPool(webCryptoSource);
}

export function seededPool(seed: number): RandomPool {
  return new RandomPool(new SeededSource(seed));
}

/** Run one honest HB session: a fresh random secret, r noisy rounds, accept test. */
export function honestHB(params: Params, pool: RandomPool): { accepted: boolean; failures: number } {
  const x = randomVec(params.k, pool);
  const noise: NoiseSource = params.eta.num === 0n ? { bit: () => 0 } : new BiasedBit(params.eta, pool);
  const tag = new HBTag(x, noise);
  const reader = new HBReader(x);
  const challenges = Array.from({ length: params.r }, () => randomVec(params.k, pool));
  const res = runSession(tag, reader, challenges, params.t);
  return { accepted: res.accepted, failures: res.failures };
}

/** A tag that answers each challenge with a fair coin — the random guesser. */
export function guessHB(params: Params, pool: RandomPool): { accepted: boolean; failures: number } {
  const x = randomVec(params.k, pool);
  const reader = new HBReader(x);
  let failures = 0;
  for (let i = 0; i < params.r; i++) {
    const a = randomVec(params.k, pool);
    const z = (pool.uniformBits(1) & 1n) === 1n ? 1 : 0;
    if (reader.check(a, z as 0 | 1).failed) failures++;
  }
  return { accepted: failures <= params.t, failures };
}

/** Observe N honest and N guess sessions; report how many each accepted. */
export function observeRates(params: Params, pool: RandomPool, n: number): {
  honestRejects: number;
  guessAccepts: number;
  n: number;
} {
  let honestRejects = 0;
  let guessAccepts = 0;
  for (let i = 0; i < n; i++) {
    if (!honestHB(params, pool).accepted) honestRejects++;
    if (guessHB(params, pool).accepted) guessAccepts++;
  }
  return { honestRejects, guessAccepts, n };
}

/** A single detailed honest session, for the per-round strip. */
export function detailedHonest(params: Params, pool: RandomPool): {
  x: BitVec;
  rounds: { failed: boolean }[];
  failures: number;
  accepted: boolean;
} {
  const x = randomVec(params.k, pool);
  const noise: NoiseSource = params.eta.num === 0n ? { bit: () => 0 } : new BiasedBit(params.eta, pool);
  const tag = new HBTag(x, noise);
  const reader = new HBReader(x);
  const challenges = Array.from({ length: params.r }, () => randomVec(params.k, pool));
  const res = runSession(tag, reader, challenges, params.t);
  return { x, rounds: res.rounds.map((r) => ({ failed: r.failed })), failures: res.failures, accepted: res.accepted };
}
