// The rules Obsidian's community review applies (eslint-plugin-obsidianmd, recommended).
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  { ignores: ['main.js', 'build/**', 'node_modules/**', '*.config.ts'] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        // the agent skill's checker is linted too, as the review sees it: a command-line script for Node, so its
        // Node built-ins are warnings here (it never runs inside Obsidian)
        projectService: { allowDefaultProject: ['eslint.config.mjs', 'skills/*/scripts/*.mjs'] },
      },
    },
  },
]);
