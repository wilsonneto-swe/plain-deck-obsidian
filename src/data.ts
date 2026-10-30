/**
 * The plugin's data (`<vault>/.obsidian/plugins/plain-deck/data.json`, synced with the vault's other
 * plugin settings by Obsidian Sync): the study settings (the core's Settings) and the deck folder.
 * `parseData` accepts anything and returns valid data, field by field.
 */
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '@plaindeck/core';

export interface PluginData {
  readonly settings: Settings;
  /** Only notes under this folder are decks ('' = the whole vault): a vault path without slashes at its ends. */
  readonly folder: string;
}

export const DEFAULT_DATA: PluginData = Object.freeze({ settings: DEFAULT_SETTINGS, folder: '' });

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
  return {
    settings: parseSettings(r['settings']),
    folder: typeof folder === 'string' ? normalizeFolder(folder) : '',
  };
}
