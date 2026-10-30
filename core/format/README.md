# Deck format rules (F1-F11)

A deck is one Markdown file, by convention named `*.cards.md`. Every `## ` heading in it is a card, and
a card's review state is one HTML comment line under its heading. The file stays an ordinary note:
Obsidian, GitHub and every Markdown viewer show the headings and the answers and hide the state lines.
The reader is `parse.ts`, the state line codec `state.ts`, the writer `write.ts`; each rule has tests
named after it (`parse.test.ts`, `state.test.ts`, `write.test.ts`).

````markdown
---
tags: [networking]
---
# Networking

Anything before the first card is the deck's own text.

## What does TCP add over IP?
<!-- srs: review due=2026-11-02T10:04:31Z last=2026-10-29T10:04:31Z s=4.1312 d=5.2341 reps=2 lapses=0 -->
Reliable, ordered delivery, with retransmission and flow control.

## What does this print?
```js
console.log([1, 2, 3].map(parseInt));
```
?
`[1, NaN, NaN]`
````

- **F1 Encoding.** UTF-8. The writer changes exactly one line and leaves every other byte as it was: a
  BOM, the line endings (CRLF, LF, mixed), a missing final newline. A state line inserted under a heading
  takes that heading's line ending; under a last line without one, the majority ending of the file.
- **F2 Anatomy.** `[BOM][front matter][preamble]` then the cards. Front matter exists only when line 1 is
  `---` and a later `---` or `...` closes it; it is never parsed. Everything before the first card heading
  is the preamble and belongs to no card.
- **F3 Title.** The first `# ` heading outside opaque blocks is the deck's title; without one, the file's
  name without `.cards.md` (or `.md`).
- **F4 Card.** Every ATX level-2 heading (`## `, at most 3 spaces of indentation, outside opaque blocks)
  starts a card, which ends at the next level-1 or level-2 heading or at the end of the file. The heading's
  text, without the closing `#`s and the spaces around it, is the FRONT (inline Markdown). Headings of
  level 3 to 6 belong to the card they are in. Setext headings never start a card.
- **F5 Opaque blocks.** Fenced code (`` ``` `` or `~~~`, at most 3 spaces of indentation, closed by a
  fence of the same character at least as long), HTML comments that do not close on their first line (up
  to the line holding `-->`), Obsidian comments (`%%` on a line of its own up to the next one) and display
  math (`$$` lines): nothing inside them is a heading, a state line or a separator. This is what lets a
  card show a state line or a `## ` inside a code block.
- **F6 Prompt and back.** The card's lines after its heading, without its state line, are its body. A line
  holding only `?` splits the body: the lines above it are the PROMPT, shown with the front before the
  answer; the lines below it are the BACK. Without a `?` line the whole body is the back. Blank lines at the
  start and the end of each part are dropped.
- **F7 State line.** One line of its own, a complete HTML comment whose text starts with `srs:`:
  `<!-- srs: <phase> key=value ... -->`. The phase (`learning`, `review` or `relearning`) comes first as a
  bare word, then `step` (only when it is not 0), `due` and `last` (UTC, `YYYY-MM-DDTHH:MM:SSZ`), `s`
  (stability in days) and `d` (difficulty, 1 to 10) with at most 4 decimals, `reps` and `lapses`. The
  writer writes them in that order; the reader takes them in any order (minutes-only and millisecond times
  too) and ignores keys it does not know, which the next write drops. The first state line of a card
  (outside opaque blocks) is its state; a card without one is NEW. A later one is just a comment.
- **F8 Unreadable state.** A state line that misses a key, repeats one, or holds a bad value (an unknown
  phase, an impossible date, `s=0`, `d=11`, `reps=0`) makes its card a PROBLEM: listed with the line number,
  never studied, never written. Reading it as "new" would let the first review write over its history.
- **F9 Writing (compare-and-set).** A review changes one line: the card's state line is replaced in place
  (wherever it sits in the card), a new card gets one inserted right under its heading, and a reset (the
  undo of a first review) removes it with its line ending. The write names the card (F10) and the state it
  was computed from, and is checked against the text as it is at write time: if the card now holds another
  state (a review made on another device came in through a sync, an edit), nothing is written and the
  caller gets the current state (`changed`); a card that is gone is `missing`, an unreadable one `invalid`.
  A write that would not change the line returns the text as it is.
- **F10 Identity.** A card is named by its front and its occurrence: the n-th card with that same front in
  the file, counted from 0. No id is written into the file. The back can be edited freely at any time; a
  front edited while a review of that card is being written makes that write `missing`.
- **F11 Empty heading.** A `##` heading without text is a problem card (F8): listed, never studied.

Not part of the format: the deck's settings (retention, steps), review logs, media. Images and embeds in a
card are shown as a placeholder, not loaded.

**Lint** (`lint.ts`, also not part of the format: reading and writing never call it). `lintDeck` reports what
these rules accept but an author probably did not mean, for the agent skill's checker
(`skills/plain-deck-flashcards/scripts/check-deck.mjs`). Errors lose cards or keep them from being studied:
`no-cards`, `unclosed-block` (F5: an opaque block that never closes hides every card after it),
`problem-card` (F8, F11). Warnings read fine but are likely mistakes: `file-name` (not `*.cards.md`),
`not-a-heading` (`##Front`, or a `## ` indented 4 spaces), `duplicate-front` (F10), `empty-answer`,
`extra-separator` (F6), `extra-state-line` and `stray-state-line` (F7), `long-front` (over 150 characters).
