/**
 * The deck reader (F2-F8, F10, F11). One pass over the lines: front matter, the opaque blocks, the
 * `# ` title and the `## ` card headings; then each card's lines are split into its state line, prompt
 * and back. `scanDeck` keeps the line numbers the writer needs; `parseDeck` gives the data.
 */
import { atxHeading, content, frontMatterEnd, scanLine, splitLines, type Line, type Opaque } from './lines.js';
import { parseStateLine } from './state.js';
import type { Card, CardRef, CardState, Deck, ParseOptions } from './types.js';

/** A card's place in the file: line indices into `ScannedDeck.lines`. */
export interface CardSpan {
  readonly front: string;
  readonly occurrence: number;
  readonly heading: number;
  /** First line after the card (the next `#`/`##` heading, or lines.length). */
  readonly end: number;
  /** The card's state line (F7), or -1. */
  readonly stateLine: number;
  /** The `?` separator (F6), or -1. */
  readonly separator: number;
  /** What the state line holds (F7, F8); null for a card without one (a new card). */
  readonly state: CardState | 'unreadable' | null;
}

export interface ScannedDeck {
  readonly lines: readonly Line[];
  readonly title: string | null;
  readonly cards: readonly CardSpan[];
}

/** `Networking.cards.md` -> `Networking`, `notes.md` -> `notes` (F3). */
export function deckNameOf(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '');
  const m = /^(.*?)(?:\.cards)?\.(?:md|markdown)$/i.exec(base);
  return m?.[1] !== undefined && m[1] !== '' ? m[1] : base;
}

export function scanDeck(text: string): ScannedDeck {
  const lines = splitLines(text);
  const fm = frontMatterEnd(lines);
  let title: string | null = null;
  const cards: Array<{ front: string; heading: number }> = [];
  const ends: number[] = [];
  /** Per line: is it outside every opaque block (F5)? Only such lines can be headings, state lines or separators. */
  const plain: boolean[] = new Array<boolean>(lines.length).fill(false);
  let open: Opaque | null = null;
  for (let i = fm + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    const text = content(line, i);
    const s = scanLine(text, open);
    open = s.open;
    if (s.opaque) continue;
    plain[i] = true;
    const h = atxHeading(text);
    if (h === null || h.level > 2) continue;
    if (h.level === 1) {
      title ??= h.text;
      if (cards.length > ends.length) ends.push(i);
      continue;
    }
    if (cards.length > ends.length) ends.push(i);
    cards.push({ front: h.text, heading: i });
  }
  if (cards.length > ends.length) ends.push(lines.length);

  const seen = new Map<string, number>();
  const spans: CardSpan[] = cards.map((c, k) => {
    const occurrence = seen.get(c.front) ?? 0;
    seen.set(c.front, occurrence + 1);
    const end = ends[k] ?? lines.length;
    let stateLine = -1;
    let state: CardState | 'unreadable' | null = null;
    let separator = -1;
    for (let i = c.heading + 1; i < end; i++) {
      const line = lines[i];
      if (line === undefined || plain[i] !== true) continue;
      if (stateLine < 0) {
        const parsed = parseStateLine(line.text);
        if (parsed !== null) {
          stateLine = i;
          state = parsed;
          continue;
        }
      }
      if (separator < 0 && line.text.trim() === '?') separator = i;
    }
    return { front: c.front, occurrence, heading: c.heading, end, stateLine, separator, state };
  });
  return { lines, title, cards: spans };
}

/** Lines [from, to) as LF text without the state line, leading and trailing blank lines dropped (F6). */
function block(lines: readonly Line[], from: number, to: number, skip: number): string {
  const out: string[] = [];
  for (let i = from; i < to; i++) {
    if (i === skip) continue;
    out.push(lines[i]?.text ?? '');
  }
  while (out.length > 0 && (out[0] ?? '').trim() === '') out.shift();
  while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') out.pop();
  return out.join('\n');
}

export function cardOf(scanned: ScannedDeck, span: CardSpan): Card {
  const { lines } = scanned;
  const bodyStart = span.heading + 1;
  const prompt = span.separator < 0 ? '' : block(lines, bodyStart, span.separator, span.stateLine);
  const back = span.separator < 0 ? block(lines, bodyStart, span.end, span.stateLine) : block(lines, span.separator + 1, span.end, span.stateLine);
  const problem =
    span.front === '' ? 'The heading has no text (F11)' : span.state === 'unreadable' ? `The review state on line ${span.stateLine + 1} cannot be read (F8)` : null;
  const ref: CardRef = { front: span.front, occurrence: span.occurrence };
  return {
    front: span.front,
    prompt,
    back,
    state: span.state === 'unreadable' ? null : span.state,
    ref,
    line: span.heading,
    problem,
  };
}

/** Read a deck (F2-F8, F10, F11). Never throws: any text is a deck, maybe without cards. */
export function parseDeck(text: string, options: ParseOptions = {}): Deck {
  const scanned = scanDeck(text);
  return {
    title: scanned.title ?? deckNameOf(options.name ?? 'Deck.cards.md'),
    cards: scanned.cards.map((span) => cardOf(scanned, span)),
  };
}

/** The span a ref names (F10), or undefined. */
export function findSpan(scanned: ScannedDeck, ref: CardRef): CardSpan | undefined {
  return scanned.cards.find((c) => c.front === ref.front && c.occurrence === ref.occurrence);
}
