/**
 * @plaindeck/core: everything the shells share (the Obsidian plugin, the desktop app, the web page).
 *
 * Rules for this package:
 *  - ZERO runtime dependencies (enforced: package.json "dependencies" must stay empty).
 *  - Pure, small modules; no DOM access outside src/view (tsconfig.pure.json checks the rest without the DOM lib).
 *  - Every rule in docs/ARCHITECTURE.md and src/format/README.md has a test next to its implementation.
 *
 * Sub-areas (each is a folder with its own index.ts re-exporting its public surface):
 *  - format   : the deck format: cards are `## ` headings, the review state one comment line per card (F1-F11)
 *  - schedule : FSRS-6 and the learning steps, fuzz and intervals around it (the same results as ts-fsrs 6.0.0)
 *  - study    : settings, when a card is due, the study session's queues and undo, time labels
 *  - markdown : the Markdown a card shows, parsed into a small tree (pure)
 *  - view     : the study UI the shells mount (mountApp) and the tree's DOM renderer
 *
 * The stylesheet is a separate export: `import '@plaindeck/core/app.css'`.
 */

export const VERSION = '1.0.4' as const;

export * from './format/index.js';
export * from './schedule/index.js';
export * from './study/index.js';
export * from './markdown/index.js';
export * from './view/index.js';
export { SAMPLE_DECK, SAMPLE_DECK_NAME } from './sample.js';
