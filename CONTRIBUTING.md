# Contributing to Plain Deck

Bug reports, ideas and pull requests are all welcome. This page explains how to build the plugin, how to report a
problem so it can be fixed quickly, and what a pull request needs.

## Questions and ideas

Ask in [Discussions](https://github.com/wilsonneto-swe/plain-deck-obsidian/discussions): **Q&A** for help,
**Ideas** for what you would like Plain Deck to do, **Show and tell** for your decks and setups.
[Issues](https://github.com/wilsonneto-swe/plain-deck-obsidian/issues) are for bugs and concrete feature requests.

## Reporting a bug

Open a [bug report](https://github.com/wilsonneto-swe/plain-deck-obsidian/issues/new?template=bug_report.yml). A
good one has:

- **Versions**: Plain Deck's (Settings > Community plugins) and Obsidian's (Settings > General).
- **Platform**: macOS, Windows, Linux, iOS, iPadOS or Android, and how the vault syncs (Obsidian Sync, iCloud,
  git, another service, or not at all).
- **Steps** from opening Obsidian to the problem, what you expected, and what happened instead.
- **A small deck that shows it.** Replace anything personal with placeholder text. If the problem is about
  scheduling, keep the review lines (`<!-- srs: ... -->`): they hold only dates and numbers.
- **Errors from the developer console**, if there are any (desktop): View > Toggle Developer Tools
  (Ctrl+Shift+I, or Cmd+Option+I on a Mac), then the Console tab.

When a card is missing or a deck looks wrong, the deck checker reads the deck exactly as the plugin does and lists
the cards it finds and the problems it sees:

```
node skills/plain-deck-flashcards/scripts/check-deck.mjs "/path/to/My deck.cards.md" --cards
```

## Building and testing

You need Node.js 22.12 or later, and npm.

```
npm install
npm run dev        # main.js and styles.css at the repository root, rebuilt on every change
npm run check      # what every pull request must pass: Obsidian's lint rules, type checks, tests and the build
```

`npm run build`, `npm run lint`, `npm run typecheck` and `npm test` run one step each.

Try your build in a test vault, never in the vault with your real notes. On macOS and Linux, link the plugin's
files into the test vault once (run this at the repository root):

```sh
mkdir -p "/path/to/test vault/.obsidian/plugins/plain-deck"
for f in main.js manifest.json styles.css; do ln -sf "$PWD/$f" "/path/to/test vault/.obsidian/plugins/plain-deck/$f"; done
```

On Windows, copy the files instead (in PowerShell, at the repository root), and run the `Copy-Item` line again after
each rebuild:

```powershell
$plugin = "C:\path\to\test vault\.obsidian\plugins\plain-deck"
New-Item -ItemType Directory -Force $plugin | Out-Null
Copy-Item main.js, manifest.json, styles.css $plugin
```

Then enable **Plain Deck** in Settings > Community plugins. After each rebuild, run **Reload app without saving**
from the command palette. The decks in [`examples/`](examples) are a quick way to fill the test vault.

## Where things are

- `src/`: the Obsidian plugin: the commands and menus (`main.ts`), finding decks and writing reviews
  (`decks.ts`), the view (`view.ts`), the settings tab (`settings-tab.ts`). Tests sit next to the code
  (`*.test.ts`, run by vitest).
- `core/`: everything that doesn't need Obsidian: the deck format (`core/format`, which reads cards and review
  lines and writes a review), the FSRS-6 scheduler (`core/schedule`), study sessions (`core/study`) and the study
  view (`core/view`).
- `skills/`: the agent skill. Its `scripts/check-deck.mjs` is generated from the deck reader in the development
  repository, so don't edit it by hand: change `core/format` and say in the pull request that the checker needs
  the same change.
- `examples/`: decks to try.

## Sending a pull request

The plugin is developed, with its tests, in a separate repository and exported here for each release. A pull
request here is still welcome: it is reviewed here, and the change ships with the next version.

- Keep each pull request to one change, and say what it fixes or adds and how you tested it (Obsidian version
  and platform).
- `npm run check` passes.
- A change in behaviour comes with a test.
- Decks are people's notes. Every deck that works today must keep working, and a rating writes only the review
  line of the card that was rated ([Writing cards](README.md#writing-cards)).
- Update the README when something a user sees changes.
- No network requests and no telemetry: Plain Deck works offline ([Privacy](README.md#privacy)).

By sending a pull request, you agree that your contribution is licensed under the [MIT License](LICENSE).
