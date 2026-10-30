/**
 * The FSRS-6 memory model: how stability and difficulty move after a review, the forgetting curve and
 * the interval for a desired retention (https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm).
 *
 * SAME-AS-TS-FSRS: every formula, constant, bound and rounding step follows ts-fsrs 6.0.0 (MIT,
 * Copyright (c) 2026 Open Spaced Repetition; THIRD-PARTY-NOTICES.md) in the same order of operations,
 * so both produce the same doubles. scheduler.test.ts runs them side by side on random review histories.
 * Pure: no dates here, only days.
 */

/** FSRS-6's default weights (w0-w20), trained on millions of Anki reviews. */
export const FSRS6_WEIGHTS: readonly number[] = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483,
  0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

export const S_MIN = 0.001;
export const S_MAX = 36500;

export type Grade = 1 | 2 | 3 | 4;

export interface Memory {
  readonly stability: number;
  readonly difficulty: number;
}

const round8 = (x: number): number => Math.round(x * 1e8) / 1e8;
const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

/** The bounds ts-fsrs clips the weights to (FSRS6ParameterBounds with short-term scheduling on). */
function bounds(w17w18Ceiling: number): ReadonlyArray<readonly [number, number]> {
  return [
    [S_MIN, 100],
    [S_MIN, 100],
    [S_MIN, 100],
    [S_MIN, 100],
    [1, 10],
    [0.001, 4],
    [0.001, 4],
    [0.001, 0.75],
    [0, 4.5],
    [0, 0.8],
    [0.001, 3.5],
    [0.001, 5],
    [0.001, 0.25],
    [0.001, 0.9],
    [0, 4],
    [0, 1],
    [1, 6],
    [0, w17w18Ceiling],
    [0, w17w18Ceiling],
    [0.01, 0.8],
    [0.1, 0.8],
  ];
}

/**
 * Weights clipped into the model's bounds, as ts-fsrs does before using them: with more than one
 * relearning step, w17 and w18 get a lower ceiling so that the relearning steps cannot raise the
 * stability of a forgotten card above what it had.
 */
export function clipWeights(weights: readonly number[], relearningSteps: number): number[] {
  const clip = bounds(2).map(([lo, hi]) => [lo, hi] as [number, number]);
  if (relearningSteps > 1) {
    const at = (i: number): number => {
      const [lo, hi] = clip[i] ?? [0, 0];
      return clamp(weights[i] || 0, lo, hi);
    };
    const value = -(Math.log(at(11)) + Math.log(Math.pow(2, at(13)) - 1) + at(14) * 0.3) / relearningSteps;
    const ceiling = clamp(round8(Math.sqrt(Math.max(value, 0))), 0.01, 2);
    clip[17] = [clip[17]?.[0] ?? 0, ceiling];
    clip[18] = [clip[18]?.[0] ?? 0, ceiling];
  }
  return clip.map(([lo, hi], i) => clamp(weights[i] || 0, lo, hi));
}

export class FsrsModel {
  private readonly w: readonly number[];
  readonly decay: number;
  readonly factor: number;

  /** `weights`: 21 numbers, already clipped (clipWeights). */
  constructor(weights: readonly number[]) {
    if (weights.length !== 21 || !weights.every(Number.isFinite)) throw new RangeError('FSRS-6 needs 21 finite weights');
    this.w = weights;
    this.decay = -this.wi(20);
    this.factor = round8(Math.exp(Math.pow(this.decay, -1) * Math.log(0.9)) - 1);
  }

  private wi(i: number): number {
    return this.w[i] ?? 0;
  }

  /** The probability of recall after `elapsedDays` with this stability. */
  retrievability(elapsedDays: number, stability: number): number {
    return round8(Math.pow(1 + (this.factor * elapsedDays) / stability, this.decay));
  }

  /** Whole days until recall drops to `retention` (at least 1). */
  interval(stability: number, retention: number): number {
    return Math.max(Math.round((stability / this.factor) * (Math.pow(retention, 1 / this.decay) - 1)), 1);
  }

  initStability(g: Grade): number {
    return clamp(this.wi(g - 1), S_MIN, S_MAX);
  }

  initDifficulty(g: Grade): number {
    return round8(this.wi(4) - Math.exp((g - 1) * this.wi(5)) + 1);
  }

  nextDifficulty(d: number, g: Grade): number {
    const delta = -this.wi(6) * (g - 3);
    const next = d + round8((delta * (10 - d)) / 9); // linear damping
    const init = this.initDifficulty(4);
    return clamp(round8(this.wi(7) * init + (1 - this.wi(7)) * next), 1, 10); // mean reversion
  }

  recallStability(d: number, s: number, r: number, g: Grade): number {
    const hard = g === 2 ? this.wi(15) : 1;
    const easy = g === 4 ? this.wi(16) : 1;
    return round8(
      clamp(
        s * (1 + Math.exp(this.wi(8)) * (11 - d) * Math.pow(s, -this.wi(9)) * (Math.exp((1 - r) * this.wi(10)) - 1) * hard * easy),
        S_MIN,
        S_MAX,
      ),
    );
  }

  forgetStability(d: number, s: number, r: number): number {
    return round8(
      clamp(this.wi(11) * Math.pow(d, -this.wi(12)) * (Math.pow(s + 1, this.wi(13)) - 1) * Math.exp((1 - r) * this.wi(14)), S_MIN, S_MAX),
    );
  }

  /** A review on the same (UTC) day as the last one. */
  shortTermStability(s: number, g: Grade): number {
    const sinc = Math.pow(s, -this.wi(19)) * Math.exp(this.wi(17) * (g - 3 + this.wi(18)));
    const masked = g >= 2 ? Math.max(sinc, 1) : sinc;
    return round8(clamp(s * masked, S_MIN, S_MAX));
  }

  /**
   * The memory after grade `g`, `elapsedDays` (whole UTC days) after the last review; `memory` null for
   * a card never reviewed. `r`: the retrievability when the caller has computed it already.
   */
  step(memory: Memory | null, elapsedDays: number, g: Grade, r?: number): Memory {
    if (memory === null || (memory.difficulty === 0 && memory.stability === 0)) {
      return { difficulty: clamp(this.initDifficulty(g), 1, 10), stability: this.initStability(g) };
    }
    const d = clamp(memory.difficulty, 1, 10);
    const s = Math.max(memory.stability, S_MIN);
    const t = Math.max(0, elapsedDays);
    const recall = r ?? this.retrievability(t, s);
    let stability: number;
    if (t === 0) stability = this.shortTermStability(s, g);
    else if (g === 1) {
      const afterFail = this.forgetStability(d, s, recall);
      const floor = s / Math.exp(this.wi(17) * this.wi(18));
      stability = clamp(round8(floor), S_MIN, afterFail);
    } else stability = this.recallStability(d, s, recall, g);
    return { difficulty: this.nextDifficulty(d, g), stability };
  }
}
