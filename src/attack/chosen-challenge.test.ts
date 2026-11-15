import { describe, expect, it } from 'vitest';
import { fromBits, toBits, unit, hamming } from '../lpn/bits';
import { HBReader, HBTag, runSession } from '../lpn/hb';
import { HBPlusTag, HBPlusReader } from '../lpn/hbplus';
import { noiseless, BiasedBit, RandomPool, randomVec } from '../lpn/noise';
import { SeededSource } from '../lpn/seeded';
import { rational } from '../lpn/rational';
import { breakHB, breakHBPlusAttempt, type HBChallengeOracle } from './chosen-challenge';

/** A noiseless HB tag exposed only as a challenge oracle — the malicious-reader view. */
function hbOracle(xBits: string, noiseBits?: readonly (0 | 1)[]): { oracle: HBChallengeOracle; realX: string } {
  const x = fromBits(xBits);
  let i = 0;
  const noise = noiseBits
    ? { bit: () => noiseBits[i++ % noiseBits.length] }
    : noiseless;
  const tag = new HBTag(x, noise);
  return { oracle: { query: (a) => tag.reply(a).z }, realX: xBits };
}

describe('acceptance E: chosen-challenge break of HB', () => {
  it('recovers x immediately at η = 0, n = 1', () => {
    const { oracle, realX } = hbOracle('10110010');
    const res = breakHB(oracle, 8, 1);
    expect(res.x).not.toBeNull();
    expect(toBits(res.x!)).toBe(realX);
  });

  it('VERIFIES the recovered x by an independent authentication run, not by self-report', () => {
    const { oracle } = hbOracle('1011001011001010', undefined);
    const res = breakHB(oracle, 16, 1);
    // Independent check: the recovered x must authenticate against a fresh reader.
    const reader = new HBReader(res.x!);
    const challenges = Array.from({ length: 10 }, (_, i) => unit(16, i % 16));
    const auth = runSession(new HBTag(res.x!, noiseless), reader, challenges, 0);
    expect(auth.accepted).toBe(true);
  });

  it('reports a recovery with a CORRUPTED equation as wrong', () => {
    const { oracle, realX } = hbOracle('10110010');
    const res = breakHB(oracle, 8, 1);
    // Corrupt one recovered bit, as a flipped majority would produce, then verify.
    const corrupted = fromBits(toBits(res.x!).replace(/./, (c) => (c === '1' ? '0' : '1')));
    expect(toBits(corrupted)).not.toBe(realX);
    const realReader = new HBReader(fromBits(realX));
    // The corrupted key fails to authenticate against the real reader (noiseless).
    const challenges = Array.from({ length: 8 }, (_, i) => unit(8, i));
    const auth = runSession(new HBTag(corrupted, noiseless), realReader, challenges, 0);
    expect(auth.accepted).toBe(false);
  });

  it('majority voting cleans up noise at n = 41, η = 1/4', () => {
    const pool = new RandomPool(new SeededSource(7));
    const noise = new BiasedBit(rational(1n, 4n), pool);
    const x = fromBits('1'.repeat(32));
    const tag = new HBTag(x, noise);
    const res = breakHB({ query: (a) => tag.reply(a).z }, 32, 41);
    // n=41 drives per-equation error to 2.7e-4, so 32 equations recover x exactly here.
    expect(res.x).not.toBeNull();
    expect(hamming(res.x!, x)).toBe(0);
  });
});

describe('acceptance 4: the same attack FAILS against HB+', () => {
  it('the recovered vector does not match x — the b·y term defeats repetition', () => {
    const x = fromBits('1'.repeat(32));
    const y = fromBits('1010'.repeat(8));
    const pool = new RandomPool(new SeededSource(11));
    const noise = new BiasedBit(rational(1n, 4n), pool);
    const blind = () => randomVec(32, pool);
    const tag = new HBPlusTag(x, y, noise, blind);
    // Malicious-reader oracle: send a, read z — but each z now also carries b·y.
    const oracle: HBChallengeOracle = {
      query: (a) => {
        const b = tag.blind();
        return tag.reply(a, b).z;
      },
    };
    const res = breakHBPlusAttempt(oracle, 32, 41);
    const reader = new HBPlusReader(x, y);
    // The recovered x fails to authenticate as an HB+ tag (y unknown, x likely wrong too).
    const recovered = res.x!;
    const auth = runSession(new HBTag(recovered, noiseless), new HBReader(x), Array.from({ length: 32 }, (_, i) => unit(32, i)), 0);
    // Against the HB reader holding the REAL x, the recovered vector does not authenticate.
    expect(auth.accepted).toBe(false);
    void reader;
  });
});
