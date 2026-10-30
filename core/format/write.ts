/**
 * The state writer (F9): compare-and-set of ONE card's state line, byte-preserving everywhere else.
 *
 * The caller names the card (F10), the state its new one was computed from and the new state. The
 * writer reads the text it is given (the file as it is NOW, not as it was when the card was shown),
 * finds the card and compares: only when the card still holds the expected state does it replace the
 * state line in place, insert one right under the heading (a new card) or remove it (a reset). Every
 * other byte, line endings and a BOM included, comes back as it was (F1).
 */
import { majorityEol } from './lines.js';
import { findSpan, scanDeck } from './parse.js';
import { formatStateLine, sameState } from './state.js';
import type { CardRef, CardState, WriteResult } from './types.js';

export function writeCardState(text: string, ref: CardRef, expected: CardState | null, next: CardState | null): WriteResult {
  const scanned = scanDeck(text);
  const span = findSpan(scanned, ref);
  if (span === undefined || span.front === '') return { kind: 'missing' };
  if (span.state === 'unreadable') return { kind: 'invalid' };
  if (!sameState(span.state, expected)) return { kind: 'changed', current: span.state };
  if (sameState(span.state, next)) return { kind: 'written', text };

  const { lines } = scanned;
  const existing = span.stateLine >= 0 ? lines[span.stateLine] : undefined;
  if (next === null) {
    // reset: the state line goes with its own line ending (a last line without one takes the ending before it)
    if (existing === undefined) return { kind: 'written', text };
    if (existing.eol !== '') return { kind: 'written', text: text.slice(0, existing.start) + text.slice(existing.end + existing.eol.length) };
    const before = lines[span.stateLine - 1];
    const cut = before === undefined ? existing.start : before.end;
    return { kind: 'written', text: text.slice(0, cut) };
  }
  const line = formatStateLine(next);
  if (existing !== undefined) return { kind: 'written', text: text.slice(0, existing.start) + line + text.slice(existing.end) };
  const heading = lines[span.heading];
  if (heading === undefined) return { kind: 'missing' };
  if (heading.eol !== '') {
    const at = heading.end + heading.eol.length;
    return { kind: 'written', text: text.slice(0, at) + line + heading.eol + text.slice(at) };
  }
  // the heading is the last line and has no line ending: the state line becomes the last line, without one either
  return { kind: 'written', text: text + majorityEol(lines) + line };
}
