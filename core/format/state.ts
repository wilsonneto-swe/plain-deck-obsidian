/**
 * The state line (F7): one HTML comment on its own line, hidden in Obsidian's reading view, on GitHub
 * and in every Markdown preview:
 *
 *   <!-- srs: review due=2026-11-02T10:04:31Z last=2026-10-29T10:04:31Z s=4.1312 d=5.2341 reps=2 lapses=0 -->
 *
 * The phase comes first as a bare word, then the keys in a fixed order (`step` only when it is not 0,
 * which is almost always while learning or relearning). The reader takes the keys in any order and ignores unknown ones; a line that misses a key
 * or holds a bad value is UNREADABLE (F8), never "new": a card whose state cannot be read must not be
 * studied as new and have its history written over.
 */
import type { CardState, Phase } from './types.js';

const PHASES: ReadonlySet<string> = new Set<Phase>(['learning', 'review', 'relearning']);

/** Stability and difficulty keep 4 decimals in the file (F7). */
export const STATE_DECIMALS = 4;

/** `x` rounded the way the writer rounds stability and difficulty. */
export function roundState(x: number): number {
  return Math.round(x * 10 ** STATE_DECIMALS) / 10 ** STATE_DECIMALS;
}

/** `2026-10-29T10:04:31Z`: UTC, whole seconds. */
export function formatTime(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?Z$/;

/** A UTC time as written by `formatTime` (minutes-only and milliseconds are accepted too), or NaN. */
export function parseTime(text: string): number {
  const m = TIME_RE.exec(text);
  if (m === null) return Number.NaN;
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? '0'));
  // Date.UTC rolls an impossible date over (Feb 30 -> Mar 2): such a text is not a time.
  const back = new Date(ms);
  if (back.getUTCDate() !== Number(d) || back.getUTCHours() !== Number(h) || back.getUTCMinutes() !== Number(mi)) return Number.NaN;
  return ms;
}

function formatNumber(x: number): string {
  return String(roundState(x));
}

/** The state line for `state` (F7), without indentation or line ending. */
export function formatStateLine(state: CardState): string {
  const parts = [`srs: ${state.phase}`];
  if (state.step !== 0) parts.push(`step=${state.step}`);
  parts.push(
    `due=${formatTime(state.due)}`,
    `last=${formatTime(state.last)}`,
    `s=${formatNumber(state.stability)}`,
    `d=${formatNumber(state.difficulty)}`,
    `reps=${state.reps}`,
    `lapses=${state.lapses}`,
  );
  return `<!-- ${parts.join(' ')} -->`;
}

/** Is this line a state line (readable or not)? A one-line comment whose text starts with `srs:`. */
export function isStateLine(text: string): boolean {
  return stateBody(text) !== null;
}

function stateBody(text: string): string | null {
  const t = text.trim();
  if (!t.startsWith('<!--') || !t.endsWith('-->') || t.length < 7) return null;
  const inner = t.slice(4, -3).trim();
  return inner.startsWith('srs:') ? inner.slice(4) : null;
}

const NON_NEGATIVE_INT = /^\d{1,9}$/;
const DECIMAL = /^\d{1,9}(?:\.\d{1,12})?$/;

/**
 * The state in a state line, `null` when the line is not a state line at all, or `'unreadable'` (F8).
 * The values come back exactly as `formatStateLine` rounds them, so `parse(format(x))` is `x` rounded.
 */
export function parseStateLine(text: string): CardState | 'unreadable' | null {
  const body = stateBody(text);
  if (body === null) return null;
  const words = body.trim().split(/[ \t]+/);
  const phase = words[0] ?? '';
  if (!PHASES.has(phase)) return 'unreadable';
  const values = new Map<string, string>();
  for (const word of words.slice(1)) {
    const eq = word.indexOf('=');
    if (eq <= 0) return 'unreadable';
    const key = word.slice(0, eq);
    if (values.has(key)) return 'unreadable';
    values.set(key, word.slice(eq + 1));
  }
  const int = (key: string, fallback?: number): number => {
    const v = values.get(key);
    if (v === undefined) return fallback ?? Number.NaN;
    return NON_NEGATIVE_INT.test(v) ? Number(v) : Number.NaN;
  };
  const decimal = (key: string): number => {
    const v = values.get(key);
    return v !== undefined && DECIMAL.test(v) ? Number(v) : Number.NaN;
  };
  const state: CardState = {
    phase: phase as Phase,
    due: parseTime(values.get('due') ?? ''),
    last: parseTime(values.get('last') ?? ''),
    stability: decimal('s'),
    difficulty: decimal('d'),
    reps: int('reps'),
    lapses: int('lapses'),
    step: int('step', 0),
  };
  const ok =
    Number.isFinite(state.due) &&
    Number.isFinite(state.last) &&
    state.stability > 0 &&
    state.difficulty >= 1 &&
    state.difficulty <= 10 &&
    Number.isFinite(state.reps) &&
    state.reps >= 1 &&
    Number.isFinite(state.lapses) &&
    Number.isFinite(state.step);
  return ok ? state : 'unreadable';
}

/** Two states that write the same line are the same state (F9's compare). */
export function sameState(a: CardState | null, b: CardState | null): boolean {
  if (a === null || b === null) return a === b;
  return formatStateLine(a) === formatStateLine(b);
}
