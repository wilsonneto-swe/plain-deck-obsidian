/**
 * Line primitives shared by the reader and the writer: splitting that keeps byte offsets and each
 * line's own ending (F1), ATX headings (F3, F4) and the opaque-block scanner (F5). Every test here is
 * a one-pass scan of the line, linear in its length.
 */

export interface Line {
  /** Line text without its line ending (a BOM on line 0 stays in it; see `content`). */
  readonly text: string;
  /** Offset of the first character. */
  readonly start: number;
  /** Offset right after the last text character (before `\r\n` / `\n`). */
  readonly end: number;
  /** The line's own ending: '\r\n', '\n', or '' for a last line without one. */
  readonly eol: string;
}

const BOM = '﻿';

/** Splits on `\n`, dropping a `\r` right before it. A final newline does not make an extra empty line. */
export function splitLines(src: string): Line[] {
  const out: Line[] = [];
  let pos = 0;
  while (pos < src.length) {
    const nl = src.indexOf('\n', pos);
    const end = nl < 0 ? src.length : nl;
    const cr = end > pos && src.charCodeAt(end - 1) === 0x0d;
    const textEnd = cr ? end - 1 : end;
    out.push({ text: src.slice(pos, textEnd), start: pos, end: textEnd, eol: nl < 0 ? '' : cr ? '\r\n' : '\n' });
    pos = nl < 0 ? src.length : nl + 1;
  }
  return out;
}

/** The text a rule looks at: line 0 without the BOM (F1). */
export function content(line: Line, index: number): string {
  return index === 0 && line.text.startsWith(BOM) ? line.text.slice(1) : line.text;
}

/** The majority line ending of the text ('\n' on a tie or without any): F1, for a line added after the last one. */
export function majorityEol(lines: readonly Line[]): string {
  let crlf = 0;
  let lf = 0;
  for (const l of lines) {
    if (l.eol === '\r\n') crlf++;
    else if (l.eol === '\n') lf++;
  }
  return crlf > lf ? '\r\n' : '\n';
}

/** Leading spaces (tabs count as 4, as CommonMark's tab stops do for this test). */
function indentOf(text: string): number {
  let col = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x20) col++;
    else if (c === 0x09) col += 4 - (col % 4);
    else return col;
  }
  return col;
}

function isBlank(c: number): boolean {
  return c === 0x20 || c === 0x09;
}

export interface Heading {
  readonly level: number;
  /** The text without the opening and closing `#` sequences and the spaces around it. */
  readonly text: string;
}

/**
 * An ATX heading (`## Front`, `## Front ##`, `##`), at most 3 spaces of indentation, or null. A `#`
 * run must be followed by a space, a tab or the end of the line (`#tag` is not a heading).
 */
export function atxHeading(text: string): Heading | null {
  if (indentOf(text) > 3) return null;
  let i = 0;
  while (i < text.length && isBlank(text.charCodeAt(i))) i++;
  let level = 0;
  while (i < text.length && text.charCodeAt(i) === 0x23 /* # */) {
    level++;
    i++;
  }
  if (level === 0 || level > 6) return null;
  if (i < text.length && !isBlank(text.charCodeAt(i))) return null;
  let end = text.length;
  while (end > i && isBlank(text.charCodeAt(end - 1))) end--;
  // An optional closing sequence: a run of `#` preceded by a space (or making up the whole rest).
  let hashes = end;
  while (hashes > i && text.charCodeAt(hashes - 1) === 0x23) hashes--;
  if (hashes < end && (hashes === i || isBlank(text.charCodeAt(hashes - 1)))) end = hashes;
  let start = i;
  while (start < end && isBlank(text.charCodeAt(start))) start++;
  while (end > start && isBlank(text.charCodeAt(end - 1))) end--;
  return { level, text: text.slice(start, end) };
}

/** A fence opener or closer: the character and the run length, or null (F5). */
function fenceOf(text: string): { readonly char: number; readonly len: number; readonly rest: string } | null {
  if (indentOf(text) > 3) return null;
  let i = 0;
  while (i < text.length && isBlank(text.charCodeAt(i))) i++;
  const char = text.charCodeAt(i);
  if (char !== 0x60 /* ` */ && char !== 0x7e /* ~ */) return null;
  let len = 0;
  while (i + len < text.length && text.charCodeAt(i + len) === char) len++;
  if (len < 3) return null;
  const rest = text.slice(i + len);
  // A backtick fence's info string may not contain a backtick (CommonMark 4.5).
  if (char === 0x60 && rest.includes('`')) return null;
  return { char, len, rest };
}

/** The opaque block a line opens or continues (F5). */
export type Opaque =
  | { readonly kind: 'fence'; readonly char: number; readonly len: number }
  | { readonly kind: 'comment' }
  | { readonly kind: 'obsidian' }
  | { readonly kind: 'math' };

export interface Scanned {
  /** The line belongs to an opaque block (its opening and closing lines included). */
  readonly opaque: boolean;
  /** The block still open after this line. */
  readonly open: Opaque | null;
}

/**
 * One step of the opaque-block scanner (F5): given the block open before `text`, is the line inside
 * one, and which block is open after it? Front matter is handled by the reader (it can only open on
 * line 0).
 */
export function scanLine(text: string, open: Opaque | null): Scanned {
  if (open !== null) {
    switch (open.kind) {
      case 'fence': {
        const f = fenceOf(text);
        const closes = f !== null && f.char === open.char && f.len >= open.len && f.rest.trim() === '';
        return { opaque: true, open: closes ? null : open };
      }
      case 'comment':
        return { opaque: true, open: text.includes('-->') ? null : open };
      case 'obsidian':
        return { opaque: true, open: text.trim() === '%%' ? null : open };
      case 'math':
        return { opaque: true, open: text.trim() === '$$' ? null : open };
    }
  }
  const fence = fenceOf(text);
  if (fence !== null) return { opaque: true, open: { kind: 'fence', char: fence.char, len: fence.len } };
  if (indentOf(text) <= 3) {
    const trimmed = text.trim();
    if (trimmed.startsWith('<!--')) {
      // closes on the same line: a one-line comment (a state line is one), not a block
      return trimmed.indexOf('-->', 4) >= 0 ? { opaque: false, open: null } : { opaque: true, open: { kind: 'comment' } };
    }
    if (trimmed === '%%') return { opaque: true, open: { kind: 'obsidian' } };
    if (trimmed === '$$') return { opaque: true, open: { kind: 'math' } };
  }
  return { opaque: false, open: null };
}

/** Front matter (F2): line 0 is `---` and a later line `---` or `...` closes it. Returns the closing line, or -1. */
export function frontMatterEnd(lines: readonly Line[]): number {
  const first = lines[0];
  if (first === undefined || content(first, 0).trimEnd() !== '---') return -1;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i]?.text.trimEnd();
    if (t === '---' || t === '...') return i;
  }
  return -1;
}
