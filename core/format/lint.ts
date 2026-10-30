/**
 * Deck lint: what the reader accepts but the author probably did not mean. It is the checker of the
 * agent skill (skills/plain-deck-flashcards, scripts/check-deck.mjs) and not part of the format:
 * reading and writing a deck never call it. ERRORS lose cards or keep them from being studied;
 * WARNINGS read fine but are likely mistakes. Lines are 0-based, like `Card.line`; every code has a
 * test in lint.test.ts.
 */
import { content, frontMatterEnd, scanLine, type Opaque } from './lines.js';
import { cardOf, deckNameOf, scanDeck } from './parse.js';
import { isStateLine } from './state.js';
import type { Deck, ParseOptions } from './types.js';

export type LintCode =
  /** error: no `## ` heading outside opaque blocks (F4, F5). */
  | 'no-cards'
  /** error: an opaque block (F5) that never closes swallows every line after it, cards included. */
  | 'unclosed-block'
  /** error: a problem card (F8, F11): listed, never studied. */
  | 'problem-card'
  /** warning: the file's name does not end in `.cards.md`, so the apps don't list it as a deck. */
  | 'file-name'
  /** warning: a line that looks like a card heading but is not one (`##Front`, or indented 4 spaces). */
  | 'not-a-heading'
  /** warning: a second card with the same front (F10): it works, but the two are easy to confuse. */
  | 'duplicate-front'
  /** warning: a card without an answer (F6). */
  | 'empty-answer'
  /** warning: a second `?` line in a card (F6): only the first splits it. */
  | 'extra-separator'
  /** warning: a second state line in a card (F7): only the first counts. */
  | 'extra-state-line'
  /** warning: a state line outside every card (F7): nothing reads it. */
  | 'stray-state-line'
  /** warning: a front longer than LONG_FRONT characters. */
  | 'long-front';

export interface LintIssue {
  readonly level: 'error' | 'warning';
  readonly code: LintCode;
  /** The 0-based line the issue is about. */
  readonly line: number;
  readonly message: string;
}

export interface DeckLint {
  /** The deck exactly as `parseDeck` reads it. */
  readonly deck: Deck;
  /** By line, errors before warnings on the same line. */
  readonly issues: readonly LintIssue[];
}

/** A front longer than this reads badly as a heading: the details belong above a `?` line (F6). */
export const LONG_FRONT = 150;

const BLOCK: Record<Opaque['kind'], string> = {
  fence: 'code block',
  comment: 'HTML comment',
  obsidian: 'Obsidian comment',
  math: 'math block',
};

export function lintDeck(text: string, options: ParseOptions = {}): DeckLint {
  const scanned = scanDeck(text);
  const { lines } = scanned;
  const deck: Deck = {
    title: scanned.title ?? deckNameOf(options.name ?? 'Deck.cards.md'),
    cards: scanned.cards.map((span) => cardOf(scanned, span)),
  };
  const issues: LintIssue[] = [];
  const add = (level: LintIssue['level'], code: LintCode, line: number, message: string): void => {
    issues.push({ level, code, line, message });
  };

  if (options.name !== undefined && !/\.cards\.md$/i.test(options.name)) {
    add('warning', 'file-name', 0, `The apps list only notes named *.cards.md as decks: name this file "${deckNameOf(options.name)}.cards.md".`);
  }

  // The lines outside opaque blocks (F5), as the reader sees them, and a block that never closes.
  const plain = new Array<boolean>(lines.length).fill(false);
  let open: Opaque | null = null;
  let openedAt = -1;
  for (let i = frontMatterEnd(lines) + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    const text = content(line, i);
    const s = scanLine(text, open);
    if (open === null && s.open !== null) openedAt = i;
    open = s.open;
    if (s.opaque) continue;
    plain[i] = true;
    if (/^ {0,3}##[^#\s]/.test(text)) {
      add('warning', 'not-a-heading', i, 'Not a heading: "##" needs a space after it ("## Question"), so this line is text, not a card.');
    } else if (/^(?: {4,}|\t)##(?:\s|$)/.test(text)) {
      add('warning', 'not-a-heading', i, 'Not a heading: indented by 4 spaces or a tab, so this line is text, not a card. Start it at the margin.');
    }
  }
  if (open !== null) {
    const opener = (lines[openedAt]?.text ?? '').trim();
    add(
      'error',
      'unclosed-block',
      openedAt,
      `This ${BLOCK[open.kind]} (${opener.slice(0, 20)}) never closes: every line after it is inside it, so no card below line ${openedAt + 1} is read. Close it.`,
    );
  }
  if (scanned.cards.length === 0) {
    add('error', 'no-cards', 0, 'No cards: a card starts with a "## " heading (two #, then a space) outside code blocks and comments.');
  }

  const covered = new Array<boolean>(lines.length).fill(false);
  const firstWith = new Map<string, number>();
  scanned.cards.forEach((span, k) => {
    for (let i = span.heading; i < span.end; i++) covered[i] = true;
    const card = deck.cards[k];
    if (card === undefined) return;
    if (span.front === '') {
      add('error', 'problem-card', span.heading, `${card.problem ?? 'Empty heading'}: write the question after "## ".`);
    } else if (card.problem !== null) {
      add('error', 'problem-card', span.heading, `${card.problem}: leave review lines to the app; delete that line only to start the card over.`);
    }
    const first = firstWith.get(span.front);
    if (first === undefined) firstWith.set(span.front, span.heading);
    else if (span.front !== '') {
      add('warning', 'duplicate-front', span.heading, `The same question as line ${first + 1}: both are studied, each with its own progress. Reword one so they can be told apart.`);
    }
    if (card.problem === null && card.back === '') {
      add('warning', 'empty-answer', span.heading, span.separator >= 0 ? 'Nothing below the "?" line: the card has no answer.' : 'No answer under this question.');
    }
    if (span.front.length > LONG_FRONT) {
      add('warning', 'long-front', span.heading, `A ${span.front.length}-character question: keep the heading short and put the rest above a "?" line.`);
    }
    for (let i = span.heading + 1; i < span.end; i++) {
      const line = lines[i];
      if (line === undefined || plain[i] !== true) continue;
      if (i !== span.stateLine && isStateLine(line.text)) {
        add('warning', 'extra-state-line', i, `A second review line in the card of line ${span.heading + 1} (copied from another card?): only the first one counts. Delete this one.`);
      } else if (span.separator >= 0 && i > span.separator && line.text.trim() === '?') {
        add('warning', 'extra-separator', i, 'Only the first "?" line splits a card: this one shows as a "?" in the answer.');
      }
    }
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && plain[i] === true && covered[i] !== true && isStateLine(line.text)) {
      add('warning', 'stray-state-line', i, 'A review line outside every card: nothing reads it. Delete it, or move it back under its card\'s heading.');
    }
  }

  issues.sort((a, b) => a.line - b.line || (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  return { deck, issues };
}
