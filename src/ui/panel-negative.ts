import { unit } from '../lpn/bits';
import { el, clear, intro, verdict, callout } from './dom';
import { HBPlusBench } from '../lpn/bench';
import { BiasedBit, randomVec } from '../lpn/noise';
import { seededPool } from './engine';
import { probeDelta } from '../attack/mitm';
import { rational } from '../lpn/rational';

/**
 * Exhibit 6 — what the proof covered (§4.1d negative claim).
 *
 * NEGATIVE CLAIM, scoped to the construction on this page: HB+'s security proof
 * does not cover an adversary who alters the reader's challenges on their way to
 * the tag and sees whether the reader accepts.
 *
 * Evidence fixture: drive one tampered session with a δ for which δ·x = 0 until
 * it is accepted. In that state every check the page performs reports success —
 * the reader's rounds are within threshold, the tag is genuine, the verdict is
 * ACCEPT — and the attacker has gained one correct bit of x. The verdict reads
 * as success and leak at once, and the negative-claim sentence is visible right
 * there, not behind a disclosure. HB+ has no failure code for this; the page
 * says so, because the absence of a code is the exhibit.
 */
const K = 224;
const ETA = rational(1n, 4n);
const PARAMS = { k: K, r: 80, eta: ETA, t: 20 };

export function renderNegative(root: HTMLElement): void {
  clear(root);
  root.append(
    intro(
      'What the proof covered',
      'A security proof covers only the attacker it models. HB+ was proved secure against a tag-only and a reader-only adversary — never one sitting between them. This exhibit drives the proof’s blind spot to a verdict.',
      []
    )
  );

  const claimBox = el('div', { class: 'negative-claim' }, [
    el('span', { class: 'nc-label', text: 'NEGATIVE CLAIM — WHAT A PASSING CHECK DOES NOT ESTABLISH' }),
    el('p', { 'data-negative-claim': 'true', text: 'HB+’s security proof does not cover an adversary who alters the reader’s challenges on their way to the tag and sees whether the reader accepts.' }),
  ]);
  root.append(claimBox);

  const controls = el('div', { class: 'controls' });
  const row = el('div', { class: 'input-row' });
  const runBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Drive the fixture: tamper until the reader accepts' });
  row.append(runBtn);
  controls.append(el('p', { class: 'help', text: 'A single-bit δ is XORed into every challenge. When δ hits a key bit that is 0, the session passes like any honest one — and that acceptance has leaked the bit.' }), row);
  root.append(controls);

  const out = el('div', { class: 'output', id: 'neg-out', role: 'region', 'aria-label': 'negative claim fixture' });
  root.append(out);

  let seed = 0xdef0;
  runBtn.addEventListener('click', run);

  function run(): void {
    clear(out);
    const pool = seededPool(seed);
    const x = randomVec(K, pool);
    const y = randomVec(K, pool);
    const bench = new HBPlusBench(x, y, PARAMS, new BiasedBit(ETA, pool), pool);
    const oracle = bench.mitmOracle();

    // Probe single-bit δ's with generous patience until one ACCEPTS. The first
    // acceptance is a δ·x = 0 bit, established from accept/reject alone.
    let acceptedAt = -1;
    let tries = 0;
    for (let i = 0; i < K && acceptedAt < 0; i++) {
      for (let attempt = 0; attempt < 24; attempt++) {
        tries++;
        if (probeDelta(oracle, unit(K, i)).accepted) { acceptedAt = i; break; }
      }
    }
    seed += 1; // next run uses fresh keys

    if (acceptedAt < 0) {
      out.append(callout('danger', 'No accepting session found in this run — rerun to draw fresh keys.'));
      return;
    }

    out.append(
      el('div', { class: 'step-card' }, [
        el('span', { class: 'step-tag', text: `FIXTURE REACHED — δ = e_${acceptedAt}, ${tries} session(s)` }),
        el('p', { class: 'step-eq', text: 'Every check the reader ran this session passed. The tag is the genuine tag. The reader’s verdict is ACCEPT.' }),
      ])
    );
    out.append(
      verdict('negative-fixture', 'alarm', 'AUTHENTICATED — AND ONE KEY BIT LEAKED. Every verdict on this page reads success, and the attacker still walked away with one correct bit of x.')
    );
    out.append(
      el('div', { class: 'negative-claim', 'data-fixture-claim': 'true' }, [
        el('span', { class: 'nc-label', text: 'WHY THE PROOF MISSED IT' }),
        el('p', { text: 'The proof models an adversary that attacks the tag, then the reader — never one that sits between them and perturbs the challenge. HB+ has no failure code to raise here: the session is, by every check it defines, a success. The absence of a code is the exhibit.' }),
      ])
    );
    out.append(callout('caveat', 'This is the same accept-or-reject leak the previous exhibit turned into a full key recovery. Here it is isolated to a single session so the limit of the proof is visible on its own.'));
  }

  run();
}
