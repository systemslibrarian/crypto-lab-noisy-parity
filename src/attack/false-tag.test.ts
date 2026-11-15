import { describe, expect, it } from 'vitest';
import { fromBits, hamming, toBits, unit } from '../lpn/bits';
import { HBPlusBench } from '../lpn/bench';
import { BiasedBit, RandomPool, randomVec } from '../lpn/noise';
import { SeededSource } from '../lpn/seeded';
import { rational } from '../lpn/rational';
import type { Params } from '../lpn/params';
import { blindDotY, impersonate, recoverY } from './false-tag';

const ETA = rational(1n, 4n);
const PUBLISHED: Params = { k: 224, r: 80, eta: ETA, t: 20 };

function benchAt(seed: number) {
  const pool = new RandomPool(new SeededSource(seed));
  const x = randomVec(PUBLISHED.k, pool);
  const y = randomVec(PUBLISHED.k, pool);
  const bench = new HBPlusBench(x, y, PUBLISHED, new BiasedBit(ETA, pool), pool);
  return { bench, x, y };
}

describe('acceptance D: false-tag recovery of y', () => {
  it('recovers y EXACTLY in exactly 224 sessions given a correct x', () => {
    const { bench, x, y } = benchAt(3);
    const res = recoverY(bench.falseTagOracle(), x, PUBLISHED.k);
    expect(res.sessions).toBe(PUBLISHED.k);
    expect(hamming(res.y, y)).toBe(0);
  });

  it('FAILS when given a wrong x', () => {
    const { bench, x, y } = benchAt(4);
    const wrongX = fromBits(toBits(x).replace(/^./, (c) => (c === '1' ? '0' : '1')));
    const res = recoverY(bench.falseTagOracle(), wrongX, PUBLISHED.k);
    expect(hamming(res.y, y)).toBeGreaterThan(0);
  });

  it('accept ⇒ b·y = 0 and reject ⇒ b·y = 1, predicted independently', () => {
    const { bench, x, y } = benchAt(5);
    const res = recoverY(bench.falseTagOracle(), x, PUBLISHED.k);
    for (const rec of res.recoveries.slice(0, 16)) {
      expect(rec.bit).toBe(blindDotY(rec.b, y));
    }
  });
});

describe('acceptance D: impersonation with b = 0', () => {
  it('a false tag answering z = a·x with b = 0 is accepted in all 50 of 50 runs', () => {
    let accepted = 0;
    for (let seed = 0; seed < 50; seed++) {
      const { bench, x } = benchAt(1000 + seed);
      if (impersonate(bench.falseTagOracle(), x, PUBLISHED.k).accepted) accepted++;
    }
    expect(accepted).toBe(50);
  }, 30_000);

  it('impersonation with a WRONG x is rejected', () => {
    const { bench, x } = benchAt(7);
    const wrongX = unit(PUBLISHED.k, 0).v === x.v ? fromBits('1'.repeat(PUBLISHED.k)) : fromBits('1'.repeat(PUBLISHED.k));
    const res = impersonate(bench.falseTagOracle(), wrongX, PUBLISHED.k);
    // A wrong x makes a·x wrong in ~half of rounds, far above t=20, so it is rejected.
    expect(res.accepted).toBe(false);
  });
});
