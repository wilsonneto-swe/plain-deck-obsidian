/**
 * Plain Deck as an Obsidian plugin: the third shell around @plaindeck/core, and the one meant for daily
 * use, on the computer and on the phone. Every `*.cards.md` note of the vault is a deck (DECK-FILES in
 * decks.ts); the Plain Deck view (view.ts) is the core's study UI; each rating is written into its note
 * through the vault (VAULT-CAS), so Obsidian Sync carries the progress to the other devices with the notes.
 *
 * - Ribbon icon and commands: open the decks, study all decks, study the current note's deck; a deck's file
 *   menu: study this deck; a folder's: study the decks in it.
 * - VAULT-EVENTS: the vault's create / modify / delete / rename events keep the decks current in every open
 *   view (an edit in the editor, a review that came in through Obsidian Sync), registered once the layout is
 *   ready so the startup does not replay the whole vault.
 * - The status bar (desktop) says how many cards are waiting; a click opens the decks.
 */
import '@plaindeck/core/app.css';
import './styles.css';
import { Notice, Platform, Plugin, TFile, TFolder, normalizePath, type App, type Menu, type TAbstractFile } from 'obsidian';
import { SAMPLE_DECK, SAMPLE_DECK_NAME, type AppHandle, type CardRef, type CardState, type SaveOutcome, type Settings } from '@plaindeck/core';
import { DEFAULT_DATA, normalizeFolder, parseData, type PluginData } from './data.js';
import { DeckIndex, type VaultLike } from './decks.js';
import { PlainDeckSettingTab } from './settings-tab.js';
import { PlainDeckView, ICON, VIEW_TYPE } from './view.js';

/** Obsidian's Vault by path (decks.ts is written against this slice, so it runs in tests without Obsidian). */
function vaultOf(app: App): VaultLike {
  const file = (path: string): TFile => {
    const f = app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) throw new Error(`${path} is not in the vault`);
    return f;
  };
  return {
    markdownPaths: () => app.vault.getMarkdownFiles().map((f) => f.path),
    cachedRead: (path) => app.vault.cachedRead(file(path)),
    read: (path) => app.vault.read(file(path)),
    process: (path, fn) => app.vault.process(file(path), fn),
  };
}

/** The status bar is recounted this often (cards come due with the clock). */
const STATUS_REFRESH_MS = 60_000;

export default class PlainDeckPlugin extends Plugin {
  data: PluginData = DEFAULT_DATA;
  readonly decks = new DeckIndex(vaultOf(this.app), () => this.data.folder);
  private statusEl: HTMLElement | null = null;

  override async onload(): Promise<void> {
    this.data = parseData(await this.loadData());
    this.registerView(VIEW_TYPE, (leaf) => new PlainDeckView(leaf, this));
    this.addRibbonIcon(ICON, 'Plain Deck', () => void this.openView());
    this.addCommand({ id: 'open', name: 'Open the decks', callback: () => void this.openView() });
    this.addCommand({ id: 'study-all', name: 'Study all decks', callback: () => void this.openView((h) => h.studyAll()) });
    this.addCommand({
      id: 'study-current',
      name: 'Study the current deck',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file === null || !this.decks.has(file.path)) return false;
        if (!checking) void this.openView((h) => h.study([file.path]));
        return true;
      },
    });
    this.addSettingTab(new PlainDeckSettingTab(this.app, this));
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => this.fileMenu(menu, file)));
    // the keys go to the study UI whenever its tab becomes the active one
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (leaf?.view instanceof PlainDeckView) leaf.view.handle?.focus();
      }),
    );
    if (!Platform.isMobile) {
      const status = this.addStatusBarItem();
      status.addClass('mod-clickable');
      status.setAttr('aria-label', 'Open Plain Deck');
      status.addEventListener('click', () => void this.openView());
      this.statusEl = status;
    }
    this.app.workspace.onLayoutReady(() => void this.start());
  }

  private async start(): Promise<void> {
    await this.decks.load();
    this.broadcastDecks();
    this.registerEvent(this.app.vault.on('create', (file) => void this.changed(file)));
    this.registerEvent(this.app.vault.on('modify', (file) => void this.changed(file)));
    this.registerEvent(this.app.vault.on('delete', (file) => void this.deleted(file)));
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFolder) void this.reload();
        else {
          this.dropDeck(oldPath);
          void this.changed(file);
        }
      }),
    );
    this.registerInterval(window.setInterval(() => this.updateStatus(), STATUS_REFRESH_MS));
  }

  // ------------------------------------------------------------- the views

  views(): PlainDeckView[] {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE)
      .map((leaf) => leaf.view)
      .filter((view): view is PlainDeckView => view instanceof PlainDeckView);
  }

  /** Open the decks (the existing tab, else a new one) and hand its study UI to `then`. */
  async openView(then?: (handle: AppHandle) => void): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (leaf === undefined) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof PlainDeckView && view.handle !== null) {
      then?.(view.handle);
      view.handle.focus();
    }
  }

  private broadcastDecks(): void {
    const decks = this.decks.inputs();
    for (const view of this.views()) view.handle?.setDecks(decks);
    this.updateStatus();
  }

  private async reload(): Promise<void> {
    await this.decks.load();
    this.broadcastDecks();
  }

  // ------------------------------------------------------------- VAULT-EVENTS

  private async changed(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile)) return;
    const had = this.decks.has(file.path);
    if (!(await this.decks.refresh(file.path))) {
      if (had && !this.decks.has(file.path)) this.dropDeck(file.path);
      return;
    }
    const deck = this.decks.input(file.path);
    if (deck !== undefined) for (const view of this.views()) view.handle?.upsertDeck(deck);
    this.updateStatus();
  }

  private async deleted(file: TAbstractFile): Promise<void> {
    if (file instanceof TFolder) await this.reload();
    else this.dropDeck(file.path);
  }

  private dropDeck(path: string): void {
    if (!this.decks.remove(path)) return;
    for (const view of this.views()) view.handle?.removeDeck(path);
    this.updateStatus();
  }

  /**
   * A rating's write (a view's setCardState): VAULT-CAS through the index; then the status bar and the other
   * open views follow at once (the vault's modify event may come before the write resolves, or after it).
   */
  async writeCard(from: PlainDeckView, deckId: string, ref: CardRef, prev: CardState | null, next: CardState | null): Promise<SaveOutcome> {
    const outcome = await this.decks.setCardState(deckId, ref, prev, next);
    const deck = this.decks.input(deckId);
    if (outcome.kind !== 'failed' && deck !== undefined) for (const view of this.views()) if (view !== from) view.handle?.upsertDeck(deck);
    this.updateStatus();
    return outcome;
  }

  // ------------------------------------------------------------- settings, files, menus

  /** A study setting changed (the settings tab, or a view's Settings panel: `from`). */
  async saveStudySettings(settings: Settings, from?: PlainDeckView): Promise<void> {
    this.data = { ...this.data, settings };
    await this.saveData(this.data);
    for (const view of this.views()) if (view !== from) view.handle?.setSettings(settings);
    this.updateStatus();
  }

  async setFolder(folder: string): Promise<void> {
    const next = normalizeFolder(folder);
    if (next === this.data.folder) return;
    this.data = { ...this.data, folder: next };
    await this.saveData(this.data);
    await this.reload();
  }

  /** "Open file" in a session: the deck's note in a new tab, at the card's heading. */
  openDeckAt(path: string, line: number): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) void this.app.workspace.getLeaf('tab').openFile(file, { eState: { line } });
  }

  /** The empty library's button: the example deck, in the deck folder. The vault's create event lists it. */
  async addExampleDeck(): Promise<void> {
    const folder = this.data.folder;
    const path = normalizePath(folder === '' ? SAMPLE_DECK_NAME : `${folder}/${SAMPLE_DECK_NAME}`);
    if (this.app.vault.getAbstractFileByPath(path) !== null) {
      new Notice(`${path} is already in the vault.`);
      return;
    }
    try {
      if (folder !== '' && this.app.vault.getAbstractFileByPath(folder) === null) await this.app.vault.createFolder(folder);
      await this.app.vault.create(path, SAMPLE_DECK);
    } catch (err) {
      new Notice(`Could not create ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private fileMenu(menu: Menu, file: TAbstractFile): void {
    if (file instanceof TFile && this.decks.has(file.path)) {
      menu.addItem((item) =>
        item
          .setTitle('Study this deck')
          .setIcon(ICON)
          .onClick(() => void this.openView((h) => h.study([file.path]))),
      );
    } else if (file instanceof TFolder) {
      const prefix = file.isRoot() ? '' : `${file.path}/`;
      const inside = this.decks.paths().filter((p) => p.startsWith(prefix));
      if (inside.length === 0) return;
      menu.addItem((item) =>
        item
          .setTitle(inside.length === 1 ? 'Study the deck in this folder' : `Study the ${inside.length} decks in this folder`)
          .setIcon(ICON)
          .onClick(() => void this.openView((h) => h.study(inside))),
      );
    }
  }

  updateStatus(): void {
    const el = this.statusEl;
    if (el === null) return;
    const hasDecks = this.decks.paths().length > 0;
    el.toggle(hasDecks);
    if (!hasDecks) return;
    const { due, fresh } = this.decks.waiting(Date.now(), this.data.settings);
    el.setText(due + fresh === 0 ? 'Cards: all done' : `Cards: ${due} due · ${fresh} new`);
  }
}
