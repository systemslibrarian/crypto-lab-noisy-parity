import { fromBits, toBits, dot, type Bit, type BitVec } from '../lpn/bits';
import { HBReader } from '../lpn/hb';
import { HBPlusReader } from '../lpn/hbplus';
import { el, clear, intro, verdict, claim, callout } from './dom';

/**
 * Exhibit 1 — one round, by hand, k = 8. Shows a, x, the bitwise AND, the
 * parity, the noise coin, the reply, and the reader's check for HB and then
 * HB+. Every value is COMPUTED from the vectors on screen; nothing is asserted
 * in prose. The hand-checkable vectors are the brief's (x = 10110010,
 * y = 01101100), so a learner can verify each bit against the acceptance table.
 */

const X = fromBits('10110010');
const Y = fromBits('01101100');

interface Preset {
  label: string;
  a: string;
  b: string;
  nu: Bit;
}

const PRESETS: Preset[] = [
  { label: 'Row 1', a: '10000000', b: '01000000', nu: 0 },
  { label: 'Row 2', a: '11010001', b: '00111010', nu: 1 },
  { label: 'Row 3', a: '01100111', b: '10010110', nu: 0 },
  { label: 'All-zero a, b', a: '00000000', b: '00000000', nu: 1 },
  { label: 'All-one a, b', a: '11111111', b: '11111111', nu: 0 },
  { label: 'Row 6', a: '00101101', b: '11100001', nu: 1 },
];

function bitStrip(label: string, bits: string, highlight?: string): HTMLElement {
  const row = el('div', { class: 'bitrow', role: 'group', 'aria-label': `${label} ${bits}` }, [
    el('span', { class: 'bit-label', text: label }),
  ]);
  for (let i = 0; i < bits.length; i++) {
    const on = bits[i] === '1';
    const hi = highlight && highlight[i] === '1';
    row.append(el('span', { class: `bit${on ? ' bit-on' : ''}`, 'aria-hidden': 'true', text: bits[i] }));
    void hi;
  }
  return row;
}

export function renderByHand(root: HTMLElement): void {
  clear(root);
  root.append(
    intro(
      'One round, by hand',
      'Both protocols are built from one operation: the parity of a bitwise AND, written a·x. Pick a challenge and a noise coin and watch a single round compute, bit by bit, for HB and then for HB+.',
      [
        'The secret is fixed so you can check every bit yourself: <code>x = 10110010</code>, and for HB+ a second secret <code>y = 01101100</code>.',
      ]
    )
  );

  const controls = el('div', { class: 'controls' });
  const aInput = el('input', { class: 'mono-input', id: 'bh-a', value: PRESETS[0].a, 'aria-label': 'challenge a, 8 bits', maxlength: '8', spellcheck: 'false' }) as HTMLInputElement;
  const bInput = el('input', { class: 'mono-input', id: 'bh-b', value: PRESETS[0].b, 'aria-label': 'blinding vector b, 8 bits (HB+)', maxlength: '8', spellcheck: 'false' }) as HTMLInputElement;
  const nuSelect = el('select', { class: 'num-input', id: 'bh-nu', 'aria-label': 'noise bit ν' }, [
    el('option', { value: '0', text: 'ν = 0 (no noise this round)' }),
    el('option', { value: '1', text: 'ν = 1 (reply flipped)' }),
  ]) as HTMLSelectElement;

  const presetRow = el('div', { class: 'input-row', role: 'group', 'aria-label': 'preset rows from the acceptance table' });
  for (const p of PRESETS) {
    const btn = el('button', { class: 'btn btn-ghost', type: 'button', text: p.label });
    btn.addEventListener('click', () => {
      aInput.value = p.a;
      bInput.value = p.b;
      nuSelect.value = String(p.nu);
      render();
    });
    presetRow.append(btn);
  }

  controls.append(
    el('div', { class: 'controls-row' }, [
      el('div', { class: 'control' }, [el('label', { for: 'bh-a', text: 'Challenge a' }), aInput, el('p', { class: 'help', text: '8 bits, read left to right' })]),
      el('div', { class: 'control' }, [el('label', { for: 'bh-b', text: 'Blinding b (HB+ only)' }), bInput, el('p', { class: 'help', text: 'the tag sends this first in HB+' })]),
      el('div', { class: 'control' }, [el('label', { for: 'bh-nu', text: 'Noise coin ν' }), nuSelect, el('p', { class: 'help', text: 'ν = 1 with probability η; here you set it' })]),
    ]),
    presetRow
  );
  root.append(controls);

  const out = el('div', { class: 'output', id: 'bh-out' });
  root.append(out);

  function parseVec(input: HTMLInputElement): BitVec | null {
    if (!/^[01]{8}$/.test(input.value)) {
      input.setAttribute('aria-invalid', 'true');
      return null;
    }
    input.setAttribute('aria-invalid', 'false');
    return fromBits(input.value);
  }

  function render(): void {
    clear(out);
    const a = parseVec(aInput);
    const b = parseVec(bInput);
    const nu = (Number(nuSelect.value) === 1 ? 1 : 0) as Bit;
    if (!a || !b) {
      out.append(callout('danger', 'Each vector must be exactly 8 bits of 0 and 1. Refused: nothing is computed on a malformed vector.'));
      return;
    }

    const ax = dot(a, X);
    const by = dot(b, Y);
    const hbZ = (ax ^ nu) as Bit;
    const hbpZ = (ax ^ by ^ nu) as Bit;
    const andAX = toBits({ k: 8, v: a.v & X.v });
    const andBY = toBits({ k: 8, v: b.v & Y.v });

    // ---- HB column ----
    const hb = el('div', { class: 'step-card' }, [
      el('span', { class: 'step-tag', text: 'HB — SECRET x = 10110010' }),
      bitStrip('a', toBits(a)),
      bitStrip('x', '10110010'),
      bitStrip('a AND x', andAX),
      el('p', { class: 'step-eq', text: `parity(a AND x) = a·x = ${ax}` }),
      el('p', { class: 'step-eq', text: `reply z = a·x ⊕ ν = ${ax} ⊕ ${nu} = ${hbZ}` }),
    ]);
    hb.append(claimTile('round-hb-reply', String(hbZ), 'HB reply z'));
    const hbCheck = !new HBReader(X).check(a, hbZ).failed;
    hb.append(verdict('round-hb-check', hbCheck ? 'pass' : 'fail', hbCheck ? 'Reader check a·x = z PASSES this round' : 'Reader check a·x = z FAILS this round (the noise bit flipped it)'));
    out.append(hb);

    // ---- HB+ column ----
    const hbp = el('div', { class: 'step-card' }, [
      el('span', { class: 'step-tag', text: 'HB+ — SECRETS x = 10110010, y = 01101100' }),
      bitStrip('b', toBits(b)),
      bitStrip('y', '01101100'),
      bitStrip('b AND y', andBY),
      el('p', { class: 'step-eq', text: `b·y = ${by}` }),
      el('p', { class: 'step-eq', text: `reply z = a·x ⊕ b·y ⊕ ν = ${ax} ⊕ ${by} ⊕ ${nu} = ${hbpZ}` }),
    ]);
    hbp.append(claimTile('round-hbp-reply', String(hbpZ), 'HB+ reply z'));
    const hbpCheck = !new HBPlusReader(X, Y).check(a, b, hbpZ).failed;
    hbp.append(verdict('round-hbp-check', hbpCheck ? 'pass' : 'fail', hbpCheck ? 'Reader check a·x ⊕ b·y = z PASSES this round' : 'Reader check a·x ⊕ b·y = z FAILS this round (the noise bit flipped it)'));
    out.append(hbp);

    out.append(callout('info', 'A whole authentication repeats this round r times and accepts the tag if at most t of the checks fail. That is the next exhibit.'));
  }

  function claimTile(id: string, value: string, label: string): HTMLElement {
    return el('div', { class: 'stat-grid' }, [claim(id, value, label)]);
  }

  aInput.addEventListener('input', render);
  bInput.addEventListener('input', render);
  nuSelect.addEventListener('change', render);
  render();
}
