import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * One reading of mutations/registry.json, shared by the mutation runner and the
 * runtime-coverage teardown. Each record is a concrete §4.1c patch (file + a
 * find string that must occur exactly once + its replacement) plus the marker
 * it kills, the test that kills it, and which shared helper that test must run.
 */
export interface MutationRecord {
  readonly id: string;
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly marker: string;
  readonly test: string;
  readonly helper: 'expectVerdict' | 'expectNoVerdict' | 'readClaim';
  readonly why: string;
}

export interface Registry {
  readonly port: number;
  readonly mutations: readonly MutationRecord[];
}

export const REGISTRY = JSON.parse(
  readFileSync(fileURLToPath(new URL('../mutations/registry.json', import.meta.url)), 'utf8')
) as Registry;

/** Does this record name this test? Same rule the runner's title match uses. */
export function recordNames(entry: MutationRecord, spec: string, title: string): boolean {
  return title.includes(entry.test) && spec.endsWith('verdicts.spec.ts');
}
