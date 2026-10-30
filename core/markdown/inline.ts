/**
 * Inline Markdown -> Inline[] (types.ts). Two passes, as CommonMark does it: the first cuts the text
 * into literal runs, the constructs that take precedence (escapes, code spans, links and images, wiki
 * links and embeds, autolinks, inline math, tags, comments, line breaks) and DELIMITER RUNS (`*`, `_`,
 * `~~`, `==`); the second pairs the delimiter runs into emphasis with CommonMark's flanking rules and
 * its rule of 3.
 *
 * Line breaks inside a paragraph are kept as breaks, as Obsidian shows them by default. A paragraph
 * longer than MAX_INLINE characters is shown as plain text (the pairing is quadratic at worst).
 */
import type { Inline } from './types.js';

export const MAX_INLINE = 8000;
const MAX_DEPTH = 6;

interface Delim {
  readonly t: 'delim';
  readonly ch: '*' | '_' | '~' | '=';
  n: number;
  readonly orig: number;
  readonly open: boolean;
  readonly close: boolean;
}

type Tok = Inline | Delim;

const BR: Inline = { t: 'br' };

const isSpace = (c: string | undefined): boolean => c === undefined || /\s/u.test(c);
const isPunct = (c: string | undefined): boolean => c !== undefined && /[\p{P}\p{S}]/u.test(c);
const isAsciiPunct = (c: string | undefined): boolean => c !== undefined && /^[!-/:-@[-`{-~]$/.test(c);
const isAlnum = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);

function runLength(text: string, at: number, ch: string): number {
  let n = 0;
  while (text[at + n] === ch) n++;
  return n;
}

/** The start of the next run of exactly `len` backticks at or after `from`, or -1 (a code span's end). */
function closingTicks(text: string, from: number, len: number): number {
  let i = text.indexOf('`', from);
  while (i >= 0) {
    const run = runLength(text, i, '`');
    if (run === len) return i;
    i = text.indexOf('`', i + run);
  }
  return -1;
}

/** `[label](destination "title")` starting at the `[` at `at`: the label, the destination and where it ends. */
function linkAt(text: string, at: number): { label: string; href: string; end: number } | null {
  let depth = 0;
  let i = at;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '`') {
      const run = runLength(text, i, '`');
      const close = closingTicks(text, i + run, run);
      i = (close >= 0 ? close + run : i + run) - 1;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0 || text[i + 1] !== '(') return null;
  const label = text.slice(at + 1, i);
  let j = i + 2;
  while (text[j] === ' ' || text[j] === '\t') j++;
  let href = '';
  if (text[j] === '<') {
    const close = text.indexOf('>', j + 1);
    if (close < 0 || text.slice(j + 1, close).includes('\n')) return null;
    href = text.slice(j + 1, close);
    j = close + 1;
  } else {
    let parens = 0;
    const startDest = j;
    for (; j < text.length; j++) {
      const c = text[j] ?? '';
      if (c === '\\' && isAsciiPunct(text[j + 1])) {
        j++;
        continue;
      }
      if (/\s/.test(c)) break;
      if (c === '(') parens++;
      else if (c === ')') {
        if (parens === 0) break;
        parens--;
      }
    }
    href = text.slice(startDest, j).replace(/\\([!-/:-@[-`{-~])/g, '$1');
  }
  while (text[j] === ' ' || text[j] === '\t' || text[j] === '\n') j++;
  const q = text[j];
  if (q === '"' || q === "'" || q === '(') {
    const closeQ = q === '(' ? ')' : q;
    const close = text.indexOf(closeQ, j + 1);
    if (close < 0) return null;
    j = close + 1;
    while (text[j] === ' ' || text[j] === '\t') j++;
  }
  if (text[j] !== ')') return null;
  return { label, href, end: j + 1 };
}

/** `[[target|label]]` / `[[target#heading]]` at `at` (the first `[`). */
function wikiAt(text: string, at: number): { target: string; label: string; end: number } | null {
  const close = text.indexOf(']]', at + 2);
  if (close < 0) return null;
  const inner = text.slice(at + 2, close);
  if (inner === '' || inner.includes('\n') || inner.includes('[')) return null;
  const bar = inner.indexOf('|');
  const target = (bar < 0 ? inner : inner.slice(0, bar)).trim();
  const label = (bar < 0 ? target : inner.slice(bar + 1)).trim();
  return target === '' ? null : { target, label: label === '' ? target : label, end: close + 2 };
}

/** A bare `https://…` (GFM autolink literal): trailing punctuation and an unbalanced `)` stay outside. */
function bareUrlAt(text: string, at: number): string | null {
  const m = /^https?:\/\/[^\s<>"]+/.exec(text.slice(at, at + 2048));
  if (m === null) return null;
  let url = m[0];
  for (;;) {
    const last = url[url.length - 1];
    if (last !== undefined && '.,:;!?\'"*_~'.includes(last)) url = url.slice(0, -1);
    else if (last === ')' && (url.match(/\)/g)?.length ?? 0) > (url.match(/\(/g)?.length ?? 0)) url = url.slice(0, -1);
    else break;
  }
  return url.length > 'https://'.length ? url : null;
}

const TAG_RE = /^#([\p{L}\p{N}_\-/]+)/u;

function tokenize(text: string, depth: number): Tok[] {
  const out: Tok[] = [];
  let buf = '';
  const flush = (): void => {
    if (buf !== '') out.push({ t: 'text', v: buf });
    buf = '';
  };
  const push = (tok: Tok): void => {
    flush();
    out.push(tok);
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i] ?? '';
    const prev = text[i - 1];
    if (c === '\\') {
      const n = text[i + 1];
      if (n === '\n') {
        push(BR);
        i += 2;
      } else if (isAsciiPunct(n)) {
        buf += n;
        i += 2;
      } else {
        buf += c;
        i++;
      }
      continue;
    }
    if (c === '\n') {
      buf = buf.replace(/[ \t]+$/, '');
      push(BR);
      i++;
      while (text[i] === ' ' || text[i] === '\t') i++;
      continue;
    }
    if (c === '`') {
      const run = runLength(text, i, '`');
      const close = closingTicks(text, i + run, run);
      if (close < 0) {
        buf += '`'.repeat(run);
        i += run;
        continue;
      }
      let v = text.slice(i + run, close).replace(/\n/g, ' ');
      if (v.length >= 2 && v.startsWith(' ') && v.endsWith(' ') && v.trim() !== '') v = v.slice(1, -1);
      push({ t: 'code', v });
      i = close + run;
      continue;
    }
    if (c === '!' && text[i + 1] === '[') {
      if (text[i + 2] === '[') {
        const w = wikiAt(text, i + 1);
        if (w !== null) {
          push({ t: 'wiki', target: w.target, label: w.label, embed: true });
          i = w.end;
          continue;
        }
      }
      const l = linkAt(text, i + 1);
      if (l !== null) {
        push({ t: 'image', alt: l.label, src: l.href });
        i = l.end;
        continue;
      }
    }
    if (c === '[') {
      if (text[i + 1] === '[') {
        const w = wikiAt(text, i);
        if (w !== null) {
          push({ t: 'wiki', target: w.target, label: w.label, embed: false });
          i = w.end;
          continue;
        }
      }
      const l = linkAt(text, i);
      if (l !== null) {
        push({ t: 'link', href: l.href, c: depth < MAX_DEPTH ? parseInline(l.label, depth + 1) : [{ t: 'text', v: l.label }] });
        i = l.end;
        continue;
      }
    }
    if (c === '<') {
      if (text.startsWith('<!--', i)) {
        const end = text.indexOf('-->', i + 4);
        if (end >= 0) {
          flush();
          i = end + 3;
          continue;
        }
      }
      const auto = /^<((?:https?|mailto|obsidian):[^\s<>]+)>/i.exec(text.slice(i, i + 2048));
      if (auto?.[1] !== undefined) {
        push({ t: 'link', href: auto[1], c: [{ t: 'text', v: auto[1] }] });
        i += auto[0].length;
        continue;
      }
      const br = /^<br\s*\/?>/i.exec(text.slice(i, i + 8));
      if (br !== null) {
        push(BR);
        i += br[0].length;
        continue;
      }
    }
    if (c === '%' && text[i + 1] === '%') {
      const end = text.indexOf('%%', i + 2);
      if (end >= 0) {
        flush();
        i = end + 2;
        continue;
      }
    }
    if (c === '$') {
      // Obsidian's rule: no space inside the dollars, no digit right after the closing one ($5 and $10)
      const display = text[i + 1] === '$';
      const open = display ? 2 : 1;
      const delim = display ? '$$' : '$';
      const close = text.indexOf(delim, i + open);
      const v = close < 0 ? '' : text.slice(i + open, close);
      if (close >= 0 && v.trim() !== '' && (display || (!isSpace(v[0]) && !isSpace(v[v.length - 1]) && !/\d/.test(text[close + 1] ?? '')))) {
        push({ t: 'math', v: v.trim() });
        i = close + open;
        continue;
      }
    }
    if (c === '#' && isSpace(prev)) {
      const m = TAG_RE.exec(text.slice(i, i + 256));
      if (m?.[1] !== undefined && /[^\d]/.test(m[1])) {
        push({ t: 'tag', v: m[1] });
        i += m[0].length;
        continue;
      }
    }
    if (c === 'h' && (prev === undefined || /[\s(*_~]/.test(prev))) {
      const url = bareUrlAt(text, i);
      if (url !== null) {
        push({ t: 'link', href: url, c: [{ t: 'text', v: url }] });
        i += url.length;
        continue;
      }
    }
    if (c === '*' || c === '_' || ((c === '~' || c === '=') && text[i + 1] === c)) {
      const n = runLength(text, i, c);
      if ((c === '~' || c === '=') && n !== 2) {
        buf += c.repeat(n);
        i += n;
        continue;
      }
      const before = text[i - 1];
      const after = text[i + n];
      const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
      const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
      const open = c === '_' ? left && (!right || isPunct(before)) && !isAlnum(before) : left;
      const close = c === '_' ? right && (!left || isPunct(after)) && !isAlnum(after) : right;
      push({ t: 'delim', ch: c, n, orig: n, open, close });
      i += n;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

/** Delimiter runs left over are literal text again; neighbouring text merges. */
function finish(toks: readonly Tok[]): Inline[] {
  const out: Inline[] = [];
  for (const tok of toks) {
    const node: Inline = tok.t === 'delim' ? { t: 'text', v: tok.ch.repeat(tok.n) } : tok;
    if (node.t === 'text') {
      if (node.v === '') continue;
      const last = out[out.length - 1];
      if (last?.t === 'text') {
        out[out.length - 1] = { t: 'text', v: last.v + node.v };
        continue;
      }
    }
    out.push(node);
  }
  return out;
}

/** CommonMark's "process emphasis", closers from left to right, each paired with the nearest opener. */
function pair(toks: Tok[]): Inline[] {
  let ci = 0;
  while (ci < toks.length) {
    const closer = toks[ci];
    if (closer === undefined || closer.t !== 'delim' || !closer.close || closer.n === 0) {
      ci++;
      continue;
    }
    const doubled = closer.ch === '~' || closer.ch === '=';
    let found = -1;
    for (let oi = ci - 1; oi >= 0; oi--) {
      const o = toks[oi];
      if (o === undefined || o.t !== 'delim' || !o.open || o.ch !== closer.ch || o.n === 0) continue;
      if (doubled) {
        if (o.n >= 2 && closer.n >= 2) {
          found = oi;
          break;
        }
        continue;
      }
      // the rule of 3: a run that can both open and close pairs with one whose length makes a multiple of 3 only if both are
      if ((o.close || closer.open) && (o.orig + closer.orig) % 3 === 0 && !(o.orig % 3 === 0 && closer.orig % 3 === 0)) continue;
      found = oi;
      break;
    }
    if (found < 0) {
      ci++;
      continue;
    }
    const opener = toks[found] as Delim;
    const use = doubled ? 2 : opener.n >= 2 && closer.n >= 2 ? 2 : 1;
    const inner = finish(toks.slice(found + 1, ci));
    const t = closer.ch === '~' ? 'del' : closer.ch === '=' ? 'mark' : use === 2 ? 'strong' : 'em';
    opener.n -= use;
    closer.n -= use;
    toks.splice(found + 1, ci - found - 1, { t, c: inner });
    ci = found + 2;
  }
  return finish(toks);
}

export function parseInline(text: string, depth = 0): Inline[] {
  if (text === '') return [];
  if (text.length > MAX_INLINE) return [{ t: 'text', v: text }];
  return pair(tokenize(text, depth));
}

/** The text of an inline tree without its markup (alt texts, titles). */
export function plainText(nodes: readonly Inline[]): string {
  let out = '';
  for (const n of nodes) {
    switch (n.t) {
      case 'text':
      case 'code':
      case 'math':
        out += n.v;
        break;
      case 'tag':
        out += `#${n.v}`;
        break;
      case 'br':
        out += ' ';
        break;
      case 'image':
        out += n.alt;
        break;
      case 'wiki':
        out += n.label;
        break;
      default:
        out += plainText(n.c);
    }
  }
  return out;
}

/** The URL schemes a link may open (anything else is shown as text): the web, mail, Obsidian. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  return /^(?:https?:\/\/|mailto:|obsidian:\/\/)/i.test(h) && !/[\s<>"]/.test(h) ? h : null;
}
