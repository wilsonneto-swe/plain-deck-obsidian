/**
 * The plugin's data (`<vault>/.obsidian/plugins/plain-deck/data.json`, synced with the vault's other
 * plugin settings by Obsidian Sync): the study settings (the core's Settings), the deck folder, and the notes
 * opened with the plugin (OPENED-NOTES).
 * `parseData` accepts anything and returns valid data, field by field.
 */
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '@plaindeck/core';

export interface PluginData {
  readonly settings: Settings;
  /** Only notes under this folder are decks ('' = the whole vault): a vault path without slashes at its ends. */
  readonly folder: string;
  /** Notes opened with the plugin ("Study as flashcards"): decks whatever their names, sorted vault paths. */
  readonly opened: readonly string[];
}

export const DEFAULT_DATA: PluginData = Object.freeze({ settings: DEFAULT_SETTINGS, folder: '', opened: Object.freeze([]) });

/** At most this many opened notes are kept (data.json stays small). */
export const OPENED_LIMIT = 5000;

/** "/Courses//Networking/" -> "Courses/Networking"; "/" and "." -> "" (the whole vault). */
export function normalizeFolder(folder: string): string {
  return folder
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.')
    .join('/');
}

export function parseData(raw: unknown): PluginData {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_DATA;
  const r = raw as Record<string, unknown>;
  const folder = r['folder'];
  const opened = r['opened'];
  return {
    settings: parseSettings(r['settings']),
    folder: typeof folder === 'string' ? normalizeFolder(folder) : '',
    opened: Array.isArray(opened) ? openedList(opened.filter((p): p is string => typeof p === 'string')) : [],
  };
}

/** The opened notes as kept: Markdown vault paths, normalised, each once, sorted, at most OPENED_LIMIT. */
export function openedList(paths: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    const path = normalizeFolder(p);
    if (path.toLowerCase().endsWith('.md')) out.add(path);
  }
  return [...out].sort().slice(0, OPENED_LIMIT);
}
