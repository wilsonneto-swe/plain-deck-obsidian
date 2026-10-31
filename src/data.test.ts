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

  it('OPENED-NOTES: Markdown paths exactly as given (a name may start with a space), each once, sorted', () => {
    expect(parseData({ opened: ['Notes/TCP.md', ' Notes.md', 'b.md', 'Notes/TCP.md', 'picture.png', 7, ''] }).opened).toEqual([' Notes.md', 'Notes/TCP.md', 'b.md']);
    expect(parseData({ opened: 'Notes/TCP.md' }).opened).toEqual([]);
  });

  it('OPENED-NOTES: openedList never drops a path; only a data.json holding more than OPENED_LIMIT is cut on load', () => {
    const many = Array.from({ length: OPENED_LIMIT + 5 }, (_, i) => `n${String(i).padStart(5, '0')}.md`);
    expect(openedList(many)).toHaveLength(OPENED_LIMIT + 5);
    expect(parseData({ opened: many }).opened).toEqual(many.slice(0, OPENED_LIMIT));
  });

  it('normalizeFolder', () => {
    expect(normalizeFolder(' /a//b/ ')).toBe('a/b');
    expect(normalizeFolder('a\\b')).toBe('a/b');
    expect(normalizeFolder('/')).toBe('');
    expect(normalizeFolder('./a')).toBe('a');
  });
});
