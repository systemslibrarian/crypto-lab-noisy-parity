import type { FullConfig } from '@playwright/test';
import { REGISTRY, recordNames } from './mutation-registry';
import { SINK, readSink } from './observations';

/**
 * §4.1c runtime coverage. Every mutation record names the test and marker that
 * kill it; each of those had to be OBSERVED executing its shared helper in this
 * run. Read from what ran, never from spec source — a mention of a helper call
 * cannot satisfy this, only executing it can.
 *
 *   S1  the sink exists (else globalSetup did not run and every rule is vacuous);
 *   S2  for each record whose killing test RAN AND PASSED, that test executed the
 *       record's helper on the record's marker;
 *   S4  on an UNFILTERED run of verdicts.spec.ts, every record's test ran at all.
 *
 * A mutation run narrows to the two spec files but not to a single test, so it is
 * treated as unfiltered: the owning test is red (that is the kill) and S2 only
 * judges passed tests, so the kill is never double-counted as a coverage failure.
 */
function isFiltered(config: FullConfig | undefined): boolean {
  const grep = config?.grep;
  const sources = Array.isArray(grep) ? grep.map((g) => g.source) : grep ? [grep.source] : [];
  if (sources.some((s) => s !== '.*' && s !== '')) return true;
  const argv = (config as { argv?: unknown } | undefined)?.argv;
  if (!Array.isArray(argv)) return false;
  const flags = ['-g', '--grep', '--grep-invert', '--shard'];
  return argv.slice(2).map(String).some((a) => flags.some((f) => a === f || a.startsWith(`${f}=`)) || /:\d+$/.test(a));
}

export default async function globalTeardown(config?: FullConfig): Promise<void> {
  const observations = readSink();
  if (observations === null) {
    throw new Error(`runtime marker coverage: the sink ${SINK} does not exist, so nothing was checked. globalSetup creates it; a config that no longer names it disables every rule here.`);
  }
  const ran = observations.filter((o) => o.kind === 'ran');
  const asserted = observations.filter((o) => o.kind === 'asserted');
  const verdictsRan = ran.some((o) => o.spec.endsWith('verdicts.spec.ts'));
  const filtered = isFiltered(config);
  const failures: string[] = [];

  for (const entry of REGISTRY.mutations) {
    const matches = ran.filter((o) => recordNames(entry, o.spec, o.test));
    if (matches.length === 0) {
      if (!filtered && verdictsRan) {
        failures.push(`${entry.id}: verdicts.spec.ts ran but no test titled "${entry.test}" ran with it — its recorded kill is covered by nothing.`);
      }
      continue;
    }
    const passed = matches.filter((o) => o.status === 'passed');
    for (const { test: title, attempt } of passed) {
      const ok = asserted.some(
        (o) => o.test === title && o.spec.endsWith('verdicts.spec.ts') && (o.attempt ?? 0) === attempt && o.marker === entry.marker && o.helper === entry.helper
      );
      if (!ok) {
        failures.push(`${entry.id}: "${title}" passed without executing ${entry.helper}(page, '${entry.marker}') — the recorded kill was validated by something that did not run.`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`runtime marker coverage failed for ${failures.length} recorded mutation(s):\n  - ${failures.join('\n  - ')}\n\nThese are RUNTIME observations, not a scan of spec source.`);
  }
}
