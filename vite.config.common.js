// eslint-disable-next-line import/no-import-module-exports
import { resolve } from 'node:path';

module.exports = {
  root: 'src',
  build: {
    rollupOptions: {
      input: {
        sw: resolve(__dirname, 'src/sw.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
};
