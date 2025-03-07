// eslint-disable-next-line import/no-extraneous-dependencies
import { defineConfig } from 'vite';

const { root, build } = require('./vite.config.common');

export default defineConfig(() => ({
  root,
  build: {
    ...build,
    mode: 'development',
    outDir: '../dist',
    sourcemap: 'inline',
  },
}));
