import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * §4.1c runtime observation sink. The marker-coverage rule asks what RAN, not
 * what the spec source says ran: the shared helpers (expectVerdict / readClaim /
 * expectNoVerdict) write the (test title, marker id) pair they EXECUTE to this
 * run-scoped file, and e2e/global-teardown.ts reads them back and fails the run
 * if a recorded mutation's kill never actually ran. A commented-out call leaves
 * text but no line here; a call moved to another test appears under another
 * title. Neither satisfies the rule.
 *
 * A file, not a module Set, because Playwright runs workers in separate
 * processes. Under test-results/, which Playwright clears before globalSetup,
 * and globalSetup truncates again — two independent clearings, so a stale file
 * cannot answer this run's question. This module imports nothing from
 * @playwright/test: global-teardown reads it in the main process.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SINK = fileURLToPath(new URL('../test-results/marker-observations.ndjson', import.meta.url));

export interface Observation {
  readonly kind: 'ran' | 'asserted';
  readonly test: string;
  readonly spec: string;
  readonly attempt: number;
  readonly status?: string;
  readonly helper?: 'expectVerdict' | 'expectNoVerdict' | 'readClaim';
  readonly marker?: string;
}

export function specPath(file: string): string {
  return relative(ROOT, file).split('\\').join('/');
}

export function resetSink(): void {
  mkdirSync(dirname(SINK), { recursive: true });
  writeFileSync(SINK, '');
}

export function record(entry: Observation): void {
  mkdirSync(dirname(SINK), { recursive: true });
  appendFileSync(SINK, `${JSON.stringify(entry)}\n`);
}

export function readSink(): Observation[] | null {
  if (!existsSync(SINK)) return null;
  return readFileSync(SINK, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Observation);
}
