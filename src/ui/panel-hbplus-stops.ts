import { toBits, hamming } from '../lpn/bits';
import { el, clear, intro, verdict, callout, ellipsizeBits } from './dom';
import { HBPlusBench } from '../lpn/bench';
import { HBReader, HBTag, runSession } from '../lpn/hb';
import { BiasedBit, randomVec, noiseless } from '../lpn/noise';
import { seededPool } from './engine';
import { breakHBPlusAttempt, independentChallengeSet } from '../attack/chosen-challenge';
import { rational } from '../lpn/rational';

/**
 * Exhibit 4 — why HB+ stops the chosen-challenge attack. Run exhibit 3's attack
 * UNCHANGED against an HB+ tag and watch it fail: the recovered vector does not
 * authenticate. One sentence on why — the b·y term changes every round, so
 * repeating a no longer isolates a·x and the majorities are fair coins.
 */
function freshSeed(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0];
}

export function renderHBPlusStops(root: HTMLElement): void {
  clear(root);
  root.append(
    intro(
      'Why HB+ stops that attack',
      'HB+ adds a second secret y and a blinding vector b the tag sends first. Now the reply is a·x ⊕ b·y ⊕ ν. Point the exact same majority-vote attack at it and it collapses.',
      ['Because b is fresh every round, repeating one challenge a averages over a·x ⊕ b·y ⊕ ν — and b·y is itself a fair coin, so the majority reveals nothing about x.']
    )
  );

  let seed = 0x4b1d;
  const k = 24;
  const eta = rational(1n, 4n);
  const controls = el('div', { class: 'controls' });
  const row = el('div', { class: 'input-row' });
  const runBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Run the HB attack against HB+' });
  const newBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'New secret keys' });
  row.append(runBtn, newBtn);
  controls.append(el('p', { class: 'help', text: `k = ${k}, η = 0.25, n = 81 repeats per challenge — the same settings that broke HB.` }), row);
  root.append(controls);

  const out = el('div', { class: 'output', id: 'hbp-stops-out', role: 'region', 'aria-label': 'HB+ result' });
  root.append(out);

  newBtn.addEventListener('click', () => { seed = freshSeed(); run(); });
  runBtn.addEventListener('click', run);

  function run(): void {
    clear(out);
    const pool = seededPool(seed);
    const x = randomVec(k, pool);
    const y = randomVec(k, pool);
    const params = { k, r: k, eta, t: Math.ceil(k / 4) };
    const bench = new HBPlusBench(x, y, params, new BiasedBit(eta, pool), pool);

    // EXACTLY exhibit 3's attack, pointed at the HB+ oracle.
    const result = breakHBPlusAttempt(bench.hbStyleChallengeOracle(), k, 81);
    const recovered = result.x!;

    out.append(el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Vector the HB attack THINKS is x' }),
      el('div', { class: 'field-value', text: ellipsizeBits(toBits(recovered), 40, 0) }),
    ]));

    // Verify: does this vector authenticate as the real x? (Check against the HB
    // reader holding the real x; a noiseless tag with the right x would pass.)
    const realReader = new HBReader(bench.reveal().x);
    const challenges = independentChallengeSet(k);
    const auth = runSession(new HBTag(recovered, noiseless), realReader, challenges, 0);
    const wrong = hamming(recovered, bench.reveal().x);

    if (!auth.accepted) {
      out.append(verdict('hbp-stops', 'pass', `HB+ HOLDS — the recovered vector is wrong (${wrong} of ${k} bits off) and does not authenticate. The b·y blinding term defeated the repeated-challenge attack.`));
    } else {
      out.append(verdict('hbp-stops', 'alarm', 'UNEXPECTED — the recovered vector authenticated. On HB+ this should not happen; the blinding term should have defeated it.'));
    }
    out.append(callout('info', 'This is the attack that broke HB in the previous exhibit, byte for byte. The only change is the protocol it runs against. HB+ was designed to stop exactly this — which is why the next exhibit is a different attack entirely.'));
  }

  run();
}
