/**
 * Card Markdown through Obsidian's own renderer (AppOptions.renderMarkdown): images and embeds resolved from
 * the deck's note, math, code highlighting, callouts, tags and internal links, styled by the vault's theme
 * (`markdown-rendered`). Each part of the card (front, prompt, back) keeps one child Component of the view:
 * the previous render of a part is unloaded, with its embeds and post-processors, when the next one starts,
 * and all of them when the view closes.
 */
import { Component, MarkdownRenderer, type App } from 'obsidian';
import type { CardPart, RenderContext } from '@plaindeck/core';

export class ObsidianRenderer {
  private readonly parts = new Map<CardPart, Component>();

  constructor(
    private readonly app: App,
    private readonly owner: Component,
  ) {}

  async render(markdown: string, el: HTMLElement, ctx: RenderContext): Promise<void> {
    const previous = this.parts.get(ctx.part);
    if (previous !== undefined) this.owner.removeChild(previous);
    const child = this.owner.addChild(new Component());
    this.parts.set(ctx.part, child);
    el.addClass('markdown-rendered');
    // An internal link opens its note in a new tab, as from a note in reading view.
    el.on('click', 'a.internal-link', (evt, target) => {
      evt.preventDefault();
      const link = target.getAttribute('data-href') ?? target.getAttribute('href');
      if (link !== null && link !== '') void this.app.workspace.openLinkText(link, ctx.deckId, 'tab');
    });
    await MarkdownRenderer.render(this.app, markdown, el, ctx.deckId, child);
  }
}
