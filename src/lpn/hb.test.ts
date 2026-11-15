import { describe, expect, it } from 'vitest';
import { fromBits, unit, type Bit } from './bits';
import { HBReader, HBTag, runSession } from './hb';
import { HBPlusReader, HBPlusTag, runSessionPlus } from './hbplus';
import { scriptedNoise } from './noise';
import type { Params } from './params';

/**
 * ACCEPTANCE CHECK A — the by-hand dot-product table, k = 8, from the brief.
 * x = 10110010, y = 01101100. Every expected column is a LITERAL taken from the
 * brief's table, derived there by hand; nothing below recomputes an expected
 * value from the function under test.
 */
const X = fromBits('10110010');
const Y = fromBits('01101100');

interface Row {
  a: string;
  b: string;
  nu: Bit;
  ax: Bit;
  by: Bit;
  hb: Bit;
  hbp: Bit;
}

const TABLE: Row[] = [
  { a: '10000000', b: '01000000', nu: 0, ax: 1, by: 1, hb: 1, hbp: 0 },
  { a: '11010001', b: '00111010', nu: 1, ax: 0, by: 0, hb: 1, hbp: 1 },
  { a: '01100111', b: '10010110', nu: 0, ax: 0, by: 1, hb: 0, hbp: 1 },
  { a: '00000000', b: '00000000', nu: 1, ax: 0, by: 0, hb: 1, hbp: 1 },
  { a: '11111111', b: '11111111', nu: 0, ax: 0, by: 0, hb: 0, hbp: 0 },
  { a: '00101101', b: '11100001', nu: 1, ax: 1, by: 0, hb: 0, hbp: 0 },
];

describe('acceptance A: by-hand round, k = 8', () => {
  it('HB reply z = a·x ⊕ ν matches the brief table', () => {
    for (const row of TABLE) {
      const tag = new HBTag(X, scriptedNoise([row.nu]));
      const { z, nu } = tag.reply(fromBits(row.a));
      expect(nu).toBe(row.nu);
      // reader's own recomputed a·x matches the brief's a·x column
      expect(new HBReader(X).check(fromBits(row.a), z).expected).toBe(row.ax);
      expect(z).toBe(row.hb);
    }
  });

  it('HB+ reply z = a·x ⊕ b·y ⊕ ν matches the brief table', () => {
    for (const row of TABLE) {
      const tag = new HBPlusTag(X, Y, scriptedNoise([row.nu]), () => fromBits(row.b));
      const b = tag.blind();
      const { z } = tag.reply(fromBits(row.a), b);
      const check = new HBPlusReader(X, Y).check(fromBits(row.a), b, z);
      expect(check.expected).toBe((row.ax ^ row.by) as Bit);
      expect(z).toBe(row.hbp);
    }
  });

  it('single-bit δ·x matches the brief: 10000000→1, 01000000→0, 00100000→1, 00010000→1', () => {
    const expected: Record<number, Bit> = { 0: 1, 1: 0, 2: 1, 3: 1 };
    for (const [i, want] of Object.entries(expected)) {
      // δ·x with a single-bit δ is just bit i of x; recomputed by the reader's check on z=0 baseline
      const delta = unit(8, Number(i));
      const r = new HBReader(X).check(delta, 0).expected;
      expect(r).toBe(want);
    }
  });
});

describe('HB/HB+ session mechanics', () => {
  const params: Params = { k: 8, r: 5, eta: { num: 0n, den: 1n }, t: 0 };

  it('a noiseless honest HB tag is always accepted (t = 0)', () => {
    const tag = new HBTag(X, scriptedNoise([0, 0, 0, 0, 0]));
    const reader = new HBReader(X);
    const challenges = [unit(8, 0), unit(8, 1), unit(8, 2), unit(8, 3), unit(8, 4)];
    const res = runSession(tag, reader, challenges, params.t);
    expect(res.failures).toBe(0);
    expect(res.accepted).toBe(true);
  });

  it('the HB+ reader checks against the challenge it sent, not a tampered one', () => {
    // Drive a tamper that flips a bit the tag sees; with δ·x = 1 every noiseless round fails.
    const delta = unit(8, 0); // δ·x = x_0 = 1
    const tag = new HBPlusTag(X, Y, scriptedNoise([0, 0, 0, 0, 0]), () => fromBits('00000000'));
    const reader = new HBPlusReader(X, Y);
    const res = runSessionPlus(params, tag, reader, () => unit(8, 1), (a) => {
      // xor delta into the challenge the tag computes on
      return fromBits((BigInt('0b' + a.v.toString(2).padStart(8, '0')) ^ delta.v).toString(2).padStart(8, '0'));
    });
    expect(res.failures).toBe(5); // every round off by δ·x = 1
    expect(res.accepted).toBe(false);
  });
});
