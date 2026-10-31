import { describe, expect, it } from 'vitest';
import { formatStateLine, type CardState } from '@plaindeck/core';
import { DEFAULT_SETTINGS } from '@plaindeck/core';
import { DeckIndex, freeDeckPath, isDeckPath, newDeckText, type VaultLike } from './decks.js';
import { parseDeck } from '@plaindeck/core';

/** DECK-FILES alone: the decks by their names, the whole vault. */
const byName = (path: string): boolean => isDeckPath(path, '');

const A: CardState = {
  phase: 'learning',
  due: Date.UTC(2026, 9, 29, 10, 14, 31),
  last: Date.UTC(2026, 9, 29, 10, 4, 31),
  stability: 2.3065,
  difficulty: 2.1181,
  reps: 1,
  lapses: 0,
  step: 1,
};
const ref = { front: 'Q', occurrence: 0 };

/** An in-memory vault: `files` is the disk; `cache` lags behind it until `sync()` (Obsidian's cachedRead). */
function vault(files: Record<string, string>): VaultLike & { files: Map<string, string>; writes: number; during: ((path: string) => void) | undefined } {
  const disk = new Map(Object.entries(files));
  const v = {
    files: disk,
    writes: 0,
    during: undefined as ((path: string) => void) | undefined,
    markdownPaths: () => [...disk.keys()].filter((p) => p.endsWith('.md')),
    cachedRead: (p: string) => (disk.has(p) ? Promise.resolve(disk.get(p) ?? '') : Promise.reject(new Error('missing'))),
    read: (p: string) => (disk.has(p) ? Promise.resolve(disk.get(p) ?? '') : Promise.reject(new Error('missing'))),
    process: (p: string, fn: (data: string) => string) => {
      v.during?.(p);
      const text = fn(disk.get(p) ?? '');
      disk.set(p, text);
      v.writes++;
      return Promise.resolve(text);
    },
  };
  return v;
}

describe('DECK-FILES', () => {
  it('a note ending in .cards.md, under the deck folder when one is set, never in a dot folder', () => {
    expect(isDeckPath('Net.cards.md', '')).toBe(true);
    expect(isDeckPath('a/b/Net.CARDS.md', '')).toBe(true);
    expect(isDeckPath('Net.md', '')).toBe(false);
    expect(isDeckPath('a/.cards.md', '')).toBe(false);
    expect(isDeckPath('.trash/Old.cards.md', '')).toBe(false);
    expect(isDeckPath('Courses/Net.cards.md', 'Courses')).toBe(true);
    expect(isDeckPath('Courses2/Net.cards.md', 'Courses')).toBe(false);
    expect(isDeckPath('Net.cards.md', 'Courses')).toBe(false);
  });

  it('load reads every deck; inputs are sorted by path and named by it', async () => {
    const decks = new DeckIndex(vault({ 'b/Two.cards.md': '## T\nx\n', 'One.cards.md': '## O\ny\n', 'note.md': '## n\n' }), byName);
    await decks.load();
    expect(decks.inputs()).toEqual([
      { id: 'b/Two.cards.md', name: 'b/Two.cards.md', fileName: 'Two.cards.md', text: '## T\nx\n' },
      { id: 'One.cards.md', name: 'One.cards.md', fileName: 'One.cards.md', text: '## O\ny\n' },
    ]);
  });

  it('refresh reports a new or changed deck once, and drops a note that stopped being one', async () => {
    const v = vault({ 'One.cards.md': '## O\ny\n' });
    const decks = new DeckIndex(v, byName);
    await decks.load();
    expect(await decks.refresh('One.cards.md')).toBe(false);
    v.files.set('One.cards.md', '## O\nchanged\n');
    expect(await decks.refresh('One.cards.md')).toBe(true);
    v.files.set('New.cards.md', '## N\nz\n');
    expect(await decks.refresh('New.cards.md')).toBe(true);
    expect(await decks.refresh('plain.md')).toBe(false);
    expect(decks.remove('New.cards.md')).toBe(true);
    expect(decks.remove('New.cards.md')).toBe(false);
  });
});

describe('VAULT-CAS', () => {
  it('a rating writes one line through process; the text comes back', async () => {
    const v = vault({ 'D.cards.md': '## Q\r\nA\r\n' });
    const decks = new DeckIndex(v, byName);
    await decks.load();
    const outcome = await decks.setCardState('D.cards.md', ref, null, A);
    expect(outcome).toEqual({ kind: 'saved', text: `## Q\r\n${formatStateLine(A)}\r\nA\r\n` });
    expect(v.files.get('D.cards.md')).toBe(`## Q\r\n${formatStateLine(A)}\r\nA\r\n`);
    expect(v.writes).toBe(1);
  });

  it('nothing to change, a changed state or a missing card: no write, the current text', async () => {
    const text = `## Q\n${formatStateLine(A)}\nA\n`;
    const v = vault({ 'D.cards.md': text });
    const decks = new DeckIndex(v, byName);
    await decks.load();
    expect(await decks.setCardState('D.cards.md', ref, A, A)).toEqual({ kind: 'saved', text });
    expect(await decks.setCardState('D.cards.md', ref, null, A)).toEqual({ kind: 'changed', text });
    expect(await decks.setCardState('D.cards.md', { front: 'Gone', occurrence: 0 }, null, A)).toEqual({ kind: 'missing', text });
    expect(v.writes).toBe(0);
  });

  it('a review synced in between the read and the write is compared at the write and never written over', async () => {
    const v = vault({ 'D.cards.md': '## Q\nA\n' });
    const decks = new DeckIndex(v, byName);
    await decks.load();
    const synced = `## Q\n${formatStateLine({ ...A, reps: 2 })}\nA\n`;
    v.during = (p) => v.files.set(p, synced); // Obsidian Sync lands right before process reads the note
    const outcome = await decks.setCardState('D.cards.md', ref, null, A);
    expect(outcome).toEqual({ kind: 'changed', text: synced });
    expect(v.files.get('D.cards.md')).toBe(synced);
  });

  it('WRITE-CHAIN: a rating and its undo run in order', async () => {
    const v = vault({ 'D.cards.md': '## Q\nA\n' });
    const decks = new DeckIndex(v, byName);
    await decks.load();
    const [rate, undo] = await Promise.all([decks.setCardState('D.cards.md', ref, null, A), decks.setCardState('D.cards.md', ref, A, null)]);
    expect(rate.kind).toBe('saved');
    expect(undo).toEqual({ kind: 'saved', text: '## Q\nA\n' });
  });

  it('a deck that left the vault, or a failing vault, is a failure, never a throw', async () => {
    const v = vault({ 'D.cards.md': '## Q\nA\n' });
    const decks = new DeckIndex(v, byName);
    await decks.load();
    expect((await decks.setCardState('Other.cards.md', ref, null, A)).kind).toBe('failed');
    v.files.delete('D.cards.md');
    expect((await decks.setCardState('D.cards.md', ref, null, A)).kind).toBe('failed');
  });
});

describe('waiting (the status bar)', () => {
  it('counts due learning and review cards, and new cards up to the per-deck limit', async () => {
    const overdue = formatStateLine({ ...A, phase: 'review', step: 0, due: Date.UTC(2026, 0, 2), last: Date.UTC(2025, 11, 29) });
    const decks = new DeckIndex(vault({ 'D.cards.md': `## R\n${overdue}\nx\n## N1\ny\n## N2\nz\n` }), byName);
    await decks.load();
    expect(decks.waiting(Date.UTC(2026, 9, 29, 15), { ...DEFAULT_SETTINGS, newPerSession: 1 })).toEqual({ due: 1, fresh: 1 });
  });
});

describe('NEW-DECK and OPENED-NOTES', () => {
  it('freeDeckPath: the first name not taken, in the folder or at the root', () => {
    const taken = new Set(['Untitled.cards.md', 'Courses/Untitled.cards.md', 'Courses/Untitled 1.cards.md']);
    expect(freeDeckPath('', (p) => taken.has(p))).toBe('Untitled 1.cards.md');
    expect(freeDeckPath('Courses', (p) => taken.has(p))).toBe('Courses/Untitled 2.cards.md');
    expect(freeDeckPath('Other', (p) => taken.has(p))).toBe('Other/Untitled.cards.md');
  });

  it('newDeckText: a deck titled after the note, with one card', () => {
    const deck = parseDeck(newDeckText('Biology'));
    expect(deck.title).toBe('Biology');
    expect(deck.cards.map((c) => c.front)).toEqual(['Your first question?']);
    expect(isDeckPath('Untitled.cards.md', '')).toBe(true);
  });

  it('OPENED-NOTES: a note the plugin was told about is a deck whatever its name; the others are not', async () => {
    const opened = new Set(['Notes/TCP.md']);
    const decks = new DeckIndex(vault({ 'Notes/TCP.md': '## What does TCP add?\nOrder.\n', 'Notes/Other.md': '## Q\nA\n', 'D.cards.md': '## Q\nA\n' }), (p) => byName(p) || opened.has(p));
    await decks.load();
    expect(decks.paths()).toEqual(['D.cards.md', 'Notes/TCP.md']);
    opened.add('Notes/Other.md');
    expect(await decks.refresh('Notes/Other.md')).toBe(true);
    opened.delete('Notes/TCP.md');
    expect(await decks.refresh('Notes/TCP.md')).toBe(true);
    expect(decks.paths()).toEqual(['D.cards.md', 'Notes/Other.md']);
  });
});
