import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The plugin's logic that does not need Obsidian (src/decks.ts, src/data.ts) with an in-memory vault.
const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

/** The core is a folder of this repository; the plugin imports it by its package name, as in the monorepo. */
export const aliases = [
  { find: '@plaindeck/core/format', replacement: here('core/format/index.ts') },
  { find: '@plaindeck/core/app.css', replacement: here('core/view/app.css') },
  { find: '@plaindeck/core', replacement: here('core/index.ts') },
];

export default defineConfig({
  resolve: { alias: aliases },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
