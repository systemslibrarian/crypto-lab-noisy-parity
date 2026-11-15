import { describe, expect, it } from 'vitest';
import { and, bitAt, dot, fromBits, hamming, parity, popcount, toBits, unit, vec, xor, equal, LengthMismatch } from './bits';

/**
 * A second, independent implementation of the dot product, written out here so
 * the acceptance values below are checked against something OTHER than the code
 * under test (brief: "a second small implementation of the dot product inside
 * the test"). This walks the two bit strings character by character — it shares
 * no code with bits.ts's bigint-AND-and-popcount route.
 */
function dotByString(a: string, x: string): 0 | 1 {
  expect(a.length).toBe(x.length);
  let acc = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === '1' && x[i] === '1') acc ^= 1;
  return acc as 0 | 1;
}

describe('bit vectors', () => {
  it('round-trips bit strings left to right', () => {
    expect(toBits(fromBits('10110010'))).toBe('10110010');
    expect(bitAt(fromBits('10000000'), 0)).toBe(1);
    expect(bitAt(fromBits('10000000'), 7)).toBe(0);
  });

  it('unit vectors set a single left-to-right bit', () => {
    expect(toBits(unit(8, 0))).toBe('10000000');
    expect(toBits(unit(8, 2))).toBe('00100000');
  });

  it('popcount and parity agree with a naive count', () => {
    for (const s of ['0', '1', '11110000', '1010101010101010', '1'.repeat(224)]) {
      const v = fromBits(s);
      const naive = Array.from(s).filter((c) => c === '1').length;
      expect(popcount(v.v)).toBe(naive);
      expect(parity(v.v)).toBe((naive % 2) as 0 | 1);
    }
  });

  it('dot matches an independent string implementation', () => {
    const pairs: [string, string][] = [
      ['10110010', '10000000'],
      ['11010001', '01100111'],
      ['11111111', '10101010'],
      ['1'.repeat(16), '0101010101010101'],
    ];
    for (const [a, x] of pairs) expect(dot(fromBits(a), fromBits(x))).toBe(dotByString(a, x));
  });

  it('xor and and are bitwise; hamming counts differences', () => {
    expect(toBits(xor(fromBits('1100'), fromBits('1010')))).toBe('0110');
    expect(toBits(and(fromBits('1100'), fromBits('1010')))).toBe('1000');
    expect(hamming(fromBits('1100'), fromBits('1010'))).toBe(2);
  });

  it('refuses operations on mismatched lengths', () => {
    expect(() => dot(fromBits('101'), fromBits('1010'))).toThrow(LengthMismatch);
    expect(() => xor(vec(3, 1n), vec(4, 1n))).toThrow(LengthMismatch);
  });

  it('equal compares length and value', () => {
    expect(equal(fromBits('101'), fromBits('101'))).toBe(true);
    expect(equal(fromBits('101'), fromBits('0101'))).toBe(false);
  });
});
