// eslint-disable-next-line import/no-import-module-exports
import { resolve } from 'node:path';

module.exports = {
  root: 'src',
  build: {
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
};
