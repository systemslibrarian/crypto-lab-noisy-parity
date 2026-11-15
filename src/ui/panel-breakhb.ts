import { toBits, hamming, type BitVec } from '../lpn/bits';
import { el, clear, intro, verdict, claim, callout, ellipsizeBits } from './dom';
import { HBBench } from '../lpn/bench';
import { HBReader, HBTag, runSession } from '../lpn/hb';
import { BiasedBit, randomVec, noiseless } from '../lpn/noise';
import { seededPool } from './engine';
import { breakHB, independentChallengeSet } from '../attack/chosen-challenge';
import { IndependentSet } from '../lpn/gf2';
import { validateParams, validateRepetitions } from '../lpn/params';

/**
 * Exhibit 3 — break HB as a malicious reader. Repeat each of k independent
 * challenges n times, take majorities, and run Gaussian elimination over GF(2)
 * on screen. Then VERIFY the recovered x by an independent authentication run.
 * The attacker sees the tag only through a challenge oracle; it never holds x.
 * A wrong recovery is reported as wrong — the verdict is the verification's
 * outcome, not the attacker's self-report.
 *
 * The run is seeded for a reproducible demonstration; "New secret key" draws a
 * fresh seed from crypto.getRandomValues.
 */
function freshSeed(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0];
}

export function renderBreakHB(root: HTMLElement): void {
  clear(root);
  root.append(
    intro(
      'Break HB as a malicious reader',
      'HB uses one secret x. A corrupt reader can send the SAME challenge over and over: the noise averages out, the majority reply is the true parity a·x, and k independent challenges plus Gaussian elimination hand over x.',
      ['This is exactly why HB alone is not safe against an active reader — and why HB+ adds a second secret, in the next exhibit.']
    )
  );

  let seed = 0x5eed1234;
  const controls = el('div', { class: 'controls' });
  const kIn = numInput('bhb-k', 'k (secret length)', '16');
  const nIn = numInput('bhb-n', 'n (repeats per challenge, odd)', '81');
  const etaIn = numInput('bhb-eta', 'η (noise rate)', '0.25', 'text');
  controls.append(el('div', { class: 'controls-row' }, [kIn.wrap, nIn.wrap, etaIn.wrap]));
  const row = el('div', { class: 'input-row' });
  const runBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Recover x' });
  const newBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'New secret key' });
  row.append(runBtn, newBtn);
  controls.append(row);
  root.append(controls);

  const out = el('div', { class: 'output', id: 'bhb-out', role: 'region', 'aria-label': 'HB recovery result' });
  root.append(out);

  function retire(): void { clear(out); out.append(el('p', { class: 'busy', text: 'Inputs changed — run the recovery again.' })); }
  for (const f of [kIn, nIn, etaIn]) f.input.addEventListener('input', retire);
  newBtn.addEventListener('click', () => { seed = freshSeed(); run(); });
  runBtn.addEventListener('click', run);

  function run(): void {
    clear(out);
    const checked = validateParams({ k: kIn.input.value, r: 1, eta: etaIn.input.value, t: 0 });
    if (!checked.ok) { out.append(callout('danger', checked.refusal.message)); return; }
    const k = checked.value.k;
    if (k > 64) { out.append(callout('danger', 'Keep k at 64 or below here so the recovery runs instantly on screen; the attack is linear-time at any size.')); return; }
    const nCheck = validateRepetitions(nIn.input.value);
    if (!nCheck.ok) { out.append(callout('danger', nCheck.refusal.message)); return; }

    // Build the honest tag on the bench; the attacker gets only the oracle.
    const pool = seededPool(seed);
    const x = randomVec(k, pool);
    const noise = checked.value.eta.num === 0n ? noiseless : new BiasedBit(checked.value.eta, pool);
    const params = { k, r: k, eta: checked.value.eta, t: Math.ceil((k * Number(checked.value.eta.num)) / Number(checked.value.eta.den)) };
    const bench = new HBBench(x, params, noise, pool);

    // A random full-rank challenge set (not the identity), so the elimination
    // does real work — pivots move and rows get swapped — which is what makes
    // the on-screen trace worth watching and the row-swap step load-bearing.
    const basis = new IndependentSet(k);
    const challengeSet: BitVec[] = [];
    while (challengeSet.length < k) {
      const v = randomVec(k, pool);
      if (basis.tryAdd(v)) challengeSet.push(v);
    }
    const traced = k <= 16;
    const result = breakHB(bench.hbChallengeOracle(), k, nCheck.value, challengeSet, traced);

    out.append(el('div', { class: 'stat-grid' }, [
      claim('bhb-queries', String(k * nCheck.value), 'Oracle queries', `${k} challenges × ${nCheck.value} repeats`),
    ]));

    if (result.solve.status !== 'solved') {
      out.append(verdict('hb-recovery', 'fail', `RECOVERY FAILED — the challenge system was ${result.solve.status} (rank ${result.solve.rank} of ${k}).`));
      return;
    }
    const recovered = result.solve.x;

    // On-screen elimination for small k.
    if (traced) {
      const elim = el('div', { class: 'elim', role: 'group', 'aria-label': 'Gaussian elimination steps' });
      for (const step of result.solve.steps) {
        elim.append(el('div', { class: 'elim-step', text: `col ${step.col}: pivot row ${step.pivotRow}${step.swappedFrom !== null ? ` (swapped up from ${step.swappedFrom})` : ''}, cleared ${step.eliminated.length} row(s)` }));
      }
      out.append(el('details', {}, [
        el('summary', { text: `Gaussian elimination over GF(2) — ${result.solve.steps.length} pivots` }),
        el('div', { class: 'details-body' }, [elim]),
      ]));
    } else {
      out.append(callout('info', `Gaussian elimination reduced ${k} equations to the identity in ${result.solve.steps.length} pivots (summarised at this size).`));
    }

    out.append(el('div', { class: 'output' }, [
      fieldBits('Recovered x (from majorities + elimination)', toBits(recovered)),
    ]));

    // INDEPENDENT verification: does the recovered x authenticate? And does it match?
    const reader = new HBReader(bench.reveal());
    const verifyChallenges = independentChallengeSet(k);
    const auth = runSession(new HBTag(recovered, noiseless), reader, verifyChallenges, 0);
    const matches = hamming(recovered, bench.reveal()) === 0;

    if (auth.accepted && matches) {
      out.append(verdict('hb-recovery', 'alarm', 'KEY RECOVERED — and VERIFIED: the recovered x authenticates against the real reader with zero failures. The secret is fully exposed.'));
    } else {
      out.append(verdict('hb-recovery', 'fail', `RECOVERY WRONG — the recovered x does not authenticate (${hamming(recovered, bench.reveal())} bit(s) off). The attack reports its own failure.`));
    }
    out.append(callout('caveat', 'A recovered key is never called correct by the code that recovered it. The verdict above is the result of an independent authentication run and a bit-for-bit comparison, not the attacker’s claim.'));
  }

  function fieldBits(label: string, bits: string): HTMLElement {
    return el('div', { class: 'field' }, [el('span', { class: 'field-label', text: label }), el('div', { class: 'field-value', text: ellipsizeBits(bits, 32, 32) })]);
  }
  function numInput(id: string, label: string, value: string, type = 'number'): { wrap: HTMLElement; input: HTMLInputElement } {
    const input = el('input', { class: 'num-input', id, value, type, inputmode: type === 'number' ? 'numeric' : 'text', 'aria-label': label, spellcheck: 'false' }) as HTMLInputElement;
    return { wrap: el('div', { class: 'control' }, [el('label', { for: id, text: label }), input]), input };
  }
  run();
}
