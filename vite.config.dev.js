/* eslint-disable import/no-extraneous-dependencies */
// eslint-disable-next-line import/no-extraneous-dependencies
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const { root, build } = require('./vite.config.common');

export default defineConfig(() => ({
  root,
  mode: 'development',
  build: {
    ...build,
    outDir: '../dist',
    sourcemap: 'inline',
    emptyOutDir: false,
    rollupOptions: {
      ...build.rollupOptions,
      input: {
        background: 'src/background.ts',
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: '../dist/background.mjs',
          dest: '../vite-work/',
        },
      ],
    }),
  ],
}));
