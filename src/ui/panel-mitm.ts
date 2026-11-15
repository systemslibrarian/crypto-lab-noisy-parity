import { bitAt, hamming, unit, vec, type Bit, type BitVec } from '../lpn/bits';
import { el, clear, intro, verdict, claim, callout } from './dom';
import { HBPlusBench } from '../lpn/bench';
import { BiasedBit, randomVec } from '../lpn/noise';
import { seededPool } from './engine';
import { recoverBit, type MitmResult } from '../attack/mitm';
import { recoverY, impersonate } from '../attack/false-tag';
import { validatePatience } from '../lpn/params';
import { rational } from '../lpn/rational';

/**
 * Exhibit 5 — break HB+ in the middle. The centerpiece. Press "tamper with one
 * bit of every challenge": an ordinary-looking session ends ACCEPT or REJECT,
 * the reader sees nothing unusual, and one more bit of x fills in on the
 * attacker's side. Single-bit δ's recover x; the repeat-until-accept rule uses
 * a learner-set m; a live session count accumulates. x is compared with the
 * real x bit-for-bit ONLY after the attack finishes — the attacker module never
 * sees x. Then y falls to a false tag, and b = 0 impersonates.
 */
function freshSeed(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0];
}

const K = 224;
const ETA = rational(1n, 4n);
const PARAMS = { k: K, r: 80, eta: ETA, t: 20 };

export function renderMitm(root: HTMLElement): void {
  clear(root);
  root.append(
    intro(
      'Break HB+ in the middle',
      'HB+ was PROVED secure. Yet an attacker who only flips the reader’s challenges in transit and watches whether the reader accepts learns one bit of the key per decision. Tamper, one bit at a time, and watch x appear.',
      ['Fix a one-bit δ. XOR it into every challenge on the way to the tag. If δ hits a key bit that is 0 the session looks honest; if it hits a 1, every noiseless round fails and the session is rejected. Accept or reject therefore leaks that bit.']
    )
  );

  let seed = 0xa71a;
  // Attack state, rebuilt on reseed / restart.
  let bench = buildBench(seed);
  let recovered: Bit[] = [];
  let sessions = 0;
  let nextBit = 0;
  let mResult: MitmResult | null = null;

  const controls = el('div', { class: 'controls' });
  const mIn = el('input', { class: 'num-input', id: 'mitm-m', type: 'number', value: '16', min: '1', max: '64', 'aria-label': 'm — rejections in a row before a bit is declared 1', inputmode: 'numeric' }) as HTMLInputElement;
  controls.append(
    el('div', { class: 'controls-row' }, [
      el('div', { class: 'control' }, [el('label', { for: 'mitm-m', text: 'Patience m (rejections before declaring a 1)' }), mIn, el('p', { class: 'help', text: 'At m = 1 one rejection declares a 1 — and the key comes out wrong. Try it, then raise m.' })]),
    ])
  );
  const btnRow = el('div', { class: 'input-row' });
  const tamperBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Tamper with one bit (δ = next e_i)' });
  const restBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Recover the rest of x' });
  const resetBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'New victim keys' });
  btnRow.append(tamperBtn, restBtn, resetBtn);
  controls.append(btnRow);
  root.append(controls);

  // Live session status (reader's view) + key fill (attacker's view).
  const sessionOut = el('div', { class: 'output', id: 'mitm-session', role: 'status', 'aria-live': 'polite' });
  const keyWrap = el('div', { class: 'region' });
  const keyTitle = el('p', { class: 'stat-label', text: 'ATTACKER’S RECONSTRUCTION OF x (fills left to right)' });
  const keyFill = el('div', { class: 'keyfill', id: 'mitm-keyfill', role: 'img', 'aria-label': 'recovered key bits' });
  keyWrap.append(keyTitle, keyFill);
  const statOut = el('div', { class: 'output', id: 'mitm-stats' });
  const verdictOut = el('div', { class: 'output', id: 'mitm-verdict', role: 'region', 'aria-label': 'recovery verdict' });
  const followOut = el('div', { class: 'output', id: 'mitm-follow' });
  root.append(sessionOut, keyWrap, statOut, verdictOut, followOut);

  function buildBench(s: number): HBPlusBench {
    const pool = seededPool(s);
    const x = randomVec(K, pool);
    const y = randomVec(K, pool);
    return new HBPlusBench(x, y, PARAMS, new BiasedBit(ETA, pool), pool);
  }

  function drawKey(grade = false): void {
    clear(keyFill);
    const real = grade ? bench.reveal().x : null;
    for (let i = 0; i < K; i++) {
      let cls = 'keybit';
      let txt = '·';
      if (i < recovered.length) {
        txt = String(recovered[i]);
        cls += ' keybit-known';
        if (grade && real) cls += bitAt(real, i) === recovered[i] ? ' keybit-correct' : ' keybit-wrong';
      }
      keyFill.append(el('span', { class: cls, 'aria-hidden': 'true', text: txt }));
    }
  }

  function m(): number {
    const checked = validatePatience(mIn.value);
    return checked.ok ? checked.value : 16;
  }

  function stats(): void {
    clear(statOut);
    statOut.append(el('div', { class: 'stat-grid' }, [
      claim('mitm-sessions', String(sessions), 'Sessions used', `${recovered.length} of ${K} bits`),
      claim('mitm-bits', String(recovered.length), 'Bits recovered', 'graded only at the end'),
    ]));
  }

  function tamperOne(): void {
    if (nextBit >= K) return;
    const rec = recoverBit(bench.mitmOracle(), K, nextBit, m());
    recovered.push(rec.bit);
    sessions += rec.sessions;
    nextBit++;
    clear(sessionOut);
    sessionOut.append(
      el('div', { class: 'step-card' }, [
        el('span', { class: 'step-tag', text: `δ = e_${nextBit - 1} — tampering bit ${nextBit - 1}` }),
        el('p', { class: 'step-eq', text: `${rec.sessions} session(s) run. ${rec.accepted ? 'An acceptance appeared → this key bit is 0.' : `${rec.sessions} rejections in a row → this key bit is read as 1.`}` }),
        verdict(
          'mitm-session',
          rec.accepted ? 'alarm' : 'alarm',
          rec.accepted
            ? 'AUTHENTICATED — AND ONE KEY BIT LEAKED. The reader accepted an ordinary-looking session; the attacker now knows this bit is 0.'
            : 'REJECTED — AND ONE KEY BIT LEAKED. The reader saw a failed authentication; the attacker now knows this bit is 1.'
        ),
        el('p', { class: 'help', text: 'The reader sees only accept or reject, exactly as it would from line noise. Nothing on its side looks like an attack.' }),
      ])
    );
    drawKey();
    stats();
    if (nextBit >= K) finish();
  }

  function recoverRest(): void {
    while (nextBit < K) {
      const rec = recoverBit(bench.mitmOracle(), K, nextBit, m());
      recovered.push(rec.bit);
      sessions += rec.sessions;
      nextBit++;
    }
    mResult = { recoveries: [], x: vec(K, bitsToValue(recovered)), totalSessions: sessions };
    drawKey();
    stats();
    finish();
  }

  function bitsToValue(bits: Bit[]): bigint {
    let v = 0n;
    for (let i = 0; i < bits.length; i++) if (bits[i] === 1) v |= 1n << BigInt(K - 1 - i);
    return v;
  }

  function finish(): void {
    const recX: BitVec = vec(K, bitsToValue(recovered));
    // GRADE now — the first time x is touched. Attacker code never saw it.
    const wrong = hamming(recX, bench.reveal().x);
    drawKey(true);
    clear(verdictOut);
    if (wrong === 0) {
      verdictOut.append(verdict('mitm-x-recovered', 'alarm', `x FULLY RECOVERED — all ${K} bits match the real secret, from ${sessions} accept/reject decisions alone. A protocol with a security proof just lost its key.`));
      offerFollowup(recX);
    } else {
      verdictOut.append(verdict('mitm-x-recovered', 'fail', `x RECOVERY WRONG — ${wrong} of ${K} bits are off. At m = ${m()} a rejection is ambiguous: an honest session fails about 44% of the time, so one rejection is not proof of a 1. Raise m and try again.`));
      clear(followOut);
    }
    void mResult;
  }

  function offerFollowup(recX: BitVec): void {
    clear(followOut);
    followOut.append(
      callout('info', 'With x known, the attacker becomes a FALSE TAG against the real reader: it answers z = a·x with no noise, so every round fails exactly when b·y = 1. That reads off y, then b = 0 walks straight in.')
    );
    const row = el('div', { class: 'input-row' });
    const yBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Recover y with a false tag' });
    const impBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Impersonate with b = 0' });
    row.append(yBtn, impBtn);
    followOut.append(row);
    const fout = el('div', { class: 'output' });
    followOut.append(fout);

    yBtn.addEventListener('click', () => {
      const res = recoverY(bench.falseTagOracle(), recX, K);
      const wrongY = hamming(res.y, bench.reveal().y);
      clear(fout);
      fout.append(el('div', { class: 'stat-grid' }, [claim('falsetag-sessions', String(res.sessions), 'Sessions for y', 'one per bit, no noise')]));
      if (wrongY === 0) {
        fout.append(verdict('falsetag-y', 'alarm', `y FULLY RECOVERED — all ${K} bits, in exactly ${res.sessions} noiseless sessions. Both halves of the secret are now exposed.`));
      } else {
        fout.append(verdict('falsetag-y', 'fail', `y RECOVERY WRONG — ${wrongY} of ${K} bits off. The false tag's replies must be noiseless and must use the correct x.`));
      }
      impBtn.disabled = false;
    });

    impBtn.addEventListener('click', () => {
      const res = impersonate(bench.falseTagOracle(), recX, K);
      const vout = el('div', { class: 'output' });
      followOut.append(vout);
      vout.append(verdict('impersonate', res.accepted ? 'alarm' : 'fail', res.accepted
        ? 'IMPERSONATED — a false tag sending b = 0 and z = a·x was accepted by the real reader. The attacker is now the tag.'
        : 'Impersonation rejected — the recovered x must be wrong.'));
    });
  }

  function restart(): void {
    recovered = [];
    sessions = 0;
    nextBit = 0;
    mResult = null;
    clear(sessionOut); clear(statOut); clear(verdictOut); clear(followOut);
    drawKey();
    stats();
  }

  tamperBtn.addEventListener('click', tamperOne);
  restBtn.addEventListener('click', recoverRest);
  resetBtn.addEventListener('click', () => { seed = freshSeed(); bench = buildBench(seed); restart(); });

  restart();
  void unit;
}
