// eslint-disable-next-line import/no-extraneous-dependencies
import { defineConfig } from 'vite';

const { root, build } = require('./vite.config.common');

export default defineConfig(() => ({
  root,
  build: {
    ...build,
    mode: 'development',
    outDir: '../vite-work',
    sourcemap: 'inline',
    emptyOutDir: false,
    rollupOptions: {
      ...build.rollupOptions,
      input: {
        background: 'src/background.ts',
      },
    },
  },
}));
