import { describe, expect, it } from 'vitest';
import { BiasedBit, RandomPool, noiseless, scriptedNoise, webCryptoSource } from './noise';
import { SeededSource } from './seeded';
import { rational } from './rational';

/**
 * INVARIANT 1 — the noise bit is drawn by an integer threshold comparison over
 * rejection-sampled uniform bits: no modulo bias, no floating point. Over many
 * draws the empirical rate must track η closely, and tests inject the
 * deterministic source through the SAME interface the page's WebCrypto source
 * implements.
 */
describe('biased noise bit', () => {
  it('is always 0 at η = 0', () => {
    const b = new BiasedBit(rational(0n, 1n), new RandomPool(new SeededSource(1)));
    for (let i = 0; i < 1000; i++) expect(b.bit()).toBe(0);
    expect(noiseless.bit()).toBe(0);
  });

  it('tracks η = 1/4 over a large seeded sample', () => {
    const pool = new RandomPool(new SeededSource(42));
    const b = new BiasedBit(rational(1n, 4n), pool);
    let ones = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) ones += b.bit();
    expect(ones / N).toBeGreaterThan(0.235);
    expect(ones / N).toBeLessThan(0.265);
  });

  it('tracks an awkward η = 3/16 (a denominator that is not a power of two in the compare)', () => {
    const pool = new RandomPool(new SeededSource(99));
    const b = new BiasedBit(rational(3n, 16n), pool);
    let ones = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) ones += b.bit();
    expect(ones / N).toBeGreaterThan(0.17);
    expect(ones / N).toBeLessThan(0.205);
  });

  it('refuses η ≥ 1/2', () => {
    expect(() => new BiasedBit(rational(1n, 2n), new RandomPool(new SeededSource(1)))).toThrow();
  });

  it('scripted noise throws when exhausted rather than inventing a bit', () => {
    const s = scriptedNoise([1, 0]);
    expect(s.bit()).toBe(1);
    expect(s.bit()).toBe(0);
    expect(() => s.bit()).toThrow();
  });

  it('the page source is WebCrypto, exercised through the shared interface', () => {
    const out = new Uint8Array(32);
    webCryptoSource.fill(out);
    expect(out.some((byte) => byte !== 0)).toBe(true);
  });
});
