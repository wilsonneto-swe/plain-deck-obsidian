/**
 * The Markdown a card renders, as a small tree: the subset of CommonMark + GFM + Obsidian that study
 * notes use (paragraphs, headings, lists and tasks, quotes and callouts, code, tables, emphasis, links,
 * wiki links, tags, math as text). The parser is pure (blocks.ts, inline.ts); view/markdown-dom.ts turns
 * the tree into DOM nodes with textContent only, so no Markdown can inject HTML.
 */

export type Inline =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'code'; readonly v: string }
  | { readonly t: 'math'; readonly v: string }
  | { readonly t: 'em' | 'strong' | 'del' | 'mark'; readonly c: readonly Inline[] }
  | { readonly t: 'link'; readonly href: string; readonly c: readonly Inline[] }
  | { readonly t: 'image'; readonly alt: string; readonly src: string }
  | { readonly t: 'wiki'; readonly target: string; readonly label: string; readonly embed: boolean }
  | { readonly t: 'tag'; readonly v: string }
  | { readonly t: 'br' };

export type Align = 'left' | 'center' | 'right' | null;

export interface ListItem {
  /** A task item's box (`- [x]`): true when checked; null for a plain item. */
  readonly task: boolean | null;
  readonly c: readonly Block[];
}

export interface Callout {
  /** `note`, `tip`, `warning`, … as written after `[!`. */
  readonly kind: string;
  readonly title: readonly Inline[];
}

export type Block =
  | { readonly t: 'p'; readonly c: readonly Inline[] }
  | { readonly t: 'h'; readonly level: number; readonly c: readonly Inline[] }
  | { readonly t: 'code'; readonly lang: string; readonly v: string }
  | { readonly t: 'math'; readonly v: string }
  | { readonly t: 'quote'; readonly c: readonly Block[]; readonly callout: Callout | null }
  | { readonly t: 'list'; readonly ordered: boolean; readonly start: number; readonly items: readonly ListItem[] }
  | { readonly t: 'hr' }
  | {
      readonly t: 'table';
      readonly align: readonly Align[];
      readonly head: readonly (readonly Inline[])[];
      readonly rows: readonly (readonly (readonly Inline[])[])[];
    };
