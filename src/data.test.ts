import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@plaindeck/core';
import { DEFAULT_DATA, normalizeFolder, parseData } from './data.js';

describe('plugin data', () => {
  it('parseData falls back field by field', () => {
    expect(parseData(null)).toEqual(DEFAULT_DATA);
    expect(parseData({ folder: '/Courses/Net/', settings: { retention: 0.85, newPerSession: 'x' } })).toEqual({
      folder: 'Courses/Net',
      settings: { ...DEFAULT_SETTINGS, retention: 0.85 },
    });
    expect(parseData({ folder: 7 }).folder).toBe('');
  });

  it('normalizeFolder', () => {
    expect(normalizeFolder(' /a//b/ ')).toBe('a/b');
    expect(normalizeFolder('a\\b')).toBe('a/b');
    expect(normalizeFolder('/')).toBe('');
    expect(normalizeFolder('./a')).toBe('a');
  });
});
