import { type BitVec, xor } from './bits';
import { HBTag, HBReader, runSession } from './hb';
import { HBPlusTag, HBPlusReader, runSessionPlus } from './hbplus';
import { type NoiseSource, type RandomPool, randomVec } from './noise';
import { type Params } from './params';
import type { HBChallengeOracle } from '../attack/chosen-challenge';
import type { MitmOracle } from '../attack/mitm';
import type { FalseTagOracle } from '../attack/false-tag';

/**
 * The bench holds the honest parties and their secrets, and hands the attacker
 * modules nothing but the oracle interfaces a real attacker in that position
 * would have (invariant 3). The secrets never leave the bench; the page reads
 * them only AFTER an attack, to grade the recovered key — never to run the
 * attack. A test can build an attacker from `hbChallengeOracle()` /
 * `mitmOracle()` / `falseTagOracle()` and only afterwards ask the bench for the
 * secret to compare against.
 *
 * `reveal()` is the one method that exposes a secret. It exists so the UI can
 * show the bit-for-bit comparison once recovery is complete, and it is
 * deliberately separate from every oracle method, so no attack code path can
 * reach it.
 */
export class HBBench {
  private readonly tag: HBTag;
  private readonly reader: HBReader;

  constructor(
    private readonly x: BitVec,
    private readonly params: Params,
    noise: NoiseSource,
    private readonly pool: RandomPool
  ) {
    this.tag = new HBTag(x, noise);
    this.reader = new HBReader(x);
  }

  /** A malicious reader's view: send a challenge, get the noisy reply. Nothing else. */
  hbChallengeOracle(): HBChallengeOracle {
    return { query: (a: BitVec) => this.tag.reply(a).z };
  }

  /** Reader for a verification run against a recovered key. */
  verifyReader(): HBReader {
    return this.reader;
  }

  randomChallenge(): BitVec {
    return randomVec(this.params.k, this.pool);
  }

  /** Grade a recovered key: ONLY the UI calls this, and only after the attack. */
  reveal(): BitVec {
    return this.x;
  }
}

export class HBPlusBench {
  private readonly tag: HBPlusTag;
  private readonly reader: HBPlusReader;

  constructor(
    private readonly x: BitVec,
    private readonly y: BitVec,
    private readonly params: Params,
    noise: NoiseSource,
    private readonly pool: RandomPool
  ) {
    const blind = (): BitVec => randomVec(params.k, pool);
    this.tag = new HBPlusTag(x, y, noise, blind);
    this.reader = new HBPlusReader(x, y);
  }

  private challenge = (): BitVec => randomVec(this.params.k, this.pool);

  /**
   * The man-in-the-middle's view: run a full session in which every challenge
   * is XORed by δ on its way to the tag, and learn only accept/reject.
   */
  mitmOracle(): MitmOracle {
    return {
      runTamperedSession: (delta: BitVec): boolean =>
        runSessionPlus(this.params, this.tag, this.reader, this.challenge, (a) => xor(a, delta)).accepted,
    };
  }

  /**
   * The false-tag's view against the honest reader: the attacker supplies the
   * blinding vector b and a reply function, and learns accept/reject. The
   * attacker-controlled tag replies with no noise; the bench runs the reader.
   */
  falseTagOracle(): FalseTagOracle {
    return {
      runAsFalseTag: (b: BitVec, answer): boolean => {
        let failures = 0;
        for (let i = 0; i < this.params.r; i++) {
          const a = this.challenge();
          const z = answer(a);
          if (this.reader.check(a, b, z).failed) failures++;
        }
        return failures <= this.params.t;
      },
    };
  }

  /**
   * A malicious reader's view of the HB+ tag, for exhibit 4: send a challenge
   * and read z. The tag still sends a FRESH blinding vector b each query (that
   * is what the real tag does), so repeating a no longer isolates a·x — the
   * b·y term moves under it every time. The returned oracle has the SAME shape
   * as the HB one, so exhibit 3's attack code runs unchanged and simply fails.
   */
  hbStyleChallengeOracle(): HBChallengeOracle {
    return {
      query: (a: BitVec) => {
        const b = randomVec(this.params.k, this.pool);
        return this.tag.reply(a, b).z;
      },
    };
  }

  /** Reader for a verification run against a recovered (x, y). */
  verifyReader(): HBPlusReader {
    return this.reader;
  }

  randomChallenge(): BitVec {
    return randomVec(this.params.k, this.pool);
  }

  /** Grade recovered keys: UI-only, post-attack. */
  reveal(): { x: BitVec; y: BitVec } {
    return { x: this.x, y: this.y };
  }
}

// Keep runSession reachable for verification runs built elsewhere.
export { runSession };
