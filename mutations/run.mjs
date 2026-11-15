#!/usr/bin/env node
/**
 * §4.1c mutation driver. Applies, reverts, or JUDGES the concrete patches in
 * mutations/registry.json. A patch counts as a KILL only when all four hold:
 *
 *   1. the unmutated baseline suite PASSED in this same run;
 *   2. the patch actually CHANGED the file (anchor unique, bytes different);
 *   3. the run served the MUTATED bundle — proved two ways, because one is not
 *      enough: the built bundle's hash must MOVE, and the failure must not match
 *      a shape that means the code never ran (build error / no server / refused);
 *   4. the failure is the owning test's OWN assertion, not the suite going red.
 *
 * A patch that does not compile is DOES NOT BUILD, never a kill. CI=1 forces
 * playwright.config.ts's reuseExistingServer:false, so a stale preview on port
 * 4236 cannot answer for an unmutated checkout. The patch is applied to the
 * working tree and reverted in a finally block, with the file's md5 confirmed
 * back to its pre-mutation value before the next patch.
 *
 * Usage:  node mutations/run.mjs            # every mutation
 *         node mutations/run.mjs <id> ...   # named mutations
 *         node mutations/run.mjs --list
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = JSON.parse(readFileSync(join(ROOT, 'mutations', 'registry.json'), 'utf8'));

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const m of REGISTRY.mutations) console.log(`${m.id.padEnd(26)} kills ${m.marker.padEnd(18)} via "${m.test}"`);
  process.exit(0);
}
const selected = args.length ? REGISTRY.mutations.filter((m) => args.includes(m.id)) : REGISTRY.mutations;
if (!selected.length) { console.error(`No mutation matched ${args.join(', ')}. Try --list.`); process.exit(2); }

const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, CI: '1' }, maxBuffer: 128 * 1024 * 1024 });
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const DIST = join(ROOT, 'dist', 'assets');
function bundleHash() {
  if (!existsSync(DIST)) return null;
  const h = createHash('sha256');
  for (const f of readdirSync(DIST).sort()) h.update(f).update(readFileSync(join(DIST, f)));
  return h.digest('hex').slice(0, 12);
}
const fileMd5 = (rel) => createHash('md5').update(readFileSync(join(ROOT, rel))).digest('hex').slice(0, 12);

const NOT_A_KILL = [
  { re: /error TS\d+|Build failed|Transform failed|Could not resolve/i, label: 'build error' },
  { re: /webServer.*did not start|Timeout .* exceeded while running "beforeAll"/i, label: 'server never started' },
  { re: /net::ERR_CONNECTION_REFUSED/i, label: 'nothing served on the port' },
];
const notAKill = (out) => NOT_A_KILL.find(({ re }) => re.test(strip(out)))?.label ?? null;

function build() { try { sh('npm run build'); return true; } catch { return false; } }
function suite() {
  try { return { failed: false, out: sh('npx playwright test e2e/verdicts.spec.ts e2e/claims.spec.ts --reporter=list --retries=0') }; }
  catch (e) { return { failed: true, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
}
function failingTitles(out) {
  return [...strip(out).matchAll(/^\s*\d+\)\s+(.+?)(?:\s*[─-]{3,})?\s*$/gm)].map((m) => m[1].trim());
}
function applyPatch(entry, forward) {
  const path = join(ROOT, entry.file);
  const [from, to] = forward ? [entry.find, entry.replace] : [entry.replace, entry.find];
  const before = readFileSync(path, 'utf8');
  const n = before.split(from).length - 1;
  if (n !== 1) throw new Error(`${entry.file}: anchor occurs ${n}x, expected 1`);
  const after = before.split(from).join(to);
  if (after === before) throw new Error(`${entry.file}: patch was a no-op`);
  writeFileSync(path, after);
}

console.log('Building and running the unmutated baseline...');
if (!build()) { console.error('Baseline build fails; nothing below would mean anything.'); process.exit(2); }
const baselineHash = bundleHash();
const baseline = suite();
if (baseline.failed) {
  console.error('The unmutated suite does not pass; a mutation "caught" by an already-red suite is caught by nothing.\n');
  console.error(strip(baseline.out).split('\n').slice(-20).join('\n'));
  process.exit(2);
}
console.log(`baseline PASSED, bundle ${baselineHash}\n`);

const results = [];
for (const entry of selected) {
  process.stdout.write(`${entry.id.padEnd(26)} `);
  const beforeMd5 = fileMd5(entry.file);
  let verdict;
  try {
    applyPatch(entry, true);
    const built = build();
    const mutatedHash = built ? bundleHash() : null;
    const run = built ? suite() : { failed: true, out: 'DID NOT BUILD' };
    const shape = built ? notAKill(run.out) : 'build error';
    const failed = built ? failingTitles(run.out) : [];
    const ownFailed = failed.some((t) => t.includes(entry.test));
    verdict = !built ? 'DOES NOT BUILD'
      : mutatedHash === baselineHash ? 'BUNDLE UNCHANGED'
      : shape ? `NOT A KILL (${shape})`
      : !run.failed ? 'SURVIVED'
      : ownFailed ? 'KILLED'
      : `FAILED FOR THE WRONG REASON (${failed.join('; ').slice(0, 80)})`;
    console.log(verdict === 'KILLED' ? `KILLED  ${baselineHash} -> ${mutatedHash}  (${entry.marker})` : verdict);
  } catch (e) {
    verdict = `ERROR ${e.message}`;
    console.log(verdict);
  } finally {
    try { applyPatch(entry, false); } catch {}
    if (fileMd5(entry.file) !== beforeMd5) { console.error(`\n${entry.id}: ${entry.file} not restored to ${beforeMd5}. Aborting.`); process.exit(2); }
  }
  results.push({ id: entry.id, verdict });
}
build(); // leave dist consistent with the restored source

console.log(`\n${'='.repeat(70)}\nLEDGER`);
for (const r of results) console.log(`${(r.verdict === 'KILLED' ? 'KILLED' : r.verdict).padEnd(34)} ${r.id}`);
const bad = results.filter((r) => r.verdict !== 'KILLED');
console.log(`\n${results.length - bad.length}/${results.length} mutations killed.`);
if (bad.length) console.log('SURVIVED is evidence about the source or the test; DOES NOT BUILD is a broken patch.');
process.exit(bad.length ? 1 : 0);
