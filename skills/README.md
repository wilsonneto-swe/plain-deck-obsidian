# Agent skills

## plain-deck-flashcards

Teaches an AI agent to write flashcards for Plain Deck: one `<Topic>.cards.md` Markdown note per deck,
every `## ` heading a card's question, the lines under it the answer. With the skill, an agent can turn
notes, a document, a lecture or a vocabulary list into a deck, add cards to an existing deck without
touching its review history, or check a deck and fix it. The decks open in the Plain Deck Obsidian plugin,
the desktop app and the web app, and read as ordinary notes everywhere else.

```
plain-deck-flashcards/
  SKILL.md                the instructions the agent reads (the format, the workflow, what makes a good card)
  scripts/check-deck.mjs  the checker: lists a deck's cards and reports mistakes (one file, Node >= 18, no dependencies)
  examples/               two decks: http-caching.cards.md and portuguese-verbs.cards.md
```

`check-deck.mjs` is built from the apps' own deck reader (`@plaindeck/core/format`, its `lintDeck`), so it
sees a deck exactly as Plain Deck does. Nothing to install: the folder is self-contained. The format
itself is in the root README ([The file format](../README.md#writing-cards)).

### Install in Claude Code

Claude Code loads skills from `~/.claude/skills/` (every project) and from `.claude/skills/` inside a
project (that project only; for decks, your Obsidian vault is a good place). Copy the folder there, or
symlink it to keep it in step with this repository:

```
mkdir -p ~/.claude/skills && cp -R skills/plain-deck-flashcards ~/.claude/skills/
# or
mkdir -p ~/.claude/skills && ln -s "$PWD/skills/plain-deck-flashcards" ~/.claude/skills/plain-deck-flashcards
# or, for one vault or project only (run inside it)
mkdir -p .claude/skills && cp -R /path/to/plain-deck/skills/plain-deck-flashcards .claude/skills/
```

Start a new session. Claude uses the skill when a request matches its description (flashcards, a deck,
study cards, spaced repetition...); you can also name it: "use the plain-deck-flashcards skill".

### Install in the Claude apps

Zip the folder (here into your home folder, outside the repository) and upload the zip as a custom skill
in Claude's settings, where skills are managed:

```
cd skills && zip -r ~/plain-deck-flashcards.zip plain-deck-flashcards -x '*.DS_Store'
```

The checker needs Claude's code execution; without it Claude still follows SKILL.md and writes the deck
by hand.

### Any other agent

Give the agent `SKILL.md` as instructions (paste it, or point the agent's rules file at it) and keep
`scripts/` next to it if the agent can run commands (Node 18 or later). SKILL.md has the agent set the
checker's full path in every command (`PD="<skill folder>/scripts/check-deck.mjs"; node "${PD:?}" ...`),
because many agent tools start a new shell for each command and `${PD:?}` stops a command whose `PD` is
empty.

### Example prompts

- "Make flashcards from my notes in `Lectures/Week 3.md` and put the deck next to them."
- "Turn this article into a Plain Deck deck of about 15 cards." (then paste the article)
- "Add cards for these ten Spanish verbs to `Spanish.cards.md`, both directions."
- "Check `Biology.cards.md`: why does Plain Deck show fewer cards than I wrote?"
- "Split the long questions in `Kubernetes.cards.md` into smaller cards without losing my progress."
