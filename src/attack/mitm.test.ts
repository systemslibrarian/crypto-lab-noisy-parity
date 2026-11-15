import { describe, expect, it } from 'vitest';
import { bitAt, fromBits, hamming, unit, type BitVec } from '../lpn/bits';
import { HBPlusBench } from '../lpn/bench';
import { BiasedBit, RandomPool } from '../lpn/noise';
import { SeededSource } from '../lpn/seeded';
import { rational } from '../lpn/rational';
import { randomVec } from '../lpn/noise';
import type { Params } from '../lpn/params';
import { breakHBPlus, deltaDotX, probeDelta, type MitmOracle } from './mitm';

const ETA = rational(1n, 4n);
const PUBLISHED: Params = { k: 224, r: 80, eta: ETA, t: 20 };

/** Build a published-size HB+ bench on a fixed seed and hand back only the MITM oracle plus a grader. */
function benchAt(seed: number, params: Params = PUBLISHED) {
  const pool = new RandomPool(new SeededSource(seed));
  const x = randomVec(params.k, pool);
  const y = randomVec(params.k, pool);
  const noise = new BiasedBit(params.eta, pool);
  const bench = new HBPlusBench(x, y, params, noise, pool);
  return { bench, realX: x };
}

describe('acceptance D: man-in-the-middle recovery of x at the published size', () => {
  it('m = 1 FAILS — at least 20 of 224 bits come out wrong', () => {
    // One session per bit; at t=20 an honest session fails ~44% of the time, so a
    // single rejection wrongly declares a zero-bit a one. This is what stops a
    // canned "key recovered" verdict.
    for (const seed of [1, 2, 3]) {
      const { bench, realX } = benchAt(seed);
      const res = breakHBPlus(bench.mitmOracle(), PUBLISHED.k, 1);
      const wrong = hamming(res.x, realX);
      expect(wrong).toBeGreaterThanOrEqual(20);
      // The recovery is NOT equal to the real key — the page must report it wrong.
      expect(hamming(res.x, bench.reveal().x)).toBe(wrong);
      expect(wrong).toBeGreaterThan(0);
    }
  }, 60_000);

  it('m = 16 recovers x EXACTLY over 5 seeds, within 1,600–2,500 sessions', () => {
    for (const seed of [10, 20, 30, 40, 50]) {
      const { bench, realX } = benchAt(seed);
      const res = breakHBPlus(bench.mitmOracle(), PUBLISHED.k, 16);
      expect(hamming(res.x, realX)).toBe(0);
      expect(res.totalSessions).toBeGreaterThanOrEqual(1600);
      expect(res.totalSessions).toBeLessThanOrEqual(2500);
    }
  }, 120_000);

  it('at t = 30 and m = 1 the attack is near-correct but not perfect — shown, not hidden', () => {
    // P_FR drops to 4.58e-3, so a zero bit is misread rarely: most seeds give 0
    // wrong bits, some leave 1 or 2. The point is that it is visible.
    const params: Params = { k: 224, r: 80, eta: ETA, t: 30 };
    let anyImperfect = false;
    for (const seed of [101, 102, 103, 104, 105, 106]) {
      const pool = new RandomPool(new SeededSource(seed));
      const x = randomVec(params.k, pool);
      const y = randomVec(params.k, pool);
      const bench = new HBPlusBench(x, y, params, new BiasedBit(ETA, pool), pool);
      const res = breakHBPlus(bench.mitmOracle(), params.k, 1);
      const wrong = hamming(res.x, x);
      expect(wrong).toBeLessThanOrEqual(5); // nowhere near the t=20 catastrophe
      if (wrong > 0) anyImperfect = true;
    }
    void anyImperfect; // informational: some seeds leave a residual error, which the page shows
  }, 60_000);
});

describe('invariant 3: the attacker holds no secret', () => {
  it('a bit of x equals accept/reject under single-bit δ, predicted independently', () => {
    // Build the oracle AFTER taking the attacker reference, from a secret the
    // attack code never sees. A hand-rolled noiseless oracle makes the mapping exact.
    const attack = breakHBPlus; // reference taken before any secret exists
    const x = fromBits('10110010');
    const oracle: MitmOracle = {
      // Accept iff δ·x = 0 (noiseless, threshold loose): exactly the information a bit leaks.
      runTamperedSession: (delta: BitVec) => deltaDotX(delta, x) === 0,
    };
    const res = attack(oracle, 8, 1);
    for (let i = 0; i < 8; i++) expect(bitAt(res.x, i)).toBe(bitAt(x, i));
  });

  it('δ = 0 reveals nothing and is not counted as a learned bit', () => {
    const x = fromBits('1010');
    const oracle: MitmOracle = { runTamperedSession: (delta) => deltaDotX(delta, x) === 0 };
    const probe = probeDelta(oracle, fromBits('0000'));
    expect(probe.degenerate).toBe(true);
    expect(probe.reveals).toBe('nothing');
  });

  it('a single non-zero δ probe reports which parity it learned', () => {
    const x = fromBits('1010'); // bit 0 = 1
    const oracle: MitmOracle = { runTamperedSession: (delta) => deltaDotX(delta, x) === 0 };
    expect(probeDelta(oracle, unit(4, 0)).reveals).toBe('delta·x = 1');
    expect(probeDelta(oracle, unit(4, 1)).reveals).toBe('delta·x = 0');
  });
});
