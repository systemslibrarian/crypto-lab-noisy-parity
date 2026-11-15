/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 * a finding not listed fails the run; a listed finding that got worse fails; a
 * listed finding that no longer appears fails until its entry is deleted, so the
 * file can only shrink toward empty. A run with NT_BASELINE_CAPTURE=1 prints
 * every finding through this same path and asserts nothing, which is how it is
 * regenerated.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {};
