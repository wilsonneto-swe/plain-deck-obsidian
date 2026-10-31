/**
 * The vault's decks and the one write the study UI asks for, without Obsidian: everything here talks to
 * a VaultLike (main.ts adapts Obsidian's Vault to it, the tests use an in-memory one), so it runs in Node.
 *
 * - DECK-FILES: a note whose name ends in `.cards.md` (any letter case) is a deck; with a deck folder set,
 *   only the notes under it. Notes in dot folders never are (Obsidian does not index them anyway).
 *   OPENED-NOTES: any other note becomes a deck too once it is opened with the plugin (main.ts keeps the
 *   list in the plugin's data); the index asks `isDeck(path)` and holds no rule of its own.
 * - VAULT-CAS: a rating reads the note as it is now (Vault.read), runs the core's compare-and-set
 *   (writeCardState, F9) and, only when the line changes, writes through Vault.process, which hands the
 *   note's current text to the same compare-and-set again and saves atomically: an edit or a synced review
 *   that lands between the read and the write is compared against, never written over.
 * - WRITE-CHAIN: the writes into one note run one after the other (a rating and its undo never race).
 * - NEW-DECK: the name and the text a new deck gets (freeDeckPath, newDeckText); main.ts creates it.
 * - The texts kept here are what the UI shows; the vault's create / modify / delete / rename events keep
 *   them current (main.ts), our own writes included (they come back with the same text: nothing to show).
 */
import { countDeck, parseDeck, type CardRef, type CardState, type DeckInput, type SaveOutcome, type Settings } from '@plaindeck/core';
import { writeCardState, type WriteResult } from '@plaindeck/core/format';

export const DECK_SUFFIX = '.cards.md';

/** Is the note at this vault path a deck (DECK-FILES)? `folder` is normalised ('' = the whole vault). */
export function isDeckPath(path: string, folder: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (!name.toLowerCase().endsWith(DECK_SUFFIX) || name.length === DECK_SUFFIX.length) return false;
  if (path.split('/').some((segment) => segment.startsWith('.'))) return false;
  return folder === '' || path.startsWith(`${folder}/`);
}

/** NEW-DECK: the first unused deck path in `folder` ('' = the vault's root): `Untitled.cards.md`, `Untitled 1.cards.md`… */
export function freeDeckPath(folder: string, taken: (path: string) => boolean, base = 'Untitled'): string {
  const at = (name: string): string => (folder === '' ? name : `${folder}/${name}`);
  for (let n = 0; ; n++) {
    const path = at(`${base}${n === 0 ? '' : ` ${n}`}${DECK_SUFFIX}`);
    if (!taken(path)) return path;
  }
}

/** What a new deck holds: its title and one card to overwrite, which also shows the format. */
export function newDeckText(title: string): string {
  return `# ${title}

## Your first question?
Its answer. Every \`## \` heading is a card, and the lines under it are the answer.
`;
}

/** The slice of Obsidian's Vault the decks need, by vault path. */
export interface VaultLike {
  /** The path of every Markdown note in the vault. */
  markdownPaths(): string[];
  /** The note's text from Obsidian's cache (fast; what the vault last read or wrote). */
  cachedRead(path: string): Promise<string>;
  /** The note's text read from the disk now. */
  read(path: string): Promise<string>;
  /** Atomic read-modify-write: `fn` gets the note's current text; resolves to the text saved. */
  process(path: string, fn: (data: string) => string): Promise<string>;
}

const describe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export class DeckIndex {
  private texts = new Map<string, string>();
  private readonly chains = new Map<string, Promise<SaveOutcome>>();

  constructor(
    private readonly vault: VaultLike,
    /** Is the note at this path a deck (DECK-FILES, OPENED-NOTES)? */
    private readonly isDeck: (path: string) => boolean,
  ) {}

  /** Read every deck of the vault (at startup, and when the deck folder or the opened notes change). */
  async load(): Promise<void> {
    const paths = this.vault.markdownPaths().filter((p) => this.isDeck(p));
    const texts = await Promise.all(paths.map((p) => this.vault.cachedRead(p).catch(() => null)));
    const next = new Map<string, string>();
    paths.forEach((p, i) => {
      const text = texts[i];
      if (text !== null && text !== undefined) next.set(p, text);
    });
    this.texts = next;
  }

  has(path: string): boolean {
    return this.texts.has(path);
  }

  /** Every deck's path, sorted. */
  paths(): string[] {
    return [...this.texts.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }

  /**
   * A note was created or modified: read it again when it is a deck. True when the UI has something new
   * to show (a deck appeared, or its text changed).
   */
  async refresh(path: string): Promise<boolean> {
    if (!this.isDeck(path)) return this.remove(path);
    let text: string;
    try {
      text = await this.vault.cachedRead(path);
    } catch {
      return false;
    }
    if (this.texts.get(path) === text) return false;
    this.texts.set(path, text);
    return true;
  }

  /** A note was deleted (or renamed away): true when it was a deck. */
  remove(path: string): boolean {
    return this.texts.delete(path);
  }

  input(path: string): DeckInput | undefined {
    const text = this.texts.get(path);
    return text === undefined ? undefined : { id: path, name: path, fileName: path.slice(path.lastIndexOf('/') + 1), text };
  }

  inputs(): DeckInput[] {
    return this.paths().flatMap((p) => {
      const d = this.input(p);
      return d === undefined ? [] : [d];
    });
  }

  /** What is waiting across the decks (the status bar): learning and review cards due, and new cards a session would take. */
  waiting(now: number, settings: Settings): { readonly due: number; readonly fresh: number } {
    let due = 0;
    let fresh = 0;
    for (const [path, text] of this.texts) {
      const c = countDeck(parseDeck(text, { name: path }), now, { dayStartHour: settings.dayStartHour, newPerSession: settings.newPerSession });
      due += c.learning + c.review;
      fresh += c.new;
    }
    return { due, fresh };
  }

  /** AppOptions.setCardState: WRITE-CHAIN, then VAULT-CAS. Never throws. */
  setCardState(path: string, ref: CardRef, from: CardState | null, to: CardState | null): Promise<SaveOutcome> {
    const run = async (): Promise<SaveOutcome> => {
      if (!this.texts.has(path)) return { kind: 'failed', message: 'this deck is not in the vault any more' };
      try {
        const current = await this.vault.read(path);
        const first = writeCardState(current, ref, from, to);
        if (first.kind !== 'written' || first.text === current) {
          this.texts.set(path, current);
          return { kind: first.kind === 'written' ? 'saved' : first.kind, text: current };
        }
        const box: { result: WriteResult } = { result: first };
        const saved = await this.vault.process(path, (data) => {
          // the note as it is at the write: compared again
          box.result = writeCardState(data, ref, from, to);
          return box.result.kind === 'written' ? box.result.text : data;
        });
        this.texts.set(path, saved);
        return { kind: box.result.kind === 'written' ? 'saved' : box.result.kind, text: saved };
      } catch (err) {
        return { kind: 'failed', message: describe(err) };
      }
    };
    const previous = this.chains.get(path) ?? Promise.resolve<SaveOutcome>({ kind: 'failed', message: '' });
    const next = previous.then(run, run);
    this.chains.set(path, next);
    return next;
  }
}
