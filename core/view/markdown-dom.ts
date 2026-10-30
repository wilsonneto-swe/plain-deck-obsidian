/**
 * The Markdown tree (markdown/types.ts) as DOM nodes. Text only ever goes in through text nodes, and
 * the only URL ever put into an attribute is a link that passed `safeHref` (the web, mail, Obsidian):
 * a card cannot inject HTML or script into the page, whatever its file holds. Images and embeds are not
 * loaded (the shells' CSP allows no outside images); they show as a labelled placeholder.
 */
import { parseInline, plainText, safeHref } from '../markdown/inline.js';
import { parseMarkdown } from '../markdown/blocks.js';
import type { Block, Inline } from '../markdown/types.js';
import type { ElementFactory } from './types.js';

function el<K extends keyof HTMLElementTagNameMap>(make: ElementFactory, tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = make(tag);
  if (className !== undefined) node.className = className;
  return node;
}

export function renderInlines(nodes: readonly Inline[], parent: HTMLElement, make: ElementFactory): void {
  const doc = parent.ownerDocument;
  for (const n of nodes) {
    switch (n.t) {
      case 'text':
        parent.append(doc.createTextNode(n.v));
        break;
      case 'br':
        parent.append(el(make, 'br'));
        break;
      case 'code': {
        const code = el(make, 'code');
        code.textContent = n.v;
        parent.append(code);
        break;
      }
      case 'math': {
        const span = el(make, 'span', 'fc-math');
        span.textContent = n.v;
        parent.append(span);
        break;
      }
      case 'em':
      case 'strong':
      case 'del':
      case 'mark': {
        const node = el(make, n.t === 'del' ? 's' : n.t);
        renderInlines(n.c, node, make);
        parent.append(node);
        break;
      }
      case 'link': {
        const href = safeHref(n.href);
        if (href === null) {
          const span = el(make, 'span', 'fc-link-text');
          renderInlines(n.c, span, make);
          span.title = n.href;
          parent.append(span);
          break;
        }
        const a = el(make, 'a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        renderInlines(n.c, a, make);
        parent.append(a);
        break;
      }
      case 'image': {
        const span = el(make, 'span', 'fc-embed');
        span.textContent = n.alt === '' ? n.src : n.alt;
        span.title = `Image not shown: ${n.src}`;
        parent.append(span);
        break;
      }
      case 'wiki': {
        const span = el(make, 'span', n.embed ? 'fc-embed' : 'fc-wiki');
        span.textContent = n.label;
        span.title = n.embed ? `Embed not shown: ${n.target}` : n.target;
        parent.append(span);
        break;
      }
      case 'tag': {
        const span = el(make, 'span', 'fc-tag');
        span.textContent = `#${n.v}`;
        parent.append(span);
        break;
      }
    }
  }
}

export function renderBlocks(blocks: readonly Block[], parent: HTMLElement, make: ElementFactory): void {
  for (const b of blocks) {
    switch (b.t) {
      case 'p': {
        const p = el(make, 'p');
        renderInlines(b.c, p, make);
        parent.append(p);
        break;
      }
      case 'h': {
        const h = el(make, `h${Math.min(6, Math.max(1, b.level))}` as 'h1');
        renderInlines(b.c, h, make);
        parent.append(h);
        break;
      }
      case 'code': {
        const pre = el(make, 'pre');
        const code = el(make, 'code');
        if (b.lang !== '') code.dataset['lang'] = b.lang;
        code.textContent = b.v;
        pre.append(code);
        parent.append(pre);
        break;
      }
      case 'math': {
        const div = el(make, 'div', 'fc-math fc-math-block');
        div.textContent = b.v;
        parent.append(div);
        break;
      }
      case 'quote': {
        const q = el(make, 'blockquote', b.callout === null ? undefined : `fc-callout fc-callout-${b.callout.kind.replace(/[^a-z0-9-]/g, '')}`);
        if (b.callout !== null) {
          const title = el(make, 'div', 'fc-callout-title');
          renderInlines(b.callout.title, title, make);
          q.append(title);
        }
        renderBlocks(b.c, q, make);
        parent.append(q);
        break;
      }
      case 'list': {
        const list = el(make, b.ordered ? 'ol' : 'ul');
        if (b.ordered && b.start !== 1 && list instanceof HTMLOListElement) list.start = b.start;
        for (const item of b.items) {
          const li = el(make, 'li', item.task === null ? undefined : 'fc-task');
          if (item.task !== null) {
            const box = el(make, 'span', item.task ? 'fc-box fc-box-done' : 'fc-box');
            box.setAttribute('aria-hidden', 'true');
            li.append(box);
          }
          // a one-paragraph item renders as inline text (a tight list), anything else as blocks
          const only = item.c[0];
          if (item.c.length === 1 && only?.t === 'p') renderInlines(only.c, li, make);
          else renderBlocks(item.c, li, make);
          list.append(li);
        }
        parent.append(list);
        break;
      }
      case 'hr':
        parent.append(el(make, 'hr'));
        break;
      case 'table': {
        const wrap = el(make, 'div', 'fc-table');
        const table = el(make, 'table');
        const row = (cells: readonly (readonly Inline[])[], tag: 'th' | 'td'): HTMLTableRowElement => {
          const tr = el(make, 'tr');
          cells.forEach((cell, k) => {
            const c = el(make, tag);
            const align = b.align[k];
            if (align !== null && align !== undefined) c.style.textAlign = align;
            renderInlines(cell, c, make);
            tr.append(c);
          });
          return tr;
        };
        const thead = el(make, 'thead');
        thead.append(row(b.head, 'th'));
        const tbody = el(make, 'tbody');
        for (const r of b.rows) tbody.append(row(r, 'td'));
        table.append(thead, tbody);
        wrap.append(table);
        parent.append(wrap);
        break;
      }
    }
  }
}

/** Replace `parent`'s children with `markdown` rendered, its elements made by `make`. */
export function renderMarkdown(markdown: string, parent: HTMLElement, make: ElementFactory): void {
  parent.replaceChildren();
  renderBlocks(parseMarkdown(markdown), parent, make);
}

/** One line of inline Markdown (a card's front). */
export function renderInline(markdown: string, parent: HTMLElement, make: ElementFactory): void {
  parent.replaceChildren();
  renderInlines(parseInline(markdown), parent, make);
}

/** The text a screen reader or a title shows for inline Markdown. */
export function inlineText(markdown: string): string {
  return plainText(parseInline(markdown));
}
