/** The study UI the shells mount (mountApp) and the Markdown renderer it uses. */
export { mountApp } from './app.js';
export { inlineText, renderBlocks, renderInline, renderInlines, renderMarkdown } from './markdown-dom.js';
export type { AppHandle, AppOptions, CardPart, DeckInput, RenderContext, SaveOutcome, Screen } from './types.js';
