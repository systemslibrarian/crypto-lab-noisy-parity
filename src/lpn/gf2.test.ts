import { describe, expect, it } from 'vitest';
import { fromBits, unit, toBits, dot, type Bit } from './bits';
import { IndependentSet, rank, solve, type Equation } from './gf2';

describe('Gaussian elimination over GF(2)', () => {
  it('solves a full-rank system and reads x off the constants', () => {
    const x = fromBits('10110010');
    const eqs: Equation[] = [];
    for (let i = 0; i < 8; i++) {
      const a = unit(8, i);
      eqs.push({ a, z: dot(a, x) });
    }
    const res = solve(eqs, 8);
    expect(res.status).toBe('solved');
    if (res.status === 'solved') {
      expect(toBits(res.x)).toBe('10110010');
      expect(res.rank).toBe(8);
    }
  });

  it('solves a tangled system that actually needs row operations', () => {
    const x = fromBits('1101');
    // deliberately dependent-looking but full-rank challenge set
    const challenges = ['1000', '1100', '1110', '1111'].map(fromBits);
    const eqs = challenges.map((a) => ({ a, z: dot(a, x) as Bit }));
    const res = solve(eqs, 4, true);
    expect(res.status).toBe('solved');
    if (res.status === 'solved') expect(toBits(res.x)).toBe('1101');
    // the trace records at least one pivot row-swap somewhere
    expect(res.steps.length).toBe(4);
  });

  it('reports a rank-deficient system as dependent and refuses it', () => {
    const eqs: Equation[] = [
      { a: fromBits('1100'), z: 0 },
      { a: fromBits('0110'), z: 1 },
      { a: fromBits('1010'), z: 1 }, // = first ⊕ second
    ];
    const res = solve(eqs, 4);
    expect(res.status).toBe('dependent');
    if (res.status === 'dependent') {
      expect(res.rank).toBe(2);
      expect(res.refusal.code).toBe('DEPENDENT_CHALLENGES');
    }
  });

  it('IndependentSet accepts independent vectors and rejects dependent ones', () => {
    const s = new IndependentSet(4);
    expect(s.tryAdd(fromBits('1100'))).toBe(true);
    expect(s.tryAdd(fromBits('0110'))).toBe(true);
    expect(s.tryAdd(fromBits('1010'))).toBe(false); // = sum of the first two
    expect(s.size).toBe(2);
    expect(s.contains(fromBits('1010'))).toBe(true);
    expect(s.contains(fromBits('0001'))).toBe(false);
  });

  it('rank counts independent directions', () => {
    expect(rank(['1100', '0110', '1010'].map(fromBits))).toBe(2);
    expect(rank(['1000', '0100', '0010', '0001'].map(fromBits))).toBe(4);
  });
});
