/**
 * The study settings every shell keeps (the plugin in its data.json, the desktop in userData/state.json, the web page in
 * localStorage). `parseSettings` accepts anything and returns valid settings: a hand-edited or older
 * file never breaks the app, it only falls back to the defaults field by field.
 */
import type { SchedulerOptions } from '../schedule/scheduler.js';

export interface Settings {
  /** Desired retention, 0.7-0.99: higher means more reviews and fewer cards forgotten. */
  readonly retention: number;
  /** New cards each deck adds to a study session. */
  readonly newPerSession: number;
  /** No review is scheduled further away than this. */
  readonly maximumIntervalDays: number;
  /** Learning steps of a new card, minutes. */
  readonly learningSteps: readonly number[];
  /** Relearning steps of a forgotten card, minutes. */
  readonly relearningSteps: readonly number[];
  /** The local hour a study day starts at: reviews due "tomorrow" show up from then on (Anki's default is 4). */
  readonly dayStartHour: number;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  retention: 0.9,
  newPerSession: 20,
  maximumIntervalDays: 36500,
  learningSteps: Object.freeze([1, 10]),
  relearningSteps: Object.freeze([10]),
  dayStartHour: 4,
});

type Range = readonly [min: number, max: number];

export const LIMITS: {
  readonly retention: Range;
  readonly newPerSession: Range;
  readonly maximumIntervalDays: Range;
  readonly dayStartHour: Range;
  /** At most this many steps, each at most 30 days. */
  readonly steps: number;
  readonly stepMinutes: number;
} = {
  retention: [0.7, 0.99],
  newPerSession: [0, 9999],
  maximumIntervalDays: [1, 36500],
  dayStartHour: [0, 23],
  steps: 10,
  stepMinutes: 43200,
};

function inRange(v: unknown, [lo, hi]: Range, integer: boolean): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi && (!integer || Number.isInteger(v));
}

function validSteps(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length <= LIMITS.steps &&
    v.every((m) => typeof m === 'number' && Number.isFinite(m) && m > 0 && m <= LIMITS.stepMinutes)
  );
}

export function parseSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
  const r = raw as Record<string, unknown>;
  const pick = <K extends keyof Settings>(key: K, ok: (v: unknown) => boolean): Settings[K] =>
    ok(r[key]) ? (r[key] as Settings[K]) : DEFAULT_SETTINGS[key];
  return {
    retention: pick('retention', (v) => inRange(v, LIMITS.retention, false)),
    newPerSession: pick('newPerSession', (v) => inRange(v, LIMITS.newPerSession, true)),
    maximumIntervalDays: pick('maximumIntervalDays', (v) => inRange(v, LIMITS.maximumIntervalDays, true)),
    learningSteps: pick('learningSteps', validSteps),
    relearningSteps: pick('relearningSteps', validSteps),
    dayStartHour: pick('dayStartHour', (v) => inRange(v, LIMITS.dayStartHour, true)),
  };
}

const UNIT: Readonly<Record<string, number>> = { m: 1, h: 60, d: 1440 };

/** "1m 10m 1h 2d" -> [1, 10, 60, 2880]; "" -> []; null when a part is not a step. */
export function parseSteps(text: string): number[] | null {
  const parts = text.trim().split(/[\s,]+/).filter((p) => p !== '');
  const out: number[] = [];
  for (const part of parts) {
    const m = /^(\d+(?:\.\d+)?)([mhd]?)$/i.exec(part);
    if (m === null) return null;
    const minutes = Number(m[1]) * (UNIT[(m[2] ?? '').toLowerCase()] ?? 1);
    if (!(minutes > 0) || minutes > LIMITS.stepMinutes) return null;
    out.push(minutes);
  }
  return out.length > LIMITS.steps ? null : out;
}

/** [1, 10, 60, 2880] -> "1m 10m 1h 2d". */
export function formatSteps(steps: readonly number[]): string {
  return steps
    .map((m) => (m % 1440 === 0 ? `${m / 1440}d` : m % 60 === 0 ? `${m / 60}h` : `${m}m`))
    .join(' ');
}

export function schedulerOptionsOf(settings: Settings): Partial<SchedulerOptions> {
  return {
    retention: settings.retention,
    maximumIntervalDays: settings.maximumIntervalDays,
    learningSteps: settings.learningSteps,
    relearningSteps: settings.relearningSteps,
  };
}
