import { describe, expect, it } from 'vitest';
import { fromBits, toBits, dot, unit, type Bit } from '../lpn/bits';
import { candidateCount, score, search, type Recorded } from './exhaustive';

describe('exhibit 7: exhaustive search at toy size', () => {
  it('finds the key with no noise', () => {
    const x = fromBits('101101'); // k = 6
    const rounds: Recorded[] = [];
    // Every nonzero 6-bit challenge: full rank, so the key is uniquely determined.
    for (let i = 1; i < 64; i++) {
      const a = fromBits(i.toString(2).padStart(6, '0'));
      rounds.push({ a, z: dot(a, x) });
    }
    const res = search(6, rounds);
    expect(toBits(res.best)).toBe('101101');
    expect(res.ties).toBe(1);
    expect(res.candidates).toBe(64);
  });

  it('still finds the key through a little noise, given enough rounds', () => {
    const x = fromBits('11010010'); // k = 8
    const rounds: Recorded[] = [];
    for (let i = 0; i < 60; i++) {
      const a = fromBits((i * 7 + 3).toString(2).padStart(16, '0').slice(-8));
      // flip every 9th reply to model η ≈ 0.11
      const z = (dot(a, x) ^ (i % 9 === 0 ? 1 : 0)) as Bit;
      rounds.push({ a, z });
    }
    const res = search(8, rounds);
    expect(toBits(res.best)).toBe('11010010');
  });

  it('candidate count doubles with each added bit', () => {
    expect(candidateCount(8)).toBe(256n);
    expect(candidateCount(16)).toBe(65536n);
    expect(candidateCount(16)).toBe(candidateCount(15) * 2n);
    expect(candidateCount(224)).toBe(1n << 224n); // the number the page states is infeasible
  });

  it('score counts satisfied rounds', () => {
    const x = fromBits('1010');
    const rounds: Recorded[] = [
      { a: unit(4, 0), z: dot(unit(4, 0), x) },
      { a: unit(4, 1), z: (dot(unit(4, 1), x) ^ 1) as Bit }, // one wrong
    ];
    expect(score(x, rounds)).toBe(1);
  });
});
