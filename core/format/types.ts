/**
 * The deck format's types (rules F1-F11 in ./README.md). A deck is one Markdown file; every `## `
 * heading in it is a card, and a card's review state is one HTML comment line under its heading.
 * Everything here is plain data: the format never holds DOM or file handles.
 */

/** Where a card stands in the scheduler (F7). A NEW card has no state line, so it has no `CardState`. */
export type Phase = 'learning' | 'review' | 'relearning';

/**
 * The review state written in a card's state line (F7). Times are UTC epoch milliseconds in whole
 * seconds (the line stores seconds). `stability` and `difficulty` are FSRS's memory state, rounded to
 * 4 decimals by the writer, so a state read back from a file compares equal to the one written.
 */
export interface CardState {
  readonly phase: Phase;
  /** When the card is due next. */
  readonly due: number;
  /** When the card was last reviewed. */
  readonly last: number;
  /** FSRS stability, in days (> 0). */
  readonly stability: number;
  /** FSRS difficulty, 1 (easy) to 10 (hard). */
  readonly difficulty: number;
  /** Reviews so far, every rating counted. */
  readonly reps: number;
  /** Times the card was forgotten after it had graduated (Again on a review). */
  readonly lapses: number;
  /** Index into the learning (or relearning) steps; 0 once the card graduated (F7: written only when not 0). */
  readonly step: number;
}

/**
 * How a write names its card (F10): the front, and which card with that front it is (0 = the first in
 * the file). Fronts are almost always unique, so `occurrence` is almost always 0.
 */
export interface CardRef {
  readonly front: string;
  readonly occurrence: number;
}

export interface Card {
  /** The heading text, inline Markdown (F4). */
  readonly front: string;
  /** Markdown shown with the front, before the answer: the lines above a `?` line (F6), else "". */
  readonly prompt: string;
  /** The answer, Markdown (F6). */
  readonly back: string;
  /** The state line's content; null for a new card (and for a problem card, see `problem`). */
  readonly state: CardState | null;
  readonly ref: CardRef;
  /** 0-based line of the heading, for "open at this card". */
  readonly line: number;
  /** Why the card can never be studied or written (F8, F11); null for every healthy card. */
  readonly problem: string | null;
}

export interface Deck {
  /** The first `# ` heading, else the file name without `.cards.md` / `.md` (F3). */
  readonly title: string;
  readonly cards: readonly Card[];
}

export interface ParseOptions {
  /** The file's name (`Networking.cards.md`): the title of a deck without a `# ` heading (F3). */
  readonly name?: string;
}

/**
 * The outcome of `writeCardState` (F9, compare-and-set):
 *  - `written`  the new text (the same text when nothing had to change);
 *  - `changed`  the card's state in this text is not the one the write was computed from (another
 *               device reviewed it, someone edited the line): nothing written, here is the current one;
 *  - `missing`  no card with that front and occurrence (the front was edited, the card deleted);
 *  - `invalid`  the card's state line is unreadable (F8): the writer never touches it.
 */
export type WriteResult =
  | { readonly kind: 'written'; readonly text: string }
  | { readonly kind: 'changed'; readonly current: CardState | null }
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid' };
