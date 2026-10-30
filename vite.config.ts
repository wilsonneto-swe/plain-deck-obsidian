import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// The plugin as Obsidian loads it: main.js (CommonJS, `module.exports` = the plugin class) and styles.css (the
// core's app.css + src/styles.css), built into build/ and copied next to manifest.json at the root of this
// repository, the layout of a plugin folder. Everything is bundled; 'obsidian' (and the editor's packages, never
// imported) come from the app at runtime. Not minified, so the code Obsidian runs can be read; `npm run dev`
// adds an inline source map.
const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

/** The core is a folder of this repository; the plugin imports it by its package name, as in the monorepo. */
export const aliases = [
  { find: '@plaindeck/core/format', replacement: here('core/format/index.ts') },
  { find: '@plaindeck/core/app.css', replacement: here('core/view/app.css') },
  { find: '@plaindeck/core', replacement: here('core/index.ts') },
];

const toRoot: Plugin = {
  name: 'plugin-files-at-root',
  writeBundle() {
    for (const name of ['main.js', 'styles.css']) copyFileSync(here(`build/${name}`), here(name));
  },
};

export default defineConfig(({ mode }) => ({
  resolve: { alias: aliases },
  plugins: [toRoot],
  publicDir: false,
  build: {
    outDir: 'build',
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    sourcemap: mode === 'development' ? 'inline' : false,
    lib: {
      entry: here('src/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.js',
      cssFileName: 'styles',
    },
    rolldownOptions: {
      external: ['obsidian', 'electron', /^@codemirror\//, /^@lezer\//],
      output: { exports: 'default' },
    },
  },
}));
