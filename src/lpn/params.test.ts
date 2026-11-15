import { describe, expect, it } from 'vitest';
import { fromBits, unit } from './bits';
import {
  defaultThreshold,
  REFUSAL,
  validateExhaustiveK,
  validateParams,
  validatePatience,
  validateRecorded,
  validateRepetitions,
  validateSessionCount,
} from './params';
import { rational } from './rational';
import { HBPlusReader, HBPlusTag, runSessionPlus } from './hbplus';
import { noiseless } from './noise';

/**
 * ACCEPTANCE CHECK G — every refusal in invariant 6, each a NAMED test, plus
 * the edge cases. A refusal must carry its cause code and must stop any session
 * from running.
 */
describe('acceptance G: fail-closed parameter validation', () => {
  const base = { k: 224, r: 80, eta: '0.25', t: 20 };

  it('accepts the published parameter set', () => {
    const res = validateParams(base);
    expect(res.ok).toBe(true);
  });

  it('refuses η ≥ 1/2 naming that the reply carries no information', () => {
    const res = validateParams({ ...base, eta: '0.5' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.refusal.code).toBe(REFUSAL.ETA_OUT_OF_RANGE);
  });

  it('refuses an unparseable η', () => {
    const res = validateParams({ ...base, eta: 'noisy' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.refusal.code).toBe(REFUSAL.ETA_UNPARSEABLE);
  });

  it('accepts η = 0 (the no-noise case HB falls to)', () => {
    expect(validateParams({ ...base, eta: '0' }).ok).toBe(true);
  });

  it('refuses t outside [0, r]', () => {
    expect(validateParams({ ...base, t: 81 }).ok).toBe(false);
    const neg = validateParams({ ...base, t: -1 });
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.refusal.code).toBe(REFUSAL.T_OUT_OF_RANGE);
  });

  it('accepts t = r (everything accepted) and t = 0', () => {
    expect(validateParams({ ...base, t: 80 }).ok).toBe(true);
    expect(validateParams({ ...base, t: 0 }).ok).toBe(true);
  });

  it('refuses non-integer or non-positive k and r', () => {
    expect(validateParams({ ...base, k: 0 }).ok).toBe(false);
    expect(validateParams({ ...base, k: 2.5 }).ok).toBe(false);
    const r0 = validateParams({ ...base, r: 0 });
    if (!r0.ok) expect(r0.refusal.code).toBe(REFUSAL.R_INVALID);
  });

  it('refuses an even n and a non-positive n for the chosen-challenge attack', () => {
    expect(validateRepetitions(40).ok).toBe(false);
    const even = validateRepetitions(40);
    if (!even.ok) expect(even.refusal.code).toBe(REFUSAL.N_EVEN);
    expect(validateRepetitions(0).ok).toBe(false);
    expect(validateRepetitions(41).ok).toBe(true);
  });

  it('refuses m, q and N below 1', () => {
    expect(validatePatience(0).ok).toBe(false);
    expect(validateRecorded(0).ok).toBe(false);
    expect(validateSessionCount(0).ok).toBe(false);
    expect(validatePatience(16).ok).toBe(true);
  });

  it('refuses k above the exhaustive-search cap, naming 2^k', () => {
    const res = validateExhaustiveK(224);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.refusal.code).toBe(REFUSAL.K_ABOVE_EXHAUSTIVE_CAP);
    expect(validateExhaustiveK(16).ok).toBe(true);
  });

  it('the default threshold is ⌈r·η⌉ = 20 at r=80, η=1/4', () => {
    expect(defaultThreshold(80, rational(1n, 4n))).toBe(20);
    expect(defaultThreshold(60, rational(1n, 4n))).toBe(15);
  });
});

describe('acceptance G: a wrong-length vector never produces a verdict', () => {
  it('a session throws rather than returning an accepted result', () => {
    const x = fromBits('10110010');
    const y = fromBits('01101100');
    const tag = new HBPlusTag(x, y, noiseless, () => fromBits('00000000'));
    const reader = new HBPlusReader(x, y);
    const params = { k: 8, r: 3, eta: rational(0n, 1n), t: 0 };
    // A challenge of the wrong length must throw inside the dot product, not yield a verdict.
    expect(() =>
      runSessionPlus(params, tag, reader, () => unit(4, 0))
    ).toThrow();
  });
});
