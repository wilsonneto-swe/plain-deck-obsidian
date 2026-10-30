/**
 * The contract between the study UI (mountApp, app.ts) and a shell. The shell owns the files: it
 * hands the decks' texts in and performs the one write the UI asks for (a card's state, compare-and-set
 * against the file as it is NOW, F9); the UI owns everything else: the library, the session, the
 * scheduler, the keys.
 */
import type { CardRef, CardState } from '../format/types.js';
import type { Settings } from '../study/settings.js';

export interface DeckInput {
  /** Stable key (the file's path): a write names its deck by it. */
  readonly id: string;
  /** Where the deck lives, shown under its title: the path in the opened folder, or the file name. */
  readonly name: string;
  readonly text: string;
  /** The file's name: the title of a deck without a `# ` heading (F3). Defaults to `name`. */
  readonly fileName?: string;
  /** A note shown on the deck's row (reviews not saved, the file is read-only, …). */
  readonly note?: string;
}

/**
 * What became of a write (writeCardState's WriteResult, read from the file at write time):
 *  - `saved`: the state is in the file; `text` is the file's text now.
 *  - `changed` / `missing` / `invalid`: nothing written (the card's state in the file is not the one the
 *    rating was computed from / no such card any more / its state line is unreadable); `text` is the
 *    file's current text, so the UI can see what happened and go on from there.
 *  - `failed`: the file could not be read or written (permission, disk, gone).
 */
export type SaveOutcome =
  | { readonly kind: 'saved' | 'changed' | 'missing' | 'invalid'; readonly text: string }
  | { readonly kind: 'failed'; readonly message: string };

export type Screen = 'library' | 'study' | 'done';

/** Which part of a card a piece of Markdown is: the front (the heading's inline Markdown), the prompt or the back. */
export type CardPart = 'front' | 'prompt' | 'back';

export interface RenderContext {
  /** The deck the card is in (its path in the shells): relative links and embeds resolve against it. */
  readonly deckId: string;
  readonly part: CardPart;
}

/**
 * Makes an element, not yet attached (the host's own helper: Obsidian's `createEl` in the plugin, the page's
 * DOM in the web and desktop apps). The study UI never creates elements any other way, so a host decides how they are
 * made, and Obsidian's guidelines about it hold inside the plugin.
 */
export type ElementFactory = <K extends keyof HTMLElementTagNameMap>(tag: K) => HTMLElementTagNameMap[K];

export interface AppOptions {
  /** How the UI makes its elements (ElementFactory). */
  readonly createElement: ElementFactory;
  readonly settings?: Settings;
  /** Write one card's state into its deck, compare-and-set (F9). */
  setCardState(deckId: string, ref: CardRef, from: CardState | null, to: CardState | null): Promise<SaveOutcome>;
  /** The user changed a setting in the library's Settings panel: keep it. */
  onSettingsChange?(settings: Settings): void;
  /** "Open file": the shell shows the deck's file (the desktop opens it in the default Markdown app). */
  onOpenSource?(deckId: string, line: number): void;
  /**
   * Render card Markdown with the shell's own renderer instead of the core's (the Obsidian plugin uses
   * Obsidian's: images, embeds, math, code highlighting). `el` is a fresh, empty element for this render
   * only, so a render that finishes after the card changed never lands on screen. A throw or a rejection
   * shows the Markdown as plain text.
   */
  renderMarkdown?(markdown: string, el: HTMLElement, context: RenderContext): void | Promise<void>;
  /** The screen changed (the shells hide their file buttons while a session runs). */
  onScreen?(screen: Screen): void;
  /** What the library shows while there is no deck: the shell's own "open a folder" content. */
  readonly emptyLibrary?: HTMLElement;
  /** Where the keys are listened for (default: the container's window). */
  readonly keyTarget?: EventTarget;
  /** Cmd (macOS) or Ctrl as the Mod key (default: navigator detection). */
  readonly isMac?: boolean;
  /** The clock (tests). */
  readonly now?: () => number;
}

export interface AppHandle {
  /** Replace every deck (a folder opened or scanned again). Order is the library's order. */
  setDecks(decks: readonly DeckInput[]): void;
  /** One deck's text changed on disk, or a deck was added. */
  upsertDeck(deck: DeckInput): void;
  removeDeck(id: string): void;
  setSettings(settings: Settings): void;
  readonly screen: Screen;
  /** Start a session over every deck (the shells' "Study" menu command). */
  studyAll(): void;
  /** Start a session over these decks (a deck's or a folder's "Study" command). Unknown ids are ignored. */
  study(deckIds: readonly string[]): void;
  /** Give the keyboard to the study UI (a shell whose view just became active). */
  focus(): void;
  /** Back to the library (ends a session). */
  showLibrary(): void;
  /** Undo the last rating of the session (the shells' Edit > Undo); nothing outside a session. */
  undo(): void;
  destroy(): void;
}
