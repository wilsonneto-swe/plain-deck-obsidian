/**
 * A study session over one or more decks: which card comes next, what an answer does to the queues,
 * and undo. Pure and DOM-free; the view (view/app.ts) owns the files and the scheduler.
 *
 * The session holds REFERENCES (deck id + card ref), never card text or state: the view resolves an item
 * against the deck as it is now each time it shows one (RESOLVE-ON-SHOW), so an edit or a review made on
 * another device while the session runs is never shown stale; an item that no longer resolves to a due
 * card is dropped.
 *
 * Order (ORDER): a learning card that is due, then the reviews (most overdue first), then the new cards
 * (in file order, `newPerSession` per deck), then a learning card due within the learn-ahead window.
 */
import type { CardRef, CardState, Deck } from '../format/types.js';
import { LEARN_AHEAD_MS, isDue, studyDay } from './due.js';

export type Bucket = 'new' | 'learning' | 'review';

export interface StudyItem {
  readonly deck: string;
  readonly ref: CardRef;
  readonly bucket: Bucket;
  /** When the item may be shown (learning items wait for it; the others are due already). */
  readonly due: number;
}

export interface DeckEntry {
  readonly id: string;
  readonly deck: Deck;
}

export interface SessionOptions {
  readonly newPerSession: number;
  readonly dayStartHour: number;
  readonly learnAheadMs?: number;
}

/** One answer, as undo needs it: the card's state before and after. */
export interface Answered {
  readonly item: StudyItem;
  readonly prev: CardState | null;
  readonly next: CardState;
}

interface Snapshot extends Answered {
  readonly queue: readonly StudyItem[];
  readonly learning: readonly StudyItem[];
  readonly answered: number;
}

const sameItem = (a: StudyItem, b: StudyItem): boolean =>
  a.deck === b.deck && a.ref.front === b.ref.front && a.ref.occurrence === b.ref.occurrence;

/** Undo reaches this many answers back. */
export const UNDO_DEPTH = 100;

export class StudySession {
  private queue: StudyItem[];
  /** Learning and relearning items, earliest due first. */
  private learning: StudyItem[];
  private readonly history: Snapshot[] = [];
  private readonly learnAheadMs: number;
  /** Answers given in this session (undo takes them back). */
  answered = 0;

  private constructor(
    queue: StudyItem[],
    learning: StudyItem[],
    private readonly options: SessionOptions,
  ) {
    this.queue = queue;
    this.learning = learning;
    this.learnAheadMs = options.learnAheadMs ?? LEARN_AHEAD_MS;
  }

  /** Plan a session at `now` over `decks` (ORDER). */
  static plan(decks: readonly DeckEntry[], now: number, options: SessionOptions): StudySession {
    const reviews: StudyItem[] = [];
    const fresh: StudyItem[] = [];
    const learning: StudyItem[] = [];
    const today = studyDay(now, options.dayStartHour);
    for (const { id, deck } of decks) {
      let taken = 0;
      for (const card of deck.cards) {
        if (card.problem !== null) continue;
        const s = card.state;
        if (s === null) {
          if (taken < options.newPerSession) {
            fresh.push({ deck: id, ref: card.ref, bucket: 'new', due: now });
            taken++;
          }
        } else if (s.phase !== 'review') {
          if (studyDay(s.due, options.dayStartHour) <= today) learning.push({ deck: id, ref: card.ref, bucket: 'learning', due: s.due });
        } else if (isDue(s, now, options)) {
          reviews.push({ deck: id, ref: card.ref, bucket: 'review', due: s.due });
        }
      }
    }
    reviews.sort((a, b) => a.due - b.due);
    learning.sort((a, b) => a.due - b.due);
    return new StudySession([...reviews, ...fresh], learning, options);
  }

  /** The item to show at `now`, or null when nothing is left (or only learning cards due later). */
  current(now: number): StudyItem | null {
    const first = this.learning[0];
    if (first !== undefined && first.due <= now) return first;
    const next = this.queue[0];
    if (next !== undefined) return next;
    if (first !== undefined && first.due <= now + this.learnAheadMs) return first;
    return null;
  }

  /**
   * `item` was answered at `now`: its card held `prev` and now holds `state`. A card still learning today
   * comes back when due.
   */
  answer(item: StudyItem, state: CardState, now: number, prev: CardState | null = null): void {
    this.history.push({ queue: this.queue, learning: this.learning, item, prev, next: state, answered: this.answered });
    if (this.history.length > UNDO_DEPTH) this.history.shift();
    this.remove(item);
    if (state.phase !== 'review' && studyDay(state.due, this.options.dayStartHour) <= studyDay(now, this.options.dayStartHour)) {
      const back: StudyItem = { deck: item.deck, ref: item.ref, bucket: 'learning', due: state.due };
      const at = this.learning.findIndex((l) => l.due > back.due);
      this.learning = at < 0 ? [...this.learning, back] : [...this.learning.slice(0, at), back, ...this.learning.slice(at)];
    }
    this.answered++;
  }

  /** `item` cannot be studied any more (its card is gone, or no longer due): it leaves without an undo step. */
  drop(item: StudyItem): void {
    this.remove(item);
  }

  /** Can the last answer be taken back? */
  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /** The last answer, before `undo()` takes it back (the view writes `prev` back into the file first). */
  lastAnswered(): Answered | null {
    const snap = this.history.at(-1);
    return snap === undefined ? null : { item: snap.item, prev: snap.prev, next: snap.next };
  }

  /**
   * Take the last answer back: the queues are as they were before it, and the answer is returned. The
   * view shows its item next (it was the one on screen), whatever `current()` would pick.
   */
  undo(): Answered | null {
    const snap = this.history.pop();
    if (snap === undefined) return null;
    this.queue = [...snap.queue];
    this.learning = [...snap.learning];
    this.answered = snap.answered;
    return { item: snap.item, prev: snap.prev, next: snap.next };
  }

  /** The last answer can no longer be taken back (its card changed in the file since): undo forgets it. */
  forgetLast(): void {
    this.history.pop();
  }

  /** What is left: the new and review items, and every learning item of today. */
  counts(): Readonly<Record<Bucket, number>> {
    let fresh = 0;
    let review = 0;
    for (const i of this.queue) {
      if (i.bucket === 'new') fresh++;
      else review++;
    }
    return { new: fresh, learning: this.learning.length, review };
  }

  /** The earliest learning item, when only learning items are left: "come back at …". */
  nextLearningDue(): number | null {
    return this.queue.length === 0 ? (this.learning[0]?.due ?? null) : null;
  }

  private remove(item: StudyItem): void {
    this.queue = this.queue.filter((i) => !sameItem(i, item));
    this.learning = this.learning.filter((i) => !sameItem(i, item));
  }
}
