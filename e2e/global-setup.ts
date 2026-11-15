import { resetSink } from './observations';

/**
 * Clear the runtime-observation sink before anything runs, so a file left by an
 * earlier run cannot answer this run's coverage question. The teardown treats a
 * MISSING sink as a failure, because "the file the checker reads was not there"
 * is the one state that would make every rule below silently vacuous.
 */
export default async function globalSetup(): Promise<void> {
  resetSink();
}
