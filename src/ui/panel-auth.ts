import { el, clear, intro, verdict, claim, callout } from './dom';
import { validateParams, validateSessionCount, defaultThreshold, type Params } from '../lpn/params';
import { falseReject, falseAccept, tamperedAccept } from '../lpn/rates';
import { formatRational, rational, sub, ONE } from '../lpn/rational';
import { livePool, detailedHonest, observeRates } from './engine';

/**
 * Exhibit 2 — a whole authentication. Choose k, r, η, t; run one session and
 * see the per-round checks, the error count against t, and the verdict.
 * Alongside it the EXACT false-reject and false-accept probabilities from the
 * binomial formulas, and an OBSERVED frequency over N sessions actually run in
 * the page. Defaults to the published k = 224, η = 0.25, r = 80, t = 20, where
 * an honest tag is rejected about 44% of the time.
 *
 * Changing any input RETIRES the stale verdict and stats: a result is only ever
 * shown for the parameters it was computed under.
 */
export function renderAuth(root: HTMLElement): void {
  clear(root);
  root.append(
    intro(
      'A whole authentication',
      'One round is a coin flip you can win by luck. Security comes from repeating it r times and accepting only if at most t checks fail. Run a session and compare what actually happened to the exact probabilities.',
      [
        'The defaults are the published parameters (<code>k = 224, η = 0.25, r = 80, t = 20</code>). At that threshold an honest tag is rejected about 44% of the time — raise t and watch the trade against false acceptance.',
      ]
    )
  );

  const controls = el('div', { class: 'controls' });
  const kIn = numInput('auth-k', 'k (secret length)', '224');
  const rIn = numInput('auth-r', 'r (rounds)', '80');
  const etaIn = numInput('auth-eta', 'η (noise rate)', '0.25', 'text');
  const tIn = numInput('auth-t', 't (max failures to accept)', '20');
  const nIn = numInput('auth-n', 'N (sessions to observe)', '200');

  controls.append(
    el('div', { class: 'controls-row' }, [kIn.wrap, rIn.wrap, etaIn.wrap, tIn.wrap, nIn.wrap])
  );
  const runRow = el('div', { class: 'input-row' });
  const runBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Run authentication' });
  const defBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Set t = ⌈r·η⌉' });
  runRow.append(runBtn, defBtn);
  controls.append(runRow);
  root.append(controls);

  const out = el('div', { class: 'output', id: 'auth-out', role: 'region', 'aria-label': 'authentication result' });
  root.append(out);

  function retire(): void {
    clear(out);
    out.append(el('p', { class: 'busy', text: 'Parameters changed — run the authentication to see a result for them.' }));
  }

  for (const f of [kIn, rIn, etaIn, tIn, nIn]) f.input.addEventListener('input', retire);

  defBtn.addEventListener('click', () => {
    const r = Number(rIn.input.value);
    const eta = etaIn.input.value;
    const parsed = validateParams({ k: kIn.input.value, r, eta, t: 0 });
    if (parsed.ok) {
      tIn.input.value = String(defaultThreshold(r, parsed.value.eta));
      retire();
    }
  });

  runBtn.addEventListener('click', run);

  function run(): void {
    clear(out);
    const checked = validateParams({ k: kIn.input.value, r: rIn.input.value, eta: etaIn.input.value, t: tIn.input.value });
    if (!checked.ok) {
      out.append(callout('danger', `${checked.refusal.message}`));
      return;
    }
    const params: Params = checked.value;
    const nCheck = validateSessionCount(nIn.input.value);
    if (!nCheck.ok) {
      out.append(callout('danger', nCheck.refusal.message));
      return;
    }

    const pool = livePool();
    const session = detailedHonest(params, pool);

    // ---- one session's per-round strip ----
    const strip = el('div', { class: 'round-strip', role: 'img', 'aria-label': `${params.r} rounds, ${session.failures} failed` });
    for (const round of session.rounds) {
      strip.append(el('span', { class: `round-cell ${round.failed ? 'round-fail' : 'round-pass'}`, 'aria-hidden': 'true', text: round.failed ? '✕' : '✓' }));
    }
    out.append(
      el('div', { class: 'step-card' }, [
        el('span', { class: 'step-tag', text: 'ONE HONEST SESSION' }),
        strip,
        el('div', { class: 'round-legend' }, [el('span', { text: '✓ check passed' }), el('span', { text: '✕ check failed (noise)' })]),
        el('div', { class: 'stat-grid' }, [
          claim('error-count', String(session.failures), 'Failed checks', `threshold t = ${params.t}`),
        ]),
      ])
    );
    out.append(
      verdict(
        'auth-verdict',
        session.accepted ? 'pass' : 'fail',
        session.accepted
          ? `ACCEPTED — ${session.failures} of ${params.r} checks failed, within t = ${params.t}`
          : `REJECTED — ${session.failures} of ${params.r} checks failed, over t = ${params.t} (an honest tag lost to noise)`
      )
    );

    // ---- exact vs observed ----
    const pfr = falseReject(params.r, params.t, params.eta);
    const pfa = falseAccept(params.r, params.t);
    const obs = observeRates(params, pool, nCheck.value);

    out.append(el('h3', { text: 'Exact rates vs observed frequency', style: 'margin:1rem 0 0.3rem;font-size:1rem;' }));
    out.append(
      el('div', { class: 'stat-compare' }, [
        el('div', { class: 'region' }, [
          el('p', { class: 'stat-label', text: 'FALSE REJECT — honest tag turned away' }),
          el('div', { class: 'stat-grid' }, [
            claim('pfr-exact', formatRational(pfr), 'Exact P_FR', 'binomial tail'),
            claim('pfr-observed', formatRational(rational(BigInt(obs.honestRejects), BigInt(obs.n))), 'Observed', `${obs.honestRejects} of ${obs.n} honest`),
          ]),
        ]),
        el('div', { class: 'region' }, [
          el('p', { class: 'stat-label', text: 'FALSE ACCEPT — random guesser let in' }),
          el('div', { class: 'stat-grid' }, [
            claim('pfa-exact', formatRational(pfa), 'Exact P_FA', '2^(−r) tail'),
            claim('pfa-observed', formatRational(rational(BigInt(obs.guessAccepts), BigInt(obs.n))), 'Observed', `${obs.guessAccepts} of ${obs.n} guessers`),
          ]),
        ]),
      ])
    );

    const tamper = tamperedAccept(params.r, params.t, params.eta);
    const accept0 = sub(ONE, pfr);
    out.append(
      callout(
        'info',
        `Later exhibits tamper with the challenges. When the tamper vector hits a key bit that is 0 the session behaves honestly (accept probability ${formatRational(accept0)}); when it hits a 1 every noiseless round fails and acceptance collapses to ${formatRational(tamper)}. That gap is the leak.`
      )
    );
    out.append(
      callout(
        'caveat',
        'Both protocols here are broken on purpose, and neither is fit to authenticate anything. An accepted session is the protocol working as designed — in later exhibits an accepted session is exactly what leaks the key, and it is styled as an alarm there.'
      )
    );
  }

  function numInput(id: string, label: string, value: string, type = 'number'): { wrap: HTMLElement; input: HTMLInputElement } {
    const input = el('input', { class: 'num-input', id, value, type, inputmode: type === 'number' ? 'numeric' : 'text', 'aria-label': label, spellcheck: 'false' }) as HTMLInputElement;
    const wrap = el('div', { class: 'control' }, [el('label', { for: id, text: label }), input]);
    return { wrap, input };
  }
}
