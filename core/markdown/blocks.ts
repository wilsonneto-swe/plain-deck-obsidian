/**
 * Block Markdown -> Block[] (types.ts): the card body's paragraphs, headings (ATX and setext), fenced
 * and indented code, display math, quotes and Obsidian callouts, bullet / ordered / task lists, GFM
 * tables and thematic breaks. HTML comments and Obsidian `%%` comments are dropped; raw HTML is
 * shown as the text it is. Lists and quotes nest by recursion, at most MAX_NESTING deep.
 */
import { parseInline } from './inline.js';
import type { Align, Block, Callout, ListItem } from './types.js';

const MAX_NESTING = 12;

function indentOf(line: string): number {
  let col = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === 0x20) col++;
    else if (c === 0x09) col += 4 - (col % 4);
    else return col;
  }
  return col;
}

/** `line` without its first `cols` columns of indentation (a tab that overshoots becomes spaces). */
function dedent(line: string, cols: number): string {
  let col = 0;
  let i = 0;
  while (i < line.length && col < cols) {
    const c = line.charCodeAt(i);
    if (c === 0x20) col++;
    else if (c === 0x09) {
      const next = col + 4 - (col % 4);
      if (next > cols) return ' '.repeat(next - cols) + line.slice(i + 1);
      col = next;
    } else break;
    i++;
  }
  return line.slice(i);
}

const isBlank = (line: string): boolean => line.trim() === '';

function fence(line: string): { char: string; len: number; info: string; indent: number } | null {
  const indent = indentOf(line);
  if (indent > 3) return null;
  const m = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line);
  if (m?.[1] === undefined) return null;
  const info = (m[2] ?? '').trim();
  if (m[1][0] === '`' && info.includes('`')) return null;
  return { char: m[1][0] ?? '`', len: m[1].length, info, indent };
}

function atx(line: string): { level: number; text: string } | null {
  if (indentOf(line) > 3) return null;
  const m = /^[ \t]*(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
  if (m?.[1] === undefined) return null;
  return { level: m[1].length, text: (m[2] ?? '').trim() };
}

const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

interface Marker {
  readonly ordered: boolean;
  readonly bullet: string;
  readonly start: number;
  /** Column where the item's content starts. */
  readonly content: number;
  readonly rest: string;
}

function listMarker(line: string): Marker | null {
  const indent = indentOf(line);
  if (indent > 3) return null;
  const m = /^[ \t]*(?:([-*+])|(\d{1,9})([.)]))([ \t]+|$)(.*)$/.exec(line);
  if (m === null) return null;
  const marker = m[1] ?? `${m[2] ?? ''}${m[3] ?? ''}`;
  const spaces = (m[4] ?? '').replace(/\t/g, '    ').length;
  const rest = m[5] ?? '';
  // more than 4 spaces after the marker: the content starts after one (the rest is indented code)
  const gap = rest === '' ? 1 : spaces > 4 ? 1 : spaces;
  return {
    ordered: m[2] !== undefined,
    bullet: m[1] ?? m[3] ?? '',
    start: m[2] !== undefined ? Number(m[2]) : 1,
    content: indent + marker.length + gap,
    rest: spaces > 4 ? ' '.repeat(spaces - 1) + rest : rest,
  };
}

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  let code = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i] ?? '';
    if (c === '\\' && t[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (c === '`') code = !code;
    if (c === '|' && !code) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function delimiterRow(line: string): Align[] | null {
  if (!line.includes('-') || !/^[\s|:-]+$/.test(line)) return null;
  const cells = splitRow(line);
  const out: Align[] = [];
  for (const cell of cells) {
    if (!/^:?-+:?$/.test(cell)) return null;
    const l = cell.startsWith(':');
    const r = cell.endsWith(':');
    out.push(l && r ? 'center' : r ? 'right' : l ? 'left' : null);
  }
  return out;
}

/** Does this line start a block that ends a paragraph (CommonMark's interruptions, plus tables' rows)? */
function interrupts(line: string): boolean {
  if (isBlank(line)) return true;
  if (fence(line) !== null || atx(line) !== null || HR_RE.test(line)) return true;
  const t = line.trimStart();
  if (indentOf(line) <= 3 && (t.startsWith('>') || t === '$$' || t === '%%' || t.startsWith('<!--'))) return true;
  const m = listMarker(line);
  // only a bullet with content or an ordered list starting at 1 can interrupt a paragraph
  return m !== null && m.rest.trim() !== '' && (!m.ordered || m.start === 1);
}

function calloutOf(first: string): { callout: Callout; rest: string } | null {
  const m = /^\[!([A-Za-z0-9_-]+)\][+-]?[ \t]*(.*)$/.exec(first.trim());
  if (m?.[1] === undefined) return null;
  const kind = m[1].toLowerCase();
  const title = (m[2] ?? '').trim();
  return { callout: { kind, title: parseInline(title === '' ? kind.charAt(0).toUpperCase() + kind.slice(1) : title) }, rest: '' };
}

export function parseBlocks(lines: readonly string[], depth = 0): Block[] {
  const out: Block[] = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const line = lines[i] ?? '';
    if (isBlank(line)) {
      i++;
      continue;
    }
    const indent = indentOf(line);
    const trimmed = line.trim();

    const f = fence(line);
    if (f !== null) {
      const body: string[] = [];
      i++;
      while (i < n) {
        const l = lines[i] ?? '';
        const close = fence(l);
        if (close !== null && close.char === f.char && close.len >= f.len && close.info === '') break;
        body.push(dedent(l, f.indent));
        i++;
      }
      i++; // the closing fence (or the end)
      out.push({ t: 'code', lang: f.info.split(/\s+/)[0] ?? '', v: body.join('\n') });
      continue;
    }

    if (indent <= 3 && (trimmed === '$$' || trimmed === '%%')) {
      const body: string[] = [];
      i++;
      while (i < n && (lines[i] ?? '').trim() !== trimmed) body.push(lines[i++] ?? '');
      i++;
      if (trimmed === '$$') out.push({ t: 'math', v: body.join('\n') });
      continue;
    }

    if (indent <= 3 && trimmed.startsWith('<!--')) {
      // a comment block: dropped, up to the line that closes it (text after the `-->` stays)
      const opening = i;
      while (i < n && (lines[i] ?? '').indexOf('-->', i === opening ? line.indexOf('<!--') + 4 : 0) < 0) i++;
      const closing = lines[i] ?? '';
      i++;
      const at = closing.indexOf('-->', i - 1 === opening ? closing.indexOf('<!--') + 4 : 0);
      const after = at < 0 ? '' : closing.slice(at + 3).trim();
      if (after !== '') out.push({ t: 'p', c: parseInline(after) });
      continue;
    }

    if (indent >= 4) {
      const body: string[] = [];
      while (i < n && (isBlank(lines[i] ?? '') || indentOf(lines[i] ?? '') >= 4)) body.push(dedent(lines[i++] ?? '', 4));
      while (body.length > 0 && isBlank(body[body.length - 1] ?? '')) body.pop();
      out.push({ t: 'code', lang: '', v: body.join('\n') });
      continue;
    }

    const h = atx(line);
    if (h !== null) {
      out.push({ t: 'h', level: h.level, c: parseInline(h.text) });
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const inner: string[] = [];
      while (i < n) {
        const l = lines[i] ?? '';
        if (indentOf(l) > 3 || !l.trimStart().startsWith('>')) break;
        inner.push(l.trimStart().replace(/^> ?/, ''));
        i++;
      }
      const c = calloutOf(inner[0] ?? '');
      const body = c === null ? inner : inner.slice(1);
      out.push({
        t: 'quote',
        callout: c?.callout ?? null,
        c: depth < MAX_NESTING ? parseBlocks(body, depth + 1) : [{ t: 'p', c: parseInline(body.join('\n')) }],
      });
      continue;
    }

    const marker = listMarker(line);
    if (marker !== null) {
      const items: ListItem[] = [];
      let m: Marker | null = marker;
      while (m !== null) {
        const body: string[] = [m.rest];
        i++;
        let lastBlank = false;
        while (i < n) {
          const l = lines[i] ?? '';
          if (isBlank(l)) {
            body.push('');
            lastBlank = true;
            i++;
            continue;
          }
          if (indentOf(l) >= m.content) {
            body.push(dedent(l, m.content));
            lastBlank = false;
            i++;
            continue;
          }
          // lazy continuation of the item's paragraph
          if (!lastBlank && !interrupts(l) && listMarker(l) === null) {
            body.push(l.trim());
            i++;
            continue;
          }
          break;
        }
        while (body.length > 0 && isBlank(body[body.length - 1] ?? '')) body.pop();
        let task: boolean | null = null;
        const first = body[0] ?? '';
        const tm = /^\[([ xX])\](?:[ \t]+|$)/.exec(first);
        if (tm !== null) {
          task = tm[1] !== ' ';
          body[0] = first.slice(tm[0].length);
        }
        items.push({ task, c: depth < MAX_NESTING ? parseBlocks(body, depth + 1) : [{ t: 'p', c: parseInline(body.join('\n')) }] });
        const next: Marker | null = i < n ? listMarker(lines[i] ?? '') : null;
        m = next !== null && next.ordered === marker.ordered && next.bullet === marker.bullet ? next : null;
      }
      out.push({ t: 'list', ordered: marker.ordered, start: marker.start, items });
      continue;
    }

    if (line.includes('|') && i + 1 < n) {
      const align = delimiterRow(lines[i + 1] ?? '');
      const head = splitRow(line);
      if (align !== null && align.length === head.length) {
        const rows: ReturnType<typeof parseInline>[][] = [];
        i += 2;
        while (i < n && !isBlank(lines[i] ?? '') && (lines[i] ?? '').includes('|')) {
          const cells = splitRow(lines[i++] ?? '');
          rows.push(head.map((_, k) => parseInline(cells[k] ?? '')));
        }
        out.push({ t: 'table', align, head: head.map((cell) => parseInline(cell)), rows });
        continue;
      }
    }

    // a paragraph, maybe a setext heading
    const para: string[] = [line.trim()];
    i++;
    let setext = 0;
    while (i < n) {
      const l = lines[i] ?? '';
      if (indentOf(l) <= 3 && /^[ \t]*(=+|-+)[ \t]*$/.test(l)) {
        setext = l.trim().startsWith('=') ? 1 : 2;
        i++;
        break;
      }
      if (interrupts(l)) break;
      para.push(l.trim());
      i++;
    }
    const text = para.join('\n');
    out.push(setext > 0 ? { t: 'h', level: setext, c: parseInline(text) } : { t: 'p', c: parseInline(text) });
  }
  return out;
}

export function parseMarkdown(src: string): Block[] {
  return parseBlocks(src.replace(/\r\n?/g, '\n').split('\n'));
}
