---
name: plain-deck-flashcards
description: Writes and edits spaced-repetition flashcards for Plain Deck, the free plain-text flashcard app (Obsidian plugin, desktop and web). A deck is one Markdown note named "Topic.cards.md"; every "## " heading is a card's question, the lines under it are the answer, and a line holding only "?" splits a longer question from its answer. Review lines (the HTML comments that start with "srs:") belong to the app and are never written by hand. A bundled checker lists the cards and catches mistakes. Use when the user asks for flashcards, a deck, study or review cards, Anki-style cards or spaced-repetition material; wants notes, a document, a lecture, a chapter, a vocabulary list or facts turned into cards for Plain Deck or Obsidian; or wants an existing .cards.md deck checked, extended or fixed.
---

# Plain Deck flashcards

Plain Deck studies flashcards written in ordinary Markdown. A **deck** is ONE file named
`<Topic>.cards.md`; every `## ` heading in it is a **card**: the heading is the question, the lines under it
are the answer. When the user studies, the app writes each card's review state into the same file as one
hidden comment line under the card's heading. You write questions and answers; the app does the rest.

The checker is `scripts/check-deck.mjs` in this skill's folder (`<skill folder>` below: the folder that
holds this SKILL.md; Node 18 or later, nothing to install). Many agent tools start a new shell for each
command, so begin every command that runs it by setting its full path, then call it as `node "${PD:?}"`:

```bash
PD="<skill folder>/scripts/check-deck.mjs"; node "${PD:?}" "/path/to/vault/HTTP caching.cards.md"
```

With `PD` empty, `${PD:?}` stops the command with a message instead of running `node` with nothing. Give
decks by their full path, and never write decks into the skill folder.

## 30-second example

The user asks for cards on HTTP caching in their vault's `Study` folder. Write
`/path/to/vault/Study/HTTP caching.cards.md`:

````markdown
# HTTP caching

## Which response header tells caches how long a response stays fresh?
`Cache-Control`, with `max-age=<seconds>`.

## What does `Cache-Control: no-store` forbid?
Storing the response anywhere: neither the browser nor a shared cache may keep it.

## What does this response header allow?
```http
Cache-Control: public, max-age=31536000, immutable
```
?
Any cache may keep it for a year, and the browser does not revalidate it, not even on reload.
````

Then check it and fix whatever it reports:

```bash
PD="<skill folder>/scripts/check-deck.mjs"; node "${PD:?}" "/path/to/vault/Study/HTTP caching.cards.md"
```
```text
/path/to/vault/Study/HTTP caching.cards.md: "HTTP caching", 3 cards (3 new, 0 studied)
OK: 1 deck, 3 cards, no errors, no warnings.
```

Three complete decks are in `examples/`: `http-caching.cards.md` (front matter, a description, a code
question split by `?`, answers with a reason after them), `portuguese-verbs.cards.md` (vocabulary in
both directions, a fill-in-the-gap written as a question) and `ddia-sharding.cards.md` (a book chapter
turned into 57 cards: `# ` headings group them in the chapter's order, each card asks one thing, the
answer comes first and its reason after).

## The format

- **The file.** UTF-8 Markdown whose name ends in `.cards.md` (the apps list nothing else as a deck).
  It stays a normal note: Obsidian, GitHub and any editor show the headings and answers.
- **Front matter** (`---` on line 1 up to the next `---`) is allowed and never read. **The title** is the
  first `# ` heading; without one, the file name. **Text before the first card** (a description, the
  source) belongs to no card.
- **A card** starts at a level-2 heading: `## `, two `#` then a space, at the start of the line. The
  heading's text is the question (one line; inline Markdown such as `code`, **bold**, links). The card runs
  to the next `## ` or `# ` heading or the end of the file. `###` and deeper headings stay inside the card.
- **The answer** is every line under the heading: paragraphs, lists, tables, code blocks, quotes, images
  (`![[diagram.png]]` shows in Obsidian; the desktop and web apps show a placeholder).
- **A `?` line**, a line holding only `?`, splits the card: the lines above it are shown with the question
  before the answer is revealed (a code snippet, a quote, a picture, the long part of a question), the
  lines below it are the answer. Only the first `?` line in a card counts.
- **Code blocks, multi-line `<!-- -->` comments, `%%` comments and `$$` math blocks** are opaque: a `## `
  or a `?` inside them is plain text. Close every one of them: an unclosed ```` ``` ```` swallows the rest
  of the file, cards included.
- **Review lines**, such as `<!-- srs: review due=2026-11-02T10:04:31Z ... -->` under a heading, are
  written by the app after each review. Previews hide them. A card without one is new.
- **Identity.** A card is known by its question text (and its order among cards with the same text). The
  review line travels with the card it sits in.

## Workflow

1. **Find the place.** Write where the user said (an Obsidian vault folder, a project folder), else ask or
   use the current folder. One deck per topic, named after it: `Photosynthesis.cards.md`. Leave out
   `/ \ : * ? " < > | # ^ [ ]` from file names. If the deck exists, add to it (see "Editing an existing
   deck") rather than writing a second one.
2. **Plan the cards** from the material: list the facts, terms, relations and steps worth remembering,
   then turn each into one question (see "Writing good cards"). Ask how many cards or which parts matter
   when the material is long and the user did not say.
3. **Write the file**: optionally a `# Title` and one or two lines saying what the deck covers and where it
   comes from, then the cards. Never write a review line.
4. **Check it** with the checker and fix every error; fix warnings unless they are intended.
5. **Report**: the deck's path, how many cards, and anything you left out or were unsure of. To study:
   Obsidian with the Plain Deck plugin (the deck appears in its view by itself), or the desktop or web
   app (open the folder).

## Writing good cards

- **One fact per card.** A question with one short, checkable answer. Split "What are X, Y and Z?" into
  three cards. If a list must stay together, keep it short and ordered (steps of a process).
- **Make the question specific**, so only one answer fits: "In HTTP, which status code means Not
  Modified?", not "Status codes?". Put the context in the question (the subject, the language, the
  version) when the card would be ambiguous on its own.
- **Answer first, then the why.** First line: the answer. After it, optionally, a short explanation, an
  example or a mnemonic. Keep the answer readable in a few seconds.
- **No cloze.** Plain Deck has no fill-in-the-blank cards: write the blank as a question ("Which verb fills
  the gap in ...?").
- **Both directions are two cards**, written on purpose ("What does 'decorar' mean?" and "How do you say
  'to memorize'?"); there are no automatic reverse cards. Make them only where both directions matter
  (vocabulary, symbols, formulas).
- **Never give the answer away** in the question, in a `?` prompt or in the deck's description.
- **Questions stay short**: a heading reads badly past a line or so. Put long setups, code, quotes and
  pictures above a `?` line.
- **Each question unique in the deck.** Two cards with the same text are hard to tell apart.
- **Use the user's words and language**: their terms, their notes' language, their level of detail.
- **Prefer understanding over trivia**: why, how, compare, what happens if. Avoid cards about the source
  ("What does page 3 say?").
- **No padding.** Fewer good cards beat many weak ones; a page of dense notes is often 5 to 15 cards.

````text
Weak                                       Better
## HTTP caching?                           ## Which header sets how long a response stays fresh?
## What are the 3 SOLID principles ...     one card per principle
## The capital of Australia is ___         ## What is the capital of Australia?
## Explain everything about TCP            ## What does TCP add over IP?
````

## Editing an existing deck

The file holds the user's study history. Keep it intact:

- **Never write, change, copy or reorder review lines** (`<!-- srs: ... -->`). Don't invent them for new
  cards, and don't copy one along with a card you use as a template.
- **Edit in place**: add cards at the end (or after a related card), fix the text of a question or an
  answer, delete a card from its `## ` heading to the line before the next `## ` or `# ` heading (or to the
  end of the file): its `###` subsections go with it, and headings inside code blocks don't count. Do not
  rewrite the whole file from memory: that is how review lines get lost.
- **Move a card whole**: its heading, its review line and its answer together.
- **Rewording a question keeps its progress** (the review line stays under it). Change the meaning of a
  card only by deleting it and adding a new one.
- **To start a card over**, delete its review line, and only when the user asks for it.
- A problem the checker reports on a review line: don't repair the values; tell the user (deleting the
  line resets that card).
- Keep the file's line endings and any front matter as they are.

## Turning notes or a document into cards

1. Read the whole source first; note its structure (sections often become groups of cards).
2. Pick what is worth remembering: definitions, key facts and numbers, cause and effect, contrasts,
   procedures, examples that explain a rule. Skip what is easy to look up and never needed by heart.
3. Write questions as someone would ask them later, without the source at hand.
4. Keep a link to the source in the deck's description, for example `Source: [[Lecture 3]]` in Obsidian.
5. Use `# ` headings to group cards by section if it helps; they end the card above them but never
   become cards.

## The checker

```bash
PD="<skill folder>/scripts/check-deck.mjs"; node "${PD:?}" "<deck.cards.md or a folder>" [--cards] [--json]
```

It reads the decks with Plain Deck's own reader and prints, per deck, the title, the number of cards and
every issue with its line number; `--cards` adds one line per card (line, state, question), `--json` gives
the same as one JSON object. A folder is searched for `*.cards.md` files. It never writes. Exit status: 0
no errors, 1 errors (or a folder without decks), 2 a bad argument or an unreadable path.

| Level | Code | Meaning |
| --- | --- | --- |
| error | `no-cards` | no `## ` heading outside code blocks and comments |
| error | `unclosed-block` | a code block, comment or math block never closes and hides every card after it |
| error | `problem-card` | an empty `##` heading, or a review line the app cannot read |
| warning | `file-name` | the file's name does not end in `.cards.md` |
| warning | `not-a-heading` | `##Question` (no space) or an indented `## ` line: text, not a card |
| warning | `duplicate-front` | the same question twice |
| warning | `empty-answer` | nothing under a question (or below its `?` line) |
| warning | `extra-separator` | a second `?` line in a card |
| warning | `extra-state-line` / `stray-state-line` | a copied review line, or one outside every card |
| warning | `long-front` | a question over 150 characters |

Without Node, check by hand with the list below.

## Before you finish

- The file name ends in `.cards.md`, and it is where the user wanted it.
- Every card starts with `## ` and a question; the checker reports no errors.
- Every code block is closed; `?` lines appear only to split a card, on a line of their own.
- No review line was added, changed or copied; existing ones are where they were.
- Each card asks one thing, and its answer is short and right.
