import { toBits, hamming, type Bit } from '../lpn/bits';
import { el, clear, intro, verdict, claim, callout, notThis } from './dom';
import { HBReader, HBTag } from '../lpn/hb';
import { BiasedBit, randomVec, noiseless } from '../lpn/noise';
import { seededPool } from './engine';
import { search, candidateCount, type Recorded } from '../attack/exhaustive';
import { validateExhaustiveK, validateRecorded, validateParams } from '../lpn/params';

/**
 * Exhibit 7 — why not just listen? A passive eavesdropper at TOY size: record q
 * honest rounds and try all 2^k candidate keys, scoring each by how many rounds
 * it satisfies. The work DOUBLES with each added bit. A plain statement that
 * this is hopeless at k = 224, and that the better published algorithms (BKW and
 * its successors) are named here, not built.
 */
function freshSeed(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0];
}

export function renderEavesdrop(root: HTMLElement): void {
  clear(root);
  root.append(
    intro(
      'Why not just listen?',
      'A passive eavesdropper never touches the challenges — it only records honest rounds. With no noise it could solve a linear system; with noise it must search. Exhaustive search finds the key, and shows exactly why it does not scale.',
      []
    )
  );
  root.append(notThis('Not built here: BKW and its sub-exponential successors, the algorithms that actually attack LPN at real sizes. They are named, not implemented — this exhibit only shows the brute-force baseline doubling.'));

  let seed = 0x1157;
  const controls = el('div', { class: 'controls' });
  const kIn = numInput('eav-k', 'k (secret length, ≤ 16)', '12');
  const qIn = numInput('eav-q', 'q (rounds recorded)', '60');
  const etaIn = numInput('eav-eta', 'η (noise rate)', '0.125', 'text');
  controls.append(el('div', { class: 'controls-row' }, [kIn.wrap, qIn.wrap, etaIn.wrap]));
  const row = el('div', { class: 'input-row' });
  const runBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Search every candidate key' });
  const newBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'New secret & recording' });
  row.append(runBtn, newBtn);
  controls.append(row);
  root.append(controls);

  const out = el('div', { class: 'output', id: 'eav-out', role: 'region', 'aria-label': 'exhaustive search result' });
  root.append(out);

  newBtn.addEventListener('click', () => { seed = freshSeed(); run(); });
  runBtn.addEventListener('click', run);

  function run(): void {
    clear(out);
    const parsed = validateParams({ k: kIn.input.value, r: 1, eta: etaIn.input.value, t: 0 });
    if (!parsed.ok) { out.append(callout('danger', parsed.refusal.message)); return; }
    const k = parsed.value.k;
    const kCap = validateExhaustiveK(k);
    if (!kCap.ok) { out.append(callout('danger', kCap.refusal.message)); return; }
    const qCheck = validateRecorded(qIn.input.value, 2000);
    if (!qCheck.ok) { out.append(callout('danger', qCheck.refusal.message)); return; }

    const pool = seededPool(seed);
    const x = randomVec(k, pool);
    const noise = parsed.value.eta.num === 0n ? noiseless : new BiasedBit(parsed.value.eta, pool);
    const tag = new HBTag(x, noise);
    const rounds: Recorded[] = [];
    for (let i = 0; i < qCheck.value; i++) {
      const a = randomVec(k, pool);
      const { z } = tag.reply(a);
      rounds.push({ a, z: z as Bit });
    }

    const res = search(k, rounds);
    const found = hamming(res.best, x) === 0;

    out.append(el('div', { class: 'stat-grid' }, [
      claim('work-doubling', candidateCount(k).toString(), 'Candidates tried', `2^${k} — doubles per added bit`),
      claim('eav-score', `${res.bestScore} / ${res.q}`, 'Best key satisfied', `${res.q - res.bestScore} noisy rounds`),
    ]));
    out.append(el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Best-scoring candidate' }), el('div', { class: 'field-value', text: toBits(res.best) })]));

    if (found && res.ties === 1) {
      out.append(verdict('exhaustive-found', 'alarm', `KEY FOUND — the best of ${candidateCount(k)} candidates is the real secret, from ${res.q} recorded rounds. At toy size, listening is enough.`));
    } else if (found) {
      out.append(verdict('exhaustive-found', 'fail', `AMBIGUOUS — the real key ties with ${res.ties - 1} other candidate(s). Record more rounds to break the tie.`));
    } else {
      out.append(verdict('exhaustive-found', 'fail', `MISSED — too few rounds or too much noise; the best candidate is ${hamming(res.best, x)} bit(s) off. Record more rounds.`));
    }
    out.append(callout('danger', `Each added key bit DOUBLES this search. At k = 16 it is ${candidateCount(16).toLocaleString()} candidates; at the published k = 224 it is 2^224 — more than the atoms in the observable universe, on every machine that will ever exist. This is why LPN is a hardness assumption, and why real attacks use BKW (Blum–Kalai–Wasserman, 2003) and its successors, which this lab names but does not build.`));
  }

  function numInput(id: string, label: string, value: string, type = 'number'): { wrap: HTMLElement; input: HTMLInputElement } {
    const input = el('input', { class: 'num-input', id, value, type, inputmode: type === 'number' ? 'numeric' : 'text', 'aria-label': label, spellcheck: 'false' }) as HTMLInputElement;
    return { wrap: el('div', { class: 'control' }, [el('label', { for: id, text: label }), input]), input };
  }
  void HBReader;
  run();
}
