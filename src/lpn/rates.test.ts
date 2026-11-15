import { describe, expect, it } from 'vitest';
import { falseAccept, falseReject, majorityError, tamperedAccept, transmissionBits, binomial } from './rates';
import { formatRational, rational, sub, ONE } from './rational';

const ETA = rational(1n, 4n);

/**
 * ACCEPTANCE CHECK B / C / E — exact error rates. Every expected string is a
 * LITERAL from the brief, computed there by independent exact binomial sums and
 * a separate simulation. The test asserts the page's own rate functions round
 * to those strings; it does not recompute the expectation from the function
 * under test.
 */
describe('acceptance B: exact error rates, η = 1/4', () => {
  const rows: [number, number, string, string][] = [
    [80, 20, '0.4403', '4.290e-6'],
    [60, 15, '0.4312', '6.726e-5'],
    [40, 10, '0.4161', '1.111e-3'],
    [80, 26, '4.989e-2', '1.162e-3'],
    [80, 30, '4.582e-3', '1.650e-2'],
    [80, 32, '1.043e-3', '4.646e-2'],
  ];
  it.each(rows)('r=%i t=%i → P_FR=%s P_FA=%s', (r, t, pfr, pfa) => {
    expect(formatRational(falseReject(r, t, ETA))).toBe(pfr);
    expect(formatRational(falseAccept(r, t))).toBe(pfa);
  });

  it('transmission cost per HB+ authentication at k=224, r=80 is 35,920 bits', () => {
    expect(transmissionBits('HB+', 224, 80)).toBe(35920);
  });
  it('an HB authentication sends r·(k+1) bits', () => {
    expect(transmissionBits('HB', 224, 80)).toBe(80 * 225);
  });
});

describe('acceptance C: tampered-session accept probabilities, r=80 t=20 η=1/4', () => {
  it('δ·x = 1 is accepted with probability 9.46e-21', () => {
    expect(formatRational(tamperedAccept(80, 20, ETA), 3)).toBe('9.46e-21');
  });
  it('δ·x = 0 behaves like an honest session: accept prob 1 − P_FR = 0.5597', () => {
    const accept = sub(ONE, falseReject(80, 20, ETA));
    expect(formatRational(accept)).toBe('0.5597');
  });
});

describe('acceptance E: majority-vote error per equation, η = 1/4', () => {
  it.each([
    [15, '1.730e-2'],
    [25, '3.370e-3'],
    [41, '2.742e-4'],
  ])('n=%i → %s', (n, want) => {
    expect(formatRational(majorityError(n, ETA))).toBe(want);
  });
});

describe('binomial coefficients', () => {
  it('match a Pascal recurrence independent of the multiplicative formula', () => {
    const rows: bigint[][] = [[1n]];
    for (let n = 1; n <= 20; n++) {
      const prev = rows[n - 1];
      const cur: bigint[] = [1n];
      for (let i = 1; i < n; i++) cur.push(prev[i - 1] + prev[i]);
      cur.push(1n);
      rows.push(cur);
    }
    for (let n = 0; n <= 20; n++) for (let i = 0; i <= n; i++) expect(binomial(n, i)).toBe(rows[n][i]);
  });
});
