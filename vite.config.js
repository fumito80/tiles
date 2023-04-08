// eslint-disable-next-line import/no-extraneous-dependencies
import { defineConfig } from 'vite';

const { root, build } = require('./vite.config.common');

export default defineConfig(() => ({
  root,
  publicDir: 'assets',
  build: {
    ...build,
    mode: 'production',
    outDir: '../publish',
    emptyOutDir: true,
    rollupOptions: {
      ...build.rollupOptions,
      input: {
        // popup: 'src/popup.ts',
        // settings: 'src/settings.ts',
        // 'worker-history': './src/worker-history.ts',
        background: 'src/background.ts',
      },
    },
  },
}));
