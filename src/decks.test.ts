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

/**
 * An in-memory vault: `files` is the disk. `hold()` keeps every read that starts from now on waiting until the
 * function it returns is called (a slow cachedRead, for LATE-READS).
 */
function vault(files: Record<string, string>): VaultLike & {
  files: Map<string, string>;
  writes: number;
  during: ((path: string) => void) | undefined;
  hold(): () => void;
} {
  const disk = new Map(Object.entries(files));
  let gate: Promise<void> | null = null;
  const readNow = async (p: string): Promise<string> => {
    const g = gate;
    if (g !== null) await g;
    if (!disk.has(p)) throw new Error('missing');
    return disk.get(p) ?? '';
  };
  const v = {
    files: disk,
    writes: 0,
    during: undefined as ((path: string) => void) | undefined,
    markdownPaths: () => [...disk.keys()].filter((p) => p.endsWith('.md')),
    cachedRead: readNow,
    read: readNow,
    process: (p: string, fn: (data: string) => string) => {
      v.during?.(p);
      const text = fn(disk.get(p) ?? '');
      disk.set(p, text);
      v.writes++;
      return Promise.resolve(text);
    },
    exists: (p: string) => disk.has(p),
    hold: () => {
      let release = (): void => undefined;
      const g = new Promise<void>((resolve) => {
        release = resolve;
      });
      gate = g;
      return () => {
        if (gate === g) gate = null;
        release();
      };
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

describe('LATE-READS', () => {
  const notes = { 'D.cards.md': '## Q\nA\n', 'Notes/A.md': '## A1\nx\n', 'Notes/B.md': '## B1\ny\n' };

  it('a note removed from the decks while a load reads it is not brought back', async () => {
    const opened = new Set(['Notes/A.md']);
    const v = vault(notes);
    const decks = new DeckIndex(v, (p) => byName(p) || opened.has(p));
    const release = v.hold();
    const loading = decks.load();
    opened.delete('Notes/A.md');
    release();
    await loading;
    expect(decks.paths()).toEqual(['D.cards.md']);
  });

  it('a note deleted while a load reads it is not listed', async () => {
    const v = vault(notes);
    const decks = new DeckIndex(v, byName);
    const release = v.hold();
    const loading = decks.load();
    v.files.delete('D.cards.md');
    release();
    await loading;
    expect(decks.paths()).toEqual([]);
  });

  it('a note removed from the decks while its refresh reads it stays out', async () => {
    const opened = new Set(['Notes/A.md']);
    const v = vault(notes);
    const decks = new DeckIndex(v, (p) => byName(p) || opened.has(p));
    const release = v.hold();
    const refreshing = decks.refresh('Notes/A.md');
    opened.delete('Notes/A.md');
    release();
    await refreshing;
    expect(decks.has('Notes/A.md')).toBe(false);
  });

  it('a refresh that comes during a load lands after it, with the newer text', async () => {
    const opened = new Set<string>();
    const v = vault(notes);
    const decks = new DeckIndex(v, (p) => byName(p) || opened.has(p));
    const release = v.hold();
    const loading = decks.load();
    opened.add('Notes/B.md');
    v.files.set('D.cards.md', '## Q\nA, edited\n');
    const refreshing = Promise.all([decks.refresh('Notes/B.md'), decks.refresh('D.cards.md')]);
    release();
    await Promise.all([loading, refreshing]);
    expect(decks.paths()).toEqual(['D.cards.md', 'Notes/B.md']);
    expect(decks.input('D.cards.md')?.text).toBe('## Q\nA, edited\n');
  });

  it('an older load that finishes last does not replace a newer one', async () => {
    const opened = new Set<string>();
    const v = vault(notes);
    const decks = new DeckIndex(v, (p) => byName(p) || opened.has(p));
    const releaseFirst = v.hold();
    const first = decks.load();
    opened.add('Notes/A.md');
    const releaseSecond = v.hold();
    const second = decks.load();
    releaseSecond();
    await second;
    releaseFirst();
    await first;
    expect(decks.paths()).toEqual(['D.cards.md', 'Notes/A.md']);
  });

  it('a rating whose write completes after the note left the decks does not bring it back', async () => {
    const opened = new Set(['Notes/A.md']);
    const v = vault({ 'Notes/A.md': '## Q\nx\n' });
    const dropped: string[] = [];
    const decks = new DeckIndex(v, (p) => byName(p) || opened.has(p), (p) => dropped.push(p));
    await decks.load();
    v.during = () => opened.delete('Notes/A.md'); // "Remove from decks" while the rating is being written
    const outcome = await decks.setCardState('Notes/A.md', ref, null, A);
    expect(outcome.kind).toBe('saved');
    expect(v.files.get('Notes/A.md')).toBe(`## Q\n${formatStateLine(A)}\nx\n`);
    expect(decks.has('Notes/A.md')).toBe(false);
    // and the views are told, since the cleanup that follows finds no entry left to drop
    expect(dropped).toEqual(['Notes/A.md']);
  });
});
