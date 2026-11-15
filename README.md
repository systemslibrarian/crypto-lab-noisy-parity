# Noisy Parity

**LPN · HB / HB+ tag authentication · man-in-the-middle**

An interactive, browser-only lab for the HB and HB+ lightweight authentication protocols over **Learning Parity with Noise (LPN)**. Run honest rounds, break HB as a malicious reader, watch HB+ shrug that attack off, and then watch the man-in-the-middle recover the HB+ key one accept-or-reject at a time — with the exact false-reject and false-accept rates printed beside every session.

> **Not production cryptography — a teaching demo of two broken research protocols.** Both HB and HB+ on this page are broken on purpose; neither is fit to authenticate anything. Everything runs in the browser, in memory, with no backend. There is no RFC, no FIPS, and no published test-vector file for these protocols; what stands in for vectors is described under **Build & Verify**.

## What It Is

HB (Hopper–Blum, ASIACRYPT 2001) and HB+ (Juels–Weis, CRYPTO 2005) are symmetric authentication protocols designed to be cheap enough for an RFID tag. Both rest on **LPN**: recovering a secret `x` from many noisy parity equations `z = a·x ⊕ ν`, where `ν` is 1 with probability `η < 1/2`, is believed hard.

- **HB, one round.** The reader sends a random challenge `a`; the tag replies `z = a·x ⊕ ν`; the reader checks `a·x = z`. Repeat `r` times, accept if at most `t` checks fail.
- **HB+, one round.** The tag first sends a blinding vector `b`; the reader sends `a`; the tag replies `z = a·x ⊕ b·y ⊕ ν`; the reader checks `a·x ⊕ b·y = z`. Two secrets, `x` and `y`.

The **security model** is tag authentication against an eavesdropper (HB) or an active attacker who talks to the tag and the reader **separately** (HB+). The headline lesson of this lab is what that model leaves out: HB+ came with a **security proof**, and an attacker who sits *between* reader and tag — altering challenges in flight and watching whether the reader accepts — recovers the whole key anyway. A proof covers only the attacker it models.

Every protocol operation, every attack, the exact binomial error rates, and the Gaussian elimination are **hand-rolled** and inspectable in `src/lpn/` and `src/attack/`; there is no cryptographic dependency, because every part is the teaching subject. The one source of randomness is `crypto.getRandomValues`; `Math.random` appears nowhere.

## Exhibits

1. **One round, by hand** — `k = 8`, hand-checkable secrets. See `a`, `x`, the bitwise AND, the parity, the noise coin, the reply, and the reader's check for HB and then HB+, bit by bit.
2. **A whole authentication** — Choose `k, r, η, t`; run a session and see the per-round checks, the error count against `t`, and the verdict. Beside it the **exact** false-reject and false-accept probabilities from the binomial formulas, and an **observed** frequency over N sessions actually run in the page. Defaults to the published `k = 224, η = 0.25, r = 80, t = 20`, where an honest tag is rejected about 44% of the time.
3. **Break HB as a malicious reader** — Repeat each of `k` independent challenges, take majorities, run Gaussian elimination over GF(2) on screen, then **verify** the recovered `x` by an independent authentication run. A wrong recovery is reported as wrong.
4. **Why HB+ stops that attack** — Run exhibit 3's attack unchanged against HB+ and watch it fail: the recovered vector does not authenticate, because the `b·y` term changes every round.
5. **Break HB+ in the middle** — The centerpiece. Tamper with one bit of every challenge, watch an ordinary-looking session end ACCEPT or REJECT, and see one more bit of `x` fill in while the reader sees nothing unusual. Single-bit δ's recover `x`; then a false tag reads off `y`; then `b = 0` impersonates.
6. **What the proof covered** — The negative-claim exhibit: a single tampered session that every check calls a success, and that still leaked a key bit.
7. **Why not just listen?** — A passive eavesdropper at toy size only: exhaustive search over all `2^k` candidates for `k ≤ 16`, the work doubling with each added bit, with a plain statement that this is hopeless at `k = 224` and that the better published algorithms (BKW and successors) are named, not built.

## When to Use It

- **Use** this lab to understand LPN, the HB family, and — above all — why a security proof is only as good as the adversary model it assumes.
- **Do NOT** use HB or HB+ to authenticate anything. Both are broken here on purpose; HB falls to a malicious reader and HB+ falls to a man-in-the-middle, live on this page.
- **Do NOT** read any performance number here as a benchmark. The attack costs are reproductions of published analysis, run at teaching sizes.

## Live Demo

**https://systemslibrarian.github.io/crypto-lab-noisy-parity/**

Run an authentication and watch an honest tag get rejected by noise; break HB with repeated challenges; then tamper your way through the HB+ key one accept-or-reject at a time — all in the browser, no install.

## What Can Go Wrong

- **The threshold trade-off.** At the originally proposed threshold `t = ⌈r·η⌉`, an honest tag is falsely rejected about 44% of the time (`r = 80, η = 0.25`). Raising `t` cuts false rejects but raises false accepts; the HB# paper notes the proposed threshold is unusably high. Exhibit 2 lets you move `t` and watch both rates.
- **The proof-model lesson.** HB+ was *proved* secure — against an adversary that attacks the tag, then the reader. The man-in-the-middle attacks both at once, and each accept-or-reject the honest reader emits leaks one bit of `x`. The proof is not wrong; its model is too narrow. This is the whole point of the lab, isolated in exhibit 6.
- **Ambiguous rejections.** A single rejection does not prove a tampered bit is 1, because an honest session already fails ~44% of the time. The attack repeats until the first acceptance (bit 0) or `m` rejections in a row (bit 1). At `m = 1` the recovered key is wrong; exhibit 5 shows this rather than hiding it.

## Real-World Usage

HB and HB+ are **research protocols** proposed for low-cost devices such as RFID tags; this lab makes **no claim that either was deployed in any product**. What endures is the **LPN assumption** itself: the hardness of learning a secret from noisy parities is one of the assumptions code-based cryptography rests on, and it reappears in lattice- and code-based constructions studied for post-quantum security. The HB family is where that assumption was first turned into an authentication protocol.

## How to Run Locally

```bash
npm install
npm run dev          # http://localhost:5173/crypto-lab-noisy-parity/
npm run build        # typecheck + production build to dist/
npm test             # unit tests incl. the acceptance-check KAT stand-ins
npm run test:a11y    # WCAG 2.1 AA axe gate, dark theme (builds first)
npm run test:claims  # the §4.1b claims suite and §4.1c verdict suite
npm run test:mutations # the §4.1c mutation ledger (applies 8 patches, confirms each kill)
```

## Related Demos

- [crypto-lab-bike-vault](https://systemslibrarian.github.io/crypto-lab-bike-vault/) — the LPN / syndrome-decoding hardness assumption behind code-based KEMs, explained in prose.
- [crypto-lab-protocol-checker](https://systemslibrarian.github.io/crypto-lab-protocol-checker/) — attacks a protocol only reveals once you search outside its stated model, the same lesson exhibit 6 teaches for HB+.

## Build & Verify

There are **no published test vectors** for HB or HB+ — no RFC, no FIPS, no CSV. What stands in for them are the acceptance values the brief derived independently of any code, and the tests assert the implementation against those:

- **A — the by-hand round table** (`k = 8`): `a·x`, `b·y`, and the HB and HB+ replies for six challenges, checked against a second, independent dot-product written inside the test ([`src/lpn/hb.test.ts`](src/lpn/hb.test.ts)).
- **B — exact error rates**: `P_FR` and `P_FA` for six `(r, t)` pairs at `η = 1/4`, cross-checked against Table 1 of the HB# paper (IACR ePrint 2008/028): `0.4403` / `4.290e-6` at `r=80, t=20`, down to `1.043e-3` / `4.646e-2` at `r=80, t=32` ([`src/lpn/rates.test.ts`](src/lpn/rates.test.ts)).
- **C — tampered-session probabilities**: `P[accept | δ·x = 1] = 9.46e-21` and `P[accept | δ·x = 0] = 0.5597` at the published size.
- **D — attack outcomes** at `k = 224, r = 80, η = 1/4, t = 20`, over seeded runs: `m = 1` recovers a **wrong** `x` (and the page reports it wrong); `m = 16` recovers `x` **exactly** in 1,600–2,500 sessions; the false tag recovers `y` in exactly 224 noiseless sessions and **fails** given a wrong `x`; impersonation with `b = 0` is accepted in 50 of 50 runs ([`src/attack/mitm.test.ts`](src/attack/mitm.test.ts), [`src/attack/false-tag.test.ts`](src/attack/false-tag.test.ts)).
- **E — chosen-challenge break of HB**: majority-vote error per equation (`1.730e-2` / `3.370e-3` / `2.742e-4` at `n = 15 / 25 / 41`); recovery is exact at `η = 0, n = 1`, and a corrupted equation is reported wrong by the verification run ([`src/attack/chosen-challenge.test.ts`](src/attack/chosen-challenge.test.ts)).
- **Fail-closed paths** (G): every parameter refusal in the invariants and every edge case is a named test, and the attacker modules are constructed with no reference to the secrets ([`src/lpn/params.test.ts`](src/lpn/params.test.ts)).

The sources read for these values are Gilbert–Robshaw–Sibert, *An Active Attack Against HB+* (IACR ePrint [2005/237](https://eprint.iacr.org/2005/237), also Electronics Letters 41(21):1169–1170, 2005) and Gilbert–Robshaw–Seurin, *HB#* (IACR ePrint [2008/028](https://eprint.iacr.org/2008/028), EUROCRYPT 2008, LNCS 4965:361–378), with HB from Hopper–Blum (ASIACRYPT 2001, LNCS 2248:52–66) and HB+ from Juels–Weis (CRYPTO 2005, LNCS 3621:293–308).

- **Accessibility gate** — `@axe-core/playwright` scans the production build for **zero** WCAG 2.1 A/AA violations, driving every exhibit through its verdict, refusal and retirement states at desktop and phone width ([`e2e/a11y.spec.ts`](e2e/a11y.spec.ts)). Non-text contrast (1.4.11) and reflow (1.4.10) are measured by dedicated oracles axe has no rule for.
- **Claims and verdicts** — [`e2e/claims.spec.ts`](e2e/claims.spec.ts) re-derives each displayed probability from the values on screen and checks every count against the rows it summarizes; [`e2e/verdicts.spec.ts`](e2e/verdicts.spec.ts) pins each rendered verdict. Eight recorded source mutations ([`mutations/registry.json`](mutations/registry.json)) each break the mechanism behind a verdict, and `npm run test:mutations` confirms every one is killed by its owning test.
- **Gated CI and deployment** — [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs the unit tests, the build, and the a11y gate before any deploy; pull requests are tested but never published; Dependabot bumps auto-merge only after that same gate goes green.

## Performance

All arithmetic runs in the browser. The full man-in-the-middle recovery of a 224-bit `x` at `m = 16` runs about 2,000 tampered sessions of 80 rounds each in well under a second; the toy exhaustive search is capped at `k = 16` (65,536 candidates) so it stays instant. There is no backend and no network I/O after the static load.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
