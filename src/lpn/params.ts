import { parseRational, type Rational } from './rational';

/**
 * Parameter validation. Every refusal on the page comes from here or from a
 * sibling module's named refusal, each carrying a code the UI surfaces and
 * the claims suite asserts by name. Nothing runs on refused parameters.
 */

export type Protocol = 'HB' | 'HB+';

export interface Params {
  /** Vector length. */
  readonly k: number;
  /** Rounds per authentication. */
  readonly r: number;
  /** Noise rate η = P[ν = 1], 0 ≤ η < 1/2. */
  readonly eta: Rational;
  /** The reader accepts when at most t of the r checks fail. */
  readonly t: number;
}

export const REFUSAL = {
  K_INVALID: 'K_INVALID',
  R_INVALID: 'R_INVALID',
  ETA_UNPARSEABLE: 'ETA_UNPARSEABLE',
  ETA_OUT_OF_RANGE: 'ETA_OUT_OF_RANGE',
  T_OUT_OF_RANGE: 'T_OUT_OF_RANGE',
  N_INVALID: 'N_INVALID',
  N_EVEN: 'N_EVEN',
  M_INVALID: 'M_INVALID',
  Q_INVALID: 'Q_INVALID',
  SESSIONS_INVALID: 'SESSIONS_INVALID',
  VECTOR_LENGTH: 'VECTOR_LENGTH',
  DEPENDENT_CHALLENGES: 'DEPENDENT_CHALLENGES',
  DELTA_ZERO: 'DELTA_ZERO',
  DELTA_REPEATED: 'DELTA_REPEATED',
  K_ABOVE_EXHAUSTIVE_CAP: 'K_ABOVE_EXHAUSTIVE_CAP',
  WRONG_LENGTH_SECRET: 'WRONG_LENGTH_SECRET',
} as const;

export type RefusalCode = (typeof REFUSAL)[keyof typeof REFUSAL];

export interface Refusal {
  readonly code: RefusalCode;
  readonly message: string;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

export function refuse<T = never>(code: RefusalCode, message: string): Checked<T> {
  return { ok: false, refusal: { code, message } };
}

export const K_MAX = 1024;
export const R_MAX = 1000;
/** Exhaustive search is capped here on purpose; 2^16 candidates is the toy ceiling. */
export const EXHAUSTIVE_CAP = 16;

function positiveInteger(value: unknown, max: number): number | null {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > max) return null;
  return n;
}

/** k and r must be positive integers; η in [0, 1/2); t in [0, r]. */
export function validateParams(input: {
  k: unknown;
  r: unknown;
  eta: unknown;
  t: unknown;
}): Checked<Params> {
  const k = positiveInteger(input.k, K_MAX);
  if (k === null) {
    return refuse(REFUSAL.K_INVALID, `k must be a positive integer up to ${K_MAX}; got ${String(input.k)}.`);
  }
  const r = positiveInteger(input.r, R_MAX);
  if (r === null) {
    return refuse(REFUSAL.R_INVALID, `r must be a positive integer up to ${R_MAX}; got ${String(input.r)}.`);
  }
  let eta: Rational | null;
  if (typeof input.eta === 'string') eta = parseRational(input.eta);
  else if (input.eta && typeof input.eta === 'object' && 'num' in input.eta) eta = input.eta as Rational;
  else eta = null;
  if (eta === null) {
    return refuse(REFUSAL.ETA_UNPARSEABLE, `η must be a decimal or a fraction such as 0.25 or 1/4; got ${String(input.eta)}.`);
  }
  if (eta.num < 0n || 2n * eta.num >= eta.den) {
    return refuse(
      REFUSAL.ETA_OUT_OF_RANGE,
      'η must satisfy 0 ≤ η < 1/2. At η = 1/2 the reply z = a·x ⊕ ν is a fair coin whatever x is, so it carries no information about the key and no reader could ever tell a tag from a guesser.'
    );
  }
  const t = typeof input.t === 'string' ? Number(input.t.trim()) : input.t;
  if (typeof t !== 'number' || !Number.isInteger(t) || t < 0 || t > r) {
    return refuse(REFUSAL.T_OUT_OF_RANGE, `t must be an integer between 0 and r = ${r}; got ${String(input.t)}.`);
  }
  return { ok: true, value: { k, r, eta, t } };
}

/** The originally proposed threshold, t = ⌈r·η⌉. */
export function defaultThreshold(r: number, eta: Rational): number {
  const num = BigInt(r) * eta.num;
  return Number((num + eta.den - 1n) / eta.den);
}

/** Repetitions per challenge in the chosen-challenge attack: a positive ODD integer, so a majority always exists. */
export function validateRepetitions(value: unknown, max = 999): Checked<number> {
  const n = positiveInteger(value, max);
  if (n === null) return refuse(REFUSAL.N_INVALID, `n must be a positive integer up to ${max}; got ${String(value)}.`);
  if (n % 2 === 0) {
    return refuse(REFUSAL.N_EVEN, `n must be odd so that ${n} votes cannot tie; got ${n}. A tied majority is no majority.`);
  }
  return { ok: true, value: n };
}

/** Rejections in a row before the man in the middle declares a bit 1. */
export function validatePatience(value: unknown, max = 64): Checked<number> {
  const m = positiveInteger(value, max);
  if (m === null) return refuse(REFUSAL.M_INVALID, `m must be a positive integer up to ${max}; got ${String(value)}.`);
  return { ok: true, value: m };
}

/** Recorded rounds for the eavesdropper. */
export function validateRecorded(value: unknown, max = 4096): Checked<number> {
  const q = positiveInteger(value, max);
  if (q === null) return refuse(REFUSAL.Q_INVALID, `q must be a positive integer up to ${max}; got ${String(value)}.`);
  return { ok: true, value: q };
}

/** Honest / random-guess sessions to observe in exhibit 2. */
export function validateSessionCount(value: unknown, max = 5000): Checked<number> {
  const n = positiveInteger(value, max);
  if (n === null) return refuse(REFUSAL.SESSIONS_INVALID, `N must be a positive integer up to ${max}; got ${String(value)}.`);
  return { ok: true, value: n };
}

export function validateExhaustiveK(k: number): Checked<number> {
  if (k > EXHAUSTIVE_CAP) {
    return refuse(
      REFUSAL.K_ABOVE_EXHAUSTIVE_CAP,
      `k = ${k} is above the exhaustive-search cap of ${EXHAUSTIVE_CAP}. Trying every candidate costs 2^k passes over the recording; at k = ${k} that is 2^${k}, and at the published k = 224 it is 2^224 — not feasible on any machine. The better published algorithms (BKW and its successors) are named on this page, not built.`
    );
  }
  return { ok: true, value: k };
}
