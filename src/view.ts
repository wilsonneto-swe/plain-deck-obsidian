/**
 * The study view: an Obsidian ItemView (a tab, on desktop and on phones) holding the core's study UI
 * (mountApp). The plugin hands it the decks; the view wires the UI to the vault: ratings go through the
 * plugin's DeckIndex (VAULT-CAS), card Markdown through Obsidian's renderer, "Open file" opens the deck's
 * note at the card, and the keys are listened for on the view's own element, so they act only while the
 * view has the focus.
 */
import { ItemView, Platform, type WorkspaceLeaf } from 'obsidian';
import { mountApp, type AppHandle } from '@plaindeck/core';
import type PlainDeckPlugin from './main.js';
import { ObsidianRenderer } from './render.js';

export const VIEW_TYPE = 'plain-deck-study';
/** A Lucide icon name, shipped with Obsidian. */
export const ICON = 'layers';

export class PlainDeckView extends ItemView {
  handle: AppHandle | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: PlainDeckPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Plain Deck';
  }

  override getIcon(): string {
    return ICON;
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('fc-obsidian');
    const renderer = new ObsidianRenderer(this.app, this);
    this.handle = mountApp(this.contentEl, {
      // the elements come from Obsidian's createEl, as its plugin guidelines ask
      createElement: (tag) => createEl(tag),
      settings: this.plugin.data.settings,
      isMac: Platform.isMacOS || Platform.isIosApp,
      keyTarget: this.containerEl,
      emptyLibrary: this.emptyLibrary(),
      setCardState: (deckId, ref, from, to) => this.plugin.writeCard(this, deckId, ref, from, to),
      onSettingsChange: (settings) => void this.plugin.saveStudySettings(settings, this),
      onOpenSource: (deckId, line) => this.plugin.openDeckAt(deckId, line),
      renderMarkdown: (markdown, el, context) => renderer.render(markdown, el, context),
    });
    this.handle.setDecks(this.plugin.decks.inputs());
    // ESC-IN-VIEW: Obsidian marks every Esc as handled (preventDefault) before the page sees it, so the study
    // UI's own Esc never fires here; inside this view, Esc still goes back to the decks.
    this.registerDomEvent(
      this.containerEl,
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || this.handle === null || this.handle.screen === 'library') return;
        this.handle.showLibrary();
      },
      { capture: true },
    );
  }

  override async onClose(): Promise<void> {
    this.handle?.destroy();
    this.handle = null;
  }

  /** What an empty library shows: what a deck is, and a way to start. */
  private emptyLibrary(): HTMLElement {
    const box = createDiv({ cls: 'fc-obsidian-empty' });
    box.createEl('h2', { text: 'No decks in this vault yet' });
    box.createEl('p', {
      text: 'A deck is a note whose name ends in .cards.md: every ## heading in it is a card, and the lines under the heading are the answer. Your progress is written into the note, one hidden line per card, so it syncs with the vault.',
    });
    const folder = this.plugin.data.folder;
    if (folder !== '') box.createEl('p', { text: `Only notes in the folder "${folder}" are decks (see the plugin's settings).` });
    const add = box.createEl('button', { text: 'Add the example deck', cls: 'mod-cta' });
    add.addEventListener('click', () => void this.plugin.addExampleDeck());
    return box;
  }
}
