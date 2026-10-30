/**
 * The study UI every shell mounts: `mountApp(container, options)` (contract in ./types.ts, styles in
 * ./app.css under `.fc-root`). Three screens:
 *
 *  - LIBRARY: every deck with its counts (new / learning / review), Study all, per-deck Study, Settings.
 *  - STUDY: one card at a time. The front (and the prompt above a `?` line), Show answer, then the back
 *    and the four ratings, each labelled with the interval it gives. Keys: Space / Enter shows the
 *    answer, then Space / Enter is Good and 1-4 rate; Mod+Z undoes the last rating; Esc goes back.
 *  - DONE: what was studied and when the next card comes due; a session that still has learning cards
 *    resumes by itself when the next one is due.
 *
 * WRITE-ON-RATE: every rating is written at once, one state line, through `options.setCardState`
 * (compare-and-set, F9). The rating's state is computed from the card's state AS THE FILE HOLDS IT; when
 * the file holds another state by the time it is written (a review on another device came in through a
 * sync), the outcome is `changed` and the rating is computed again from that state, once (CAS-RETRY).
 * While a write is in flight the ratings are disabled, so a card is never rated twice.
 *
 * PAINT-ONCE: a card's Markdown is rendered when the card is shown (or edited in its file), never again for
 * a reveal or a rating, each part into a fresh holder element: a shell's own renderer (options.renderMarkdown,
 * maybe asynchronous) can never paint a previous card over the current one.
 */
import { parseDeck } from '../format/parse.js';
import { sameState } from '../format/state.js';
import type { Card, CardState, Deck } from '../format/types.js';
import { createScheduler, RATINGS, type Rating, type Scheduler } from '../schedule/scheduler.js';
import { LEARN_AHEAD_MS, countDeck, isDue, type DeckCounts } from '../study/due.js';
import { StudySession, type Bucket, type StudyItem } from '../study/session.js';
import { DEFAULT_SETTINGS, LIMITS, formatSteps, parseSteps, schedulerOptionsOf, type Settings } from '../study/settings.js';
import { formatInterval } from '../study/time.js';
import { inlineText, renderInline, renderMarkdown } from './markdown-dom.js';
import type { AppHandle, AppOptions, CardPart, DeckInput, SaveOutcome, Screen } from './types.js';

const RATING_NAMES: Readonly<Record<Rating, string>> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
const RATING_CLASS: Readonly<Record<Rating, string>> = { 1: 'fc-again', 2: 'fc-hard', 3: 'fc-good', 4: 'fc-easy' };
const BUCKET_NAMES: Readonly<Record<Bucket, string>> = { new: 'New', learning: 'Learning', review: 'Review' };
const MESSAGE_MS = 6000;
/** The library's counts move with the clock (cards come due): it re-counts this often while shown. */
const LIBRARY_REFRESH_MS = 60_000;

interface Entry {
  readonly input: DeckInput;
  readonly deck: Deck;
}

interface Shown {
  readonly item: StudyItem;
  card: Card;
  revealed: boolean;
  /** When the answer was shown: the review's time, and the time the button labels were computed for. */
  at: number;
  preview: Readonly<Record<Rating, CardState>> | null;
}

const sameRef = (card: Card, item: StudyItem): boolean => card.ref.front === item.ref.front && card.ref.occurrence === item.ref.occurrence;

function detectMac(win: Window | null): boolean {
  const nav = win?.navigator as (Navigator & { userAgentData?: { platform?: string } }) | undefined;
  const platform = nav?.userAgentData?.platform ?? nav?.userAgent ?? '';
  return /mac|iphone|ipad/i.test(platform);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function mountApp(container: HTMLElement, options: AppOptions): AppHandle {
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  /** Timers run on the container's own window (an Obsidian popout window has its own). */
  const clock: Window = win ?? window;
  const now = options.now ?? (() => Date.now());
  const isMac = options.isMac ?? detectMac(win);
  let settings: Settings = options.settings ?? DEFAULT_SETTINGS;
  let scheduler: Scheduler = createScheduler(schedulerOptionsOf(settings));
  const decks = new Map<string, Entry>();

  let screen: Screen = 'library';
  let session: StudySession | null = null;
  /** The decks of the running session (null: all of them). */
  let scope: readonly string[] | null = null;
  let shown: Shown | null = null;
  let busy = false;
  let destroyed = false;
  let messageTimer: number | null = null;
  let resumeTimer: number | null = null;

  const make = options.createElement;
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = make(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className: string, text: string, onClick: () => void): HTMLButtonElement => {
    const b = h('button', className, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };

  // ------------------------------------------------------------- skeleton

  const root = h('div', 'fc-root');
  root.tabIndex = -1;
  const lib = h('section', 'fc-library');
  const studyEl = h('section', 'fc-study');
  const doneEl = h('section', 'fc-done');
  root.append(lib, studyEl, doneEl);
  container.append(root);

  // library
  const libHead = h('header', 'fc-lib-head');
  const libTitle = h('div', 'fc-lib-title');
  const libH = h('h1', undefined, 'Decks');
  const libSummary = h('p', 'fc-lib-summary');
  libTitle.append(libH, libSummary);
  const libCounts = h('div', 'fc-counts fc-counts-big');
  const studyAllBtn = button('fc-primary', 'Study all', () => startStudy(null));
  const settingsBtn = button('fc-plain', 'Settings', () => toggleSettings());
  settingsBtn.setAttribute('aria-expanded', 'false');
  libHead.append(libTitle, libCounts, studyAllBtn, settingsBtn);
  const settingsEl = h('form', 'fc-settings');
  settingsEl.hidden = true;
  settingsEl.noValidate = true;
  const deckList = h('ul', 'fc-decks');
  const emptyEl = h('div', 'fc-empty');
  if (options.emptyLibrary !== undefined) emptyEl.append(options.emptyLibrary);
  else emptyEl.append(h('p', undefined, 'No decks yet.'));
  lib.append(libHead, settingsEl, deckList, emptyEl);

  // study
  const studyHead = h('header', 'fc-study-head');
  const backBtn = button('fc-plain fc-back', '← Decks', () => showLibrary());
  backBtn.title = 'Back to the decks (Esc)';
  const deckLabel = h('span', 'fc-deck-label');
  const sessionCounts = h('span', 'fc-counts');
  const spacer = h('span', 'fc-spacer');
  const undoBtn = button('fc-plain', 'Undo', () => void undo());
  undoBtn.title = `Undo the last rating (${isMac ? '⌘' : 'Ctrl+'}Z)`;
  const openBtn = button('fc-plain', 'Open file', () => {
    if (shown !== null) options.onOpenSource?.(shown.item.deck, shown.card.line);
  });
  openBtn.title = 'Open this deck in your Markdown app';
  openBtn.hidden = options.onOpenSource === undefined;
  studyHead.append(backBtn, deckLabel, spacer, sessionCounts, undoBtn, openBtn);
  const scroll = h('div', 'fc-scroll');
  const cardEl = h('article', 'fc-card');
  const frontEl = h('h2', 'fc-front');
  const promptEl = h('div', 'fc-md fc-prompt');
  const divider = h('hr', 'fc-divider');
  const backEl = h('div', 'fc-md fc-answer-text');
  cardEl.append(frontEl, promptEl, divider, backEl);
  scroll.append(cardEl);
  const answerBar = h('footer', 'fc-bar');
  const showBtn = button('fc-primary fc-show', 'Show answer', () => reveal());
  const ratingsEl = h('div', 'fc-ratings');
  const ratingBtns = new Map<Rating, { btn: HTMLButtonElement; ivl: HTMLSpanElement }>();
  for (const g of RATINGS) {
    const btn = button(`fc-rate ${RATING_CLASS[g]}`, '', () => void rate(g));
    const ivl = h('span', 'fc-ivl');
    const name = h('span', 'fc-rate-name', RATING_NAMES[g]);
    const key = h('kbd', undefined, String(g));
    btn.append(ivl, name, key);
    btn.dataset['rating'] = String(g);
    ratingsEl.append(btn);
    ratingBtns.set(g, { btn, ivl });
  }
  answerBar.append(showBtn, ratingsEl);
  const messageEl = h('div', 'fc-message');
  messageEl.setAttribute('aria-live', 'polite');
  studyEl.append(studyHead, scroll, answerBar, messageEl);

  // done
  const doneTitle = h('h2', undefined, 'All done for now');
  const doneText = h('p', 'fc-done-text');
  const doneNext = h('p', 'fc-done-next');
  const doneRow = h('div', 'fc-done-row');
  const doneBack = button('fc-primary', 'Back to decks', () => showLibrary());
  const doneUndo = button('fc-plain', 'Undo last rating', () => void undo());
  doneRow.append(doneBack, doneUndo);
  const doneMessage = h('p', 'fc-message');
  doneMessage.setAttribute('aria-live', 'polite');
  doneEl.append(doneTitle, doneText, doneNext, doneRow, doneMessage);

  // Buttons keep the keyboard with the page: a click must not leave the focus on a button, where
  // Space would press it again instead of reaching the study keys. A click anywhere else that cannot take
  // the focus itself gives it to the root, so the keys work in a shell that listens on its own element.
  root.addEventListener('mousedown', (e) => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('button') !== null) {
      if (screen !== 'library') e.preventDefault();
    } else if (e.target.closest('a, input, textarea, select, label, [contenteditable]') === null) {
      root.focus({ preventScroll: true });
    }
  });
  // A tap or a click on the card shows the answer (phones: the whole card is the target).
  scroll.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a') !== null) return;
    if (shown !== null && !shown.revealed) reveal();
  });

  // ------------------------------------------------------------- helpers

  function setScreen(next: Screen): void {
    screen = next;
    lib.hidden = next !== 'library';
    studyEl.hidden = next !== 'study';
    doneEl.hidden = next !== 'done';
    root.dataset['screen'] = next;
    if (next !== 'done' && resumeTimer !== null) {
      clock.clearTimeout(resumeTimer);
      resumeTimer = null;
    }
    options.onScreen?.(next);
  }

  function say(text: string): void {
    const target = screen === 'done' ? doneMessage : messageEl;
    target.textContent = text;
    if (messageTimer !== null) clock.clearTimeout(messageTimer);
    messageTimer = clock.setTimeout(() => {
      target.textContent = '';
      messageTimer = null;
    }, MESSAGE_MS);
  }

  function dueOptions(): { dayStartHour: number; newPerSession: number; learnAheadMs: number } {
    return { dayStartHour: settings.dayStartHour, newPerSession: settings.newPerSession, learnAheadMs: LEARN_AHEAD_MS };
  }

  function countsInto(target: HTMLElement, c: Readonly<Record<Bucket, number>>, current?: Bucket): void {
    target.replaceChildren();
    for (const bucket of ['new', 'learning', 'review'] as const) {
      const span = h('span', `fc-count fc-count-${bucket}${bucket === current ? ' fc-current' : ''}`, String(c[bucket]));
      span.title = BUCKET_NAMES[bucket];
      target.append(span);
    }
  }

  function entry(id: string): Entry | undefined {
    return decks.get(id);
  }

  function upsert(input: DeckInput): void {
    decks.set(input.id, { input, deck: parseDeck(input.text, { name: input.fileName ?? input.name }) });
  }

  // ------------------------------------------------------------- library

  function renderLibrary(): void {
    const t = now();
    const opts = dueOptions();
    const rows: Array<{ id: string; e: Entry; c: DeckCounts }> = [];
    for (const [id, e] of decks) rows.push({ id, e, c: countDeck(e.deck, t, opts) });
    const total = { new: 0, learning: 0, review: 0 };
    let cards = 0;
    for (const { c } of rows) {
      total.new += c.new;
      total.learning += c.learning;
      total.review += c.review;
      cards += c.total;
    }
    const empty = rows.length === 0;
    emptyEl.hidden = !empty;
    deckList.hidden = empty;
    libCounts.hidden = empty;
    studyAllBtn.hidden = empty;
    libSummary.textContent = empty ? '' : `${plural(rows.length, 'deck')} · ${plural(cards, 'card')}`;
    countsInto(libCounts, total);
    const waiting = total.new + total.learning + total.review;
    studyAllBtn.disabled = waiting === 0;
    studyAllBtn.textContent = waiting === 0 ? 'Nothing due' : `Study all (${waiting})`;

    deckList.replaceChildren(
      ...rows.map(({ id, e, c }) => {
        const li = h('li', 'fc-deck');
        const names = h('div', 'fc-deck-names');
        const title = h('span', 'fc-deck-title');
        renderInline(e.deck.title, title, make);
        const where = h('span', 'fc-deck-path', e.input.name);
        names.append(title, where);
        const notes: string[] = [];
        if (e.input.note !== undefined && e.input.note !== '') notes.push(e.input.note);
        if (c.problems > 0) notes.push(`${plural(c.problems, 'card')} cannot be studied`);
        if (c.total === 0) notes.push('No cards: every ## heading is a card');
        if (notes.length > 0) {
          const note = h('span', 'fc-deck-note', notes.join(' · '));
          const problems = e.deck.cards.filter((card) => card.problem !== null).map((card) => `${card.front || '(empty heading)'}: ${card.problem ?? ''}`);
          if (problems.length > 0) note.title = problems.join('\n');
          names.append(note);
        }
        const counts = h('div', 'fc-counts');
        countsInto(counts, c);
        if (c.newTotal > c.new) counts.title = `${c.newTotal} new cards in all; a session takes ${c.new}`;
        const n = c.new + c.learning + c.review;
        const study = button('fc-study-btn', n === 0 ? 'Done' : 'Study', () => startStudy([id]));
        study.disabled = n === 0;
        if (n === 0 && c.nextDue !== null) study.title = `Next card in ${formatInterval(c.nextDue - t)}`;
        li.append(names, counts, study);
        return li;
      }),
    );
  }

  // ------------------------------------------------------------- settings

  function toggleSettings(): void {
    settingsEl.hidden = !settingsEl.hidden;
    settingsBtn.setAttribute('aria-expanded', String(!settingsEl.hidden));
    if (!settingsEl.hidden) renderSettings();
  }

  function renderSettings(): void {
    const field = (label: string, help: string, input: HTMLInputElement, read: (value: string) => Partial<Settings> | null): HTMLElement => {
      const wrap = h('label', 'fc-field');
      const name = h('span', 'fc-field-name', label);
      const hint = h('span', 'fc-field-help', help);
      input.addEventListener('change', () => {
        const patch = read(input.value);
        input.classList.toggle('fc-invalid', patch === null);
        if (patch === null) return;
        settings = { ...settings, ...patch };
        scheduler = createScheduler(schedulerOptionsOf(settings));
        options.onSettingsChange?.(settings);
        renderLibrary();
      });
      wrap.append(name, input, hint);
      return wrap;
    };
    const number = (value: number, min: number, max: number, step = 1): HTMLInputElement => {
      const input = h('input');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      return input;
    };
    const text = (value: string, placeholder: string): HTMLInputElement => {
      const input = h('input');
      input.type = 'text';
      input.value = value;
      input.placeholder = placeholder;
      input.spellcheck = false;
      return input;
    };
    const int = (v: string, [lo, hi]: readonly [number, number]): number | null => {
      const n = Number(v);
      return v.trim() !== '' && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
    };
    const retention = int(String(Math.round(settings.retention * 100)), [70, 99]) ?? 90;
    settingsEl.replaceChildren(
      field('Desired retention (%)', 'How likely you still know a card when it comes due. Higher means more reviews.', number(retention, 70, 99), (v) => {
        const n = int(v, [70, 99]);
        return n === null ? null : { retention: n / 100 };
      }),
      field('New cards per deck', 'How many new cards each deck adds to a session.', number(settings.newPerSession, 0, LIMITS.newPerSession[1]), (v) => {
        const n = int(v, LIMITS.newPerSession);
        return n === null ? null : { newPerSession: n };
      }),
      field('Maximum interval (days)', 'No card is scheduled further away than this.', number(settings.maximumIntervalDays, 1, LIMITS.maximumIntervalDays[1]), (v) => {
        const n = int(v, LIMITS.maximumIntervalDays);
        return n === null ? null : { maximumIntervalDays: n };
      }),
      field('Learning steps', 'The steps of a new card before it graduates: m, h or d, e.g. "1m 10m".', text(formatSteps(settings.learningSteps), '1m 10m'), (v) => {
        const steps = parseSteps(v);
        return steps === null ? null : { learningSteps: steps };
      }),
      field('Relearning steps', 'The steps of a card you forgot, e.g. "10m". Empty: straight back to review.', text(formatSteps(settings.relearningSteps), '10m'), (v) => {
        const steps = parseSteps(v);
        return steps === null ? null : { relearningSteps: steps };
      }),
      field('Next day starts at (hour)', 'Reviews due tomorrow show up from this hour on (0-23).', number(settings.dayStartHour, 0, 23), (v) => {
        const n = int(v, LIMITS.dayStartHour);
        return n === null ? null : { dayStartHour: n };
      }),
    );
  }

  // ------------------------------------------------------------- study

  function startStudy(ids: readonly string[] | null): void {
    const t = now();
    const chosen = ids === null ? [...decks.keys()] : ids.filter((id) => decks.has(id));
    session = StudySession.plan(
      chosen.flatMap((id) => {
        const e = entry(id);
        return e === undefined ? [] : [{ id, deck: e.deck }];
      }),
      t,
      dueOptions(),
    );
    scope = ids === null ? null : chosen;
    setScreen('study');
    root.focus({ preventScroll: true });
    advance();
  }

  /** The card an item names, as its deck holds it now, if it is still to be studied (RESOLVE-ON-SHOW). */
  function resolve(item: StudyItem, t: number): Card | null {
    const card = entry(item.deck)?.deck.cards.find((c) => sameRef(c, item));
    if (card === undefined || card.problem !== null) return null;
    if (card.state === null) return card;
    return isDue(card.state, t, dueOptions()) ? card : null;
  }

  function advance(): void {
    if (session === null) return;
    shown = null;
    for (;;) {
      const t = now();
      const item = session.current(t);
      if (item === null) {
        showDone();
        return;
      }
      const card = resolve(item, t);
      if (card === null) {
        session.drop(item);
        continue;
      }
      show(item, card);
      return;
    }
  }

  function show(item: StudyItem, card: Card): void {
    if (screen !== 'study') setScreen('study');
    shown = { item, card, revealed: false, at: 0, preview: null };
    paintCard();
    renderCard();
  }

  /** PAINT-ONCE: one part of a card into a fresh holder, with the shell's renderer when it has one. */
  function paint(markdown: string, el: HTMLElement, part: CardPart, deckId: string): void {
    const holder = h('div', options.renderMarkdown === undefined ? 'fc-md-body fc-md-core' : 'fc-md-body');
    el.replaceChildren(holder);
    const plain = (err: unknown): void => {
      console.error(err);
      holder.textContent = markdown;
    };
    if (options.renderMarkdown === undefined) {
      if (part === 'front') renderInline(markdown, holder, make);
      else renderMarkdown(markdown, holder, make);
      return;
    }
    try {
      const done = options.renderMarkdown(markdown, holder, { deckId, part });
      if (done instanceof Promise) done.catch(plain);
    } catch (err) {
      plain(err);
    }
  }

  function paintCard(): void {
    if (shown === null) return;
    const { item, card } = shown;
    paint(card.front, frontEl, 'front', item.deck);
    paint(card.prompt, promptEl, 'prompt', item.deck);
    promptEl.hidden = card.prompt === '';
    paint(card.back, backEl, 'back', item.deck);
    scroll.scrollTop = 0;
  }

  /** The study screen's state: counts, the answer's visibility, the buttons. Never renders Markdown. */
  function renderCard(): void {
    if (shown === null || session === null) return;
    const { item } = shown;
    const deck = entry(item.deck)?.deck;
    deckLabel.textContent = deck === undefined ? '' : inlineText(deck.title);
    countsInto(sessionCounts, session.counts(), item.bucket);
    const revealed = shown.revealed;
    backEl.hidden = !revealed;
    divider.hidden = !revealed;
    showBtn.hidden = revealed;
    ratingsEl.hidden = !revealed;
    cardEl.classList.toggle('fc-revealed', revealed);
    undoBtn.disabled = !session.canUndo || busy;
    for (const { btn } of ratingBtns.values()) btn.disabled = busy;
  }

  function reveal(): void {
    if (shown === null || shown.revealed) return;
    shown.revealed = true;
    shown.at = now();
    shown.preview = scheduler.preview(shown.card.state, shown.at);
    for (const g of RATINGS) {
      const r = ratingBtns.get(g);
      if (r !== undefined) r.ivl.textContent = formatInterval(shown.preview[g].due - Math.floor(shown.at / 1000) * 1000);
    }
    renderCard();
  }

  async function write(item: StudyItem, from: CardState | null, to: CardState | null): Promise<SaveOutcome> {
    let outcome: SaveOutcome;
    try {
      outcome = await options.setCardState(item.deck, item.ref, from, to);
    } catch (err) {
      outcome = { kind: 'failed', message: err instanceof Error ? err.message : String(err) };
    }
    if (outcome.kind !== 'failed') {
      const e = entry(item.deck);
      if (e !== undefined && e.input.text !== outcome.text) upsert({ ...e.input, text: outcome.text });
    }
    return outcome;
  }

  async function rate(g: Rating): Promise<void> {
    if (busy || shown === null || !shown.revealed || shown.preview === null || session === null) return;
    const current = shown;
    const s = session;
    busy = true;
    renderCard();
    try {
      let from = current.card.state;
      let next = current.preview?.[g] ?? scheduler.next(from, current.at, g);
      let outcome = await write(current.item, from, next);
      if (outcome.kind === 'changed') {
        // CAS-RETRY: another device (or an edit) changed this card's state since it was shown
        const fresh = resolve(current.item, current.at);
        if (fresh !== null && !sameState(fresh.state, from)) {
          from = fresh.state;
          next = scheduler.next(from, current.at, g);
          outcome = await write(current.item, from, next);
        }
      }
      if (destroyed || session !== s) return;
      switch (outcome.kind) {
        case 'saved':
          s.answer(current.item, next, current.at, from);
          busy = false;
          advance();
          return;
        case 'failed':
          say(`Not saved: ${outcome.message}. Rate the card again to retry.`);
          return;
        case 'invalid':
          say('Skipped: the review state of this card cannot be read any more.');
          break;
        case 'missing':
          say('Skipped: this card changed in its file (its heading was edited or removed).');
          break;
        case 'changed':
          say('Skipped: this card was already reviewed elsewhere.');
          break;
      }
      s.drop(current.item);
      busy = false;
      advance();
    } finally {
      busy = false;
      if (screen === 'study') renderCard();
    }
  }

  /** Undo the last rating: its card's previous state goes back into the file (compare-and-set too). */
  async function undo(): Promise<void> {
    const s = session;
    const last = s?.lastAnswered() ?? null;
    if (busy || s === null || last === null) return;
    busy = true;
    if (screen === 'study') renderCard();
    try {
      const outcome = await write(last.item, last.next, last.prev);
      if (destroyed || session !== s) return;
      if (outcome.kind === 'failed') {
        say(`Could not undo: ${outcome.message}`);
        return;
      }
      if (outcome.kind !== 'saved') {
        s.forgetLast();
        say('Could not undo: that card changed in its file since.');
        if (screen === 'done') showDone();
        return;
      }
      s.undo();
      busy = false;
      const card = entry(last.item.deck)?.deck.cards.find((c) => sameRef(c, last.item));
      if (card !== undefined && card.problem === null) show(last.item, card);
      else advance();
    } finally {
      busy = false;
      if (screen === 'study') renderCard();
    }
  }

  function showDone(): void {
    if (session === null) return;
    setScreen('done');
    if (resumeTimer !== null) clock.clearTimeout(resumeTimer);
    resumeTimer = null;
    doneUndo.hidden = !session.canUndo;
    const studied = session.answered;
    doneTitle.textContent = studied === 0 ? 'Nothing to study right now' : 'All done for now';
    doneText.textContent = studied === 0 ? '' : `You studied ${plural(studied, 'card')}.`;
    const t = now();
    const learningDue = session.nextLearningDue();
    if (learningDue !== null) {
      const left = session.counts().learning;
      doneNext.textContent = `${plural(left, 'card')} still ${left === 1 ? 'is' : 'are'} learning: the next comes back in ${formatInterval(learningDue - t)}. Stay here and it shows up by itself.`;
      // resume when it enters the learn-ahead window
      resumeTimer = clock.setTimeout(() => {
        resumeTimer = null;
        if (screen === 'done' && session !== null) {
          setScreen('study');
          advance();
        }
      }, Math.max(1000, learningDue - LEARN_AHEAD_MS - t));
      return;
    }
    let next: number | null = null;
    for (const [id, e] of decks) {
      if (scope !== null && !scope.includes(id)) continue;
      const c = countDeck(e.deck, t, dueOptions());
      if (c.nextDue !== null && (next === null || c.nextDue < next)) next = c.nextDue;
    }
    doneNext.textContent = next === null ? '' : `The next card is due in ${formatInterval(next - t)}.`;
  }

  function showLibrary(): void {
    session = null;
    shown = null;
    scope = null;
    setScreen('library');
    renderLibrary();
  }

  // ------------------------------------------------------------- keys

  const isEditable = (t: EventTarget | null): boolean =>
    t instanceof Element && (t.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]') !== null);

  function onKey(event: Event): void {
    const e = event as KeyboardEvent;
    if (e.defaultPrevented || destroyed || isEditable(e.target)) return;
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (screen === 'study') {
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        showLibrary();
        return;
      }
      if (shown === null) return;
      // a focused button takes its own Space / Enter (keyboard users who tabbed to it)
      if ((e.key === ' ' || e.key === 'Enter') && e.target instanceof HTMLButtonElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!shown.revealed) reveal();
        else void rate(3);
        return;
      }
      if (shown.revealed && e.key.length === 1 && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        void rate(Number(e.key) as Rating);
      }
      return;
    }
    if (screen === 'done') {
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void undo();
      } else if (e.key === 'Escape' || (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement))) {
        e.preventDefault();
        showLibrary();
      }
    }
  }

  const keyTarget: EventTarget = options.keyTarget ?? win ?? root;
  keyTarget.addEventListener('keydown', onKey);
  const refresh = clock.setInterval(() => {
    if (screen === 'library') renderLibrary();
  }, LIBRARY_REFRESH_MS);

  // ------------------------------------------------------------- deck changes while studying

  function decksChanged(): void {
    if (screen === 'library') {
      renderLibrary();
      return;
    }
    if (screen !== 'study' || shown === null || busy) return;
    // RESOLVE-ON-SHOW also for the card on screen: gone or no longer due -> the next one; edited -> shown as it is now
    const card = resolve(shown.item, now());
    if (card === null) {
      session?.drop(shown.item);
      say('The card on screen changed in its file and was skipped.');
      advance();
      return;
    }
    if (!sameState(card.state, shown.card.state)) {
      // its state changed (a review elsewhere): start this card over from the front
      show(shown.item, card);
      return;
    }
    if (card.front !== shown.card.front || card.prompt !== shown.card.prompt || card.back !== shown.card.back) {
      shown.card = card;
      paintCard();
      renderCard();
    }
  }

  setScreen('library');
  renderLibrary();

  return {
    setDecks(list) {
      decks.clear();
      for (const d of list) upsert(d);
      decksChanged();
    },
    upsertDeck(d) {
      upsert(d);
      decksChanged();
    },
    removeDeck(id) {
      decks.delete(id);
      decksChanged();
    },
    setSettings(next) {
      settings = next;
      scheduler = createScheduler(schedulerOptionsOf(settings));
      if (!settingsEl.hidden) renderSettings();
      if (screen === 'library') renderLibrary();
    },
    get screen() {
      return screen;
    },
    studyAll: () => startStudy(null),
    study: (ids) => startStudy(ids),
    focus: () => root.focus({ preventScroll: true }),
    showLibrary,
    undo: () => void undo(),
    destroy() {
      destroyed = true;
      keyTarget.removeEventListener('keydown', onKey);
      clock.clearInterval(refresh);
      if (messageTimer !== null) clock.clearTimeout(messageTimer);
      if (resumeTimer !== null) clock.clearTimeout(resumeTimer);
      root.remove();
    },
  };
}
