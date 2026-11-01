# Plain Deck

**Your review progress lives in the card's own note, so git, iCloud and Obsidian Sync carry it with no separate
database.**

Study flashcards written in your notes, with spaced repetition. A deck is an ordinary note: every `## `
heading is a card's question, and the lines under it are the answer. Open any note as flashcards from its
right-click menu, or name it `*.cards.md` to make it a deck everywhere. Each review is
saved in the same note as one hidden line under the card, so your progress lives with your notes and syncs with
your vault to every device you study on, phone included. Scheduling is FSRS-6, the algorithm Anki uses.

<p align="center">
  <img src=".github/assets/study.gif" width="860" alt="The Plain Deck view on its own in Obsidian: the decks with their new, learning and due counts; Study on Getting started; each card shows its question, then Show answer reveals the answer rendered by Obsidian, a code block or a code prompt above it, with the four ratings and when each brings the card back; back in the decks, the counts have moved">
</p>

## Features

- **Cards are notes.** Write them in the editor you already use. They stay readable as headings and text in
  reading view, on GitHub and in any Markdown app.
- **Progress in the note.** One hidden comment line per studied card, written through Obsidian's vault, so
  Obsidian Sync, iCloud or git carry it with the note. Nothing else in the note changes.
- **Safe with sync.** Before each write the plugin reads the note as it is at that moment: a review that
  arrived from another device is never written over.
- **Rendered by Obsidian.** Images and embeds (`![[diagram.png]]`), math, code, tables, callouts, internal
  links and your theme.
- **Desktop and mobile.** Keys on the computer; on a phone, tap to show the answer and tap a rating.
- **FSRS-6 scheduling**, with your desired retention, learning steps and a limit of new cards per deck.

## How it compares

Several Obsidian plugins let you study flashcards written in your notes. The table sets out what each one says about
itself on its page in the [community directory](https://community.obsidian.md/plugins) (read on November 1, 2026);
"—" means the page doesn't say.

| | Cards are written as | Review progress is kept in | Scheduler | Desktop and mobile | Network use |
| --- | --- | --- | --- | --- | --- |
| **Plain Deck** | `## ` headings with the answer under them, in `*.cards.md` notes or any note you open as flashcards | One comment line under each card, in the card's own note | FSRS-6 | Yes | None |
| [Decks](https://community.obsidian.md/plugins/decks) | `## ` headings (the level can be changed) with the text under them, two-column tables, image occlusion and `==cloze==`, in notes tagged `#decks` | A SQLite database, `flashcards.db`, in the plugin's folder, plus one sync log file per device in the vault | FSRS-6 | Yes | Optional: its deck directory and AI features |
| [Spaced Repetition](https://community.obsidian.md/plugins/obsidian-spaced-repetition) | `Question::Answer`, multi-line cards split by `?`, and cloze cards, in notes tagged `#flashcards` | — | FSRS or SM-2 | Yes | — |
| [Talking Cards](https://community.obsidian.md/plugins/talking-cards) | `Question ;; Answer` or `Question :: Answer`, multi-line cards split by `?`, cloze and image occlusion; decks are folders | Files in the vault, `Talking Cards/reviews-<device>-<year>.md`, one per device | FSRS | Yes | Only for its voice store and voice downloads |

Plain Deck keeps each card's current schedule (due date, stability, difficulty, reviews and lapses), not a log of
every review. The others also do things Plain Deck doesn't: Decks imports Anki collections, Spaced Repetition
schedules whole notes for review, and Talking Cards reads cards aloud.

## Getting started

1. Install and enable Plain Deck ([Installation](#installation)).
2. Select the layers icon in the left ribbon. In a vault without decks, choose **Add the example deck**: it
   explains the format while you study it.
3. Study a note you already have: right-click it in the file explorer (or open its **More options** menu) and
   choose **Study as flashcards**, or run **Plain Deck: Study the current note**. Its `## ` headings are the
   cards, whatever the note is called; Plain Deck keeps it with your decks until you choose **Remove from
   decks** in the same menu.
4. Or start a new deck: right-click a folder > **New flashcards deck**, or run **Plain Deck: Create a new deck**.
   It creates `Untitled.cards.md` with a first card to overwrite. Every note whose name ends in `.cards.md`, for
   example `Networking.cards.md`, is a deck without any step:

````markdown
# Networking

## What does TCP add over IP?
Reliable, ordered delivery, with retransmission and flow control.

## What does this print?
```js
console.log([1, 2, 3].map(parseInt));
```
?
`[1, NaN, NaN]`: `map` passes the index as `parseInt`'s radix.
````

## Writing cards

- Every `## ` heading is a card, and its text is the question. The card runs to the next `##` or `#` heading;
  headings of level 3 and deeper stay inside it.
- A line holding only `?` splits a card: the lines above it are shown with the question, the lines below it
  are the answer. Use it for code, a quote, a picture or a long question.
- `## ` headings inside code blocks and comments are not cards.
- After a review, the plugin adds one line under the card's heading, for example
  `<!-- srs: review due=2026-11-02T10:04:31Z last=2026-10-29T10:04:31Z s=4.1312 d=5.2341 reps=2 lapses=0 -->`.
  Reading view hides it. Delete the line to make the card new again; don't edit it by hand (a line the plugin
  cannot read sets the card aside instead of restarting it).
- You can reword a question or an answer at any time; the card keeps its progress.

## Studying

<p align="center">
  <img src=".github/assets/demo.gif" width="860" alt="Plain Deck in Obsidian: a deck note on the left, the Plain Deck view on the right; each rating adds one review line under the card's heading in the note">
</p>

- Open the decks with the layers icon in the ribbon, the command **Plain Deck: Open the decks**, or the status
  bar on the desktop. Study every deck, one deck, the note you are in (**Study the current note**), or
  right-click a note (**Study this deck**, **Study as flashcards**) or a folder (**Study the decks in this
  folder**).
- **Space** or **Enter** shows the answer, then rates it Good; **1** to **4** rate Again, Hard, Good and Easy
  (each button shows when the card comes back); **Ctrl+Z** (**⌘Z** on a Mac) takes a rating back; **Esc** goes
  back to the decks.
- **Open file** during a session opens the deck's note at the card.

## Settings

In Settings > Plain Deck, or with the Settings button in the decks view:

- **Deck folder**: only notes under this folder are decks (empty: the whole vault).
- **Desired retention** (90%), **new cards per deck** in a session (20), **maximum interval** (100 years),
  **learning steps** (1m 10m), **relearning steps** (10m), and the hour **the next day starts** (4:00).

## Example decks

The [`examples`](examples) folder has decks to try: copy one into your vault and open the Plain Deck view.

- [Getting started](examples/Getting%20started.cards.md): the format, explained by a deck (the same deck the
  plugin offers to add when the vault has none).
- [DDIA - Sharding](examples/DDIA%20-%20Sharding.cards.md): a study deck of 59 cards from Chapter 7 of
  *Designing Data-Intensive Applications* (2nd edition), grouped by `# ` headings in the chapter's order.
- [Git basics](examples/Git%20basics.cards.md): 20 cards on everyday Git (saving changes, branches, remotes and
  undoing things), one fact per card, with a code card split by `?`.

## For AI agents

The [`skills/plain-deck-flashcards`](skills/plain-deck-flashcards) folder is an agent skill: it teaches an AI agent
(Claude Code, the Claude apps, or any agent that reads instructions) to write decks in this format, from your notes,
a document or a vocabulary list: one fact per card, good questions, the `?` split, and never touching the review
lines of a deck you already study. Its checker, `scripts/check-deck.mjs` (Node 18 or later, nothing to install),
reads a deck exactly as Plain Deck does and reports what would go wrong:

```
node skills/plain-deck-flashcards/scripts/check-deck.mjs "/path/to/vault/HTTP caching.cards.md"
```

Installing it is one copy, for example into `~/.claude/skills/` for Claude Code: see
[skills/README.md](skills/README.md).

## Installation

- **From Community plugins**: Settings > Community plugins > Browse, search for "Plain Deck", then select
  **Install** and **Enable**. Or select **Add to Obsidian** on
  [its page in the community directory](https://community.obsidian.md/plugins/plain-deck).
- **Manually**: download `main.js`, `manifest.json` and `styles.css` from the
  [latest release](https://github.com/wilsonneto-swe/plain-deck-obsidian/releases/latest) into
  `<vault>/.obsidian/plugins/plain-deck/`, reload Obsidian, then enable **Plain Deck** in Settings > Community
  plugins.
- **On your phone**: install it from Community plugins there too, or let Obsidian Sync bring it (turn on
  "Installed community plugins" and "Active community plugin list" in Settings > Sync on both devices).

## Privacy

Plain Deck works offline. It makes no network requests, has no telemetry or ads, and needs no account. To find
your decks it goes through the list of files in your vault (their paths only), then reads the notes whose names
end in `.cards.md` (under the deck folder, if you set one) and the notes you opened with it. It writes only into
those notes, one review line at a time, and creates a note only when you ask for a new deck or the example deck.
Its settings are kept in the plugin's own folder (`data.json`). It never reads or writes files outside your
vault.

## Building from source

```
npm install
npm run build      # main.js and styles.css, next to manifest.json
npm run dev        # the same, rebuilt on every change
npm run check      # Obsidian's lint rules, type checks, tests and the build
```

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/plain-deck/`. Releases are
built by GitHub Actions when a version tag is pushed (`.github/workflows/release.yml`), with build attestations.
[CONTRIBUTING.md](CONTRIBUTING.md) covers trying a build in a test vault, reporting a bug and sending a pull
request.

## Feedback

**What would make you switch from your current flashcard plugin?** Tell us in
[Discussions](https://github.com/wilsonneto-swe/plain-deck-obsidian/discussions), where questions and ideas are
welcome too.

Found a bug? [Open an issue](https://github.com/wilsonneto-swe/plain-deck-obsidian/issues/new/choose). The plugin
is developed together with its tests in a separate repository and exported here for each release, so a pull
request is welcome and ships with the next version: [CONTRIBUTING.md](CONTRIBUTING.md) explains how.

## Sponsor

Plain Deck is free, works offline and has no ads or accounts. If it is useful to you, you can support its development on
[GitHub Sponsors](https://github.com/sponsors/wilsonneto-swe).

## License

MIT, see [LICENSE](LICENSE). The scheduler is a reimplementation of FSRS-6 that follows
[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (MIT, Copyright (c) 2026 Open Spaced Repetition):
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## More plugins by the author

[Mindslate](https://community.obsidian.md/plugins/mindslate): open a note as a keyboard-first mind map and edit it in
place, while the note stays an ordinary heading with a nested list.
