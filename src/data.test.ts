import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@plaindeck/core';
import { DEFAULT_DATA, OPENED_LIMIT, normalizeFolder, openedList, parseData } from './data.js';

describe('plugin data', () => {
  it('parseData falls back field by field', () => {
    expect(parseData(null)).toEqual(DEFAULT_DATA);
    expect(parseData({ folder: '/Courses/Net/', settings: { retention: 0.85, newPerSession: 'x' } })).toEqual({
      folder: 'Courses/Net',
      settings: { ...DEFAULT_SETTINGS, retention: 0.85 },
      opened: [],
    });
    expect(parseData({ folder: 7 }).folder).toBe('');
  });

  it('OPENED-NOTES: Markdown paths, normalised, each once, sorted, bounded', () => {
    expect(parseData({ opened: ['Notes/TCP.md', '/Notes//TCP.md', 'b.md', 'picture.png', 7, ''] }).opened).toEqual(['Notes/TCP.md', 'b.md']);
    expect(parseData({ opened: 'Notes/TCP.md' }).opened).toEqual([]);
    expect(openedList(Array.from({ length: OPENED_LIMIT + 5 }, (_, i) => `n${i}.md`))).toHaveLength(OPENED_LIMIT);
  });

  it('normalizeFolder', () => {
    expect(normalizeFolder(' /a//b/ ')).toBe('a/b');
    expect(normalizeFolder('a\\b')).toBe('a/b');
    expect(normalizeFolder('/')).toBe('');
    expect(normalizeFolder('./a')).toBe('a');
  });
});
