/**
 * The scheduler: what a rating does to a card's state. The FSRS-6 memory model (fsrs.ts) plus the
 * short-term layer around it: learning steps for new cards, relearning steps for forgotten ones, the
 * interval for the desired retention, fuzz, and intervals that never shrink from Hard to Good to Easy.
 *
 * SAME-AS-TS-FSRS: the behaviour of ts-fsrs 6.0.0's `fsrs()` scheduler with `enable_short_term` (its
 * BasicScheduler, learning steps, getFuzzRange and fnv1a + mulberry32 fuzz seeded with the review time,
 * the rep count and difficulty x stability). The one deliberate difference: a graduating interval is
 * capped at the maximum interval too (ts-fsrs caps only reviews). scheduler.test.ts checks every step
 * of random review histories against ts-fsrs, fuzz on and off.
 *
 * Times are epoch milliseconds; a review happens at whole seconds (the state line stores seconds).
 * Elapsed days count UTC calendar days, as ts-fsrs does.
 */
import { roundState } from '../format/state.js';
import type { CardState, Phase } from '../format/types.js';
import { FSRS6_WEIGHTS, FsrsModel, clipWeights, type Grade, type Memory } from './fsrs.js';

export type Rating = Grade;
export const RATINGS: readonly Rating[] = [1, 2, 3, 4];

export interface SchedulerOptions {
  /** The chance of still knowing a card when it comes due, 0.7-0.99 (FSRS's desired retention). */
  readonly retention: number;
  readonly maximumIntervalDays: number;
  /** Learning steps of a new card, in minutes. */
  readonly learningSteps: readonly number[];
  /** Relearning steps of a forgotten card, in minutes. */
  readonly relearningSteps: readonly number[];
  /** Spread intervals of 3 days and more by a few percent, so cards learned together do not stay together. */
  readonly fuzz: boolean;
  /** FSRS-6 weights (21). */
  readonly weights: readonly number[];
}

export const DEFAULT_SCHEDULER_OPTIONS: SchedulerOptions = Object.freeze({
  retention: 0.9,
  maximumIntervalDays: 36500,
  learningSteps: Object.freeze([1, 10]),
  relearningSteps: Object.freeze([10]),
  fuzz: true,
  weights: FSRS6_WEIGHTS,
});

export interface Scheduler {
  readonly options: SchedulerOptions;
  /** The state after `rating` (`state` null: a new card). */
  next(state: CardState | null, now: number, rating: Rating): CardState;
  /** All four outcomes, for the buttons' interval labels. */
  preview(state: CardState | null, now: number): Readonly<Record<Rating, CardState>>;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

/** Whole UTC calendar days from `from` to `to` (ts-fsrs dateDiffInDays). */
export function utcDayDiff(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.floor((ub - ua) / DAY);
}

// ---- fuzz (ts-fsrs getFuzzRange, fnv1a32, mulberry32) ----

const FUZZ_RANGES: ReadonlyArray<{ readonly start: number; readonly end: number; readonly factor: number }> = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Number.POSITIVE_INFINITY, factor: 0.05 },
];

export function fuzzRange(interval: number, elapsedDays: number, maximum: number): { min: number; max: number } {
  let delta = 1;
  for (const range of FUZZ_RANGES) delta += range.factor * Math.max(Math.min(interval, range.end) - range.start, 0);
  const capped = Math.min(interval, maximum);
  let min = Math.max(2, Math.round(capped - delta));
  const max = Math.min(Math.round(capped + delta), maximum);
  if (capped > elapsedDays) min = Math.max(min, elapsedDays + 1);
  min = Math.min(min, max);
  return { min, max };
}

function fnv1a32(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** The first number of mulberry32 seeded with fnv1a32(seed): in [0, 1). */
export function seededRandom(seed: string): number {
  let a = fnv1a32(seed) >>> 0;
  let t = (a += 1831565813);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---- learning steps (ts-fsrs calculateLearningSteps) ----

type From = 'new' | Phase;
type StepPlan = Partial<Record<Rating, { readonly minutes: number; readonly next: number }>>;

function stepPlan(options: SchedulerOptions, from: From, step: number): StepPlan {
  const steps = from === 'relearning' || from === 'review' ? options.relearningSteps : options.learningSteps;
  if (steps.length === 0 || step >= steps.length) return {};
  if (from === 'review') return { 1: { minutes: steps[Math.max(0, step)] ?? 0, next: 0 } };
  const first = steps[0] ?? 0;
  const second = steps[1];
  const plan: Record<number, { minutes: number; next: number }> = {
    1: { minutes: first, next: 0 },
    2: { minutes: second === undefined ? first * 1.5 : (first + second) / 2, next: step },
  };
  const following = steps[step + 1];
  if (following !== undefined) {
    const minutes = step === 0 && second !== undefined ? second : following;
    if (minutes > 0) plan[3] = { minutes, next: step + 1 };
  }
  return plan;
}

export function createScheduler(overrides: Partial<SchedulerOptions> = {}): Scheduler {
  const options: SchedulerOptions = { ...DEFAULT_SCHEDULER_OPTIONS, ...overrides };
  const model = new FsrsModel(clipWeights(options.weights, options.relearningSteps.length));
  const maximum = Math.max(1, Math.round(options.maximumIntervalDays));

  /** Days until the card is due again for this stability (fuzzed). */
  const interval = (stability: number, elapsed: number, seed: string): number => {
    const base = model.interval(stability, options.retention);
    if (!options.fuzz || base < 2.5) return Math.round(base);
    const { min, max } = fuzzRange(base, elapsed, maximum);
    return Math.floor(seededRandom(seed) * (max - min + 1) + min);
  };

  const state = (phase: Phase, memory: Memory, due: number, last: number, reps: number, lapses: number, step: number): CardState => ({
    phase,
    due,
    last,
    stability: roundState(memory.stability),
    difficulty: roundState(memory.difficulty),
    reps,
    lapses,
    step,
  });

  const next = (current: CardState | null, now: number, rating: Rating): CardState => {
    const t = Math.floor(now / 1000) * 1000;
    const from: From = current === null ? 'new' : current.phase;
    const elapsed = current === null ? 0 : Math.max(0, utcDayDiff(current.last, t));
    const reps = (current?.reps ?? 0) + 1;
    const lapses = current?.lapses ?? 0;
    const step = current?.step ?? 0;
    const memory: Memory | null = current === null ? null : { stability: current.stability, difficulty: current.difficulty };
    // ts-fsrs seeds its fuzz with the review time, the new rep count and the old difficulty x stability
    const seed = `${t}_${reps}_${(current?.difficulty ?? 0) * (current?.stability ?? 0)}`;

    /** Learning steps (ts-fsrs applyLearningSteps): a step for this rating, else graduate to review. */
    const afterSteps = (m: Memory, to: Phase, lapseCount: number): CardState => {
      const planned = stepPlan(options, from, step)[rating];
      const minutes = Math.round(Math.max(0, planned?.minutes ?? 0) * 60) / 60;
      const nextStep = Math.max(0, planned?.next ?? 0);
      if (minutes > 0 && minutes < 1440) return state(to, m, t + minutes * MINUTE, t, reps, lapseCount, nextStep);
      if (minutes >= 1440) return state('review', m, t + minutes * MINUTE, t, reps, lapseCount, nextStep);
      const days = Math.min(interval(m.stability, elapsed, seed), maximum);
      return state('review', m, t + days * DAY, t, reps, lapseCount, 0);
    };

    if (current === null || from !== 'review') {
      const m = model.step(memory, elapsed, rating);
      return afterSteps(m, from === 'new' ? 'learning' : from, lapses);
    }

    const r = model.retrievability(elapsed, Math.max(current.stability, 0.001));
    if (rating === 1) return afterSteps(model.step(memory, elapsed, 1, r), 'relearning', lapses + 1);
    // Hard, Good and Easy are scheduled together: each at least a day after the one before it.
    const hard = model.step(memory, elapsed, 2, r);
    const good = model.step(memory, elapsed, 3, r);
    const easy = model.step(memory, elapsed, 4, r);
    const ih = Math.min(interval(hard.stability, elapsed, seed), maximum);
    const ig = Math.min(Math.max(interval(good.stability, elapsed, seed), ih + 1), maximum);
    const ie = Math.min(Math.max(interval(easy.stability, elapsed, seed), ig + 1), maximum);
    const [m, days] = rating === 2 ? [hard, ih] : rating === 3 ? [good, ig] : [easy, ie];
    return state('review', m, t + days * DAY, t, reps, lapses, 0);
  };

  return {
    options,
    next,
    preview: (current, now) => ({ 1: next(current, now, 1), 2: next(current, now, 2), 3: next(current, now, 3), 4: next(current, now, 4) }),
  };
}
