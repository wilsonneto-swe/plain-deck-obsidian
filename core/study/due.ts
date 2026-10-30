/**
 * When is a card due? A learning or relearning card at its exact time (or within the learn-ahead
 * window); a review card on its STUDY DAY: a card due tomorrow at 18:00 is due all of tomorrow from the
 * day's start hour on (DUE-BY-DAY), so the cards of one day can be done in one sitting in the morning.
 * Study days are local time; the state line itself is UTC.
 */
import type { CardState, Deck } from '../format/types.js';

/** Anki's learn-ahead limit: when nothing else is due, a learning card due within 20 minutes is shown. */
export const LEARN_AHEAD_MS = 20 * 60_000;

export interface DueOptions {
  readonly dayStartHour: number;
  readonly learnAheadMs?: number;
}

/** The local study day of `ms` as a day number (days since 1970-01-01 of the local calendar). */
export function studyDay(ms: number, dayStartHour: number): number {
  const d = new Date(ms - dayStartHour * 3_600_000);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** Is a card in this state due at `now`? (A new card is not "due": it is new.) */
export function isDue(state: CardState, now: number, options: DueOptions): boolean {
  if (state.phase === 'review') return studyDay(state.due, options.dayStartHour) <= studyDay(now, options.dayStartHour);
  return state.due <= now + (options.learnAheadMs ?? 0);
}

export interface DeckCounts {
  /** New cards a session would take from this deck (at most `newPerSession`). */
  readonly new: number;
  /** All new cards of the deck. */
  readonly newTotal: number;
  /** Learning and relearning cards due today. */
  readonly learning: number;
  readonly review: number;
  readonly total: number;
  /** Cards that cannot be studied (an empty heading, an unreadable state line). */
  readonly problems: number;
  /** The earliest due time among the cards not due yet, or null. */
  readonly nextDue: number | null;
}

export function countDeck(deck: Deck, now: number, options: DueOptions & { readonly newPerSession: number }): DeckCounts {
  let newTotal = 0;
  let learning = 0;
  let review = 0;
  let problems = 0;
  let nextDue: number | null = null;
  const today = studyDay(now, options.dayStartHour);
  for (const card of deck.cards) {
    if (card.problem !== null) {
      problems++;
      continue;
    }
    const s = card.state;
    if (s === null) {
      newTotal++;
      continue;
    }
    if (s.phase !== 'review' && studyDay(s.due, options.dayStartHour) <= today) learning++;
    else if (s.phase === 'review' && isDue(s, now, options)) review++;
    else if (nextDue === null || s.due < nextDue) nextDue = s.due;
  }
  return {
    new: Math.min(newTotal, options.newPerSession),
    newTotal,
    learning,
    review,
    total: deck.cards.length,
    problems,
    nextDue,
  };
}
